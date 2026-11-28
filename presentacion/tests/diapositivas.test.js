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
    'montaje', 'apuesta', 'demo', 'por-dentro', 'resultados', 'mapa', 'contramedidas', 'conclusiones', 'preguntas'];
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

// ── Lo que pide la rúbrica de la exposición (docs/enunciado.md) ──

test('las partes del índice son las de la tira de abajo, y solo las diapositivas de antes del índice quedan sin parte', () => {
  // La tira «en qué parte estamos» (js/deck.js) sale de los data-seccion, en su orden.
  const sections = [...new Set(slides.map((s) => s.attrs['data-seccion']).filter((x) => x && x !== 'Anexos'))];
  const index = slides.find((s) => s.attrs.id === 'indice');
  const listed = [...index.body.matchAll(/<li><span class="n">\d<\/span><b>([^<]+)<\/b>/g)].map((m) => m[1]);
  assert.deepEqual(listed, sections, 'el índice y los data-seccion no dicen las mismas partes');
  assert.match(html, /<section class="diapo indice"[^>]*\sdata-partes[\s>]/, 'el índice tiene que enseñar la tira (data-partes)');
  const at = slides.indexOf(index);
  slides.forEach((s, i) => { if (i > at) assert.ok(s.attrs['data-seccion'], `${s.attrs.id}: después del índice, toda diapositiva tiene parte`); });
});

