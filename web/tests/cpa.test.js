// El CPA por estadísticos suficientes es la correlación directa, no una
// aproximación, y sin ruido recupera la clave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SBOX, HW } from '../js/model/aes.js';
import { simulate, LAB_KEY, firstCenter } from '../js/model/sim.js';
import { createAccumulator, correlate, attack, fromCampaignJSON } from '../js/model/cpa.js';

// Pearson de libro sobre las trazas guardadas.
function directRho(c, j, k, t) {
  const S = c.nSamples;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < c.n; i++) {
    const x = HW[SBOX[c.plaintexts[16 * i + j] ^ k]], y = c.traces[i * S + t];
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  const n = c.n;
  return (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
}

test('igual a la correlación directa (error < 1e-9)', () => {
  const c = simulate({ n: 300, snr: 0.1, seed: 7 });
  const acc = createAccumulator(c.nSamples).add(c);
  let worst = 0;
  for (const j of [0, 5, 15]) {
    const rho = correlate(acc, j);
    for (let k = 0; k < 256; k += 17) {
      for (let t = 0; t < c.nSamples; t += 5) worst = Math.max(worst, Math.abs(rho[k * c.nSamples + t] - directRho(c, j, k, t)));
    }
  }
  assert.ok(worst < 1e-9, `error máximo ${worst}`);
});

test('acumular por tramos da lo mismo que de una vez', () => {
  const c = simulate({ n: 200, snr: 0.5 });
  const a = createAccumulator(c.nSamples).add(c);
  const b = createAccumulator(c.nSamples).add(c, 0, 50).add(c, 50, 200);
  assert.equal(b.n, 200);
  assert.deepEqual(correlate(a, 3), correlate(b, 3));
});

test('sin ruido se recupera la clave y el pico es 1 en el instante del byte', () => {
  const c = simulate({ n: 400, snr: Infinity });
  const res = attack(createAccumulator(c.nSamples).add(c), LAB_KEY);
  for (const r of res) {
    assert.equal(r.guess, LAB_KEY[r.byte], `byte ${r.byte}`);
    // En el centro de su ventana solo fuga ese byte, con peso 1: ρ = 1. (En el
    // byte 0 también vale 1 una muestra antes, donde no se solapa con nadie.)
    assert.ok(Math.abs(r.rho[r.correct * 96 + firstCenter(r.byte)] - 1) < 1e-9, `byte ${r.byte}`);
    assert.ok(Math.abs(r.at[r.correct] - firstCenter(r.byte)) <= 1, `byte ${r.byte}: pico en ${r.at[r.correct]}`);
  }
});

test('una campaña real en JSON entra por la misma interfaz', () => {
  const c = simulate({ n: 150, snr: 1, seed: 3 });
  const json = {
    traces: Array.from({ length: c.n }, (_, i) => Array.from(c.traces.subarray(i * 96, i * 96 + 96))),
    plaintexts: Array.from({ length: c.n }, (_, i) => Array.from(c.plaintexts.subarray(16 * i, 16 * i + 16))),
    key: '2b7e151628aed2a6abf7158809cf4f3c',
  };
  const real = fromCampaignJSON(json);
  assert.deepEqual(real.key, LAB_KEY);
  const a = correlate(createAccumulator(96).add(c), 0), b = correlate(createAccumulator(96).add(real), 0);
  assert.deepEqual(a, b);
});
