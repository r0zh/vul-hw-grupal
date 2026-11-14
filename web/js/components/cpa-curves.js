// <cpa-curves>: cuántas trazas hacen falta, medido. Para cada variante, la
// fracción de las ordenaciones aleatorias de la campaña en las que el CPA ya
// tiene la clave completa con N trazas (data/nano-curvas.json, generado por
// analisis/reales.py: son las curvas de las figuras de la memoria).
//
//   <cpa-curves src="./data/nano-curvas.json" series="tinyaes"></cpa-curves>
//   <cpa-curves src="./data/nano-curvas.json" series="cm-base,cm-barajado,cm-retardos"></cpa-curves>
//
// Con una sola serie se dibuja también la fracción de bytes en primer puesto.
// Hooks: data-series, data-n50, data-n90, data-n100 (por serie, separados por
// comas; vacío si no se alcanza), data-orderings y data-rendered.
import { NoteElement, define } from '../kit/base.js';
import { h, scaleLog, scaleLinear } from '../kit/svg.js';
import { attachTip } from '../kit/tip.js';
import { es, miles, plotWidth, REAL_BADGE } from './common.js';

const L = 46, R = 16, H = 250, T = 18, B = 40;
// Una clase de color por posición: la primera serie es la de referencia.
const TONES = ['a', 'b', 'c'];

// Modelo puro: de la curva de una serie, el primer N con al menos esa fracción.
export function firstAtLeast(series, fraction) {
  const i = series.exito.findIndex((v) => v >= fraction);
  return i < 0 ? null : series.pasos[i];
}

export class CpaCurves extends NoteElement {
  build() {
    this.names = (this.getAttribute('series') ?? 'tinyaes').split(',').map((s) => s.trim()).filter(Boolean);
    this.innerHTML = `
      <div class="fig cv">
        <div class="fig-head"><span class="fig-tool comp">Componente · explora</span>${REAL_BADGE}</div>
        <div class="legend cv-legend"></div>
        <svg class="cv-plot" role="img" aria-label="Fracción de ordenaciones con la clave completa frente al número de trazas"></svg>
        <div class="out cv-out"></div>
      </div>`;
    this.$ = (s) => this.querySelector(s);
    attachTip(this.$('.cv-plot'), (ev) => this.tip(ev));
    const src = this.getAttribute('src');
    fetch(src).then((r) => r.json()).then((obj) => { this.data = obj; this.render(); })
      .catch((err) => { this.$('.cv-out').textContent = `No se pudo cargar ${src}: ${err.message}`; });
  }

