// End-to-end laser, related-slide return, preference, motion and export checks.
// Run: node tests/presenter-e2e.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const artifacts = path.join(os.tmpdir(), "pyslides-public-presenter-e2e");
fs.mkdirSync(artifacts, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [], errors: [] };
const serverUrl = await new Promise((resolve, reject) => {
  const env = { ...process.env };
  delete env.PYSLIDES_PROFILE;
  const server = spawn("python3", ["-m", "pyslides", "serve", "presenter-demo", "--port", "0", "--no-browser"], { cwd: repo, env });
  let log = "";
  const timer = setTimeout(() => reject(new Error("server URL timeout\n" + log)), 60000);
  server.stdout.on("data", data => {
    log += data;
    const match = log.match(/PySlides ready: (\S+)/);
    if (match) { clearTimeout(timer); resolve(match[1]); }
  });
  server.stderr.on("data", data => { log += data; });
  server.on("exit", code => { if (!server.killed) reject(new Error(`server exited ${code}\n${log}`)); });
  report.stopServer = () => { server.removeAllListeners("exit"); server.kill("SIGINT"); };
});
const browser = await chromium.launch({ executablePath: process.env.PYSLIDES_BROWSER_EXECUTABLE || undefined,
  headless: true, args: process.platform === "win32" ? ["--enable-unsafe-swiftshader"] : ["--no-sandbox", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", error => report.errors.push("pageerror: " + error.message));
page.on("console", message => { if (message.type() === "error") report.errors.push("console: " + message.text()); });
page.on("requestfailed", request => report.errors.push("requestfailed: " + request.url()));
page.on("response", response => { if (response.status() >= 400) report.errors.push(`http ${response.status()}: ${response.url()}`); });
const snap = () => page.evaluate(() => window.PySlides.getSnapshot());
const laser = () => page.locator(".pyslides-laser");
const checkbox = () => page.getByRole("checkbox", { name: "Laser animation" });
const assertHidden = async message => assert.equal(await laser().isVisible(), false, message);
async function controls() { await page.locator(".stage-controls").hover(); }
async function step(key) { await page.keyboard.press(key); }
async function cueAppears() { await page.waitForFunction(() => {
  const dot = document.querySelector(".pyslides-laser"); return dot && !dot.hidden;
}, null, { timeout: 3000 }); }
async function check(id, fn) {
  try { report.checks.push({ id, passed: true, evidence: await fn() }); }
  catch (error) { report.checks.push({ id, passed: false, error: String(error.stack || error) }); }
}

try {
  await page.goto(serverUrl + "#result", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.PySlides);
  await controls();

  await check("default-on-motion-and-reverse", async () => {
    assert.equal(await checkbox().isChecked(), true);
    await page.locator("#presentation").focus();
    await step("PageDown"); await cueAppears();
    const before = await laser().evaluate(el => getComputedStyle(el).transform);
    await page.waitForTimeout(180);
    const moving = await laser().evaluate(el => getComputedStyle(el).transform);
    assert.notEqual(moving, before, "laser moves around the target");
    await page.keyboard.press("PageUp");
    await assertHidden("PageUp cancels the cue");
    assert.equal((await snap()).step, 0);
    await page.keyboard.press("PageDown"); await cueAppears();
    await page.evaluate(() => window.PySlides.goTo("summary"));
    await assertHidden("slide jump cancels the cue");
    return { defaultOn: true, motion: true, reverseCancel: true, slideJumpCancel: true };
  });

  await check("pending-and-active-cancel-and-stored-off", async () => {
    await page.evaluate(() => window.PySlides.goTo("result"));
    await page.locator("#presentation").focus();
    await controls(); await checkbox().uncheck();
    assert.equal(await checkbox().isChecked(), false);
    await step("PageDown");
    await controls(); await checkbox().check();
    await assertHidden("enabling does not replay the pending Build");
    await page.keyboard.press("PageUp");
    await controls(); await checkbox().uncheck();
    await page.reload({ waitUntil: "networkidle" });
    await controls();
    assert.equal(await checkbox().isChecked(), false, "off preference survives reload");
    await page.locator("#presentation").focus();
    await page.keyboard.press("PageDown"); await page.waitForTimeout(380);
    await assertHidden("stored off suppresses a cue");
    await controls(); await checkbox().check();
    await assertHidden("turning on is future-only");
    await page.locator("#presentation").focus();
    await page.keyboard.press("PageUp"); await page.keyboard.press("PageDown"); await cueAppears();
    await controls(); await checkbox().uncheck();
    await assertHidden("turning off cancels the active cue");
    return { pendingCancel: true, activeCancel: true, storedOff: true, futureOnlyEnable: true };
  });

  await check("backup-return-restores-exact-build-and-checkbox-and-allows-undo", async () => {
    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => { localStorage.removeItem("pyslides.laser.enabled"); window.PySlides.goTo("result"); });
    await controls(); await checkbox().check();
    await page.locator("#presentation").focus();
    await page.keyboard.press("PageDown"); await cueAppears();
    await page.locator("#presentation").focus();
    await page.keyboard.press("PageDown"); await page.waitForTimeout(80);
    assert.deepEqual(await snap().then(s => [s.slideId, s.step]), ["result", 2]);
    await controls(); await page.locator('[data-related-target="method"]').click();
    assert.equal((await snap()).slideId, "method");
    await controls(); await page.locator("[data-related-return]").click();
    assert.deepEqual(await snap().then(s => [s.slideId, s.step]), ["result", 2]);
    assert.equal(await page.locator("#result-points").isChecked(), true);
    assert.equal(await checkbox().isChecked(), true);
    await page.waitForTimeout(380);
    await assertHidden("return restores state without replaying laser");
    await page.keyboard.press("PageUp");
    assert.equal((await snap()).step, 1, "restored history still supports undo");
    assert.equal(await page.locator("#result-points").isChecked(), true);
    await page.keyboard.press("PageUp");
    assert.equal((await snap()).step, 0);
    assert.equal(await page.locator("#result-points").isChecked(), false);
    return { returnedToBuild: 2, checkboxRestored: true, undoAfterReturn: true };
  });

  await check("nested-related-slide-preserves-original-caller", async () => {
    await page.evaluate(() => { window.PySlides.goTo("result"); window.PySlides.next({ instant: true }); window.PySlides.next({ instant: true }); });
    await controls(); await page.locator('[data-related-target="method"]').click();
    assert.equal((await snap()).slideId, "method");
    await controls(); await page.locator('[data-related-target="summary"]').click();
    assert.equal((await snap()).slideId, "summary");
    await controls(); await page.locator("[data-related-return]").click();
    assert.deepEqual(await snap().then(s => [s.slideId, s.step]), ["result", 2]);
    return { nested: ["result", "method", "summary"], return: ["result", 2] };
  });

  await check("ordinary-next-backup-retains-return-target-and-undo-history", async () => {
    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => { window.PySlides.goTo("result"); window.PySlides.next({ instant: true }); window.PySlides.next({ instant: true }); });
    await controls(); await page.locator('[data-related-target="method"]').click();
    assert.equal((await snap()).slideId, "method");
    await page.locator("#presentation").focus();
    await page.keyboard.press("PageDown");
    await page.waitForFunction(() => window.PySlides.getSnapshot().slideId === "method-extra");
    assert.equal(await page.locator("[data-related-return]").count(), 1, "next backup retains the related return target");
    await controls(); await page.locator("[data-related-return]").click();
    assert.deepEqual(await snap().then(s => [s.slideId, s.step]), ["result", 2]);
    assert.equal(await page.locator("#result-points").isChecked(), true);
    await page.keyboard.press("PageUp");
    assert.deepEqual(await snap().then(s => [s.slideId, s.step]), ["result", 1]);
    assert.equal(await page.locator("#result-points").isChecked(), true, "undo after return preserves the prior Build");
    return { pageDown: "method→method-extra", return: ["result", 2], undo: ["result", 1] };
  });

  await check("manual-slide-state-survives-related-return-and-undo", async () => {
    await page.reload({ waitUntil: "networkidle" });
    await controls(); await checkbox().check();
    await page.locator("#presentation").focus();
    await page.keyboard.press("PageDown"); await page.keyboard.press("PageDown");
    assert.deepEqual(await snap().then(s => [s.slideId, s.step]), ["result", 2]);
    await page.locator("#result-fit").evaluate(el => {
      el.checked = false;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await controls(); await page.locator('[data-related-target="method"]').click();
    await controls(); await page.locator("[data-related-return]").click();
    assert.deepEqual(await snap().then(s => [s.slideId, s.step]), ["result", 2]);
    assert.equal(await page.locator("#result-points").isChecked(), true);
    assert.equal(await page.locator("#result-fit").isChecked(), false, "manual checkbox state is restored");
    await page.locator("#presentation").focus();
    await page.keyboard.press("PageUp");
    assert.equal((await snap()).step, 1);
    assert.equal(await page.locator("#result-fit").isChecked(), false, "undo history keeps the manual state");
    return { returnedToBuild: 2, manualFit: false, undoStep: 1 };
  });

  await check("backward-entry-does-not-replay-laser-cue", async () => {
    await page.goto(serverUrl + "#summary", { waitUntil: "networkidle" });
    await controls(); await checkbox().check();
    await page.locator("#presentation").focus();
    await page.keyboard.press("PageUp");
    assert.deepEqual(await snap().then(s => [s.slideId, s.step]), ["result", 2]);
    assert.equal(await page.locator("#result-points").isChecked(), true);
    assert.equal(await page.locator("#result-fit").isChecked(), true);
    await page.waitForTimeout(400);
    await assertHidden("backward entry reveals prior Builds without replaying a cue");
    return { enteredBackward: "summary→result", restoredBuild: 2, cueReplayed: false };
  });

  await check("laser-stays-aligned-with-target-after-viewport-resize", async () => {
    await page.reload({ waitUntil: "networkidle" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await controls(); await checkbox().check();
    await page.locator("#presentation").focus();
    await page.keyboard.press("PageDown"); await cueAppears();
    const alignment = () => page.evaluate(() => {
      const target = document.querySelector("#demo-points").getBoundingClientRect();
      const dot = document.querySelector(".pyslides-laser").getBoundingClientRect();
      return { x: (dot.left + dot.width / 2 - target.left) / target.width,
        y: (dot.top + dot.height / 2 - target.top) / target.height };
    });
    const before = await alignment();
    assert.ok(Math.abs(before.x - 0.68) < 0.03, `x aligned before resize: ${JSON.stringify(before)}`);
    assert.ok(Math.abs(before.y - 0.32) < 0.03, `y aligned before resize: ${JSON.stringify(before)}`);
    await page.setViewportSize({ width: 1200, height: 700 });
    await page.waitForTimeout(120);
    const after = await alignment();
    assert.ok(Math.abs(after.x - 0.68) < 0.03, `x aligned after resize: ${JSON.stringify(after)}`);
    assert.ok(Math.abs(after.y - 0.32) < 0.03, `y aligned after resize: ${JSON.stringify(after)}`);
    assert.ok(Math.abs(after.x - before.x) < 0.02 && Math.abs(after.y - before.y) < 0.02,
      `normalized target position stays stable: ${JSON.stringify({ before, after })}`);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1600, height: 900 });
    return { before, after, target: [0.68, 0.32] };
  });

  await check("direct-backup-has-no-fabricated-return", async () => {
    await page.goto(serverUrl + "#method", { waitUntil: "networkidle" });
    await controls();
    assert.equal((await snap()).slideId, "method");
    assert.equal(await page.locator("[data-related-return]").count(), 0);
    assert.equal(await page.locator('[data-related-target="summary"]').count(), 1);
    return { directEntry: "method", returnButton: false };
  });

  await check("reduced-motion-and-export-omit-presenter-controls", async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(serverUrl + "#result", { waitUntil: "networkidle" });
    await controls(); await checkbox().check(); await page.locator("#presentation").focus();
    await page.keyboard.press("PageDown"); await cueAppears();
    const before = await laser().evaluate(el => getComputedStyle(el).transform);
    await page.waitForTimeout(100);
    const after = await laser().evaluate(el => getComputedStyle(el).transform);
    assert.equal(after, before, "reduced-motion laser remains stationary");
    await page.waitForTimeout(650); await assertHidden("reduced-motion cue ends promptly");
    await page.goto(serverUrl + "?export=1#result", { waitUntil: "networkidle" });
    assert.equal(await laser().count(), 0);
    assert.equal(await page.locator(".presenter-laser-option").count(), 0);
    assert.equal(await page.locator(".presenter-related").count(), 0);
    assert.equal(await page.locator(".stage-controls").isVisible(), false);
    return { stationary: true, exportControls: 0, exportDot: 0 };
  });

  assert.deepEqual(report.errors, []);
  const failed = report.checks.filter(result => !result.passed);
  report.status = failed.length ? "failed" : "passed";
  report.finishedAt = new Date().toISOString();
  await page.goto(serverUrl + "#result", { waitUntil: "networkidle" });
  await controls();
  await page.screenshot({ path: path.join(artifacts, "presenter-controls.png") });
  fs.writeFileSync(path.join(artifacts, "results.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report, artifacts }, null, 2));
  if (report.status !== "passed") process.exitCode = 1;
} catch (error) {
  report.errors.push(String(error.stack || error));
  report.status = "failed";
  fs.writeFileSync(path.join(artifacts, "results.json"), JSON.stringify(report, null, 2) + "\n");
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close(); report.stopServer();
}
