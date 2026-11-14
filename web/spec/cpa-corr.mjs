// Contrato de aprendizaje de <cpa-corr>: qué es correlacionar, con las trazas
// medidas, y los pasos de «Prueba esto» de la sección 8.
import { setRange, dataOf, countOf, textOf, widgetText, step, assert } from './helpers.mjs';
import { SBOX, HW } from '../js/model/aes.js';

const W = '#corr';
const rho = async (page) => Number(await dataOf(page, W, 'rho'));

export const spec = {
  slug: 'cpa-corr',
  title: 'CPA: una casilla, un candidato y un instante',
  page: '/web/index.html',
  widget: W,
  claims: [
    { id: 'opens-on-the-leak', why: 'paso 1: con el candidato correcto en el instante de su S-box, la nube de trazas medidas sube',
      async run({ page }) {
        assert((await textOf(page, `${W} .real-badge`)).toLowerCase().includes('medida real'), 'falta la etiqueta de medida real');
        assert(await dataOf(page, W, 'k') === String(0x2b) && await dataOf(page, W, 'correct') === String(0x2b), 'no abre con el candidato correcto');
        assert(await dataOf(page, W, 't') === '462' && await dataOf(page, W, 'leak') === '462', 'no abre en la muestra 462');
        assert(await dataOf(page, W, 'n') === '400', 'no usa las 400 trazas');
        assert(await rho(page) > 0.5 && Number(await dataOf(page, W, 'slope')) > 0.5, `ρ = ${await dataOf(page, W, 'rho')}`);
        assert((await widgetText(page, W)).includes('ρ = 0,58'), 'el texto no da la correlación');
        assert(await countOf(page, `${W} path.cc-mean`) === 9, 'no están las medias de las nueve columnas');
      } },
    { id: 'table-shows-the-two-columns', why: 'la tabla enseña, traza a traza, la predicción del candidato y la lectura de la placa',
      async run({ page }) {
        const rows = await page.evalJs(`[...document.querySelectorAll('${W} .cc-table tbody tr:not(.cc-more)')].map((tr) => [...tr.children].map((td) => td.textContent.trim()))`);
        assert(rows.length === 5, `la tabla tiene ${rows.length} filas`);
        for (const r of rows) {
          const p = parseInt(r[1], 16);
          assert(Number(r[3]) === HW[SBOX[p ^ 0x2b]], `traza ${r[0]}: la predicción ${r[3]} no es HW(SBox(${r[1]} ⊕ 0x2b))`);
        }
        const before = rows.map((r) => r[4]).join();
        await setRange(page, `${W} [data-k="k"]`, 0x2c);
        const after = await page.evalJs(`[...document.querySelectorAll('${W} .cc-table tbody tr:not(.cc-more)')].map((tr) => [...tr.children].map((td) => td.textContent.trim()))`);
        assert(after.map((r) => r[4]).join() === before, 'cambiar de candidato cambia lo medido');
        assert(after.map((r) => r[3]).join() !== rows.map((r) => r[3]).join(), 'cambiar de candidato no cambia la predicción');
      } },
    { id: 'step-wrong-candidate-is-flat', why: 'paso 2: con un candidato falso la nube queda plana',
      async run({ page }) {
        await step(page, 'corr', 0);
        assert(await dataOf(page, W, 'k') !== String(0x2b), 'el paso no cambia de candidato');
        assert(Math.abs(await rho(page)) < 0.2, `ρ = ${await dataOf(page, W, 'rho')}`);
        assert((await widgetText(page, W)).includes('falso'), 'el texto no dice que el candidato es falso');
      } },
    { id: 'steps-right-candidate-wrong-instant', why: 'pasos 3 y 4: el correcto vuelve a subir, pero en otro instante la nube es plana',
      async run({ page }) {
        await step(page, 'corr', 0);
        await step(page, 'corr', 1);
        assert(await dataOf(page, W, 'k') === String(0x2b) && await rho(page) > 0.5, 'volver al correcto no recupera la nube inclinada');
        await step(page, 'corr', 2);
        assert(await dataOf(page, W, 't') !== '462', 'el paso no cambia de instante');
        assert(Math.abs(await rho(page)) < 0.2, `en otro instante ρ = ${await dataOf(page, W, 'rho')}`);
        assert((await widgetText(page, W)).includes('no está manejando'), 'el texto no explica por qué');
      } },
  ],
};