  render() {
    const data = this.data;
    if (!data) { this.$('.cv-out').textContent = 'Cargando las curvas medidas…'; return; }
    const series = this.names.map((name) => ({ name, ...data.series[name] })).filter((s) => s.pasos);
    this.series = series;
    const single = series.length === 1;
    const W = plotWidth();
    this.W = W;
    const svg = this.$('.cv-plot');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const nMax = Math.max(...series.map((s) => s.pasos[s.pasos.length - 1]));
    const x = scaleLog([5, nMax], [L, W - R]), y = scaleLinear([0, 1], [H - B, T]);
    this.x = x;
    const g = [];
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      g.push(h('line', { class: 'grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      g.push(h('text', { class: 'ax ax-r', x: L - 6, y: y(v) + 3.5 }, `${v * 100} %`));
    }
    for (const n of [5, 10, 20, 50, 100, 200, 500, 1000, 2000].filter((v) => v <= nMax)) {
      g.push(h('text', { class: 'ax ax-m', x: x(n), y: H - B + 16 }, n));
    }
    g.push(h('text', { class: 'ax ax-m', x: (L + W - R) / 2, y: H - 4 }, 'trazas usadas en el ataque, N (escala logarítmica)'));
    g.push(h('line', { class: 'ref', x1: L, x2: W - R, y1: y(0.9), y2: y(0.9) }));
    g.push(h('text', { class: 'ax', x: L + 6, y: y(0.9) - 5 }, '90 % de las ordenaciones'));
    series.forEach((s, i) => {
      const tone = TONES[i % TONES.length];
      if (single) {
        g.push(h('path', { class: 'cv-bytes', d: s.pasos.map((n, j) => `${j ? 'L' : 'M'}${x(n).toFixed(1)},${y(s.bytes[j]).toFixed(1)}`).join('') }));
      }
      g.push(h('path', { class: `cv-line cv-${tone}`, d: s.pasos.map((n, j) => `${j ? 'L' : 'M'}${x(n).toFixed(1)},${y(s.exito[j]).toFixed(1)}`).join('') }));
      for (let j = 0; j < s.pasos.length; j++) {
        g.push(h('circle', { class: `cv-dot cv-${tone}`, cx: x(s.pasos[j]), cy: y(s.exito[j]), r: 2.4 }));
      }
    });
    g.push(h('line', { class: 'cross', x1: -10, x2: -10, y1: T, y2: H - B }));
    g.push(h('rect', { class: 'hit', x: 0, y: 0, width: W, height: H }));
    svg.replaceChildren(...g);

    this.$('.cv-legend').innerHTML = series.map((s, i) =>
      `<span><i class="lk cv-lk cv-${TONES[i % TONES.length]}"></i>${single ? 'clave completa (los 16 bytes)' : s.etiqueta}</span>`).join('')
      + (single ? '<span><i class="lk cv-lkbytes"></i>bytes sueltos acertados</span>' : '')
      + `<span class="muted">de ${data.ordenaciones} ordenaciones aleatorias de las trazas</span>`;
    const describe = (s) => {
      const who = single ? 'La clave completa sale' : `<b>${s.etiqueta}</b>: la clave completa sale`;
      if (s.n50 == null) return `${single ? 'La clave completa no sale' : `<b>${s.etiqueta}</b>: la clave completa no sale`} en ninguna ordenación, ni con las ${miles(s.pasos[s.pasos.length - 1])} trazas.`;
      const last = miles(s.pasos[s.pasos.length - 1]);
      const tail = s.n100 == null ? `en el 90 % con <b>${s.n90}</b>; con ${last} todavía falla alguna (acierta el ${es(100 * s.exito[s.exito.length - 1], 0)} %)`
        : s.n100 === s.n90 ? `y en todas con <b>${s.n90}</b>` : `en el 90 % con <b>${s.n90}</b> y en todas con <b>${s.n100}</b>`;
      return `${who} en la mitad de las ordenaciones con <b>${s.n50}</b> trazas, ${tail}.`;
    };
    this.$('.cv-out').innerHTML = series.map(describe).join('<br>');
    const list = (key) => series.map((s) => s[key] ?? '').join(',');
    Object.assign(this.dataset, { series: this.names.join(','), n50: list('n50'), n90: list('n90'), n100: list('n100'), orderings: String(data.ordenaciones) });
    this.markRendered();
  }

  tip(ev) {
    if (!this.series) return '';
    const svg = this.$('.cv-plot'), box = svg.getBoundingClientRect(), W = this.W;
    const px = ((ev.clientX - box.left) / box.width) * W;
    if (px < L || px > W - R) return '';
    const n = this.x.invert(px);
    // El punto de control más cercano (en escala logarítmica) de la primera serie.
    const steps = this.series[0].pasos;
    const near = steps.reduce((b, s) => (Math.abs(Math.log(s / n)) < Math.abs(Math.log(b / n)) ? s : b), steps[0]);
    const cross = svg.querySelector('.cross');
    cross.setAttribute('x1', this.x(near)); cross.setAttribute('x2', this.x(near));
    const div = document.createElement('div');
    div.innerHTML = `<b>N ≈ ${near} trazas</b><br>` + this.series.map((s, i) => {
      // Cada serie tiene sus propios puntos de control: se toma el más cercano.
      const j = s.pasos.reduce((b, v, k) => (Math.abs(Math.log(v / near)) < Math.abs(Math.log(s.pasos[b] / near)) ? k : b), 0);
      const far = Math.abs(Math.log(s.pasos[j] / near)) > 0.2;
      const extra = this.series.length === 1 ? ` · ${es(100 * s.bytes[j], 1)} % de los bytes` : '';
      return `<i class="lk cv-lk cv-${TONES[i % TONES.length]}"></i><b>${far ? '—' : `${es(100 * s.exito[j], 0)} %`}</b> ${this.series.length === 1 ? 'con la clave completa' : s.etiqueta}${far ? '' : ` (N = ${s.pasos[j]})`}${extra}`;
    }).join('<br>');
    return div;
  }
}

define('cpa-curves', CpaCurves);
