// La nube de una casilla (k, t*) del CPA, con las trazas MEDIDAS de
// web/data/nano-tinyaes.json: cada punto es una traza; en horizontal, lo que
// predice el candidato k (bits a 1 de SBox(p ⊕ k), de 0 a 8) y, en vertical,
// la lectura del ADC en el instante t* en que la víctima calcula la S-box del
// byte (el pico del candidato correcto). Paso 0: un candidato falso típico
// (|ρ| ≈ 0); paso 1: el correcto. Las lecturas no cambian entre pasos: los
// mismos puntos se recolocan según la predicción de cada candidato, y la nube
// pasa de plana a creciente. Es el cálculo de cloud() de web/js/model/cpa.js. En pantalla, |ρ| se llama
// «parecido» y la predicción, «cuántos unos predice el candidato».
import { fromCampaignJSON, createAccumulator, correlate, peaks, cloud } from '../../../web/js/model/cpa.js';
import { roll } from './kpi.js';

const DATA = new URL('../../../web/data/nano-tinyaes.json', import.meta.url);
let campaign;
const load = () => (campaign ??= fetch(DATA).then((r) => r.json()).then(fromCampaignJSON));

const NS = 'http://www.w3.org/2000/svg';
const hex2 = (v) => `0x${v.toString(16).padStart(2, '0')}`;
const es = (v, d) => v.toFixed(d).replace('.', ',');
// Separación horizontal fija de cada punto en su columna (proporción áurea),
// como en <cpa-corr> de la web: reparte bien y no depende del azar.
const jitter = (i) => ((i * 0.6180339887) % 1) - 0.5;

function el(name, attrs = {}, text) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

