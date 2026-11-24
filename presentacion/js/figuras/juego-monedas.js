// El juego que abre la presentación: diez monedas de 1 €, una trucada (sale cara el 60 %), y se
// tira hasta que alguien de la sala sepa decir con seguridad cuál es. Envuelve la escena de
// js/escenas/monedas.js, que pone el contador «N tiradas» arriba, con una interfaz mínima abajo:
//   «Tirar»           una tirada de cada moneda;
//   «Seguir tirando»  tira solo, en tandas cada vez mayores (1, 2, 5, 10, 20… hasta 1000), hasta
//                     que se pulsa el mismo botón, que pasa a «Parar»;
//   tocar una moneda  la marca como la que dice la sala, congela N y deja solo «Comprobar», que
//                     revela la trucada: «¡Acertado con N tiradas!», «Acertado, pero con suerte…»
//                     (si su barra aún estaba dentro de la franja: no se podía saber) o «No era esa: era la X».
//                     Tocar otra vez la marcada la desmarca y vuelven «Tirar» y «Seguir tirando»;
//   «Nueva partida»   el icono de la esquina: sortea otra trucada, que no conoce nadie.
//
// mount(container, options) → { steps: 1, start, stop, step, dispose }
//   options.static   N = 1000 y revelada, sin botones (el PDF).
//   options.trucada (0–9) y options.semilla fijan la primera partida (pruebas); si no, se sortean.
// Al comprobar guarda en sessionStorage 'juego:n' (N al marcar), 'juego:acierto' ('true' o 'false') y
// 'juego:suerte' ('true' si acertó con la barra aún dentro de la franja).
// Al acertar suena 'success' con window.deck.cue, que solo suena si el sonido del deck está activado.
import { mount as mountScene, countHeads } from '../escenas/monedas.js';
import { PALETA, css } from '../paleta.js';

const LETTERS = 'ABCDEFGHIJ';
const BATCHES = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const trials = (n) => (n === 1 ? '1 tirada' : `${n} tiradas`);
// ¿La barra de la moneda i está fuera de la franja del azar con n tiradas? La misma cuenta que dibuja
// js/escenas/monedas.js: ± 1,5/√n alrededor del 50 %, que con menos de 10 tiradas lo cubre todo.
const outside = (semilla, trucada, i, n) => n > 0
  && Math.abs(countHeads(semilla, trucada, n)[i] / n - 0.5) > Math.min(0.5, 1.5 / Math.sqrt(n)) + 1e-9;
const randomGame = () => ({ trucada: Math.floor(Math.random() * 10), semilla: Math.floor(Math.random() * 2 ** 31) });
const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const ICONS = {
  play: svg('<path d="M7.5 5.2v13.6a1 1 0 0 0 1.5.86l11.3-6.8a1 1 0 0 0 0-1.72L9 4.34a1 1 0 0 0-1.5.86z"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2.5"/>'),
  again: svg('<path d="M18.4 8.2A7.5 7.5 0 1 0 19.5 13"/><path d="M19 3.8v4.7h-4.7"/>'),
  check: svg('<path d="M6.5 12.5l3.6 3.6 7.4-8.2"/>'),
};

