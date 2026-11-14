// <cpa-spa>: la traza media del cifrado completo, medida en la placa, para
// mirarla de cerca. Arriba, la traza; abajo, en qué muestras fuga un valor de
// la primera ronda y uno de la última (calculado con la clave conocida). Se
// puede acercar hasta ver una ronda o la ventana que usa el ataque, y marcar
// las diez rondas.
//
//   <cpa-spa src="./data/nano-spa.json" window="440:740"></cpa-spa>
//
// `window` es el tramo que después ataca el CPA (el de data/nano-tinyaes.json).
// Hooks: data-from, data-to, data-view, data-marks, data-rounds, data-period,
// data-visible (rondas que se ven) y data-rendered. Pasos guiados:
// set({ marks }) y view('todo' | 'dos' | 'ronda' | 'ataque').
import { NoteElement, define } from '../kit/base.js';
import { h, scaleLinear } from '../kit/svg.js';
import { attachTip } from '../kit/tip.js';
import { fromSpaJSON, envelope, roundAt } from '../model/spa.js';
import { es, miles, plotWidth, tickStep, REAL_BADGE } from './common.js';

const L = 46, R = 14;
const MIN_SPAN = 60;
const VIEW_LABELS = { todo: 'cifrado completo', dos: 'dos rondas', ronda: 'la ronda 1', ataque: 'la ventana del ataque' };

export class CpaSpa extends NoteElement {
  defaults() { return { from: 0, to: 0, marks: false }; }

  build() {
    const [a, b] = (this.getAttribute('window') ?? '').split(':').map(Number);
    this.attackWindow = Number.isFinite(a) && Number.isFinite(b) && b > a ? [a, b] : null;
    this.innerHTML = `
      <div class="fig sp">
        <div class="fig-head"><span class="fig-tool comp">Componente · explora</span>${REAL_BADGE}</div>
        <div class="presets sp-views">${Object.entries(VIEW_LABELS).map(([v, label]) => `<button type="button" data-view="${v}">${label}</button>`).join('')}</div>
        <div class="controls sp-controls">
          <label><input type="checkbox" class="sp-marks"> marcar las rondas</label>
          <span class="sp-nav">
            <button type="button" data-nav="left" aria-label="Mover a la izquierda">◀</button>
            <button type="button" data-nav="right" aria-label="Mover a la derecha">▶</button>
            <button type="button" data-nav="in" aria-label="Acercar">＋</button>
            <button type="button" data-nav="out" aria-label="Alejar">−</button>
          </span>
        </div>
        <svg class="sp-trace" role="img" aria-label="Traza media del cifrado completo"></svg>
        <div class="legend sp-legend"><span><i class="lk lk-ok"></i>fuga de la primera ronda</span><span><i class="lk sp-lk10"></i>fuga de la última ronda</span><span class="muted">correlación de cada muestra con un valor de esa ronda, de 0 a 1</span></div>
        <svg class="sp-rho" role="img" aria-label="Correlación de cada muestra con un valor de la primera ronda y de la última"></svg>
        <svg class="sp-map" role="img" aria-label="Parte de la traza que se está viendo"></svg>
        <div class="out sp-out"></div>
      </div>`;
    const $ = (s) => this.querySelector(s);
    this.$ = $;
    $('.sp-views').addEventListener('click', (e) => {
      const b2 = e.target.closest('[data-view]');
      if (b2) this.view(b2.dataset.view);
    });
    $('.sp-marks').addEventListener('change', (e) => this.set({ marks: e.target.checked }));
    $('.sp-nav').addEventListener('click', (e) => {
      const b2 = e.target.closest('[data-nav]');
      if (b2) this.nav(b2.dataset.nav);
    });
    attachTip($('.sp-trace'), (ev) => this.tip(ev, '.sp-trace'));
    attachTip($('.sp-rho'), (ev) => this.tip(ev, '.sp-rho'));
    const src = this.getAttribute('src');
    fetch(src).then((r) => r.json()).then((obj) => {
      this.data = fromSpaJSON(obj);
      this.set({ from: 0, to: this.data.n });
    }).catch((err) => { $('.sp-out').textContent = `No se pudo cargar ${src}: ${err.message}`; });
  }

  // Tramos con nombre, los de los botones.
  views() {
    const d = this.data, r = d.rounds;
    return {
      todo: [0, d.n],
      // Con algo de margen antes (el AddRoundKey inicial) y hasta el final justo de la ronda.
      dos: [r[0].from - 60, r[1].to],
      ronda: [r[0].from - 60, r[0].to],
      ataque: this.attackWindow ?? [r[0].from - 23, r[0].from + 277],
    };
  }

  view(name) {
    const v = this.data && this.views()[name];
    if (v) this.set({ from: v[0], to: v[1] });
  }

