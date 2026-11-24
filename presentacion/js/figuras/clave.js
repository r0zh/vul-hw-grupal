// La clave del público (diapositiva «pregunta»): una palabra de hasta 16 letras que la
// demo programará en el chip y recuperará del consumo. Se guarda en
// sessionStorage('demo:clave') como ASCII imprimible, sin rellenar; quien la
// use la rellena hasta 16 bytes con espacios. Las tildes y la eñe se quitan
// («Málaga» → «Malaga»), porque cada letra tiene que ser un byte.
// El formulario está en index.html; este módulo solo le da vida.
export const STORAGE_KEY = 'demo:clave';

export const sanitize = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').slice(0, 16);

const read = () => { try { return sessionStorage.getItem(STORAGE_KEY); } catch { return null; } };

export function mount(container, options = {}) {
  const form = container.querySelector('form');
  const input = form.querySelector('input');
  const count = container.querySelector('.clave-n');
  const save = form.querySelector('button[type="submit"]');
  const saved = container.querySelector('.clave-guardada');
  const dots = saved.querySelector('.puntos');

  function show(word, animate = false) {
    form.hidden = !!word;
    saved.hidden = !word;
    if (!word) return;
    // Un punto por letra: se ve que se guardó entera, pero no cuál es.
    dots.innerHTML = [...word].map((_, i) => `<span style="animation-delay:${animate ? i * 45 : 0}ms">•</span>`).join('');
    // Se rehace el check para que se vuelva a dibujar.
    const check = saved.querySelector('.check');
    check.replaceWith(check.cloneNode(true));
  }

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
    try { sessionStorage.setItem(STORAGE_KEY, word); } catch { /* sin almacenamiento: la demo usará su clave por defecto */ }
    input.value = '';
    refresh();
    show(word, true);
    window.deck?.cue?.('success');
  });
  saved.querySelector('.cambiar').addEventListener('click', () => {
    show(null);
    input.focus();
  });

  refresh();
  if (!options.static) show(read());
  container.dataset.ready = '1';
  return {
    steps: 1,
    start() { if (saved.hidden && read()) show(read()); },
    stop() {},
    step() {},
    dispose() {},
  };
}
