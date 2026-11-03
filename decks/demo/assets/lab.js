// The live charts of this deck. Every chart is drawn as SVG <path> elements only; its labels are HTML.
import { segmented, slider } from "/controls.js";

const $ = id => document.getElementById(id);
const line = pts => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
const frame = { x0: 40, x1: 620, y0: 20, y1: 340 };
const sx = t => frame.x0 + (frame.x1 - frame.x0) * t;
const sy = v => frame.y1 - (frame.y1 - frame.y0) * v;
const gridPath = (cols, rows) => {
  let d = "";
  for (let i = 0; i <= rows; i++) d += `M${frame.x0} ${sy(i / rows)}H${frame.x1}`;
  for (let i = 0; i <= cols; i++) d += `M${sx(i / cols)} ${frame.y0}V${frame.y1}`;
  return d;
};
const axes = `<path class="axis" d="M${frame.x0} ${frame.y1}H${frame.x1}M${frame.x0} ${frame.y0}V${frame.y1}"/>`;
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const dot = (x, y, r) => `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/* ---- Slide "sliders": a damped oscillation, driven by two sliders and a two-way switch ---- */
const wave = { f: 3, d: 1.2, view: "curve" };
function drawWave() {
  const svg = $("wavePlot");
  if (!svg) return;
  const n = 400, curve = [], upper = [], lower = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, env = Math.exp(-wave.d * 2 * t);
    curve.push([sx(t), sy(0.5 + 0.46 * env * Math.cos(2 * Math.PI * wave.f * 2 * t))]);
    upper.push([sx(t), sy(0.5 + 0.46 * env)]);
    lower.push([sx(t), sy(0.5 - 0.46 * env)]);
  }
  svg.innerHTML = `<path class="grid" d="${gridPath(8, 4)}"/>${axes}` +
    (wave.view === "both" ? `<path class="env" d="${line(upper)}"/><path class="env" d="${line(lower)}"/>` : "") +
    `<path class="curve" d="${line(curve)}"/>`;
  $("waveRead").innerHTML = `period <b>${(1 / wave.f).toFixed(2)} s</b> · amplitude falls to 1/e after <b>${wave.d > 0 ? (1 / wave.d).toFixed(2) : "∞"} s</b>`;
}

/* ---- Slide "toggles": noisy points around a line; checkboxes and a button change what is drawn ---- */
const points = { count: 20, grid: false, fit: false };
const sample = k => {
  const r = mulberry32(Math.imul(k + 1, 0x9E3779B1) ^ 0x5bd1e995), x = r(), noise = (r() + r() + r() - 1.5) * 0.16;
  return [x, Math.min(0.97, Math.max(0.03, 0.2 + 0.6 * x + noise))];
};
function drawPoints() {
  const svg = $("scatterPlot");
  if (!svg) return;
  const pts = Array.from({ length: points.count }, (_, k) => sample(k));
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const sxy = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0), sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  const slope = sxy / sxx, icpt = my - slope * mx;
  svg.innerHTML = (points.grid ? `<path class="grid" d="${gridPath(10, 5)}"/>` : "") + axes +
    (points.fit ? `<path class="fit" d="${line([[sx(0), sy(icpt)], [sx(1), sy(icpt + slope)]])}"/>` : "") +
    `<path class="pts" d="${pts.map(([x, y]) => dot(sx(x), sy(y), 7)).join("")}"/>`;
  $("ptCount").textContent = String(points.count);
  $("scatterRead").innerHTML = `<b>${points.count}</b> points · fitted slope <b>${slope.toFixed(2)}</b> (true value 0.60)`;
}

/* ---- Slide "worker": the end points of random walks, computed in a Web Worker ---- */
const WALK = { walkers: 40000, seed: 11, bins: 30, half: 150 };
const walk = { steps: 100, revision: 0, pending: false, busy: false, queued: null, worker: null, error: "", last: null };
const fmt = new Intl.NumberFormat("en-US");
function setStatus(text, state) {
  document.querySelectorAll(".calc-status").forEach(el => { el.textContent = text; el.dataset.state = state; });
}
function drawWalk() {
  const svg = $("walkPlot"), r = walk.last;
  if (!svg || !r) return;
  const width = 2 * WALK.half / WALK.bins, sigma = Math.sqrt(r.steps);
  const dens = Array.from(r.counts, c => c / (WALK.walkers * width));
  const gauss = x => Math.exp(-x * x / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
  const top = Math.max(...dens, gauss(0)) * 1.15;
  let bars = "";
  dens.forEach((d, i) => {
    const a = sx(i / WALK.bins), b = sx((i + 1) / WALK.bins) - 2, y = sy(d / top);
    bars += `M${a.toFixed(1)} ${frame.y1}V${y.toFixed(1)}H${b.toFixed(1)}V${frame.y1}Z`;
  });
  const curve = Array.from({ length: 241 }, (_, i) => {
    const x = -WALK.half + 2 * WALK.half * i / 240;
    return [sx(i / 240), sy(gauss(x) / top)];
  });
  svg.innerHTML = `<path class="grid" d="${gridPath(6, 4)}"/>${axes}<path class="bars" d="${bars}"/><path class="curve" d="${line(curve)}"/>`;
  $("walkRead").innerHTML = `measured spread <b>${r.sd.toFixed(1)}</b> · theory √steps = <b>${sigma.toFixed(1)}</b>`;
}
function requestWalk() {
  const request = { ...WALK, steps: walk.steps, revision: ++walk.revision };
  walk.pending = true;                       // isSettled() is false from this very event on
  setStatus(`Computing ${fmt.format(WALK.walkers)} walks of ${walk.steps} steps in a worker…`, "pending");
  if (walk.busy) { walk.queued = request; return; }
  walk.busy = true;
  walk.worker.postMessage(request);
}
function onWalkResult({ data }) {
  walk.busy = false;
  if (walk.queued) {
    const next = walk.queued;
    walk.queued = null;
    walk.busy = true;
    walk.worker.postMessage(next);
    return;
  }
  walk.last = { ...data, steps: walk.steps };
  walk.pending = false;
  drawWalk();
  setStatus(`Done · ${fmt.format(WALK.walkers)} walks of ${walk.steps} steps (seed ${WALK.seed})`, "accepted");
}

/* ---- Slide "dial": one curve, one slider; the dial keys F17/F16 turn it ---- */
function drawDial(degrees) {
  const svg = $("dialPlot");
  if (!svg) return;
  const delta = degrees * Math.PI / 180, pts = [];
  for (let i = 0; i <= 600; i++) {
    const t = 2 * Math.PI * i / 600;
    pts.push([sx(0.5 + 0.46 * Math.sin(t + delta)), sy(0.5 + 0.46 * Math.sin(2 * t))]);
  }
  svg.innerHTML = `<path class="grid" d="${gridPath(8, 4)}"/>${axes}<path class="curve" d="${line(pts)}"/>`;
}

export function initLab() {
  if ($("wavePlot")) {
    slider("waveFreq", v => { wave.f = v; drawWave(); });
    slider("waveDamp", v => { wave.d = v; drawWave(); }, v => v.toFixed(1));
    segmented("waveView", v => { wave.view = v; drawWave(); });
  }
  if ($("scatterPlot")) {
    $("optGrid").addEventListener("change", e => { points.grid = e.target.checked; drawPoints(); });
    $("optFit").addEventListener("change", e => { points.fit = e.target.checked; drawPoints(); });
    $("addPts").addEventListener("click", () => { points.count = Math.min(200, points.count + 20); drawPoints(); });
    drawPoints();
  }
  if ($("walkPlot")) {
    try {
      walk.worker = new Worker("/walk-worker.js");
      walk.worker.onmessage = onWalkResult;
      walk.worker.onerror = e => { e.preventDefault(); walk.busy = walk.pending = false; walk.error = e.message || "worker error"; setStatus("Worker error: " + walk.error, "error"); };
      slider("walkLen", v => { walk.steps = v; requestWalk(); });
    } catch (error) {
      walk.error = String(error.message || error);
      setStatus("Worker unavailable: " + walk.error, "error");
    }
  }
  if ($("dialPlot")) slider("phase", v => drawDial(v), v => `${Math.round(v)}°`);
  drawWave();
}

export const labState = {
  save: () => (points.count ? { points: points.count } : undefined),
  restore: saved => { if (saved && saved.points !== points.count) { points.count = saved.points; drawPoints(); } },
  settled: () => !walk.pending,
  snapshot: () => ({ wave: { ...wave }, points: { ...points }, walk: { steps: walk.steps, pending: walk.pending, revision: walk.revision, sd: walk.last?.sd ?? null, error: walk.error } }),
};
