// <cpa-sbox>: AddRoundKey y SubBytes con un byte, y por qué se ataca la salida
// de la S-box y no la del XOR. Arriba, p ⊕ k bit a bit y la consulta en la
// tabla; abajo, cuánto se parece la predicción de cada candidato a la del
// correcto si el objetivo es p ⊕ k o SBox(p ⊕ k).
//
//   <cpa-sbox p="0x32" k="0x2b"></cpa-sbox>
//
// Hooks: data-p, data-k, data-xor, data-sbox, data-hw, data-target,
// data-best-wrong, data-complement, data-near (candidatos falsos con
// |ρ| ≥ 0,75 sin contar el complementario) y data-rendered.
import { NoteElement, define } from '../kit/base.js';
import { h, scaleLinear } from '../kit/svg.js';
import { controlsHTML } from '../kit/controls.js';
import { attachTip } from '../kit/tip.js';
import { SBOX, HW } from '../model/aes.js';
import { es, hex2 } from './common.js';

// Correlación, sobre los 256 textos claros, entre HW(f(p ⊕ k)) y HW(f(p ⊕ k'))
// en función de d = k ⊕ k' (solo depende de la diferencia). Si el dispositivo
// filtra HW(f(p ⊕ k)), con infinitas trazas el candidato k' correlaciona
// ρ_correcto · ghost[k ⊕ k']. Modelo puro, se prueba en Node.
export function ghost(f) {
  const g = Array.from({ length: 256 }, (_, u) => HW[f(u)]);
  const m = g.reduce((a, b) => a + b, 0) / 256;
  const v = g.reduce((a, b) => a + (b - m) ** 2, 0);
  return Float64Array.from({ length: 256 }, (_, d) => {
    let c = 0;
    for (let p = 0; p < 256; p++) c += (g[p] - m) * (g[p ^ d] - m);
    return c / v;
  });
}

export const TARGETS = {
  xor: { label: 'p ⊕ k (AddRoundKey)', ghost: ghost((u) => u) },
  sbox: { label: 'SBox(p ⊕ k) (SubBytes)', ghost: ghost((u) => SBOX[u]) },
};
export const NEAR = 0.75;

const bits = (v) => [...v.toString(2).padStart(8, '0')].map((b) => `<i class="bit b${b}">${b}</i>`).join('');
const W = 720, CELL_W = 40, CELL_H = 17, TL = 40, TT = 20;
const BH = 170, BL = 46, BR = 14, BT = 12, BB = 34;

export class CpaSbox extends NoteElement {
  defaults() {
    const num = (name, d) => { const v = this.getAttribute(name); return v == null ? d : Number(v) & 255; };
    return { p: num('p', 0x32), k: num('k', 0x2b), target: 'xor' };
  }

