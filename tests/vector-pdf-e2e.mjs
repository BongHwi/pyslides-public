// Vector PDF E2E on a scaffolded deck: every embedded font must be one the engine bundles, so the file does not
// depend on the machine that exported it; a LaTeX error must fail the export instead of shipping silently.
// Artifacts: artifacts/vector-pdf-results.json and artifacts/vector.pdf.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

delete process.env.PYSLIDES_PROFILE;   // a profile exported in the developer shell must not leak into these runs
const repo = fileURLToPath(new URL("../", import.meta.url));
const artifacts = path.join(repo, "artifacts");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "pyslides-vector-"));
const deck = path.join(work, "talk");
const report = { startedAt: new Date().toISOString(), deck, checks: [] };
const check = async (id, fn) => {
  try { report.checks.push({ id, status: "passed", evidence: await fn() }); }
  catch (error) { report.checks.push({ id, status: "failed", error: String(error.stack || error) }); }
};
const cli = (...args) => spawnSync("python3", ["-m", "pyslides", ...args], { cwd: repo, encoding: "utf8" });
const bundled = /^(?:Pretendard|LINESeed|KaTeX_|DejaVuSans)/;

fs.mkdirSync(artifacts, { recursive: true });
assert.equal(cli("new", deck, "--title", "Vector test").status, 0);
const source = path.join(deck, "deck.py"), good = fs.readFileSync(source, "utf8");
// Glyphs that Pretendard lacks: they used to fall back to whatever the host provides.
fs.writeFileSync(source, good.replace("Third supporting point.", "Third → ⟨N⟩ Oᵢⱼ ① Q⁺ − Q⁻ **◂ ▸** point."));
const pdf = path.join(artifacts, "vector.pdf");
// An SVG shown through image() is an <img>: it cannot see the page's web fonts, so its text uses the host's.
// The scaffold's example figure has text; keep a text-free copy for the clean run and test the warning separately.
const svg = path.join(deck, "assets", "example.svg"), svgWithText = fs.readFileSync(svg, "utf8");
fs.writeFileSync(svg, svgWithText.replace(/<text[\s\S]*?<\/text>/g, ""));

await check("vector-pdf-embeds-only-bundled-fonts", async () => {
  const out = cli("pdf", deck, "--vector", "-o", pdf);
  assert.equal(out.status, 0, out.stdout + out.stderr);
  const fonts = spawnSync("pdffonts", [pdf], { encoding: "utf8" });
  assert.ifError(fonts.error);
  const names = [...new Set(fonts.stdout.split("\n").slice(2).map(l => l.trim().split(/\s+/)[0]).filter(Boolean).map(n => n.replace(/^[A-Z]{6}\+/, "")))];
  const foreign = names.filter(n => !bundled.test(n));
  assert.deepEqual(foreign, [], `host fonts embedded: ${foreign}`);
  assert.doesNotMatch(out.stdout, /WARNING host fonts/);
  const text = spawnSync("pdftotext", [pdf, "-"], { encoding: "utf8" }).stdout;
  assert.match(text, /⟨N⟩/);
  return { fonts: names };
});

await check("guard-warns-about-host-fonts-in-svg-images", async () => {
  fs.writeFileSync(svg, svgWithText);
  const out = cli("pdf", deck, "--vector", "-o", path.join(work, "svgtext.pdf"));
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stdout, /WARNING host fonts embedded/);
});

await check("latex-error-fails-vector-export", async () => {
  fs.writeFileSync(source, good.replace(String.raw`\int d^2b`, String.raw`\int \notamacro d^2b`));
  const out = cli("pdf", deck, "--vector", "-o", path.join(work, "bad.pdf"));
  assert.notEqual(out.status, 0, "export must fail on a LaTeX error");
  assert.match(out.stdout + out.stderr, /LaTeX error/);
});

report.status = report.checks.every(c => c.status === "passed") ? "passed" : "failed";
fs.writeFileSync(path.join(artifacts, "vector-pdf-results.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
fs.rmSync(work, { recursive: true, force: true });
process.exit(report.status === "passed" ? 0 : 1);
