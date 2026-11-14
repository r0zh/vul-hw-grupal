// Contrato de aprendizaje de <cpa-dpa>: el DPA de un bit por dentro y los
// pasos de «Prueba esto» de la sección 7.
import { setRange, dataOf, countOf, textOf, widgetText, step, assert } from './helpers.mjs';

const W = '#fig-dpa';
const num = async (page, key) => Number(await dataOf(page, W, key));

export const spec = {
  slug: 'cpa-dpa',
  title: 'DPA: restar las medias de dos grupos',
  page: '/web/index.html',
  widget: W,
  claims: [
    { id: 'starts-with-a-wrong-candidate', why: 'la figura abre con un candidato falso: la diferencia no destaca, y ya se ve que el CPA acierta más bytes',
      async run({ page }) {
        assert((await textOf(page, `${W} .sim-badge`)).toLowerCase().includes('datos simulados'), 'falta la etiqueta');
        assert(await dataOf(page, W, 'k') === '0' && await dataOf(page, W, 'bit') === '0' && await dataOf(page, W, 'n') === '2000', 'estado inicial inesperado');
        assert(await dataOf(page, W, 'correct') === String(0x2b), 'el byte 0 de la clave no es 0x2b');
        assert((await widgetText(page, W)).includes('No destaca'), 'el texto no dice que el candidato no destaca');
        assert(await countOf(page, `${W} .dp-means path`) === 2, 'faltan las medias de los dos grupos');
        assert(await num(page, 'cpa') === 16, `el CPA recupera ${await dataOf(page, W, 'cpa')} bytes`);
        assert(await num(page, 'dpa') < 16 && await num(page, 'dpa') >= 7, `el DPA recupera ${await dataOf(page, W, 'dpa')} bytes`);
        assert(await countOf(page, `${W} .dp-row`) === 2 && await countOf(page, `${W} .dp-cells i`) === 32, 'faltan las dos filas de 16 bytes');
      } },
    { id: 'step-best-peak-is-the-key-byte', why: 'paso 2: el candidato de mayor pico es el byte de la clave, y su diferencia ronda 1 (un bit)',
      async run({ page }) {
        await step(page, 'fig-dpa', 0);
        assert(await dataOf(page, W, 'k') === String(0x2b), `elige ${await dataOf(page, W, 'k')}`);
        assert(await dataOf(page, W, 'rank') === '1', 'el correcto no está en el puesto 1');
        assert(Math.abs(await num(page, 'peak') - 1) < 0.25, `la diferencia es ${await dataOf(page, W, 'peak')}`);
        assert((await widgetText(page, W)).includes('acierta el byte 0'), 'el texto no dice que acierta');
      } },
    { id: 'step-bit-7-picks-a-wrong-candidate', why: 'paso 3: con el bit 7, el mayor pico del byte 0 es de un candidato falso',
      async run({ page }) {
        await step(page, 'fig-dpa', 1);
        assert(await dataOf(page, W, 'bit') === '7', 'el paso no cambia al bit 7');
        assert(await dataOf(page, W, 'k') === await dataOf(page, W, 'guess'), 'no queda elegido el de mayor pico');
        assert(await dataOf(page, W, 'k') !== String(0x2b) && await dataOf(page, W, 'rank') !== '1', 'con el bit 7 también gana el correcto');
        assert((await widgetText(page, W)).includes('pero es falso'), 'el texto no dice que el elegido es falso');
      } },
    { id: 'step-fewer-traces-dpa-fails-cpa-holds', why: 'paso 4: con 500 trazas el DPA casi no acierta ningún byte y el CPA los acierta todos',
      async run({ page }) {
        await step(page, 'fig-dpa', 2);
        assert(await dataOf(page, W, 'n') === '500' && await dataOf(page, W, 'bit') === '0', 'el paso no deja 500 trazas y el bit 0');
        assert(await num(page, 'dpa') <= 2, `el DPA recupera ${await dataOf(page, W, 'dpa')} bytes`);
        assert(await num(page, 'cpa') === 16, `el CPA recupera ${await dataOf(page, W, 'cpa')} bytes`);
      } },
    { id: 'slider-walks-the-candidates', why: 'paso 1: al arrastrar el candidato cambia el reparto en grupos; solo el correcto llega a una diferencia de 1',
      async run({ page }) {
        const peaks = [];
        for (const k of [0x10, 0x2a, 0x2b, 0x2c, 0xd4]) {
          await setRange(page, `${W} [data-k="k"]`, k);
          assert(await dataOf(page, W, 'k') === String(k), 'el deslizador no cambia el candidato');
          peaks.push(await num(page, 'peak'));
        }
        assert(peaks[2] === Math.max(...peaks) && peaks[2] > 0.8, `picos: ${peaks.join(', ')}`);
      } },
  ],
};