  build() {
    this.innerHTML = `
      <div class="fig sx">
        <div class="fig-head"><span class="fig-tool comp">Componente · explora</span></div>
        <div class="controls sx-controls">${controlsHTML({
          p: { type: 'range', label: 'texto claro p', min: 0, max: 255, value: 0 },
          k: { type: 'range', label: 'clave k', min: 0, max: 255, value: 0 },
        })}</div>
        <div class="sx-xor" aria-live="polite"></div>
        <p class="cl-sub">S-box: la fila es la primera cifra hexadecimal de p ⊕ k y la columna, la segunda.</p>
        <svg class="sx-table" viewBox="0 0 ${W} ${TT + 16 * CELL_H + 4}" role="img" aria-label="Tabla de la S-box de AES"></svg>
        <div class="sx-lookup"></div>
        <p class="cl-sub sx-q">¿Qué valor conviene atacar? Parecido de la predicción de cada candidato con la del correcto si se ataca</p>
        <div class="presets sx-targets">${Object.entries(TARGETS).map(([t, c]) => `<button type="button" data-target="${t}">${c.label}</button>`).join('')}</div>
        <div class="legend"><span><i class="lk lk-ok"></i>candidato correcto</span><span><i class="lk sx-lk-c"></i>su complementario (k ⊕ 0xff)</span><span><i class="lk lk-gray"></i>los otros 254</span></div>
        <svg class="sx-bars" viewBox="0 0 ${W} ${BH}" role="img" aria-label="Correlación de la predicción de cada candidato con la del correcto"></svg>
        <div class="out sx-out"></div>
      </div>`;
    this.querySelector('.sx-controls').addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (k) this.set({ [k]: +e.target.value });
    });
    this.querySelector('.sx-targets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-target]');
      if (b) this.set({ target: b.dataset.target });
    });
    this.querySelector('.sx-table').addEventListener('click', (e) => {
      const c = e.target.closest('[data-u]');
      if (c) this.set({ p: +c.dataset.u ^ this.model.value('k') });
    });
    attachTip(this.querySelector('.sx-bars'), (ev) => this.tip(ev));
  }

  render() {
    const { p, k, target } = this.model.get();
    const u = p ^ k, s = SBOX[u], w = HW[s];
    for (const [key, v] of Object.entries({ p, k })) {
      this.querySelector(`[data-k="${key}"]`).value = v;
      this.querySelector(`[data-o="${key}"]`).textContent = hex2(v);
    }
    this.querySelector('.sx-xor').innerHTML = `
      <span class="sx-row"><small>p</small><span class="bits">${bits(p)}</span><code>${hex2(p)}</code></span>
      <span class="sx-row"><small>k</small><span class="bits">${bits(k)}</span><code>${hex2(k)}</code></span>
      <span class="sx-row sx-sum"><small>p ⊕ k</small><span class="bits">${bits(u)}</span><code>${hex2(u)}</code></span>`;
    this.drawTable(u);
    this.querySelector('.sx-lookup').innerHTML = `AddRoundKey: ${hex2(p)} ⊕ ${hex2(k)} = <b>${hex2(u)}</b> (1 donde los bits difieren, 0 donde coinciden).
      SubBytes: fila ${(u >> 4).toString(16)}, columna ${(u & 15).toString(16)} de la tabla → <b>${hex2(s)}</b>, con <b>${w}</b> bits a 1.
      Pulsa una celda para elegir otro p ⊕ k.`;

    const gh = TARGETS[target].ghost, comp = k ^ 0xff;
    let bestWrong = 0, near = 0;
    for (let c = 0; c < 256; c++) {
      if (c === k) continue;
      const a = Math.abs(gh[c ^ k]);
      bestWrong = Math.max(bestWrong, a);
      if (c !== comp && a >= NEAR - 1e-9) near++;
    }
    this.drawBars(gh, k);
    for (const b of this.querySelectorAll('[data-target]')) b.classList.toggle('on', b.dataset.target === target);
    const c = Math.abs(gh[0xff]);
    this.querySelector('.sx-out').innerHTML = target === 'xor'
      ? `Atacando p ⊕ k, el complementario ${hex2(comp)} predice exactamente lo contrario, 8 − HW, y su |ρ| es <b>${es(c, 2)}</b>: empata con el correcto.
        Además, otros <b>${near}</b> candidatos tienen |ρ| ≥ ${es(NEAR, 2)}, los que difieren de ${hex2(k)} o de ${hex2(comp)} en un solo bit.`
      : `Atacando la salida de la S-box, el complementario se queda en |ρ| = <b>${es(c, 2)}</b> y el mejor falso en <b>${es(bestWrong, 2)}</b>:
        solo el correcto predice bien la fuga. En un CPA, cada barra se multiplica por el pico del correcto, así que con SNR = 0,1 el mejor falso tiende a ${es(bestWrong * Math.sqrt(0.1 / 1.1), 2)}.`;
    Object.assign(this.dataset, { p: String(p), k: String(k), xor: String(u), sbox: String(s), hw: String(w), target,
      bestWrong: bestWrong.toFixed(4), complement: c.toFixed(4), near: String(near) });
    this.markRendered();
  }

  drawTable(u) {
    const g = [];
    for (let c = 0; c < 16; c++) g.push(h('text', { class: 'ax ax-m', x: TL + CELL_W * c + CELL_W / 2, y: TT - 6 }, c.toString(16)));
    for (let r = 0; r < 16; r++) {
      g.push(h('text', { class: 'ax ax-m', x: TL / 2, y: TT + CELL_H * r + 12.5 }, r.toString(16)));
      for (let c = 0; c < 16; c++) {
        const v = 16 * r + c, on = v === u, line = r === u >> 4 || c === (u & 15);
        g.push(h('g', { 'data-u': v, class: 'sx-cell' },
          h('rect', { class: on ? 'sx-on' : line ? 'sx-line' : 'sx-off', x: TL + CELL_W * c, y: TT + CELL_H * r, width: CELL_W, height: CELL_H }),
          h('text', { class: `sx-t${on ? ' on' : ''}`, x: TL + CELL_W * c + CELL_W / 2, y: TT + CELL_H * r + 12.5 }, SBOX[v].toString(16).padStart(2, '0'))));
      }
    }
    this.querySelector('.sx-table').replaceChildren(...g);
  }

  drawBars(gh, k) {
    const svg = this.querySelector('.sx-bars');
    const x = scaleLinear([0, 256], [BL, W - BR]), y = scaleLinear([0, 1], [BH - BB, BT]);
    this.bx = x;
    const g = [];
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      g.push(h('line', { class: 'grid', x1: BL, x2: W - BR, y1: y(v), y2: y(v) }));
      g.push(h('text', { class: 'ax ax-r', x: BL - 6, y: y(v) + 3.5 }, es(v, 2)));
    }
    for (const t of [0, 0x40, 0x80, 0xc0, 0xff]) g.push(h('text', { class: 'ax ax-m', x: x(t + 0.5), y: BH - BB + 16 }, hex2(t)));
    g.push(h('text', { class: 'ax ax-m', x: (BL + W - BR) / 2, y: BH - 4 }, 'candidato k′'));
    const bw = x(1) - x(0);
    // Los dos destacados van al final para que ninguna barra gris los tape.
    const order = [...Array(256).keys()].filter((c) => c !== k && c !== (k ^ 0xff)).concat([k ^ 0xff, k]);
    for (const c of order) {
      const a = Math.abs(gh[c ^ k]);
      const cls = c === k ? 'b-ok' : c === (k ^ 0xff) ? 'sx-b-c' : 'b-gray';
      g.push(h('rect', { class: cls, x: x(c), width: Math.max(1, bw - 0.4), y: y(a), height: y(0) - y(a) }));
    }
    g.push(h('rect', { class: 'hit', x: 0, y: 0, width: W, height: BH }));
    svg.replaceChildren(...g);
  }

  tip(ev) {
    const box = this.querySelector('.sx-bars').getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    if (px < BL || px > W - BR) return '';
    const { k, target } = this.model.get();
    const c = Math.min(255, Math.max(0, Math.floor(this.bx.invert(px))));
    const rho = TARGETS[target].ghost[c ^ k];
    const div = document.createElement('div');
    div.innerHTML = `<b>k′ = ${hex2(c)}</b>${c === k ? ' (correcto)' : c === (k ^ 0xff) ? ' (complementario)' : ''}<br>
      ρ = <b>${es(rho, 3)}</b> <span class="muted">(difiere del correcto en ${HW[c ^ k]} bits)</span>`;
    return div;
  }
}

define('cpa-sbox', CpaSbox);
