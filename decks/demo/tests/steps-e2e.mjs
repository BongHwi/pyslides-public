// Click steps of the demo deck: move / choose / press / click, exact undo (with saveState), first-visit state,
// the worker and its isSettled() contract, the 3D scenes (and their fallback without WebGL), and the dial keys.
import assert from "node:assert/strict";
import { focusDeck, launch, makeReport, ready, settled, snap, startDemo, tick } from "./harness.mjs";

const report = makeReport("steps");
const server = await startDemo();
const browser = await launch();
const val = (page, id) => page.locator("#" + id).inputValue();
const go = async (page, id) => { await page.evaluate(id => window.PySlides.goTo(id), id); await focusDeck(page); };
const key = async (page, k, wait = 1800) => { await page.keyboard.press(k); await page.waitForTimeout(wait); };
const lab = page => page.evaluate(() => window.PySlidesDemo.lab());
const pressedIn = (page, id) => page.evaluate(id => document.querySelector(`#${id} [aria-pressed=true]`).dataset.v, id);

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  report.watch(page);
  await ready(page, server.url, "#sliders");
  await focusDeck(page);

  await report.check("move-and-choose-play-forward", async () => {
    const trail = [];
    const state = async () => ({ ...(await snap(page)), freq: await val(page, "waveFreq"), damp: await val(page, "waveDamp"), view: await pressedIn(page, "waveView") });
    trail.push(await state());
    for (let i = 0; i < 3; i++) { await key(page, "ArrowRight"); trail.push(await state()); }
    assert.deepEqual(trail.map(t => [t.step, t.freq, t.damp, t.view]), [[0, "3", "1.2", "curve"], [1, "6", "1.2", "curve"], [2, "6", "1.2", "both"], [3, "6", "3", "both"]]);
    assert.equal((await lab(page)).wave.f, 6, "the chart state follows the slider");
    return trail.map(t => `step ${t.step}: f=${t.freq} d=${t.damp} view=${t.view}`);
  });

  await report.check("left-arrow-undoes-each-step-exactly", async () => {
    const trail = [];
    for (let i = 0; i < 3; i++) { await key(page, "ArrowLeft", 300); trail.push([(await snap(page)).step, await val(page, "waveFreq"), await val(page, "waveDamp"), await pressedIn(page, "waveView")]); }
    assert.deepEqual(trail, [[2, "6", "1.2", "both"], [1, "6", "1.2", "curve"], [0, "3", "1.2", "curve"]]);
    assert.equal((await lab(page)).wave.view, "curve", "the redraw follows the restored button");
    return trail;
  });

  await report.check("a-fast-second-click-finishes-the-first-animation", async () => {
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(500);
    const mid = Number(await val(page, "waveFreq"));
    assert(mid > 3 && mid < 6, "frequency is between start and target mid-animation: " + mid);
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(60);
    assert.equal((await snap(page)).step, 2);
    assert.equal(await val(page, "waveFreq"), "6", "the unfinished move was completed by the next click");
    await page.waitForTimeout(1500);
    return { midAnimation: mid };
  });

  await report.check("a-manual-change-cancels-a-running-step", async () => {
    await go(page, "sliders"); await page.evaluate(() => window.PySlides.goTo("toggles")); await go(page, "sliders");
    assert.equal((await snap(page)).step, 0); assert.equal(await val(page, "waveFreq"), "3");
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(650);
    await page.locator('#waveView [data-v="both"]').click(); await page.waitForTimeout(1600);
    assert.equal(await pressedIn(page, "waveView"), "both");
    const f = Number(await val(page, "waveFreq"));
    assert(f > 3 && f < 6, "the running move stopped where the manual click interrupted it: " + f);
    return { frequencyWhenInterrupted: f };
  });

  await report.check("click-and-press-steps-with-savestate-undo", async () => {
    await go(page, "toggles");
    const read = async () => ({ step: (await snap(page)).step, fit: await page.locator("#optFit").isChecked(), grid: await page.locator("#optGrid").isChecked(),
      shown: await page.locator("#ptCount").textContent(), count: (await lab(page)).points.count });
    const trail = [await read()];
    for (let i = 0; i < 4; i++) { await key(page, "ArrowRight", 250); trail.push(await read()); }
    assert.deepEqual(trail.map(t => [t.step, t.fit, t.grid, t.shown, t.count]),
      [[0, false, false, "20", 20], [1, true, false, "20", 20], [2, true, false, "40", 40], [3, true, false, "60", 60], [4, true, true, "60", 60]]);
    const back = [];
    for (let i = 0; i < 4; i++) { await key(page, "ArrowLeft", 250); back.push(await read()); }
    assert.deepEqual(back.map(t => [t.step, t.fit, t.grid, t.shown, t.count]),
      [[3, true, false, "60", 60], [2, true, false, "40", 40], [1, true, false, "20", 20], [0, false, false, "20", 20]]);
    return { forward: trail, undo: back };
  });

  await report.check("re-entering-a-slide-restores-its-first-visit-state", async () => {
    await go(page, "toggles");
    await key(page, "ArrowRight", 250); await key(page, "ArrowRight", 250); await key(page, "ArrowRight", 250);
    assert.equal((await lab(page)).points.count, 60);
    await page.evaluate(() => { window.PySlides.goTo("summary"); window.PySlides.goTo("toggles"); });
    assert.equal((await snap(page)).step, 0);
    assert.equal((await lab(page)).points.count, 20); assert.equal(await page.locator("#optFit").isChecked(), false);
    return "toggles back at 20 points, fit off";
  });

  await report.check("step-dots-follow-the-step", async () => {
    await go(page, "knot"); await key(page, "ArrowRight", 400);
    const dots = await page.locator(".slide.is-active .stepdots i").evaluateAll(ds => ds.map(d => d.classList.contains("on")));
    assert.deepEqual(dots, [true, false, false]);
    return dots;
  });

  await report.check("worker-isSettled-is-false-from-the-input-event-until-the-result-is-drawn", async () => {
    await go(page, "worker");
    await settled(page);
    const first = await page.evaluate(() => {
      const input = document.getElementById("walkLen");
      input.value = "1200"; input.dispatchEvent(new Event("input", { bubbles: true }));
      return { settledRightAfter: window.PySlides.isSettled(), status: document.querySelector(".calc-status").dataset.state, text: document.querySelector(".calc-status").textContent };
    });
    assert.equal(first.settledRightAfter, false); assert.equal(first.status, "pending");
    await settled(page);
    const done = await page.evaluate(() => ({ status: document.querySelector(".calc-status").dataset.state, text: document.querySelector(".calc-status").textContent, walk: window.PySlidesDemo.lab().walk }));
    assert.equal(done.status, "accepted"); assert.equal(done.walk.pending, false);
    const theory = Math.sqrt(1200);
    assert(Math.abs(done.walk.sd - theory) < 0.03 * theory, `measured ${done.walk.sd} vs sqrt(1200)=${theory}`);
    return { whileComputing: first.text, done: done.text, sd: done.walk.sd, theory };
  });

  await report.check("worker-latest-request-wins-and-results-are-seeded", async () => {
    const run = async steps => {
      await page.evaluate(steps => {
        const input = document.getElementById("walkLen");
        for (const v of [400, 800, steps]) { input.value = String(v); input.dispatchEvent(new Event("input", { bubbles: true })); }
      }, steps);
      assert.equal(await page.evaluate(() => window.PySlides.isSettled()), false);
      await settled(page);
      return page.evaluate(() => window.PySlidesDemo.lab().walk);
    };
    const a = await run(500), b = await run(900), c = await run(500);
    assert.equal(a.steps, 500); assert.equal(b.steps, 900);
    assert.equal(a.sd, c.sd, "same request, same result");
    return { sd500: a.sd, sd900: b.sd, again500: c.sd };
  });

  await report.check("worker-steps-move-the-slider-and-recompute", async () => {
    await page.evaluate(() => { window.PySlides.goTo("toggles"); window.PySlides.goTo("worker"); }); await focusDeck(page);
    await key(page, "ArrowRight", 300);
    const seenPending = await page.evaluate(() => window.PySlidesDemo.lab().walk.pending);
    await page.waitForFunction(() => document.getElementById("walkLen").value === "1500", null, { timeout: 5000 });
    await settled(page);
    assert.equal(await val(page, "walkLen"), "1500");
    const w = (await lab(page)).walk;
    assert(Math.abs(w.sd - Math.sqrt(1500)) < 0.03 * Math.sqrt(1500));
    return { pendingDuringStep: seenPending, sd: w.sd };
  });

  await report.check("3d-knot-renders-orbits-and-follows-the-steps", async () => {
    await go(page, "knot");
    await page.waitForFunction(() => window.PySlidesDemo.knot()?.ready, null, { timeout: 20000 });
    const a = await page.evaluate(() => window.PySlidesDemo.knot());
    assert.equal(a.fallback, false);
    const lit = await page.evaluate(() => {
      const c = document.querySelector("#knotScene canvas"), t = document.createElement("canvas"); t.width = c.width; t.height = c.height;
      const g = t.getContext("2d"); g.drawImage(c, 0, 0); const d = g.getImageData(0, 0, t.width, t.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n / (t.width * t.height);
    });
    assert(lit > 0.05, "the canvas has drawn pixels: " + lit);
    await page.waitForTimeout(500);
    const b = await page.evaluate(() => window.PySlidesDemo.knot());
    assert(b.spin > a.spin, "the model turns slowly by itself");
    const box = await page.locator("#knotScene").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 40, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(300);
    const c = await page.evaluate(() => window.PySlidesDemo.knot());
    assert.notDeepEqual(c.camera, a.camera, "OrbitControls moved the camera");
    await focusDeck(page);
    await key(page, "ArrowRight", 1700); await key(page, "ArrowRight", 1700); await key(page, "ArrowRight", 400);
    const d = await page.evaluate(() => window.PySlidesDemo.knot());
    assert.deepEqual([d.q, d.tube, d.style], [5, 0.65, "wire"]);
    assert(d.builds > a.builds, "the geometry was rebuilt: " + [a.builds, d.builds]);
    return { litFraction: +lit.toFixed(3), spinGain: +(b.spin - a.spin).toFixed(3), cameraBefore: a.camera, cameraAfterDrag: c.camera, params: [d.q, d.tube, d.style], builds: [a.builds, d.builds] };
  });

  await report.check("hero-scene-renders-on-the-title-slide", async () => {
    await go(page, "title");
    await page.waitForFunction(() => window.PySlidesDemo.hero()?.ready, null, { timeout: 20000 });
    const h = await page.evaluate(() => window.PySlidesDemo.hero());
    assert.equal(h.fallback, false); assert(h.frames > 0);
    return h;
  });

  await report.check("dial-f17-f16-turn-the-slider-and-clamp", async () => {
    await go(page, "dial");
    assert.equal(await val(page, "phase"), "0");
    const path0 = await page.locator("#dialPlot .curve").getAttribute("d");
    const seq = [];
    for (const k of ["F17", "F17", "F17", "F16", "F16", "F16", "F16"]) { await tick(page, k); seq.push(Number(await val(page, "phase"))); }
    assert.deepEqual(seq, [3, 6, 9, 6, 3, 0, 0], "step 3, stops at min");
    await tick(page, "F17"); await tick(page, "F17");
    assert.notEqual(await page.locator("#dialPlot .curve").getAttribute("d"), path0, "the curve follows the dial");
    assert.equal(await page.locator("#phaseOut").textContent(), "6°");
    for (let i = 0; i < 70; i++) await tick(page, "F17");
    assert.equal(await val(page, "phase"), "45", "stops at max");
    return { seq, max: 45 };
  });

  await report.check("dial-turn-is-a-manual-change-that-pagedown-and-pageup-treat-as-such", async () => {
    await go(page, "toggles"); await go(page, "dial");
    assert.equal(await val(page, "phase"), "0");
    await tick(page, "F17"); await tick(page, "F17");
    await page.keyboard.press("PageDown");           // clicker: runs the step move(phase, 45)
    await page.waitForTimeout(2300);
    assert.equal(await val(page, "phase"), "45");
    await page.keyboard.press("PageUp");             // step 1 is undone to the first-visit state of the slide, as documented
    await page.waitForTimeout(200);
    assert.equal(await val(page, "phase"), "0");
    await page.keyboard.press("PageDown"); await page.waitForTimeout(900);
    const mid = Number(await val(page, "phase"));
    await tick(page, "F16");                         // a dial turn during a step animation stops it where it is
    await page.waitForTimeout(2000);
    const stopped = Number(await val(page, "phase"));
    assert(mid > 6 && mid < 45 && Math.abs(stopped - mid) <= 6, `animation stopped near ${mid}, ended at ${stopped}`);
    return { afterStep: 45, afterUndo: 0, interruptedAt: mid, endedAt: stopped };
  });

  await report.check("dial-keys-do-nothing-on-a-slide-without-a-dial", async () => {
    await go(page, "sliders");
    const before = [await val(page, "waveFreq"), await val(page, "waveDamp")];
    await tick(page, "F17"); await tick(page, "F16");
    assert.deepEqual([await val(page, "waveFreq"), await val(page, "waveDamp")], before);
    return before;
  });

  // WebGL cannot be created: both scenes must show their static preview, with no JS error and a working deck.
  await report.check("3d-falls-back-to-the-static-preview-without-webgl", async () => {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(type) ? null : original.call(this, type, ...rest); };
    });
    const p = await context.newPage();
    const problems = [];
    p.on("pageerror", e => problems.push("pageerror: " + e.message));
    p.on("console", m => { if (m.type() === "error") problems.push("console: " + m.text()); });
    await ready(p, server.url, "#title");
    const hero = await p.evaluate(() => ({ fallback: window.PySlidesDemo.hero().fallback, cls: document.getElementById("heroScene").className,
      img: document.querySelector("#heroScene img").getBoundingClientRect().width, canvases: document.querySelectorAll("#heroScene canvas").length }));
    assert.equal(hero.fallback, true); assert(hero.img > 100, "static picture is visible"); assert.equal(hero.canvases, 0);
    await p.evaluate(() => window.PySlides.goTo("knot"));
    await focusDeck(p);
    const knot = await p.evaluate(() => ({ fallback: window.PySlidesDemo.knot().fallback, img: document.querySelector("#knotScene img").getBoundingClientRect().width,
      note: document.querySelector("#knotScene .scene-note")?.getBoundingClientRect().height > 0, settled: window.PySlides.isSettled() }));
    assert.equal(knot.fallback, true); assert(knot.img > 100); assert(knot.note); assert.equal(knot.settled, true);
    await key(p, "ArrowRight", 1700);               // the sliders still work without a scene
    assert.equal(await p.locator("#knotQ").inputValue(), "5");
    assert.deepEqual(problems, [], "no JS error without WebGL");
    await context.close();
    return { hero, knot };
  });
} finally {
  await browser.close(); server.stop(); report.finish();
}
