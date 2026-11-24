// Las cifras medidas que escribe la presentación son las de la memoria y las de
// los datos de la web, como hace web/tests/curves.test.js con la página:
//   data-cifra="macro"          → \newcommand{\macro}{\num{…}} de memoria/capitulos/generado/reales.tex
//   data-dato="fichero:ruta"    → web/data/<fichero> (número igual, o texto que lo contiene)
//   data-memoria="capitulo.tex" → el número aparece en memoria/capitulos/<capitulo>
// Se compara en formato español (coma decimal) y sin espacios de miles.
//   node --test presentacion/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SBOX, HW } from '../../web/js/model/aes.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html').replace(/<!--[\s\S]*?-->/g, '');
const macros = Object.fromEntries([...read('../../memoria/capitulos/generado/reales.tex')
  .matchAll(/\\newcommand\{\\(\w+)\}\{\\num\{([^}]*)\}\}/g)].map((m) => [m[1], m[2]]));
const json = {};
const data = (file) => (json[file] ??= JSON.parse(read(`../../web/data/${file}`)));
const chapter = (file) => read(`../../memoria/capitulos/${file}`);
// «20 000», «20&#8239;000» y «20000» son el mismo número.
const plain = (text) => text.replace(/&#8239;|&nbsp;|[\s   ]/g, '');
const decode = (text) => text.replace(/&#8239;/g, ' ').replace(/&nbsp;/g, ' ');

// Cada elemento anotado tiene que contener solo texto, sin etiquetas dentro.
function annotated(attr) {
  const found = [...html.matchAll(new RegExp(`<(\\w+)[^>]*\\s${attr}="([^"]+)"[^>]*>([^<]*)</\\1>`, 'g'))]
    .map((m) => ({ source: m[2], text: decode(m[3]).trim() }));
  assert.equal(found.length, (html.match(new RegExp(`\\s${attr}="`, 'g')) ?? []).length,
    `algún ${attr} envuelve etiquetas en lugar de solo el número`);
  return found;
}

test('cada data-cifra es la macro de reales.tex', () => {
  const list = annotated('data-cifra');
  assert.ok(list.length >= 30, `solo hay ${list.length} cifras anotadas`);
  for (const { source, text } of list) {
    assert.ok(source in macros, `no existe la macro \\${source}`);
    assert.equal(plain(text), plain(macros[source]), `\\${source}: la presentación dice «${text}» y la memoria «${macros[source]}»`);
  }
});

test('cada data-dato sale de web/data', () => {
  for (const { source, text } of annotated('data-dato')) {
    const [file, path] = source.split(':');
    const value = path.split('.').reduce((o, k) => o?.[k], data(file));
    assert.notEqual(value, undefined, `${source} no existe`);
    if (typeof value === 'number') assert.equal(Number(plain(text).replace(',', '.')), value, `${source} vale ${value} y la presentación dice «${text}»`);
    else assert.ok(String(value).includes(text), `${source} («${value}») no contiene «${text}»`);
  }
});

test('cada data-memoria aparece en su capítulo', () => {
  for (const { source, text } of annotated('data-memoria')) {
    const tex = plain(chapter(source)).replace(/\{,\}/g, ','); // 0{,}6 es 0,6
    assert.ok(tex.includes(`\\num{${plain(text)}}`) || tex.includes(plain(text)), `${source} no dice «${text}»`);
  }
});

test('ningún decimal de las diapositivas va sin fuente', () => {
  // Fuera de las notas del ponente, todo número con coma decimal tiene que estar anotado.
  const slides = html.replace(/<aside class="notas"[^>]*>[\s\S]*?<\/aside>/g, '');
  const bare = slides.replace(/<(\w+)[^>]*\sdata-(?:cifra|dato|memoria)="[^"]+"[^>]*>[^<]*<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ');
  const loose = bare.match(/\d+,\d+/g) ?? [];
  assert.deepEqual(loose, [], `decimales sin fuente: ${loose.join(', ')}`);
});

test('las cifras derivadas cuadran', () => {
  // «unos 6 s de captura para 112 trazas»: 112 trazas a 18,6 trazas por segundo.
  assert.ok(html.includes('unos 6 s de captura para <span data-cifra="realTracesNinety">'));
  assert.equal(Math.round(Number(macros.realTracesNinety) / 18.6), 6);
  // «La clave entera, en unos 7» (notas de la demo): las 132 trazas con las que salen todas las repeticiones.
  assert.equal(Math.round(Number(macros.realTracesAll) / 18.6), 7);
  // El factor del barajado es el cociente de las dos cifras del 90 %.
  const factor = Number(macros.realShuffleTracesNinety) / Number(macros.realBaseTracesNinety);
  assert.equal(factor.toFixed(1).replace('.', ','), macros.realShuffleFactor);
  // La apuesta se resuelve con «unas 100»: la opción más cercana (en escala logarítmica) a n90.
  const n90 = data('nano-curvas.json').series.tinyaes.n90;
  const options = [...html.matchAll(/class="opcion" data-valor="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(options, [10, 100, 1000, 10000, 1000000]);
  const closest = options.reduce((b, o) => (Math.abs(Math.log(o / n90)) < Math.abs(Math.log(b / n90)) ? o : b));
  assert.equal(closest, 100);
  assert.ok(html.includes('La respuesta: unas 100 trazas.'));
});

test('el ejemplo de la fuga es el del FIPS-197', () => {
  // Notas de la diapositiva 4: 0x32 ⊕ 0x2b = 0x19 y SBox(0x19) = 0xd4, con cuatro unos.
  assert.equal(0x32 ^ 0x2b, 0x19);
  assert.equal(SBOX[0x19], 0xd4);
  assert.equal(HW[0xd4], 4);
  assert.ok(html.includes('0x32 ⊕ 0x2b = 0x19 y SBox(0x19) = 0xd4, con cuatro unos'));
});
