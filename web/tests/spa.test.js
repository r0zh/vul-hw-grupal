// La traza media del cifrado completo que enseña <cpa-spa> (data/nano-spa.json,
// generado por analisis/reales.py) y lo que la sección 6 dice de ella.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromSpaJSON, roundSpans, roundAt, envelope, roundSimilarity } from '../js/model/spa.js';

const spa = fromSpaJSON(JSON.parse(readFileSync(new URL('../data/nano-spa.json', import.meta.url), 'utf8')));
const maxIn = (values, from, to) => { let m = -Infinity; for (let i = from; i < to; i++) m = Math.max(m, values[i]); return m; };

test('es una medida de 11 000 muestras a 7,5 MHz, con lecturas de 8 bits', () => {
  assert.equal(spa.synthetic, false);
  assert.equal(spa.n, 11000);
  assert.equal(spa.hz, 7.5e6);
  assert.equal(spa.traces, 100);
  for (const v of spa.mean) assert.ok(v >= 0 && v <= 255, `lectura ${v}`);
  for (const v of spa.rho1) assert.ok(v >= 0 && v <= 1);
});

test('diez rondas seguidas: nueve de 1014 muestras (la novena, algo menos) y la última más corta', () => {
  assert.equal(spa.period, 1014);
  assert.equal(spa.rounds.length, 10);
  assert.equal(spa.rounds[0].from, 463);
  for (let r = 1; r < 10; r++) assert.equal(spa.rounds[r].from, spa.rounds[r - 1].to, `la ronda ${r + 1} no empieza donde acaba la anterior`);
  for (let r = 0; r < 8; r++) assert.equal(spa.rounds[r].to - spa.rounds[r].from, 1014);
  assert.ok(Math.abs(spa.rounds[8].to - spa.rounds[8].from - 1014) <= 5);
  assert.equal(spa.rounds[9].to, spa.end);
  assert.ok(spa.rounds[9].to - spa.rounds[9].from < 600, 'la última ronda no tiene MixColumns: debe ser más corta');
  // El cifrado completo dura unos 10 000 ciclos, 1,3 ms a 7,5 MHz.
  assert.ok(Math.abs(spa.end / spa.hz - 1.34e-3) < 0.02e-3);
});

test('el dibujo se repite: las rondas 2 a 8 son casi idénticas a la primera', () => {
  for (let r = 1; r < 8; r++) {
    const sim = roundSimilarity(spa.mean, spa.rounds[0], spa.rounds[r]);
    assert.ok(sim > 0.99, `ronda ${r + 1}: parecido ${sim}`);
  }
});

test('la fuga de la ronda 1 está al principio y la de la 10, al final', () => {
  const r = spa.rounds;
  assert.ok(maxIn(spa.rho1, r[0].from, r[0].to) > 0.6);
  assert.ok(maxIn(spa.rho1, r[2].from, r[8].to) < 0.5, 'la primera ronda no debe fugar en mitad del cifrado');
  assert.ok(maxIn(spa.rho10, r[9].from, r[9].to) > 0.6);
  assert.ok(maxIn(spa.rho10, r[0].from, r[6].to) < 0.5);
  // La ventana que usa el ataque (440 a 740) contiene todos los picos altos de la ronda 1.
  for (let s = 0; s < spa.n; s++) if (spa.rho1[s] > 0.6) assert.ok(s >= 440 && s < 740, `pico en ${s}`);
});

test('roundSpans y roundAt', () => {
  const rounds = roundSpans({ periodo: 100, ronda1: [50, 80], ronda10: [948, 990], fin: 1000 });
  assert.deepEqual(rounds[0], { round: 1, from: 50, to: 150 });
  assert.deepEqual(rounds[8], { round: 9, from: 850, to: 948 });
  assert.deepEqual(rounds[9], { round: 10, from: 948, to: 1000 });
  assert.equal(roundAt(rounds, 49), 0);
  assert.equal(roundAt(rounds, 50), 1);
  assert.equal(roundAt(rounds, 949), 10);
  assert.equal(roundAt(rounds, 1000), 0);
});

test('la envolvente guarda el mínimo y el máximo de cada columna', () => {
  const v = Float32Array.from([1, 5, 2, 8, 3, 3, 9, 0]);
  const e = envelope(v, 0, 8, 4);
  assert.deepEqual(Array.from(e.lo), [1, 2, 3, 0]);
  assert.deepEqual(Array.from(e.hi), [5, 8, 3, 9]);
  const one = envelope(v, 2, 6, 4);
  assert.deepEqual(Array.from(one.lo), [2, 8, 3, 3]);
  assert.deepEqual(Array.from(one.hi), [2, 8, 3, 3]);
});