function style() {
  const el = document.createElement('style');
  el.textContent = `
    .juego-monedas { position:absolute; inset:0; display:flex; flex-direction:column; font:inherit; }
    .juego-monedas [hidden] { display:none !important; }
    .juego-escena { position:relative; flex:1; min-height:0; }
    /* La barra se mete en el hueco libre de debajo de las letras: más sitio para las monedas. */
    .juego-mandos { position:relative; z-index:1; flex:none; height:100px; margin-top:-24px; display:flex;
      align-items:center; justify-content:center; gap:20px; pointer-events:none; }
    .juego-mandos > * { pointer-events:auto; }
    .juego-boton { display:inline-flex; align-items:center; justify-content:center; gap:14px; height:80px;
      padding:0 44px; border:0; border-radius:999px; font:inherit; font-size:32px; font-weight:600;
      letter-spacing:-.015em; white-space:nowrap; cursor:pointer; color:${css(PALETA.tinta)};
      background:${css(PALETA.superficie)};
      box-shadow:0 0 0 1px rgba(0,0,0,.06), 0 2px 6px rgba(0,0,0,.04), 0 14px 30px -18px rgba(0,0,0,.35);
      transition:transform .18s cubic-bezier(.16,1,.3,1), background-color .2s, opacity .2s;
      animation:juego-entra .32s cubic-bezier(.16,1,.3,1) both; }
    .juego-boton:hover { background:#fafafc; }
    .juego-boton.principal { color:#fff; background:${css(PALETA.acento)};
      box-shadow:inset 0 1px 0 rgba(255,255,255,.18), 0 14px 30px -14px rgba(0,113,227,.75); }
    .juego-boton.principal:hover { background:#0077ed; }
    .juego-boton:active { transform:scale(.97); }
    .juego-boton:disabled { opacity:.38; cursor:default; transform:none; }
    .juego-boton svg { width:26px; height:26px; margin-left:-6px; fill:currentColor; }
    .juego-veredicto { display:inline-flex; align-items:center; gap:20px; height:88px; margin:0; padding:0 40px;
      border-radius:999px; background:${css(PALETA.superficie)}; color:${css(PALETA.tinta)};
      font-size:36px; font-weight:600; letter-spacing:-.02em; white-space:nowrap;
      box-shadow:0 0 0 1px rgba(0,0,0,.05), 0 2px 6px rgba(0,0,0,.04), 0 20px 48px -24px rgba(0,0,0,.3);
      animation:juego-entra .45s cubic-bezier(.34,1.4,.64,1) both; }
    .juego-veredicto b { color:${css(PALETA.ok)}; font-weight:700; }
    .juego-veredicto.acierto { padding-left:14px; color:${css(PALETA.ok)}; }
    .juego-check { flex:none; display:grid; place-items:center; width:62px; height:62px; border-radius:50%;
      background:${css(PALETA.okVivo)}; }
    .juego-check svg { width:34px; height:34px; fill:none; stroke:#fff; stroke-width:3.2; stroke-linecap:round;
      stroke-linejoin:round; stroke-dasharray:30; stroke-dashoffset:30; animation:juego-traza .5s .2s ease-out forwards; }
    .juego-nueva { position:absolute; top:0; right:0; z-index:1; display:grid; place-items:center; width:60px;
      height:60px; padding:0; border:0; border-radius:50%; cursor:pointer; color:${css(PALETA.tenue)};
      background:rgba(0,0,0,.04); opacity:.75; transition:opacity .2s, background-color .2s, transform .18s; }
    .juego-nueva:hover { opacity:1; background:rgba(0,0,0,.07); }
    .juego-nueva:active { transform:rotate(-40deg) scale(.94); }
    .juego-nueva svg { width:28px; height:28px; fill:none; stroke:currentColor; stroke-width:2.2;
      stroke-linecap:round; stroke-linejoin:round; }
    @keyframes juego-entra { from { opacity:0; transform:translateY(10px) scale(.96); } }
    @keyframes juego-traza { to { stroke-dashoffset:0; } }
    @media (prefers-reduced-motion: reduce) {
      .juego-monedas *, .juego-monedas *::before { animation:none !important; transition:none !important; }
      .juego-check svg { stroke-dashoffset:0; }
    }
  `;
  return el;
}

