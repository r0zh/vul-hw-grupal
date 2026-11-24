// La apuesta de la clase: ¿cuántas trazas harán falta para sacar la clave?
//   { modo: 'votar' }    (diapositiva «apuesta») el ponente pulsa la opción más votada;
//                        queda marcada y se guarda en sessionStorage('demo:apuesta').
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

function vote(container, options) {
  const buttons = [...container.querySelectorAll('.opcion')];
  const status = container.querySelector('.apuesta-estado');
  const paint = (value) => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.valor) === value)));
    status.textContent = value ? `Apuesta de la clase: ${LABELS[value]} trazas. Lo vemos en los resultados.` : '';
  };
  for (const b of buttons) {
    b.addEventListener('click', () => {
      const value = Number(b.dataset.valor);
      try { sessionStorage.setItem(STORAGE_KEY, String(value)); } catch { /* sin almacenamiento */ }
      paint(value);
    });
  }
  paint(options.static ? null : read());
  container.dataset.ready = '1';
  return { steps: 1, start() { paint(read()); }, stop() {}, step() {}, dispose() {} };
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
