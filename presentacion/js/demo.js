// La demo en directo del ataque CPA: llegan trazas (de la placa, grabadas o
// simuladas), un Web Worker (cpa-worker.js) hace el CPA y la clave se rellena
// byte a byte.
//
//   const demo = mount(contenedor, { modo, ritmo, n, static });
//   demo.start(); demo.step(0); … demo.stop(); demo.dispose();
//
// Datos: el SSE de /api/vivo (uv run python -m captura.vivo) si /api/estado
// responde. Si no (servidor estático o GitHub Pages), las 400 trazas medidas de
// web/data/nano-tinyaes.json, reproducidas aquí a 18,6 trazas/s como «grabado».
// El SSE se lee con fetch y no con EventSource porque EventSource se reconecta
// solo cuando el flujo se cierra, y eso relanzaría la captura en la placa.
//
// La clave real solo sirve para pintar de verde los bytes acertados: el CPA del
// worker elige cada byte sin mirarla. Es la que se carga en la placa: la de la
// diapositiva «pregunta» (sessionStorage 'demo:clave') o la de laboratorio.
//
// En el contenedor, para las pruebas: data-estado (listo, capturando, hecho o
// error), data-modo, data-n, data-recuperados y data-ready.
import { PALETA, css } from './paleta.js';
import { fromCampaignJSON } from '../../web/js/model/cpa.js';

const LAB_KEY = '2b7e151628aed2a6abf7158809cf4f3c';
const RITMO = 18.6;          // trazas/s medidas con el Nano (hardware/README.md)
const N_TRAZAS = 400;
const VENTANA = [440, 740];  // muestras de la SubBytes de la primera ronda
const LOTE_MS = 250;
const GRABADO = new URL('../../web/data/nano-tinyaes.json', import.meta.url);
const MODOS = { nano: 'En directo', grabado: 'Grabado', simulado: 'Simulado' };
const ETIQUETAS = {
  nano: 'Captura en directo del ChipWhisperer-Nano',
  grabado: 'Trazas grabadas el 13-11-2026, clave de laboratorio',
  simulado: 'Trazas simuladas, no medidas: número de unos más ruido',
};
const CHIP = { nano: 'En vivo', grabado: 'Grabado', simulado: 'Simulado' };
const SIN_SERVIDOR = 'Necesita el servidor: uv run python -m captura.vivo';
const PAD = { l: 64, r: 104, t: 18, b: 44 };  // márgenes de la gráfica, en px
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ACENTO = css(PALETA.acento);

const hex2 = (b) => b.toString(16).padStart(2, '0');
const toHex = (bytes) => Array.from(bytes, hex2).join('');
const toBytes = (hex) => Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16));
const printable = (b) => b >= 0x20 && b < 0x7f;
const coma = (x, d) => x.toFixed(d).replace('.', ',');

// La clave que se carga en la placa (o en la simulación): la de la diapositiva «pregunta»,
// ASCII rellenado a 16 con espacios, o la de laboratorio si no hay ninguna.
function chosenKey() {
  let text = '';
  try { text = sessionStorage.getItem('demo:clave') ?? ''; } catch { /* sin almacenamiento */ }
  text = [...text].filter((c) => printable(c.charCodeAt(0))).join('').slice(0, 16);
  return text ? toHex([...text.padEnd(16, ' ')].map((c) => c.charCodeAt(0))) : LAB_KEY;
}

// La hoja de estilos de la demo, una vez por documento; resuelve cuando ha cargado.
function ensureCSS() {
  const href = new URL('../css/demo.css', import.meta.url).href;
  let link = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.href === href);
  if (link?.sheet) return Promise.resolve();
  if (!link) document.head.append(link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
  return new Promise((ok) => { link.addEventListener('load', ok, { once: true }); link.addEventListener('error', ok, { once: true }); });
}

// Sonido (Cuelume), solo al recuperar la clave y apagado salvo que se active. La
// preferencia es la del deck ('presentacion:sonido'): dentro del deck manda su
// interruptor y el de la demo se esconde; en demo.html se ve el de la demo.
let cuelume = null;
const sound = () => (cuelume ??= import('../vendor/cuelume/index.js').catch(() => null));
const soundOn = () => { try { return localStorage.getItem('presentacion:sonido') === 'si'; } catch { return false; } };

// Cifras que ruedan (cartera-en-vivo.html de la skill estetica-web): cada
// dígito es una columna 0-9 que se desplaza desde el valor anterior.
const DIGITS = [...'0123456789'].map((d) => `<span>${d}</span>`).join('');
function roll(el, text) {
  text = String(text);
  if (el.dataset.v === text) return;
  const prev = (el.dataset.v || '').replace(/\D/g, ''), digits = text.replace(/\D/g, '');
  const shape = text.replace(/\d/g, '0');
  if (el.dataset.k !== shape) {
    el.innerHTML = [...text].map((c) => (/\d/.test(c) ? `<span class="rd"><span class="rs">${DIGITS}</span></span>` : `<span class="rp">${c}</span>`)).join('');
    el.dataset.k = shape;
    el.querySelectorAll('.rs').forEach((s, i) => {
      const j = prev.length - (digits.length - i);
      s.style.transition = 'none';
      s.style.transform = `translateY(-${(j >= 0 ? +prev[j] : 0) * 1.1}em)`;
    });
    void el.offsetWidth;
    el.querySelectorAll('.rs').forEach((s) => { s.style.transition = ''; });
  }
  el.querySelectorAll('.rs').forEach((s, i) => {
    s.style.transitionDelay = `${RM ? 0 : i * 40}ms`;
    s.style.transform = `translateY(-${+digits[i] * 1.1}em)`;
  });
  el.dataset.v = text;
  el.setAttribute('aria-label', text);
}

