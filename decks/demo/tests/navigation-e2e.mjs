// Navigation of the demo deck: key map and boundaries, ignored keys, no double advance from sections and the
// contents list, hash and reload, full screen, presenter notes in the page.
import path from "node:path";
import assert from "node:assert/strict";
import { artifacts, focusDeck, launch, makeReport, ready, snap, startDemo } from "./harness.mjs";

const report = makeReport("navigation");
const server = await startDemo();
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  report.watch(page);
  await ready(page, server.url);
  const index = async () => (await snap(page)).index;
  const press = async key => { await page.keyboard.press(key); return index(); };

  await report.check("key-map-and-boundaries", async () => {
    await focusDeck(page);
    const s = await snap(page);
    assert.equal(s.slideId, "title"); assert.equal(s.stepCount, 0);
    const trail = [];
    for (const [key, want] of [["ArrowRight", 1], ["Space", 2], ["Shift+Space", 1], ["PageDown", 2], ["PageUp", 1], ["Backspace", 0],
                               ["ArrowLeft", 0], ["End", s.count - 1], ["ArrowRight", s.count - 1], ["ArrowLeft", s.count - 2], ["Home", 0]]) {
      assert.equal(await press(key), want, key); trail.push(`${key}→${want}`);
    }
    return { slides: s.count, trail };
  });

  await report.check("steps-play-before-the-next-slide", async () => {
    await page.evaluate(() => window.PySlides.goTo("sliders")); await focusDeck(page);
    const trail = [];
    for (let i = 0; i < 4; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(150); const s = await snap(page); trail.push([s.slideId, s.step]); }
    assert.deepEqual(trail, [["sliders", 1], ["sliders", 2], ["sliders", 3], ["toggles", 0]]);
    return trail;
  });

  await report.check("modifiers-composition-and-prevented-events-are-ignored", async () => {
    await page.evaluate(() => window.PySlides.goTo("equations")); await focusDeck(page);
    await page.keyboard.press("Control+ArrowRight"); assert.equal((await snap(page)).slideId, "equations");
    await page.keyboard.press("Alt+ArrowRight"); assert.equal((await snap(page)).slideId, "equations");
    await page.locator("#presentation").evaluate(el => el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true, isComposing: true })));
    assert.equal((await snap(page)).slideId, "equations");
    await page.locator("#presentation").evaluate(el => { const e = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }); e.preventDefault(); el.dispatchEvent(e); });
    assert.equal((await snap(page)).slideId, "equations");
    return { control: true, alt: true, composing: true, prevented: true };
  });

  await report.check("a-focused-slider-keeps-the-arrow-keys-but-not-the-clicker-keys", async () => {
    await page.evaluate(() => window.PySlides.goTo("dial")); await focusDeck(page);
    await page.locator("#phase").focus();
    const before = await page.locator("#phase").inputValue();
    await page.keyboard.press("ArrowRight");
    assert.equal((await snap(page)).slideId, "dial", "ArrowRight stays with the slider");
    assert.notEqual(await page.locator("#phase").inputValue(), before, "the slider moved");
    await page.keyboard.press("PageDown");
    assert.equal((await snap(page)).step, 1, "PageDown steps the slide although a slider has focus");
    assert.equal(await page.evaluate(() => document.activeElement.id), "presentation");
    return { sliderMovedFrom: before };
  });

  await report.check("section-and-contents-space-do-not-advance-twice", async () => {
    await page.evaluate(() => window.PySlides.goTo(0)); await focusDeck(page);
    await page.locator(".sections [role=button]").first().focus();
    await page.keyboard.press("Space");
    assert.equal(await index(), 1, "Space on the section tab goes to the section start once");
    await page.evaluate(() => window.PySlides.goTo(0));
    await page.locator("#openChooser").click();
    await page.locator("#chooser li").nth(1).focus();
    await page.keyboard.press("Space");
    assert.equal(await index(), 1); assert(await page.locator("#chooser").isHidden());
    return { section: 1, contents: 1 };
  });

  await report.check("hash-reload-and-invalid-hash", async () => {
    await page.evaluate(() => window.PySlides.goTo("worker"));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => window.PySlides);
    assert.equal((await snap(page)).slideId, "worker");
    await page.evaluate(() => { location.hash = "no-such-slide"; });
    await page.waitForFunction(() => window.PySlides.getSnapshot().index === 0);
    return { reloadedOn: "worker", invalidHashGoesTo: "title" };
  });

  await report.check("full-screen-button", async () => {
    await page.locator("#fullscreen").click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    assert.equal(await page.evaluate(() => document.fullscreenElement.id), "presentation");
    const box = await page.locator("#stage").boundingBox();
    assert(box.x >= -1 && box.y >= -1 && box.x + box.width <= 1281 && box.y + box.height <= 721, JSON.stringify(box));
    await page.screenshot({ path: path.join(artifacts, "demo-fullscreen.png") });
    await page.locator("#fullscreen").click();
    await page.waitForFunction(() => !document.fullscreenElement);
    return { stage: box };
  });

  await report.check("every-slide-has-presenter-notes-that-are-not-visible", async () => {
    const info = await page.evaluate(() => [...document.querySelectorAll(".slide")].map(s => {
      const n = s.querySelector(".notes");
      return { id: s.dataset.slideId, chars: n ? n.textContent.trim().length : 0, shown: n ? n.getBoundingClientRect().height > 0 : false };
    }));
    assert(info.every(i => i.chars > 20 && !i.shown), JSON.stringify(info));
    return info.map(i => `${i.id}:${i.chars}`);
  });
} finally {
  await browser.close(); server.stop(); report.finish();
}
