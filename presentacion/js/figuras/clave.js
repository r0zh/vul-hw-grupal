// La clave del público (diapositiva «pregunta»): la que la demo programará en
// el chip y recuperará del consumo. Hay dos formas de elegirla:
//
// - La sala (captura.vivo --sala): un QR lleva a cada móvil a elegir un byte de
//   la clave. Aquí se ven 16 casillas que se llenan, nunca sus valores. Al
//   pulsar «Guardar en el chip» el servidor cierra la ronda, pone al azar los
//   bytes que falten y da la clave, que se guarda en
//   sessionStorage('demo:clave-hex') como 32 cifras hex.
// - Una palabra de hasta 16 letras, dictada por la clase: es lo que hay cuando
//   no hay sala (sin servidor, sin túnel o sin móviles). Se guarda en
//   sessionStorage('demo:clave') como ASCII imprimible, sin rellenar; quien la
//   use la rellena hasta 16 bytes con espacios. Las tildes y la eñe se quitan
//   («Málaga» → «Malaga»), porque cada letra tiene que ser un byte.
//
// Solo queda una de las dos: guardar una borra la otra. El HTML está en
// index.html; este módulo solo le da vida.
export const STORAGE_KEY = 'demo:clave';
export const STORAGE_HEX = 'demo:clave-hex';
const STORAGE_PUBLIC = 'demo:clave-publico';  // cuántos de los 16 bytes eligió el público
const POLL_MS = 1000;

export const sanitize = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').slice(0, 16);

const get = (key) => { try { return sessionStorage.getItem(key); } catch { return null; } };
const set = (key, value) => {
  try { if (value == null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, String(value)); } catch { /* sin almacenamiento: la demo usará su clave por defecto */ }
};
const savedHex = () => (/^[0-9a-f]{32}$/.test(get(STORAGE_HEX) ?? '') ? get(STORAGE_HEX) : null);

// «11 bytes vuestros y 5 del azar», con sus singulares y sus extremos.
export function origin(n) {
  const yours = n === 1 ? '1 byte vuestro' : `${n} bytes vuestros`;
  if (n >= 16) return 'Los 16 bytes son vuestros';
  if (n <= 0) return 'Los 16 bytes los ha puesto el azar';
  return `${yours} y ${16 - n} del azar`;
}

