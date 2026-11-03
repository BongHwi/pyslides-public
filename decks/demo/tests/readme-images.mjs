// Not part of `npm test`. Captures the four README screenshots from the demo build at 1600x900:
//   node decks/demo/tests/readme-images.mjs   ->   docs/images/demo-{title,interactive,3d,math}.png
import path from "node:path";
import { launch, ready, repo, settled, startDemo, focusDeck } from "./harness.mjs";

const server = await startDemo();
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await ready(page, server.url);
  const out = name => path.join(repo, "docs", "images", `demo-${name}.png`);
  const at = async (id, steps) => {
    await page.evaluate(id => window.PySlides.goTo(id), id);
    await focusDeck(page);
    for (let k = 0; k < steps; k++) await page.evaluate(() => window.PySlides.next({ instant: true }));
    await settled(page);
    await page.waitForTimeout(600);
  };
  await at("title", 0); await page.screenshot({ path: out("title") });
  await at("sliders", 2); await page.screenshot({ path: out("interactive") });
  await at("knot", 1); await page.screenshot({ path: out("3d") });
  await at("equations", 0); await page.screenshot({ path: out("math") });
} finally {
  await browser.close(); server.stop();
}
