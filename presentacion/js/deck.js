// Motor de la presentación, sin dependencias.
//
// - Escenario fijo de 1920×1080 escalado a la ventana (el resto es letterbox).
// - Una <section class="diapo"> por diapositiva, con id, data-titulo,
//   data-seccion y data-pasos (pasos extra). Lo que lleva data-paso="k" aparece
//   en el paso k y se queda; lo que lleva data-solo="k", solo en el paso k.
// - Módulos: cada .escena[data-modulo] (ruta relativa a presentacion/) se
//   importa cuando su diapositiva es la actual o la siguiente, con el contrato
//   común: mount(container, {...data-opciones, static}) → { steps, start(),
//   stop(), step(n), dispose() }. Si falla, se queda el póster (img.poster).
//   El motor anota el montaje en data-montaje (lista o fallo): data-estado y
//   data-ready son del módulo.
// - Vídeos (js/figuras/cine-v*.js): si no cargan, avisan con el evento
//   «cine-respaldo» y, si hay WebGL, en su sitio se monta la escena Three.js
//   de data-respaldo, con las mismas data-opciones. Sin WebGL se quedan sus
//   fotos fijas.
// - ?estatico: sin transiciones, cada diapositiva en su último paso (o en el de
//   data-paso-pdf, que también recibe su escena como options.step) y los
//   módulos con static: true (lo usa scripts/exportar.mjs para el PDF).
// - Teclado (el ratón no navega): → ↓ AvPág Espacio Intro avanzan; ← ↑ RePág
//   retroceden; Inicio y Fin; un número + Intro salta; F pantalla completa;
//   B o «.» pantalla en negro; N abre la vista del ponente (notas.html), que
//   habla con esta página por BroadcastChannel('presentacion').
// - API: window.deck = { ir(i, paso), siguiente(), anterior(), indice, paso,
//   total, diapositivas, cue(nombre) }. cue() suena con Cuelume solo si el
//   interruptor de sonido está activado (empieza apagado).
const ANCHO = 1920, ALTO = 1080;
const ESTATICO = new URLSearchParams(location.search).has('estatico');
if (ESTATICO) document.documentElement.classList.add('estatico');

const escenario = document.querySelector('.escenario');
const diapos = [...document.querySelectorAll('.diapo')];
const total = diapos.length;
const indSeccion = escenario.querySelector('.indicador.seccion');
const indNumero = escenario.querySelector('.indicador.numero');
let indice = -1, paso = 0, navegaciones = 0;

const pasosDe = (i) => Math.max(0, parseInt(diapos[i]?.dataset.pasos ?? '0', 10) || 0);
// Paso con el que sale la diapositiva en el PDF: data-paso-pdf o el último.
const pasoPdf = (d) => (d.dataset.pasoPdf != null ? +d.dataset.pasoPdf : null);
const escenasDe = (d) => [...d.querySelectorAll('.escena[data-modulo]')];
const avisar = (que, err) => console.warn(`Presentación: ${que}.`, err?.message ?? err ?? '');

function escalar() {
  escenario.style.setProperty('--s', Math.min(innerWidth / ANCHO, innerHeight / ALTO));
}
addEventListener('resize', escalar);
escalar();

// ── Navegación ──
function ir(i, p) {
  i = Math.max(0, Math.min(total - 1, Number.isFinite(+i) ? Math.trunc(+i) : 0));
  const max = pasosDe(i);
  p = p == null ? (ESTATICO ? Math.min(max, pasoPdf(diapos[i]) ?? max) : 0) : Math.max(0, Math.min(max, Math.trunc(+p) || 0));
  if (i === indice && p === paso) return;
  const cambia = i !== indice;
  if (cambia) {
    if (indice >= 0) escenasDe(diapos[indice]).forEach(parar);
    diapos.forEach((d, k) => {
      d.classList.toggle('actual', k === i);
      d.classList.toggle('pasada', k < i);
      d.inert = k !== i;
      d.setAttribute('aria-hidden', String(k !== i));
    });
  }
  indice = i;
  paso = p;
  const d = diapos[i];
  for (const el of d.querySelectorAll('[data-paso]')) el.classList.toggle('visible', +el.dataset.paso <= p);
  for (const el of d.querySelectorAll('[data-solo]')) el.classList.toggle('visible', +el.dataset.solo === p);
  if (cambia) {
    indSeccion.textContent = d.dataset.seccion ?? '';
    indNumero.textContent = i === 0 ? '' : String(i + 1);
    try { history.replaceState(null, '', `#${d.id}`); } catch { /* file:// o sandbox */ }
    // La actual y la siguiente: así la siguiente ya está montada al llegar.
    [d, diapos[i + 1]].filter(Boolean).forEach((x) => escenasDe(x).forEach(montar));
  }
  escenasDe(d).forEach((el) => sincronizar(el, cambia));
  emitir();
}

