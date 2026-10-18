// Contrato de aprendizaje de <cpa-leak>.
import { setRange, dataOf, widgetText, assert } from './helpers.mjs';

const W = '#leak';
const SBOX_ROW = [0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76];
const popcount = (v) => v.toString(2).split('').filter((b) => b === '1').length;

export const spec = {
  slug: 'cpa-leak',
  title: 'De dónde sale la fuga',
  page: '/web/index.html',
  widget: W,
  claims: [
    { id: 'fips-example', why: 'el estado inicial es el primer byte del ejemplo del FIPS-197: SBox(0x32 ⊕ 0x2b) = 0xd4, HW = 4',
      async run({ page }) {
        assert(await dataOf(page, W, 'sbox') === String(0xd4), 'la S-box no da 0xd4');
        assert(await dataOf(page, W, 'hw') === '4', 'el HW no es 4');
        assert((await widgetText(page, W)).includes('0xd4'), 'el texto no enseña 0xd4');
      } },
    { id: 'hw-follows-k', why: 'con p fijo, al cambiar k el HW mostrado es popcount(SBOX[p ⊕ k])',
      async run({ page }) {
        await setRange(page, `${W} [data-k="p"]`, 0);
        for (const k of [0, 3, 7, 11, 15]) {
          await setRange(page, `${W} [data-k="k"]`, k);
          const want = popcount(SBOX_ROW[k]);
          assert(await dataOf(page, W, 'hw') === String(want), `k = ${k}: HW ${await dataOf(page, W, 'hw')} en vez de ${want}`);
        }
      } },
    { id: 'means-ordered-at-sbox', why: 'en el instante de la S-box las nueve medias quedan ordenadas de HW 0 a HW 8',
      async run({ page }) {
        const order = (await dataOf(page, W, 'order')).split(',').map(Number);
        assert(order.length === 9, 'no hay 9 clases');
        for (let w = 1; w < 9; w++) assert(order[w] > order[w - 1], `la media de HW ${w} no supera a la de HW ${w - 1}: ${order.join(', ')}`);
      } },
  ],
};
