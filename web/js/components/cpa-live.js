// <cpa-live>: el CPA en directo sobre trazas simuladas (o reales, con `src`).
//
//   <cpa-live snr="0.1" n="1000" byte="0"></cpa-live>
//   <cpa-live src="./data/campana.json"></cpa-live>       (trazas medidas)
//   <cpa-live cm="none" nmax="20000"></cpa-live>          (con selector de contramedida)
//   <cpa-live compact src="./data/campana.json"></cpa-live>   (solo la clave, sin gráficas)
//
// Vistas: la clave rellenándose, |ρ(k, t)| frente a t y el pico por candidato.
// Hooks para los claims: data-n, data-snr, data-byte, data-rank,
// data-recovered, data-peak-correct, data-peak-wrong, data-peak-at,
// data-digest, data-source, data-cm, data-playing y data-rendered.
// Para los pasos guiados de la página: set({ n, snr, byte, cm }), play() y newKey().
import { NoteElement, define } from '../kit/base.js';
import { h, scaleLinear, niceTicks } from '../kit/svg.js';
import { controlsHTML } from '../kit/controls.js';
import { attachTip } from '../kit/tip.js';
import { simulate, randomKey, rhoCeiling, firstCenter, LAB_KEY, CONFIG, COUNTERMEASURES, DELAY_MAX } from '../model/sim.js';
import { createAccumulator, attack, fromCampaignJSON } from '../model/cpa.js';
import { toHex } from '../model/aes.js';
import { es, hex2, esc, digest, miles, plotWidth, tickStep, SIM_BADGE, REAL_BADGE } from './common.js';

export const N_MAX = 4000;
// Pasos de los deslizadores, en escala logarítmica. Los de la SNR son los
// niveles del barrido de analisis/config.py.
export const SNR_STEPS = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2];
export const N_STEPS = [10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 4000,
  6000, 10000, 15000, 20000];
// Una campaña cargada tiene pocas trazas: su deslizador empieza más abajo.
const N_STEPS_SMALL = [2, 3, 5, 7];
const CM_LABELS = { none: 'ninguna', shuffle: 'SubBytes barajado', delay: 'retardos aleatorios' };
const nearest = (steps, v) => steps.reduce((b, s, i) => (Math.abs(Math.log(s / v)) < Math.abs(Math.log(steps[b] / v)) ? i : b), 0);

// Márgenes de las dos gráficas (unidades del viewBox); el ancho sale de plotWidth().
const L = 46, R = 14;

export class CpaLive extends NoteElement {
  defaults() {
    return {
      snr: this.attrNum('snr', 0.1), n: this.attrNum('n', 1000), byte: this.attrNum('byte', 0),
      seed: this.attrNum('seed', CONFIG.seed), keyIndex: 0, playing: false,
      cm: COUNTERMEASURES.includes(this.getAttribute('cm')) ? this.getAttribute('cm') : 'none',
    };
  }