// Lee un flujo SSE con fetch. Devuelve la función que lo corta.
function openStream(url, on) {
  const ctl = new AbortController();
  (async () => {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok || !res.body) throw new Error(`El servidor respondió ${res.status}`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '', ended = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      for (let i; (i = buf.indexOf('\n\n')) >= 0; buf = buf.slice(i + 2)) {
        const block = buf.slice(0, i);
        const name = /^event: (.*)$/m.exec(block)?.[1], data = /^data: (.*)$/m.exec(block)?.[1];
        if (!name || data == null) continue;
        ended ||= name === 'fin' || name === 'error';
        on[name]?.(JSON.parse(data));
      }
    }
    if (!ended) throw new Error('Se ha cortado la conexión con el servidor');
  })().catch((err) => { if (!ctl.signal.aborted) on.error({ mensaje: err.message }); });
  return () => ctl.abort();
}

// Las trazas medidas de la web, para cuando no hay servidor (y para el PDF).
let local = null;
const loadLocal = () => (local ??= fetch(GRABADO)
  .then((r) => { if (!r.ok) throw new Error(`No se pudo cargar ${GRABADO.pathname} (${r.status})`); return r.json(); })
  .then(fromCampaignJSON)
  .catch((err) => { local = null; throw err; }));

function localStart(c, n, ritmo) {
  return { modo: 'grabado', clave_hex: toHex(c.key), ventana: c.meta.muestras ?? VENTANA, n: Math.min(n, c.n), ritmo_esperado: ritmo, etiqueta: ETIQUETAS.grabado };
}
const localBatch = (c, from, to, ritmo) => ({
  i0: from, count: to - from, ritmo,
  plaintexts: c.plaintexts.slice(16 * from, 16 * to), traces: c.traces.slice(c.nSamples * from, c.nSamples * to),
});

// Reproduce las trazas de la web al ritmo pedido, con la misma interfaz que openStream.
function replayLocal(n, ritmo, on) {
  let timer = 0, stopped = false;
  loadLocal().then((c) => {
    if (stopped) return;
    const start = localStart(c, n, ritmo), t0 = performance.now();
    let sent = 0, credit = 0, last = t0;
    on.inicio(start);
    // Cada tic suma ritmo × tiempo, con un segundo como mucho: si la página se
    // atasca un rato, la reproducción va más despacio en vez de dar un salto.
    timer = setInterval(() => {
      const now = performance.now();
      credit += (Math.min(now - last, 4 * LOTE_MS) / 1000) * ritmo;
      last = now;
      const due = Math.min(start.n, sent + Math.floor(credit)), secs = (now - t0) / 1000;
      if (due > sent) { credit -= due - sent; on.lote(localBatch(c, sent, due, due / secs)); sent = due; }
      if (sent >= start.n) { clearInterval(timer); on.fin({ n: sent, segundos: secs }); }
    }, LOTE_MS);
  }).catch((err) => { if (!stopped) on.error({ mensaje: err.message }); });
  return () => { stopped = true; clearInterval(timer); };
}

