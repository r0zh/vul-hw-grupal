// Cifras que ruedan, con el «roll» de cartera-en-vivo.html (estetica-web):
// cada dígito es una columna 0-9 que se desplaza desde el valor anterior,
// escalonada de izquierda a derecha. El texto final está en el HTML (con su
// data-cifra), así que sin JS o en el PDF se ve el valor correcto.
//
// mount(container): al entrar en la diapositiva, cada .roll del contenedor
// rueda desde cero hasta su valor, una vez y escalonadas. Las que llevan
// data-valores="5|20|100|400" ruedan al valor de cada paso (steps = nº de valores).
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DIG = [...'0123456789'].map((d) => `<span>${d}</span>`).join('');

export function roll(el, text, { instant = false } = {}) {
  text = String(text);
  const prevDigits = (el.dataset.v || '').replace(/\D/g, ''), digits = text.replace(/\D/g, '');
  const shape = text.replace(/\d/g, '0');
  if (el.dataset.k !== shape) { // cambia la forma (nº de cifras, comas): rehace las columnas en el valor previo
    el.innerHTML = [...text].map((c) => (/\d/.test(c)
      ? '<span class="rd"><span class="rs">' + DIG + '</span></span>'
      : `<span class="rp">${c === ' ' ? '&nbsp;' : c}</span>`)).join('');
    el.dataset.k = shape;
    el.querySelectorAll('.rs').forEach((s, i) => {
      const j = prevDigits.length - (digits.length - i);
      s.style.transition = 'none';
      s.style.transform = `translateY(-${(j >= 0 ? +prevDigits[j] : 0) * 1.1}em)`;
    });
    void el.offsetWidth;
    el.querySelectorAll('.rs').forEach((s) => { s.style.transition = ''; });
  }
  el.querySelectorAll('.rs').forEach((s, i) => {
    if (instant) s.style.transition = 'none';
    s.style.transitionDelay = (RM || instant ? 0 : i * 45) + 'ms';
    s.style.transform = `translateY(-${+digits[i] * 1.1}em)`;
  });
  if (instant) { void el.offsetWidth; el.querySelectorAll('.rs').forEach((s) => { s.style.transition = ''; }); }
  el.dataset.v = text;
  el.setAttribute('aria-label', text);
}

const zeros = (t) => t.replace(/\d/g, '0');

export function mount(container, options = {}) {
  const rolls = [...container.querySelectorAll('.roll')];
  const once = rolls.filter((r) => !r.dataset.valores).map((r) => ({ el: r, to: r.textContent.trim() }));
  const stepped = rolls.filter((r) => r.dataset.valores).map((r) => ({ el: r, values: r.dataset.valores.split('|') }));
  const steps = Math.max(1, ...stepped.map((s) => s.values.length));
  let timers = [];

  if (options.static) {
    stepped.forEach((s) => { s.el.textContent = s.values[Math.min(options.step ?? steps - 1, s.values.length - 1)]; });
  } else {
    once.forEach((o) => roll(o.el, zeros(o.to), { instant: true }));
    stepped.forEach((s) => roll(s.el, s.values[0], { instant: true }));
  }
  container.dataset.ready = '1';

  return {
    steps,
    start() {
      if (options.static) return;
      // Ruedan desde cero cada vez que se entra en la diapositiva.
      once.forEach((o, i) => {
        roll(o.el, zeros(o.to), { instant: true });
        timers.push(setTimeout(() => roll(o.el, o.to), 250 + i * 120));
      });
    },
    stop() { timers.forEach(clearTimeout); timers = []; },
    step(n) {
      if (options.static) return;
      stepped.forEach((s) => roll(s.el, s.values[Math.min(n, s.values.length - 1)]));
    },
    dispose() { timers.forEach(clearTimeout); timers = []; },
  };
}
