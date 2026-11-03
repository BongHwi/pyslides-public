// A small WebGL scene host. Creating the renderer is lazy (the first time the scene's slide is shown, when its box
// has a size) and optional: where WebGL cannot be created, the static preview <img> inside the box stays visible.
import * as THREE from "/vendor/three/three.module.js";
import { OrbitControls } from "/vendor/three/OrbitControls.js";

export function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")));
  } catch {
    return false;
  }
}

/**
 * @param {HTMLElement} root  box that holds a static fallback <img> and receives the canvas
 * @param {{build: Function, orbit?: boolean, exportMode?: boolean}} options
 *   build({THREE, scene, camera, requestRender}) returns {update?(dt), apply?(), snapshot?()}
 */
export function mountScene(root, { build, orbit = false, exportMode = false }) {
  const state = { ready: false, fallback: false, error: "", frames: 0 };
  let renderer, scene, camera, controls, canvas, observer, api = null, frame = 0, active = false, last = 0;

  function showFallback(reason) {
    state.fallback = true;
    state.error = reason;
    root.classList.remove("is-live");
    root.classList.add("is-fallback");
    if (!root.querySelector(".scene-note")) {
      const note = document.createElement("p");
      note.className = "scene-note";
      note.textContent = "Static preview: WebGL is not available in this browser.";
      root.append(note);
    }
  }

  function render() {
    if (!renderer) return;
    controls?.update();
    renderer.render(scene, camera);
    state.frames += 1;
    state.ready = true;
  }
  const requestRender = () => { if (exportMode || !frame) render(); };

  function resize() {
    const w = root.clientWidth, h = root.clientHeight;
    if (!renderer || !w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }

  function start() {
    if (renderer || state.fallback) return;
    if (!webglAvailable()) return showFallback("no WebGL context");
    try {
      canvas = document.createElement("canvas");
      canvas.className = "scene-canvas";
      root.append(canvas);
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setClearColor(0x000000, 0);
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
      camera.position.set(0, 0, 10);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8f969c, 2.4));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(-6, 9, 12);
      scene.add(key);
      api = build({ THREE, scene, camera, requestRender });
      if (orbit) {
        controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 5;
        controls.maxDistance = 20;
        controls.addEventListener("change", requestRender);
      }
      root.classList.add("is-live");
      observer = new ResizeObserver(resize);
      observer.observe(root);
      resize();
    } catch (error) {
      renderer?.dispose();
      canvas?.remove();
      renderer = null;
      showFallback(String(error?.message || error));
    }
  }

  function loop(now) {
    if (!active) return;
    frame = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    api?.update?.(dt);
    render();
  }

  return {
    state,
    get api() { return api; },
    camera: () => (camera ? camera.position.toArray().map(v => +v.toFixed(3)) : null),
    activate() {
      active = true;
      start();
      if (!renderer) return;
      resize();
      if (exportMode) { api?.update?.(0); render(); return; }
      if (!frame) { last = 0; frame = requestAnimationFrame(loop); }
    },
    deactivate() {
      active = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
