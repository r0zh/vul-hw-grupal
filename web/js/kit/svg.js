// SVG helpers: element builder and two scales. Enough for plots and grids.
export const NS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function scaleLinear(domain, range) {
  const [d0, d1] = domain, [r0, r1] = range;
  const f = (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  f.invert = (p) => d0 + ((p - r0) / (r1 - r0)) * (d1 - d0);
  return f;
}

export function scaleLog(domain, range) {
  const l0 = Math.log10(domain[0]), l1 = Math.log10(domain[1]);
  const f = (v) => {
    const p = (Math.log10(v) - l0) / (l1 - l0);
    return range[0] + p * (range[1] - range[0]);
  };
  f.invert = (p) => 10 ** (l0 + ((p - range[0]) / (range[1] - range[0])) * (l1 - l0));
  return f;
}

// Nice 1/2/5 ticks inside [min, max].
export function niceTicks(min, max, count = 6) {
  if (max <= min) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

export function decadeTicks(lo, hi) {
  const out = [];
  for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++) out.push(10 ** e);
  return out;
}

export const points = (pts) => pts.map(([x, y]) => `${x},${y}`).join(' ');
