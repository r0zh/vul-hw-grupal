// «Vosotros: N tiradas · el ataque: unas 100 trazas» en «Resultados»: recuerda la partida del juego de las monedas,
// que js/figuras/juego-monedas.js guarda al comprobar (sessionStorage 'juego:n', 'juego:acierto' y 'juego:suerte').
// Cambia solo el .recuerdo-juego del HTML; sin partida, o en el PDF, se queda el texto que trae. Si se acertó con la
// barra aún dentro de la franja, lo dice: «con suerte».
//
// mount(container, options) → { steps: 1, start, stop, step, dispose }: lee la partida al montar y al entrar.
export const vosotros = (n, acierto, suerte = false) =>
  `Vosotros: <b>${n} ${n === 1 ? 'tirada' : 'tiradas'}</b>${!acierto ? ', sin acertar' : suerte ? ', con suerte' : ''}`;

function partida() {
  try {
    const n = Number(sessionStorage.getItem('juego:n'));
    return Number.isInteger(n) && n > 0
      ? { n, acierto: sessionStorage.getItem('juego:acierto') === 'true', suerte: sessionStorage.getItem('juego:suerte') === 'true' }
      : null;
  } catch { return null; } // sin almacenamiento
}

export function mount(container, options = {}) {
  const el = container.querySelector('.recuerdo-juego');
  const inicial = el.innerHTML;
  const pintar = () => {
    const p = options.static ? null : partida();
    el.innerHTML = p ? vosotros(p.n, p.acierto, p.suerte) : inicial;
  };
  pintar();
  container.dataset.ready = '1';
  return { steps: 1, start: pintar, stop() {}, step() {}, dispose() { el.innerHTML = inicial; } };
}
