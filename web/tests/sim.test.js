// Contraste estadístico con la simulación de Python (analisis/). Las
// secuencias aleatorias son distintas, así que se comparan magnitudes: si
// algo de aquí falla, el modelo JS no es el de Python.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, randomKey, rhoCeiling, noiseSigma, LAB_KEY, CONFIG } from '../js/model/sim.js';
import { createAccumulator, attack } from '../js/model/cpa.js';

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2; };

test('misma semilla, mismas trazas; y las n primeras no dependen de n', () => {
  const a = simulate({ n: 50, snr: 0.1 }), b = simulate({ n: 50, snr: 0.1 }), c = simulate({ n: 80, snr: 0.1 });
  assert.deepEqual(a.traces, b.traces);
  assert.deepEqual(a.traces, c.traces.subarray(0, 50 * 96));
  assert.notDeepEqual(a.traces, simulate({ n: 50, snr: 0.1, seed: 1 }).traces);
});

test('la varianza del ruido es σ² en todas las muestras', () => {
  // Fuera de las ventanas de fuga la traza es solo ruido.
  const snr = 0.1, c = simulate({ n: 20000, snr });
  for (const t of [0, 5, 50, 95]) {
    const ys = Array.from({ length: c.n }, (_, i) => c.traces[i * 96 + t]);
    const m = mean(ys), v = mean(ys.map((y) => (y - m) ** 2));
    assert.ok(Math.abs(v / noiseSigma(snr) ** 2 - 1) < 0.04, `t=${t}: var/σ² = ${v / noiseSigma(snr) ** 2}`);
  }
});

for (const snr of [2, 0.1]) {
  test(`pico medio del correcto ≈ √(SNR/(1+SNR)) con SNR = ${snr}`, () => {
    const c = simulate({ n: 20000, snr });
    const res = attack(createAccumulator(96).add(c), LAB_KEY);
    const got = mean(res.map((r) => r.correctPeak));
    assert.ok(Math.abs(got - rhoCeiling(snr)) < 0.01, `medido ${got}, teórico ${rhoCeiling(snr)}`);
  });
}

test('trazas necesarias con SNR = 0,1, del orden de la tabla 4.1 de la memoria', () => {
  // Los mismos puntos de control que analisis/config.py::trace_checkpoints con
  // 3000 trazas. La memoria (60 ensayos) da 413 de mediana y 578 para el 90 %.
  const checkpoints = [20, 28, 39, 55, 77, 108, 151, 211, 295, 413, 578, 809, 1133, 1586, 2220, 3000];
  const trials = 20, first = [];
  for (let trial = 0; trial < trials; trial++) {
    const key = randomKey(CONFIG.seed, trial);
    const c = simulate({ n: 3000, snr: 0.1, key, seed: CONFIG.seed + 1 + trial });
    const acc = createAccumulator(96);
    let found = Infinity;
    for (const n of checkpoints) {
      acc.add(c, acc.n, n);
      if (attack(acc, key).every((r) => r.rank === 1)) { found = n; break; }
    }
    first.push(found);
  }
  const med = median(first);
  const at90 = checkpoints.find((n) => first.filter((f) => f <= n).length >= 0.9 * trials) ?? Infinity;
  console.log(`  mediana ${med} (memoria 413), 90 % en ${at90} (memoria 578)`);
  assert.ok(med >= 413 / 1.5 && med <= 413 * 1.5, `mediana ${med}`);
  assert.ok(at90 >= 578 / 1.5 && at90 <= 578 * 1.5, `90 % en ${at90}`);
});

// Contramedidas de la figura de la sección 11. Con la semilla fija, los
// números son deterministas; los umbrales dejan margen.
const recoveredAt = (c, n) => {
  const acc = createAccumulator(c.nSamples);
  acc.add(c, 0, n);
  return attack(acc, c.key);
};

test("cm = 'none' da exactamente las trazas de siempre", () => {
  assert.deepEqual(simulate({ n: 50, snr: 1, cm: 'none' }).traces, simulate({ n: 50, snr: 1 }).traces);
  assert.throws(() => simulate({ n: 5, snr: 1, cm: 'masking' }));
});

test('el barajado tumba el CPA con 500 trazas y con 10 000 la clave vuelve', () => {
  const c = simulate({ n: 10000, snr: 1, cm: 'shuffle' });
  assert.ok(recoveredAt(c, 500).filter((x) => x.rank === 1).length < 4);
  assert.equal(recoveredAt(c, 10000).filter((x) => x.rank === 1).length, 16);
});

test('los retardos acumulados castigan más a los últimos bytes', () => {
  const r = recoveredAt(simulate({ n: 500, snr: 1, cm: 'delay' }), 500);
  assert.equal(r[0].rank, 1);
  assert.notEqual(r[15].rank, 1);
  assert.ok(r[0].correctPeak > 2 * r[15].correctPeak, `${r[0].correctPeak} frente a ${r[15].correctPeak}`);
});

test('en la figura, la clave completa sale con 50 trazas; con barajado, entre 4000 y 6000; con retardos, con 1500', () => {
  // Los pasos del deslizador de la figura (SNR = 1, clave de laboratorio).
  const full = (c, n) => recoveredAt(c, n).every((x) => x.rank === 1);
  const plain = simulate({ n: 50, snr: 1 });
  assert.ok(!full(plain, 30) && full(plain, 50));
  const shuffled = simulate({ n: 6000, snr: 1, cm: 'shuffle' });
  assert.ok(!full(shuffled, 4000) && full(shuffled, 6000));
  const delayed = simulate({ n: 1500, snr: 1, cm: 'delay' });
  assert.ok(!full(delayed, 1000) && full(delayed, 1500));
});
