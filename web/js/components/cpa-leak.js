// <cpa-leak>: de dónde sale la fuga. Un byte de texto claro p y uno de clave
// k pasan por XOR y S-box; el peso de Hamming del resultado es lo que el
// modelo predice que se ve en el consumo. Debajo, la traza media de cada clase
// de HW sobre las N primeras trazas simuladas: con N = 1 es una traza suelta,
// puro ruido; al promediar muchas, las 9 medias se ordenan de 0 a 8 justo en
// el instante de la S-box.
//
//   <cpa-leak p="0x32" k="0x2b"></cpa-leak>
//
// Hooks: data-p, data-k, data-sbox, data-hw, data-n, data-order (las 9 medias
// en el instante de la S-box; vacío si falta alguna clase), data-classes
// (clases con alguna traza) y data-rendered. Pasos guiados: set({ p, k, n }).
import { NoteElement, define } from '../kit/base.js';
import { h, scaleLinear } from '../kit/svg.js';
import { controlsHTML } from '../kit/controls.js';
import { attachTip } from '../kit/tip.js';
import { SBOX, HW } from '../model/aes.js';
import { simulate, firstCenter, CONFIG } from '../model/sim.js';
import { es, hex2, miles, plotWidth, linePath, SIM_BADGE } from './common.js';

// Campaña de las medias por clase: SNR = 1 para que las clases extremas
// (HW 0 y 8 salen en 1 de cada 256 trazas) tengan una media legible.
export const LEAK_TRACES = 20000, LEAK_SNR = 1, LEAK_WINDOW = 47;
// Pasos del deslizador de trazas promediadas.
export const LEAK_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 20000];

// Traza media de cada clase de HW del byte `byte` con las n primeras trazas
// (solo las `width` primeras muestras: la primera ronda). Una clase sin trazas
// tiene count = 0 y no se dibuja. Modelo puro, se prueba en Node.
export function classMeans(c, byte = 0, width = LEAK_WINDOW, n = c.n) {
  const S = c.nSamples, sum = Array.from({ length: 9 }, () => new Float64Array(width)), cnt = new Array(9).fill(0);
  for (let i = 0; i < n; i++) {
    const w = HW[SBOX[c.plaintexts[16 * i + byte] ^ c.key[byte]]];
    cnt[w]++;
    for (let t = 0; t < width; t++) sum[w][t] += c.traces[i * S + t];
  }
  return sum.map((s, w) => ({ hw: w, count: cnt[w], mean: s.map((v) => v / Math.max(1, cnt[w])) }));
}

const bits = (v) => v.toString(2).padStart(8, '0');
const H = 230, L = 46, R = 58, T = 12, B = 34;
// Escala vertical fija: caben una traza suelta (ruido de ±3,5 con SNR = 1) y
// las medias, así que al subir N se ve cómo el ruido se encoge sin que el eje cambie.
const Y_MIN = -4, Y_MAX = 12;

export class CpaLeak extends NoteElement {
  defaults() {
    const num = (name, d) => { const v = this.getAttribute(name); return v == null ? d : Number(v) & 255; };
    return { p: num('p', 0x32), k: num('k', 0x2b), n: this.attrNum('n', LEAK_TRACES) };
  }

  build() {
    this.innerHTML = `
      <div class="fig lx">
        <div class="fig-head"><span class="fig-tool comp">Componente · explora</span>${SIM_BADGE}</div>
        <div class="controls lx-controls">${controlsHTML({
          p: { type: 'range', label: 'texto claro p', min: 0, max: 255, value: 0 },
          k: { type: 'range', label: 'clave k', min: 0, max: 255, value: 0 },
        })}</div>
        <div class="lx-pipe" aria-live="polite"></div>
        <div class="controls lx-ncontrols">${controlsHTML({
          n: { type: 'range', label: 'trazas que se promedian', min: 0, max: LEAK_STEPS.length - 1, value: LEAK_STEPS.length - 1 },
        })}</div>
        <p class="cl-sub lx-title"></p>
        <div class="legend lx-legend"></div>
        <svg class="lx-means" role="img" aria-label="Traza media por clase de peso de Hamming"></svg>
        <div class="out lx-out"></div>
      </div>`;
    this.addEventListener('input', (e) => {
      const k = e.target.dataset?.k;
      if (k === 'n') this.set({ n: LEAK_STEPS[+e.target.value] });
      else if (k) this.set({ [k]: +e.target.value });
    });
    // La campaña se genera una vez: las medias por clase no dependen de qué
    // clave concreta se use, solo de agrupar por HW.
    this.campaign = simulate({ n: LEAK_TRACES, snr: LEAK_SNR, seed: CONFIG.seed });
    this.cache = new Map();
    attachTip(this.querySelector('.lx-means'), (ev) => this.tip(ev));
  }

