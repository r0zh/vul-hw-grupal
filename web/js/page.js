// Comportamiento de la página que no pertenece a ninguna figura: los pasos
// guiados de las cajas «Prueba esto», el recorrido del esquema del montaje, la
// navegación por secciones, el glosario emergente y las preguntas rápidas.
// Todo se declara en index.html con atributos; aquí solo se conecta.

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- pasos guiados -------------------------------------------------------
// <button class="do" data-fig="id" data-set='{"n":20}' data-call="play">: aplica
// el estado a la figura y, si hace falta, la acerca a la vista. Así la caja
// dice qué probar y además lo hace, y las specs pulsan estos mismos botones.
document.addEventListener('click', (e) => {
  const b = e.target.closest('button.do');
  if (!b) return;
  const fig = document.getElementById(b.dataset.fig);
  if (!fig) return;
  if (b.dataset.set) fig.set(JSON.parse(b.dataset.set));
  if (b.dataset.call) fig[b.dataset.call](...JSON.parse(b.dataset.args ?? '[]'));
  (b.closest('li') ?? b).classList.add('done');
  const r = fig.getBoundingClientRect();
  if (r.top > innerHeight - 160 || r.bottom < 160) fig.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
});

// ---- esquema del montaje ---------------------------------------------------
// <ol class="flow" data-diagram="montaje"> con <li data-step="n">: al pasar por
// un paso se resaltan en el esquema los elementos con el mismo data-step, y el
// botón .flow-play los recorre en orden. Un elemento del esquema puede servir a
// varios pasos (data-step="1 4").
for (const list of document.querySelectorAll('ol.flow[data-diagram]')) {
  const figure = document.querySelector(`figure[data-diag="${list.dataset.diagram}"]`);
  if (!figure) continue;
  const items = [...list.querySelectorAll('li[data-step]')];
  const show = (step) => {
    for (const el of figure.querySelectorAll('[data-step]')) el.classList.toggle('on', el.dataset.step.split(' ').includes(step));
    for (const li of items) li.classList.toggle('on', li.dataset.step === step);
    figure.dataset.active = step ?? '';
  };
  let timer = null;
  const stop = () => { clearTimeout(timer); timer = null; };
  for (const li of items) {
    li.addEventListener('mouseenter', () => { stop(); show(li.dataset.step); });
    li.addEventListener('focus', () => { stop(); show(li.dataset.step); });
    li.addEventListener('click', () => { stop(); show(li.dataset.step); });
  }
  list.addEventListener('mouseleave', () => { if (!timer) show(null); });
  const play = document.querySelector(`.flow-play[data-diagram="${list.dataset.diagram}"]`);
  play?.addEventListener('click', () => {
    stop();
    let i = 0;
    const next = () => {
      if (i >= items.length) { show(null); timer = null; return; }
      show(items[i++].dataset.step);
      timer = setTimeout(next, 1600);
    };
    next();
  });
}

// ---- navegación por secciones ----------------------------------------------
// Un punto por sección en el margen izquierdo (pantallas anchas) y una barra
// de progreso arriba. Los títulos salen de los <h2 id> de la página.
const heads = [...document.querySelectorAll('main h2[id]')];
if (heads.length) {
  const nav = document.createElement('nav');
  nav.className = 'dots';
  nav.setAttribute('aria-label', 'Secciones');
  nav.innerHTML = heads.map((hd) => `<a href="#${hd.id}"><span>${hd.textContent}</span></a>`).join('');
  const bar = document.createElement('div');
  bar.className = 'progress';
  bar.innerHTML = '<i></i>';
  document.body.append(nav, bar);
  const links = [...nav.querySelectorAll('a')];
  let queued = false;
  const update = () => {
    queued = false;
    const doc = document.documentElement, max = doc.scrollHeight - innerHeight;
    bar.style.setProperty('--p', max > 0 ? Math.min(1, scrollY / max).toFixed(4) : '0');
    let current = -1;
    heads.forEach((hd, i) => { if (hd.getBoundingClientRect().top < innerHeight * 0.35) current = i; });
    links.forEach((a, i) => (i === current ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  update();
}

// ---- glosario emergente ------------------------------------------------------
// <a class="term" href="#g-traza">traza</a> enseña la definición de la entrada
// <dt id="g-traza"> del glosario al pasar el ratón, al recibir el foco o al
// tocarlo. Sin JavaScript, el enlace lleva al glosario.
const tip = document.createElement('div');
tip.className = 'term-tip';
tip.setAttribute('role', 'tooltip');
tip.hidden = true;
document.body.append(tip);
let pinned = null;
const defOf = (a) => {
  const dt = document.getElementById(a.getAttribute('href').slice(1));
  const dd = dt?.nextElementSibling;
  return dt && dd ? { name: dt.textContent, html: dd.innerHTML } : null;
};
const openTip = (a) => {
  const def = defOf(a);
  if (!def) return;
  tip.innerHTML = `<b>${def.name}</b>${def.html}`;
  tip.hidden = false;
  const r = a.getBoundingClientRect(), w = tip.offsetWidth, vw = document.documentElement.clientWidth;
  tip.style.left = `${Math.max(8, Math.min(r.left, vw - w - 8)) + scrollX}px`;
  const below = r.bottom + 6 + tip.offsetHeight < innerHeight;
  tip.style.top = `${(below ? r.bottom + 6 : r.top - tip.offsetHeight - 6) + scrollY}px`;
};
const closeTip = () => { tip.hidden = true; pinned = null; };
document.addEventListener('mouseover', (e) => { const a = e.target.closest?.('a.term'); if (a && !pinned) openTip(a); });
document.addEventListener('mouseout', (e) => { if (e.target.closest?.('a.term') && !pinned) tip.hidden = true; });
document.addEventListener('focusin', (e) => { const a = e.target.closest?.('a.term'); if (a && !pinned) openTip(a); });
document.addEventListener('focusout', (e) => { if (e.target.closest?.('a.term') && !pinned) tip.hidden = true; });
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a.term');
  if (a) {
    e.preventDefault();
    if (pinned === a) closeTip(); else { openTip(a); pinned = a; }
  } else if (!tip.contains(e.target)) closeTip();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTip(); });

// ---- preguntas rápidas ---------------------------------------------------------
// <div class="quiz"> con botones [data-ok] y su explicación en data-why. Se
// puede fallar y volver a intentarlo: la respuesta no se guarda.
document.addEventListener('click', (e) => {
  const b = e.target.closest('.quiz-opts button');
  if (!b) return;
  const quiz = b.closest('.quiz'), ok = b.dataset.ok === '1';
  for (const o of quiz.querySelectorAll('.quiz-opts button')) o.classList.remove('right', 'wrong');
  b.classList.add(ok ? 'right' : 'wrong');
  quiz.dataset.answered = ok ? 'right' : 'wrong';
  const fb = quiz.querySelector('.quiz-fb');
  fb.className = `quiz-fb ${ok ? 'right' : 'wrong'}`;
  fb.textContent = `${ok ? 'Correcto. ' : 'No es esa. '}${b.dataset.why ?? ''}`;
});