// Mapa de calor 2D de |ρ(k, t)| (el «parecido»): el sustituto de la montaña 3D (escenas/montana.js).
function heatmap(host) {
  host.classList.add('demo-mapa');
  host.innerHTML = `<canvas aria-hidden="true"></canvas>
    <div class="demo-ejes" aria-hidden="true">
      <span class="t-y">candidato</span><span class="t-x">tiempo</span>
      ${[0, 0x40, 0x80, 0xc0, 0xff].map((k) => `<span class="k" style="top:calc(var(--mt) + (100% - var(--mt) - var(--mb)) * ${(k + 0.5) / 256})">0x${hex2(k)}</span>`).join('')}
      <span class="correcto"></span><i class="pico"></i><span class="pico-txt"></span>
    </div>`;
  host.setAttribute('role', 'img');
  const cv = host.querySelector('canvas'), off = document.createElement('canvas'), mark = host.querySelector('.correcto');
  const ring = host.querySelector('.pico'), ringText = host.querySelector('.pico-txt');
  const axes = host.querySelector('.demo-ejes'), octx = off.getContext('2d');
  // Escala de color fija y monótona, la misma con cualquier N: |ρ| de 0 a 0,65
  // en 256 niveles, de gris (el ruido, hacia 0,2, casi no se ve) a azul.
  const LOW = [232, 232, 237], HIGH = [(PALETA.acento >> 16) & 255, (PALETA.acento >> 8) & 255, PALETA.acento & 255];
  const LUT = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) LUT[3 * i + c] = LOW[c] + (HIGH[c] - LOW[c]) * (i / 255) ** 1.6;
  let last = null, ticksFor = '', img = null;
  const draw = () => {
    if (!last) return;
    const { rho, S, correct, n, offset } = last, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(devicePixelRatio || 1, 2), cw = Math.round(W * dpr), ch = Math.round(H * dpr);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    if (img?.width !== S) { off.width = S; off.height = 256; img = octx.createImageData(S, 256); img.data.fill(255); }
    let top = 0, best = 0;
    for (let i = 0; i < 256 * S; i++) {
      const a = Math.abs(rho[i]), q = 3 * Math.min(255, (a * (255 / 0.65)) | 0);
      if (a > best) { best = a; top = i; }
      img.data[4 * i] = LUT[q]; img.data[4 * i + 1] = LUT[q + 1]; img.data[4 * i + 2] = LUT[q + 2];
    }
    // El máximo de todo el mapa, con un anillo y su valor (en HTML).
    const at = (k, t) => `left:calc(var(--ml) + (100% - var(--ml) - var(--mr)) * ${(t + 0.5) / S});top:calc(var(--mt) + (100% - var(--mt) - var(--mb)) * ${(k + 0.5) / 256})`;
    const kTop = Math.floor(top / S), tTop = top % S;
    ring.style.cssText = ringText.style.cssText = at(kTop, tTop);
    ringText.textContent = `0x${hex2(kTop)} · parecido ${coma(best, 2)}`;
    ringText.classList.toggle('izq', tTop > S / 2);
    octx.putImageData(img, 0, 0);
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(off, 0, 0, cw, ch);
    if (ticksFor !== `${offset}/${S}`) {  // marcas redondas de la traza completa
      ticksFor = `${offset}/${S}`;
      axes.querySelectorAll('.x').forEach((el) => el.remove());
      const step = [10, 20, 25, 50, 100, 200, 250, 500].find((s) => (S - 1) / s <= 6) ?? 1000;
      for (let v = Math.ceil(offset / step) * step; v <= offset + S - 1; v += step) {
        axes.insertAdjacentHTML('beforeend', `<span class="x" style="left:calc(var(--ml) + (100% - var(--ml) - var(--mr)) * ${(v - offset) / (S - 1)})">${v}</span>`);
      }
    }
    mark.classList.toggle('on', correct != null);
    if (correct != null) {
      mark.textContent = `0x${hex2(correct)}`;
      mark.style.top = `calc(var(--mt) + (100% - var(--mt) - var(--mb)) * ${(correct + 0.5) / 256})`;
    }
    host.setAttribute('aria-label', `Mapa del parecido con ${n} trazas: candidatos en vertical y tiempo en horizontal`);
  };
  const ro = new ResizeObserver(draw);
  ro.observe(host);
  return {
    update(d) { last = d; draw(); },
    dispose() { ro.disconnect(); host.innerHTML = ''; host.classList.remove('demo-mapa'); },
  };
}

const ICON_ON = '<svg class="si" viewBox="0 0 24 24"><path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6a1.4 1.4 0 0 1-1 .4H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.8"/></svg>';
const ICON_OFF = '<svg class="no" viewBox="0 0 24 24"><path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6a1.4 1.4 0 0 1-1 .4H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';

const TEMPLATE = `
  <header class="demo-barra">
    <div class="demo-modos" role="radiogroup" aria-label="Origen de las trazas">
      ${Object.entries(MODOS).map(([m, t]) => `<button type="button" role="radio" aria-checked="false" data-modo="${m}">${t}</button>`).join('')}
    </div>
    <p class="demo-etiqueta" aria-live="polite"><i></i><span></span></p>
    <div class="demo-acciones">
      <button type="button" class="demo-sonido" aria-pressed="false">${ICON_ON}${ICON_OFF}<span>Sonido</span></button>
      <button type="button" class="demo-btn" data-accion="reiniciar">Reiniciar</button>
      <button type="button" class="demo-btn" data-accion="parar">Parar</button>
      <button type="button" class="demo-btn demo-capturar" data-accion="capturar">Capturar</button>
    </div>
  </header>
  <section class="demo-clave">
    <div class="demo-bytes" role="group" aria-label="Clave que deduce el ataque, byte a byte">
      ${Array.from({ length: 16 }, (_, j) => `<button type="button" class="demo-byte" data-j="${j}" aria-pressed="${j === 0}"><b>·</b><small></small><i class="demo-check">${CHECK}</i></button>`).join('')}
    </div>
    <p class="demo-nota">Verde: el ataque acierta el byte. La clave real solo se usa para colorear.</p>
  </section>
  <div class="demo-cuerpo">
    <div class="demo-izq">
      <div class="demo-kpis">
        <div class="demo-kpi"><span>Trazas</span><b><span class="roll" data-kpi="n"></span></b></div>
        <div class="demo-kpi"><span>Trazas por segundo</span><b><span class="roll" data-kpi="ritmo"></span></b></div>
        <div class="demo-kpi demo-kpi-clave"><span>Bytes recuperados</span><b><span class="roll" data-kpi="rec"></span><em>/16</em></b></div>
      </div>
      <section class="demo-panel demo-grafica">
        <header><h3>Byte <span data-sel>0</span>: el correcto frente al azar</h3><span class="demo-chip"><i></i><span></span></span></header>
        <div class="demo-lienzo">
          <canvas aria-hidden="true"></canvas>
          <div class="demo-ejes" aria-hidden="true">
            <span class="t-y">parecido</span>
            ${Y_TICKS.map((v) => `<span class="y" style="top:calc(var(--pt) + (100% - var(--pt) - var(--pb)) * ${1 - v})">${v ? coma(v, v % 0.5 ? 2 : 1).replace(',0', '') : '0'}</span>`).join('')}
            ${[0, 0.25, 0.5, 0.75, 1].map((f) => `<span class="x" data-f="${f}" style="left:calc(var(--pl) + (100% - var(--pl) - var(--pr)) * ${f})"></span>`).join('')}
          </div>
          <span class="demo-punta"></span>
        </div>
        <footer class="demo-leyenda"><span><i></i>El correcto</span><span><i class="l-falso"></i>Lo que puede hacer el azar: el falso con más suerte</span></footer>
      </section>
    </div>
    <section class="demo-panel demo-montana">
      <header><h3>Los 256 candidatos del byte <span data-sel>0</span></h3><span class="demo-sub"></span></header>
      <div class="demo-escena vacia"></div>
    </section>
  </div>
  <div class="demo-toast" role="status" aria-live="polite">
    <i class="ico">${CHECK}</i><div class="tx"><p></p><strong></strong><small></small></div>
  </div>
  <canvas class="demo-fx" aria-hidden="true"></canvas>`;

