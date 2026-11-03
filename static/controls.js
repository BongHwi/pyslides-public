// Small helpers for deck plugins. Presenter steps drive these controls through ordinary DOM events,
// so a control wired here works for both a manual click and a scripted step(move(...)) / step(choose(...)).

/** A range input with id `id`; shows its value in <output id="{id}Out"> and calls onInput(number). */
export function slider(id, onInput = () => {}, format = v => String(v)) {
  const input = document.getElementById(id), out = document.getElementById(id + "Out");
  const update = () => { const v = Number(input.value); if (out) out.textContent = format(v); onInput(v); };
  input.addEventListener("input", update);
  update();
  return () => Number(input.value);
}

/** A group (id `id`) of buttons with data-v and aria-pressed; exactly one is pressed. Calls onChange(value). */
export function segmented(id, onChange = () => {}) {
  const group = document.getElementById(id);
  group.addEventListener("click", event => {
    const button = event.target.closest("button[data-v]");
    if (!button) return;
    group.querySelectorAll("button[data-v]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
    onChange(button.dataset.v);
  });
  return () => group.querySelector('button[aria-pressed="true"]')?.dataset.v;
}
