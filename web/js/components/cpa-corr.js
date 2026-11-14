// <cpa-corr>: qué significa «correlacionar». Una sola casilla del CPA: un
// candidato k para el byte 0 y un instante t. Cada traza medida es un punto:
// en horizontal, el consumo que predice el candidato, HW(SBox(p ⊕ k)); en
// vertical, lo que midió la placa en ese instante. Si el candidato es el
// correcto y el instante es el de su S-box, la nube sube; si no, queda plana.
//
//   <cpa-corr src="./data/nano-tinyaes.json"></cpa-corr>
//
// Hooks: data-k, data-t (muestra de la traza completa), data-rho, data-slope,
// data-correct, data-leak (muestra del pico del correcto), data-n y
// data-rendered. Pasos guiados: set({ k, t }) y pick('correct' | 'wrong' |
// 'leak' | 'away').
import { NoteElement, define } from '../kit/base.js';
import { h, scaleLinear, niceTicks } from '../kit/svg.js';
import { controlsHTML } from '../kit/controls.js';
import { createAccumulator, attack, cloud, fromCampaignJSON } from '../model/cpa.js';
import { simulate } from '../model/sim.js';
import { SBOX } from '../model/aes.js';
import { es, hex2, plotWidth, SIM_BADGE, REAL_BADGE } from './common.js';

const BYTE = 0, ROWS = 5;
const L = 50, R = 14, H = 290, T = 18, B = 40;
// Separación horizontal fija de cada punto dentro de su columna, para que las
// trazas con la misma predicción y la misma lectura no se tapen. Sale de la
// proporción áurea: reparte bien y no depende del azar.
const jitter = (i) => ((i * 0.6180339887) % 1) - 0.5;

export class CpaCorr extends NoteElement {
  defaults() { return { k: null, t: null }; }

  build() {
    this.innerHTML = `
      <div class="fig cc">
        <div class="fig-head"><span class="fig-tool comp">Componente · explora</span><span class="cc-badge"></span></div>
        <div class="controls cc-controls">${controlsHTML({
          k: { type: 'range', label: 'candidato k', min: 0, max: 255, value: 0 },
          t: { type: 'range', label: 'instante', min: 0, max: 1, value: 0 },
        })}</div>
        <p class="cl-sub cc-tlabel"></p>
        <div class="cc-tablewrap"><table class="cc-table"></table></div>
        <p class="cl-sub cc-plabel"></p>
        <svg class="cc-plot" role="img" aria-label="Predicción del candidato frente a la medida, una traza por punto"></svg>
        <div class="out cc-out"></div>
      </div>`;
    this.$ = (s) => this.querySelector(s);
    this.addEventListener('input', (e) => {
      const key = e.target.dataset?.k;
      if (key === 'k') this.set({ k: +e.target.value });
      if (key === 't') this.set({ t: +e.target.value });
    });
    const src = this.getAttribute('src');
    if (src) {
      fetch(src).then((r) => r.json()).then((obj) => this.setCampaign(fromCampaignJSON(obj)))
        .catch((err) => { this.$('.cc-out').textContent = `No se pudo cargar ${src}: ${err.message}`; });
    } else {
      this.setCampaign(simulate({ n: 400, snr: 1 }));
    }
  }

  setCampaign(c) {
    this.campaign = c;
    // El candidato correcto y el instante de su S-box, para los atajos.
    const r = attack(createAccumulator(c.nSamples).add(c), c.key)[BYTE];
    this.correct = r.correct ?? r.guess;
    this.leak = r.at[this.correct];
    this.$('[data-k="t"]').max = c.nSamples - 1;
    this.set({ k: this.model.value('k') ?? this.correct, t: this.model.value('t') ?? this.leak });
  }

  pick(which) {
    const { k, t } = this.model.get();
    if (which === 'correct') this.set({ k: this.correct });
    if (which === 'wrong') {
      // El siguiente candidato falso con una correlación corriente para un
      // falso (del orden de 1/√N), no uno que el azar haya dejado más alto.
      const typical = 1.2 / Math.sqrt(this.campaign.n);
      let w = k;
      for (let i = 0; i < 256; i++) {
        w = (w + 37) & 255;
        if (w !== this.correct && Math.abs(cloud(this.campaign, BYTE, w, t).rho) < typical) break;
      }
      this.set({ k: w });
    }
    if (which === 'leak') this.set({ t: this.leak });
    if (which === 'away') this.set({ t: (t + Math.floor(this.campaign.nSamples / 2)) % this.campaign.nSamples });
  }

