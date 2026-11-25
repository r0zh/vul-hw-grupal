// Figura V2 «Anatomía de una traza» (diapositiva «montaje», cine/GUION.md §3): el render path-traced de la CW1101 que sigue la
// señal de la víctima al USB-C, con las etiquetas en HTML encima.
//
// mount(container, options) → { steps: 5 + espera, start, stop, step(n), dispose }
//   Trozos: 0 víctima, 1 shunt, 2 ADC, 3 capturador, 4 reloj y disparo (este, con un bucle de 4 s).
//   step(n) reproduce el trozo n si se viene del paso anterior; si no (atrás o un salto), enseña su último fotograma.
//   options.espera     pasos de la diapositiva que pasan antes del vídeo (por defecto, 0): el paso n es el trozo
//                      n − espera, y en los anteriores el vídeo espera parado al principio, sin etiquetas (en
//                      «montaje» son los tres pasos de la mesa de laboratorio, con el vídeo aún escondido).
//   options.static     foto fija del paso options.step (o del último) y data-ready; no carga vídeo (PDF).
//   options.step       paso inicial, contado como los de step(n).
//   options.etiquetas  { id: html } con los textos; si no, los <template data-etiqueta="id"> del contenedor (así
//                      index.html los lleva con su fuente) y, si tampoco, los de TEXTOS.
//   options.base       carpeta presentacion/ (por defecto, la de este módulo).
// Ficheros: video/v2.mp4 (trozos 0 a 4), video/v2-bucle.mp4, video/v2.json (trozos, etiquetas y anclas por fotograma,
// de `cine/render.mjs --anclas`) e img/cine/v2-inicio.jpg, v2-0.jpg … v2-4.jpg (fotos fijas al doble de tamaño).
// Los vídeos se bajan enteros y se reproducen desde un blob: el servidor de la demo (captura/vivo.py) y el de Python no
// responden a peticiones Range, y sin ellas Chrome no puede saltar a un trozo (currentTime vuelve a 0).
// Con prefers-reduced-motion, o si el vídeo no carga, se queda en las fotos fijas con las mismas etiquetas. En el
// segundo caso además pone data-cine="respaldo" y lanza el evento «cine-respaldo» (burbujea), por si el deck prefiere
// montar la escena Three.js. data-ready="1" llega cuando hay imagen (el primer fotograma o la foto).
import { PALETA, css } from '../paleta.js';

const TEXTOS = {
  victima: '<strong>El chip que cifra</strong><small>la víctima: un STM32F042F6P6</small>',
  shunt: '<strong>La resistencia</strong>: su tensión sigue a la corriente del chip<small>27 Ω (shunt) · recorrido esquemático</small>',
  adc: '<strong>El medidor</strong>: una muestra en cada ciclo del chip<small>ADC de 8 bits · 7,5 millones de muestras por segundo</small>',
  capturador: '<strong>El capturador</strong>: guarda la traza y la manda al portátil<small>un ATSAM4S16B · por USB</small>',
  regalado: '<strong>Viene regalado:</strong> el chip avisa cuando empieza y el medidor va a su ritmo, así que las trazas salen alineadas'
    + '<ul class="cine-leyenda"><li data-trazo="medida">medida</li><li data-trazo="muestras">muestras</li>'
    + '<li data-trazo="reloj">reloj</li><li data-trazo="disparo">señal de inicio</li></ul>'
    + '<small>esquema; el reloj de verdad va a 7,5 MHz</small>',
};
const NOTA = 'Modelo 3D simplificado de la placa CW1101';
// Muestras de los cuatro trazos del vídeo para la leyenda (SVG de 40 × 14).
const TRAZOS = {
  medida: '<line x1="3" y1="7" x2="37" y2="7" stroke-width="4.5" stroke-linecap="round"/>',
  muestras: '<rect x="3" y="2.5" width="13" height="9" rx="4.5" stroke="none" fill-opacity=".55"/><rect x="23" y="2.5" width="13" height="9" rx="4.5" stroke="none" fill-opacity=".55"/>',
  reloj: '<line x1="3" y1="7" x2="37" y2="7" stroke-width="2.5" stroke-linecap="round" stroke-opacity=".5"/>',
  disparo: '<line x1="4" y1="7" x2="37" y2="7" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="6 5" stroke-opacity=".8"/>',
};
const FUNDIDO = 'transparent, #000 44px, #000 calc(100% - 44px), transparent';