export function mount(container, options = {}) {
  const o = { ...options };
  o.n = +o.n >= 2 ? Math.min(5000, Math.floor(+o.n)) : N_TRAZAS;
  o.ritmo = +o.ritmo > 0 ? Math.min(10000, Math.max(0.1, +o.ritmo)) : RITMO;
  const isStatic = !!o.static;
  container.classList.add('demo');
  container.classList.toggle('demo-estatico', isStatic);
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'Demo del ataque: la clave sale de las trazas de consumo');
  container.innerHTML = TEMPLATE;
  const $ = (s) => container.querySelector(s);
  const cells = [...container.querySelectorAll('.demo-byte')];
  const kpi = { n: $('[data-kpi="n"]'), ritmo: $('[data-kpi="ritmo"]'), rec: $('[data-kpi="rec"]') };
  const lienzo = $('.demo-lienzo'), chart = $('.demo-lienzo canvas'), tip = $('.demo-punta');
  const toastEl = $('.demo-toast'), fxCanvas = $('.demo-fx');
  for (const [k, v] of Object.entries(PAD)) lienzo.style.setProperty(`--p${k}`, `${v}px`);

  // Estado de la demo y de la captura en curso.
  let modo = 'grabado', estado = 'listo', servidor = null, nanoMotivo = SIN_SERVIDOR;
  let sel = 0, gen = 0, received = 0, nAxis = o.n, S = 0, offset = 0, key = null, ascii = false;
  let history = [], shown = null, last = null, abort = null, ending = false, rewarded = false, streak = 0;
  let pending = false, dirty = false, onResultHook = null, sceneData = null;
  const listeners = new AbortController();
  let started = false, raf = 0, disposed = false, scene = null, toastTimer = 0, t0 = 0;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

  const worker = new Worker(new URL('./cpa-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => onResult(data);
  worker.onerror = (e) => fail(`No se pudo arrancar el CPA (${e.message || 'worker'})`);

  // ── Estado visible ──────────────────────────────────────────────────
  function setEstado(next, message) {
    estado = next;
    chartDirty = true;
    container.dataset.estado = next;
    const capturing = next === 'capturando';
    $('[data-accion="capturar"]').disabled = capturing || servidor === null;  // null: aún se pregunta al servidor
    $('[data-accion="parar"]').disabled = !capturing;
    $('[data-accion="reiniciar"]').disabled = next === 'listo';
    for (const b of container.querySelectorAll('.demo-modos button')) {
      const m = b.dataset.modo, ok = m === 'grabado' || (servidor && (m === 'simulado' || nanoMotivo === null));
      b.disabled = capturing || !ok;
      b.title = ok ? '' : servidor ? nanoMotivo : SIN_SERVIDOR;
    }
    if (next !== 'error') setLabel(last?.etiqueta ?? ETIQUETAS[modo], last?.aviso);
    else setLabel(message);
  }
  function setLabel(text, aviso) {
    $('.demo-etiqueta span').textContent = aviso ? `${text}. ${aviso}` : text;
  }
  function setModo(next) {
    modo = next;
    container.dataset.modo = next;
    for (const b of container.querySelectorAll('.demo-modos button')) b.setAttribute('aria-checked', String(b.dataset.modo === next));
    $('.demo-chip span').textContent = CHIP[next];
  }
  function fail(message) {
    if (disposed) return;
    abort?.(); abort = null;
    setEstado('error', message);
  }

  // ── Captura ─────────────────────────────────────────────────────────
  function clear() {
    abort?.(); abort = null;
    gen++; received = 0; history = []; shown = null; last = null; key = null; chartDirty = true;
    ending = false; rewarded = false; streak = 0; pending = false; dirty = false;
    sceneData = null;
    sceneBox.classList.add('vacia');
    hideToast();
    paintCells(null);
    roll(kpi.n, '0'); roll(kpi.ritmo, '0,0'); roll(kpi.rec, '0');
    $('.demo-kpi-clave').classList.remove('ok');
    $('.demo-sub').textContent = '';
    Object.assign(container.dataset, { n: '0', recuperados: '0' });
  }

  function capture() {
    if (estado === 'capturando' || disposed) return;
    clear();
    setEstado('capturando');
    t0 = performance.now();
    sound().then((m) => m?.unlock?.());
    // Lo que llegue de una captura anterior (ya cortada) se descarta.
    const mine = gen, only = (fn) => (x) => { if (gen === mine && !disposed) fn(x); };
    const on = { inicio: only(inicio), lote: only(lote), fin: only(fin), error: only((e) => fail(e.mensaje)) };
    if (!servidor) { abort = replayLocal(o.n, o.ritmo, on); return; }
    const q = new URLSearchParams({ modo, n: o.n, desde: VENTANA[0], hasta: VENTANA[1] });
    if (modo !== 'grabado') q.set('clave', chosenKey());
    if (modo !== 'nano') q.set('ritmo', o.ritmo);
    abort = openStream(`/api/vivo?${q}`, on);
  }

  function inicio(info) {
    last = info;
    key = toBytes(info.clave_hex);
    ascii = key.every(printable);
    container.classList.toggle('demo-hex', !ascii);
    [offset] = info.ventana;
    S = info.ventana[1] - info.ventana[0];
    nAxis = info.n;
    paintAxis();
    chartDirty = true;
    setLabel(info.etiqueta, info.aviso);
    worker.postMessage({ type: 'reset', gen, S, key });
  }

  function lote(b) {
    if (estado !== 'capturando') return;
    if (b.i0 !== received) { fail(`Lote fuera de orden: ${b.i0} en vez de ${received}`); return; }
    let { plaintexts, traces, count } = b;
    if (!plaintexts) {  // del servidor: JSON → arrays tipados
      count = b.textos.length;
      plaintexts = new Uint8Array(16 * count);
      traces = new Float32Array(S * count);
      for (let i = 0; i < count; i++) {
        if (b.trazas[i].length !== S) { fail(`La traza ${b.i0 + i} no tiene ${S} muestras`); return; }
        plaintexts.set(toBytes(b.textos[i]), 16 * i);
        traces.set(b.trazas[i], S * i);
      }
    }
    worker.postMessage({ type: 'add', gen, count, plaintexts, traces }, [plaintexts.buffer, traces.buffer]);
    received += count;
    roll(kpi.ritmo, coma(b.ritmo, 1));
    requestCompute();
  }

  function fin() {
    abort = null;
    finish();
  }

  // Parar o terminar: el último CPA con todas las trazas y después «hecho».
  function finish() {
    ending = true;
    if (received < 2) setEstado(received ? 'hecho' : 'listo');
    else requestCompute();
  }

  function stopCapture() {
    if (estado !== 'capturando') return;
    abort?.(); abort = null;
    finish();
  }

  function requestCompute() {
    if (pending) { dirty = true; return; }
    pending = true; dirty = false;
    worker.postMessage({ type: 'compute', gen, byte: sel });
  }

  function onResult(r) {
    pending = false;
    if (r.error) {
      if (onResultHook) { const h = onResultHook; onResultHook = null; h(r); }
      if (r.gen === gen) fail(`El CPA ha fallado: ${r.error}`);
      return;
    }
    if (r.gen === gen && r.bytes) apply(r);
    if (onResultHook) { const h = onResultHook; onResultHook = null; h(r); return; }
    if (dirty) requestCompute();
    else if (ending && r.gen === gen && estado === 'capturando' && r.n === received) {
      setEstado('hecho');
      if (!rewarded && recoveredCount(r) === 16) reward(r.n);
    }
  }

  const recoveredCount = (r) => r.bytes.filter((b) => b.rank === 1).length;

  function apply(r) {
    if (!history.length || r.n > history.at(-1).n) {
      history.push({ n: r.n, c: Float32Array.from(r.bytes, (b) => b.correct), w: Float32Array.from(r.bytes, (b) => b.wrong) });
    }
    paintCells(r.bytes);
    chartDirty = true;
    const rec = recoveredCount(r);
    roll(kpi.n, r.n);
    roll(kpi.rec, rec);
    $('.demo-kpi-clave').classList.toggle('ok', rec === 16);
    $('.demo-sub').textContent = scene?.kind === '3d' ? '' : `N = ${r.n}`;
    Object.assign(container.dataset, { n: String(r.n), recuperados: String(rec) });
    if (r.byte === sel && r.rho) feedScene({ rho: r.rho, S: r.S, correct: key ? key[sel] : null, n: r.n, offset });
    else if (r.byte !== sel) dirty = true;  // ha cambiado el byte elegido a mitad de cálculo
    streak = rec === 16 ? streak + 1 : 0;
    if (streak >= 2 && !rewarded && !isStatic) reward(r.n);
  }

  // ── Pintar ──────────────────────────────────────────────────────────
  function paintCells(bytes) {
    cells.forEach((cell, j) => {
      const b = bytes?.[j], g = b ? b.guess : null;
      cell.classList.toggle('ok', !!b && b.rank === 1);
      cell.querySelector('b').textContent = g == null ? '·' : ascii ? (printable(g) ? String.fromCharCode(g) : '·') : hex2(g);
      cell.querySelector('small').textContent = g == null || !ascii ? '' : hex2(g);
      cell.setAttribute('aria-label', g == null ? `byte ${j}: sin datos` : `byte ${j}: 0x${hex2(g)}${b.rank === 1 ? ', acertado' : ''}`);
    });
  }

  function select(j) {
    sel = j;
    cells.forEach((c, i) => c.setAttribute('aria-pressed', String(i === j)));
    container.querySelectorAll('[data-sel]').forEach((el) => { el.textContent = j; });
    shown = null;
    chartDirty = true;
    if (received >= 2) requestCompute();
  }

  function paintAxis() {
    lienzo.querySelectorAll('.x').forEach((el) => {
      const f = +el.dataset.f, v = Math.round(nAxis * f);
      el.textContent = f === 1 ? `${v} trazas` : v;
    });
  }

  // Serie del byte elegido, con la punta que persigue al último valor.
  // `settling` dice si la punta aún no ha llegado (hay que seguir dibujando).
  let settling = false;
  function series() {
    settling = false;
    if (!history.length) return [];
    const pts = history.map((h) => ({ n: h.n, c: h.c[sel], w: h.w[sel] }));
    const end = pts.at(-1), k = RM || isStatic ? 1 : 0.16;
    shown ??= { ...end };
    if (shown.n > end.n) shown = { ...end };
    for (const f of ['n', 'c', 'w']) shown[f] += (end[f] - shown[f]) * k;
    settling = Math.abs(end.n - shown.n) > 0.05 || Math.abs(end.c - shown.c) > 1e-4 || Math.abs(end.w - shown.w) > 1e-4;
    pts[pts.length - 1] = shown;
    return pts;
  }

  // Dibuja la gráfica; devuelve si hay que volver a dibujarla en el fotograma siguiente.
  function drawChart(now) {
    const W = lienzo.clientWidth, H = lienzo.clientHeight;
    if (!W || !H) return true;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (chart.width !== Math.round(W * dpr) || chart.height !== Math.round(H * dpr)) {
      chart.width = Math.round(W * dpr); chart.height = Math.round(H * dpr);
    }
    const g = chart.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b;
    const X = (n) => PAD.l + (n / nAxis) * pw, Y = (v) => PAD.t + (1 - Math.min(1, v)) * ph;
    g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,.08)'; g.setLineDash([3, 5]);
    g.beginPath();
    for (const v of Y_TICKS) { g.moveTo(PAD.l, Y(v)); g.lineTo(PAD.l + pw, Y(v)); }
    g.stroke(); g.setLineDash([]);
    // Lo que puede hacer el azar es la línea gris, el falso con más suerte medido; sin curva de fórmula.
    const pts = series();
    tip.classList.toggle('on', pts.length > 0);
    if (!pts.length) return false;
    const path = (P) => {
      g.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length - 1; i++) g.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
      if (P.length > 1) g.lineTo(P.at(-1)[0], P.at(-1)[1]);
    };
    const wrong = pts.map((p) => [X(p.n), Y(p.w)]), right = pts.map((p) => [X(p.n), Y(p.c)]);
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); path(wrong); g.strokeStyle = '#a1a1a6'; g.lineWidth = 2.6; g.stroke();
    const fill = g.createLinearGradient(0, PAD.t, 0, PAD.t + ph);
    fill.addColorStop(0, `${ACENTO}38`); fill.addColorStop(1, `${ACENTO}00`);
    g.beginPath(); path(right); g.lineTo(right.at(-1)[0], PAD.t + ph); g.lineTo(right[0][0], PAD.t + ph); g.closePath();
    g.fillStyle = fill; g.fill();
    g.beginPath(); path(right); g.strokeStyle = ACENTO; g.lineWidth = 3.4; g.stroke();
    const [wx, wy] = wrong.at(-1), [tx, ty] = right.at(-1);
    g.fillStyle = '#a1a1a6'; g.beginPath(); g.arc(wx, wy, 5, 0, 7); g.fill();
    if (estado === 'capturando' && !RM) {
      const f = (now % 1600) / 1600;
      g.fillStyle = `${ACENTO}${Math.round((1 - f) * 70).toString(16).padStart(2, '0')}`;
      g.beginPath(); g.arc(tx, ty, 7 + f * 16, 0, 7); g.fill();
    }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(tx, ty, 7, 0, 7); g.fill();
    g.strokeStyle = ACENTO; g.lineWidth = 3.2; g.stroke();
    tip.textContent = coma(pts.at(-1).c, 2);
    tip.style.transform = `translate(${tx + 16}px, ${ty}px) translateY(-50%)`;
    return settling;
  }

  // Mientras se captura, la gráfica late en cada fotograma; si no, solo se
  // dibuja cuando cambia algo, y la diapositiva quieta no gasta.
  let chartDirty = true;
  const chartRO = new ResizeObserver(() => { chartDirty = true; });
  chartRO.observe(lienzo);
  function loop(now) {
    raf = 0;
    if (!started) return;
    if (chartDirty || estado === 'capturando') chartDirty = drawChart(now);
    raf = requestAnimationFrame(loop);
  }

  // ── La montaña 3D (o el mapa de calor) ──────────────────────────────
  const sceneBox = $('.demo-escena');
  const sceneReady = (async () => {
    try {
      const m = await import('./escenas/montana.js');
      if (disposed) return;
      const host = document.createElement('div');
      sceneBox.append(host);
      const s = m.mount(host, { static: isStatic, step: 0 });
      scene = { kind: '3d', host, inst: s };  // la instancia tal cual, sin copiar sus métodos
      if (started) { s.start?.(); s.step?.(0); }
    } catch {
      if (!disposed) scene = { kind: '2d', inst: heatmap(sceneBox) };
    }
    if (sceneData && !disposed) feedScene(sceneData);
  })();

  // En estático (PDF) la escena se dibuja una sola vez, con el último cálculo
  // (force): con WebGL por software, cada dibujo de la montaña cuesta segundos.
  function feedScene(data, force = false) {
    sceneData = data;
    sceneBox.classList.remove('vacia');
    if (!scene || (isStatic && !force)) return;
    try {
      scene.inst.update?.(data);
    } catch {
      if (scene.kind !== '3d') return;
      scene.inst.dispose?.(); scene.host?.remove();
      scene = { kind: '2d', inst: heatmap(sceneBox) };
      scene.inst.update(data);
    }
  }

  // ── Recompensa ──────────────────────────────────────────────────────
  function reward(n) {
    rewarded = true;
    const secs = (performance.now() - t0) / 1000;
    const big = ascii ? `«${String.fromCharCode(...key).trimEnd()}»` : toHex(key).replace(/(.{8})(?!$)/g, '$1 ');
    toast('Clave recuperada', big, `con ${n} trazas en ${coma(secs, 1)} s`);
    if (soundOn()) sound().then((m) => m?.play?.('success', { volume: 0.6 }));
    burst($('.demo-bytes'));
  }

  function toast(title, big, sub) {
    clearTimeout(toastTimer);
    toastEl.classList.remove('show');
    toastEl.style.width = '';
    void toastEl.offsetWidth;
    toastEl.querySelector('p').innerHTML = [...title].map((c, i) => `<span style="animation-delay:${380 + i * 24}ms">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
    const strong = toastEl.querySelector('strong');
    strong.textContent = big;
    strong.classList.toggle('hex', !ascii);
    toastEl.querySelector('small').textContent = sub;
    toastEl.classList.add('show');
    requestAnimationFrame(() => {
      // La línea más ancha + icono (84) + hueco (22) + márgenes (14 + 14) + aire a la derecha (26).
      const widest = Math.max(...[...toastEl.querySelectorAll('.tx > *')].map((el) => el.scrollWidth));
      toastEl.style.width = `${Math.min(widest + 160, container.clientWidth - 96)}px`;
    });
    toastTimer = setTimeout(hideToast, 7000);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    if (!toastEl.classList.contains('show')) return;
    toastEl.style.width = '';
    later(() => toastEl.classList.remove('show'), 300);
  }

  // Partículas que saltan de la clave, caen y se posan sobre ella (AshBurst de
  // enviar-dinero.html), en un lienzo del propio contenedor.
  let particles = [], fxRaf = 0;
  function burst(host) {
    if (RM || isStatic) return;
    const box = container.getBoundingClientRect(), scale = box.width / container.offsetWidth || 1;
    const r = host.getBoundingClientRect();
    const rect = { left: (r.left - box.left) / scale, top: (r.top - box.top) / scale, width: r.width / scale };
    const colors = ['#1d1d1f', '#6e6e73', '#a1a1a6', css(PALETA.okVivo), css(PALETA.okVivo)];
    for (let i = 0; i < 80; i++) {
      const accent = i % 9 === 0;
      particles.push({
        x: rect.left + rect.width * (0.04 + Math.random() * 0.92), y: rect.top + 6,
        vx: (Math.random() - 0.5) * 5, vy: -(3.5 + Math.random() * 4), s: 4 + Math.random() * 6,
        k: (Math.random() * 3) | 0, c: accent ? ACENTO : colors[(Math.random() * colors.length) | 0],
        a: 1, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, rest: false, bounced: false, t: 0, top: rect.top, born: performance.now(),
        left: rect.left, right: rect.left + rect.width,
      });
    }
    if (!fxRaf) { fxLast = 0; fxRaf = requestAnimationFrame(fxLoop); }
  }
  let fxLast = 0;
  function fxLoop(now) {
    fxRaf = 0;
    const k = Math.min(6, (now - (fxLast || now - 16.7)) / 16.7);  // fotogramas de 60 Hz transcurridos
    fxLast = now;
    const W = container.clientWidth, H = container.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (fxCanvas.width !== Math.round(W * dpr)) { fxCanvas.width = Math.round(W * dpr); fxCanvas.height = Math.round(H * dpr); }
    const g = fxCanvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    for (const p of particles) {
      const top = p.top - p.s * 0.5;
      if (now - p.born > 4500) p.a = 0;  // nunca más de 4,5 s, vaya como vaya la página
      if (p.rest) { p.t -= k; if (p.t < 0) p.a -= 0.025 * k; } else {
        p.vy += 0.42 * k; p.vx *= 0.99 ** k; p.x += p.vx * k; p.y += p.vy * k; p.rot += p.vr * k; p.a -= 0.002 * k;
        if (p.vy > 0 && p.y >= top && p.y - p.vy * k <= top + 2 && p.x > p.left + 8 && p.x < p.right - 8) {
          if (p.vy > 3.2 && !p.bounced) { p.vy *= -0.32; p.vx *= 0.5; p.bounced = true; p.y = top; } else { p.rest = true; p.y = top; p.t = 70 + Math.random() * 90; }
        }
        if (p.y > H + 20) p.a = 0;
      }
      g.save(); g.globalAlpha = Math.max(p.a, 0); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c;
      if (p.k === 0) { g.beginPath(); g.arc(0, 0, p.s / 2, 0, 7); g.fill(); } else if (p.k === 1) g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
      else { g.beginPath(); g.moveTo(0, -p.s * 0.6); g.lineTo(p.s * 0.45, 0); g.lineTo(0, p.s * 0.6); g.lineTo(-p.s * 0.45, 0); g.fill(); }
      g.restore();
    }
    particles = particles.filter((p) => p.a > 0);
    if (particles.length && !disposed) fxRaf = requestAnimationFrame(fxLoop); else g.clearRect(0, 0, W, H);
  }

  // ── Eventos ─────────────────────────────────────────────────────────
  container.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled || disposed) return;
    if (b.dataset.modo) { abort?.(); clear(); setModo(b.dataset.modo); setEstado('listo'); }
    else if (b.dataset.j) select(+b.dataset.j);
    else if (b.dataset.accion === 'capturar') capture();
    else if (b.dataset.accion === 'parar') stopCapture();
    else if (b.dataset.accion === 'reiniciar') { clear(); setEstado('listo'); }
    else if (b.classList.contains('demo-sonido')) {
      const on = !soundOn();
      try { localStorage.setItem('presentacion:sonido', on ? 'si' : 'no'); } catch { /* sin almacenamiento */ }
      paintSound();
      if (on) sound().then((m) => m?.unlock?.());
    }
  }, { signal: listeners.signal });
  function paintSound() {
    const on = soundOn(), b = $('.demo-sonido');
    b.hidden = [...document.querySelectorAll('button.sonido')].some((x) => !container.contains(x));
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Sonido activado (pulsa para silenciar)' : 'Sonido desactivado (pulsa para activar)');
    b.querySelector('span').textContent = on ? 'Sonido' : 'Silencio';
  }

  // ── Arranque ────────────────────────────────────────────────────────
  setModo('grabado');
  clear();
  setEstado('listo');
  paintSound();
  paintAxis();

  // ¿Hay servidor? /api/estado, con poco margen: sin él, la demo sigue con lo grabado.
  async function probe() {
    try {
      const r = await fetch(new URL('/api/estado', location.href), { cache: 'no-store', signal: AbortSignal.timeout(2000) });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  // Modo estático (PDF): las 400 trazas grabadas de golpe, con un CPA en cada
  // punto de la gráfica (más juntos al principio, donde las curvas cambian).
  async function renderStatic() {
    const c = await loadLocal();
    if (disposed) return;
    servidor = false;
    setModo('grabado');
    clear();
    setEstado('capturando');
    inicio(localStart(c, c.n, RITMO));
    const marks = [5, 10, 15, 20, 30, 40, 50, 60, 80, 100, 130, 160, 200, 250, 300, 350].filter((m) => m < c.n).concat(c.n);
    for (let i = 0, from = 0; i < marks.length; from = marks[i++]) {
      await new Promise((ok) => { onResultHook = ok; lote(localBatch(c, from, marks[i], RITMO)); });
      if (disposed || estado !== 'capturando') return;
    }
    setEstado('hecho');
    roll(kpi.ritmo, coma(RITMO, 1));
    $('.demo-chip span').textContent = CHIP.grabado;
  }

  const ready = (async () => {
    await ensureCSS();
    if (isStatic) {
      await renderStatic();
    } else {
      const st = await probe();
      if (disposed) return;
      servidor = !!st;
      nanoMotivo = st?.nano?.disponible ? null : st?.nano?.motivo ?? SIN_SERVIDOR;
      const wanted = o.modo in MODOS ? o.modo : nanoMotivo === null ? 'nano' : 'grabado';
      const ok = wanted === 'grabado' || (servidor && (wanted === 'simulado' || nanoMotivo === null));
      setModo(ok ? wanted : 'grabado');
      setEstado('listo');
    }
    await sceneReady;
    await document.fonts?.ready;
    if (disposed) return;
    if (isStatic) {
      if (sceneData) feedScene(sceneData, true);
      drawChart(performance.now());
      // Espera (un poco) a que la escena 3D haya dibujado su primer fotograma.
      for (let i = 0; i < 60 && scene?.kind === '3d' && scene.host.dataset.ready !== '1'; i++) await new Promise((ok) => setTimeout(ok, 50));
    } else {
      await new Promise((ok) => requestAnimationFrame(ok));
    }
    if (!disposed) container.dataset.ready = '1';
  })().catch((err) => fail(err.message));  // fail() no hace nada si ya se desmontó

  const api = {
    steps: 1,
    ready,
    start() {
      if (started || disposed) return;
      started = true;
      if (!isStatic) raf = requestAnimationFrame(loop);
      scene?.inst.start?.();
      scene?.inst.step?.(0);
    },
    stop() {
      started = false;
      cancelAnimationFrame(raf); raf = 0;
      scene?.inst.stop?.();
      stopCapture();
    },
    step() { /* un solo paso: la demo se maneja con sus botones */ },
    dispose() {
      if (disposed) return;
      api.stop();
      disposed = true;
      abort?.();
      worker.terminate();
      listeners.abort();
      onResultHook?.({});  // el modo estático no se queda esperando al worker
      chartRO.disconnect();
      cancelAnimationFrame(fxRaf);
      clearTimeout(toastTimer);
      timers.forEach(clearTimeout);
      scene?.inst.dispose?.();
      container.innerHTML = '';
      container.classList.remove('demo', 'demo-estatico', 'demo-hex');
      for (const k of ['estado', 'modo', 'n', 'recuperados', 'ready']) delete container.dataset[k];
    },
  };
  return api;
}
