// Profile and empty-metadata E2E: scaffold a deck with the CLI, build/serve/export it with and without a profile
// folder (tests/fixtures/profile, generic data only) and check what the browser and the PDF show.
// Covers: empty metadata renders cleanly, profile metadata/logos/fonts reach the title page and footline, engine-file and
// deck-profile collisions fail the build, vector PDF reports no host font for a profile font and does for a real host font,
// no profile means no profile <link>, validation errors, env/flag/relative-path rules, and env isolation.
// Artifacts: artifacts/profile-results.json, artifacts/profile.pdf.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const parentProfile = process.env.PYSLIDES_PROFILE;   // recorded, then removed: a profile exported in the developer shell must not leak in
delete process.env.PYSLIDES_PROFILE;

const repo = fileURLToPath(new URL("../", import.meta.url));
const artifacts = path.join(repo, "artifacts");
const fixture = path.join(repo, "tests", "fixtures", "profile");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "pyslides-profile-"));
const report = { startedAt: new Date().toISOString(), parentProfileWasSet: parentProfile !== undefined, checks: [], errors: [] };
const check = async (id, fn) => {
  try {
    const evidence = await fn();
    if (evidence && evidence.skipped) report.checks.push({ id, status: "skipped", reason: evidence.skipped });
    else report.checks.push({ id, status: "passed", evidence });
  } catch (error) { report.checks.push({ id, status: "failed", error: String(error.stack || error) }); }
};
// Every CLI call gets an environment without PYSLIDES_PROFILE unless the test passes one on purpose.
const cli = (args, { cwd = repo, env = {} } = {}) => {
  const base = { ...process.env };
  delete base.PYSLIDES_PROFILE;
  return spawnSync("python3", ["-m", "pyslides", ...args], { cwd, encoding: "utf8", env: { ...base, PYTHONPATH: repo, ...env } });
};
const all = out => out.stdout + out.stderr;
const html = deck => fs.readFileSync(path.join(deck, "build", "index.html"), "utf8");
const scaffold = name => {
  const deck = path.join(work, name);
  assert.equal(cli(["new", deck, "--title", "Metadata test"]).status, 0);
  return deck;
};
const copyDir = (from, name) => { const to = path.join(work, name); fs.cpSync(from, to, { recursive: true }); return to; };
const textFreeSvg = deck => {   // an SVG shown through image() is an <img>: its text would use host fonts
  const svg = path.join(deck, "assets", "example.svg");
  fs.writeFileSync(svg, fs.readFileSync(svg, "utf8").replace(/<text[\s\S]*?<\/text>/g, ""));
};
const buildFails = (args, message, opts) => {
  const out = cli(["build", ...args], opts);
  assert.notEqual(out.status, 0, "build must fail: " + all(out));
  assert.match(out.stderr, message);
  return out.stderr.trim().split("\n").pop();
};

