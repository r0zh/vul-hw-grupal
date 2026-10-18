// Declarative control strips. controlsHTML() is pure and testable;
// mountControls() wires the DOM and calls back with a fresh values object.
export function controlsHTML(spec) {
  return Object.entries(spec).map(([k, c]) => {
    const attrs = `data-k="${k}"`;
    if (c.type === 'range') {
      return `<label>${c.label} <input ${attrs} type="range" min="${c.min}" max="${c.max}" step="${c.step ?? 1}" value="${c.value}"> <output data-o="${k}"></output></label>`;
    }
    if (c.type === 'select') {
      const opts = Object.entries(c.options).map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
      return `<label>${c.label} <select ${attrs}>${opts}</select></label>`;
    }
    if (c.type === 'check') {
      return `<label><input ${attrs} type="checkbox"${c.value ? ' checked' : ''}> ${c.label}</label>`;
    }
    throw new Error(`unknown control type: ${c.type}`);
  }).join('');
}

export function controlValue(c, el) {
  if (c.type === 'range') return Number(el.value);
  if (c.type === 'check') return el.checked;
  return el.value;
}

export function mountControls(root, spec, onChange) {
  root.innerHTML = controlsHTML(spec);
  for (const [k, c] of Object.entries(spec)) {
    const el = root.querySelector(`[data-k="${k}"]`);
    if (c.type === 'select') el.value = String(c.value);
    else if (c.type === 'check') el.checked = !!c.value;
    else el.value = String(c.value);
  }
  const read = () => Object.fromEntries(Object.entries(spec).map(([k, c]) =>
    [k, controlValue(c, root.querySelector(`[data-k="${k}"]`))]));
  const paint = (values) => {
    for (const [k, c] of Object.entries(spec)) {
      const el = root.querySelector(`[data-k="${k}"]`);
      if (c.type === 'check') el.checked = !!values[k]; else el.value = values[k];
      if (c.type === 'range') root.querySelector(`[data-o="${k}"]`).textContent = c.display ? c.display(values[k]) : String(values[k]);
    }
  };
  const fire = () => { paint(read()); onChange?.(read()); };
  root.addEventListener('input', fire);
  root.addEventListener('change', fire);
  const api = {
    values: read,
    set(name, value) { paint({ ...read(), [name]: value }); onChange?.(read()); },
    setAll(values) { paint(values); onChange?.(read()); },
    resort: fire,
  };
  paint(read());
  return api;
}
