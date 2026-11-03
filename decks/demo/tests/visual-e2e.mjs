// Visual check of the demo deck at 1600x900, 1280x720 and 1365x900: every slide at its first and its last step has
// no content overflow, every image decodes, nothing is left of the page scroll area, and a contact sheet is written.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { artifacts, launch, makeReport, ready, settled, startDemo } from "./harness.mjs";

const report = makeReport("visual");
report.overflows = []; report.frames = [];
const server = await startDemo();
const browser = await launch();
const sizes = [{ width: 1600, height: 900 }, { width: 1280, height: 720 }, { width: 1365, height: 900 }];
const shots = path.join(artifacts, "demo-screenshots");
fs.rmSync(shots, { recursive: true, force: true });

const measure = page => page.evaluate(() => {
  const body = document.querySelector(".slide.is-active .slide-body");
  const clipped = [...document.querySelectorAll(".slide.is-active .slide-body *")].filter(el => {
    const r = el.getBoundingClientRect(), b = body.getBoundingClientRect();
    return !el.closest(".katex") && r.width > 0 && r.height > 0 && (r.right > b.right + 3 || r.bottom > b.bottom + 3 || r.left < b.left - 3 || r.top < b.top - 3);
  }).map(el => el.tagName.toLowerCase() + (el.id ? "#" + el.id : ""));
  const broken = [...document.querySelectorAll(".slide.is-active img")].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src);
  return { clientWidth: body.clientWidth, scrollWidth: body.scrollWidth, clientHeight: body.clientHeight, scrollHeight: body.scrollHeight,
    clipped: clipped.slice(0, 6), broken, pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});

try {
  const page = await browser.newPage({ viewport: sizes[0] });
  report.watch(page);
  await ready(page, server.url);
  const manifest = await page.evaluate(() => window.PySlides.getSnapshot().manifest);
  await report.check("every-slide-fits-at-three-viewports", async () => {
    for (const size of sizes) {
      const name = `${size.width}x${size.height}`;
      await page.setViewportSize(size);
      fs.mkdirSync(path.join(shots, name), { recursive: true });
      for (let i = 0; i < manifest.length; i++) {
        const id = manifest[i].id;
        await page.evaluate(id => window.PySlides.goTo(id), id);
        await settled(page);
        const first = await measure(page);
        const steps = (await page.evaluate(() => window.PySlides.getSnapshot())).stepCount;
        for (let k = 0; k < steps; k++) await page.evaluate(() => window.PySlides.next({ instant: true }));
        await settled(page);
        await page.waitForTimeout(250);
        const last = await measure(page);
        const file = path.join("demo-screenshots", name, `${String(i + 1).padStart(2, "0")}-${id}.jpg`);
        await page.screenshot({ path: path.join(artifacts, file), type: "jpeg", quality: 88 });
        report.frames.push({ id, viewport: name, steps, file: file.split(path.sep).join("/") });
        for (const [when, g] of [["first", first], ["last", last]]) {
          if (g.scrollWidth > g.clientWidth + 3 || g.scrollHeight > g.clientHeight + 3 || g.clipped.length || g.broken.length || g.pageScroll > 0)
            report.overflows.push({ id, viewport: name, when, ...g });
        }
      }
    }
    assert.deepEqual(report.overflows, [], "overflow, clipped children, broken images or page scroll");
    return { frames: report.frames.length, slides: manifest.length, viewports: sizes.map(s => `${s.width}x${s.height}`) };
  });

  fs.writeFileSync(path.join(artifacts, "demo-contact-sheet.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><title>PySlides demo contact sheet</title>
<style>body{font:14px sans-serif;background:#ddd;margin:16px}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0;background:white;padding:8px}img{width:100%;display:block}figcaption{padding:8px}</style>
<h1>PySlides demo: every slide at its last step, three viewports</h1><main>${report.frames.map(f => `<figure><img src="${f.file.replace("demo-screenshots", "demo-screenshots")}" loading="lazy" alt="${f.id}"><figcaption>${f.viewport} · ${f.id} · ${f.steps} step(s)</figcaption></figure>`).join("")}</main></html>`);
} finally {
  await browser.close(); server.stop(); report.finish();
}
