// E2E for clicker keys: PageDown/PageUp step wherever focus is (a clicked slider, a button, <body> after load),
// finish a running step instead of cancelling it, and leave every other key with a focused control.
// Dial keys: F17/F16 step a slide's dial target (a range input or a <video>), clamp, and are undone by PageUp.
// --live opens a visible browser on the same deck and records every key and step until the window closes,
// for a rehearsal with a real clicker or Kinesis on a neural band. Nothing is asserted in that mode.
// Artifacts: artifacts/clicker-results.json, artifacts/clicker-live.json
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
const live = process.argv.includes("--live");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "pyslides-clicker-"));
const report = { startedAt: new Date().toISOString(), mode: live ? "live" : "auto", checks: [], errors: [] };
const check = async (id, fn) => {
  try { report.checks.push({ id, status: "passed", evidence: await fn() }); }
  catch (error) { report.checks.push({ id, status: "failed", error: String(error.stack || error) }); }
};

// A slider and a button with two steps, a plain slide, an end slide, then the two dial targets:
// a range input with a step of 2, and an all-intra 4 s video next to a slider that only carries steps.
const folder = path.join(work, "clicker");
fs.mkdirSync(path.join(folder, "assets"), { recursive: true });
fs.copyFileSync(path.join(repo, "tests", "fixtures", "dial.webm"), path.join(folder, "assets", "dial.webm"));
fs.writeFileSync(path.join(folder, "deck.py"), `from pyslides import *
COMPONENTS = {
    "ctl": Component('<input id="x" type="range" min="0" max="100" step="1" value="0"><button id="add">add</button><b id="count">0</b>', frame="block"),
    "dialctl": Component('<input id="d" type="range" min="0" max="10" step="2" value="4"><b id="dOut">4</b><button id="dbtn">b</button>', frame="block"),
    "clip": Component('<video id="v" src="dial.webm" muted playsinline preload="auto" data-dial-step="0.5"></video><input id="m" type="range" min="0" max="2" step="1" value="0">', frame="figure"),
}
SLIDES = (
    Slide("first", "S", "Controls", "EB", (component("ctl", "c"),), steps=(step(move("x", 50, 0.8)), step(press("add")))),
    Slide("middle", "S", "Middle", "EB", (text("middle"),)),
    Slide("last", "S", "Last", "EB", (text("end"),)),
    Slide("range", "S", "Dial on a slider", "EB", (component("dialctl", "c"),), steps=(step(move("d", 10, 1.0)),), dial="d"),
    Slide("movie", "S", "Dial on a video", "EB", (component("clip", "c"),), steps=(step(move("m", 1, 0)), step(move("m", 2, 0))), dial="v"),
)
DECK = Deck(slides=SLIDES, title="clicker", components=COMPONENTS, scripts=("deck.js",))
`);
fs.writeFileSync(path.join(folder, "assets", "deck.js"), `let count = 0;
export function init() {
  document.getElementById("add").addEventListener("click", () => { count += 1; document.getElementById("count").textContent = count; });
  document.getElementById("d").addEventListener("input", e => { document.getElementById("dOut").textContent = e.target.value; });
}
export function saveState() { return count; }
export function restoreState(slide, saved) { count = saved; document.getElementById("count").textContent = count; }
`);

fs.mkdirSync(artifacts, { recursive: true });
let browser, server;
function serve() {
  server = spawn("python3", ["-m", "pyslides", "serve", folder, "--port", "0", "--no-browser"], { cwd: repo });
  return new Promise((resolve, reject) => {
    let log = "";
    server.stdout.on("data", d => { log += d; const m = log.match(/PySlides ready: (\S+)/); if (m) resolve(m[1]); });
    server.stderr.on("data", d => { log += d; });
    server.on("exit", code => reject(new Error("server exited " + code + log)));
  });
}
const stateIn = page => page.evaluate(() => {
  const s = window.PySlides.getSnapshot(), $ = id => document.getElementById(id);
  return `${s.slideId}:${s.step} x=${$("x").value} count=${$("count").textContent} focus=${document.activeElement.id || document.activeElement.tagName.toLowerCase()}`;
});