function siguiente() {
  navegaciones++;
  if (paso < pasosDe(indice)) ir(indice, paso + 1);
  else if (indice < total - 1) ir(indice + 1, 0);
}

function anterior() {
  navegaciones++;
  if (paso > 0) ir(indice, paso - 1);
  else if (indice > 0) ir(indice - 1, pasosDe(indice - 1));
}

const saltar = (i, p) => { navegaciones++; ir(i, p); };

// ── Módulos (.escena[data-modulo]) ──
let webgl;
function hayWebGL() {
  if (webgl === undefined) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
      webgl = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { webgl = false; }
  }
  return webgl;
}

function montar(el) {
  el._montaje ??= (async () => {
    const ruta = el.dataset.modulo;
    try {
      if (el.hasAttribute('data-3d') && !hayWebGL()) throw new Error('el navegador no tiene WebGL');
      const opciones = JSON.parse(el.dataset.opciones || '{}');
      const pdf = pasoPdf(el.closest('.diapo'));
      if (ESTATICO && pdf != null) opciones.step = pdf;
      const mod = await import(new URL(ruta, document.baseURI).href);
      el._escena = await mod.mount(el, { ...opciones, static: ESTATICO });
      el.dataset.montaje = 'lista';
      sincronizar(el, true);
    } catch (err) {
      el.dataset.montaje = 'fallo';
      avisar(`no se pudo montar ${ruta}; se queda el póster`, err);
      respaldo(el);
    }
  })();
  return el._montaje;
}

// Arranca la escena si su diapositiva es la actual y le pasa el paso, recortado
// a los pasos que tiene (una diapositiva puede tener más que su figura).
function sincronizar(el, entrando = false) {
  const inst = el._escena;
  if (!inst || ESTATICO || el.closest('.diapo') !== diapos[indice]) return;
  try {
    if (!el._activa) { el._activa = true; entrando = true; inst.start?.(); }
    const p = Math.min(paso, Math.max(0, (inst.steps ?? 1) - 1));
    if (entrando || el._paso !== p) { el._paso = p; inst.step?.(p); }
  } catch (err) { avisar(`la escena ${el.dataset.modulo} falló al arrancar`, err); }
}

function parar(el) {
  if (!el._activa) return;
  el._activa = false;
  el._paso = undefined;
  try { el._escena?.stop?.(); } catch (err) { avisar(`la escena ${el.dataset.modulo} falló al parar`, err); }
}

// El cambio espera a que el vídeo acabe de pasar a sus fotos: el evento sale a mitad de ese paso.
document.addEventListener('cine-respaldo', ({ target: el }) => setTimeout(() => {
  if (!el.dataset?.respaldo || !hayWebGL()) return;
  parar(el);
  try { el._escena?.dispose?.(); } catch (err) { avisar(`la escena ${el.dataset.modulo} falló al desmontarse`, err); }
  el._escena = el._montaje = null;
  el.dataset.modulo = el.dataset.respaldo;
  delete el.dataset.respaldo;
  montar(el);
}));

// Si el módulo no carga y tampoco hay póster, un recuadro discreto con el nombre.
// Las figuras que traen su propio HTML (la clave, la apuesta) se quedan como están.
function respaldo(el) {
  if (el.dataset.montaje !== 'fallo' || el.querySelector(':scope > .poster, :scope > .poster-vacio')) return;
  if (el.querySelector(':scope > :not(.poster):not(.poster-vacio)')) return;
  const caja = document.createElement('div');
  caja.className = 'poster-vacio';
  caja.textContent = `Escena «${el.dataset.modulo.replace(/^.*\/|\.js$/g, '')}»`;
  el.append(caja);
}

for (const img of document.querySelectorAll('.escena > img.poster')) {
  const quitar = () => { const el = img.parentElement; img.remove(); respaldo(el); };
  if (img.complete && !img.naturalWidth) quitar();
  else img.addEventListener('error', quitar, { once: true });
}

