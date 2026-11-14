// Contrato de aprendizaje de <cpa-spa>: la traza medida del cifrado completo
// y los pasos de «Prueba esto» de la sección 6.
import { dataOf, countOf, textOf, widgetText, step, assert } from './helpers.mjs';

const W = '#fig-spa';
// Máximo de una serie de la figura (rho1, rho10) entre dos muestras.
const maxOf = (page, series, from, to) => page.evalJs(`Math.max(...document.querySelector('${W}').data.${series}.slice(${from}, ${to}))`);

export const spec = {
  slug: 'cpa-spa',
  title: 'SPA: la traza del cifrado completo',
  page: '/web/index.html',
  widget: W,
  claims: [
    { id: 'whole-encryption-measured', why: 'la figura abre con el cifrado completo, medido en la placa, y sin las rondas marcadas',
      async run({ page }) {
        assert((await textOf(page, `${W} .real-badge`)).toLowerCase().includes('medida real'), 'falta la etiqueta de medida real');
        assert(await dataOf(page, W, 'from') === '0' && await dataOf(page, W, 'to') === '11000', 'no abre con la traza entera');
        assert(await dataOf(page, W, 'view') === 'todo', 'el botón «cifrado completo» no queda marcado');
        assert(await dataOf(page, W, 'marks') === 'false', 'las rondas ya están marcadas: se pierde la pregunta');
        assert(await countOf(page, `${W} .sp-trace .sp-band`) === 0, 'hay bandas sin haberlas pedido');
        assert(await countOf(page, `${W} .sp-trace path.sp-env`) === 1, 'falta la traza');
        // miles() separa los millares con un espacio fino.
        assert(/10\s043/.test(await widgetText(page, W)), 'el texto no dice dónde acaba el cifrado');
      } },
    { id: 'step-mark-rounds-shows-ten', why: 'paso 1: al marcar las rondas aparecen diez bandas, una cada 1014 muestras',
      async run({ page }) {
        await step(page, 'fig-spa', 0);
        assert(await dataOf(page, W, 'marks') === 'true', 'el paso no marca las rondas');
        assert(await countOf(page, `${W} .sp-trace .sp-band`) === 10, `hay ${await countOf(page, `${W} .sp-trace .sp-band`)} bandas`);
        assert(await dataOf(page, W, 'rounds') === '10' && await dataOf(page, W, 'period') === '1014', 'no son 10 rondas de 1014 muestras');
        assert(await page.evalJs(`document.querySelector('${W} .sp-marks').checked`), 'la casilla no refleja el estado');
        assert((await widgetText(page, W)).includes('1014'), 'el texto no dice cuánto dura una ronda');
      } },
    { id: 'step-two-rounds', why: 'paso 2: de cerca se ven dos rondas enteras, con el mismo dibujo',
      async run({ page }) {
        await step(page, 'fig-spa', 1);
        assert(await dataOf(page, W, 'view') === 'dos', 'no queda en la vista de dos rondas');
        assert(await dataOf(page, W, 'visible') === '2', `se ven ${await dataOf(page, W, 'visible')} rondas`);
        const sim = await page.evalJs(`(async () => {
          const { roundSimilarity } = await import('./js/model/spa.js');
          const d = document.querySelector('${W}').data;
          return roundSimilarity(d.mean, d.rounds[0], d.rounds[1]);
        })()`);
        assert(sim > 0.99, `el parecido entre las rondas 1 y 2 es ${sim}`);
      } },
    { id: 'step-attack-window', why: 'paso 3: la ventana del ataque son las muestras 440 a 740, donde fuga la primera ronda',
      async run({ page }) {
        await step(page, 'fig-spa', 2);
        assert(await dataOf(page, W, 'from') === '440' && await dataOf(page, W, 'to') === '740', 'la ventana no es 440–740');
        assert(await dataOf(page, W, 'visible') === '1', 'la ventana no cae en una sola ronda');
        assert(await maxOf(page, 'rho1', 440, 740) > 0.6, 'en la ventana no fuga la primera ronda');
        assert(await maxOf(page, 'rho10', 440, 740) < 0.5, 'en la ventana fuga la última ronda');
        // A este zoom se ven las muestras una a una: línea, no envolvente.
        assert(await countOf(page, `${W} .sp-trace path.sp-line`) === 1, 'de cerca debería dibujarse la traza como línea');
      } },
    { id: 'nav-buttons-stay-inside', why: 'acercar y mover no sacan la vista de la traza',
      async run({ page }) {
        const click = (nav) => page.evalJs(`document.querySelector('${W} [data-nav="${nav}"]').click()`);
        await click('in'); await click('in');
        const span = Number(await dataOf(page, W, 'to')) - Number(await dataOf(page, W, 'from'));
        assert(span === 2750, `tras acercar dos veces se ven ${span} muestras`);
        for (let i = 0; i < 12; i++) await click('right');
        assert(await dataOf(page, W, 'to') === '11000', 'la vista se sale por la derecha');
        for (let i = 0; i < 12; i++) await click('out');
        assert(await dataOf(page, W, 'from') === '0' && await dataOf(page, W, 'to') === '11000', 'alejar no vuelve a la traza entera');
      } },
  ],
};
