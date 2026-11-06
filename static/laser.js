const DURATION = 1500;
const DELAY = 260;
const STAGE_WIDTH = 1600;
const STAGE_HEIGHT = 900;

export function createLaser({ stage, exportMode = false } = {}) {
  let enabled = true;
  let dot = null;
  let timer = null;
  let frame = null;
  let generation = 0;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function stop() {
    generation += 1;
    if (timer !== null) clearTimeout(timer);
    if (frame !== null) cancelAnimationFrame(frame);
    timer = frame = null;
    if (dot) {
      dot.hidden = true;
      dot.style.opacity = "0";
    }
  }

  function setEnabled(value) {
    enabled = Boolean(value) && !exportMode;
    if (!enabled) stop();
  }

  function isActive(slide) {
    return enabled && !document.hidden && slide.isConnected && slide.classList.contains("is-active");
  }

  function targetBox(target) {
    const box = target.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    if (!(target instanceof HTMLImageElement) || getComputedStyle(target).objectFit !== "contain") return box;
    if (!target.naturalWidth || !target.naturalHeight) return null;
    const scale = Math.min(box.width / target.naturalWidth, box.height / target.naturalHeight);
    const width = target.naturalWidth * scale;
    const height = target.naturalHeight * scale;
    return {
      left: box.left + (box.width - width) / 2,
      top: box.top + (box.height - height) / 2,
      width,
      height,
    };
  }

  function draw(slide, target, cue, startedAt, token, stationary) {
    const tick = now => {
      if (token !== generation || !isActive(slide)) return stop();
      const elapsed = now - startedAt;
      const progress = stationary ? 0 : elapsed / DURATION;
      const targetRect = targetBox(target);
      const stageRect = stage.getBoundingClientRect();
      if (!targetRect || !stageRect.width || !stageRect.height || progress >= 1) return stop();

      const sx = stageRect.width / STAGE_WIDTH;
      const sy = stageRect.height / STAGE_HEIGHT;
      const angle = stationary ? -Math.PI / 2 : -Math.PI / 2 + progress * 3 * Math.PI;
      const x = (targetRect.left - stageRect.left + targetRect.width * ((cue.x ?? 0.5) + (cue.rx ?? 0.1) * Math.cos(angle))) / sx;
      const y = (targetRect.top - stageRect.top + targetRect.height * ((cue.y ?? 0.5) + (cue.ry ?? 0.1) * Math.sin(angle))) / sy;
      dot.style.transform = `translate(${x - 4.5}px, ${y - 4.5}px)`;
      dot.style.opacity = stationary ? String(Math.min(1, elapsed / 100, (700 - elapsed) / 180))
        : String(Math.min(1, progress * 12, (1 - progress) * 5));
      dot.hidden = false;
      if (elapsed >= (stationary ? 700 : DURATION)) return stop();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  function trigger(slide, cue) {
    stop();
    if (!enabled || exportMode || !stage || !slide || !cue?.selector || !isActive(slide)) return;
    let target;
    try { target = slide.querySelector(cue.selector); } catch { return; }
    if (!target) return;
    const box = targetBox(target);
    if (!box) return;
    const token = generation;
    timer = setTimeout(() => {
      timer = null;
      if (token !== generation || !isActive(slide)) return stop();
      draw(slide, target, cue, performance.now(), token, reducedMotion.matches);
    }, DELAY);
  }

  if (!exportMode && stage) {
    dot = document.createElement("div");
    dot.className = "pyslides-laser";
    dot.setAttribute("aria-hidden", "true");
    dot.hidden = true;
    dot.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;z-index:10;will-change:transform,opacity;opacity:0";
    stage.append(dot);
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
    reducedMotion.addEventListener("change", stop);
  }

  if (exportMode) enabled = false;
  return { trigger, stop, setEnabled, isSettled: () => timer === null && frame === null };
}