// ── Sonido (Cuelume), solo en acciones de valor y con interruptor visible ──
let sonido = false;
try { sonido = localStorage.getItem('presentacion:sonido') === 'si'; } catch { /* sin almacenamiento */ }
let cuelume;
function cue(nombre, opciones = {}) {
  if (!sonido || ESTATICO) return;
  cuelume ??= import('../vendor/cuelume/index.js').catch((err) => { avisar('Cuelume no cargó', err); return null; });
  cuelume.then((m) => { try { m?.play(nombre, { volume: 0.7, ...opciones }); } catch { /* sin audio */ } });
}
const botonSonido = escenario.querySelector('.sonido');
function pintarSonido() {
  botonSonido.setAttribute('aria-pressed', String(sonido));
  botonSonido.setAttribute('aria-label', sonido ? 'Sonido activado (pulsa para silenciar)' : 'Sonido desactivado (pulsa para activarlo)');
  botonSonido.querySelector('.etq').textContent = sonido ? 'Sonido' : 'Silencio';
}
botonSonido.addEventListener('click', () => {
  sonido = !sonido;
  try { localStorage.setItem('presentacion:sonido', sonido ? 'si' : 'no'); } catch { /* sin almacenamiento */ }
  pintarSonido();
});
pintarSonido();

// ── Teclado (el ratón y la rueda no navegan) ──
const negro = document.querySelector('.negro');
let numero = '', numeroT;
addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target, k = e.key;
  const escribiendo = t.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
  // Los mandos de presentación mandan RePág y AvPág: navegan siempre.
  if (k === 'PageDown' || k === 'PageUp') {
    e.preventDefault();
    if (escribiendo) t.blur();
    return k === 'PageDown' ? siguiente() : anterior();
  }
  if (escribiendo) return;
  if ((k === ' ' || k === 'Enter') && t.closest?.('button, a, summary')) return; // activa el control
  if (/^[0-9]$/.test(k)) {
    numero += k;
    clearTimeout(numeroT);
    numeroT = setTimeout(() => { numero = ''; }, 2500);
    return;
  }
  switch (k) {
    case 'ArrowRight': case 'ArrowDown': case ' ':
      e.preventDefault(); siguiente(); break;
    case 'Enter':
      e.preventDefault();
      if (numero) { saltar(+numero - 1); numero = ''; } else siguiente();
      break;
    case 'ArrowLeft': case 'ArrowUp':
      e.preventDefault(); anterior(); break;
    case 'Home': e.preventDefault(); saltar(0); break;
    case 'End': e.preventDefault(); saltar(total - 1); break;
    case 'f': case 'F':
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch((err) => avisar('sin pantalla completa', err));
      break;
    case 'b': case 'B': case '.': negro.hidden = !negro.hidden; break;
    case 'n': case 'N': window.open('notas.html', 'notas-ponente', 'width=1280,height=860'); break;
    case 'Escape': numero = ''; negro.hidden = true; break;
  }
});
// Tras un clic con el ratón en un botón, el foco vuelve a la página: así
// Espacio e Intro siguen avanzando en lugar de volver a pulsar el botón.
document.addEventListener('click', (e) => { if (e.detail > 0) e.target.closest?.('button')?.blur(); });

// ── Hash: #n (desde 1) o #id ──
function desdeHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return null;
  if (/^\d+$/.test(h)) return +h - 1;
  const k = diapos.findIndex((d) => d.id === h);
  return k >= 0 ? k : null;
}
addEventListener('hashchange', () => { const k = desdeHash(); if (k != null && k !== indice) saltar(k); });

// ── Vista del ponente ──
const canal = 'BroadcastChannel' in window && !ESTATICO ? new BroadcastChannel('presentacion') : null;
function emitir() {
  if (!canal) return;
  const d = diapos[indice], s = diapos[indice + 1], notas = d.querySelector('.notas');
  canal.postMessage({
    tipo: 'estado', indice, total, paso, pasos: pasosDe(indice) + 1, navegaciones,
    id: d.id, titulo: d.dataset.titulo, seccion: d.dataset.seccion ?? '',
    notas: notas?.innerHTML ?? '', quien: notas?.dataset.quien ?? '', tiempo: notas?.dataset.tiempo ?? '',
    siguiente: s ? { indice: indice + 1, titulo: s.dataset.titulo } : null,
  });
}
canal?.addEventListener('message', ({ data: m }) => {
  if (m?.tipo === 'pedir') emitir();
  else if (m?.tipo === 'siguiente') siguiente();
  else if (m?.tipo === 'anterior') anterior();
  else if (m?.tipo === 'ir') saltar(m.indice, m.paso);
});

window.deck = {
  ir: (i, p) => ir(i, p),
  siguiente,
  anterior,
  get indice() { return indice; },
  get paso() { return paso; },
  total,
  diapositivas: diapos,
  pasos: pasosDe,
  cue,
};
ir(desdeHash() ?? 0);
