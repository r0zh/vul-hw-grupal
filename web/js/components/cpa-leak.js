// <cpa-leak>: de dónde sale la fuga. Un byte de texto claro p y uno de clave
// k pasan por XOR y S-box; el peso de Hamming del resultado es lo que el
// modelo predice que se ve en el consumo. Debajo, la traza media de cada clase
// de HW sobre muchas trazas simuladas: las 9 medias solo se separan en el
// instante de la S-box.
//
//   <cpa-leak p="0x32" k="0x2b"></cpa-leak>
//
// Hooks: data-p, data-k, data-sbox, data-hw, data-order (las 9 medias en el
// instante de la S-box, ordenadas) y data-rendered.
import { NoteElement, define } from '../kit/base.js';
import { h, scaleLinear, niceTicks } from '../kit/svg.js';
import { controlsHTML } from '../kit/controls.js';
import { attachTip } from '../kit/tip.js';
import { SBOX, HW } from '../model/aes.js';
import { simulate, firstCenter, CONFIG } from '../model/sim.js';
import { es, hex2, SIM_BADGE } from './common.js';

// Campaña de las medias por clase: SNR = 1 para que las clases extremas
// (HW 0 y 8 salen en 1 de cada 256 trazas) tengan una media legible.
export const LEAK_TRACES = 20000, LEAK_SNR = 1, LEAK_WINDOW = 47;

// Traza media de cada clase de HW del byte 0 (solo las LEAK_WINDOW primeras
// muestras: la primera ronda). Modelo puro, se prueba en Node.
export function classMeans(c, byte = 0, width = LEAK_WINDOW) {
  const S = c.nSamples, sum = Array.from({ length: 9 }, () => new Float64Array(width)), cnt = new Array(9).fill(0);
  for (let i = 0; i < c.n; i++) {
    const w = HW[SBOX[c.plaintexts[16 * i + byte] ^ c.key[byte]]];
    cnt[w]++;
    for (let t = 0; t < width; t++) sum[w][t] += c.traces[i * S + t];
  }
  return sum.map((s, w) => ({ hw: w, count: cnt[w], mean: s.map((v) => v / Math.max(1, cnt[w])) }));
}

const bits = (v) => v.toString(2).padStart(8, '0');
const W = 720, H = 220, L = 46, R = 64, T = 12, B = 34;

export class CpaLeak extends NoteElement {
  defaults() {
    const num = (name, d) => { const v = this.getAttribute(name); return v == null ? d : Number(v) & 255; };
    return { p: num('p', 0x32), k: num('k', 0x2b) };
  }