  nav(dir) {
    if (!this.data) return;
    const { from, to } = this.model.get(), span = to - from, n = this.data.n;
    let a = from, b = to;
    if (dir === 'left') { a = from - span / 2; b = to - span / 2; }
    if (dir === 'right') { a = from + span / 2; b = to + span / 2; }
    if (dir === 'in') { a = from + span / 4; b = to - span / 4; }
    if (dir === 'out') { a = from - span / 2; b = to + span / 2; }
    let width = Math.max(MIN_SPAN, Math.min(n, Math.round(b - a)));
    a = Math.max(0, Math.min(n - width, Math.round(a)));
    this.set({ from: a, to: a + width });
  }

  render() {
    const d = this.data;
    if (!d) { this.$('.sp-out').textContent = 'Cargando la traza medida…'; return; }
    const { from, to, marks } = this.model.get();
    const W = plotWidth();
    this.W = W;
    this.xs = scaleLinear([from, to], [L, W - R]);
    this.$('.sp-marks').checked = marks;
    const views = this.views();
    const current = Object.keys(views).find((v) => views[v][0] === from && views[v][1] === to) ?? '';
    for (const b of this.querySelectorAll('[data-view]')) {
      b.classList.toggle('on', b.dataset.view === current);
      b.setAttribute('aria-pressed', String(b.dataset.view === current));
    }
    const visible = d.rounds.filter((r) => r.to > from && r.from < to);
    this.drawTrace(d, from, to, marks, W);
    this.drawRho(d, from, to, marks, W);
    this.drawMap(d, from, to, W);

    const us = (s) => es((s / d.hz) * 1e6, 0);
    const whole = from === 0 && to === d.n;
    const span = `Se ven las muestras <b>${miles(from)}</b> a <b>${miles(to)}</b>: ${miles(to - from)} ciclos de reloj, ${us(to - from)} µs.`;
    const note = whole
      ? `El cifrado acaba hacia la muestra ${miles(d.end)}; lo que sigue es el firmware, que prepara y envía el criptograma.${marks ? ` Las ${d.rounds.length} bandas son las rondas: las nueve primeras duran ${miles(d.period)} muestras cada una.` : ''}`
      : visible.length
        ? `${visible.length === 1 ? `Es la ronda ${visible[0].round}` : `Son las rondas ${visible[0].round} a ${visible[visible.length - 1].round}`}${marks ? '' : ' (marca las rondas para ver dónde empieza cada una)'}.`
        : 'Aquí no hay ninguna ronda: es el principio o el final de la traza.';
    const [wa, wb] = this.attackWindow ?? [0, 0];
    const bar = marks && wb > from && wa < to && !(wa <= from && wb >= to)
      ? ` La raya naranja de abajo señala las muestras ${wa} a ${wb}, las que usa el ataque.` : '';
    this.$('.sp-out').innerHTML = `${span} ${note}${bar}`;
    Object.assign(this.dataset, { from: String(from), to: String(to), view: current, marks: String(marks),
      rounds: String(d.rounds.length), period: String(d.period), visible: String(visible.length) });
    this.markRendered();
  }

  // Marcas del eje de muestras y bandas de las rondas, comunes a las dos gráficas.
  frame(svg, H, T, B, from, to, marks, W, labels) {
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const x = this.xs, g = [];
    if (marks) {
      for (const r of this.data.rounds) {
        const a = Math.max(from, r.from), b = Math.min(to, r.to);
        if (b <= a) continue;
        g.push(h('rect', { class: `sp-band${r.round % 2 ? '' : ' alt'}`, x: x(a), width: x(b) - x(a), y: T, height: H - B - T }));
        const w = x(b) - x(a);
        if (labels && w >= 20) {
          g.push(h('text', { class: 'ax ax-m sp-round', x: (x(a) + x(b)) / 2, y: T - 5 }, w >= 76 ? `ronda ${r.round}` : r.round));
        }
      }
    }
    const step = tickStep(to - from, W > 500 ? 9 : 5);
    for (let s = Math.ceil(from / step) * step; s <= to; s += step) {
      if (x(s) > W - R - 12 && s !== to) continue;
      g.push(h('text', { class: 'ax ax-m', x: x(s), y: H - B + 15 }, miles(s)));
    }
    return g;
  }

  // Camino de una serie en el tramo visible: envolvente (mínimo y máximo por
  // columna) si hay varias muestras por píxel; línea si se ven una a una.
  series(values, from, to, W, y, only = null) {
    const cols = Math.round(W - L - R), perCol = (to - from) / cols;
    if (perCol <= 1.2) {
      let d = '';
      for (let s = from; s < to; s++) d += `${s === from ? 'M' : 'L'}${this.xs(s).toFixed(1)},${y(values[s]).toFixed(1)}`;
      return { d, line: true };
    }
    const { lo, hi } = envelope(values, from, to, cols);
    let d = '';
    for (let c = 0; c < cols; c++) d += `${c ? 'L' : 'M'}${(L + c + 0.5).toFixed(1)},${y(hi[c]).toFixed(1)}`;
    if (only === 'max') return { d, line: true };
    for (let c = cols - 1; c >= 0; c--) d += `L${(L + c + 0.5).toFixed(1)},${y(lo[c]).toFixed(1)}`;
    return { d: `${d}Z`, line: false };
  }