test('hay un mapa conceptual y las fuentes principales salen en pantalla', () => {
  const map = withoutNotes(slides.find((s) => s.attrs.id === 'mapa').body);
  assert.match(map, /<svg[^>]*role="img"[^>]*aria-label="Mapa conceptual/, 'el mapa lleva su descripción');
  for (const concept of ['de la clave', 'intermedio', 'El consumo', 'Las trazas', 'correcto', 'Enmascarar', 'Ocultar', 'Renovar la clave']) {
    assert.ok(map.includes(concept), `en el mapa falta «${concept}»`);
  }
  assert.equal((map.match(/medido en nuestra placa/g) ?? []).length, 1, 'en el mapa, solo una defensa está medida');
  const before = slides.slice(0, slides.findIndex((s) => s.attrs.id === 'fuga')).map((s) => withoutNotes(s.body)).join(' ');
  assert.match(before, /Mishra y S\. K\. Sahay/, 'el artículo base se cita antes de empezar el desarrollo');
  const cpa = withoutNotes(slides.find((s) => s.attrs.id === 'dpa-cpa').body);
  assert.match(cpa, /Brier, Clavier y Olivier, 2004/);
  assert.match(cpa, /Kocher, Jaffe y Jun, 1999/);
});

test('la página del móvil (sala.html) no carga nada de fuera y ofrece las apuestas de la diapositiva', () => {
  const page = readFileSync(new URL('../sala.html', import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(page, /(?:src|href)\s*=\s*["']?(?:https?:)?\/\//, 'la página del público no puede depender de otra web');
  assert.doesNotMatch(page, /<link\b|<script\b[^>]*\bsrc=|@import|url\(/, 'todo va dentro de la página');
  const phone = [...page.matchAll(/data-apuesta="(\d+)"/g)].map((m) => m[1]);
  const slide = [...slides.find((s) => s.attrs.id === 'apuesta').body.matchAll(/data-valor="(\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(phone, slide, 'el móvil y la diapositiva 11 no ofrecen las mismas apuestas');
  const server = readFileSync(new URL('../../captura/sala.py', import.meta.url), 'utf8').match(/^BETS = \(([^)]*)\)/m)[1];
  assert.deepEqual(server.split(',').map((x) => x.trim().replaceAll('_', '')), slide, 'captura/sala.py no acepta las mismas apuestas');
  for (const view of ['conectando', 'elige', 'guardado', 'testigo', 'cerrada', 'fuera', 'leido']) {
    assert.ok(page.includes(`data-vista="${view}"`), `a la página del móvil le falta la vista «${view}»`);
  }
});

test('en el montaje, la mesa de laboratorio va antes que el vídeo y después lo acompaña en un recuadro', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const slide = slides.find((x) => x.attrs.id === 'montaje');
  const steps = Number(slide.attrs['data-pasos']);
  const body = withoutNotes(slide.body);
  // La escena 3D: sus pasos son los de la diapositiva, y desde INSET compone para el recuadro.
  const scene = read('js/escenas/mesa.js');
  const constant = (name) => Number(scene.match(new RegExp(`^const ${name} = (\\d+);`, 'm'))?.[1]);
  assert.equal(steps, constant('STEPS') - 1, 'data-pasos no es el número de pasos de js/escenas/mesa.js');
  const wait = constant('INSET');
  // El vídeo espera esos pasos escondido, y su respaldo en 3D lleva los mismos pasos, con los trozos en su orden.
  const video = body.match(/<div class="escena montaje-placa"[^>]*>/)?.[0] ?? '';
  assert.match(video, new RegExp(`data-paso="${wait}"`), 'el vídeo sale cuando la mesa pasa al recuadro');
  const options = JSON.parse(video.match(/data-opciones='([^']+)'/)[1]);
  assert.equal(options.espera, wait, '«espera» son los pasos de la mesa a toda la diapositiva');
  assert.equal(options.orden.length, steps + 1, 'el respaldo necesita un paso de la placa por cada paso de la diapositiva');
  assert.deepEqual(options.orden.slice(wait), [3, 4, 2, 1, 0], 'el respaldo sigue el orden de los trozos del vídeo');
  for (const id of ['victima', 'shunt', 'adc', 'capturador', 'regalado']) {
    assert.match(body, new RegExp(`<template data-etiqueta="${id}">`), `falta la etiqueta «${id}» del vídeo`);
  }
  // La mesa va después del vídeo en el HTML, en su marco: deck.css la encoge con «.montaje-placa.visible ~ .mesa-marco > .mesa».
  const bench = body.match(/<div class="escena mesa"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.match(bench, /data-modulo="js\/figuras\/mesa\.js"[^>]*data-3d/);
  assert.match(body, /<\/div>\s*<div class="mesa-marco">\s*<div class="escena mesa"/, 'la mesa va en su marco, que es hermano del vídeo');
  assert.ok(body.indexOf('class="mesa-marco"') > body.indexOf('class="escena montaje-placa"'), 'la mesa tiene que ir después del vídeo');
  const css = read('css/deck.css');
  const shrunk = '\\.montaje-placa\\.visible ~ \\.mesa-marco > \\.mesa \\{';
  assert.match(css, new RegExp(shrunk), 'falta la regla que pasa la mesa al recuadro');
  // La ventana que la escena compone es la que deja ver la máscara del recuadro.
  const size = css.match(/\.montaje \.mesa-marco \{[^}]*?width: (\d+)px;\s*height: (\d+)px;/);
  const mask = css.match(new RegExp(`${shrunk}[^}]*mask-size: (\\d+)px (\\d+)px;`));
  assert.ok(size && mask, 'deck.css no dice el tamaño de la mesa o el de su ventana');
  const [fw, fh] = JSON.parse(bench.match(/data-opciones='([^']+)'/)[1]).ventana;
  assert.ok(Math.abs(fw - mask[1] / size[1]) < 0.001 && Math.abs(fh - mask[2] / size[2]) < 0.001,
    `la ventana de data-opciones (${fw} × ${fh}) no es la de deck.css (${mask[1]} × ${mask[2]} de ${size[1]} × ${size[2]})`);
  // Los rótulos de index.html son de los que la escena sabe colocar.
  const known = new Set([...scene.matchAll(/^  \{ id: '(\w+)', steps:/gm)].map((m) => m[1]).concat('nota'));
  const labels = [...bench.matchAll(/<template data-etiqueta="(\w+)">/g)].map((m) => m[1]);
  assert.ok(labels.length >= known.size, 'faltan rótulos de la mesa');
  for (const id of labels) assert.ok(known.has(id), `js/escenas/mesa.js no tiene el rótulo «${id}»`);
  assert.match(bench, /<template data-etiqueta="nota">[^<]*esquema[^<]*medidas con el ChipWhisperer-Nano/, 'la nota dice que la mesa es un esquema y de dónde salen las trazas');
  // La pregunta a la sala, con el chip solo; y bajo el recuadro, una frase por paso del vídeo.
  assert.match(body, /<p class="mesa-pregunta" data-solo="0">¿[^<]+\?<\/p>/);
  const side = body.match(/<div class="montaje-lado"[^>]*>[\s\S]*?<\/figure>/)?.[0] ?? '';
  assert.match(side, new RegExp(`^<div class="montaje-lado" data-paso="${wait}">`), 'la columna del recuadro sale con el vídeo');
  for (let k = 0; k <= steps; k++) {
    assert.equal(side.includes(`<p data-solo="${k}">En la mesa: `), k >= wait, `pie del recuadro en el paso ${k}`);
  }
});
