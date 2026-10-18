// A tiny reactive store. One state; subscribers re-render. No framework.
export function createModel(defaults, { onChange } = {}) {
  let state = { ...defaults };
  const subs = new Set();
  const emit = () => { for (const fn of subs) fn(state); if (onChange) onChange(state); };
  return {
    get: () => ({ ...state }),
    value: (k) => state[k],
    set(patch) { state = { ...state, ...patch }; emit(); },
    reset(patch = {}) { state = { ...defaults, ...patch }; emit(); },
    update(fn) { state = { ...fn({ ...state }) }; emit(); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
