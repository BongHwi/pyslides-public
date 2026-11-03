// Plugin of the PySlides demo deck (see AUTHORING.md): wires the charts, the worker and the two 3D scenes.
import { slider, segmented } from "/controls.js";
import { initLab, labState } from "/lab.js";
import { mountHero, mountKnot } from "/scenes.js";

const knotParams = { q: 3, tube: 0.4, style: "solid" };
const scenes = [];                        // {root, scene}
let knotScene = null;

export function init({ exportMode }) {
  initLab();
  for (const [id, mount] of [["heroScene", root => mountHero(root, { exportMode })],
                             ["knotScene", root => mountKnot(root, { exportMode, params: knotParams })]]) {
    const root = document.getElementById(id);
    if (!root) continue;
    let scene = null;
    try { scene = mount(root); } catch (error) { root.classList.add("is-fallback"); }
    if (id === "knotScene") knotScene = scene;
    scenes.push({ root, scene });
  }
  if (document.getElementById("knotQ")) {
    const rebuild = () => knotScene?.api?.apply();
    slider("knotQ", v => { knotParams.q = v; rebuild(); });
    slider("knotTube", v => { knotParams.tube = v; rebuild(); }, v => v.toFixed(2));
    segmented("knotStyle", v => { knotParams.style = v; rebuild(); });
  }
  window.PySlidesDemo = {
    lab: () => labState.snapshot(),
    hero: () => scenes.find(s => s.root.id === "heroScene")?.scene?.state,
    knot: () => knotScene && { ...knotScene.state, ...(knotScene.api?.snapshot() || {}), camera: knotScene.camera() },
  };
}

export function onShow(slide) {
  for (const { root, scene } of scenes) {
    if (!scene) continue;
    if (slide.contains(root)) scene.activate(); else scene.deactivate();
  }
}

export function isSettled() {
  const slide = document.querySelector(".slide.is-active");
  const sceneReady = scenes.every(({ root, scene }) => !scene || !slide?.contains(root) || scene.state.ready || scene.state.fallback);
  return labState.settled() && sceneReady;
}

export const saveState = () => labState.save();
export const restoreState = (slide, saved) => labState.restore(saved);
