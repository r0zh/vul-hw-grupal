// V3 «La montaña» (cine/GUION.md, §4) en vídeo: el render path-traced de la montaña de correlación con las trazas
// medidas (video/v3.mp4, 313 fotogramas a 30 fps) y sus etiquetas en HTML, que siguen al fotograma que se ve
// (requestVideoFrameCallback). Cada paso reproduce su trozo; un paso atrás o un salto enseña el último fotograma del paso.
// Las anclas, las cifras y los trozos vienen de video/v3.json, que escribe cine/planos/v3.mjs con la misma cámara.
//
// mount(container, options) → { steps: 4, start, stop, step, dispose }
//   options.static   la foto fija del paso options.step (o del 3), con sus etiquetas, sin vídeo.
//   options.step     paso inicial.
//   options.etiquetas  { id: html } con los textos de las etiquetas; si no, los <template data-etiqueta="id"> del
//                    contenedor (así index.html los lleva con su fuente) y, si tampoco, los de TEXTOS. Se rellenan
//                    {clave}, {n}, {correcto} y {mejorFalso} con las cifras del fotograma (de video/v3.json).
//   options.video, options.datos y options.fotos (una ruta con {paso})   por defecto video/v3.mp4, video/v3.json y
//                    img/cine/v3-{paso}.jpg, relativas a presentacion/.
// Eventos en el contenedor (con bubbles):
//   cine-fotograma  detail = { fotograma, n, puesto, empates, correcto, mejorFalso }, cada vez que cambia el fotograma;
//                   sirve para el contador de N y el puesto del 0x2b de la diapositiva.
//   cine-respaldo   el vídeo no carga. El contenedor queda con data-cine="respaldo" y pasa a las fotos fijas, con las
//                   mismas etiquetas; el deck puede montar entonces js/figuras/por-dentro.js, que tiene los mismos pasos
//                   y datos. (Los mismos nombres que js/figuras/cine-v2.js.)
// Con prefers-reduced-motion no se reproduce nada: cada paso es su foto fija.
const FPS = 30;
const RAIZ = new URL('../../', import.meta.url);
// En palabras de todos los días: |ρ| es el «parecido» y el velo del mejor falso, «lo que puede hacer el azar», como la
// franja del juego de las monedas.
const TEXTOS = {
  'eje-rho': 'parecido', rho0: '0', rho05: '0,5', rho1: '1',
  'eje-t': 'tiempo', t500: '500', t600: '600', t700: '700',
  'eje-k': 'candidato', k00: '0x00', k80: '0x80', kff: '0xff',
  fila: '{clave}, el correcto', cresta: '{clave} · parecido {correcto}', velo: 'lo que puede hacer el azar · hasta {mejorFalso}',
  cresta2: 'el mismo byte, otra vez',
};
// Sitio de cada etiqueta respecto a su ancla, en px del escenario: [clase, dx, dy, alineación]. dx y dy llevan al punto de
// la etiqueta que dice la alineación: 'izq' su borde izquierdo, 'der' el derecho, 'centro' el centro y 'arriba' el centro
// de arriba. Las píldoras llevan línea guía y un punto en el ancla. Elegidos con las anclas de todos los fotogramas para
// que nada se pise ni se salga del vídeo; FRONTAL cambia los de la vista frontal (vista 2 en video/v3.json).
const SITIO = {
  'eje-rho': ['titulo', 0, -30, 'centro'], rho0: ['marca', -10, 0, 'der'], rho05: ['marca', -10, 0, 'der'], rho1: ['marca', -10, 0, 'der'],
  'eje-t': ['titulo', 0, 42, 'arriba'], t500: ['marca', 0, 10, 'arriba'], t600: ['marca', 0, 10, 'arriba'], t700: ['marca', 0, 10, 'arriba'],
  'eje-k': ['titulo', 12, 34, 'izq'], k00: ['marca', 12, 0, 'izq'], k80: ['marca', 12, 0, 'izq'], kff: ['marca', 12, 0, 'izq'],
  fila: ['pildora acento', 24, -80, 'izq'], cresta: ['pildora', 34, -58, 'izq'], velo: ['pildora', -24, -40, 'der'],
  // La segunda cresta solo sale en la vista frontal, al final: encima, para no pisar la etiqueta de la primera.
  cresta2: ['pildora', 0, -72, 'centro'],
};
const FRONTAL = { fila: ['pildora acento', 40, -80, 'izq'], velo: ['pildora', 0, -64, 'centro'] };
const coma = (v) => v.toFixed(2).replace('.', ',');