  build() {
    // Tope de trazas: 4000 por defecto; la figura de contramedidas pide más.
    this.nMax = Math.max(N_STEPS[0], this.attrNum('nmax', N_MAX));
    this.nSteps = N_STEPS.filter((s) => s <= this.nMax);
    this.compact = this.hasAttribute('compact');
    const withCm = this.hasAttribute('cm');
    const plots = this.compact ? '' : `
        <div class="legend cl-legend"><span><i class="lk lk-ok"></i>candidato correcto</span><span><i class="lk lk-gray"></i>los otros 255</span><span class="cl-sim-only"><i class="lk lk-win"></i><span class="cl-winlabel">instante de la S-box del byte</span></span></div>
        <svg class="cl-time" role="img" aria-label="Correlación frente al tiempo"></svg>
        <p class="cl-sub cl-barlabel"></p>
        <svg class="cl-bars" role="img" aria-label="Pico de correlación por candidato"></svg>`;
    const more = this.compact ? '' : `
        <details class="cl-more cl-sim-only"><summary>Más opciones</summary>
          <div class="controls">
            <label>semilla <input type="number" class="cl-seed" min="0" step="1"></label>
            <button type="button" class="cl-newkey">nueva clave</button>
            <span class="cl-keyname"></span>
          </div>
        </details>`;
    this.innerHTML = `
      <div class="fig cl${this.compact ? ' cl-compact' : ''}">
        <div class="fig-head"><span class="fig-tool comp">Componente · explora</span><span class="cl-badge"></span></div>
        <div class="controls cl-controls">
          ${controlsHTML({
            snr: { type: 'range', label: 'SNR', min: 0, max: SNR_STEPS.length - 1, value: 4 },
            n: { type: 'range', label: 'trazas N', min: 0, max: this.nSteps.length - 1, value: 12 },
            ...(withCm ? { cm: { type: 'select', label: 'contramedida', options: CM_LABELS, value: 'none' } } : {}),
          })}
          <button type="button" class="cl-play">▶ añadir trazas</button>
        </div>
        <p class="cl-sub cl-keylabel"></p>
        <div class="cl-key" role="group" aria-label="Bytes de la clave"></div>
        <div class="cl-keyinfo"></div>${plots}
        <div class="out cl-out"></div>${more}
      </div>`;
    const $ = (s) => this.querySelector(s);
    this.$ = $;
    const onInput = (e) => {
      const k = e.target.dataset.k;
      if (k === 'snr') this.set({ snr: SNR_STEPS[+e.target.value] });
      if (k === 'n') this.set({ n: this.nSteps[+e.target.value], playing: false });
      if (k === 'cm') this.set({ cm: e.target.value, playing: false });
    };
    $('.cl-controls').addEventListener('input', onInput);
    $('.cl-controls').addEventListener('change', onInput);
    $('.cl-play').addEventListener('click', () => (this.model.value('playing') ? this.set({ playing: false }) : this.play()));
    $('.cl-key').addEventListener('click', (e) => {
      const b = e.target.closest('[data-j]');
      if (b && !this.compact) this.set({ byte: +b.dataset.j });
    });
    if (!this.compact) {
      $('.cl-seed').addEventListener('change', (e) => this.set({ seed: Math.max(0, Math.floor(+e.target.value || 0)) }));
      $('.cl-newkey').addEventListener('click', () => this.newKey());
      attachTip($('.cl-time'), (ev) => this.timeTip(ev));
      attachTip($('.cl-bars'), (ev) => this.barTip(ev));
    }

    const src = this.getAttribute('src');
    if (src) {
      this.loading = true;
      fetch(src).then((r) => r.json()).then((obj) => this.setCampaign(fromCampaignJSON(obj)))
        .catch((err) => { this.loadError = `No se pudo cargar ${src}: ${err.message}`; this.render(); });
    }
  }

  // Trazas reales (o cualquier campaña ya hecha). Sin clave conocida no hay
  // puesto ni colores de acierto: solo el candidato elegido.
  setCampaign(campaign) {
    this.real = campaign;
    this.loading = false;
    this.nSteps = [...new Set([...N_STEPS_SMALL, ...N_STEPS].filter((s) => s < campaign.n).concat(campaign.n))];
    this.$('[data-k="n"]').max = this.nSteps.length - 1;
    this.set({ n: Math.min(this.model.value('n'), campaign.n), playing: false });
  }

