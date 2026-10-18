// One-click preset chips, plus recognition of the current state.
export function presetHTML(presets, labels) {
  return Object.keys(presets).map((k) =>
    `<button type="button" data-preset="${k}">${labels?.[k] ?? k}</button>`).join('');
}

// Return the preset name whose values equal the state on `keys`, or ''.
export function matchPreset(presets, state, keys) {
  for (const [name, p] of Object.entries(presets)) {
    if (keys.every((k) => p[k] === state[k])) return name;
  }
  return '';
}
