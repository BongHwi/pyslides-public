// Engine E2E on a brand-new deck: scaffold with the CLI, present it, drive the scripted steps with the
// keyboard, prove the build rejects a bad step target, then run check and pdf.
// Artifacts: artifacts/scaffold-results.json, artifacts/scaffold/ (check sheet) and artifacts/scaffold.pdf.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

delete process.env.PYSLIDES_PROFILE;   // a profile exported in the developer shell must not leak into these runs
const repo = fileURLToPath(new URL("../", import.meta.url));
const artifacts = path.join(repo, "artifacts");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "pyslides-scaffold-"));
const deck = path.join(work, "talk");
const report = { startedAt: new Date().toISOString(), deck, checks: [], errors: [] };
const check = async (id, fn) => {
  try { report.checks.push({ id, status: "passed", evidence: await fn() }); }
  catch (error) { report.checks.push({ id, status: "failed", error: String(error.stack || error) }); }
};
const cli = (...args) => spawnSync("python3", ["-m", "pyslides", ...args], { cwd: repo, encoding: "utf8" });

fs.mkdirSync(artifacts, { recursive: true });
let server, browser;
try {
  await check("new-creates-a-deck-that-builds", async () => {
    const made = cli("new", deck, "--title", "Scaffold test");
    assert.equal(made.status, 0, made.stderr);
    assert.equal(cli("new", deck).status, 1, "new must refuse a non-empty folder");
    const built = cli("build", deck);
    assert.equal(built.status, 0, built.stderr);
    const html = fs.readFileSync(path.join(deck, "build", "index.html"), "utf8");
    assert.match(html, /<title>Scaffold test<\/title>/);
    assert.match(html, /data-plugins="\[&quot;\/deck\.js&quot;\]"/);
    return { files: fs.readdirSync(path.join(deck, "build")).length };
  });

  await check("bad-step-target-fails-the-build", async () => {
    const source = path.join(deck, "deck.py"), good = fs.readFileSync(source, "utf8");
    try {
      fs.writeFileSync(source, good.replace('step(move("freq", 3))', 'step(move("frequency", 3))'));
      const bad = cli("build", deck);
      assert.notEqual(bad.status, 0);
      assert.match(bad.stderr, /move\(\) needs a range input id on live: frequency/);
      fs.writeFileSync(source, good.replace('component("wave-plot"', 'component("wave-plott"'));
      assert.match(cli("build", deck).stderr, /Unknown component on live: wave-plott/);
      return "move() typo and unknown component are build errors";
    } finally {
      fs.writeFileSync(source, good);
    }
  });

  server = spawn("python3", ["-m", "pyslides", "serve", deck, "--port", "0", "--no-browser"], { cwd: repo });
  const url = await new Promise((resolve, reject) => {
    let log = "";
    server.stdout.on("data", d => { log += d; const m = log.match(/PySlides ready: (\S+)/); if (m) resolve(m[1]); });
    server.on("exit", code => reject(new Error("server exited " + code + log)));
  });
  browser = await chromium.launch({ executablePath: process.env.PYSLIDES_BROWSER_EXECUTABLE || undefined, headless: true,
    args: process.platform === "win32" ? [] : ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", e => report.errors.push(String(e.stack || e)));
  const state = () => page.evaluate(() => ({ ...window.PySlides.getSnapshot(), freq: document.getElementById("freq").value,
    amp: document.getElementById("amp").value, shape: document.querySelector('#shape [aria-pressed="true"]').dataset.v,
    out: document.getElementById("freqOut").textContent }));

  await check("presenter-clicks-drive-the-plugin-controls", async () => {
    await page.goto(url + "#motivation", { waitUntil: "networkidle" });
    await page.locator("#presentation").focus();
    const trail = [];
    for (let i = 0; i < 4; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(1900); trail.push(await state()); }
    assert.deepEqual(trail.map(t => [t.slideId, t.step]), [["figure", 0], ["live", 0], ["live", 1], ["live", 2]]);
    assert.deepEqual([trail[2].freq, trail[2].out, trail[2].shape], ["3", "3", "sine"]);
    assert.deepEqual([trail[3].amp, trail[3].shape], ["0.5", "square"]);
    await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(200);
    const back = await state();
    assert.deepEqual([back.step, back.freq, back.amp, back.shape], [1, "3", "1", "sine"]);
    return trail.map(t => `${t.slideId}:${t.step} freq=${t.freq} amp=${t.amp} ${t.shape}`);
  });

  await check("check-command-reports-no-overflow", async () => {
    const out = path.join(artifacts, "scaffold");
    const run = cli("check", deck, "-o", out);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const result = JSON.parse(fs.readFileSync(path.join(out, "check.json"), "utf8"));
    assert.equal(result.states, 7);
    return { states: result.states, sheet: "artifacts/scaffold/index.html" };
  });

  await check("check-command-catches-overflow", async () => {
    const source = path.join(deck, "deck.py"), good = fs.readFileSync(source, "utf8"), out = path.join(work, "overflow");
    try {
      const many = Array.from({ length: 30 }, (_, i) => `"Point ${i + 1}."`).join(", ");
      fs.writeFileSync(source, good.replace('bullets("Take-home message one.", "Take-home message two."', `bullets(${many}`));
      const run = cli("check", deck, "-o", out);
      assert.equal(run.status, 1, "check must fail on an overflowing slide");
      const result = JSON.parse(fs.readFileSync(path.join(out, "check.json"), "utf8"));
      assert.deepEqual(result.problems.map(p => p.slide), ["summary"]);
      return result.problems[0].problems;
    } finally {
      fs.writeFileSync(source, good);
    }
  });

  await check("pdf-has-one-page-per-slide-and-step", async () => {
    const pdf = path.join(artifacts, "scaffold.pdf");
    const run = cli("pdf", deck, "-o", pdf, "--scale", "1");
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const pages = (fs.readFileSync(pdf, "latin1").match(/\/Type\s*\/Page\b/g) || []).length;
    assert.equal(pages, 7);
    return { pdf: "artifacts/scaffold.pdf", pages };
  });
} finally {
  await browser?.close();
  server?.kill("SIGINT");
  fs.rmSync(work, { recursive: true, force: true });
  report.status = report.errors.length || report.checks.some(c => c.status !== "passed") ? "failed" : "passed";
  fs.writeFileSync(path.join(artifacts, "scaffold-results.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") process.exitCode = 1;
