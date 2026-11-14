// <cpa-dpa>: el DPA de un bit, por dentro. Se elige un candidato k para el
// byte 0 y un bit de SBox(p ⊕ k); las trazas simuladas se reparten en dos
// grupos según ese bit y se restan sus medias. Con el candidato correcto la
// diferencia tiene un pico en el instante de la S-box; con uno falso, no.
// Debajo, cuántos bytes acierta el DPA con ese bit y cuántos el CPA con las
// mismas trazas.
//
//   <cpa-dpa snr="0.1" n="2000" bit="0" k="0x00"></cpa-dpa>
//
// Hooks: data-k, data-bit, data-n, data-correct, data-guess (el candidato de
// mayor pico), data-rank (puesto del correcto en el byte 0), data-peak (pico
// del candidato elegido), data-dpa (bytes que acierta el DPA), data-cpa (los
// que acierta el CPA) y data-rendered. Pasos guiados: set({ k, bit, n }) y
// pick('best' | 'correct' | 'wrong').
import { NoteElement, define } from '../kit/base.js';
import { h, scaleLinear } from '../kit/svg.js';
import { controlsHTML } from '../kit/controls.js';
import { attachTip } from '../kit/tip.js';
import { simulate, firstCenter, LAB_KEY, CONFIG } from '../model/sim.js';
import { createAccumulator, attack } from '../model/cpa.js';
import { dpaAttack, groups } from '../model/dpa.js';
import { SBOX } from '../model/aes.js';
import { es, hex2, miles, plotWidth, linePath, SIM_BADGE } from './common.js';

export const DPA_STEPS = [100, 200, 500, 1000, 2000, 4000];
// Se ataca el byte 0 y se dibuja la traza simulada entera, como en <cpa-live>:
// el pico de un candidato puede caer en cualquier instante.
const BYTE = 0;
const L = 46, R = 14;

export class CpaDpa extends NoteElement {
  defaults() {
    const k = this.getAttribute('k');
    return { k: k == null ? 0 : Number(k) & 255, bit: this.attrNum('bit', 0) & 7, n: this.attrNum('n', 2000) };
  }

  build() {
    this.snr = this.attrNum('snr', 0.1);
    this.innerHTML = `
      <div class="fig dp">
        <div class="fig-head"><span class="fig-tool comp">Componente · explora</span>${SIM_BADGE}</div>
        <div class="controls dp-controls">
          ${controlsHTML({
            k: { type: 'range', label: 'candidato k', min: 0, max: 255, value: 0 },
            bit: { type: 'select', label: 'bit que se predice', options: Object.fromEntries(Array.from({ length: 8 }, (_, b) => [b, `bit ${b}`])), value: 0 },
            n: { type: 'range', label: 'trazas N', min: 0, max: DPA_STEPS.length - 1, value: 4 },
          })}
          <button type="button" class="dp-best">elegir el de mayor pico</button>
        </div>
        <div class="legend dp-legend"></div>
        <svg class="dp-means" role="img" aria-label="Traza media de cada grupo"></svg>
        <p class="cl-sub dp-sub"></p>
        <svg class="dp-diff" role="img" aria-label="Diferencia de las medias de los dos grupos"></svg>
        <div class="dp-rows"></div>
        <div class="out dp-out"></div>
      </div>`;
    const $ = (s) => this.querySelector(s);
    this.$ = $;
    const onInput = (e) => {
      const key = e.target.dataset.k;
      if (key === 'k') this.set({ k: +e.target.value });
      if (key === 'bit') this.set({ bit: +e.target.value });
      if (key === 'n') this.set({ n: DPA_STEPS[+e.target.value] });
    };
    $('.dp-controls').addEventListener('input', onInput);
    $('.dp-controls').addEventListener('change', onInput);
    $('.dp-best').addEventListener('click', () => this.pick('best'));
    this.campaign = simulate({ n: DPA_STEPS[DPA_STEPS.length - 1], snr: this.snr, key: LAB_KEY, seed: CONFIG.seed });
    this.cache = new Map();
    attachTip($('.dp-diff'), (ev) => this.tip(ev));
  }

  // El ataque completo (16 bytes) con N trazas y un bit; el CPA, una vez por N.
  results(n, bit) {
    const id = `${n}|${bit}`;
    if (!this.cache.has(id)) {
      if (!this.cache.has(n)) {
        const acc = createAccumulator(this.campaign.nSamples).add(this.campaign, 0, n);
        this.cache.set(n, { acc, cpa: attack(acc, this.campaign.key).map((r) => r.rank === 1) });
      }
      const { acc, cpa } = this.cache.get(n);
      this.cache.set(id, { acc, cpa, dpa: dpaAttack(acc, bit, this.campaign.key) });
    }
    return this.cache.get(id);
  }

