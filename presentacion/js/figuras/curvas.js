// Curvas de éxito MEDIDAS (web/data/nano-curvas.json, de analisis/reales.py):
// para cada variante, la fracción de las ordenaciones aleatorias de la campaña
// en las que el CPA tiene ya la clave completa con N trazas. Marca el punto del
// 90 % de cada serie, que es la cifra que se compara en la memoria.
//
//   data-opciones='{"series":["tinyaes"]}'
//   data-opciones='{"series":["cm-base","cm-barajado","cm-retardos"],"aparece":1}'
//   "nombres": { serie: texto } cambia el nombre de la leyenda (si no, la etiqueta de los datos).
//
// «aparece»: paso de la diapositiva en el que se ve la figura; las líneas se
// dibujan al llegar a él.
const DATA = new URL('../../../web/data/nano-curvas.json', import.meta.url);
const NS = 'http://www.w3.org/2000/svg';
const TONE = { tinyaes: 'serie-a', 'cm-base': 'serie-b', 'cm-barajado': 'serie-a', 'cm-retardos': 'serie-c' };
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(name, attrs = {}, text) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}
const miles = (n) => (n >= 10000 ? n.toLocaleString('es-ES').replace(/\./g, ' ') : String(n));

export function mount(container, options = {}) {
  const names = options.series ?? ['tinyaes'];
  const appears = options.aparece ?? 0;
  container.innerHTML = '<div class="curvas-leyenda"></div><svg class="curvas-svg" aria-hidden="true"></svg>';
  container.setAttribute('role', 'img');
  const svg = container.querySelector('svg'), legend = container.querySelector('.curvas-leyenda');
  let lines = [], drawn = false, disposed = false;

  const draw = () => {
    if (drawn || !lines.length) return;
    drawn = true;
    if (options.static || RM) return;
    for (const p of lines) {
      const len = p.getTotalLength();
      p.style.transition = 'none';
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
      void p.getBoundingClientRect();
      p.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1) .1s';
      p.style.strokeDashoffset = '0';
    }
  };

  fetch(DATA).then((r) => r.json()).then((data) => {
    if (disposed) return;
    const series = names.map((name) => ({ name, ...data.series[name], etiqueta: options.nombres?.[name] ?? data.series[name].etiqueta }));
    const single = series.length === 1;
    const W = svg.clientWidth || 900, H = svg.clientHeight || 460;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const L = 84, R = 28, T = 64, B = 78;
    const lo = options.desde ?? (single ? 10 : 5);
    const hi = Math.max(...series.map((s) => s.pasos.at(-1)));
    const X = (n) => L + (Math.log(n / lo) / Math.log(hi / lo)) * (W - L - R);
    const Y = (f) => T + (1 - f) * (H - T - B);

    for (const f of [0, 0.5, 1]) {
      svg.append(el('line', { class: 'rejilla', x1: L, x2: W - R, y1: Y(f), y2: Y(f) }));
      svg.append(el('text', { x: L - 16, y: Y(f) + 8, 'text-anchor': 'end' }, `${f * 100} %`));
    }
    svg.append(el('line', { class: 'ref', x1: L, x2: W - R, y1: Y(0.9), y2: Y(0.9) }));
    svg.append(el('text', { x: L - 16, y: Y(0.9) + 8, 'text-anchor': 'end' }, '90 %'));
    for (const n of [10, 20, 50, 100, 200, 300, 500, 1000, 2000].filter((v) => v >= lo && v <= hi)) {
      if (!single && n === 300) continue;
      svg.append(el('text', { x: X(n), y: H - B + 38, 'text-anchor': 'middle' }, miles(n)));
    }
    svg.append(el('text', { x: (L + W - R) / 2, y: H - 6, 'text-anchor': 'middle' }, 'trazas usadas en el ataque (escala logarítmica)'));
    svg.append(el('text', { class: 'titulo-eje', x: 8, y: 22 }, `repeticiones con la clave entera (de ${data.ordenaciones})`));

    lines = series.map((s) => {
      const pts = s.pasos.map((n, i) => [n, s.exito[i]]).filter(([n]) => n >= lo);
      const d = pts.map(([n, f], i) => `${i ? 'L' : 'M'}${X(n).toFixed(1)} ${Y(f).toFixed(1)}`).join('');
      const p = el('path', { class: `linea ${TONE[s.name] ?? 'serie-a'}`, d, fill: 'none' });
      svg.append(p);
      return p;
    });
    // El punto del 90 % de cada serie, con su número.
    for (const s of series) {
      if (s.n90 == null) continue;
      const f = s.exito[s.pasos.indexOf(s.n90)];
      svg.append(el('circle', { class: `marca-n ${TONE[s.name]}`, cx: X(s.n90), cy: Y(f), r: 10 }));
      svg.append(el('text', { class: 'marca-texto', x: X(s.n90) - 16, y: Y(f) - 22, 'text-anchor': 'end', style: 'fill: var(--c-tinta)' }, String(s.n90)));
    }

    // Con una serie sobra la leyenda: lo dice el título del eje.
    legend.hidden = single;
    legend.innerHTML = single ? '' : series.map((s) => `<span><i class="${TONE[s.name]}"></i>${s.etiqueta}</span>`).join('');
    container.setAttribute('aria-label', series.map((s) => (s.n90 == null
      ? `${s.etiqueta}: no recupera la clave en ninguna repetición`
      : `${s.etiqueta}: el 90 % de las repeticiones tiene la clave con ${s.n90} trazas`)).join('. '));
    container.dataset.ready = '1';
    if (options.static || current >= appears) draw();
  }).catch((err) => { legend.textContent = 'No se pudieron cargar las curvas medidas.'; console.warn('curvas:', err); });

  let current = options.static ? appears : -1;
  return {
    steps: appears + 1,
    start() { drawn = false; },
    stop() { current = -1; },
    step(n) { current = n; if (n >= appears) draw(); },
    dispose() { disposed = true; container.replaceChildren(); },
  };
}