// Una orden a la sala del servidor de la demo; null si no hay servidor o no contesta.
async function room(path = '', body) {
  try {
    const r = await fetch(new URL(`/api/sala${path}`, location.href), {
      method: body ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(2500),
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export function mount(container, options = {}) {
  const form = container.querySelector('form');
  const input = form.querySelector('input');
  const count = container.querySelector('.clave-n');
  const save = form.querySelector('button[type="submit"]');
  const saved = container.querySelector('.clave-guardada');
  const dots = saved.querySelector('.puntos');
  const from = saved.querySelector('.clave-origen');
  const panel = container.querySelector('.sala');
  const cells = Array.from({ length: 16 }, () => panel.querySelector('.sala-bytes').appendChild(document.createElement('li')));
  const withPhones = form.querySelector('.clave-qr');
  let hasRoom = false, active = false, timer = 0, qrRound = null, disposed = false;

  // Qué se ve: 'sala' (el QR), 'palabra' (el formulario) o 'guardada'.
  function view(name) {
    panel.hidden = name !== 'sala';
    form.hidden = name !== 'palabra';
    saved.hidden = name !== 'guardada';
    withPhones.hidden = !hasRoom;
    container.dataset.vista = name;
    poll();
  }

  function showSaved(length, text, animate = false) {
    // Un punto por letra o por byte: se ve que se guardó entera, pero no cuál es.
    dots.innerHTML = Array.from({ length }, (_, i) => `<span style="animation-delay:${animate ? i * 45 : 0}ms">•</span>`).join('');
    from.textContent = text;
    // Se rehace el check para que se vuelva a dibujar.
    const check = saved.querySelector('.check');
    check.replaceWith(check.cloneNode(true));
    view('guardada');
  }

  // Lo que ya esté guardado de antes (al volver a la diapositiva o al recargar).
  function restore() {
    const word = get(STORAGE_KEY);
    if (savedHex()) showSaved(16, origin(Number(get(STORAGE_PUBLIC)) || 0));
    else if (word) showSaved(word.length, '');
    else view(hasRoom ? 'sala' : 'palabra');
  }

  // ── La sala ──
  function paint(state) {
    if (!state?.activa) return;
    if (qrRound == null) {
      panel.querySelector('img').src = new URL('/api/sala/qr.svg', location.href).href;
      panel.querySelector('.sala-url').textContent = state.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
    qrRound = state.ronda;
    cells.forEach((cell, j) => {
      cell.classList.toggle('asignado', state.asignados[j]);
      cell.classList.toggle('elegido', state.elegidos[j]);
    });
    panel.querySelector('.sala-n').textContent = String(state.elegidos.filter(Boolean).length);
    const phones = state.dispositivos;
    panel.querySelector('.sala-moviles').textContent = phones === 1 ? '1 móvil conectado' : `${phones} móviles conectados`;
  }

  // Mientras la diapositiva está en pantalla y se ve el QR, se pregunta cada segundo.
  function poll() {
    clearTimeout(timer);
    if (!active || disposed || panel.hidden) return;
    room().then((state) => {
      if (disposed) return;
      paint(state);
      timer = setTimeout(poll, POLL_MS);
    });
  }

  panel.querySelector('.sala-cerrar').addEventListener('click', async () => {
    const end = await room('/cerrar', {});
    if (!end?.clave_hex) { panel.querySelector('.sala-moviles').textContent = 'El servidor no contesta: prueba otra vez'; return; }
    set(STORAGE_HEX, end.clave_hex);
    set(STORAGE_PUBLIC, end.del_publico);
    set(STORAGE_KEY, null);
    showSaved(16, origin(end.del_publico), true);
    window.deck?.cue?.('success');
  });
  panel.querySelector('.sala-palabra').addEventListener('click', () => { view('palabra'); input.focus(); });
  withPhones.addEventListener('click', () => view('sala'));

  // ── La palabra ──
  const refresh = () => {
    const clean = sanitize(input.value);
    if (clean !== input.value) input.value = clean;
    count.textContent = String(clean.length);
    save.disabled = !clean.trim();
  };
  input.addEventListener('input', refresh);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const word = sanitize(input.value).trim();
    if (!word) return;
    set(STORAGE_KEY, word);
    set(STORAGE_HEX, null);
    set(STORAGE_PUBLIC, null);
    input.value = '';
    refresh();
    showSaved(word.length, '', true);
    window.deck?.cue?.('success');
  });

  // «Cambiar»: se olvida la clave guardada y, con sala, empieza otra ronda.
  saved.querySelector('.cambiar').addEventListener('click', async () => {
    const wasRoom = !!savedHex();
    set(STORAGE_HEX, null);
    set(STORAGE_PUBLIC, null);
    set(STORAGE_KEY, null);
    if (hasRoom && wasRoom) paint(await room('/abrir', {}));
    view(hasRoom && wasRoom ? 'sala' : 'palabra');
    if (!(hasRoom && wasRoom)) input.focus();
  });

  refresh();
  if (options.static) {
    view('palabra');
    container.dataset.ready = '1';
  } else {
    restore();
    // ¿Hay sala? Si el servidor la tiene, el QR pasa a ser lo primero que se ve.
    room().then((state) => {
      if (disposed) return;
      hasRoom = !!state?.activa;
      // La sala está abierta y aquí hay una clave suya guardada: es de antes de reiniciar el
      // servidor (o de otra ronda). Se olvida, y vuelve a salir el QR.
      if (hasRoom && state.abierta && savedHex()) { set(STORAGE_HEX, null); set(STORAGE_PUBLIC, null); }
      paint(state);
      restore();
      container.dataset.ready = '1';
    });
  }
  return {
    steps: 1,
    start() { active = true; if (saved.hidden && (savedHex() || get(STORAGE_KEY))) restore(); else poll(); },
    stop() { active = false; clearTimeout(timer); },
    step() {},
    dispose() { disposed = true; clearTimeout(timer); },
  };
}