  meansFor(n) {
    if (!this.cache.has(n)) this.cache.set(n, classMeans(this.campaign, 0, LEAK_WINDOW, n));
    return this.cache.get(n);
  }

  render() {
    const { p, k } = this.model.get();
    const n = Math.max(1, Math.min(LEAK_TRACES, Math.round(this.model.value('n'))));
    const u = p ^ k, s = SBOX[u], w = HW[s];
    for (const [key, v] of Object.entries({ p, k })) {
      this.querySelector(`[data-k="${key}"]`).value = v;
      this.querySelector(`[data-o="${key}"]`).textContent = hex2(v);
    }
    const nIn = this.querySelector('[data-k="n"]');
    nIn.value = LEAK_STEPS.reduce((b, st, i) => (Math.abs(st - n) < Math.abs(LEAK_STEPS[b] - n) ? i : b), 0);
    this.querySelector('[data-o="n"]').textContent = miles(n);
    const cells = [...bits(s)].map((b) => `<i class="bit b${b}">${b}</i>`).join('');
    this.querySelector('.lx-pipe').innerHTML = `
      <span class="box"><small>p</small>${hex2(p)}</span><span class="op">⊕</span>
      <span class="box"><small>k</small>${hex2(k)}</span><span class="op">=</span>
      <span class="box"><small>p ⊕ k</small>${hex2(u)}</span><span class="op">→ S-box →</span>
      <span class="box"><small>SBox(p ⊕ k) = ${hex2(s)}</small><span class="bits">${cells}</span></span><span class="op">→</span>
      <span class="box hw"><small>HW</small><b>${w}</b></span>
      <span class="meter" title="consumo previsto: ${w} de 8"><span style="height:${(w / 8) * 100}%"></span></span>`;
    const means = this.meansFor(n);
    this.means = means;
    this.drawMeans(means, w);
    const t0 = firstCenter(0);
    const present = means.filter((m) => m.count > 0);
    const order = means.map((m) => m.mean[t0]);
    const one = n === 1;
    this.querySelector('.lx-title').textContent = one
      ? 'Una sola traza simulada (SNR = 1). Su byte 0 tiene el peso de Hamming que marca la leyenda:'
      : `Traza media de cada clase de HW, con las ${miles(n)} primeras trazas simuladas (SNR = 1):`;
    const active = means[w];
    const first = `SBox(${hex2(p)} ⊕ ${hex2(k)}) = SBox(${hex2(u)}) = <b>${hex2(s)}</b>, que tiene <b>${w}</b> bits a 1.`;
    let second;
    if (one) {
      second = `Con una sola traza no hay nada que promediar: lo que se ve es casi todo ruido, y de ahí no se lee el peso de Hamming (era ${present[0].hw}).`;
    } else if (!active.count) {
      second = `Entre ${miles(n)} trazas todavía no hay ninguna con HW = ${w} en el byte 0: los pesos extremos son raros (HW 0 y HW 8 salen en 1 de cada 256).`;
    } else if (present.length < 9) {
      second = `Con ${miles(n)} trazas hay ${present.length} clases de 9, y las medias aún bailan: la de HW = ${w} en t = ${t0} vale ${es(order[w], 2)} con ${active.count} ${active.count === 1 ? 'traza' : 'trazas'}.`;
    } else {
      second = `En las ${miles(active.count)} trazas cuyo byte 0 tiene HW = ${w}, la media en t = ${t0} es ${es(order[w], 2)}; con HW = 0 es ${es(order[0], 2)} y con HW = 8, ${es(order[8], 2)}.
      A partir de t = 16 se suman las S-box de los otros bytes, cuya media es la misma en todas las clases.`;
    }
    this.querySelector('.lx-out').innerHTML = `${first} ${second}`;
    Object.assign(this.dataset, { p: String(p), k: String(k), sbox: String(s), hw: String(w), n: String(n),
      classes: String(present.length), order: present.length === 9 ? order.map((v) => v.toFixed(3)).join(',') : '' });
    this.markRendered();
  }