function estilos() {
  const style = document.createElement('style');
  style.textContent = `
    .cine-v3 { position:absolute; inset:0; overflow:hidden; font:inherit; }
    .cine-v3 > video, .cine-v3 > img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block;
      mask-image:linear-gradient(to right, transparent, #000 44px, #000 calc(100% - 44px), transparent),
        linear-gradient(to bottom, transparent, #000 44px, #000 calc(100% - 44px), transparent);
      mask-composite:intersect; }
    .cine-v3 > img[hidden], .cine-v3 > video[hidden] { display:none; }
    .cine-v3-capa { position:absolute; inset:0; pointer-events:none; }
    .cine-v3-capa svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
    .cine-v3-capa line { stroke:#6e6e7399; stroke-width:1.5; }
    .cine-v3-capa circle { fill:#fff; stroke:#6e6e73; stroke-width:2; }
    .cine-v3-capa .acento line { stroke:#0071e3b3; }
    .cine-v3-capa .acento circle { stroke:#0071e3; }
    .cine-v3-capa g, .cine-v3-etq { opacity:0; transition:opacity .15s; }
    .cine-v3-capa g.ver, .cine-v3-etq.ver { opacity:1; transition-duration:.2s; }
    .cine-v3-etq { position:absolute; left:0; top:0; white-space:nowrap; font-variant-numeric:tabular-nums; line-height:1.2;
      letter-spacing:-.01em; will-change:transform; }
    .cine-v3-etq.marca { font-size:22px; font-weight:500; color:var(--c-eje, #515154);
      text-shadow:0 0 3px #fff, 0 0 7px #fff, 0 0 12px #fff; }
    .cine-v3-etq.titulo { font-size:23px; font-weight:600; color:#1d1d1f; text-shadow:0 0 3px #fff, 0 0 7px #fff, 0 0 12px #fff; }
    .cine-v3-etq.etiqueta-3d { max-width:none; white-space:nowrap; text-wrap:nowrap; }
    .cine-v3-etq.acento { color:#0071e3; font-weight:600; background:var(--c-acento-suave, #e8f1fc);
      box-shadow:0 0 0 1px #0071e347, 0 6px 20px -8px rgba(0, 0, 0, .25); }
  `;
  return style;
}

