// Estructura de index.html: lo que el motor (js/deck.js), la vista del ponente
// y la guía de estilo dan por hecho. Falla si al editar una diapositiva se
// rompe alguna de esas reglas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { vosotros } from '../js/figuras/recuerdo.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const slides = [...html.matchAll(/<section class="diapo[^"]*"([^>]*)>([\s\S]*?)<\/section>/g)].map((m) => ({
  attrs: Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
  body: m[2],
}));
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&[#\w]+;/g, ' ').replace(/\s+/g, ' ').trim();
const words = (s) => text(s).split(' ').filter(Boolean).length;
const withoutNotes = (s) => s.replace(/<aside class="notas"[^>]*>[\s\S]*?<\/aside>/g, '');

test('cada diapositiva tiene id único, título, sección y notas de 3 a 6 viñetas', () => {
  assert.ok(slides.length >= 15, `solo hay ${slides.length} diapositivas`);
  const ids = slides.map((s) => s.attrs.id);
  assert.equal(new Set(ids).size, ids.length, 'ids repetidos');
  for (const s of slides) {
    assert.ok(s.attrs.id && s.attrs['data-titulo'], `diapositiva sin id o sin data-titulo: ${s.attrs.id}`);
    assert.ok('data-seccion' in s.attrs, `${s.attrs.id}: falta data-seccion`);
    const notes = s.body.match(/<aside class="notas"([^>]*)>([\s\S]*?)<\/aside>/);
    assert.ok(notes, `${s.attrs.id}: sin notas`);
    assert.match(notes[1], /data-quien="[^"]+"/, `${s.attrs.id}: las notas no dicen quién presenta`);
    assert.match(notes[1], /data-tiempo="[^"]+"/, `${s.attrs.id}: las notas no dicen cuánto tiempo`);
    const items = (notes[2].match(/<li\b/g) ?? []).length;
    assert.ok(items >= 3 && items <= 6, `${s.attrs.id}: ${items} viñetas en las notas`);
  }
});

test('data-pasos cubre todos los data-paso y data-solo', () => {
  for (const s of slides) {
    const steps = Number(s.attrs['data-pasos'] ?? 0);
    const used = [...s.body.matchAll(/data-(?:paso|solo)="(\d+)"/g)].map((m) => Number(m[1]));
    for (const k of used) assert.ok(k <= steps, `${s.attrs.id}: usa el paso ${k} y data-pasos es ${steps}`);
    if ('data-paso-pdf' in s.attrs) assert.ok(Number(s.attrs['data-paso-pdf']) <= steps, `${s.attrs.id}: data-paso-pdf fuera de rango`);
  }
});

test('el orden de las diapositivas es el del guion (NARRATIVA.md)', () => {
  // El juego de las monedas va justo tras la portada; el puente juego → ataque, antes del montaje y de la demo.
  const order = ['portada', 'juego', 'pregunta', 'indice', 'fuga', 'punto-de-ataque', 'spa', 'dpa-cpa', 'puente',
    'montaje', 'apuesta', 'demo', 'por-dentro', 'resultados', 'contramedidas', 'conclusiones', 'preguntas'];
  assert.deepEqual(slides.slice(0, order.length).map((s) => s.attrs.id), order);
  for (const s of slides.slice(order.length)) assert.equal(s.attrs['data-seccion'], 'Anexos', `${s.attrs.id} va tras las preguntas`);
  assert.equal(slides.at(-1).attrs.id, 'anexo-cuentas', 'la fórmula del CPA va en el último anexo');
  const juego = slides[1].body;
  assert.match(juego, /data-modulo="js\/figuras\/juego-monedas\.js"/);
  assert.doesNotMatch(withoutNotes(juego), /<p\b/, 'el juego no lleva más texto que el título');
});

test('las diapositivas principales no llevan fórmulas', () => {
  // ρ, |ρ|, HW(…) y √ solo en los anexos; en las principales se dice «parecido» y «número de unos».
  for (const s of slides.filter((x) => x.attrs['data-seccion'] !== 'Anexos')) {
    assert.doesNotMatch(text(withoutNotes(s.body)), /ρ|√|HW\(|SBox\(/, `${s.attrs.id}: fórmula en una diapositiva principal`);
  }
});

test('«Resultados» recuerda la partida del juego', () => {
  assert.equal(vosotros(1, true), 'Vosotros: <b>1 tirada</b>');
  assert.equal(vosotros(888, true), 'Vosotros: <b>888 tiradas</b>');
  assert.equal(vosotros(40, false), 'Vosotros: <b>40 tiradas</b>, sin acertar');
  assert.equal(vosotros(38, true, true), 'Vosotros: <b>38 tiradas</b>, con suerte');
  assert.match(html, /<span class="recuerdo-juego">[^<]*<b>[^<]+<\/b><\/span> · el ataque: unas 100 trazas/);
});

test('poco texto: títulos de 8 palabras y párrafos de 25 como mucho', () => {
  for (const s of slides) {
    const body = withoutNotes(s.body);
    for (const [, h] of body.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/g)) {
      assert.ok(words(h) <= 8, `${s.attrs.id}: título de ${words(h)} palabras: «${text(h)}»`);
    }
    for (const [, p] of body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
      assert.ok(words(p) <= 25, `${s.attrs.id}: párrafo de ${words(p)} palabras: «${text(p)}»`);
    }
    assert.ok(!/—/.test(text(body)), `${s.attrs.id}: raya «—» en la diapositiva`);
  }
});

test('los módulos son rutas relativas a presentacion/ y las escenas 3D llevan póster', () => {
  const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));
  for (const [, tag] of html.matchAll(/(<div class="escena(?:\s[^"]*)?"[^>]*>)/g)) {
    const path = tag.match(/data-modulo="([^"]+)"/)?.[1];
    assert.ok(path && /^js\/[\w/-]+\.js$/.test(path), `módulo mal escrito: ${tag}`);
    assert.ok(exists(path), `no existe el módulo ${path}`);
    const backup = tag.match(/data-respaldo="([^"]+)"/)?.[1];
    if (backup) assert.ok(exists(backup), `no existe el respaldo ${backup}`);
  }
  for (const [, block] of html.matchAll(/(<div class="escena(?:\s[^"]*)?"[^>]*data-3d[^>]*>[\s\S]*?<\/div>)/g)) {
    assert.match(block, /<img class="poster" src="img\/escenas\/[\w-]+-paso\d\.png"/, `escena 3D sin póster: ${block.slice(0, 90)}`);
  }
  for (const [, src] of html.matchAll(/<img class="poster" src="([^"]+)"/g)) assert.ok(exists(src), `no existe el póster ${src}`);
});