export function mount(container, options = {}) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const oldPosition = container.style.position;
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  const root = document.createElement('div');
  root.className = 'juego-monedas';
  const stage = document.createElement('div');
  stage.className = 'juego-escena';
  root.append(style(), stage);
  container.append(root);
  const remove = () => {
    root.remove();
    container.style.position = oldPosition;
    delete container.dataset.ready;
  };

  if (options.static === true) {
    const scene = mountScene(stage, { static: true, step: 5 });
    container.dataset.ready = '1';
    return { steps: 1, start() {}, stop() {}, step() {}, dispose() { scene.dispose(); remove(); } };
  }

  const first = randomGame();
  let rigged = options.trucada ?? first.trucada, seed = options.semilla ?? first.semilla;
  let n = 0, auto = false, next = 0, timer = 0, verdictTimer = 0;
  let chosen = null, frozen = 0, revealed = false;
  const scene = mountScene(stage, { trucada: rigged, semilla: seed, onCount });

  const bar = document.createElement('div');
  bar.className = 'juego-mandos';
  const button = (label, onClick, extra = '') => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `juego-boton ${extra}`;
    el.innerHTML = label;
    el.addEventListener('click', onClick);
    return el;
  };
  const tossOnce = button('Tirar', () => { n += 1; scene.toss(1); });
  const keepTossing = button('', () => (auto ? halt() : go()), 'principal');
  const check = button('Comprobar', reveal, 'principal');
  const verdict = document.createElement('p');
  verdict.className = 'juego-veredicto';
  verdict.setAttribute('role', 'status');
  verdict.hidden = true;
  bar.append(tossOnce, keepTossing, check, verdict);
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'juego-nueva';
  again.title = 'Nueva partida';
  again.setAttribute('aria-label', 'Nueva partida');
  again.innerHTML = ICONS.again;
  again.addEventListener('click', newGame);
  root.append(bar, again);

  function paint() {
    tossOnce.hidden = keepTossing.hidden = chosen !== null;
    tossOnce.disabled = auto;
    keepTossing.innerHTML = auto ? `${ICONS.stop}Parar` : `${ICONS.play}Seguir tirando`;
    check.hidden = chosen === null || revealed;
  }

  // Cada tanda sale cuando el contador llega a la anterior. Al reanudar, la primera tanda es
  // la mitad de lo que ya se lleva: el ritmo sigue donde se dejó.
  function go() {
    auto = true;
    next = Math.max(0, BATCHES.findLastIndex((k) => k <= n / 2));
    paint();
    batch();
  }
  function batch() {
    if (!auto) return;
    const k = BATCHES[Math.min(next++, BATCHES.length - 1)];
    n += k;
    scene.toss(k);
  }
  function onCount(count) {
    if (auto && count === n) timer = setTimeout(batch, motion.matches ? 700 : 250);
  }
  function halt() {
    auto = false;
    clearTimeout(timer);
    paint();
  }

  const stopListening = scene.onPick((i) => {
    if (revealed) return scene.pick(chosen); // tras comprobar, la elección ya no cambia
    halt();
    if (i === chosen) {
      chosen = null;
      scene.pick(null);
    } else {
      chosen = i;
      frozen = n;
    }
    paint();
  });

  function reveal() {
    if (chosen === null || revealed) return;
    revealed = true;
    const hit = chosen === rigged;
    // Acertar con la barra aún dentro de la franja es suerte: con esas tiradas no se podía saber.
    const lucky = hit && !outside(seed, rigged, chosen, frozen);
    try {
      sessionStorage.setItem('juego:n', String(frozen));
      sessionStorage.setItem('juego:acierto', String(hit));
      sessionStorage.setItem('juego:suerte', String(lucky));
    } catch { /* sin almacenamiento */ }
    scene.reveal();
    paint();
    // El veredicto llega cuando la trucada ya ha subido y se ha puesto verde.
    verdictTimer = setTimeout(() => {
      verdict.classList.toggle('acierto', hit && !lucky);
      verdict.innerHTML = lucky ? `<span>Acertado, pero con suerte: seguía dentro de la franja</span>`
        : hit ? `<span class="juego-check">${ICONS.check}</span><span>¡Acertado con ${trials(frozen)}!</span>`
          : `<span>No era esa: era la <b>${LETTERS[rigged]}</b></span>`;
      verdict.hidden = false;
      if (hit && !lucky) window.deck?.cue?.('success');
    }, motion.matches ? 0 : 650);
  }

  function newGame() {
    halt();
    clearTimeout(verdictTimer);
    const game = randomGame();
    rigged = game.trucada;
    seed = game.semilla;
    scene.reset(game);
    n = frozen = 0;
    chosen = null;
    revealed = false;
    verdict.hidden = true;
    paint();
  }

  paint();
  container.dataset.ready = '1';
  return {
    steps: 1,
    start: () => scene.start(),
    stop() { halt(); scene.stop(); },
    step() {},
    dispose() {
      halt();
      clearTimeout(verdictTimer);
      stopListening();
      scene.dispose();
      remove();
    },
  };
}
