// El modelo de <cpa-sbox>: el parecido entre la predicción de cada candidato y
// la del correcto, atacando p ⊕ k o SBox(p ⊕ k).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS } from '../js/components/cpa-sbox.js';
import { HW } from '../js/model/aes.js';

test('atacando p ⊕ k, ρ = 1 − HW(d)/4 y el complementario empata con el correcto', () => {
  const g = TARGETS.xor.ghost;
  for (let d = 0; d < 256; d++) assert.ok(Math.abs(g[d] - (1 - HW[d] / 4)) < 1e-12, `d = ${d}`);
  assert.equal(g[0xff], -1);
});

test('atacando la S-box, ningún candidato falso pasa de |ρ| = 0,25', () => {
  const g = TARGETS.sbox.ghost;
  assert.ok(Math.abs(g[0] - 1) < 1e-12);
  const worst = Math.max(...Array.from(g).slice(1).map(Math.abs));
  assert.ok(worst < 0.25, `peor falso ${worst}`);
});
