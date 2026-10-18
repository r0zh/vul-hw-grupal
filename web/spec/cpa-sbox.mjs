// Contrato de aprendizaje de <cpa-sbox>.
import { setRange, dataOf, widgetText, assert } from './helpers.mjs';

const W = '#sbox';
const target = (page, t) => page.evalJs(`document.querySelector('${W} [data-target="${t}"]').click()`);

export const spec = {
  slug: 'cpa-sbox',
  title: 'AddRoundKey, SubBytes y por qué se ataca la S-box',
  page: '/web/index.html',
  widget: W,
  claims: [
    { id: 'fips-example', why: 'el estado inicial es el ejemplo del FIPS-197: 0x32 ⊕ 0x2b = 0x19, fila 1 y columna 9 de la S-box, 0xd4',
      async run({ page }) {
        assert(await dataOf(page, W, 'xor') === String(0x19), 'el XOR no da 0x19');
        assert(await dataOf(page, W, 'sbox') === String(0xd4), 'la S-box no da 0xd4');
        const text = await page.evalJs(`document.querySelector('${W} .sx-lookup').innerText`);
        assert(text.includes('fila 1, columna 9') && text.includes('0xd4'), `la consulta no se explica: ${text}`);
        assert(await page.evalJs(`document.querySelector('${W} .sx-on + text').textContent`) === 'd4', 'la celda resaltada no es d4');
      } },
    { id: 'cell-click-sets-xor', why: 'pulsar una celda de la tabla elige ese p ⊕ k con la misma clave',
      async run({ page }) {
        await page.evalJs(`document.querySelector('${W} [data-u="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
        assert(await dataOf(page, W, 'xor') === '0', 'el XOR no pasa a 0x00');
        assert(await dataOf(page, W, 'k') === String(0x2b), 'la clave ha cambiado');
        assert(await dataOf(page, W, 'sbox') === String(0x63), 'SBox(0x00) no es 0x63');
      } },
    { id: 'xor-target-complement-ties', why: 'atacando p ⊕ k, el complementario empata con el correcto y 16 candidatos más rozan 0,75',
      async run({ page }) {
        await target(page, 'xor');
        assert(await dataOf(page, W, 'target') === 'xor', 'no se eligió p ⊕ k');
        assert(Number(await dataOf(page, W, 'complement')) === 1, 'el complementario no empata');
        assert(await dataOf(page, W, 'near') === '16', `hay ${await dataOf(page, W, 'near')} candidatos cercanos`);
        assert((await widgetText(page, W)).includes('empata'), 'el texto no lo dice');
      } },
    { id: 'sbox-target-separates', why: 'atacando la salida de la S-box, ningún falso pasa de 0,25, con cualquier clave',
      async run({ page }) {
        await target(page, 'sbox');
        for (const k of [0x2b, 0, 200]) {
          await setRange(page, `${W} [data-k="k"]`, k);
          const bw = Number(await dataOf(page, W, 'bestWrong'));
          assert(bw < 0.25, `k = ${k}: el mejor falso llega a ${bw}`);
        }
      } },
  ],
};