let servers = [], browser;
const serve = async (deck, args = [], env = {}) => {
  const base = { ...process.env, PYTHONPATH: repo, ...env };
  if (!("PYSLIDES_PROFILE" in env)) delete base.PYSLIDES_PROFILE;
  const server = spawn("python3", ["-m", "pyslides", "serve", deck, "--port", "0", "--no-browser", ...args], { cwd: repo, env: base });
  servers.push(server);
  return new Promise((resolve, reject) => {
    let log = "";
    server.stdout.on("data", d => { log += d; const m = log.match(/PySlides ready: (\S+)/); if (m) resolve(m[1]); });
    server.stderr.on("data", d => { log += d; });
    server.on("exit", code => reject(new Error("server exited " + code + "\n" + log)));
  });
};
const open = async url => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", e => report.errors.push(String(e.stack || e)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.PySlides);
  await page.evaluate(() => document.fonts.ready);
  return page;
};
// First family of the computed font-family of a probe element with the given language.
const firstFamilies = page => page.evaluate(() => {
  const out = {};
  for (const [lang, sample] of [["en", "Latin text"], ["ko", "한국어 텍스트"], ["ja", "日本語のテキスト"]]) {
    const p = document.createElement("p");
    p.lang = lang; p.textContent = sample;
    document.querySelector("#stage").append(p);
    out[lang] = getComputedStyle(p).fontFamily.split(",")[0].trim().replace(/^"|"$/g, "");
    p.remove();
  }
  return out;
});
const titleFacts = page => page.evaluate(() => {
  const title = document.querySelector('.slide[data-slide-id="title"]');
  const foot = document.querySelector('.slide[data-slide-id="motivation"] .footline > span:first-child');
  const body = title.querySelector(".slide-body");
  const stage = document.querySelector("#stage").getBoundingClientRect();
  const leaving = [...body.children].filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.right > stage.right + 2 || r.bottom > stage.bottom + 2); });
  return {
    footline: foot.textContent, authorLine: title.querySelector(".author")?.textContent ?? null,
    instituteHtml: title.querySelector(".institute")?.innerHTML ?? null,
    metaChildren: [...title.querySelectorAll(".title-meta > *")].map(el => el.className),
    emptyParagraphs: [...title.querySelectorAll("p")].filter(p => !p.textContent.trim() && !p.classList.contains("calc-status")).length,
    logos: [...title.querySelectorAll(".titlegraphic img")].map(img => ({ src: img.getAttribute("src"), loaded: img.complete && img.naturalWidth > 0 })),
    emptyImgs: [...title.querySelectorAll("img")].filter(img => !img.getAttribute("src")).length,
    titleGraphicBoxes: title.querySelectorAll(".titlegraphic").length,
    overflow: [body.scrollWidth - body.clientWidth, body.scrollHeight - body.clientHeight], leaving: leaving.length,
  };
});

