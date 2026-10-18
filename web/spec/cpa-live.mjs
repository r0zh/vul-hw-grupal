// Contrato de aprendizaje de <cpa-live>: lo que un lector tiene que poder ver
// en la figura principal, comprobado en un navegador real.
import { setRange, setSelect, clickPreset, dataOf, countOf, textOf, widgetText, assert } from './helpers.mjs';

const W = '#cpa-main', R = '#cpa-ruido';
const N_INDEX = { 20: 2, 100: 6, 1000: 12, 4000: 16 };     // posición en N_STEPS
const setN = (page, sel, n) => setRange(page, `${sel} [data-k="n"]`, N_INDEX[n]);
const num = async (page, sel, key) => Number(await dataOf(page, sel, key));

export const spec = {
  slug: 'cpa-live',
  title: 'CPA en directo',
  page: '/web/index.html',
  widget: W,
  ready: `!!document.querySelector('${W}[data-rendered]') && !!document.querySelector('${R}[data-rendered]')`,
  claims: [
    { id: 'renders', why: 'hay correlación frente al tiempo, barras por candidato, la clave y la etiqueta de datos simulados',
      async run({ page }) {
        assert(await countOf(page, `${W} svg.cl-time path.l-ok`) === 1, 'falta la línea del correcto');
        assert(await countOf(page, `${W} svg.cl-bars .b-ok`) === 1, 'falta la barra del correcto');
        assert(await countOf(page, `${W} .cl-key button`) === 16, 'la clave no tiene 16 bytes');
        assert((await textOf(page, `${W} .sim-badge`)).toLowerCase().includes('datos simulados'), 'falta la etiqueta');
      } },
    { id: 'opening-state-recovers-key', why: 'el estado inicial (SNR = 0,1, N = 1000) ya enseña el ataque funcionando',
      async run({ page }) {
        assert(await dataOf(page, W, 'snr') === '0.1' && await dataOf(page, W, 'n') === '1000', 'estado inicial inesperado');
        assert(await dataOf(page, W, 'recovered') === '16', `recupera ${await dataOf(page, W, 'recovered')} bytes`);
        assert((await widgetText(page, W)).includes('16 de 16'), 'el texto no dice 16 de 16');
      } },
    { id: 'snr1-4000-recovers-16', why: 'con poco ruido y muchas trazas se recuperan los 16 bytes',
      async run({ page }) {
        await clickPreset(page, 's1', W);
        await setN(page, W, 4000);
        assert(await dataOf(page, W, 'snr') === '1' && await dataOf(page, W, 'n') === '4000', 'no se aplicaron SNR = 1 y N = 4000');
        assert(await dataOf(page, W, 'activePreset') === 's1', 'el preset no queda marcado');
        assert(await dataOf(page, W, 'recovered') === '16', `recupera ${await dataOf(page, W, 'recovered')} bytes`);
      } },
    { id: 'snr01-20-traces-fails', why: 'con SNR = 0,1 y 20 trazas el byte 0 no gana: hacen falta más trazas',
      async run({ page }) {
        await clickPreset(page, 's01', W);
        await setN(page, W, 20);
        assert(await dataOf(page, W, 'n') === '20', 'N no es 20');
        assert(await num(page, W, 'rank') !== 1, 'el byte 0 ya está en el puesto 1 con 20 trazas');
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
    { id: 'new-key-is-recovered-too', why: 'la clave de laboratorio no es especial: con una clave nueva el ataque también funciona',
      async run({ page }) {
        const real = () => textOf(page, `${W} .cl-real code`);
        const lab = await real();
        await page.evalJs(`document.querySelector('${W} .cl-newkey').click()`);
        assert(await real() !== lab, 'la clave no cambia');
        await setN(page, W, 4000);
        assert(await dataOf(page, W, 'recovered') === '16', `recupera ${await dataOf(page, W, 'recovered')} bytes con la clave nueva`);
      } },
    { id: 'byte-select-and-click', why: 'cada byte se ataca por separado: elegirlo en el menú o pulsarlo en la clave cambia la figura',
      async run({ page }) {
        await setSelect(page, `${W} [data-k="byte"]`, 9);
        assert(await dataOf(page, W, 'byte') === '9', 'el menú no cambia el byte');
        await page.evalJs(`document.querySelector('${W} .cl-key [data-j="5"]').click()`);
        assert(await dataOf(page, W, 'byte') === '5', 'pulsar el byte no lo selecciona');
        assert(await dataOf(page, W, 'rank') === '1', 'el byte 5 no está en el puesto 1');
      } },
    { id: 'add-traces-animates-to-4000', why: 'el botón «añadir trazas» enseña cómo aparece la clave al crecer N',
      async run({ page }) {
        await page.evalJs(`document.querySelector('${W} .cl-play').click()`);
        assert(await dataOf(page, W, 'playing') === 'true', 'no arranca');
        await page.waitFor(`document.querySelector('${W}').dataset.playing === 'false'`, 15000);
        assert(await dataOf(page, W, 'n') === '4000', `termina en N = ${await dataOf(page, W, 'n')}`);
        assert(await dataOf(page, W, 'recovered') === '16', 'al final no está la clave');
      } },
    { id: 'noise-figure-starts-failing', why: 'la figura del ruido empieza sin clave y con 4000 trazas la recupera',
      async run({ page }) {
        assert(await dataOf(page, R, 'snr') === '0.02' && await dataOf(page, R, 'n') === '100', 'estado inicial inesperado');
        assert(await num(page, R, 'recovered') < 4, `ya recupera ${await dataOf(page, R, 'recovered')} bytes con 100 trazas`);
        await setN(page, R, 4000);
        assert(await dataOf(page, R, 'recovered') === '16', `con 4000 trazas recupera ${await dataOf(page, R, 'recovered')}`);
      } },
  ],
};
