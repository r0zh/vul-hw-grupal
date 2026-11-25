// La apuesta de la clase: ¿cuántas trazas harán falta para sacar la clave?
//   { modo: 'votar' }    (diapositiva «apuesta») el ponente pulsa la opción más votada;
//                        queda marcada y se guarda en sessionStorage('demo:apuesta').
//                        Con la sala (captura.vivo --sala), mientras la diapositiva
//                        está en pantalla los móviles pueden apostar: cada opción
//                        enseña sus votos y la que va ganando se señala.
//   { modo: 'resolver' } («resultados», paso 1) dice si la clase acertó. La
//                        respuesta sale de los datos medidos: la opción más
//                        cercana, en escala logarítmica, a las trazas que dan el
//                        90 % de éxito (web/data/nano-curvas.json).
// Las opciones de votar están en index.html, con data-valor.
export const STORAGE_KEY = 'demo:apuesta';
const LABELS = { 10: 'unas 10', 100: 'unas 100', 1000: 'unas 1000', 10000: 'unas 10 000', 1000000: 'un millón' };
const OPTIONS = Object.keys(LABELS).map(Number);
const CURVES = new URL('../../../web/data/nano-curvas.json', import.meta.url);

const read = () => { try { return Number(sessionStorage.getItem(STORAGE_KEY)) || null; } catch { return null; } };

export const closestOption = (n) => OPTIONS.reduce((b, o) => (Math.abs(Math.log(o / n)) < Math.abs(Math.log(b / n)) ? o : b));

export function mount(container, options = {}) {
  return options.modo === 'resolver' ? resolve(container, options) : vote(container, options);
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

function vote(container, options) {
  const buttons = [...container.querySelectorAll('.opcion')];
  const status = container.querySelector('.apuesta-estado');
  let chosen = null, phones = 0, active = false, opened = false, timer = 0;
  const paint = (value) => {
    chosen = value;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.valor) === value)));
    status.textContent = value ? `Apuesta de la clase: ${LABELS[value]} trazas. Lo vemos en los resultados.`
      : phones ? `${phones === 1 ? '1 apuesta' : `${phones} apuestas`} desde los móviles` : '';
  };
  // Los votos de los móviles: el número de cada opción, su barra y cuál va ganando.
  const counts = buttons.map((b) => {
    const span = document.createElement('span');
    span.className = 'votos';
    b.insertBefore(span, b.querySelector('.marca'));
    return span;
  });
  function paintVotes(state) {
    if (!state?.activa) return;
    const votes = buttons.map((b) => state.apuestas[b.dataset.valor] ?? 0);
    const top = Math.max(...votes);
    phones = votes.reduce((a, v) => a + v, 0);
    buttons.forEach((b, i) => {
      counts[i].textContent = phones ? String(votes[i]) : '';
      b.style.setProperty('--voto', phones ? votes[i] / phones : 0);
      b.classList.toggle('gana', top > 0 && votes[i] === top);
    });
    paint(chosen);
  }
  function poll() {
    clearTimeout(timer);
    if (!active) return;
    room().then((state) => { if (!active) return; paintVotes(state); if (state?.activa) timer = setTimeout(poll, 1000); });
  }
  for (const b of buttons) {
    b.addEventListener('click', () => {
      const value = Number(b.dataset.valor);
      try { sessionStorage.setItem(STORAGE_KEY, String(value)); } catch { /* sin almacenamiento */ }
      paint(value);
    });
  }
  paint(options.static ? null : read());
  container.dataset.ready = '1';
  return {
    steps: 1,
    start() {
      paint(read());
      if (options.static) return;
      active = true;
      // Si hay sala, abre las apuestas en los móviles y empieza a contar.
      room().then((state) => {
        if (!active || !state?.activa) return;
        opened = true;
        room('/apuesta', { abierta: true }).then((open) => { paintVotes(open); poll(); });
      });
    },
    stop() {
      if (opened) room('/apuesta', { abierta: false });
      active = opened = false;
      clearTimeout(timer);
    },
    step() {},
    dispose() { active = false; clearTimeout(timer); },
  };
}

function resolve(container, options) {
  const text = container.querySelector('p');
  let answer = null, revealed = false, wanted = !!options.static;

  const reveal = () => {
    if (!answer || !wanted) return;
    const bet = options.static ? null : read();
    const right = bet === answer;
    const icon = container.querySelector('.check');
    icon.classList.toggle('neutro', !right);
    text.textContent = !bet ? `La respuesta: ${LABELS[answer]} trazas.`
      : right ? `Apostasteis por ${LABELS[bet]}: ¡acertasteis!`
        : `Apostasteis por ${LABELS[bet]}. Eran ${LABELS[answer]}.`;
    icon.replaceWith(icon.cloneNode(true)); // vuelve a dibujar el check
    if (right && !revealed) window.deck?.cue?.('success');
    revealed = true;
  };

  fetch(CURVES).then((r) => r.json()).then((data) => {
    answer = closestOption(data.series.tinyaes.n90);
    reveal();
    container.dataset.ready = '1';
  }).catch((err) => { console.warn('apuesta: no se pudieron leer las curvas', err); container.dataset.ready = '1'; });

  return {
    steps: 2,
    start() { revealed = false; },
    stop() { wanted = false; },
    step(n) { wanted = n >= 1; reveal(); },
    dispose() {},
  };
}
