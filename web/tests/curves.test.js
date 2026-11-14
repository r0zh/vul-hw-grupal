// Las curvas de éxito medidas (data/nano-curvas.json, generado por
// analisis/reales.py) y los números de las medidas que la página escribe en
// su texto. Unas y otros se cotejan con las macros que cita la memoria
// (memoria/capitulos/generado/reales.tex), que salen del mismo análisis: si la
// web y la memoria dejan de decir lo mismo, esto falla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { firstAtLeast } from '../js/components/cpa-curves.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const curves = JSON.parse(read('../data/nano-curvas.json'));
const html = read('../index.html').replace(/\s+/g, ' ');
// \newcommand{\realTracesNinety}{\num{112}} → { realTracesNinety: '112' }
const macros = Object.fromEntries([...read('../../memoria/capitulos/generado/reales.tex')
  .matchAll(/\\newcommand\{\\(\w+)\}\{\\num\{([^}]*)\}\}/g)].map((m) => [m[1], m[2]]));

test('las curvas son medidas, con una fracción por punto de control', () => {
  assert.equal(curves.synthetic, false);
  assert.equal(String(curves.ordenaciones), macros.realOrderings);
  assert.deepEqual(Object.keys(curves.series), ['tinyaes', 'cm-base', 'cm-barajado', 'cm-retardos']);
  for (const [name, s] of Object.entries(curves.series)) {
    assert.equal(s.pasos.length, s.exito.length, name);
    assert.equal(s.pasos.length, s.bytes.length, name);
    for (let i = 1; i < s.pasos.length; i++) assert.ok(s.pasos[i] > s.pasos[i - 1], `${name}: pasos sin ordenar`);
    for (const v of [...s.exito, ...s.bytes]) assert.ok(v >= 0 && v <= 1, `${name}: fracción ${v}`);
    // n50, n90 y n100 son el primer punto de control que alcanza esa fracción.
    assert.equal(firstAtLeast(s, 0.5), s.n50, name);
    assert.equal(firstAtLeast(s, 0.9), s.n90, name);
    assert.equal(firstAtLeast(s, 1), s.n100, name);
  }
});

test('las curvas dan los números de la memoria', () => {
  const { tinyaes, 'cm-base': base, 'cm-barajado': shuffled, 'cm-retardos': delays } = curves.series;
  assert.equal(String(tinyaes.n50), macros.realTracesHalf);
  assert.equal(String(tinyaes.n90), macros.realTracesNinety);
  assert.equal(String(tinyaes.n100), macros.realTracesAll);
  assert.equal(String(base.n90), macros.realBaseTracesNinety);
  assert.equal(String(shuffled.n90), macros.realShuffleTracesNinety);
  assert.equal(delays.n50, null);
  assert.equal(String(delays.bytes_correctos), macros.realDelayBytes);
  assert.equal(String(base.trazas), macros.realBaseTraces);
  assert.equal(String(shuffled.trazas), macros.realShuffleTraces);
  assert.equal((shuffled.n90 / base.n90).toFixed(1).replace('.', ','), macros.realShuffleFactor);
});

test('los números de las medidas que escribe la página son los de la memoria', () => {
  const m = macros;
  const must = [
    `con <b>${m.realTracesNinety} trazas</b> lo consigue 9 de cada 10 veces`,
    `entre ${m.realRhoCorrectMin} y ${m.realRhoCorrectMax}`,
    `entre ${m.realRhoWrongMin} y ${m.realRhoWrongMax}`,
    `${m.realTracesNinety} significa «entre ${m.realTracesNinetyLower} y ${m.realTracesNinety}»`,
    `Nuestras ${m.realTracesNinety} trazas caen dentro`,
    `sigue por encima de ${m.realLeakTailThreshold} hasta la muestra ${m.realLeakTailSample}`,
    `el 90 % se alcanza con ${m.realBaseTracesNinety} trazas en lugar de ${m.realTracesNinety}`,
    `multiplica por ${m.realShuffleFactor} las trazas necesarias`,
    `multiplicó por ${m.realShuffleFactor} las trazas necesarias`,
    `Al barajado le bastaron ${m.realShuffleFactor} veces`,
    `Sumando ventanas de ${m.realWindowWide} muestras`,
    `se recuperan ${m.realWindowWideBytes} de los 16`,
    `salieron ${m.realWindowWideBytes} de los 16 bytes`,
    `volvieron a salir ${m.realWindowWideBytes} de los 16 bytes`,
    `<td>Sin contramedida</td><td>${m.realBaseTraces}</td><td>${m.realBaseBytes}/16</td><td>${m.realBaseTracesNinety}</td>`,
    `barajado</td><td>${m.realShuffleTraces}</td><td>${m.realShuffleBytes}/16</td><td>${m.realShuffleTracesNinety}</td>`,
    `<td>Retardos aleatorios</td><td>${m.realDelayTraces}</td><td>${m.realDelayBytes}/16</td><td>no recupera</td>`,
    `Con ${m.realFixedTextTraces} cifrados del mismo texto claro`,
    `Repetimos el ataque sobre ${m.realOrderings} ordenaciones aleatorias de esas ${m.realAttackTraces} trazas`,
  ];
  // 20000 en la memoria es «20 000» en la página.
  assert.ok(html.includes('ni con 20 000 trazas') && m.realDelayFullTraces === '20000');
  for (const text of must) assert.ok(html.includes(text), `la página no dice «${text}»`);
});