  build() {
    this.innerHTML = `
      <div class="fig lx">
        <div class="fig-head"><span class="fig-tool comp">Componente · explora</span></div>
        <div class="controls lx-controls">${controlsHTML({
          p: { type: 'range', label: 'texto claro p', min: 0, max: 255, value: 0 },
          k: { type: 'range', label: 'clave k', min: 0, max: 255, value: 0 },
        })}</div>
        <div class="lx-pipe" aria-live="polite"></div>
        <div class="fig-head lx-head2"><span class="cl-sub">Traza media de cada clase de HW, con ${LEAK_TRACES} trazas (SNR = ${LEAK_SNR}):</span>${SIM_BADGE}</div>
        <div class="legend lx-legend"></div>
        <svg class="lx-means" viewBox="0 0 ${W} ${H}" role="img" aria-label="Traza media por clase de peso de Hamming"></svg>
        <div class="out lx-out"></div>
      </div>`;
    this.querySelector('.lx-controls').addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (k) this.set({ [k]: +e.target.value });
    });
    // La campaña se genera una vez: las medias por clase no dependen de qué
    // clave concreta se use, solo de agrupar por HW.
    this.means = classMeans(simulate({ n: LEAK_TRACES, snr: LEAK_SNR, seed: CONFIG.seed }));
    attachTip(this.querySelector('.lx-means'), (ev) => this.tip(ev));
  }

  render() {
    const { p, k } = this.model.get();
    const u = p ^ k, s = SBOX[u], w = HW[s];
    for (const [key, v] of Object.entries({ p, k })) {
      this.querySelector(`[data-k="${key}"]`).value = v;
      this.querySelector(`[data-o="${key}"]`).textContent = hex2(v);
    }
    const cells = [...bits(s)].map((b) => `<i class="bit b${b}">${b}</i>`).join('');
    this.querySelector('.lx-pipe').innerHTML = `
      <span class="box"><small>p</small>${hex2(p)}</span><span class="op">⊕</span>
      <span class="box"><small>k</small>${hex2(k)}</span><span class="op">=</span>
      <span class="box"><small>p ⊕ k</small>${hex2(u)}</span><span class="op">→ S-box →</span>
      <span class="box"><small>SBox(p ⊕ k) = ${hex2(s)}</small><span class="bits">${cells}</span></span><span class="op">→</span>
      <span class="box hw"><small>HW</small><b>${w}</b></span>
      <span class="meter" title="consumo previsto: ${w} de 8"><span style="height:${(w / 8) * 100}%"></span></span>`;
    this.drawMeans(w);
    const t0 = firstCenter(0);
    const order = this.means.map((m) => m.mean[t0]);
    this.querySelector('.lx-out').innerHTML = `SBox(${hex2(p)} ⊕ ${hex2(k)}) = SBox(${hex2(u)}) = <b>${hex2(s)}</b>, que tiene <b>${w}</b> bits a 1.
      En las trazas cuyo byte 0 tiene HW = ${w}, la media en t = ${t0} es ${es(order[w], 2)}; con HW = 0 es ${es(order[0], 2)} y con HW = 8, ${es(order[8], 2)}.
      A partir de t = 16 se suman las S-box de los otros bytes, cuya media es la misma en todas las clases.`;
    Object.assign(this.dataset, { p: String(p), k: String(k), sbox: String(s), hw: String(w), order: order.map((v) => v.toFixed(3)).join(',') });
    this.markRendered();
  }

  drawMeans(active) {
    const svg = this.querySelector('.lx-means'), t0 = firstCenter(0);
    const lo = Math.min(...this.means.flatMap((m) => [...m.mean])), hi = Math.max(...this.means.flatMap((m) => [...m.mean]));
    const x = scaleLinear([0, LEAK_WINDOW - 1], [L, W - R]), y = scaleLinear([Math.floor(lo) - 0.5, Math.ceil(hi) + 0.5], [H - B, T]);
    this.x = x;
    const g = [];
    for (const v of niceTicks(Math.floor(lo) - 0.5, Math.ceil(hi) + 0.5, 4)) {
      g.push(h('line', { class: 'grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      g.push(h('text', { class: 'ax ax-r', x: L - 6, y: y(v) + 3.5 }, es(v, 1)));
    }
    for (let t = 0; t < LEAK_WINDOW; t += 8) g.push(h('text', { class: 'ax ax-m', x: x(t), y: H - B + 16 }, t));
    g.push(h('text', { class: 'ax ax-m', x: (L + W - R) / 2, y: H - 4 }, 'instante t (muestra)'));
    g.push(h('rect', { class: 'win', x: x(t0 - 1.5), width: x(t0 + 1.5) - x(t0 - 1.5), y: T, height: H - B - T }));
    for (const m of this.means) {
      const d = [...m.mean].map((v, t) => `${t ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('');
      g.push(h('path', { class: `l-hw${m.hw === active ? ' on' : ''}`, d, style: `--mix:${25 + 75 * (m.hw / 8)}%` }));
    }
    // Etiquetas solo en los extremos y en la clase activa. A la derecha de la
    // ventana las medias forman una meseta (los otros bytes) y a la izquierda
    // están todas en 0: cada etiqueta va al lado que tiene libre.
    const plateau = this.means[4].mean[t0 + 4], floor = this.means[4].mean[t0 - 4];
    for (const m of this.means) {
      if (m.hw !== 0 && m.hw !== 8 && m.hw !== active) continue;
      const v = m.mean[t0], right = Math.abs(v - plateau) > Math.abs(v - floor);
      g.push(h('text', { class: `lab${m.hw === active ? ' on' : ''}`, x: right ? x(t0 + 1.5) + 6 : x(t0 - 1.5) - 6,
        y: y(v) + 4, 'text-anchor': right ? 'start' : 'end' }, `HW ${m.hw}`));
    }
    g.push(h('line', { class: 'cross', x1: -10, x2: -10, y1: T, y2: H - B }));
    // Zona de hover: todo el SVG, así ningún texto queda a caballo de su borde.
    g.push(h('rect', { class: 'hit', x: 0, y: 0, width: W, height: H }));
    svg.replaceChildren(...g);
    this.querySelector('.lx-legend').innerHTML = this.means.map((m) =>
      `<span${m.hw === active ? ' class="on"' : ''}><i class="lx-sw" style="--mix:${25 + 75 * (m.hw / 8)}%"></i>${m.hw}</span>`).join('') + '<span class="muted">peso de Hamming del byte 0 tras la S-box</span>';
  }

  tip(ev) {
    const svg = this.querySelector('.lx-means'), box = svg.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    if (px < L || px > W - R) return '';
    const t = Math.round(this.x.invert(px));
    const cross = svg.querySelector('.cross');
    cross.setAttribute('x1', this.x(t)); cross.setAttribute('x2', this.x(t));
    const div = document.createElement('div');
    div.innerHTML = `<b>t = ${t}</b><br>` + this.means.slice().reverse().map((m) =>
      `<i class="lx-sw" style="--mix:${25 + 75 * (m.hw / 8)}%"></i><b>${es(m.mean[t], 2)}</b> HW ${m.hw} <span class="muted">(${m.count} trazas)</span>`).join('<br>');
    return div;
  }
}

define('cpa-leak', CpaLeak);