  campaign() {
    const { snr, seed, keyIndex, cm } = this.model.get();
    if (this.real) return this.real;
    const id = `${snr}|${seed}|${keyIndex}|${cm}`;
    if (this._campId !== id) {
      const key = keyIndex === 0 ? LAB_KEY : randomKey(seed, keyIndex);
      this._camp = simulate({ n: this.nMax, snr, key, seed, cm });
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

  // Animación «añadir trazas»: N crece en progresión geométrica del primer
  // paso del deslizador al último.
  play() {
    if (this.loading) return;
    const n0 = this.nSteps[0], n1 = this.nSteps[this.nSteps.length - 1], ms = 6000, t0 = performance.now();
    this.set({ playing: true, n: n0 });
    const step = (now) => {
      if (!this.model.value('playing')) return;
      const f = Math.min(1, (now - t0) / ms);
      this.set({ n: Math.round(n0 * (n1 / n0) ** f), playing: f < 1 });
      if (f < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  newKey() { this.set({ keyIndex: this.model.value('keyIndex') + 1 }); }

  render() {
    // Con `src`, hasta que llegan las trazas no hay nada que atacar.
    if (this.loading || this.loadError) {
      this.$('.cl-out').textContent = this.loadError ?? 'Cargando las trazas medidas…';
      return;
    }
    const st = this.model.get();
    const c = this.campaign();
    const n = Math.max(2, Math.min(st.n, c.n));
    const acc = this.accumulate(c, n);
    const res = attack(acc, c.key);
    const byte = this.compact ? 0 : st.byte;
    const r = res[byte];
    this.res = res;
    const known = !!c.key;
    const recovered = known ? res.filter((x) => x.rank === 1).length : null;
    const S = c.nSamples;
    // Primera muestra de la ventana dentro de la traza completa (0 si es simulada).
    const offset = c.meta?.muestras?.[0] ?? 0;
    // Escala común a las dos gráficas: el pico más alto del byte, redondeado
    // hacia arriba a la décima.
    const ymax = Math.min(1, Math.max(0.1, Math.ceil((Math.max(...r.peak) + 0.02) * 10) / 10));
    this.geom = { S, ymax, offset, W: plotWidth() };

    this.paintControls(st, n);
    this.drawKey(res, byte, known, recovered);
    if (!this.compact) {
      this.drawTime(r, S, ymax, byte, known);
      this.drawBars(r, n, ymax, known);
    }

    const ceil = rhoCeiling(st.snr);
    const what = this.real ? (this.real.synthetic ? 'simuladas, cargadas de un fichero' : 'medidas en la placa') : '';
    const line1 = this.real
      ? `<b>N = ${miles(n)}</b> trazas ${what}`
      : st.cm === 'none'
        ? `<b>N = ${miles(n)}</b> trazas, <b>SNR = ${es(st.snr, 3)}</b> · pico esperado del correcto √(SNR/(1+SNR)) = ${es(ceil, 3)}`
        : `<b>N = ${miles(n)}</b> trazas, <b>SNR = ${es(st.snr, 3)}</b>, con <b>${CM_LABELS[st.cm]}</b> · sin contramedida, el pico del correcto sería ${es(ceil, 3)}`;
    const where = offset ? `, en la muestra ${offset + r.at[known ? r.correct : r.guess]},` : '';
    const line2 = known
      ? `byte ${byte}: el correcto (${hex2(r.correct)}) queda en el <b>puesto ${r.rank}</b>, con |ρ| = ${es(r.correctPeak, 3)}${where} frente a ${es(r.bestWrongPeak, 3)} del mejor falso`
      : `byte ${byte}: gana ${hex2(r.guess)} con |ρ| = ${es(r.peak[r.guess], 3)}${where.replace(/,$/, '')}`;
    const line3 = known ? `<b>${recovered} de 16</b> bytes recuperados${recovered === 16 ? ': la clave completa' : ''}` : '';
    this.$('.cl-out').innerHTML = (this.compact ? [`${line1} → ${line3}`] : [line1, line2, line3]).filter(Boolean).join('<br>');

    Object.assign(this.dataset, {
      n: String(n), snr: String(st.snr), byte: String(byte), source: this.real ? 'real' : 'sim', cm: st.cm,
      rank: known ? String(r.rank) : '', recovered: known ? String(recovered) : '',
      peakCorrect: known ? r.correctPeak.toFixed(4) : '', peakWrong: known ? r.bestWrongPeak.toFixed(4) : '',
      peakAt: String(offset + r.at[known ? r.correct : r.guess]),
      digest: digest(res.flatMap((x) => [x.guess, x.peak[x.guess]])),
      playing: String(st.playing),
    });
    this.markRendered();
  }

  paintControls(st, n) {
    const $ = this.$;
    const measured = !!this.real && !this.real.synthetic;
    $('[data-k="snr"]').value = nearest(SNR_STEPS, st.snr);
    $('[data-o="snr"]').textContent = es(st.snr, 3);
    $('[data-k="n"]').value = nearest(this.nSteps, n);
    $('[data-o="n"]').textContent = miles(n);
    const cmIn = $('[data-k="cm"]');
    if (cmIn) cmIn.value = st.cm;
    $('.cl-play').textContent = st.playing ? '■ parar' : '▶ añadir trazas';
    $('.cl-badge').innerHTML = this.real ? (measured ? REAL_BADGE : SIM_BADGE) : SIM_BADGE;
    $('.cl-keylabel').textContent = this.compact
      ? 'La clave que deduce el ataque, byte a byte (verde: acierta; rojo: todavía no):'
      : 'La clave que deduce el ataque (verde: acierta; rojo: todavía no). Pulsa un byte para ver sus gráficas:';
    // Con una campaña cargada no hay SNR, semilla ni clave que elegir.
    $('[data-k="snr"]').closest('label').hidden = !!this.real;
    for (const el of this.querySelectorAll('.cl-sim-only')) el.hidden = !!this.real;
    if (this.compact) return;
    const seedIn = $('.cl-seed');
    if (document.activeElement !== seedIn) seedIn.value = String(st.seed);
    $('.cl-keyname').textContent = st.keyIndex === 0 ? 'clave de laboratorio (FIPS-197, apéndice B)' : `clave aleatoria n.º ${st.keyIndex}`;
    $('.cl-winlabel').textContent = st.cm === 'none' ? 'instante de la S-box del byte' : 'zona en la que puede caer la S-box del byte';
    $('.cl-barlabel').textContent = `Pico de |ρ| de cada uno de los 256 candidatos del byte ${st.byte} (de 0x00 a 0xff):`;
  }

  drawTime(r, S, ymax, byte, known) {
    const svg = this.$('.cl-time'), { W, offset } = this.geom, H = 230, T = 26, B = 34;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const x = scaleLinear([0, S - 1], [L, W - R]), y = scaleLinear([0, ymax], [H - B, T]);
    this.xTime = x;
    const g = [];
    for (const v of niceTicks(0, ymax, 4)) {
      g.push(h('line', { class: 'grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      g.push(h('text', { class: 'ax ax-r', x: L - 6, y: y(v) + 3.5 }, es(v, 2)));
    }
    // Marcas en números redondos de la traza completa, no de la ventana.
    const step = tickStep(S, W > 500 ? 9 : 5);
    for (let s = Math.ceil(offset / step) * step; s - offset < S; s += step) {
      g.push(h('text', { class: 'ax ax-m', x: x(s - offset), y: H - B + 16 }, s));
    }
    g.push(h('text', { class: 'ax ax-m', x: (L + W - R) / 2, y: H - 4 }, offset ? 'muestra de la traza (un ciclo de reloj cada una)' : 'instante t (muestra)'));
    g.push(h('text', { class: 'ax', x: 6, y: T - 12 }, `|ρ(k, t)| del byte ${byte}`));
    // Instante de la S-box del byte: las tres muestras del núcleo de la fuga.
    // Con una contramedida, la zona en la que puede caer en cada traza.
    if (!this.real) {
      const cm = this.model.value('cm');
      const [a, b] = cm === 'shuffle' ? [firstCenter(0), firstCenter(15)]
        : cm === 'delay' ? [firstCenter(byte), firstCenter(byte) + DELAY_MAX * (byte + 1)]
          : [firstCenter(byte), firstCenter(byte)];
      g.push(h('rect', { class: 'win', x: x(a - 1.5), width: x(b + 1.5) - x(a - 1.5), y: T, height: H - B - T }));
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
    const svg = this.$('.cl-time'), box = svg.getBoundingClientRect(), { S, W, offset } = this.geom ?? {};
    if (!this.res) return '';
    const px = ((ev.clientX - box.left) / box.width) * W;
    if (px < L || px > W - R) return '';
    const t = Math.max(0, Math.min(S - 1, Math.round(this.xTime.invert(px))));
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
    div.innerHTML = `<b>${offset ? `muestra ${offset + t}` : `t = ${t}`}</b><br><i class="lk lk-ok"></i><b>${es(Math.abs(r.rho[hi * S + t]), 3)}</b> ${r.correct != null ? 'correcto' : 'elegido'} (${hex2(hi)})<br><i class="lk lk-gray"></i><b>${es(wrong, 3)}</b> mejor falso (${hex2(wk)})`;
    return div;
  }

  drawBars(r, n, ymax, known) {
    const svg = this.$('.cl-bars'), { W } = this.geom, H = 170, T = 22, B = 30;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
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
      const x0 = L + band * k + 0.3 * Math.min(1, band), top = y(r.peak[k]);
      gray += `M${x0.toFixed(2)},${H - B}V${top.toFixed(1)}h${(band * 0.78).toFixed(2)}V${H - B}Z`;
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
    if (!this.res) return '';
    const box = this.$('.cl-bars').getBoundingClientRect(), { W, offset } = this.geom;
    const px = ((ev.clientX - box.left) / box.width) * W;
    const k = Math.floor((px - L) / this.band);
    if (k < 0 || k > 255) return '';
    const r = this.res[this.model.value('byte')];
    const div = document.createElement('div');
    div.innerHTML = `<b>${es(r.peak[k], 3)}</b> pico de |ρ| · candidato ${hex2(k)}${k === r.correct ? ' (correcto)' : ''}<br>en ${offset ? `la muestra ${offset + r.at[k]}` : `t = ${r.at[k]}`}`;
    return div;
  }

  drawKey(res, byte, known, recovered) {
    const cell = (x) => {
      const ok = known && x.rank === 1;
      const cls = `${known ? (ok ? 'ok' : 'bad') : ''}${!this.compact && x.byte === byte ? ' sel' : ''}`;
      const mark = known ? (ok ? '✓' : '✗') : '';
      const title = known ? `byte ${x.byte}: elegido ${hex2(x.guess)}, real ${hex2(x.correct)}, puesto ${x.rank}` : `byte ${x.byte}: ${hex2(x.guess)}`;
      const body = `${x.guess.toString(16).padStart(2, '0')}<small>${mark}</small>`;
      return this.compact
        ? `<span class="cl-b ${cls}" title="${esc(title)}">${body}</span>`
        : `<button type="button" data-j="${x.byte}" class="cl-b ${cls}" title="${esc(title)}" aria-pressed="${x.byte === byte}">${body}</button>`;
    };
    this.$('.cl-key').innerHTML = res.map(cell).join('');
    this.$('.cl-keyinfo').innerHTML = known
      ? `<span class="cl-count"><b>${recovered}</b> de 16 bytes</span> · <span class="cl-real">clave real: <code>${toHex(res.map((x) => x.correct))}</code></span>` : '';
  }
}

define('cpa-live', CpaLive);