export function mount(container, options = {}) {
  const fixed = options.static === true;
  const quieto = fixed || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plantillas = Object.fromEntries([...container.querySelectorAll(':scope > template[data-etiqueta]')]
    .map((t) => [t.dataset.etiqueta, t.innerHTML.trim()]));
  const textos = { ...TEXTOS, ...plantillas, ...options.etiquetas };
  const ruta = (r) => new URL(r, RAIZ).href;
  const foto = (paso) => ruta((options.fotos ?? 'img/cine/v3-{paso}.jpg').replace('{paso}', paso));
  const previous = { position: container.style.position, role: container.getAttribute('role'),
    label: container.getAttribute('aria-label'), ready: container.dataset.ready, cine: container.dataset.cine };
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  delete container.dataset.ready;
  container.setAttribute('role', 'img');
  container.setAttribute('aria-label', 'Parecido de los 256 candidatos con las trazas medidas, aún sin cargar.');

  const root = document.createElement('div');
  root.className = 'cine-v3';
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.hidden = true;
  const capa = document.createElement('div');
  capa.className = 'cine-v3-capa';
  capa.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  capa.append(svg);
  root.append(estilos(), img, capa);
  container.append(root);

  let video = null;
  if (!quieto) {
    video = document.createElement('video');
    Object.assign(video, { muted: true, playsInline: true, preload: 'auto', poster: foto(0), disablePictureInPicture: true });
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    root.insertBefore(video, capa);
    video.addEventListener('error', fallo);
    video.addEventListener('loadeddata', listo);
    video.addEventListener('seeked', () => pintar(fotogramaDelVideo()));
    video.addEventListener('ended', () => { hasta = null; pintar(fotogramaDelVideo()); });
  }

  let datos = null, etiquetas = null, paso = Math.max(0, Math.min(3, Math.trunc(Number(options.step ?? (fixed ? 3 : 0))) || 0));
  let hasta = null, mostrado = -1, running = false, disposed = false, callback = 0, timer = 0, ancho = 0, alto = 0, blob = null;
  const final = (p) => datos.pasos[p][1];

  // El vídeo entero en memoria (son unos MB): los servidores del deck (captura.vivo y python -m http.server) no
  // atienden peticiones Range, y sin ellas Chrome no puede saltar a un fotograma: currentTime vuelve al principio.
  if (video) {
    fetch(ruta(options.video ?? 'video/v3.mp4'))
      .then((r) => { if (!r.ok) throw new Error(`No se pudo cargar ${r.url} (${r.status}).`); return r.blob(); })
      .then((b) => { if (disposed) return; blob = URL.createObjectURL(b); video.src = blob; })
      .catch((error) => { if (!disposed) fallo(error); });
  }

  fetch(ruta(options.datos ?? 'video/v3.json'))
    .then((r) => { if (!r.ok) throw new Error(`No se pudo cargar ${r.url} (${r.status}).`); return r.json(); })
    .then((json) => {
      if (disposed) return;
      datos = json;
      etiquetas = datos.ids.map((id) => crear(id));
      if (quieto || container.dataset.cine === 'respaldo') fotoFija(paso);
      else listo();
    })
    .catch((error) => { if (!disposed) fallo(error); });

  function crear(id) {
    const [clase] = SITIO[id] ?? ['marca'];
    const span = document.createElement('span');
    span.className = `cine-v3-etq ${clase.includes('pildora') ? `etiqueta-3d ${clase.replace('pildora', '')}` : clase}`;
    const g = clase.includes('pildora') ? document.createElementNS(svg.namespaceURI, 'g') : null;
    if (g) {
      if (clase.includes('acento')) g.classList.add('acento');
      g.innerHTML = '<line/><circle r="4.5"/>';
      svg.append(g);
    }
    capa.append(span);
    return { id, span, g, texto: '', w: 0, h: 0 };
  }

  // Del fotograma (anclas en fracción del vídeo) a px del contenedor, como object-fit: cover.
  function pintar(f) {
    if (!datos || f < 0) return;
    f = Math.min(datos.fotogramas.length - 1, f);
    const d = datos.fotogramas[f];
    if (!ancho) medir();
    const s = Math.max(ancho / datos.ancho, alto / datos.alto), ox = (ancho - datos.ancho * s) / 2, oy = (alto - datos.alto * s) / 2;
    const valores = { clave: datos.clave, n: String(d.n), correcto: coma(d.correcto), mejorFalso: coma(d.mejorFalso) };
    etiquetas.forEach((e, k) => {
      const ver = d.visibles[k] === '1';
      const texto = (textos[e.id] ?? e.id).replace(/\{(\w+)\}/g, (m, v) => valores[v] ?? m);
      if (texto !== e.texto) e.span.innerHTML = e.texto = texto;
      if (texto !== e.medido || !e.w) { e.w = e.span.offsetWidth; e.h = e.span.offsetHeight; e.medido = texto; }
      const [, dx, dy, alinea] = (d.vista === 2 && FRONTAL[e.id]) || SITIO[e.id] || ['marca', 0, 0, 'centro'];
      const ax = ox + d.anclas[2 * k] * datos.ancho * s, ay = oy + d.anclas[2 * k + 1] * datos.alto * s;
      const x = ax + dx - (alinea === 'der' ? e.w : alinea === 'izq' ? 0 : e.w / 2);
      const y = ay + dy - (alinea === 'arriba' ? 0 : e.h / 2);
      e.span.style.transform = `translate(${x}px, ${y}px)`;
      e.span.classList.toggle('ver', ver);
      if (e.g) {
        const [line, circle] = e.g.children;
        // La guía va al lado de la píldora que mira al ancla.
        const ex = alinea === 'der' ? x + e.w : alinea === 'centro' ? x + e.w / 2 : x, ey = alinea === 'centro' ? y + e.h : y + e.h / 2;
        line.setAttribute('x1', ax); line.setAttribute('y1', ay); line.setAttribute('x2', ex); line.setAttribute('y2', ey);
        circle.setAttribute('cx', ax); circle.setAttribute('cy', ay);
        e.g.classList.toggle('ver', ver);
      }
    });
    if (f !== mostrado) {
      mostrado = f;
      container.setAttribute('aria-label', `Parecido de los 256 candidatos del byte ${datos.byte} con ${d.n} trazas medidas: `
        + `el correcto, ${datos.clave}, llega a ${valores.correcto} y el azar, el falso con más suerte, a ${valores.mejorFalso}.`);
      container.dispatchEvent(new CustomEvent('cine-fotograma', { bubbles: true, detail: { fotograma: f, n: d.n, puesto: d.puesto,
        empates: d.empates, correcto: d.correcto, mejorFalso: d.mejorFalso } }));
    }
  }

  function medir() {
    ancho = container.clientWidth;
    alto = container.clientHeight;
  }
  const observer = new ResizeObserver(() => { medir(); if (datos) pintar(Math.max(0, mostrado)); });
  observer.observe(container);
  document.fonts?.ready.then(() => { if (!disposed && datos) { for (const e of etiquetas) e.medido = null; pintar(Math.max(0, mostrado)); } });

  const fotogramaDelVideo = () => Math.round(video.currentTime * FPS);

  // Las fotos fijas: con static, con movimiento reducido o si el vídeo falla.
  function fotoFija(p) {
    img.hidden = false;
    if (video) video.hidden = true;
    const src = foto(p);
    const pinta = () => {
      if (disposed) return;
      pintar(final(p));
      container.dataset.ready = '1';
    };
    if (img.src !== src) {
      img.src = src;
      img.decode().then(pinta, pinta); // si la foto no carga, al menos quedan las etiquetas
    } else pinta();
  }

  function listo() {
    if (disposed || !datos || !video || video.readyState < 2 || video.hidden) return;
    if (container.dataset.ready === '1') return;
    container.dataset.ready = '1';
    ir(paso, false);
  }

  function fallo(error) {
    if (disposed || container.dataset.cine === 'respaldo') return;
    console.warn('cine-v3: sin vídeo; quedan las fotos fijas.', error?.message ?? error ?? '');
    container.dataset.cine = 'respaldo';
    container.dispatchEvent(new CustomEvent('cine-respaldo', { bubbles: true, detail: { error } }));
    parar();
    if (video) { video.removeAttribute('src'); video.load(); video.hidden = true; }
    if (datos) fotoFija(paso);
  }

  function seguir() {
    if (!video || disposed) return;
    if (video.requestVideoFrameCallback) {
      callback = video.requestVideoFrameCallback((now, meta) => {
        callback = 0;
        tick(Math.round(meta.mediaTime * FPS));
      });
    } else timer = requestAnimationFrame(() => { timer = 0; tick(fotogramaDelVideo()); });
  }
  function tick(f) {
    if (hasta !== null && f >= hasta) {
      video.pause();
      if (f !== hasta) video.currentTime = (hasta + 0.1) / FPS;
      f = hasta;
      hasta = null;
    }
    pintar(f);
    if (hasta !== null) seguir();
  }
  function parar() {
    if (callback) video?.cancelVideoFrameCallback?.(callback);
    if (timer) cancelAnimationFrame(timer);
    callback = timer = 0;
    hasta = null;
    video?.pause();
  }

  // Paso p: el siguiente se reproduce desde el final del anterior (los trozos van seguidos en el vídeo; si aún suena el
  // anterior, solo se alarga) y cualquier otro salta a su último fotograma.
  function ir(p, animar) {
    if (quieto || container.dataset.cine === 'respaldo') return fotoFija(p);
    if (!video || video.readyState < 2) return;
    if (animar && running && p > 0) {
      if (hasta === null) {
        if (fotogramaDelVideo() !== final(p - 1)) video.currentTime = (final(p - 1) + 0.1) / FPS;
        video.play().then(seguir, (error) => { if (error.name !== 'AbortError') saltar(hasta ?? final(p)); });
      }
      hasta = final(p);
      return;
    }
    saltar(final(p));
  }
  function saltar(f) {
    parar();
    video.currentTime = (f + 0.1) / FPS;
    pintar(f);
  }

  return {
    steps: 4,
    start() { running = true; },
    stop() { running = false; if (video && hasta !== null) saltar(hasta); },
    step(n) {
      const p = Math.max(0, Math.min(3, Math.trunc(Number(n)) || 0));
      const animar = p === paso + 1;
      paso = p;
      if (datos && (quieto || container.dataset.ready === '1' || container.dataset.cine === 'respaldo')) ir(p, animar);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      parar();
      observer.disconnect();
      if (video) { video.removeAttribute('src'); video.load(); }
      if (blob) URL.revokeObjectURL(blob);
      root.remove();
      container.style.position = previous.position;
      for (const [attr, value] of [['role', previous.role], ['aria-label', previous.label], ['data-ready', previous.ready], ['data-cine', previous.cine]]) {
        if (value == null) container.removeAttribute(attr);
        else container.setAttribute(attr, value);
      }
    },
  };
}