  drawTrace(d, from, to, marks, W) {
    const svg = this.$('.sp-trace'), H = 220, T = 28, B = 24;
    const y = scaleLinear([0, 160], [H - B, T]);
    const g = this.frame(svg, H, T, B, from, to, marks, W, true);
    for (const v of [0, 40, 80, 120, 160]) {
      g.push(h('line', { class: 'grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      g.push(h('text', { class: 'ax ax-r', x: L - 6, y: y(v) + 3.5 }, v));
    }
    g.push(h('text', { class: 'ax', x: 6, y: 11 }, `lectura media del ADC (${d.traces} trazas)`));
    const s = this.series(d.mean, from, to, W, (v) => y(Math.min(160, v)));
    g.push(h('path', { class: s.line ? 'sp-line' : 'sp-env', d: s.d }));
    if (this.attackWindow && marks) {
      const [a, b] = this.attackWindow;
      if (b > from && a < to && !(a <= from && b >= to)) {
        g.push(h('rect', { class: 'sp-attack', x: this.xs(Math.max(from, a)), width: this.xs(Math.min(to, b)) - this.xs(Math.max(from, a)), y: H - B - 5, height: 5 }));
      }
    }
    g.push(h('line', { class: 'cross', x1: -10, x2: -10, y1: T, y2: H - B }));
    g.push(h('rect', { class: 'hit', x: 0, y: 0, width: W, height: H }));
    svg.replaceChildren(...g);
  }

  drawRho(d, from, to, marks, W) {
    const svg = this.$('.sp-rho'), H = 150, T = 10, B = 34;
    const y = scaleLinear([0, 1], [H - B, T]);
    const g = this.frame(svg, H, T, B, from, to, marks, W, false);
    for (const v of [0, 0.5, 1]) {
      g.push(h('line', { class: 'grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      g.push(h('text', { class: 'ax ax-r', x: L - 6, y: y(v) + 3.5 }, es(v, 1)));
    }
    g.push(h('text', { class: 'ax ax-m', x: (L + W - R) / 2, y: H - 4 }, 'muestra (un ciclo de reloj del microcontrolador cada una)'));
    g.push(h('path', { class: 'sp-r10', d: this.series(d.rho10, from, to, W, y, 'max').d }));
    g.push(h('path', { class: 'sp-r1', d: this.series(d.rho1, from, to, W, y, 'max').d }));
    g.push(h('line', { class: 'cross', x1: -10, x2: -10, y1: T, y2: H - B }));
    g.push(h('rect', { class: 'hit', x: 0, y: 0, width: W, height: H }));
    svg.replaceChildren(...g);
  }

  // Tira que sitúa el tramo visible dentro de la traza entera.
  drawMap(d, from, to, W) {
    const svg = this.$('.sp-map'), H = 14;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const x = scaleLinear([0, d.n], [L, W - R]);
    svg.replaceChildren(
      h('rect', { class: 'sp-mapall', x: L, y: 4, width: W - R - L, height: 6, rx: 3 }),
      h('rect', { class: 'sp-mapview', x: x(from), y: 2, width: Math.max(3, x(to) - x(from)), height: 10, rx: 3 }),
    );
  }

  tip(ev, which) {
    const d = this.data;
    if (!d) return '';
    const box = this.$(which).getBoundingClientRect(), W = this.W;
    const px = ((ev.clientX - box.left) / box.width) * W;
    if (px < L || px > W - R) return '';
    const { from, to } = this.model.get();
    const s = Math.max(from, Math.min(to - 1, Math.round(this.xs.invert(px))));
    for (const sel of ['.sp-trace', '.sp-rho']) {
      const cross = this.$(sel).querySelector('.cross');
      cross.setAttribute('x1', this.xs(s)); cross.setAttribute('x2', this.xs(s));
    }
    const round = roundAt(d.rounds, s);
    const div = document.createElement('div');
    div.innerHTML = `<b>muestra ${miles(s)}</b> · ${es((s / d.hz) * 1e6, 1)} µs tras el trigger${round ? ` · ronda ${round}` : ''}<br>
      lectura media <b>${es(d.mean[s], 1)}</b><br>
      <i class="lk lk-ok"></i><b>${es(d.rho1[s], 2)}</b> |ρ| con la ronda 1<br><i class="lk sp-lk10"></i><b>${es(d.rho10[s], 2)}</b> |ρ| con la ronda 10`;
    return div;
  }
}

define('cpa-spa', CpaSpa);
