// Contrato de aprendizaje de <cpa-live>: lo que un lector tiene que poder ver
// en la figura principal, comprobado en un navegador real. Los pasos de la
// caja «Prueba esto» se ejecutan pulsando sus propios botones.
import { setRange, dataOf, countOf, textOf, widgetText, step, assert } from './helpers.mjs';
import { N_STEPS, SNR_STEPS } from '../js/components/cpa-live.js';

const W = '#cpa-main', R = '#cpa-ruido';
const setN = (page, sel, n) => setRange(page, `${sel} [data-k="n"]`, N_STEPS.indexOf(n));
const setSnr = (page, sel, snr) => setRange(page, `${sel} [data-k="snr"]`, SNR_STEPS.indexOf(snr));
const num = async (page, sel, key) => Number(await dataOf(page, sel, key));

export const spec = {
  slug: 'cpa-live',
  title: 'CPA en directo',
  page: '/web/index.html',
  widget: W,
  ready: `!!document.querySelector('${W}[data-rendered]') && !!document.querySelector('${R}[data-rendered]')`,
  claims: [
    { id: 'renders', why: 'hay clave, correlación frente al tiempo, barras por candidato y la etiqueta de datos simulados',
      async run({ page }) {
        assert(await countOf(page, `${W} svg.cl-time path.l-ok`) === 1, 'falta la línea del correcto');
        assert(await countOf(page, `${W} svg.cl-bars .b-ok`) === 1, 'falta la barra del correcto');
        assert(await countOf(page, `${W} .cl-key button`) === 16, 'la clave no tiene 16 bytes');
        assert((await textOf(page, `${W} .sim-badge`)).toLowerCase().includes('datos simulados'), 'falta la etiqueta');
        // La clave va antes que las gráficas: es lo primero que se mira al añadir trazas.
        assert(await page.evalJs(`document.querySelector('${W} .cl-key').getBoundingClientRect().top < document.querySelector('${W} .cl-time').getBoundingClientRect().top`), 'la clave no está encima de las gráficas');
      } },
    { id: 'opening-state-recovers-key', why: 'el estado inicial (SNR = 0,1, N = 1000) ya enseña el ataque funcionando',
      async run({ page }) {
        assert(await dataOf(page, W, 'snr') === '0.1' && await dataOf(page, W, 'n') === '1000', 'estado inicial inesperado');
        assert(await dataOf(page, W, 'recovered') === '16', `recupera ${await dataOf(page, W, 'recovered')} bytes`);
        assert((await widgetText(page, W)).includes('16 de 16'), 'el texto no dice 16 de 16');
        assert((await textOf(page, `${W} .cl-count`)).includes('16'), 'la cuenta junto a la clave no dice 16');
      } },
    { id: 'snr1-4000-recovers-16', why: 'con poco ruido y muchas trazas se recuperan los 16 bytes',
      async run({ page }) {
        await setSnr(page, W, 1);
        await setN(page, W, 4000);
        assert(await dataOf(page, W, 'snr') === '1' && await dataOf(page, W, 'n') === '4000', 'no se aplicaron SNR = 1 y N = 4000');
        assert(await dataOf(page, W, 'recovered') === '16', `recupera ${await dataOf(page, W, 'recovered')} bytes`);
      } },
    { id: 'step-20-traces-fails', why: 'paso 2 de la caja: con SNR = 0,1 y 20 trazas el pico del correcto ya no destaca',
      async run({ page }) {
        await step(page, 'cpa-main', 1);
        assert(await dataOf(page, W, 'n') === '20', 'N no es 20');
        assert(await num(page, W, 'rank') !== 1, 'el byte 0 ya está en el puesto 1 con 20 trazas');
        assert(await num(page, W, 'recovered') < 4, `con 20 trazas recupera ${await dataOf(page, W, 'recovered')} bytes`);
      } },
    { id: 'more-traces-lower-false-not-raise-correct', why: 'al subir N baja el mejor falso; el correcto no sube de forma sistemática',
      async run({ page }) {
        const rows = [];
        for (const n of [100, 1000, 4000]) {
          await setN(page, W, n);
          rows.push({ n, ok: await num(page, W, 'peakCorrect'), wrong: await num(page, W, 'peakWrong') });
        }
        const [a, b, c] = rows;
        assert(a.wrong > b.wrong && b.wrong > c.wrong, `el mejor falso no baja: ${rows.map((r) => r.wrong).join(', ')}`);
        const oks = rows.map((r) => r.ok);
        assert(Math.max(...oks) - Math.min(...oks) < 0.05, `el correcto cambia demasiado: ${oks.join(', ')}`);
        assert(Math.abs(c.ok - Math.sqrt(0.1 / 1.1)) < 0.03, `con 4000 trazas el correcto (${c.ok}) no está cerca de 0,302`);
      } },
    { id: 'same-seed-same-result', why: 'la página es determinista: misma semilla, mismo resultado tras recargar',
      async run({ page }) {
        const before = await dataOf(page, W, 'digest');
        await page.send('Page.reload');
        await page.waitFor(`!!document.querySelector('${W}[data-rendered]')`);
        assert(await dataOf(page, W, 'digest') === before, 'el resultado cambia al recargar');
        await page.evalJs(`(() => { const s = document.querySelector('${W} .cl-seed'); s.value = '7'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        assert(await dataOf(page, W, 'digest') !== before, 'cambiar la semilla no cambia nada');
      } },
    { id: 'step-new-key-is-recovered-too', why: 'paso 4: la clave de laboratorio no es especial; con una clave nueva el ataque también funciona',
      async run({ page }) {
        const real = () => textOf(page, `${W} .cl-real code`);
        const lab = await real();
        await step(page, 'cpa-main', 3);
        assert(await real() !== lab, 'la clave no cambia');
        await setN(page, W, 4000);
        assert(await dataOf(page, W, 'recovered') === '16', `recupera ${await dataOf(page, W, 'recovered')} bytes con la clave nueva`);
      } },
    { id: 'step-each-byte-has-its-instant', why: 'paso 3 y pulsar un byte: cada byte se ataca por separado y su pico cae en su propio instante',
      async run({ page }) {
        await step(page, 'cpa-main', 2);
        assert(await dataOf(page, W, 'byte') === '9' && await dataOf(page, W, 'n') === '1000', 'el paso no deja N = 1000 y el byte 9');
        assert(await dataOf(page, W, 'rank') === '1', 'el byte 9 no está en el puesto 1');
        assert(await dataOf(page, W, 'peakAt') === '33', `el pico del byte 9 está en t = ${await dataOf(page, W, 'peakAt')}, no en 15 + 2·9`);
        await page.evalJs(`document.querySelector('${W} .cl-key [data-j="5"]').click()`);
        assert(await dataOf(page, W, 'byte') === '5', 'pulsar el byte no lo selecciona');
        assert(await dataOf(page, W, 'peakAt') === '25', 'el pico del byte 5 no está en t = 25');
      } },
    { id: 'step-add-traces-animates-to-4000', why: 'paso 1: «añade trazas» enseña cómo aparece la clave al crecer N',
      async run({ page }) {
        await step(page, 'cpa-main', 0);
        assert(await dataOf(page, W, 'playing') === 'true', 'no arranca');
        assert(await num(page, W, 'n') < 100, 'la animación no empieza con pocas trazas');
        await page.waitFor(`document.querySelector('${W}').dataset.playing === 'false'`, 20000);
        assert(await dataOf(page, W, 'n') === '4000', `termina en N = ${await dataOf(page, W, 'n')}`);
        assert(await dataOf(page, W, 'recovered') === '16', 'al final no está la clave');
      } },
    { id: 'noise-figure-starts-failing', why: 'la figura del ruido empieza sin clave y con 4000 trazas la recupera; el correcto se queda en 0,14',
      async run({ page }) {
        assert(await dataOf(page, R, 'snr') === '0.02' && await dataOf(page, R, 'n') === '100', 'estado inicial inesperado');
        assert(await num(page, R, 'recovered') < 4, `ya recupera ${await dataOf(page, R, 'recovered')} bytes con 100 trazas`);
        await setN(page, R, 4000);
        assert(await dataOf(page, R, 'recovered') === '16', `con 4000 trazas recupera ${await dataOf(page, R, 'recovered')}`);
        assert(Math.abs(await num(page, R, 'peakCorrect') - 0.14) < 0.03, `el pico del correcto (${await dataOf(page, R, 'peakCorrect')}) no está cerca de 0,14`);
      } },
    { id: 'noise-step-less-noise', why: 'paso 3 de la figura del ruido: con SNR = 0,5 bastan las 100 trazas del principio',
      async run({ page }) {
        await step(page, 'cpa-ruido', 1);
        assert(await dataOf(page, R, 'snr') === '0.5' && await dataOf(page, R, 'n') === '100', 'el paso no deja SNR = 0,5 y N = 100');
        assert(await dataOf(page, R, 'recovered') === '16', `recupera ${await dataOf(page, R, 'recovered')} bytes`);
      } },
  ],
};