  drawMeans(means, active) {
    const svg = this.querySelector('.lx-means'), t0 = firstCenter(0), W = plotWidth();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.W = W;
    const x = scaleLinear([0, LEAK_WINDOW - 1], [L, W - R]), y = scaleLinear([Y_MIN, Y_MAX], [H - B, T]);
    this.x = x;
    const clamp = (v) => Math.max(Y_MIN, Math.min(Y_MAX, v));
    const g = [];
    for (const v of [-4, 0, 4, 8, 12]) {
      g.push(h('line', { class: 'grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      g.push(h('text', { class: 'ax ax-r', x: L - 6, y: y(v) + 3.5 }, es(v, 1)));
    }
    for (let t = 0; t < LEAK_WINDOW; t += 8) g.push(h('text', { class: 'ax ax-m', x: x(t), y: H - B + 16 }, t));
    g.push(h('text', { class: 'ax ax-m', x: (L + W - R) / 2, y: H - 4 }, 'instante t (muestra)'));
    g.push(h('rect', { class: 'win', x: x(t0 - 1.5), width: x(t0 + 1.5) - x(t0 - 1.5), y: T, height: H - B - T }));
    const shown = means.filter((m) => m.count > 0);
    for (const m of shown) {
      const d = linePath(LEAK_WINDOW, x, (t) => y(clamp(m.mean[t])));
      g.push(h('path', { class: `l-hw${m.hw === active ? ' on' : ''}`, d, style: `--mix:${25 + 75 * (m.hw / 8)}%` }));
    }
    // Etiquetas solo en los extremos que haya y en la clase activa. A la derecha
    // de la franja las medias forman una meseta en 4 (los otros bytes) y a la
    // izquierda están todas en 0: cada etiqueta va al lado que tiene libre. Si
    // dos caen en el mismo lado a menos de una línea, la segunda no se escribe.
    const lo = shown[0], hi = shown[shown.length - 1];
    const labelled = shown.filter((m) => m === lo || m === hi || m.hw === active);
    const used = { true: [], false: [] };
    for (const m of labelled.sort((a, b) => (b.hw === active) - (a.hw === active))) {
      const v = clamp(m.mean[t0]), right = Math.abs(v - 4) > Math.abs(v), yy = y(v) + 4;
      if (used[right].some((o) => Math.abs(o - yy) < 13)) continue;
      used[right].push(yy);
      g.push(h('text', { class: `lab${m.hw === active ? ' on' : ''}`, x: right ? x(t0 + 1.5) + 6 : x(t0 - 1.5) - 6,
        y: yy, 'text-anchor': right ? 'start' : 'end' }, `HW ${m.hw}`));
    }
    g.push(h('line', { class: 'cross', x1: -10, x2: -10, y1: T, y2: H - B }));
    // Zona de hover: todo el SVG, así ningún texto queda a caballo de su borde.
    g.push(h('rect', { class: 'hit', x: 0, y: 0, width: W, height: H }));
    svg.replaceChildren(...g);
    this.querySelector('.lx-legend').innerHTML = means.map((m) =>
      `<span class="${m.hw === active ? 'on' : ''}${m.count ? '' : ' off'}"><i class="lx-sw" style="--mix:${25 + 75 * (m.hw / 8)}%"></i>${m.hw}</span>`).join('')
      + '<span class="muted">peso de Hamming del byte 0 tras la S-box</span>';
  }

  tip(ev) {
    const svg = this.querySelector('.lx-means'), box = svg.getBoundingClientRect(), W = this.W;
    const px = ((ev.clientX - box.left) / box.width) * W;
    if (px < L || px > W - R || !this.means) return '';
    const t = Math.max(0, Math.min(LEAK_WINDOW - 1, Math.round(this.x.invert(px))));
    const cross = svg.querySelector('.cross');
    cross.setAttribute('x1', this.x(t)); cross.setAttribute('x2', this.x(t));
    const div = document.createElement('div');
    div.innerHTML = `<b>t = ${t}</b><br>` + this.means.filter((m) => m.count > 0).reverse().map((m) =>
      `<i class="lx-sw" style="--mix:${25 + 75 * (m.hw / 8)}%"></i><b>${es(m.mean[t], 2)}</b> HW ${m.hw} <span class="muted">(${m.count} ${m.count === 1 ? 'traza' : 'trazas'})</span>`).join('<br>');
    return div;
  }
}

define('cpa-leak', CpaLeak);
