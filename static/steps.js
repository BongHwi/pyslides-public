// Scripted presenter steps: each slide may declare data-steps (from deck.py) — a list of clicks,
// each a list of actions that drive the slide's own controls through ordinary DOM events.

const running = new Set();

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function readSteps(slide) {
  try {
    return JSON.parse(slide.dataset.steps || "[]");
  } catch {
    return [];
  }
}

function setRange(input, value) {
  const before = input.value;
  input.value = String(value);
  if (input.value !== before) input.dispatchEvent(new Event("input", { bubbles: true }));
}

function highlight(element, ms) {
  const target = element.closest("label, .block-body, .seg, .button-row") || element;
  target.classList.add("is-driven");
  element.classList.add("is-driven");
  setTimeout(() => {
    target.classList.remove("is-driven");
    element.classList.remove("is-driven");
  }, ms);
}

function animateRange(input, to, seconds, instant) {
  const from = Number(input.value);
  if (instant || seconds <= 0 || from === to) {
    setRange(input, to);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  highlight(input, seconds * 1000 + 400);
  const job = { done: false, finish: null };
  const start = performance.now();
  job.finish = () => {
    if (job.done) return;
    job.done = true;
    running.delete(job);
    setRange(input, to);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  running.add(job);
  const frame = now => {
    if (job.done) return;
    const t = Math.min(1, (now - start) / (seconds * 1000));
    if (t >= 1) return job.finish();
    setRange(input, from + (to - from) * ease(t));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Stop running animations where they are; a manual change by the presenter takes over. */
export function cancelSteps() {
  running.forEach(job => { job.done = true; });
  running.clear();
}

/** Finish every running animation at its end value (used before the next step or a slide change). */
export function finishSteps() {
  [...running].forEach(job => job.finish());
}

export function runStep(slide, actions, { instant = false } = {}) {
  finishSteps();
  for (const action of actions) {
    if (action.kind === "move") {
      const input = slide.querySelector(`#${CSS.escape(action.target)}`);
      if (input) animateRange(input, Number(action.value), action.seconds, instant);
      else console.warn("step target missing", action);
    } else if (action.kind === "press") {
      let button = null;
      try {
        button = slide.querySelector(action.target);
      } catch (error) {
        console.error("step target is not a valid selector", action.target, error);
        continue;
      }
      if (!button) {
        console.warn("step target missing", action);
        continue;
      }
      if (!instant) highlight(button, 900);
      button.click();
    }
  }
}

/** Values of every form control, the pressed state of every toggle and the time of every video on the slide. */
export function captureState(slide) {
  const fields = slide.querySelectorAll("input:not([type=button]):not([type=submit]):not([data-step-ignore]), select:not([data-step-ignore]), textarea:not([data-step-ignore])");
  return {
    fields: [...fields].map(el => [el, el.value, el.checked]),
    toggles: [...slide.querySelectorAll("button[aria-pressed]:not([data-step-ignore])")].map(button => [button, button.getAttribute("aria-pressed")]),
    videos: [...slide.querySelectorAll("video:not([data-step-ignore])")].map(video => [video, video.currentTime, video.paused]),
  };
}

export function restoreState(state) {
  finishSteps();
  if (!state) return;
  // Toggles first: a toggle's handler may define the context of a field (change its max, reset its value),
  // so a field restored before it would be clamped or overwritten. Fields are restored last and win.
  for (const [button, pressed] of state.toggles) {
    const now = button.getAttribute("aria-pressed");
    if (now === pressed) continue;
    // In a segmented group only the originally selected button is clicked; standalone toggles flip back.
    if (button.closest(".seg")) {
      if (pressed === "true") button.click();
    } else {
      button.click();
    }
  }
  for (const [el, value, checked] of state.fields) {
    const box = el.type === "checkbox" || el.type === "radio";
    if (box ? el.checked === checked : el.value === value) continue;
    if (box) el.checked = checked;
    else el.value = value;
    // Same events as a person (and a step) would cause, so listeners on either one redraw.
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  // Videos come back to the same time and play state, so a dial scrub is undone like any manual change.
  for (const [video, time, paused] of state.videos) {
    if (video.currentTime !== time) video.currentTime = time;
    if (paused && !video.paused) video.pause();
    else if (!paused && video.paused) video.play().catch(() => {});
  }
}
