// Deck plugin. The engine imports this module and calls:
//   init({exportMode, slides})  once, after the slides exist
//   onShow(slide)               every time a slide becomes active
//   isSettled()                 PDF export and check wait until this returns true (optional)
import { segmented, slider } from "/controls.js";

const state = { freq: 1, amp: 1, shape: "sine" };

function draw() {
  const svg = document.getElementById("wavePlot");
  if (!svg) return;
  const points = [];
  for (let i = 0; i <= 400; i++) {
    const x = i / 400, phase = 2 * Math.PI * state.freq * x;
    const y = state.shape === "sine" ? Math.sin(phase) : Math.sign(Math.sin(phase));
    points.push(`${(40 + 560 * x).toFixed(1)},${(180 - 140 * state.amp * y).toFixed(1)}`);
  }
  svg.innerHTML = `<line x1="40" y1="180" x2="600" y2="180" stroke="var(--line-2)"/>
    <polyline points="${points.join(" ")}" fill="none" stroke="var(--teal)" stroke-width="4"/>`;
}

export function init() {
  if (!document.getElementById("wavePlot")) return;
  slider("freq", v => { state.freq = v; draw(); });
  slider("amp", v => { state.amp = v; draw(); }, v => v.toFixed(2));
  segmented("shape", v => { state.shape = v; draw(); });
  draw();
}
