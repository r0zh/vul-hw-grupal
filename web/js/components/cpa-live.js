// <cpa-live>: el CPA en directo sobre trazas simuladas (o reales, con `src`).
//
//   <cpa-live snr="0.1" n="1000" byte="0"></cpa-live>
//   <cpa-live src="../datos/campana.json"></cpa-live>     (fase 5)
//
// Vistas: |ρ(k, t)| frente a t, pico por candidato y la clave rellenándose.
// Hooks para los claims: data-n, data-snr, data-byte, data-rank,
// data-recovered, data-peak-correct, data-peak-wrong, data-digest,
// data-source y data-rendered.
import { NoteElement, define } from '../kit/base.js';
import { h, scaleLinear, niceTicks } from '../kit/svg.js';
import { controlsHTML } from '../kit/controls.js';
import { presetHTML, matchPreset } from '../kit/presets.js';
import { attachTip } from '../kit/tip.js';
import { simulate, randomKey, rhoCeiling, firstCenter, LAB_KEY, CONFIG } from '../model/sim.js';
import { createAccumulator, attack, fromCampaignJSON } from '../model/cpa.js';
import { toHex } from '../model/aes.js';
import { es, hex2, esc, digest, SIM_BADGE } from './common.js';

export const N_MAX = 4000;
// Pasos de los deslizadores, en escala logarítmica. Los de la SNR son los
// niveles del barrido de analisis/config.py.
export const SNR_STEPS = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2];
export const N_STEPS = [10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 4000];
const PRESETS = { s1: { snr: 1 }, s01: { snr: 0.1 }, s002: { snr: 0.02 }, s0005: { snr: 0.005 } };
const PRESET_LABELS = { s1: 'SNR = 1', s01: 'SNR = 0,1', s002: 'SNR = 0,02', s0005: 'SNR = 0,005' };
const nearest = (steps, v) => steps.reduce((b, s, i) => (Math.abs(Math.log(s / v)) < Math.abs(Math.log(steps[b] / v)) ? i : b), 0);

// Geometría de las dos gráficas (unidades del viewBox).
const W = 720, L = 46, R = 14;

export class CpaLive extends NoteElement {
  defaults() {
    return {
      snr: this.attrNum('snr', 0.1), n: this.attrNum('n', 1000), byte: this.attrNum('byte', 0),
      seed: this.attrNum('seed', CONFIG.seed), keyIndex: 0, playing: false,
    };
  }

