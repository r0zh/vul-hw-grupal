// Contrato de aprendizaje de la figura de contramedidas (<cpa-live cm>): los
// pasos de «Prueba esto» de la sección 11, pulsando sus propios botones.
import { dataOf, step, assert } from './helpers.mjs';

const W = '#cpa-cm';
const recovered = async (page) => Number(await dataOf(page, W, 'recovered'));

export const spec = {
  slug: 'cpa-cm',
  title: 'Contramedidas en directo',
  page: '/web/index.html',
  widget: W,
  claims: [
    { id: 'starts-unprotected', why: 'paso 1: sin contramedida, con SNR = 1 y 500 trazas, se recupera la clave completa',
      async run({ page }) {
        assert(await dataOf(page, W, 'cm') === 'none', 'no empieza sin contramedida');
        assert(await dataOf(page, W, 'n') === '500' && await dataOf(page, W, 'snr') === '1', 'estado inicial inesperado');
        assert(await recovered(page) === 16, `recupera ${await recovered(page)} bytes`);
      } },
    { id: 'shuffle-hides-then-more-traces-recover', why: 'pasos 2 y 3: el barajado tumba el ataque con 500 trazas, y con 10 000 la clave vuelve',
      async run({ page }) {
        await step(page, 'cpa-cm', 0);
        assert(await dataOf(page, W, 'cm') === 'shuffle', 'no cambia a barajado');
        assert(await recovered(page) === 0, `con barajado y 500 trazas aún recupera ${await recovered(page)} bytes`);
        // La franja pasa a cubrir las 16 posiciones posibles de la S-box.
        const band = await page.evalJs(`document.querySelector('${W} .cl-time rect.win').getBoundingClientRect().width`);
        assert(band > 150, `la franja no se ensancha (${band} px)`);
        await step(page, 'cpa-cm', 1);
        assert(await dataOf(page, W, 'n') === '10000', `N = ${await dataOf(page, W, 'n')}`);
        assert(await recovered(page) === 16, `con 10 000 trazas recupera ${await recovered(page)} bytes`);
      } },
    { id: 'delays-hurt-late-bytes-more', why: 'pasos 4 y 5: con retardos acumulados el byte 0 sigue saliendo y el 15, no',
      async run({ page }) {
        await step(page, 'cpa-cm', 2);
        assert(await dataOf(page, W, 'cm') === 'delay' && await dataOf(page, W, 'byte') === '0', 'el paso no deja retardos y el byte 0');
        assert(await dataOf(page, W, 'rank') === '1', `el byte 0 queda en el puesto ${await dataOf(page, W, 'rank')}`);
        const p0 = Number(await dataOf(page, W, 'peakCorrect'));
        await step(page, 'cpa-cm', 3);
        assert(await dataOf(page, W, 'byte') === '15', 'el paso no selecciona el byte 15');
        assert(await dataOf(page, W, 'rank') !== '1', 'el byte 15 ya gana con 500 trazas');
        const p15 = Number(await dataOf(page, W, 'peakCorrect'));
        assert(p0 > 2 * p15, `el pico del byte 0 (${p0}) no es claramente mayor que el del 15 (${p15})`);
      } },
  ],
};