function estilo() {
  if (document.getElementById('estilo-cine-v2')) return;
  const sheet = document.createElement('style');
  sheet.id = 'estilo-cine-v2';
  // Medidas en px del escenario de 1920×1080, como la escena de la placa: la etiqueta se lee desde el fondo del aula.
  sheet.textContent = `
    .cine-v2 { position:absolute; inset:0; overflow:hidden; isolation:isolate; }
    .cine-v2 > video, .cine-v2 > img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block;
      mask-image:linear-gradient(to right, ${FUNDIDO}), linear-gradient(${FUNDIDO}); mask-composite:intersect; }
    .cine-v2 > [hidden] { display:none; }
    .cine-v2 > video.tapado { opacity:0; } /* se sigue componiendo: requestVideoFrameCallback no se para */
    .cine-v2 .cine-guias { position:absolute; inset:0; width:100%; height:100%; overflow:hidden; pointer-events:none; }
    .cine-v2 .cine-guias g { opacity:0; transition:opacity .15s; } .cine-v2 .cine-guias g.visible { opacity:1; transition-duration:.2s; }
    .cine-v2 .cine-card { position:absolute; box-sizing:border-box; font:inherit; font-size:24px; line-height:1.28;
      letter-spacing:-.012em; font-weight:400; color:${css(PALETA.tinta)}; padding:14px 18px 15px; border-radius:12px;
      background:${css(PALETA.superficie)}; box-shadow:0 0 0 1px ${css(PALETA.tinta)}0d, 0 6px 22px -8px ${css(PALETA.tinta)}40;
      width:max-content; max-width:var(--cine-card); text-wrap:pretty; pointer-events:none; opacity:0; transition:opacity .15s; }
    .cine-v2 .cine-card.visible { opacity:1; transition-duration:.2s; }
    .cine-v2 .cine-card strong { font-weight:650; }
    .cine-v2 .cine-card small { display:block; font-size:19px; margin-top:6px; color:${css(PALETA.tenue)}; font-weight:450; letter-spacing:0; }
    .cine-v2 .cine-card.sin-ancla { right:2.2%; bottom:8.5%; max-width:min(600px, 52%); }
    .cine-v2 .cine-card.sin-ancla .cine-leyenda { justify-content:start; }
    .cine-v2 .cine-leyenda { list-style:none; margin:12px 0 0; padding:0; display:grid; grid-template-columns:auto auto; gap:6px 22px;
      font-size:19px; color:${css(PALETA.tenue)}; letter-spacing:0; }
    .cine-v2 .cine-leyenda li { display:flex; align-items:center; gap:10px; white-space:nowrap; }
    .cine-v2 .cine-leyenda svg { width:40px; height:14px; flex:none; stroke:${css(PALETA.acento)}; fill:${css(PALETA.acento)}; }
    .cine-v2 .cine-nota { position:absolute; right:2.2%; bottom:2.6%; margin:0; font:inherit; font-size:16px; line-height:1.3;
      color:${css(PALETA.tenue)}; pointer-events:none; }
  `;
  document.head.append(sheet);
}