  build() {
    this.innerHTML = `
      <div class="fig cl">
        <div class="fig-head"><span class="fig-tool comp">Componente · explora</span><span class="cl-badge">${SIM_BADGE}</span></div>
        <div class="presets cl-presets">${presetHTML(PRESETS, PRESET_LABELS)}</div>
        <div class="controls cl-controls">
          ${controlsHTML({
            snr: { type: 'range', label: 'SNR', min: 0, max: SNR_STEPS.length - 1, value: 4 },
            n: { type: 'range', label: 'trazas N', min: 0, max: N_STEPS.length - 1, value: 12 },
            byte: { type: 'select', label: 'byte', options: Object.fromEntries(Array.from({ length: 16 }, (_, j) => [j, j])), value: 0 },
          })}
          <button type="button" class="cl-play">▶ añadir trazas</button>
        </div>
        <div class="controls cl-controls cl-sim-only">
          <label>semilla <input type="number" class="cl-seed" min="0" step="1"></label>
          <button type="button" class="cl-newkey">nueva clave</button>
          <span class="cl-keyname"></span>
        </div>
        <div class="legend"><span><i class="lk lk-ok"></i>candidato correcto</span><span><i class="lk lk-gray"></i>los otros 255</span><span><i class="lk lk-win"></i>ventana de la S-box del byte</span></div>
        <svg class="cl-time" viewBox="0 0 ${W} 230" role="img" aria-label="Correlación frente al tiempo"></svg>
        <p class="cl-sub">Pico de |ρ| de cada uno de los 256 candidatos del byte (de 0x00 a 0xff):</p>
        <svg class="cl-bars" viewBox="0 0 ${W} 170" role="img" aria-label="Pico de correlación por candidato"></svg>
        <p class="cl-sub">Clave recuperada (el candidato con el pico más alto de cada byte). Pulsa un byte para verlo arriba:</p>
        <div class="cl-key" role="group" aria-label="Bytes de la clave"></div>
        <div class="out cl-out"></div>
      </div>`;
    const $ = (s) => this.querySelector(s);
    this.$ = $;
    $('.cl-presets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-preset]');
      if (b) this.set({ ...PRESETS[b.dataset.preset], playing: false });
    });
    const onInput = (e) => {
      const k = e.target.dataset.k;
      if (k === 'snr') this.set({ snr: SNR_STEPS[+e.target.value] });
      if (k === 'n') this.set({ n: N_STEPS[+e.target.value], playing: false });
      if (k === 'byte') this.set({ byte: +e.target.value });
    };
    for (const c of this.querySelectorAll('.cl-controls')) { c.addEventListener('input', onInput); c.addEventListener('change', onInput); }
    $('.cl-seed').addEventListener('change', (e) => {
      const seed = Math.max(0, Math.floor(+e.target.value || 0));
      this.set({ seed });
    });
    $('.cl-newkey').addEventListener('click', () => this.set({ keyIndex: this.model.value('keyIndex') + 1 }));
    $('.cl-play').addEventListener('click', () => (this.model.value('playing') ? this.set({ playing: false }) : this.play()));
    $('.cl-key').addEventListener('click', (e) => {
      const b = e.target.closest('[data-j]');
      if (b) this.set({ byte: +b.dataset.j });
    });
    attachTip($('.cl-time'), (ev) => this.timeTip(ev));
    attachTip($('.cl-bars'), (ev) => this.barTip(ev));

    const src = this.getAttribute('src');
    if (src) {
      fetch(src).then((r) => r.json()).then((obj) => this.setCampaign(fromCampaignJSON(obj)))
        .catch((err) => { this.$('.cl-out').textContent = `No se pudo cargar ${src}: ${err.message}`; });
    }
  }

  // Trazas reales (o cualquier campaña ya hecha). Sin clave conocida no hay
  // puesto ni colores de acierto: solo el candidato elegido.
  setCampaign(campaign) {
    this.real = campaign;
    this._key = null;
    this.set({ n: Math.min(this.model.value('n'), campaign.n), playing: false });
  }

  campaign() {
    const { snr, seed, keyIndex } = this.model.get();
    if (this.real) return this.real;
    const id = `${snr}|${seed}|${keyIndex}`;
    if (this._campId !== id) {
      const key = keyIndex === 0 ? LAB_KEY : randomKey(seed, keyIndex);
      this._camp = simulate({ n: N_MAX, snr, key, seed });
      this._campId = id;
      this._acc = null;
    }
    return this._camp;
  }

  // Acumula hasta N trazas: si N sube, solo se añaden las nuevas.
  accumulate(c, n) {
    if (!this._acc || this._accFor !== c || this._acc.n > n) {
      this._acc = createAccumulator(c.nSamples);
      this._accFor = c;
    }
    if (this._acc.n < n) this._acc.add(c, this._acc.n, n);
    return this._acc;
  }

  play() {
    const n0 = 10, n1 = this.real ? this.real.n : N_MAX, ms = 6000, t0 = performance.now();
    this.set({ playing: true, n: n0 });
    const step = (now) => {
      if (!this.model.value('playing')) return;
      const f = Math.min(1, (now - t0) / ms);
      this.set({ n: Math.round(n0 * (n1 / n0) ** f), playing: f < 1 });
      if (f < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  render() {
    const st = this.model.get();
    const c = this.campaign();
    const n = Math.max(2, Math.min(st.n, c.n));
    const acc = this.accumulate(c, n);
    const res = attack(acc, c.key);
    const r = res[st.byte];
    this.res = res;
    const known = !!c.key;
    const recovered = known ? res.filter((x) => x.rank === 1).length : null;
    const S = c.nSamples;
    // Escala común a las dos gráficas: el pico más alto del byte, redondeado
    // hacia arriba a la décima.
    const ymax = Math.min(1, Math.max(0.1, Math.ceil((Math.max(...r.peak) + 0.02) * 10) / 10));
    this.geom = { S, ymax };

    this.paintControls(st, n);
    this.drawTime(r, S, ymax, st.byte, known);
    this.drawBars(r, n, ymax, known);
    this.drawKey(res, st.byte, known);

    const ceil = rhoCeiling(st.snr);
    const line1 = this.real
      ? `<b>N = ${n}</b> trazas ${this.real.synthetic ? 'simuladas, cargadas de un fichero' : 'medidas'}`
      : `<b>N = ${n}</b> trazas, <b>SNR = ${es(st.snr, 3)}</b> · pico esperado del correcto √(SNR/(1+SNR)) = ${es(ceil, 3)}`;
    const line2 = known
      ? `byte ${st.byte}: el correcto (${hex2(r.correct)}) queda en el <b>puesto ${r.rank}</b>, con |ρ| = ${es(r.correctPeak, 3)} frente a ${es(r.bestWrongPeak, 3)} del mejor falso`
      : `byte ${st.byte}: gana ${hex2(r.guess)} con |ρ| = ${es(r.peak[r.guess], 3)}`;
    const line3 = known ? `<b>${recovered} de 16</b> bytes recuperados${recovered === 16 ? ': la clave completa' : ''}` : '';
    this.$('.cl-out').innerHTML = [line1, line2, line3].filter(Boolean).join('<br>');

    Object.assign(this.dataset, {
      n: String(n), snr: String(st.snr), byte: String(st.byte), source: this.real ? 'real' : 'sim',
      rank: known ? String(r.rank) : '', recovered: known ? String(recovered) : '',
      peakCorrect: known ? r.correctPeak.toFixed(4) : '', peakWrong: known ? r.bestWrongPeak.toFixed(4) : '',
      digest: digest(res.flatMap((x) => [x.guess, x.peak[x.guess]])),
      playing: String(st.playing),
    });
    this.markRendered();
  }

  paintControls(st, n) {
    const $ = this.$;
    const snrIn = $('[data-k="snr"]'), nIn = $('[data-k="n"]'), byteIn = $('[data-k="byte"]');
    snrIn.value = nearest(SNR_STEPS, st.snr);
    $('[data-o="snr"]').textContent = es(st.snr, 3);
    nIn.value = nearest(N_STEPS, n);
    $('[data-o="n"]').textContent = String(n);
    byteIn.value = String(st.byte);
    const seedIn = $('.cl-seed');
    if (document.activeElement !== seedIn) seedIn.value = String(st.seed);
    $('.cl-play').textContent = st.playing ? '■ parar' : '▶ añadir trazas';
    $('.cl-keyname').textContent = this.real ? '' : st.keyIndex === 0 ? 'clave de laboratorio (FIPS-197, apéndice B)' : `clave aleatoria n.º ${st.keyIndex}`;
    const active = this.real ? '' : matchPreset(PRESETS, st, ['snr']);
    for (const b of this.querySelectorAll('[data-preset]')) {
      b.classList.toggle('on', b.dataset.preset === active);
      b.setAttribute('aria-pressed', String(b.dataset.preset === active));
    }
    this.dataset.activePreset = active;
    // Con una campaña cargada no hay SNR, semilla ni clave que elegir; la
    // etiqueta de datos simulados solo se queda si el JSON dice que lo son.
    for (const el of this.querySelectorAll('.cl-presets, .cl-sim-only, [data-k="snr"]')) {
      (el.closest('label') ?? el).hidden = !!this.real;
    }
    this.$('.cl-badge').hidden = !!this.real && !this.real.synthetic;
  }

  drawTime(r, S, ymax, byte, known) {
    const svg = this.$('.cl-time'), H = 230, T = 26, B = 34;
    const x = scaleLinear([0, S - 1], [L, W - R]), y = scaleLinear([0, ymax], [H - B, T]);
    this.xTime = x;
    const g = [];
    for (const v of niceTicks(0, ymax, 4)) {
      g.push(h('line', { class: 'grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      g.push(h('text', { class: 'ax ax-r', x: L - 6, y: y(v) + 3.5 }, es(v, 2)));
    }
    for (let t = 0; t < S; t += 16) g.push(h('text', { class: 'ax ax-m', x: x(t), y: H - B + 16 }, t));
    g.push(h('text', { class: 'ax ax-m', x: (L + W - R) / 2, y: H - 4 }, 'instante t (muestra)'));
    g.push(h('text', { class: 'ax', x: 6, y: T - 12 }, '|ρ(k, t)|'));
    // Ventana de la S-box del byte: las tres muestras del núcleo de la fuga.
    if (!this.real) {
      const c = firstCenter(byte);
      g.push(h('rect', { class: 'win', x: x(c - 1.5), width: x(c + 1.5) - x(c - 1.5), y: T, height: H - B - T }));
    }
    let gray = '';
    for (let k = 0; k < 256; k++) {
      if (known && k === r.correct) continue;
      for (let t = 0; t < S; t++) gray += `${t ? 'L' : 'M'}${x(t).toFixed(1)},${y(Math.abs(r.rho[k * S + t])).toFixed(1)}`;
    }
    g.push(h('path', { class: 'l-gray', d: gray }));
    const hi = known ? r.correct : r.guess;
    let d = '';
    for (let t = 0; t < S; t++) d += `${t ? 'L' : 'M'}${x(t).toFixed(1)},${y(Math.abs(r.rho[hi * S + t])).toFixed(1)}`;
    g.push(h('path', { class: known ? 'l-ok' : 'l-guess', d }));
    g.push(h('line', { class: 'cross', x1: -10, x2: -10, y1: T, y2: H - B }));
    // Zona de hover: todo el SVG, así ningún texto queda a caballo de su borde.
    g.push(h('rect', { class: 'hit', x: 0, y: 0, width: W, height: H }));
    svg.replaceChildren(...g);
  }

  timeTip(ev) {
    const svg = this.$('.cl-time'), box = svg.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    if (px < L || px > W - R || !this.res) return '';
    const { S } = this.geom, t = Math.round(this.xTime.invert(px));
    const r = this.res[this.model.value('byte')];
    const cross = svg.querySelector('.cross');
    cross.setAttribute('x1', this.xTime(t)); cross.setAttribute('x2', this.xTime(t));
    let wrong = 0, wk = 0;
    for (let k = 0; k < 256; k++) {
      if (k === r.correct) continue;
      const a = Math.abs(r.rho[k * S + t]);
      if (a > wrong) { wrong = a; wk = k; }
    }
    const div = document.createElement('div');
    const hi = r.correct ?? r.guess;
    div.innerHTML = `<b>t = ${t}</b><br><i class="lk lk-ok"></i><b>${es(Math.abs(r.rho[hi * S + t]), 3)}</b> ${r.correct != null ? 'correcto' : 'elegido'} (${hex2(hi)})<br><i class="lk lk-gray"></i><b>${es(wrong, 3)}</b> mejor falso (${hex2(wk)})`;
    return div;
  }

  drawBars(r, n, ymax, known) {
    const svg = this.$('.cl-bars'), H = 170, T = 22, B = 30;
    const band = (W - L - R) / 256;
    const y = scaleLinear([0, ymax], [H - B, T]);
    this.band = band;
    const g = [];
    for (const v of niceTicks(0, ymax, 3)) {
      g.push(h('line', { class: 'grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      g.push(h('text', { class: 'ax ax-r', x: L - 6, y: y(v) + 3.5 }, es(v, 2)));
    }
    for (const k of [0, 64, 128, 192, 255]) g.push(h('text', { class: 'ax ax-m', x: L + band * (k + 0.5), y: H - B + 15 }, hex2(k)));
    g.push(h('text', { class: 'ax ax-m', x: (L + W - R) / 2, y: H - 3 }, 'candidato k'));
    const hi = known ? r.correct : r.guess;
    let gray = '';
    for (let k = 0; k < 256; k++) {
      if (k === hi) continue;
      const x0 = L + band * k + 0.3, top = y(r.peak[k]);
      gray += `M${x0.toFixed(2)},${H - B}V${top.toFixed(1)}h${(band - 0.6).toFixed(2)}V${H - B}Z`;
    }
    g.push(h('path', { class: 'b-gray', d: gray }));
    const xc = L + band * hi;
    g.push(h('rect', { class: known ? 'b-ok' : 'b-guess', x: xc - 0.5, width: band + 1, y: y(r.peak[hi]), height: H - B - y(r.peak[hi]) }));
    // Referencia de ruido: con N trazas y sin fuga, |ρ| es del orden de 1/√N; el
    // máximo de 255 candidatos × 96 instantes queda unas 4–5 veces por encima.
    const noise = 4 / Math.sqrt(n);
    if (noise < ymax) {
      g.push(h('line', { class: 'ref', x1: L, x2: W - R, y1: y(noise), y2: y(noise) }));
      g.push(h('text', { class: 'ax ax-r', x: W - R, y: y(noise) - 4 }, '4/√N'));
    }
    const label = known ? `${hex2(hi)} · puesto ${r.rank}` : `${hex2(hi)} (elegido)`;
    const right = xc > W / 2;
    g.push(h('text', { class: 'lab', x: right ? xc - 4 : xc + band + 4, y: Math.max(T + 8, y(r.peak[hi]) + 4), 'text-anchor': right ? 'end' : 'start' }, label));
    // Zona de hover: todo el SVG, así ningún texto queda a caballo de su borde.
    g.push(h('rect', { class: 'hit', x: 0, y: 0, width: W, height: H }));
    svg.replaceChildren(...g);
  }

  barTip(ev) {
    const box = this.$('.cl-bars').getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    const k = Math.floor((px - L) / this.band);
    if (k < 0 || k > 255 || !this.res) return '';
    const r = this.res[this.model.value('byte')];
    const div = document.createElement('div');
    div.innerHTML = `<b>${es(r.peak[k], 3)}</b> pico de |ρ| · candidato ${hex2(k)}${k === r.correct ? ' (correcto)' : ''}<br>en t = ${r.at[k]}`;
    return div;
  }

  drawKey(res, byte, known) {
    this.$('.cl-key').innerHTML = res.map((x) => {
      const ok = known && x.rank === 1;
      const cls = known ? (ok ? 'ok' : 'bad') : '';
      const mark = known ? (ok ? '✓' : '✗') : '';
      const title = known ? `byte ${x.byte}: elegido ${hex2(x.guess)}, real ${hex2(x.correct)}, puesto ${x.rank}` : `byte ${x.byte}: ${hex2(x.guess)}`;
      return `<button type="button" data-j="${x.byte}" class="${cls}${x.byte === byte ? ' sel' : ''}" title="${esc(title)}" aria-pressed="${x.byte === byte}">${x.guess.toString(16).padStart(2, '0')}<small>${mark}</small></button>`;
    }).join('') + (known ? `<span class="cl-real">real: <code>${toHex(res.map((x) => x.correct))}</code></span>` : '');
  }
}

define('cpa-live', CpaLive);
