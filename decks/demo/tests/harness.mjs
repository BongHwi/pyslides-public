// Shared by the three demo suites: starts `pyslides serve demo` on a free port (unless PYSLIDES_URL is given) and
// launches Chromium. PYSLIDES_PROFILE is removed everywhere so a profile exported in the shell cannot change the deck.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

delete process.env.PYSLIDES_PROFILE;
export const repo = fileURLToPath(new URL("../../../", import.meta.url));
export const artifacts = path.join(repo, "artifacts");
fs.mkdirSync(artifacts, { recursive: true });

export async function startDemo() {
  if (process.env.PYSLIDES_URL) return { url: process.env.PYSLIDES_URL, stop() {} };
  const env = { ...process.env };
  delete env.PYSLIDES_PROFILE;
  const server = spawn("python3", ["-m", "pyslides", "serve", "demo", "--port", "0", "--no-browser"], { cwd: repo, env });
  const url = await new Promise((resolve, reject) => {
    let log = "";
    const timer = setTimeout(() => reject(new Error("server did not report a URL in 60 s\n" + log)), 60000);
    server.stdout.on("data", d => { log += d; const m = log.match(/PySlides ready: (\S+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
    server.stderr.on("data", d => { log += d; });
    server.on("exit", code => reject(new Error("server exited " + code + "\n" + log)));
  });
  return { url, stop() { server.removeAllListeners("exit"); server.kill(); } };
}

export const launch = () => chromium.launch({
  executablePath: process.env.PYSLIDES_BROWSER_EXECUTABLE || undefined, headless: true,
  args: process.platform === "win32" ? ["--enable-unsafe-swiftshader"] : ["--no-sandbox", "--enable-unsafe-swiftshader"],
});

/** A report with a `check(id, fn)` runner; pageErrors(page) collects uncaught errors and console errors. */
export function makeReport(name) {
  const report = { suite: name, startedAt: new Date().toISOString(), checks: [], errors: [] };
  report.check = async (id, fn) => {
    try { report.checks.push({ id, status: "passed", evidence: await fn() }); }
    catch (error) { report.checks.push({ id, status: "failed", error: String(error.stack || error) }); }
  };
  report.watch = page => {
    page.on("pageerror", e => report.errors.push("pageerror: " + String(e.stack || e)));
    page.on("console", m => { if (m.type() === "error") report.errors.push("console.error: " + m.text()); });
    page.on("requestfailed", r => report.errors.push("requestfailed: " + r.url()));
    page.on("response", r => { if (r.status() >= 400) report.errors.push(`http ${r.status()}: ${r.url()}`); });
  };
  report.finish = () => {
    report.status = report.errors.length || report.checks.some(c => c.status !== "passed") ? "failed" : "passed";
    fs.writeFileSync(path.join(artifacts, `demo-${name}-results.json`), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ ...report, check: undefined, watch: undefined, finish: undefined }, null, 2));
    if (report.status !== "passed") process.exitCode = 1;
  };
  return report;
}

export const settled = (page, timeout = 30000) => page.waitForFunction(() => window.PySlides.isSettled(), null, { timeout });
export const ready = async (page, url, hash = "") => {
  await page.goto(url + hash, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.PySlides && window.PySlidesDemo);
  await settled(page);
};
export const snap = page => page.evaluate(() => window.PySlides.getSnapshot());
export const focusDeck = page => page.locator("#presentation").focus();

// Playwright has no F16/F17, so those go through CDP with their Windows virtual key codes, as Chrome gets them from macOS.
const functionKeys = { F16: 127, F17: 128 }, sessions = new WeakMap();
export async function tick(page, name) {
  if (!(name in functionKeys)) return page.keyboard.press(name);
  if (!sessions.has(page)) sessions.set(page, await page.context().newCDPSession(page));
  const event = { key: name, code: name, windowsVirtualKeyCode: functionKeys[name] };
  await sessions.get(page).send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...event });
  await sessions.get(page).send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
}