export function mount(container, options = {}) {
  estilo();
  const fixed = options.static === true;
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const root = new URL(options.base ?? '../../', import.meta.url);
  const at = (path) => new URL(path, root).href;
  const previous = { position: container.style.position, role: container.getAttribute('role'),
    label: container.getAttribute('aria-label'), ready: container.dataset.ready, cine: container.dataset.cine };
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  delete container.dataset.ready;

  const ns = 'http://www.w3.org/2000/svg';
  const stage = document.createElement('div');
  stage.className = 'cine-v2';
  const photo = document.createElement('img');
  photo.alt = '';
  photo.decoding = 'async';
  photo.hidden = true;
  const guides = document.createElementNS(ns, 'svg');
  guides.setAttribute('class', 'cine-guias');
  guides.setAttribute('aria-hidden', 'true');
  const note = document.createElement('p');
  note.className = 'cine-nota';
  note.textContent = NOTA;
  stage.append(photo);

  // Vídeos: el de los trozos y el del bucle, precargado para que el paso 4 enlace sin espera.
  let main = null, loop = null;
  if (!fixed && !reduced) {
    const video = (extra) => Object.assign(document.createElement('video'), {
      muted: true, playsInline: true, preload: 'auto', disablePictureInPicture: true, ...extra });
    main = video({ poster: at('img/cine/v2-inicio.jpg') });
    loop = video({ loop: true });
    loop.classList.add('tapado');
    for (const v of [main, loop]) {
      v.setAttribute('aria-hidden', 'true');
      v.addEventListener('error', () => fallback('el vídeo no carga'), { once: true });
    }
    stage.append(main, loop);
  }
  stage.append(guides, note);
  container.append(stage);

  let data = null, cards = [], selected = null, mode = fixed || reduced ? 'fotos' : 'video';
  let frame = 0, stopAt = null, onLoop = false, running = false, disposed = false, callback = null, loaded = false;
  const wait = Math.max(0, Math.trunc(Number(options.espera)) || 0);
  let waiting = false;   // el deck va por un paso anterior al vídeo
  // Paso de la diapositiva → trozo del vídeo; negativo, si aún no le toca.
  const chunk = (n) => Math.max(0, Math.min(4 + wait, Math.trunc(Number(n)) || 0)) - wait;
  const wanted = () => Math.max(0, chunk(options.step ?? (fixed ? wait + 4 : wait)));

  // Textos: options, luego <template data-etiqueta> del contenedor (index.html, con su fuente), luego TEXTOS.
  function text(id) {
    if (options.etiquetas?.[id]) return options.etiquetas[id];
    const own = container.querySelector(`:scope > [data-etiqueta="${id}"]`);
    return own ? own.innerHTML : TEXTOS[id] ?? '';
  }

  function build() {
    cards = data.etiquetas.map((label) => {
      const card = document.createElement('div');
      card.className = 'etiqueta-3d cine-card';
      card.innerHTML = text(label.id);
      for (const item of card.querySelectorAll('[data-trazo]')) {
        item.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 40 14" aria-hidden="true">${TRAZOS[item.dataset.trazo] ?? ''}</svg>`);
      }
      const anchored = Boolean(data.anchors[label.id]);
      if (!anchored) card.classList.add('sin-ancla');
      stage.append(card);
      const group = document.createElementNS(ns, 'g');
      if (anchored) {
        group.innerHTML = `<polyline fill="none" stroke="${css(PALETA.superficie)}" stroke-width="3.5" stroke-opacity=".9" stroke-linejoin="round" stroke-linecap="round"/>`
          + `<polyline fill="none" stroke="${css(PALETA.tenue)}" stroke-width="1.25" stroke-linejoin="round"/>`
          + `<circle r="4" fill="${css(PALETA.superficie)}" stroke="${css(PALETA.tinta)}" stroke-width="1.5"/>`;
        guides.append(group);
      }
      return { ...label, card, group, anchored };
    });
  }

  // Fracción de la imagen → px del contenedor, con el recorte de object-fit: cover.
  function toPixels([u, v]) {
    const w = container.clientWidth, h = container.clientHeight;
    const s = Math.max(w / data.width, h / data.height), dw = data.width * s, dh = data.height * s;
    return [(w - dw) / 2 + u * dw, (h - dh) / 2 + v * dh];
  }

  // Coloca y enseña las etiquetas del fotograma f (global) con el paso seleccionado.
  function draw() {
    if (!data) return;
    const w = container.clientWidth, h = container.clientHeight;
    guides.setAttribute('viewBox', `0 0 ${w} ${h}`);
    stage.style.setProperty('--cine-card', `${Math.min(500, w * 0.37)}px`);
    for (const label of cards) {
      const on = label.paso === selected && (mode === 'fotos' || frame >= label.entra);
      label.card.classList.toggle('visible', on);
      label.group.classList?.toggle('visible', on);
      if (!label.anchored) continue;
      const point = data.anchors[label.id][Math.min(frame, data.frames - 1)];
      if (!point) { label.group.classList.remove('visible'); continue; }
      const [x, y] = toPixels(point);
      // La tarjeta va donde diga el JSON (esquina de arriba a la izquierda, en fracción del contenedor) o, si no dice,
      // en la columna de la derecha a la altura del ancla. La línea entra por abajo o por arriba si el ancla cae bajo la
      // tarjeta, y si no, por el lado, con un codo.
      const width = label.card.offsetWidth, height = label.card.offsetHeight;
      const left = label.tarjeta ? label.tarjeta[0] * w : w * 0.964 - width;
      const top = label.tarjeta ? label.tarjeta[1] * h : Math.min(h * 0.92 - height, Math.max(h * 0.08, y - height / 2));
      label.card.style.left = `${left}px`;
      label.card.style.top = `${top}px`;
      let points;
      if (x >= left + 12 && x <= left + width - 12) points = `${x},${y} ${x},${y > top ? top + height : top}`;
      else {
        const edge = x < left ? left : left + width, middle = top + height / 2;
        points = `${x},${y} ${edge + (x < left ? -1 : 1) * w * 0.027},${middle} ${edge},${middle}`;
      }
      for (const line of label.group.querySelectorAll('polyline')) line.setAttribute('points', points);
      const dot = label.group.querySelector('circle');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
    }
    container.dataset.fotograma = frame; // el fotograma que se ve (global), para las pruebas
    const current = cards.find((label) => label.paso === selected);
    const description = `${NOTA}. ${current ? current.card.textContent : ''}`.trim();
    if (container.getAttribute('aria-label') !== description) container.setAttribute('aria-label', description);
  }

  // ── Fotos fijas (estático, movimiento reducido o respaldo): el último fotograma de cada trozo ──
  function showPhoto(n) {
    photo.hidden = false;
    for (const v of [main, loop]) if (v) { v.pause(); v.hidden = true; }
    photo.src = at(`img/cine/v2-${n}.jpg`);
    frame = data ? data.trozos[n][1] : 0;
    photo.decode().then(() => { if (!disposed) ready(); }, () => {});
    draw();
  }

  function fallback(reason) {
    if (disposed || mode === 'fotos') return;
    mode = 'fotos';
    cancel();
    container.dataset.cine = 'respaldo';
    container.dispatchEvent(new CustomEvent('cine-respaldo', { bubbles: true, detail: { reason } }));
    console.warn(`cine-v2: ${reason}; se quedan las fotos fijas.`);
    if (selected !== null) showPhoto(selected);
  }

  function ready() {
    if (disposed || container.dataset.ready === '1') return;
    container.setAttribute('role', 'img');
    container.dataset.ready = '1';
  }

  // ── Vídeo ──
  const fps = () => data?.fps ?? 30;
  function cancel() {
    if (callback) {
      if (callback.video.cancelVideoFrameCallback) callback.video.cancelVideoFrameCallback(callback.id);
      else cancelAnimationFrame(callback.id);
    }
    callback = null;
  }
  // Sigue el fotograma que se ve: requestVideoFrameCallback (fotograma = round(mediaTime × fps)) o, sin él, rAF.
  function follow(video) {
    cancel();
    const offset = video === loop ? data.bucle[0] : 0;
    const tick = (now, meta) => {
      if (disposed) return;
      const time = meta?.mediaTime ?? video.currentTime;
      frame = offset + Math.round(time * fps());
      if (stopAt !== null && video === main && frame >= stopAt) {
        const end = stopAt;
        stopAt = null;
        video.pause();
        video.currentTime = (end + 0.5) / fps();
        frame = end;
        if (end === data.trozos[4][1]) startLoop();
      }
      draw();
      if (!video.paused || video === loop) callback = { video, id: schedule(video, tick) };
    };
    callback = { video, id: schedule(video, tick) };
  }
  const schedule = (video, tick) => (video.requestVideoFrameCallback
    ? video.requestVideoFrameCallback(tick) : requestAnimationFrame((now) => tick(now)));

  const play = (video) => video.play().catch((error) => { if (error.name !== 'AbortError') fallback(`no se puede reproducir: ${error.message}`); });

  function showMain() {
    cancel(); // el bucle puede tener pendiente un fotograma que pisaría el del trozo
    onLoop = false;
    loop.pause();
    loop.classList.add('tapado');
  }

  function playChunk(n) {
    showMain();
    const [a, b] = data.trozos[n];
    stopAt = b;
    main.currentTime = (a + 0.1) / fps();
    frame = a;
    draw();
    if (running) { play(main); follow(main); }
  }

  function showEnd(n) {
    showMain();
    stopAt = null;
    main.pause();
    frame = data.trozos[n][1];
    main.currentTime = (frame + 0.5) / fps();
    draw();
  }

  // Del último fotograma del trozo 4 al bucle: el bucle se enseña cuando ya pinta su primer fotograma.
  function startLoop() {
    onLoop = true;
    frame = Math.max(frame, data.bucle[0]);
    loop.currentTime = 0;
    if (!running) return;
    play(loop);
    const swap = () => { if (onLoop && !disposed) loop.classList.remove('tapado'); };
    if (loop.requestVideoFrameCallback) loop.requestVideoFrameCallback(swap); else loop.addEventListener('playing', swap, { once: true });
    follow(loop);
  }

  function select(n, from) {
    selected = n;
    if (mode === 'fotos') return showPhoto(n);
    if (from === n - 1 || (from === null && n === 0)) playChunk(n);
    else if (n === 4) { showEnd(4); startLoop(); }
    else showEnd(n);
  }

  const get = (path, as) => fetch(at(path)).then((response) => {
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response[as]();
  });
  // Los pasos esperan al JSON y a los dos vídeos: sin src, play() fallaría y se iría al respaldo sin motivo.
  const blobs = [];
  let failed = null;
  const videos = main ? Promise.all([get('video/v2.mp4', 'blob'), get('video/v2-bucle.mp4', 'blob')]).then((files) => {
    if (disposed) return;
    [main.src, loop.src] = files.map((file) => { blobs.push(URL.createObjectURL(file)); return blobs.at(-1); });
  }, (error) => { failed = error; }) : Promise.resolve();
  get('video/v2.json', 'json').then(async (json) => {
    if (disposed) return;
    data = json;
    build();
    await videos;
    if (failed) fallback(`el vídeo no carga (${failed.message})`);
    if (disposed) return;
    if (mode === 'video') {
      if (main.readyState >= 2) ready(); else main.addEventListener('loadeddata', ready, { once: true });
    }
    loaded = true;
    if (!waiting && (selected !== null || fixed || reduced)) { const n = selected ?? wanted(); selected = null; select(n, null); }
    draw();
  }, (error) => {
    if (disposed) return;
    // Sin el JSON no hay trozos ni anclas: se queda la foto del paso, sin etiquetas.
    mode = 'fotos';
    loaded = true;
    container.dataset.cine = 'respaldo';
    container.dispatchEvent(new CustomEvent('cine-respaldo', { bubbles: true, detail: { reason: error.message } }));
    console.warn(`cine-v2: ${error.message}; se quedan las fotos fijas, sin etiquetas.`);
    if (!waiting) showPhoto(selected ?? wanted());
  });

  const resize = new ResizeObserver(() => draw());
  resize.observe(container);
  if (fixed || reduced) selected = wanted();

  // Deja el vídeo parado y sin paso elegido: el primer trozo saldrá desde la vista general.
  function rest() {
    selected = null;
    cancel();
    if (mode === 'video') { showMain(); main.pause(); }
  }

  return {
    steps: 5 + wait,
    start() { running = true; },
    stop() {
      running = false;
      // Al volver a la diapositiva, step() empieza de cero: el primer trozo, desde la vista general.
      if (mode === 'video') rest(); else cancel();
    },
    step(n) {
      n = chunk(n);
      waiting = n < 0;
      if (waiting) { if (selected !== null) { rest(); draw(); } return; }   // draw() quita las etiquetas
      if (n === selected) return;
      const from = selected;
      if (!loaded) { selected = n; return; }
      select(n, from);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      resize.disconnect();
      for (const v of [main, loop]) if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
      for (const url of blobs) URL.revokeObjectURL(url);
      stage.remove();
      container.style.position = previous.position;
      delete container.dataset.fotograma;
      for (const [attr, value] of [['role', previous.role], ['aria-label', previous.label], ['data-ready', previous.ready], ['data-cine', previous.cine]]) {
        if (value == null) container.removeAttribute(attr); else container.setAttribute(attr, value);
      }
    },
  };
}
