// El DPA de un bit por estadísticos suficientes es la resta de medias de
// libro, y la figura <cpa-dpa> enseña lo que dice el texto de la sección 7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SBOX } from '../js/model/aes.js';
import { simulate, LAB_KEY, firstCenter } from '../js/model/sim.js';
import { createAccumulator, attack } from '../js/model/cpa.js';
import { differences, groups, dpaAttack } from '../js/model/dpa.js';

// Resta de medias hecha traza a traza.
function directDifference(c, j, bit, k, t) {
  let s1 = 0, n1 = 0, s0 = 0, n0 = 0;
  for (let i = 0; i < c.n; i++) {
    const y = c.traces[i * c.nSamples + t];
    if ((SBOX[c.plaintexts[16 * i + j] ^ k] >> bit) & 1) { s1 += y; n1++; } else { s0 += y; n0++; }
  }
  return s1 / n1 - s0 / n0;
}

test('igual a la resta de medias directa (error < 1e-9)', () => {
  const c = simulate({ n: 300, snr: 0.1, seed: 7 });
  const acc = createAccumulator(c.nSamples).add(c);
  let worst = 0;
  for (const [j, bit] of [[0, 0], [5, 3], [15, 7]]) {
    const diff = differences(acc, j, bit);
    for (let k = 0; k < 256; k += 17) {
      for (let t = 0; t < c.nSamples; t += 5) worst = Math.max(worst, Math.abs(diff[k * c.nSamples + t] - directDifference(c, j, bit, k, t)));
    }
  }
  assert.ok(worst < 1e-9, `error máximo ${worst}`);
});

test('los dos grupos reparten todas las trazas y su resta es la diferencia', () => {
  const c = simulate({ n: 500, snr: 1 });
  const acc = createAccumulator(c.nSamples).add(c);
  const g = groups(acc, 3, 2, 0x5a), diff = differences(acc, 3, 2);
  assert.equal(g.n1 + g.n0, 500);
  assert.ok(g.n1 > 150 && g.n0 > 150, `grupos de ${g.n1} y ${g.n0}`);
  for (let t = 0; t < c.nSamples; t += 7) assert.ok(Math.abs(g.mean1[t] - g.mean0[t] - diff[0x5a * c.nSamples + t]) < 1e-9);
});

test('sin ruido, cualquier bit recupera la clave y el pico cae en el instante del byte', () => {
  const c = simulate({ n: 400, snr: Infinity });
  const acc = createAccumulator(c.nSamples).add(c);
  for (const bit of [0, 7]) {
    for (const r of dpaAttack(acc, bit, LAB_KEY)) {
      assert.equal(r.guess, LAB_KEY[r.byte], `bit ${bit}, byte ${r.byte}`);
      assert.ok(Math.abs(r.at[r.correct] - firstCenter(r.byte)) <= 1, `bit ${bit}, byte ${r.byte}: pico en ${r.at[r.correct]}`);
    }
  }
});

// Lo que afirman el texto y los pasos de «Prueba esto» de la sección 7, con
// la campaña de la figura (SNR = 0,1, semilla fija).
test('con 2000 trazas el DPA acierta entre 7 y 14 bytes según el bit; el CPA, los 16', () => {
  const c = simulate({ n: 2000, snr: 0.1 });
  const acc = createAccumulator(c.nSamples).add(c);
  const perBit = Array.from({ length: 8 }, (_, bit) => dpaAttack(acc, bit, LAB_KEY).filter((r) => r.rank === 1).length);
  console.log(`  bytes por bit: ${perBit.join(' ')}`);
  assert.equal(Math.min(...perBit), 7);
  assert.equal(Math.max(...perBit), 14);
  assert.equal(attack(acc, LAB_KEY).filter((r) => r.rank === 1).length, 16);
  // Byte 0: con el bit 0 gana el correcto; con el bit 7, uno falso.
  assert.equal(dpaAttack(acc, 0, LAB_KEY)[0].rank, 1);
  assert.notEqual(dpaAttack(acc, 7, LAB_KEY)[0].rank, 1);
});

test('con 500 trazas el DPA casi no acierta nada y el CPA ya tiene la clave', () => {
  const c = simulate({ n: 500, snr: 0.1 });
  const acc = createAccumulator(c.nSamples).add(c);
  assert.ok(dpaAttack(acc, 0, LAB_KEY).filter((r) => r.rank === 1).length <= 2);
  assert.equal(attack(acc, LAB_KEY).filter((r) => r.rank === 1).length, 16);
});
