// Contrato de la página como lectura: la portada, los pasos guiados, el
// esquema del montaje, el glosario, las preguntas y la navegación.
import { dataOf, countOf, textOf, assert } from './helpers.mjs';

const H = '#hero';
const num = async (page, sel, key) => Number(await dataOf(page, sel, key));

export const spec = {
  slug: 'pagina',
  title: 'La página como lectura guiada',
  page: '/web/index.html',
  widget: H,
  claims: [
    { id: 'hero-starts-empty-and-ends-with-the-key', why: 'la portada empieza sin clave y, al añadir trazas medidas, acaba con los 16 bytes',
      async run({ page }) {
        assert(await dataOf(page, H, 'source') === 'real', 'la portada no usa trazas medidas');
        assert((await textOf(page, `${H} .real-badge`)).toLowerCase().includes('medida real'), 'falta la etiqueta de medida real');
        assert(await num(page, H, 'n') === 2 && await num(page, H, 'recovered') < 4, 'la portada no empieza con dos trazas y sin clave');
        assert(await countOf(page, `${H} svg`) === 0, 'la portada lleva gráficas: debería ser solo la clave');
        await page.evalJs(`document.querySelector('${H} .cl-play').click()`);
        await page.waitFor(`document.querySelector('${H}').dataset.playing === 'false'`, 20000);
        assert(await num(page, H, 'n') === 400 && await num(page, H, 'recovered') === 16, `acaba en N = ${await dataOf(page, H, 'n')} con ${await dataOf(page, H, 'recovered')} bytes`);
      } },
    { id: 'hero-caption-76-traces', why: 'lo que dice el pie de la portada: con 75 trazas falta algún byte y a partir de la 76 están los 16',
      async run({ page }) {
        const at = async (n) => { await page.evalJs(`document.querySelector('${H}').set({ n: ${n} })`); return num(page, H, 'recovered'); };
        assert(await at(75) < 16, 'con 75 trazas ya está la clave');
        for (const n of [76, 80, 100, 200]) assert(await at(n) === 16, `con ${n} trazas falta algún byte`);
        assert((await textOf(page, 'figure.hero figcaption')).includes('a partir de la 76'), 'el pie no dice 76');
      } },
    { id: 'no-duplicate-ids', why: 'ningún id se repite: los pasos guiados y los enlaces internos encuentran siempre lo que buscan',
      async run({ page }) {
        const dup = await page.evalJs(`(() => {
          const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
          return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
        })()`);
        assert(dup.length === 0, `ids repetidos: ${dup.join(', ')}`);
      } },
    { id: 'every-figure-has-working-steps', why: 'cada figura interactiva tiene su caja «Prueba esto», y todos sus botones apuntan a una figura que existe',
      async run({ page }) {
        const report = await page.evalJs(`(() => {
          const figs = [...document.querySelectorAll('main cpa-leak, main cpa-sbox, main cpa-spa, main cpa-dpa, main cpa-corr, main cpa-live:not([compact])')];
          const without = figs.filter((f) => !f.parentElement.matches('.guided') || !f.parentElement.querySelector('.try button.do[data-fig="' + f.id + '"]')).map((f) => f.id);
          const broken = [...document.querySelectorAll('button.do')].filter((b) => {
            const fig = document.getElementById(b.dataset.fig);
            return !fig || (b.dataset.call && typeof fig[b.dataset.call] !== 'function') || (!b.dataset.call && !b.dataset.set);
          }).map((b) => b.textContent);
          return { figs: figs.length, without, broken, steps: document.querySelectorAll('button.do').length };
        })()`);
        assert(report.figs === 9, `hay ${report.figs} figuras con mandos`);
        assert(report.without.length === 0, `figuras sin caja de pasos: ${report.without.join(', ')}`);
        assert(report.broken.length === 0, `pasos que no hacen nada: ${report.broken.join(' | ')}`);
        assert(report.steps >= 24, `solo hay ${report.steps} pasos`);
      } },
    { id: 'steps-sit-beside-the-figure-on-wide-screens', why: 'en pantallas anchas la caja de pasos va al lado de su figura; en estrechas, justo encima',
      async run({ page }) {
        const boxes = () => page.evalJs(`(() => {
          const fig = document.querySelector('#cpa-main').getBoundingClientRect();
          const box = document.querySelector('#cpa-main').parentElement.querySelector('.try-box').getBoundingClientRect();
          return { figLeft: fig.left, figRight: fig.right, figTop: fig.top, boxLeft: box.left, boxRight: box.right, boxTop: box.top, boxBottom: box.bottom, vw: innerWidth };
        })()`);
        let b = await boxes();
        assert(b.boxLeft >= b.figRight && b.boxRight <= b.vw, `a 1366 px la caja no está a la derecha de la figura: ${JSON.stringify(b)}`);
        assert(Math.abs(b.boxTop - b.figTop) < 4, 'la caja no empieza a la altura de la figura');
        await page.setViewport(900, 900);
        b = await boxes();
        assert(b.boxBottom <= b.figTop + 1 && Math.abs(b.boxLeft - b.figLeft) < 2, `a 900 px la caja no está encima de la figura: ${JSON.stringify(b)}`);
      } },
    { id: 'flow-steps-light-up-the-diagram', why: 'el esquema del montaje es un dibujo, no texto, y cada paso de la lista resalta su flecha',
      async run({ page }) {
        assert(await countOf(page, 'figure.diag pre') === 0, 'queda algún esquema en ASCII');
        assert(await countOf(page, 'figure[data-diag="montaje"] svg [data-step]') >= 12, 'el esquema no tiene elementos enlazados a los pasos');
        const lit = (stepNo) => page.evalJs(`(() => {
          document.querySelector('ol.flow li[data-step="${stepNo}"]').dispatchEvent(new MouseEvent('mouseenter'));
          return [...document.querySelectorAll('figure[data-diag="montaje"] svg .on')].map((e) => e.dataset.step);
        })()`);
        const two = await lit(2);
        assert(two.length >= 3 && two.every((s) => s === '2'), `el paso 2 resalta: ${two.join(',')}`);
        const four = await lit(4);
        assert(four.length >= 4 && four.every((s) => s.split(' ').includes('4')), `el paso 4 resalta: ${four.join(',')}`);
        await page.evalJs(`document.querySelector('.flow-play').click()`);
        assert(await page.evalJs(`document.querySelector('figure[data-diag="montaje"]').dataset.active`) === '1', 'el recorrido no empieza por el paso 1');
      } },
    { id: 'glossary-terms-explain-themselves', why: 'las palabras del glosario enseñan su definición sin sacar al lector de donde está',
      async run({ page }) {
        const terms = await page.evalJs(`[...document.querySelectorAll('a.term')].map((a) => a.getAttribute('href'))`);
        assert(terms.length >= 10, `solo hay ${terms.length} términos enlazados`);
        const missing = await page.evalJs(`[...document.querySelectorAll('a.term')].filter((a) => !document.querySelector(a.getAttribute('href') + ' + dd')).map((a) => a.textContent)`);
        assert(missing.length === 0, `términos sin definición: ${missing.join(', ')}`);
        const shown = await page.evalJs(`(() => {
          const a = document.querySelector('a.term[href="#g-traza"]');
          a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          const tip = document.querySelector('.term-tip');
          return { hidden: tip.hidden, text: tip.textContent };
        })()`);
        assert(!shown.hidden && shown.text.includes('consumo del chip'), `la definición no aparece: ${JSON.stringify(shown)}`);
        const y = await page.evalJs('scrollY');
        await page.evalJs(`document.querySelector('a.term[href="#g-traza"]').click()`);
        assert(await page.evalJs('scrollY') === y, 'pulsar un término salta al glosario');
        await page.evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
        assert(await page.evalJs(`document.querySelector('.term-tip').hidden`), 'Escape no cierra la definición');
      } },
    { id: 'quizzes-give-feedback', why: 'cada pregunta rápida tiene una sola respuesta buena y explica por qué',
      async run({ page }) {
        const shape = await page.evalJs(`[...document.querySelectorAll('.quiz')].map((q) => ({
          options: q.querySelectorAll('.quiz-opts button').length,
          right: q.querySelectorAll('.quiz-opts button[data-ok="1"]').length,
          why: [...q.querySelectorAll('.quiz-opts button')].every((b) => (b.dataset.why ?? '').length > 20) }))`);
        assert(shape.length >= 4, `solo hay ${shape.length} preguntas`);
        for (const q of shape) assert(q.options === 3 && q.right === 1 && q.why, `pregunta mal formada: ${JSON.stringify(q)}`);
        const answer = (ok) => page.evalJs(`(() => {
          const q = document.querySelector('.quiz');
          q.querySelector('.quiz-opts button[data-ok="${ok}"]').click();
          return { answered: q.dataset.answered, text: q.querySelector('.quiz-fb').textContent };
        })()`);
        const wrong = await answer(0);
        assert(wrong.answered === 'wrong' && wrong.text.startsWith('No es esa.'), `respuesta falsa: ${JSON.stringify(wrong)}`);
        const right = await answer(1);
        assert(right.answered === 'right' && right.text.startsWith('Correcto.'), `respuesta buena: ${JSON.stringify(right)}`);
      } },
    { id: 'section-nav-follows-the-reader', why: 'hay un punto por sección, el de la sección que se lee queda marcado y la barra de progreso avanza',
      async run({ page }) {
        const sections = await countOf(page, 'main h2[id]');
        assert(sections === 14 && await countOf(page, 'nav.dots a') === sections, `hay ${sections} secciones y ${await countOf(page, 'nav.dots a')} puntos`);
        assert(await countOf(page, 'nav.toc a') === sections, 'el índice no tiene una entrada por sección');
        const broken = await page.evalJs(`[...document.querySelectorAll('nav.toc a, nav.dots a, main p a[href^="#"]')].filter((a) => !document.querySelector(a.getAttribute('href'))).map((a) => a.getAttribute('href'))`);
        assert(broken.length === 0, `enlaces internos rotos: ${broken.join(', ')}`);
        // Sin animación de scroll, para medir justo después de saltar.
        await page.evalJs(`document.documentElement.style.scrollBehavior = 'auto'; document.querySelector('#cpa').scrollIntoView(); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
        const current = await page.evalJs(`document.querySelector('nav.dots a[aria-current="true"]')?.getAttribute('href')`);
        assert(current === '#cpa', `el punto marcado es ${current}`);
        const p = Number(await page.evalJs(`getComputedStyle(document.querySelector('.progress')).getPropertyValue('--p')`));
        assert(p > 0.2 && p < 0.8, `progreso ${p}`);
      } },
  ],
};