fs.mkdirSync(artifacts, { recursive: true });
try {
  browser = await chromium.launch({ executablePath: process.env.PYSLIDES_BROWSER_EXECUTABLE || undefined, headless: true,
    args: process.platform === "win32" ? [] : ["--no-sandbox"] });

  // ---- (a) empty metadata ------------------------------------------------------------------------------------------
  const plain = scaffold("plain");
  await check("PF-empty-metadata", async () => {
    const out = cli(["check", plain, "-o", path.join(work, "plain-check")]);
    assert.equal(out.status, 0, all(out));
    assert.match(out.stdout, /0 with problems, 0 errors/);
    const page = await open(await serve(plain));
    const facts = await titleFacts(page);
    assert.equal(facts.footline.trim(), "", "footline left span must be empty without author and institute: " + JSON.stringify(facts.footline));
    assert.ok(!/[()]/.test(facts.footline) && !facts.footline.includes(" "), "no empty parentheses or separator");
    assert.equal(facts.logos.length, 0);
    assert.equal(facts.titleGraphicBoxes, 0);
    assert.equal(facts.emptyImgs, 0);
    assert.equal(facts.emptyParagraphs, 0);
    assert.deepEqual(facts.metaChildren, ["date"], "only the date line remains");
    assert.deepEqual(facts.overflow.map(n => n <= 2), [true, true]);
    assert.equal(facts.leaving, 0);
    const families = await firstFamilies(page);
    assert.deepEqual(families, { en: "Pretendard", ko: "Pretendard", ja: "LINE Seed JP" });
    await page.close();
    return { ...facts, families };
  });
  await check("PF-empty-metadata-partial-fields", async () => {
    const cases = [
      [{ author: "Example Author" }, "Example Author"],
      [{ short_institute: "EI" }, "EI"],
      [{ author: "Example Author", short_institute: "EI" }, "Example Author (EI)"],
    ];
    const seen = [];
    for (const [theme, expected] of cases) {
      const deck = copyDir(plain, "partial");
      const source = path.join(deck, "deck.py");
      fs.writeFileSync(source, fs.readFileSync(source, "utf8").replace("theme={", "theme={**" + JSON.stringify(theme) + ", "));
      assert.equal(cli(["build", deck]).status, 0);
      const page = await open(await serve(deck));
      const facts = await titleFacts(page);
      assert.equal(facts.footline, expected);
      assert.equal(facts.emptyParagraphs, 0);
      seen.push(facts.footline);
      await page.close();
      fs.rmSync(deck, { recursive: true, force: true });
    }
    return seen;
  });

  // ---- (b) fixture profile reaches the page --------------------------------------------------------------------------
  const branded = scaffold("branded");
  textFreeSvg(branded);
  await check("PF-profile-metadata-and-fonts", async () => {
    const out = cli(["check", branded, "--profile", fixture, "-o", path.join(work, "branded-check")]);
    assert.equal(out.status, 0, all(out));
    assert.match(out.stdout, /0 with problems, 0 errors/);
    const page = await open(await serve(branded, ["--profile", fixture]));
    const facts = await titleFacts(page);
    assert.equal(facts.authorLine, "Example Author");
    assert.equal(facts.instituteHtml, "Example Institute<br>Example City");
    assert.equal(facts.footline, "Example Author (EI)");
    assert.deepEqual(facts.logos, [{ src: "/logos/example-a.svg", loaded: true }, { src: "/logos/example-b.svg", loaded: true }]);
    assert.equal(facts.emptyImgs, 0);
    assert.deepEqual(facts.overflow.map(n => n <= 2), [true, true]);
    assert.equal(facts.leaving, 0);
    const families = await firstFamilies(page);
    assert.deepEqual(families, { en: "Example Face", ko: "Example Face", ja: "Example Face" });
    const faces = await page.evaluate(() => [...document.fonts].filter(f => f.family.replace(/"/g, "") === "Example Face").map(f => f.status));
    assert.deepEqual(faces, ["loaded"], "the profile font face must be loaded from its @font-face rule");
    const sheets = [...html(branded).matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
    assert.ok(sheets.indexOf("/profile.css") === sheets.indexOf("/theme.css") + 1, "profile.css comes right after theme.css: " + sheets);
    await page.close();
    return { ...facts, families, sheets };
  });
  await check("PF-profile-without-css", async () => {
    const profile = copyDir(fixture, "profile-json-only");
    fs.rmSync(path.join(profile, "assets"), { recursive: true });
    const deck = copyDir(plain, "json-only");
    const out = cli(["build", deck, "--profile", profile]);
    assert.equal(out.status, 0, all(out));
    assert.doesNotMatch(html(deck), /profile\.css/);
    assert.match(html(deck), /<p class="author">Example Author<\/p>/);
    assert.ok(!fs.existsSync(path.join(deck, "build", "logos")));
    return "profile.json alone builds, no <link>";
  });
  await check("PF-precedence", async () => {
    const deck = copyDir(plain, "precedence");
    const source = path.join(deck, "deck.py");
    fs.writeFileSync(source, fs.readFileSync(source, "utf8").replace('theme={', 'theme={"author": "Deck Author", '));
    assert.equal(cli(["build", deck, "--profile", fixture]).status, 0);
    const text = html(deck);
    assert.match(text, /<p class="author">Deck Author<\/p>/, "Deck.theme beats the profile");
    assert.match(text, /<p class="institute">Example Institute<br>Example City<\/p>/, "the profile beats THEME");
    assert.match(text, /<p class="date">Conference, 2026<\/p>/);
    return "THEME < profile < Deck.theme";
  });

  // ---- (c) collisions and symlinks ----------------------------------------------------------------------------------
  await check("PF-collisions", async () => {
    const seen = {};
    const variant = (name, edit) => { const profile = copyDir(fixture, name); edit(profile); return profile; };
    const deck = copyDir(plain, "collide");
    seen.engineTheme = buildFails([deck, "--profile", variant("c-theme", p => fs.writeFileSync(path.join(p, "assets", "theme.css"), "x"))],
      /profile assets\/theme\.css would replace a file the engine provides/);
    seen.engineFont = buildFails([deck, "--profile", variant("c-font", p => { fs.mkdirSync(path.join(p, "assets", "fonts", "dejavu"), { recursive: true }); fs.writeFileSync(path.join(p, "assets", "fonts", "dejavu", "dejavu.css"), "x"); })],
      /profile assets\/fonts\/dejavu\/dejavu\.css would replace a file the engine provides/);
    seen.reserved = buildFails([deck, "--profile", variant("c-index", p => fs.writeFileSync(path.join(p, "assets", "index.html"), "x"))],
      /profile assets\/index\.html would replace a file the engine provides/);
    // deck asset against a profile asset
    const clash = copyDir(plain, "collide-deck");
    fs.mkdirSync(path.join(clash, "assets", "logos"), { recursive: true });
    fs.writeFileSync(path.join(clash, "assets", "logos", "example-a.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
    seen.deckVsProfile = buildFails([clash, "--profile", fixture], /assets\/logos\/example-a\.svg would replace a file the profile provides/);
    const cssClash = copyDir(plain, "collide-css");
    fs.writeFileSync(path.join(cssClash, "assets", "profile.css"), "/* deck */");
    seen.deckProfileCss = buildFails([cssClash, "--profile", fixture], /assets\/profile\.css would replace a file the profile provides/);
    // the same deck files without a profile are fine
    assert.equal(cli(["build", clash]).status, 0);
    // symlinks
    const linkFile = variant("c-link-file", p => fs.symlinkSync(path.join(fixture, "profile.json"), path.join(p, "assets", "link.json")));
    seen.symlinkFile = buildFails([deck, "--profile", linkFile], /profile assets\/link\.json is a symlink/);
    const linkDir = variant("c-link-dir", p => fs.symlinkSync(os.tmpdir(), path.join(p, "assets", "outside")));
    seen.symlinkDir = buildFails([deck, "--profile", linkDir], /profile assets\/outside is a symlink/);
    const linkAssets = variant("c-link-assets", p => { const real = path.join(p, "real-assets"); fs.renameSync(path.join(p, "assets"), real); fs.symlinkSync(real, path.join(p, "assets")); });
    seen.symlinkAssets = buildFails([deck, "--profile", linkAssets], /profile assets is a symlink/);
    return seen;
  });

  // ---- (d) vector PDF with a profile font -----------------------------------------------------------------------------
  await check("PF-vector-pdf-profile-font", async () => {
    const pdf = path.join(artifacts, "profile.pdf");
    const out = cli(["pdf", branded, "--vector", "--profile", fixture, "-o", pdf]);
    assert.equal(out.status, 0, all(out));
    assert.doesNotMatch(out.stdout, /WARNING host fonts/);
    const fonts = spawnSync("pdffonts", [pdf], { encoding: "utf8" });
    assert.ifError(fonts.error);
    const names = [...new Set(fonts.stdout.split("\n").slice(2).map(l => l.trim().split(/\s+/)[0]).filter(Boolean).map(n => n.replace(/^[A-Z]{6}\+/, "")))];
    assert.ok(names.includes("DejaVuSans"), "the profile font is embedded under its PostScript name: " + names);
    const text = spawnSync("pdftotext", [pdf, "-"], { encoding: "utf8" }).stdout;
    assert.match(text, /Example Author/);
    return { fonts: names };
  });

  // ---- (e) no profile, no profile <link> ------------------------------------------------------------------------------
  await check("PF-no-profile-no-link", async () => {
    const deck = copyDir(plain, "noprofile");
    assert.equal(cli(["build", deck]).status, 0);
    assert.doesNotMatch(html(deck), /profile/i);
    assert.deepEqual(fs.readdirSync(path.join(deck, "build")).filter(n => /profile|logos/.test(n)), []);
    // a deck's own assets/profile.css is just a deck asset: no profile means no automatic <link>
    fs.writeFileSync(path.join(deck, "assets", "profile.css"), "/* deck file */");
    assert.equal(cli(["build", deck]).status, 0);
    assert.doesNotMatch(html(deck), /profile\.css/);
    return "no profile-related link or file";
  });

  // ---- (f) host font substituted: warn --------------------------------------------------------------------------------
  await check("PF-host-font-warns", async () => {
    const listing = spawnSync("fc-list", [":", "family"], { encoding: "utf8" });
    if (listing.error) return { skipped: "fc-list (fontconfig) not available, so no host font family can be named" };
    const families = [...new Set(listing.stdout.split("\n").flatMap(l => l.split(",")).map(s => s.trim()).filter(Boolean))];
    const host = ["Carlito", "Liberation Sans", "Liberation Serif", "Noto Sans", "Courier", "C059", "Bitstream Charter"].find(f => families.includes(f))
      ?? families.find(f => !/^(DejaVu|Pretendard|LINE|KaTeX|Droid Sans Fallback|Latin Modern|Example)/.test(f) && /^[A-Za-z ]+$/.test(f));
    if (!host) return { skipped: "this machine has only the fonts the engine bundles (" + families.slice(0, 5).join(", ") + "), so no host font can be forced" };
    const deck = copyDir(branded, "hostfont");
    fs.writeFileSync(path.join(deck, "assets", "host.css"), `.slide-heading,.slide-body{font-family:"${host}"!important}`);
    const source = path.join(deck, "deck.py");
    fs.writeFileSync(source, fs.readFileSync(source, "utf8").replace('scripts=("deck.js",)', 'scripts=("deck.js",), styles=("host.css",)'));
    const out = cli(["pdf", deck, "--vector", "--profile", fixture, "-o", path.join(work, "host.pdf")]);
    assert.equal(out.status, 0, all(out));
    assert.match(out.stdout, /WARNING host fonts embedded/);
    return { forced: host, warning: out.stdout.split("\n").find(l => l.startsWith("WARNING")) };
  });

  // ---- validation, env, flag, relative paths ----------------------------------------------------------------------------
  await check("PF-validation-errors", async () => {
    const deck = copyDir(plain, "validate");
    const seen = {};
    const profileWith = (name, json) => { const p = path.join(work, name); fs.mkdirSync(p, { recursive: true }); if (json !== undefined) fs.writeFileSync(path.join(p, "profile.json"), json); return p; };
    seen.missing = buildFails([deck, "--profile", path.join(work, "does-not-exist")], /Profile folder does not exist/);
    const file = path.join(work, "afile"); fs.writeFileSync(file, "x");
    seen.file = buildFails([deck, "--profile", file], /Profile folder does not exist/);
    seen.noJson = buildFails([deck, "--profile", profileWith("v-nojson")], /No profile\.json/);
    seen.badJson = buildFails([deck, "--profile", profileWith("v-badjson", "{nope")], /is not valid JSON/);
    seen.list = buildFails([deck, "--profile", profileWith("v-list", "[1]")], /must hold a JSON object.*not list/);
    seen.string = buildFails([deck, "--profile", profileWith("v-string", '"x"')], /must hold a JSON object.*not str/);
    seen.unknown = buildFails([deck, "--profile", profileWith("v-unknown", '{"auhtor": "x"}')], /unknown key\(s\) 'auhtor'; valid keys: .*author/);
    seen.instituteNumber = buildFails([deck, "--profile", profileWith("v-inst", '{"institute": 3}')], /'institute' must be a string or a list of strings/);
    seen.instituteMixed = buildFails([deck, "--profile", profileWith("v-inst2", '{"institute": ["a", 2]}')], /'institute' must be a string or a list of strings/);
    seen.logosObject = buildFails([deck, "--profile", profileWith("v-logos", '{"title_logos": {"a": "b"}}')], /'title_logos' must be a string or a list of strings/);
    seen.authorList = buildFails([deck, "--profile", profileWith("v-author", '{"author": ["x"]}')], /'author' must be a string/);
    seen.canvas = buildFails([deck, "--profile", profileWith("v-canvas", '{"canvas_width": "1600"}')], /'canvas_width' must be an integer/);
    seen.canvasBool = buildFails([deck, "--profile", profileWith("v-canvas2", '{"canvas_width": true}')], /'canvas_width' must be an integer/);
    // accepted: institute as one string, an empty object
    assert.equal(cli(["build", deck, "--profile", profileWith("v-ok", '{"institute": "One Line"}')]).status, 0);
    assert.match(html(deck), /<p class="institute">One Line<\/p>/);
    assert.equal(cli(["build", deck, "--profile", profileWith("v-empty", "{}")]).status, 0);
    return seen;
  });
  await check("PF-env-flag-relative", async () => {
    const deck = copyDir(plain, "envflag");
    const linked = () => /<link rel="stylesheet" href="\/profile\.css">/.test(html(deck));
    const seen = {};
    const ok = (args, opts, expectLinked, label) => {
      const out = cli(["build", deck, ...args], opts);
      assert.equal(out.status, 0, label + ": " + all(out));
      assert.equal(linked(), expectLinked, label);
      seen[label] = expectLinked;
    };
    ok([], { env: { PYSLIDES_PROFILE: fixture } }, true, "env-only");
    ok([], { env: { PYSLIDES_PROFILE: "" } }, false, "env-empty-is-unset");
    ok([], { env: { PYSLIDES_PROFILE: "   " } }, false, "env-blank-is-unset");
    ok(["--profile", ""], {}, false, "flag-empty-without-env");
    ok(["--profile", ""], { env: { PYSLIDES_PROFILE: fixture } }, true, "flag-empty-falls-back-to-env");
    ok(["--profile", fixture], { env: { PYSLIDES_PROFILE: path.join(work, "bogus") } }, true, "flag-beats-bad-env");
    const bad = cli(["build", deck, "--profile", path.join(work, "bogus")], { env: { PYSLIDES_PROFILE: fixture } });
    assert.notEqual(bad.status, 0, "a bad flag must not fall back to a good env value");
    assert.match(bad.stderr, /Profile folder does not exist/);
    // relative: resolved against the working directory of the command, not against the deck or the repo
    const fixtures = path.dirname(fixture);
    ok(["--profile", "profile"], { cwd: fixtures }, true, "relative-name-from-cwd");
    ok(["--profile", "./profile"], { cwd: fixtures }, true, "relative-dot-from-cwd");
    ok([], { cwd: fixtures, env: { PYSLIDES_PROFILE: "profile" } }, true, "relative-env-from-cwd");
    ok(["--profile", "tests/fixtures/profile"], { cwd: repo }, true, "relative-from-repo-cwd");
    buildFails([deck, "--profile", "profile"], /Profile folder does not exist/, { cwd: work });
    buildFails([deck, "--profile", "profile"], /Profile folder does not exist/, { cwd: repo });
    // ~ expands against the home directory
    const home = path.join(work, "home"); fs.mkdirSync(home);
    fs.cpSync(fixture, path.join(home, "prof"), { recursive: true });
    ok(["--profile", "~/prof"], { env: { HOME: home } }, true, "tilde");
    // the other commands take the flag too
    for (const command of ["build", "serve", "check", "pdf"]) assert.match(all(cli([command, "--help"])), /--profile/, command);
    return seen;
  });
  await check("PF-env-isolation", async () => {
    // A parent shell that exported PYSLIDES_PROFILE must not reach the CLI calls of this suite (or the others, which delete it too).
    process.env.PYSLIDES_PROFILE = fixture;
    try {
      const deck = copyDir(plain, "isolated");
      assert.equal(cli(["build", deck]).status, 0);
      assert.doesNotMatch(html(deck), /profile\.css/, "the helper must strip PYSLIDES_PROFILE");
    } finally { delete process.env.PYSLIDES_PROFILE; }
    return { parentProfileWasSet: report.parentProfileWasSet };
  });
} finally {
  for (const server of servers) { server.removeAllListeners("exit"); server.kill(); }
  await browser?.close();
}

report.errors.length && report.checks.push({ id: "page-errors", status: "failed", error: report.errors.join("\n") });
report.status = report.checks.every(c => c.status !== "failed") ? "passed" : "failed";
fs.writeFileSync(path.join(artifacts, "profile-results.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
fs.rmSync(work, { recursive: true, force: true });
process.exit(report.status === "passed" ? 0 : 1);