  // Atajos de los pasos guiados: el candidato de mayor pico (lo que elegiría el
  // atacante), el correcto o uno falso cualquiera.
  pick(which) {
    const { n, bit, k } = this.model.get();
    const r = this.results(n, bit).dpa[BYTE];
    if (which === 'best') this.set({ k: r.guess });
    else if (which === 'correct') this.set({ k: r.correct });
    else this.set({ k: (k ^ 0x55) === r.correct ? k ^ 0x33 : k ^ 0x55 });
  }

  render() {
    const st = this.model.get();
    const n = DPA_STEPS.reduce((b, s) => (Math.abs(s - st.n) < Math.abs(b - st.n) ? s : b), DPA_STEPS[0]);
    const { k, bit } = st;
    const { acc, cpa, dpa } = this.results(n, bit);
    const r = dpa[BYTE], S = acc.nSamples, g = groups(acc, BYTE, bit, k);
    this.r = r; this.S = S;
    const $ = this.$;
    $('[data-k="k"]').value = k; $('[data-o="k"]').textContent = hex2(k);
    $('[data-k="bit"]').value = String(bit);
    $('[data-k="n"]').value = DPA_STEPS.indexOf(n); $('[data-o="n"]').textContent = miles(n);
    $('.dp-legend').innerHTML = `<span><i class="lk dp-lk1"></i>grupo 1: las ${miles(g.n1)} trazas en las que el candidato predice bit ${bit} = 1</span>
      <span><i class="lk dp-lk0"></i>grupo 0: las ${miles(g.n0)} en las que predice 0</span>`;
    $('.dp-sub').innerHTML = `Diferencia de las dos medias, Δ(k, t), con el candidato ${hex2(k)} resaltado sobre los otros 255:`;
    this.drawMeans(g);
    this.drawDiff(r, k, S);

    const dpaOk = dpa.filter((x) => x.rank === 1).length, cpaOk = cpa.filter(Boolean).length;
    const row = (label, flags, count) => `<div class="dp-row"><span class="dp-rowlabel">${label}</span>
      <span class="dp-cells">${flags.map((ok) => `<i class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'}</i>`).join('')}</span>
      <span class="cl-count"><b>${count}</b> de 16 bytes</span></div>`;
    $('.dp-rows').innerHTML = `<p class="cl-sub">El mismo ataque en los 16 bytes de la clave, con las mismas ${miles(n)} trazas:</p>`
      + row(`DPA con el bit ${bit}`, dpa.map((x) => x.rank === 1), dpaOk) + row('CPA (los 8 bits)', cpa, cpaOk);

    const peak = r.peak[k], at = r.at[k], isCorrect = k === r.correct, isBest = k === r.guess;
    const verdict = isBest
      ? (isCorrect ? 'Es el mayor pico de los 256 candidatos y además es el correcto: con este bit, el DPA acierta el byte 0.'
        : `Es el mayor pico de los 256, así que el DPA lo elegiría, pero es falso: el correcto, ${hex2(r.correct)}, se queda en el puesto ${r.rank}.`)
      : (isCorrect ? `Es el candidato correcto, pero no gana: queda en el puesto ${r.rank} y el DPA elegiría ${hex2(r.guess)}.`
        : `No destaca: queda en el puesto ${1 + Array.from(r.peak).filter((v) => v > peak).length} de 256.`);
    $('.dp-out').innerHTML = `Candidato <b>${hex2(k)}</b>, bit ${bit}, byte 0: la mayor diferencia entre los dos grupos es <b>${es(peak, 2)}</b>, en t = ${at}. ${verdict}`;

    Object.assign(this.dataset, { k: String(k), bit: String(bit), n: String(n), correct: String(r.correct), guess: String(r.guess),
      rank: String(r.rank), peak: peak.toFixed(4), dpa: String(dpaOk), cpa: String(cpaOk) });
    this.markRendered();
  }

  axes(svg, H, T, B, y, ticks, fmt) {
    const W = plotWidth();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const S = this.S, x = scaleLinear([0, S - 1], [L, W - R]);
    const g = [];
    for (const v of ticks) {
      g.push(h('line', { class: 'grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      g.push(h('text', { class: 'ax ax-r', x: L - 6, y: y(v) + 3.5 }, fmt(v)));
    }
    for (let t = 0; t < S; t += W > 500 ? 16 : 32) g.push(h('text', { class: 'ax ax-m', x: x(t), y: H - B + 16 }, t));
    const t0 = firstCenter(BYTE);
    g.push(h('rect', { class: 'win', x: x(t0 - 1.5), width: x(t0 + 1.5) - x(t0 - 1.5), y: T, height: H - B - T }));
    return { W, x, g };
  }

  drawMeans(gr) {
    const svg = this.$('.dp-means'), H = 190, T = 22, B = 26;
    // Las medias de los grupos son la traza media ± ruido: entre −1 y 6 con cualquier N de la figura.
    const lo = -1.5, hi = 6.5, y = scaleLinear([lo, hi], [H - B, T]);
    const { W, x, g } = this.axes(svg, H, T, B, y, [0, 2, 4, 6], (v) => es(v, 0));
    const cl = (v) => Math.max(lo, Math.min(hi, v));
    g.push(h('text', { class: 'ax', x: 6, y: T - 10 }, 'consumo medio de cada grupo'));
    // Las dos mesetas de la traza simulada: la primera ronda y la última.
    g.push(h('text', { class: 'ax ax-m', x: x(firstCenter(7.5)), y: y(5.4) }, 'primera ronda'));
    g.push(h('text', { class: 'ax ax-m', x: x(CONFIG.lastStart + CONFIG.lastSpacing * 7.5), y: y(5.4) }, 'última ronda'));
    g.push(h('path', { class: 'dp-l0', d: linePath(this.S, x, (t) => y(cl(gr.mean0[t]))) }));
    g.push(h('path', { class: 'dp-l1', d: linePath(this.S, x, (t) => y(cl(gr.mean1[t]))) }));
    g.push(h('rect', { class: 'hit', x: 0, y: 0, width: W, height: H }));
    svg.replaceChildren(...g);
  }

  drawDiff(r, k, S) {
    const svg = this.$('.dp-diff'), H = 200, T = 14, B = 34;
    // Escala fija: con el candidato correcto la diferencia ideal es 1 (un bit de
    // diferencia entre los grupos); con pocas trazas el ruido la supera.
    let top = 1.5;
    for (let c = 0; c < 256; c++) top = Math.max(top, r.peak[c]);
    top = Math.min(4, Math.ceil(top * 2) / 2);
    const y = scaleLinear([-top, top], [H - B, T]);
    const ticks = top <= 2 ? [-top, -top / 2, 0, top / 2, top] : [-top, 0, top];
    const { W, x, g } = this.axes(svg, H, T, B, y, ticks, (v) => es(v, 2));
    this.x = x; this.W = W;
    g.push(h('text', { class: 'ax ax-m', x: (L + W - R) / 2, y: H - 4 }, 'instante t (muestra)'));
    const cl = (v) => Math.max(-top, Math.min(top, v));
    let gray = '';
    for (let c = 0; c < 256; c++) {
      if (c === k) continue;
      gray += linePath(S, x, (t) => y(cl(r.diff[c * S + t])));
    }
    g.push(h('path', { class: 'l-gray', d: gray }));
    g.push(h('line', { class: 'ref', x1: L, x2: W - R, y1: y(0), y2: y(0) }));
    g.push(h('path', { class: 'l-ok', d: linePath(S, x, (t) => y(cl(r.diff[k * S + t]))) }));
    g.push(h('line', { class: 'cross', x1: -10, x2: -10, y1: T, y2: H - B }));
    g.push(h('rect', { class: 'hit', x: 0, y: 0, width: W, height: H }));
    svg.replaceChildren(...g);
  }

  tip(ev) {
    const svg = this.$('.dp-diff'), box = svg.getBoundingClientRect(), W = this.W;
    if (!this.r) return '';
    const px = ((ev.clientX - box.left) / box.width) * W;
    if (px < L || px > W - R) return '';
    const t = Math.max(0, Math.min(this.S - 1, Math.round(this.x.invert(px))));
    const cross = svg.querySelector('.cross');
    cross.setAttribute('x1', this.x(t)); cross.setAttribute('x2', this.x(t));
    const { k } = this.model.get(), r = this.r, S = this.S;
    let big = 0, bk = 0;
    for (let c = 0; c < 256; c++) {
      const a = Math.abs(r.diff[c * S + t]);
      if (c !== k && a > big) { big = a; bk = c; }
    }
    const div = document.createElement('div');
    div.innerHTML = `<b>t = ${t}</b><br><i class="lk lk-ok"></i><b>${es(r.diff[k * S + t], 2)}</b> candidato ${hex2(k)}${k === r.correct ? ' (correcto)' : ''}<br><i class="lk lk-gray"></i><b>${es(big, 2)}</b> el mayor de los otros (${hex2(bk)}${bk === r.correct ? ', el correcto' : ''})`;
    return div;
  }
}

// Para los tests: el bit que predice un candidato para un texto claro.
export const predictedBit = (p, k, bit) => (SBOX[p ^ k] >> bit) & 1;

define('cpa-dpa', CpaDpa);