export function mount(container, options = {}) {
  const byte = options.byte ?? 0;
  container.innerHTML = `
    <div class="nube-lectura">
      <span class="nube-cand">Cargando las trazas medidas…</span>
      <span class="nube-rho"><small>parecido</small><span class="roll">0,00</span></span>
    </div>
    <svg class="nube-svg" aria-hidden="true"></svg>
    <div class="nube-nota">
      <span><svg width="18" height="18" viewBox="-11 -11 22 22" aria-hidden="true"><path d="M0 -11L11 0L0 11L-11 0Z" fill="#1d1d1f"/></svg> media de cada columna</span>
      <span class="falso"></span>
    </div>`;
  container.setAttribute('role', 'img');
  const svg = container.querySelector('svg');
  const cand = container.querySelector('.nube-cand');
  const rho = container.querySelector('.roll');
  let current = options.static ? 1 : 0, view = null, disposed = false;

  function build(c) {
    // El instante t*: el pico del candidato correcto con todas las trazas.
    const correct = c.key[byte];
    const { at } = peaks(correlate(createAccumulator(c.nSamples).add(c), byte), c.nSamples);
    const t = at[correct];
    // Un falso corriente: el primero cuya |ρ| esté al nivel del azar.
    const typical = 1.2 / Math.sqrt(c.n);
    let wrong = correct;
    for (let i = 0; i < 256; i++) {
      wrong = (wrong + 37) & 255;
      if (wrong !== correct && Math.abs(cloud(c, byte, wrong, t).rho) < typical) break;
    }
    const states = [cloud(c, byte, wrong, t), cloud(c, byte, correct, t)];
    const ks = [wrong, correct];

    const W = svg.clientWidth || 980, H = svg.clientHeight || 560;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const L = 64, R = 16, T = 46, B = 84;
    let lo = Infinity, hi = -Infinity;
    for (const v of states[0].y) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const X = (v) => L + ((v + 0.6) / 9.2) * (W - L - R);
    const Y = (v) => T + (1 - (v - (lo - 0.8)) / (hi - lo + 1.6)) * (H - T - B);
    const spread = (X(1) - X(0)) * 0.62;

    for (let v = Math.ceil(lo); v <= hi; v++) {
      if ((v - Math.ceil(lo)) % 2) continue;
      svg.append(el('line', { class: 'eje', x1: L, x2: W - R, y1: Y(v), y2: Y(v), 'stroke-dasharray': '3 7' }));
      svg.append(el('text', { x: L - 14, y: Y(v) + 8, 'text-anchor': 'end' }, String(v)));
    }
    for (let w = 0; w <= 8; w++) svg.append(el('text', { x: X(w), y: H - B + 38, 'text-anchor': 'middle' }, String(w)));
    const xTitle = el('text', { x: (L + W - R) / 2, y: H - 8, 'text-anchor': 'middle' });
    xTitle.textContent = 'cuántos unos predice el candidato (de 0 a 8)';
    svg.append(xTitle);
    const offset = c.meta?.muestras?.[0] ?? 0;
    // Las lecturas son códigos del medidor de 8 bits; la muestra exacta va en la etiqueta accesible.
    svg.append(el('text', { x: L - 46, y: T - 18 }, 'lo que midió la placa (un número de 0 a 255)'));

    const dots = Array.from({ length: c.n }, (_, i) => {
      const d = el('circle', { class: 'punto', r: 6, cx: 0, cy: 0 });
      d.style.transitionDelay = `${Math.round((jitter(i) + 0.5) * 220)}ms`;
      svg.append(d);
      return d;
    });
    const line = el('path', { class: 'recta' });
    svg.append(line);
    const means = Array.from({ length: 9 }, () => {
      const m = el('path', { class: 'media', d: 'M0 -11L11 0L0 11L-11 0Z' });
      svg.append(m);
      return m;
    });

    // Posición de cada pieza en cada paso.
    const layout = states.map((s) => ({
      dots: Array.from({ length: s.n }, (_, i) => `translate(${(X(s.x[i]) + jitter(i) * spread).toFixed(1)}px, ${Y(s.y[i]).toFixed(1)}px)`),
      means: s.classes.map((m) => (m.count ? `translate(${X(m.hw).toFixed(1)}px, ${Y(m.mean).toFixed(1)}px)` : null)),
      line: `path("M${X(-0.4).toFixed(1)} ${Y(s.intercept - 0.4 * s.slope).toFixed(1)}L${X(8.4).toFixed(1)} ${Y(s.intercept + 8.4 * s.slope).toFixed(1)}")`,
    }));
    // En el paso del correcto se recuerda el falso: así el PDF también tiene el contraste.
    container.querySelector('.falso').textContent = `antes, el falso ${hex2(wrong)}: parecido ${es(Math.abs(states[0].rho), 2)}`;
    return { c, states, ks, dots, means, line, layout, t: offset + t, correct };
  }

  function show(n) {
    const v = view, s = v.states[n], lay = v.layout[n];
    container.dataset.pasoActual = String(n);
    v.dots.forEach((d, i) => { d.style.transform = lay.dots[i]; });
    v.means.forEach((m, i) => {
      m.style.visibility = lay.means[i] ? 'visible' : 'hidden';
      if (lay.means[i]) m.style.transform = lay.means[i];
    });
    v.line.style.d = lay.line;
    const k = v.ks[n];
    cand.innerHTML = `candidato <b>${hex2(k)}</b>${k === v.correct ? ', el correcto' : ', falso'}`;
    const value = es(Math.abs(s.rho), 2);
    if (options.static) rho.textContent = value;
    else roll(rho, value);
    container.setAttribute('aria-label', `Nube de ${s.n} trazas medidas en la muestra ${v.t}: el candidato ${hex2(k)} da un parecido de ${value}.`);
  }

  load().then((c) => {
    if (disposed) return;
    view = build(c);
    show(current);
    container.dataset.ready = '1';
  }).catch((err) => {
    cand.textContent = 'No se pudieron cargar las trazas medidas.';
    console.warn('nube:', err);
  });

  return {
    steps: 2,
    start() {},
    stop() {},
    step(n) { current = Math.max(0, Math.min(1, n)); if (view) show(current); },
    dispose() { disposed = true; container.replaceChildren(); },
  };
}
