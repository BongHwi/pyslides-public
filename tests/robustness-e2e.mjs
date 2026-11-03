// Regression E2E for the review findings: build-time validation, exact step undo, plugin failure,
// inline math and LaTeX errors. Each case is a small deck in a temp folder.
// Artifact: artifacts/robustness-results.json
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
const work = fs.mkdtempSync(path.join(os.tmpdir(), "pyslides-robust-"));
const report = { startedAt: new Date().toISOString(), checks: [], errors: [] };
const check = async (id, fn) => {
  try { report.checks.push({ id, status: "passed", evidence: await fn() }); }
  catch (error) { report.checks.push({ id, status: "failed", error: String(error.stack || error) }); }
};
const cli = (...args) => spawnSync("python3", ["-m", "pyslides", ...args], { cwd: repo, encoding: "utf8" });

const HEAD = "from pyslides import *\n";
/** Write a deck folder: body is Python that defines SLIDES (and optionally COMPONENTS, DECK_EXTRA). */
function deck(name, body, { assets = {}, extra = "" } = {}) {
  const folder = path.join(work, name);
  fs.mkdirSync(path.join(folder, "assets"), { recursive: true });
  for (const [file, text] of Object.entries(assets)) {
    fs.mkdirSync(path.dirname(path.join(folder, "assets", file)), { recursive: true });
    fs.writeFileSync(path.join(folder, "assets", file), text);
  }
  fs.writeFileSync(path.join(folder, "deck.py"), HEAD + body +
    `\nDECK = Deck(slides=SLIDES, title="t", components=globals().get("COMPONENTS", {})${extra})\n`);
  return folder;
}
const slide = (id, blocks, more = "") => `Slide("${id}", "S", "Title ${id}", "EB", (${blocks},)${more})`;
const buildError = folder => { const r = cli("build", folder); assert.notEqual(r.status, 0, "build should fail"); return (r.stderr + r.stdout).trim().split("\n").pop(); };

fs.mkdirSync(artifacts, { recursive: true });
let browser;
const servers = [];
async function serve(folder) {
  const server = spawn("python3", ["-m", "pyslides", "serve", folder, "--port", "0", "--no-browser"], { cwd: repo });
  servers.push(server);
  return new Promise((resolve, reject) => {
    let log = "";
    server.stdout.on("data", d => { log += d; const m = log.match(/PySlides ready: (\S+)/); if (m) resolve(m[1]); });
    server.stderr.on("data", d => { log += d; });
    server.on("exit", code => reject(new Error("server exited " + code + log)));
  });
}

