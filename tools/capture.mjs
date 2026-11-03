// Walk every slide and every scripted step in presentation order and capture each state.
// Usage: node tools/capture.mjs <deck-url> [--pdf out.pdf] [--vector] [--shots dir] [--scale 2]
//   --pdf    one PDF page per state (raster images, so live charts and WebGL look as on screen)
//   --vector with --pdf: keep text, SVG and internal links as vector; only <canvas> is embedded as an image at --scale
//   --shots  one JPEG per state plus check.json and index.html; exits 1 on overflow or page errors
// The page is opened with ?export=1, which makes steps instant and hides the hover controls; plugins
// get exportMode=true (for example to stop an animation). A state is captured once window.PySlides.isSettled().
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const url = args[0] || "http://127.0.0.1:8765/";
const option = name => { const i = args.indexOf(name); return i > 0 ? args[i + 1] : undefined; };
const pdfOut = option("--pdf"), shotsDir = option("--shots"), scale = Number(option("--scale")) || 2;
const vector = args.includes("--vector") && !!pdfOut;
const exportUrl = new URL(url);
exportUrl.searchParams.set("export", "1");
exportUrl.hash = "";

const browser = await chromium.launch({
  executablePath: process.env.PYSLIDES_BROWSER_EXECUTABLE || undefined,
  headless: true,
  args: process.platform === "win32" ? ["--enable-unsafe-swiftshader"] : ["--no-sandbox", "--enable-unsafe-swiftshader"],
});

// Font faces that drew text on the print pages, split by the browser into @font-face fonts and host fonts (CDP, per element).
async function platformFonts(page) {
  const cdp = await page.context().newCDPSession(page);
  const custom = new Map(), host = new Map();
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    await page.evaluate(() => {
      for (const el of document.querySelectorAll(".pdf-page *"))
        if ([...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim())) el.setAttribute("data-pdf-text", "");
    });
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-pdf-text]" });
    for (const nodeId of nodeIds) {
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      for (const f of fonts) (f.isCustomFont ? custom : host).set(`${f.familyName}|${f.postScriptName}`, f);
    }
    await page.evaluate(() => document.querySelectorAll("[data-pdf-text]").forEach(el => el.removeAttribute("data-pdf-text")));
  } finally {
    await cdp.detach().catch(() => {});
  }
  return { custom: [...custom.values()], host: [...host.values()] };
}