try {
  browser = await chromium.launch({ executablePath: process.env.PYSLIDES_BROWSER_EXECUTABLE || undefined, headless: !live,
    args: process.platform === "win32" ? [] : ["--no-sandbox"] });
  const url = await serve();

  if (live) {
    const page = await browser.newPage({ viewport: null });
    page.on("pageerror", e => report.errors.push(String(e)));
    report.events = [];
    // The dial targets too, so a turn shows whether the slider or the video moved.
    const liveState = async () => `${await stateIn(page)} ` + await page.evaluate(() => `d=${document.getElementById("d").value} v=${document.getElementById("v").currentTime.toFixed(2)}`);
    await page.exposeFunction("recordKey", async key => { report.events.push({ ...key, after: await liveState() }); console.log(key.key, "→", report.events.at(-1).after); });
    await page.addInitScript(() => document.addEventListener("keydown", e => {
      const key = { at: new Date().toISOString(), key: e.key, code: e.code, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey,
        target: e.target.id || e.target.tagName.toLowerCase() };
      // After the slide runtime has handled the key.
      setTimeout(() => window.recordKey(key), 150);
    }, true));
    await page.goto(url, { waitUntil: "networkidle" });
    console.log(`Live clicker check on ${url}. Bring this window to the front, use the band, then close the window.`);
    await page.waitForEvent("close", { timeout: 0 });
  } else {
    const open = async () => {
      const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
      page.on("pageerror", e => report.errors.push(String(e)));
      await page.goto(url, { waitUntil: "networkidle" });
      return page;
    };

    await check("page-keys-step-from-body-after-load-and-from-a-clicked-slider", async () => {
      const page = await open();
      const trail = [await stateIn(page)];
      const press = async (key, wait = 1000) => { await page.keyboard.press(key); await page.waitForTimeout(wait); trail.push(`${key} ${await stateIn(page)}`); };
      await press("PageDown");                       // nothing focused yet: the key targets <body>
      await press("PageUp");
      await page.click("#x", { position: { x: 2, y: 5 } });  // a real click focuses the slider at its low end
      trail.push(`click ${await stateIn(page)}`);
      await press("PageDown");                       // step 1, not a native page jump of the slider
      await press("PageDown");
      await press("PageDown");                       // leave the slide
      await press("PageDown");
      await press("PageUp");
      await press("PageUp");
      assert.deepEqual(trail, [
        "first:0 x=0 count=0 focus=body",
        "PageDown first:1 x=50 count=0 focus=presentation",
        "PageUp first:0 x=0 count=0 focus=presentation",
        "click first:0 x=0 count=0 focus=x",
        "PageDown first:1 x=50 count=0 focus=presentation",
        "PageDown first:2 x=50 count=1 focus=presentation",
        "PageDown middle:0 x=50 count=1 focus=presentation",
        "PageDown last:0 x=50 count=1 focus=presentation",
        "PageUp middle:0 x=50 count=1 focus=presentation",
        "PageUp first:2 x=50 count=1 focus=presentation",
      ]);
      await page.close();
      return trail;
    });

    await check("page-down-from-a-focused-control-finishes-a-running-step", async () => {
      const page = await open();
      await page.locator("#presentation").focus();
      await page.keyboard.press("PageDown");         // step 1 animates x over 0.8 s
      await page.waitForTimeout(150);
      await page.locator("#x").focus();              // focus moves without a pointer, so the animation keeps running
      const during = await stateIn(page);
      await page.keyboard.press("PageDown");
      await page.waitForTimeout(300);
      const after = await stateIn(page);
      await page.keyboard.press("PageUp");
      await page.waitForTimeout(300);
      const undone = await stateIn(page);
      assert.match(during, /^first:1 x=(\d|[1-4]\d) count=0 focus=x$/, "still animating when the key arrives");
      assert.equal(after, "first:2 x=50 count=1 focus=presentation");
      assert.equal(undone, "first:1 x=50 count=0 focus=presentation", "the snapshot holds the finished value");
      await page.close();
      return { during, after, undone };
    });

    await check("page-keys-from-a-button-step-once-and-do-not-press-it", async () => {
      const page = await open();
      await page.locator("#add").focus();
      await page.keyboard.press("PageDown");
      await page.waitForTimeout(1000);
      const state = await stateIn(page);
      assert.equal(state, "first:1 x=50 count=0 focus=presentation");
      await page.close();
      return state;
    });

    await check("other-keys-and-modified-page-keys-stay-with-the-control-or-are-ignored", async () => {
      const page = await open();
      const seen = {};
      await page.locator("#x").focus();
      await page.keyboard.press("ArrowRight"); await page.waitForTimeout(200);
      seen.arrowOnSlider = await stateIn(page);
      assert.equal(seen.arrowOnSlider, "first:0 x=1 count=0 focus=x", "→ still moves a focused slider");
      await page.locator("#presentation").focus();
      for (const key of ["Alt+PageDown", "Meta+PageDown", "Control+PageDown"]) {
        await page.keyboard.press(key); await page.waitForTimeout(200);
        seen[key] = await stateIn(page);
        assert.equal(seen[key], "first:0 x=1 count=0 focus=presentation", key);
      }
      await page.click("#openChooser"); await page.waitForTimeout(100);
      await page.keyboard.press("PageDown"); await page.waitForTimeout(200);
      seen.chooserOpen = await stateIn(page);
      assert.match(seen.chooserOpen, /^first:0 /, "no stepping behind the open chooser");
      await page.close();
      return seen;
    });

    const dialState = page => page.evaluate(() => {
      const s = window.PySlides.getSnapshot(), $ = id => document.getElementById(id), v = $("v");
      return `${s.slideId}:${s.step} d=${$("d").value} out=${$("dOut").textContent} v=${v.currentTime.toFixed(2)} paused=${v.paused}`;
    });
    // Playwright has no F16/F17, so those go through CDP with their Windows virtual key codes, as Chrome gets them from macOS.
    const functionKeys = { F16: 127, F17: 128 }, cdp = new WeakMap();
    const tick = async (page, key, wait = 120) => {
      const [modifier, name] = key.includes("+") ? key.split("+") : [null, key];
      if (!(name in functionKeys)) await page.keyboard.press(key);
      else {
        if (!cdp.has(page)) cdp.set(page, await page.context().newCDPSession(page));
        const event = { key: name, code: name, windowsVirtualKeyCode: functionKeys[name], modifiers: { Alt: 1, Control: 2, Meta: 4, Shift: 8 }[modifier] || 0 };
        await cdp.get(page).send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...event });
        await cdp.get(page).send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
      }
      await page.waitForTimeout(wait);
    };

    await check("dial-keys-step-a-slider-clamp-and-work-from-a-focused-button", async () => {
      const page = await open();
      await page.evaluate(() => window.PySlides.goTo("first"));
      await tick(page, "F17");
      const noDial = await stateIn(page);
      assert.equal(noDial, "first:0 x=0 count=0 focus=body", "a slide without a dial ignores the keys");
      await page.evaluate(() => window.PySlides.goTo("range"));
      await page.locator("#dbtn").focus();
      const trail = [await dialState(page)];
      for (const key of ["F17", "F17", "F17", "F17", "F16", "Alt+F16", "Meta+F16"]) { await tick(page, key); trail.push(`${key} ${await dialState(page)}`); }
      assert.deepEqual(trail.map(t => t.replace(/ v=.*/, "")), [
        "range:0 d=4 out=4", "F17 range:0 d=6 out=6", "F17 range:0 d=8 out=8", "F17 range:0 d=10 out=10",
        "F17 range:0 d=10 out=10", "F16 range:0 d=8 out=8", "Alt+F16 range:0 d=8 out=8", "Meta+F16 range:0 d=8 out=8",
      ]);
      await page.close();
      return { noDial, trail };
    });

    await check("dial-stops-a-running-step-and-page-up-restores-the-step-snapshot", async () => {
      const page = await open();
      await page.evaluate(() => window.PySlides.goTo("range"));
      await page.locator("#presentation").focus();
      await tick(page, "PageDown", 250);             // step 1 animates d from 4 to 10 over 1 s
      await tick(page, "F16", 50);
      const stopped = await dialState(page);
      await page.waitForTimeout(1200);
      const later = await dialState(page);
      await tick(page, "PageUp", 300);
      const undone = await dialState(page);
      assert.equal(stopped.replace(/ v=.*/, ""), later.replace(/ v=.*/, ""), "the animation does not resume after the dial");
      assert.ok(Number(/d=(\d+)/.exec(later)[1]) < 10, "the dial took over before the step ended: " + later);
      assert.equal(undone.replace(/ v=.*/, ""), "range:0 d=4 out=4");
      await page.close();
      return { stopped, later, undone };
    });

    await check("dial-scrubs-a-video-both-ways-clamps-and-page-up-restores-its-time", async () => {
      const page = await open();
      await page.evaluate(() => window.PySlides.goTo("movie"));
      await page.waitForFunction(() => document.getElementById("v").readyState >= 1);
      await page.evaluate(() => document.getElementById("v").play());
      await page.waitForTimeout(300);
      const playing = await dialState(page);
      await page.evaluate(() => { const v = document.getElementById("v"); v.pause(); v.currentTime = 0; });
      await page.waitForTimeout(150);
      await page.locator("#presentation").focus();
      const at = async () => Number((await dialState(page)).match(/v=([\d.]+)/)[1]);
      const seen = { playing };
      await tick(page, "F16"); seen.clampLow = await at();
      for (let i = 0; i < 3; i += 1) await tick(page, "F17");
      seen.forward3 = await at();
      await tick(page, "F16"); seen.back1 = await at();
      await tick(page, "PageDown"); await tick(page, "F17"); seen.afterStep1 = await at();
      await tick(page, "PageDown"); await tick(page, "F17"); await tick(page, "F17"); seen.afterStep2 = await at();
      await tick(page, "PageUp", 300); seen.restored = await dialState(page);
      for (let i = 0; i < 12; i += 1) await tick(page, "F17", 40);
      await page.waitForTimeout(300);
      seen.clampHigh = await at();
      seen.paused = await page.evaluate(() => document.getElementById("v").paused);
      assert.equal(seen.clampLow, 0);
      assert.equal(seen.forward3, 1.5);
      assert.equal(seen.back1, 1);
      assert.equal(seen.afterStep1, 1.5);
      assert.equal(seen.afterStep2, 2.5);
      assert.match(seen.restored, /^movie:1 .* v=1\.50 paused=true$/, "PageUp restores the time saved before step 2");
      assert.ok(Math.abs(seen.clampHigh - 4) < 0.05, "clamps at the end: " + seen.clampHigh);
      assert.equal(seen.paused, true);
      await page.close();
      return seen;
    });

    await check("build-rejects-a-dial-that-is-not-a-range-or-video-on-that-slide", async () => {
      const seen = {};
      for (const [label, target] of [["missing", "nope"], ["checkbox", "cb"]]) {
        const bad = path.join(work, "bad-" + label);
        fs.mkdirSync(path.join(bad, "assets"), { recursive: true });
        fs.writeFileSync(path.join(bad, "deck.py"), `from pyslides import *
COMPONENTS = {"c": Component('<input id="cb" type="checkbox">', frame="block")}
DECK = Deck(slides=(Slide("a", "S", "A", "E", (component("c", "c"),), dial="${target}"),), title="t", components=COMPONENTS)
`);
        const r = spawnSync("python3", ["-m", "pyslides", "build", bad], { cwd: repo, encoding: "utf8" });
        assert.notEqual(r.status, 0, label);
        seen[label] = (r.stderr + r.stdout).trim().split("\n").pop();
        assert.match(seen[label], /dial needs the id of a range input or video on a/);
      }
      return seen;
    });
  }
} finally {
  await browser?.close();
  server?.kill("SIGINT");
  fs.rmSync(work, { recursive: true, force: true });
  report.status = report.errors.length || report.checks.some(c => c.status !== "passed") ? "failed" : "passed";
  fs.writeFileSync(path.join(artifacts, live ? "clicker-live.json" : "clicker-results.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") process.exitCode = 1;