  render() {
    const c = this.campaign;
    if (!c) { this.$('.cc-out').textContent = 'Cargando las trazas medidas…'; return; }
    const { k, t } = this.model.get();
    const offset = c.meta?.muestras?.[0] ?? 0, measured = !c.synthetic;
    const cl = cloud(c, BYTE, k, t);
    this.$('.cc-badge').innerHTML = measured ? REAL_BADGE : SIM_BADGE;
    this.$('[data-k="k"]').value = k; this.$('[data-o="k"]').textContent = `${hex2(k)}${k === this.correct ? ' (el correcto)' : ''}`;
    this.$('[data-k="t"]').value = t; this.$('[data-o="t"]').textContent = `muestra ${offset + t}${t === this.leak ? ' (su S-box)' : ''}`;
    const unit = measured ? 'lectura del ADC' : 'valor simulado';

    this.$('.cc-tlabel').textContent = `Las ${ROWS} primeras de las ${c.n} trazas. La columna azul cambia con el candidato; la naranja, con el instante:`;
    const rows = Array.from({ length: ROWS }, (_, i) => {
      const p = c.plaintexts[16 * i + BYTE], s = SBOX[p ^ k];
      return `<tr><td>${i + 1}</td><td><code>${hex2(p)}</code></td><td><code>${hex2(s)}</code> = ${s.toString(2).padStart(8, '0')}</td><td class="cc-x">${cl.x[i]}</td><td class="cc-y">${es(cl.y[i], 1)}</td></tr>`;
    }).join('');
    this.$('.cc-table').innerHTML = `<thead><tr><th>traza</th><th>texto claro p</th><th>SBox(p ⊕ ${hex2(k)})</th><th class="cc-x">predicción (bits a 1)</th><th class="cc-y">medido en la muestra ${offset + t}</th></tr></thead><tbody>${rows}<tr class="cc-more"><td colspan="5">… y ${c.n - ROWS} trazas más</td></tr></tbody>`;
    this.$('.cc-plabel').textContent = `Las ${c.n} trazas, una por punto. Los rombos son la media de cada columna y la recta, la tendencia:`;
    this.draw(cl, offset + t, unit);

    const a = Math.abs(cl.rho);
    const strength = a >= 0.4 ? 'una relación clara' : a >= 0.2 ? 'una relación débil' : 'casi ninguna relación';
    const dir = cl.rho >= 0 ? 'sube' : 'baja';
    const why = k === this.correct
      ? (t === this.leak ? 'Es el candidato correcto en el instante en que el chip calcula su S-box.'
        : 'El candidato es el correcto, pero en este instante el chip no está manejando ese valor.')
      : 'El candidato es falso: sus predicciones no tienen que ver con lo que hizo el chip.';
    this.$('.cc-out').innerHTML = `Candidato <b>${hex2(k)}</b>, muestra <b>${offset + t}</b>: <b>ρ = ${es(cl.rho, 2)}</b>, ${strength}.
      ${a >= 0.2 ? `Por cada bit a 1 más en la predicción, la lectura ${dir} ${es(Math.abs(cl.slope), 2)} de media.` : 'La recta sale casi horizontal.'} ${why}`;
    Object.assign(this.dataset, { k: String(k), t: String(offset + t), rho: cl.rho.toFixed(4), slope: cl.slope.toFixed(4),
      correct: String(this.correct), leak: String(offset + this.leak), n: String(cl.n) });
    this.markRendered();
  }

  draw(cl, sample, unit) {
    const svg = this.$('.cc-plot'), W = plotWidth();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let lo = Infinity, hi = -Infinity;
    for (const v of cl.y) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const pad = Math.max(0.5, (hi - lo) * 0.08);
    const x = scaleLinear([-0.6, 8.6], [L, W - R]), y = scaleLinear([lo - pad, hi + pad], [H - B, T]);
    const g = [];
    for (const v of niceTicks(lo, hi, 5)) {
      g.push(h('line', { class: 'grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      g.push(h('text', { class: 'ax ax-r', x: L - 6, y: y(v) + 3.5 }, es(v, 1)));
    }
    for (let w = 0; w <= 8; w++) g.push(h('text', { class: 'ax ax-m', x: x(w), y: H - B + 16 }, w));
    g.push(h('text', { class: 'ax ax-m', x: (L + W - R) / 2, y: H - 4 }, 'lo que predice el candidato: bits a 1 de SBox(p ⊕ k)'));
    g.push(h('text', { class: 'ax', x: 6, y: T - 6 }, `${unit} en la muestra ${sample}`));
    const spread = (x(1) - x(0)) * 0.62;
    let dots = '';
    for (let i = 0; i < cl.n; i++) {
      const cx = x(cl.x[i]) + jitter(i) * spread, cy = y(cl.y[i]);
      dots += `M${(cx - 2.6).toFixed(1)},${cy.toFixed(1)}a2.6,2.6 0 1,0 5.2,0a2.6,2.6 0 1,0 -5.2,0`;
    }
    g.push(h('path', { class: 'cc-dots', d: dots }));
    g.push(h('line', { class: 'cc-fit', x1: x(-0.4), x2: x(8.4), y1: y(cl.intercept - 0.4 * cl.slope), y2: y(cl.intercept + 8.4 * cl.slope) }));
    for (const m of cl.classes) {
      if (!m.count) continue;
      const cx = x(m.hw), cy = y(m.mean);
      g.push(h('path', { class: 'cc-mean', d: `M${cx},${cy - 6}L${cx + 6},${cy}L${cx},${cy + 6}L${cx - 6},${cy}Z` }));
    }
    svg.replaceChildren(...g);
  }
}

define('cpa-corr', CpaCorr);