let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: scale });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const where = message.location()?.url;
    errors.push("console: " + message.text() + (where && !message.text().includes(where) ? ` (${where})` : ""));
  });
  // A timeout says only that something never finished; print what the page reported before it.
  const waitFor = async (what, fn, timeout) => {
    try {
      await page.waitForFunction(fn, null, { timeout });
    } catch (error) {
      throw new Error(`${what} (${timeout / 1000} s)` + (errors.length ? ". Page errors:\n" + errors.join("\n") : ""));
    }
  };
  await page.goto(exportUrl.href, { waitUntil: "networkidle" });
  await waitFor("the deck runtime did not start", () => !!window.PySlides, 15000);
  await page.evaluate(() => window.PySlides.goTo(0));

  const settle = async () => {
    const id = await page.evaluate(() => window.PySlides.getSnapshot().slideId);
    await waitFor(`slide ${id} never settled: a plugin isSettled() stayed false`, () => window.PySlides.isSettled(), 30000);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.waitForTimeout(120);
  };

  // Content that does not fit: the slide body scrolls, or a block sticks out of the 1600 x 900 frame.
  const measure = () => page.evaluate(() => {
    const slide = document.querySelector(".slide.is-active"), body = slide.querySelector(".slide-body");
    const problems = [];
    if (body && (body.scrollHeight > body.clientHeight + 2 || body.scrollWidth > body.clientWidth + 2))
      problems.push(`slide body overflows by ${body.scrollWidth - body.clientWidth} x ${body.scrollHeight - body.clientHeight} px`);
    const stage = document.querySelector("#stage").getBoundingClientRect(), k = stage.width / 1600;
    const foot = slide.querySelector(".footline")?.getBoundingClientRect();
    for (const el of slide.querySelectorAll(".slide-body > *")) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      if (r.right > stage.right + 2 || r.bottom > stage.bottom + 2) problems.push(`${el.className || el.tagName} leaves the frame`);
      else if (foot && r.bottom > foot.top + 2) problems.push(`${el.className || el.tagName} runs into the footline by ${Math.round((r.bottom - foot.top) / k)} px`);
    }
    for (const el of slide.querySelectorAll(".katex-error"))
      problems.push(`LaTeX error: ${el.getAttribute("title") || el.textContent}`);
    return problems;
  });

  // Vector export: clone the stage (section bar, active slide, footline) into a frozen print page.
  // Each visible <canvas> (WebGL included) is replaced by an image of its pixels.
  const freeze = async () => {
    const shots = [];
    for (const canvas of await page.locator("#stage .slide.is-active canvas").all()) {
      const box = await canvas.boundingBox();
      shots.push(box && box.width ? "data:image/png;base64," + (await canvas.screenshot({ type: "png" })).toString("base64") : null);
    }
    await page.evaluate(shots => {
      const stage = document.querySelector("#stage"), active = stage.querySelector(".slide.is-active");
      const snap = window.PySlides.getSnapshot();
      const copy = stage.cloneNode(false);
      copy.removeAttribute("id"); copy.removeAttribute("style");
      copy.classList.add("pdf-page");
      for (const child of stage.children) {
        if (child.matches(".stage-controls, #chooser, .chooser")) continue;
        copy.append(child.cloneNode(true));   // inputs keep value and checkedness, so :has() states hold
      }
      copy.querySelectorAll(".slide:not(.is-active), .notes").forEach(el => el.remove());
      const slide = copy.querySelector(".slide.is-active");
      slide.removeAttribute("hidden"); slide.removeAttribute("inert");
      if (snap.step > 0) slide.removeAttribute("id");   // href="#id" then resolves to the first state of the slide
      const live = [...active.querySelectorAll("canvas")], k = stage.getBoundingClientRect().width / 1600;
      [...slide.querySelectorAll("canvas")].forEach((canvas, i) => {
        if (!shots[i]) return;
        const r = live[i].getBoundingClientRect(), img = document.createElement("img");
        img.src = shots[i]; img.className = canvas.className; img.style.cssText = canvas.style.cssText;
        img.style.width = r.width / k + "px"; img.style.height = r.height / k + "px"; img.style.display = "block";
        canvas.replaceWith(img);
      });
      // Every state lives in one print document: give each clone its own ids so url(#id) and <use> never resolve to another page's (possibly hidden) copy.
      const page = (window.__pdfPages ||= []).length, inSvg = new Set([...copy.querySelectorAll("svg [id]")].map(el => el.id)), own = new Set();
      const refs = value => { for (const m of value.matchAll(/url\(['"]?#([^)'"]+)['"]?\)/g)) if (inSvg.has(m[1])) own.add(m[1]); };
      for (const el of copy.querySelectorAll("*")) for (const attr of el.getAttributeNames()) {
        const value = el.getAttribute(attr);
        if (value.includes("url(#")) refs(value);
        else if ((attr === "href" || attr === "xlink:href") && el.closest("svg") && value.startsWith("#") && inSvg.has(value.slice(1))) own.add(value.slice(1));
        else if (attr === "aria-labelledby" || attr === "aria-describedby") for (const id of value.split(/\s+/)) if (inSvg.has(id)) own.add(id);
      }
      for (const style of copy.querySelectorAll("style")) refs(style.textContent);
      const suffix = id => `${id}__p${page}`;
      const rename = value => value.replace(/url\((['"]?)#([^)'"]+)\1\)/g, (m, q, id) => own.has(id) ? `url(${q}#${suffix(id)}${q})` : m);
      for (const el of copy.querySelectorAll("*")) for (const attr of el.getAttributeNames()) {
        const value = el.getAttribute(attr);
        if ((attr === "href" || attr === "xlink:href") && el.closest("svg") && value.startsWith("#") && own.has(value.slice(1))) el.setAttribute(attr, "#" + suffix(value.slice(1)));
        else if (attr === "aria-labelledby" || attr === "aria-describedby") el.setAttribute(attr, value.split(/\s+/).map(id => own.has(id) ? suffix(id) : id).join(" "));
        else if (value.includes("url(#")) el.setAttribute(attr, rename(value));
      }
      for (const el of copy.querySelectorAll("svg [id]")) if (own.has(el.id)) el.id = suffix(el.id);
      for (const style of copy.querySelectorAll("style")) style.textContent = rename(style.textContent);
      window.__pdfPages.push(copy);
    }, shots);
  };

  const states = [];
  for (let guard = 0; guard < 1000; guard++) {
    await settle();
    const state = await page.evaluate(() => window.PySlides.getSnapshot());
    const image = vector && !shotsDir ? null : await page.screenshot({ type: "jpeg", quality: 92 });
    if (vector) {
      await freeze();
      for (const message of await page.evaluate(() => [...document.querySelectorAll("#stage .slide.is-active .katex-error")].map(el => el.getAttribute("title") || el.textContent)))
        errors.push(`${state.slideId} step ${state.step}: LaTeX error: ${message}`);
    }
    states.push({ id: state.slideId, index: state.index, step: state.step, image, problems: shotsDir ? await measure() : [] });
    process.stdout.write(`\rcaptured ${states.length}: ${state.slideId} step ${state.step}/${state.stepCount}   `);
    if (state.index === state.count - 1 && state.step >= state.stepCount) break;
    await page.evaluate(() => window.PySlides.next({ instant: true }));
  }
  process.stdout.write("\n");

  if (shotsDir) {
    fs.rmSync(shotsDir, { recursive: true, force: true });
    fs.mkdirSync(shotsDir, { recursive: true });
    const rows = states.map(s => {
      const file = `${String(s.index + 1).padStart(2, "0")}-${s.id}-s${s.step}.jpg`;
      fs.writeFileSync(path.join(shotsDir, file), s.image);
      return { file, slide: s.id, step: s.step, problems: s.problems };
    });
    const report = { url, states: rows.length, problems: rows.filter(r => r.problems.length), errors };
    fs.writeFileSync(path.join(shotsDir, "check.json"), JSON.stringify(report, null, 2) + "\n");
    const cards = rows.map(r => `<figure${r.problems.length ? ' class="bad"' : ""}><img src="${r.file}" loading="lazy"><figcaption>${r.file}${r.problems.map(p => "<br>⚠ " + p).join("")}</figcaption></figure>`).join("");
    fs.writeFileSync(path.join(shotsDir, "index.html"), `<!doctype html><meta charset="utf-8"><title>Deck check</title><style>body{font:14px sans-serif;margin:16px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px}img{width:100%;border:1px solid #ccc}.bad img{outline:3px solid #e10019}</style><h1>${rows.length} states</h1><main>${cards}</main>`);
    for (const r of report.problems) console.log(`PROBLEM ${r.file}: ${r.problems.join("; ")}`);
    for (const e of errors) console.log(`ERROR ${e}`);
    console.log(`Check: ${path.join(shotsDir, "index.html")} (${rows.length} states, ${report.problems.length} with problems, ${errors.length} errors)`);
    failed = report.problems.length > 0 || errors.length > 0;
  } else if (errors.length) {
    throw new Error("page errors during export:\n" + errors.join("\n"));
  }

  if (pdfOut && vector) {
    // One print container before the viewport, so internal links become PDF links and fonts are embedded once.
    await page.evaluate(() => {
      const host = document.createElement("div");
      host.append(...window.__pdfPages);
      document.querySelector(".viewport").style.display = "none";   // kept in the DOM: the stage resize observer needs it
      document.body.prepend(host);
      const style = document.createElement("style");
      style.textContent = `@page{size:1600px 900px;margin:0}
        html,body{width:auto;height:auto;overflow:visible;background:#fff}
        .pdf-page{position:relative;transform:translate(0,0);contain:layout paint;break-after:page;break-inside:avoid}
        .pdf-page:last-child{break-after:auto}
        .pdf-page,.pdf-page *{font-variant-ligatures:no-common-ligatures}
        .is-driven{outline:none!important}
        .pdf-page .katex-mathml{display:none}
        .pdf-page .block-body pre{font-family:KaTeX_Main,"PySlides Symbols",serif}   /* theme names host math fonts here; KaTeX_Main is the bundled Computer Modern */
        .pdf-page{--f-mono:"PySlides Mono","PySlides Symbols",ui-monospace,monospace;--f-body:${getComputedStyle(document.querySelector(".viewport #stage, #stage")).getPropertyValue("--f-body").trim().replace(/,?\s*(sans-serif|serif)\s*$/, ",\"PySlides Symbols\",$1")}}`;
      document.head.append(style);
      // Text inherits the font list its ancestors already resolved (body, :lang(ja), SVG text), so the --f-body override above
      // does not reach it: append the bundled symbol font to every element's computed list, before the generic family.
      const generic = /,?\s*(sans-serif|serif|monospace|ui-monospace|system-ui|cursive|fantasy)\s*$/;
      for (const el of host.querySelectorAll("*")) {
        const family = getComputedStyle(el).fontFamily;
        if (!family || family.includes("PySlides Symbols")) continue;
        el.style.fontFamily = generic.test(family) ? family.replace(generic, ', "PySlides Symbols",$1') : `${family}, "PySlides Symbols"`;
      }
    });
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
    await page.emulateMedia({ media: "screen" });
    // Which font drew each text run? The browser knows: a face from an @font-face rule (the engine's bundled fonts, or one the
    // deck or profile declares) is a custom font; anything else came from this machine. The PostScript names of the custom
    // faces are what pdffonts prints, so they let the check below accept a declared font without naming it in this file.
    const used = await platformFonts(page);
    fs.mkdirSync(path.dirname(path.resolve(pdfOut)), { recursive: true });
    await page.pdf({ path: pdfOut, width: "1600px", height: "900px", printBackground: true, preferCSSPageSize: true, tagged: true, outline: false, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    console.log(`PDF: ${pdfOut} (${states.length} pages, vector)`);
    if (process.env.PYSLIDES_DEBUG_FONTS) console.log("fonts:", JSON.stringify(used));
    // Fonts the engine bundles are identical everywhere; anything else was substituted from this machine.
    const listing = spawnSync("pdffonts", [pdfOut], { encoding: "utf8" });
    if (listing.error) console.log("note: pdffonts (poppler) not found, host-font check skipped");
    else {
      const bundled = /^(?:[A-Z]{6}\+)?(?:Pretendard|LINESeed|LINE ?Seed|KaTeX_|DejaVuSans(?:Mono)?)/;
      const declared = new Set(used.custom.map(f => f.postScriptName).filter(Boolean));
      const foreign = new Set(listing.stdout.split("\n").slice(2).map(l => l.trim().split(/\s+/)[0]).filter(Boolean).map(n => n.replace(/^[A-Z]{6}\+/, ""))
        .filter(n => !bundled.test(n) && !declared.has(n)));
      for (const f of used.host) foreign.add(f.postScriptName || f.familyName);
      if (foreign.size) console.log(`WARNING host fonts embedded (output differs between machines): ${[...foreign].join(", ")}`);
    }
  } else if (pdfOut) {
    const sheet = await browser.newPage();
    const body = states.map(s => `<img alt="${s.id} step ${s.step}" src="data:image/jpeg;base64,${s.image.toString("base64")}">`).join("");
    await sheet.setContent(`<!doctype html><html><head><title>PySlides export</title><style>
      @page{size:1600px 900px;margin:0}html,body{margin:0}
      img{display:block;width:1600px;height:900px;break-after:page}img:last-child{break-after:auto}
    </style></head><body>${body}</body></html>`, { waitUntil: "load" });
    fs.mkdirSync(path.dirname(path.resolve(pdfOut)), { recursive: true });
    await sheet.pdf({ path: pdfOut, width: "1600px", height: "900px", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    console.log(`PDF: ${pdfOut} (${states.length} pages)`);
  }
} finally {
  await browser.close();
}
if (failed) process.exitCode = 1;