try {
  await check("build-rejects-mistakes-that-would-fail-during-the-talk", async () => {
    const C = `COMPONENTS = {"ctl": Component('<input id="freq" type="range" min="0" max="9" value="1"><button id="go">go</button>', frame="block")}\n`;
    const cases = {
      "slide id equals element id": [deck("e1", C + `SLIDES = (${slide("freq", 'component("ctl", "c")')},)`), /Duplicate element id 'freq'/],
      "component used on two slides": [deck("e2", C + `SLIDES = (${slide("a", 'component("ctl", "c")')}, ${slide("b", 'component("ctl", "c")')})`), /Duplicate element id 'freq'/],
      "press id starting with a digit": [deck("e3", C + `SLIDES = (${slide("a", 'component("ctl", "c")', ', steps=(step(press("1go")),)')},)`), /must start with a letter/],
      "unbalanced dollar": [deck("e4", `SLIDES = (${slide("a", 'text("costs $5")')},)`), /Unbalanced \$/],
      "pdf figure": [deck("e5", `SLIDES = (${slide("a", 'image("fig.pdf", "f")')},)`), /Convert PDF\/EPS first/],
      "missing image file": [deck("e6", `SLIDES = (${slide("a", 'image("nope.png", "f")')},)`), /assets\/nope.png does not exist/],
      "title slide with three texts": [deck("e7", `SLIDES = (Slide("t", "S", "T", "E", (text("a"), text("b"), text("c")), "title"),)`), /Title slide t takes up to two/],
      "unknown layout": [deck("e8", `SLIDES = (${slide("a", 'text("x")', ', "wide"')},)`), /Unknown layout on a: wide/],
      "asset replaces an engine font file": [deck("e9", `SLIDES = (${slide("a", 'text("x")')},)`, { assets: { "fonts/pretendard/pretendard.css": "x" } }), /would replace a file the engine provides/],
      "asset named index.html": [deck("e10", `SLIDES = (${slide("a", 'text("x")')},)`, { assets: { "index.html": "x" } }), /would replace a file the engine provides/],
    };
    const link = deck("e11", `SLIDES = (${slide("a", 'text("x")')},)`);
    fs.symlinkSync("/etc", path.join(link, "assets", "etcdir"));
    cases["symlink in assets"] = [link, /is a symlink/];
    const seen = {};
    for (const [label, [folder, pattern]] of Object.entries(cases)) {
      const message = buildError(folder);
      assert.match(message, pattern, label);
      seen[label] = message.slice(0, 120);
    }
    assert.ok(!fs.existsSync(path.join(link, "build", "etcdir")), "symlinked folder must not be copied");
    return seen;
  });

  await check("cli-new-title-names-and-deck-imports", async () => {
    const quoted = path.join(work, "quoted");
    assert.equal(cli("new", quoted, "--title", 'The "neutron skin" of Pb \\ 208').status, 0);
    const built = cli("build", quoted);
    assert.equal(built.status, 0, built.stderr);
    assert.match(fs.readFileSync(path.join(quoted, "build", "index.html"), "utf8"), /<title>The &quot;neutron skin&quot; of Pb \\ 208<\/title>/);
    assert.match(cli("build", "bad name").stderr, /Deck name must use/);
    // Two decks with a helper module of the same name each get their own, in one process.
    for (const [name, msg] of [["h1", "one"], ["h2", "two"]]) {
      const folder = deck(name, `from helpers import MSG\nSLIDES = (${slide("a", "text(MSG)")},)`);
      fs.writeFileSync(path.join(folder, "helpers.py"), `MSG = "${msg}"\n`);
    }
    const both = spawnSync("python3", ["-c", `from pyslides.build import load_deck\nfrom pathlib import Path\nprint([load_deck(Path("${work}") / n).slides[0].blocks[0].content for n in ("h1", "h2")])`], { cwd: repo, encoding: "utf8" });
    assert.equal(both.stdout.trim(), "['one', 'two']", both.stderr);
    const inst = deck("inst", `SLIDES = (${slide("a", 'text("x")')},)`, { extra: ', theme={"institute": "MIT"}' });
    assert.equal(cli("build", inst).status, 0);
    assert.doesNotMatch(fs.readFileSync(path.join(inst, "build", "index.html"), "utf8"), /M<br>I<br>T/);
    return "quoted title builds, 'bad name' rejected, helpers isolated, institute string kept whole";
  });

  browser = await chromium.launch({ executablePath: process.env.PYSLIDES_BROWSER_EXECUTABLE || undefined, headless: true,
    args: process.platform === "win32" ? [] : ["--no-sandbox"] });

  await check("undo-restores-exact-state-with-one-shot-buttons-checkboxes-and-plugin-state", async () => {
    const plugin = `let count = 0;
export function init() {
  document.getElementById("add").addEventListener("click", () => { count += 1; document.getElementById("count").textContent = count; });
  document.getElementById("x").addEventListener("change", e => { document.getElementById("committed").textContent = e.target.value; });
}
export function saveState() { return count; }
export function restoreState(slide, saved) { count = saved; document.getElementById("count").textContent = count; }
`;
    const folder = deck("edge", `COMPONENTS = {"ctl": Component('<input id="x" type="range" min="0" max="9" step="1" value="0"><button id="add">add</button><input id="cb" type="checkbox"><b id="count">0</b><b id="committed">0</b>', frame="block")}
SLIDES = (${slide("first", 'component("ctl", "c")', ', steps=(step(move("x", 5, 0.2)), step(press("add"), click("#cb")))')}, ${slide("last", 'text("end")')})`,
      { assets: { "deck.js": plugin }, extra: ', scripts=("deck.js",)' });
    const url = await serve(folder);
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on("pageerror", e => report.errors.push(String(e)));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#presentation").focus();
    const state = () => page.evaluate(() => {
      const s = window.PySlides.getSnapshot(), $ = id => document.getElementById(id);
      return `${s.slideId}:${s.step} x=${$("x").value} committed=${$("committed").textContent} count=${$("count").textContent} cb=${$("cb").checked}`;
    });
    const trail = [];
    for (const key of ["ArrowRight", "ArrowRight", "ArrowLeft", "ArrowRight", "ArrowRight", "ArrowLeft", "ArrowLeft", "ArrowRight", "ArrowLeft"]) {
      await page.keyboard.press(key); await page.waitForTimeout(400); trail.push(`${key[5]} ${await state()}`);
    }
    assert.deepEqual(trail, [
      "R first:1 x=5 committed=5 count=0 cb=false",
      "R first:2 x=5 committed=5 count=1 cb=true",
      "L first:1 x=5 committed=5 count=0 cb=false",
      "R first:2 x=5 committed=5 count=1 cb=true",
      "R last:0 x=5 committed=5 count=1 cb=true",
      "L first:2 x=5 committed=5 count=1 cb=true",
      "L first:1 x=5 committed=5 count=0 cb=false",
      "R first:2 x=5 committed=5 count=1 cb=true",
      "L first:1 x=5 committed=5 count=0 cb=false",
    ]);
    await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(200);
    assert.equal(await state(), "first:0 x=0 committed=0 count=0 cb=false", "restore sends change too");
    await page.close();
    return trail;
  });

  await check("first-visit-state-is-kept-without-a-step-and-toggles-restore-before-fields", async () => {
    // The segmented handler defines the context of the slider: it sets max and resets the value, like a real control would.
    const plugin = `import { segmented } from "/controls.js";
export function init() {
  const evt = document.getElementById("evtB");
  segmented("caseB", v => { evt.max = v === "b" ? "9" : "5"; evt.value = "0"; });
}
`;
    const folder = deck("firstvisit", `COMPONENTS = {"ctl": Component('<div id="caseB" role="group" aria-label="case" class="seg"><button aria-pressed="true" data-v="a">A</button><button aria-pressed="false" data-v="b">B</button></div><input id="evtB" type="range" min="0" max="5" step="1" value="1">', frame="block")}
SLIDES = (${slide("first", 'component("ctl", "c")', ', steps=(step(choose("caseB", "b"), move("evtB", 7, 0.1)), step(choose("caseB", "a"), move("evtB", 3, 0.1)))')}, ${slide("last", 'text("end")')})`,
      { assets: { "deck.js": plugin }, extra: ', scripts=("deck.js",)' });
    const url = await serve(folder);
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on("pageerror", e => report.errors.push(String(e)));
    await page.goto(url, { waitUntil: "networkidle" });
    const state = () => page.evaluate(() => {
      const s = window.PySlides.getSnapshot(), evt = document.getElementById("evtB");
      return `${s.slideId}:${s.step} case=${document.querySelector('#caseB [aria-pressed="true"]').dataset.v} evt=${evt.value} max=${evt.max}`;
    });
    const trail = [await state()];
    // Defect 1: control changes made without ever playing a step must not survive leaving and re-entering.
    await page.click('#caseB [data-v="b"]');
    await page.evaluate(() => { const evt = document.getElementById("evtB"); evt.value = "7"; evt.dispatchEvent(new Event("input", { bubbles: true })); });
    trail.push("manual " + await state());
    await page.evaluate(() => window.PySlides.goTo("last")); await page.waitForTimeout(100);
    await page.evaluate(() => window.PySlides.goTo("first")); await page.waitForTimeout(100);
    trail.push("re-entered " + await state());
    // Defect 2: ← across a toggle that resets or re-ranges the slider (reset direction, then clamp direction).
    await page.locator("#presentation").focus();
    for (const key of ["ArrowRight", "ArrowRight", "ArrowLeft", "ArrowLeft"]) {
      await page.keyboard.press(key); await page.waitForTimeout(400); trail.push(`${key[5]} ${await state()}`);
    }
    assert.deepEqual(trail, [
      "first:0 case=a evt=1 max=5",
      "manual first:0 case=b evt=7 max=9",
      "re-entered first:0 case=a evt=1 max=5",
      "R first:1 case=b evt=7 max=9",
      "R first:2 case=a evt=3 max=5",
      "L first:1 case=b evt=7 max=9",
      "L first:0 case=a evt=1 max=5",
    ]);
    await page.close();
    return trail;
  });

  await check("f-key-toggles-fullscreen-like-the-button-but-not-from-controls-or-with-modifiers", async () => {
    const folder = deck("fkey", `COMPONENTS = {"ctl": Component('<input id="note" type="text"><button id="b">b</button>', frame="block")}
SLIDES = (${slide("a", 'component("ctl", "c")')},)`);
    const url = await serve(folder);
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on("pageerror", e => report.errors.push(String(e)));
    await page.goto(url, { waitUntil: "networkidle" });
    const full = () => page.evaluate(() => document.fullscreenElement?.id ?? null);
    const press = async key => { await page.keyboard.press(key); await page.waitForTimeout(300); return full(); };
    const seen = {};
    await page.locator("#presentation").focus();
    seen.f = await press("f"); assert.equal(seen.f, "presentation");
    seen.F = await press("F"); assert.equal(seen.F, null);
    seen.ctrlF = await press("Control+f"); assert.equal(seen.ctrlF, null);
    await page.locator("#note").focus();
    seen.inInput = await press("f"); assert.equal(seen.inInput, null);
    assert.equal(await page.inputValue("#note"), "f", "the key still types into the field");
    await page.locator("#b").focus();
    seen.onButton = await press("f"); assert.equal(seen.onButton, null);
    await page.click("#fullscreen"); await page.waitForTimeout(300);
    seen.button = await full(); assert.equal(seen.button, "presentation");
    await page.click("#fullscreen"); await page.waitForTimeout(300);
    seen.buttonAgain = await full(); assert.equal(seen.buttonAgain, null);
    await page.close();
    return seen;
  });

  await check("failed-plugin-is-skipped-and-reported", async () => {
    const folder = deck("badplugin", `SLIDES = (${slide("one", 'text("a")')}, ${slide("two", 'text("b")')})`,
      { assets: { "good.js": "export function init() { document.body.dataset.good = 'yes'; }\n", "bad.js": 'import "/missing.js";\n' },
        extra: ', scripts=("bad.js", "good.js")' });
    const url = await serve(folder);
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#presentation").focus(); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(200);
    const seen = await page.evaluate(() => ({ slide: window.PySlides?.getSnapshot().slideId, good: document.body.dataset.good }));
    assert.deepEqual(seen, { slide: "two", good: "yes" });
    await page.close();
    const run = cli("check", folder);
    assert.equal(run.status, 1);
    assert.match(run.stdout, /plugin failed to load/);
    return { browser: seen, check: run.stdout.split("\n").filter(l => l.startsWith("ERROR")).slice(0, 2) };
  });

  await check("inline-math-renders-and-latex-errors-fail-check", async () => {
    const good = deck("math", `SLIDES = (${slide("a", 'bullets("Hadrons at high $p_T$ and $\\\\sqrt{s_{NN}}$", "**bold** costs \\\\$5")')},)`);
    const url = await serve(good);
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto(url, { waitUntil: "networkidle" });
    const seen = await page.evaluate(() => ({ math: document.querySelectorAll(".tex-inline .katex").length, bold: document.querySelector("li b")?.textContent,
      dollar: document.querySelectorAll("li")[1].textContent.includes("$5"), chooser: window.PySlides.getSnapshot().manifest[0].title }));
    assert.deepEqual(seen, { math: 2, bold: "bold", dollar: true, chooser: "Title a" });
    await page.close();
    assert.equal(cli("check", good).status, 0);
    const bad = deck("badmath", `SLIDES = (${slide("a", 'text("broken $\\\\frac{a}{b$ here")')}, ${slide("b", 'equation(r"\\unknownmacro{x}")')})`);
    const run = cli("check", bad);
    assert.equal(run.status, 1);
    assert.equal((run.stdout.match(/LaTeX error/g) || []).length, 2, run.stdout);
    return { rendered: seen, check: run.stdout.split("\n").filter(l => l.includes("LaTeX")).map(l => l.slice(0, 110)) };
  });

  await check("bold-span-takes-css-classes-in-every-text-field-and-bad-names-stay-literal", async () => {
    const body = `SLIDES = (Slide("a", "S", "T **t**{.c-title}", "EB **e**{.c-eyebrow}", (
      bullets("**x**{.c-agent} ok", "**y**{.bad class!} no", "**m**{.a .b-2} two", "**p** plain", "**n**{.1x} digit", title="B **k**{.c-block}"),
      text("para **q**{.c-text}", title="P"),
      table(("H **h**{.c-th}",), ("cell **d**{.c-td}",), title="Tb **c**{.c-cap}", caption="det **z**{.c-det}"),
    )),)`;
    const folder = deck("boldclass", body);
    const built = cli("build", folder);
    assert.equal(built.status, 0, built.stderr + built.stdout);
    const html = fs.readFileSync(path.join(folder, "build", "index.html"), "utf8");
    for (const want of ['<b class="c-agent">x</b>', '<b class="a b-2">m</b>', '<b>p</b> plain', '<b class="c-title">t</b>', '<b class="c-eyebrow">e</b>',
      '<b class="c-block">k</b>', '<b class="c-text">q</b>', '<b class="c-th">h</b>', '<b class="c-td">d</b>', '<b class="c-cap">c</b>', '<b class="c-det">z</b>',
      '<b>y</b>{.bad class!} no', '<b>n</b>{.1x} digit'])
      assert.ok(html.includes(want), "missing " + want);
    assert.ok(!html.includes('class="bad'), "invalid class name leaked into an attribute");
    assert.equal(cli("check", folder).status, 0);
    return { classes: [...html.matchAll(/<b class="[^"]+">/g)].map(m => m[0]) };
  });

  await check("invalid-click-selector-does-not-trap-the-presenter", async () => {
    const folder = deck("badsel", `COMPONENTS = {"ctl": Component('<button id="go">go</button>', frame="block")}
SLIDES = (${slide("a", 'component("ctl", "c")', ', steps=(step(click("button:::nope")),)')}, ${slide("b", 'text("end")')})`);
    const url = await serve(folder);
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const logged = [];
    page.on("console", m => { if (m.type() === "error") logged.push(m.text()); });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#presentation").focus();
    for (let i = 0; i < 2; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(150); }
    assert.equal(await page.evaluate(() => window.PySlides.getSnapshot().slideId), "b");
    assert.ok(logged.some(t => t.includes("not a valid selector")), logged.join("\n"));
    await page.close();
    return logged[0];
  });

  await check("title-slide-text-rows-do-not-depend-on-block-order", async () => {
    const folder = deck("titled", `SLIDES = (Slide("t", "S", "Talk", "Sub", (text("first"), text("second")), "title"),)`);
    assert.equal(cli("build", folder).status, 0);
    const url = await serve(folder);
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto(url, { waitUntil: "networkidle" });
    const rows = await page.evaluate(() => [...document.querySelectorAll(".layout-title>.text-block")].map(el => ({ text: el.textContent, row: getComputedStyle(el).gridRowStart, top: Math.round(el.getBoundingClientRect().top) })));
    assert.deepEqual(rows.map(r => [r.text, r.row]), [["first", "3"], ["second", "4"]]);
    assert.ok(rows[0].top < rows[1].top);
    await page.close();
    return rows;
  });

  await check("engine-ui-text-follows-deck-lang-and-ko-stays-unchanged", async () => {
    const ui = page => page.evaluate(() => ({
      lang: document.documentElement.lang,
      buttons: ["previous", "openChooser", "fullscreen", "next"].map(id => document.getElementById(id).textContent),
      labels: [...document.querySelectorAll("[aria-label]")].map(el => el.getAttribute("aria-label")).filter(t => !/^\d+\. /.test(t)),
    }));
    const seen = {};
    for (const [name, extra] of [["ui-ko", ""], ["ui-en", ', lang="en"'], ["ui-enus", ', lang="en-US"'], ["ui-ja", ', lang="ja"'], ["ui-fr", ', lang="fr"']]) {
      const folder = deck(name, `SLIDES = (${slide("a", 'text("x")', ', notes="n"')},)`, { extra });
      const url = await serve(folder);
      const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
      await page.goto(url, { waitUntil: "networkidle" });
      seen[name] = await ui(page);
      await page.close();
    }
    assert.deepEqual(seen["ui-ko"].buttons, ["← 이전", "목차", "전체 화면", "다음 →"]);
    assert.deepEqual(seen["ui-ko"].labels, ["Interactive slide presentation", "발표 섹션", "발표자 노트", "슬라이드 선택", "선택 창 닫기", "이전 슬라이드", "슬라이드 목차 열기", "전체 화면 전환", "다음 슬라이드"]);
    const english = { buttons: ["← Previous", "Contents", "Full screen", "Next →"],
      labels: ["Interactive slide presentation", "Presentation sections", "Presenter notes", "Slide list", "Close chooser", "Previous slide", "Open slide list", "Toggle full screen", "Next slide"] };
    for (const name of ["ui-en", "ui-enus", "ui-fr"]) assert.deepEqual({ buttons: seen[name].buttons, labels: seen[name].labels }, english, name);
    assert.equal(seen["ui-en"].lang, "en");
    assert.equal(seen["ui-ja"].buttons[2], "全画面");
    assert.ok(![...seen["ui-en"].buttons, ...seen["ui-en"].labels, ...seen["ui-ja"].buttons].some(t => /[가-힣]/.test(t)), "no Korean outside ko");
    // The close button is hidden until the chooser opens; read it from the built HTML.
    const html = lang => fs.readFileSync(path.join(work, lang, "build", "index.html"), "utf8");
    assert.match(html("ui-en"), /class="overlay-close"[^>]*>Close</);
    assert.match(html("ui-ko"), /class="overlay-close"[^>]*>닫기</);
    assert.match(html("ui-ja"), /class="overlay-close"[^>]*>閉じる</);
    return seen;
  });
} finally {
  await browser?.close();
  servers.forEach(s => s.kill("SIGINT"));
  fs.rmSync(work, { recursive: true, force: true });
  report.status = report.errors.length || report.checks.some(c => c.status !== "passed") ? "failed" : "passed";
  fs.writeFileSync(path.join(artifacts, "robustness-results.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") process.exitCode = 1;
