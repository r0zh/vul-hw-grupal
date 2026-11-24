// Exporta la placa de la presentación (buildBoardModel() de js/escenas/placa.js) a modelos/cw1101.glb: Chromium sin
// ventana monta el modelo, GLTFExporter de three 0.187.0 lo escribe en metros con las texturas de canvas dentro (PNG) y
// parseGltf de Crucible lo vuelve a leer para comprobar que sirve.
//
//   CHROME=/ruta/a/chrome node presentacion/cine/exportar-glb.mjs
//
// Los materiales de placa.js no tienen nombre; aquí se les pone uno según su rugosidad y su metalicidad, que son
// distintas en cada uno, para que los planos puedan retocarlos por nombre (planos/piloto.mjs).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../web/scripts/cdp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = fileURLToPath(new URL('./modelos/cw1101.glb', import.meta.url));

const page = `<!doctype html><meta charset="utf-8">
<script type="importmap">{ "imports": {
  "three": "/presentacion/cine/node_modules/three/build/three.module.js",
  "three/addons/": "/presentacion/cine/node_modules/three/examples/jsm/" } }</script>
<script type="module">
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildBoardModel } from '/presentacion/js/escenas/placa.js';
import { parseGltf } from '/presentacion/cine/node_modules/@codepawlhq/crucible/build/gltf.js';
try {
  const names = { '0.68/0.11': 'mascara', '0.19/0.12': 'lente', '0.81/0': 'canto', '0.32/0.77': 'oro', '0.7/0.77': 'oro',
    '0.35/0.82': 'estano', '0.275/0.91': 'acero', '0.74/0.04': 'encapsulado', '0.87/0': 'goma', '0.58/0.06': 'crema',
    '0.62/0': 'ceramica' };
  const board = buildBoardModel(), unnamed = new Set();
  board.traverse((object) => {
    const m = object.material;
    if (!m || m.name) return;
    m.name = m.isMeshBasicMaterial ? 'marcado' : names[[m.roughness, m.metalness].map((v) => +v.toFixed(3)).join('/')] ?? '';
    if (!m.name) unnamed.add(m.type + ' ' + m.roughness + '/' + m.metalness);
  });
  const model = new THREE.Group();
  model.name = 'CW1101';
  model.scale.setScalar(0.001); // placa.js va en mm; glTF, en metros
  model.add(board);
  const glb = await new GLTFExporter().parseAsync(model, { binary: true });
  const asset = await parseGltf(glb.slice(0));
  const textures = new Set(asset.parts.map((p) => p.material?.map?.image).filter(Boolean));
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).toArray();
  const data = await new Promise((done) => {
    const reader = new FileReader();
    reader.onload = () => done(reader.result.slice(reader.result.indexOf(',') + 1));
    reader.readAsDataURL(new Blob([glb]));
  });
  window.resultado = { data, parts: asset.parts.length, textures: textures.size, warnings: asset.warnings,
    size, materials: [...new Set(asset.parts.map((p) => p.material?.name ?? '?'))], unnamed: [...unnamed] };
} catch (error) {
  window.resultado = { error: error.stack ?? String(error) };
}
</script>`;

const types = { '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  if (path === '/exportar-glb.html') return response.writeHead(200, { 'Content-Type': 'text/html' }).end(page);
  const file = normalize(join(root, path));
  let body;
  try {
    if (!file.startsWith(root)) throw new Error('fuera del repositorio');
    body = readFileSync(file);
  } catch {
    return response.writeHead(404).end();
  }
  response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));

const tab = await launch({ url: `http://127.0.0.1:${server.address().port}/exportar-glb.html`, width: 800, height: 600 });
let result;
try {
  await tab.waitFor('window.resultado', 120000);
  result = await tab.evalJs('window.resultado');
} finally {
  await tab.close();
  server.close();
}
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
const bytes = Buffer.from(result.data, 'base64');
mkdirSync(fileURLToPath(new URL('./modelos/', import.meta.url)), { recursive: true });
writeFileSync(out, bytes);
const mm = result.size.map((v) => (v * 1000).toFixed(1)).join(' × ');
console.log(`${out}: ${(bytes.length / 2 ** 20).toFixed(2)} MiB, ${mm} mm (x × y × z)`);
console.log(`Crucible (parseGltf): ${result.parts} partes, ${result.textures} texturas, materiales ${result.materials.join(', ')}`);
if (result.unnamed.length) console.log(`Materiales sin nombre (¿ha cambiado placa.js?): ${result.unnamed.join('; ')}`);
for (const warning of result.warnings) console.log(`aviso: ${warning}`);

// Los planos lo leen en Node (loadModel de estudio.mjs, con su propio decodificador de PNG): el color más repetido de
// la textura de la máscara tiene que ser exactamente el de PALETA.pcb, que es el fondo que pinta placa.js.
const { loadModel } = await import('./estudio.mjs');
const { PALETA } = await import('../js/paleta.js');
const { parts } = await loadModel('cw1101.glb');
const { data } = parts.find((p) => p.material?.name === 'mascara').material.map.image;
const counts = new Map();
for (let p = 0; p < data.length; p += 4 * 7) {
  const rgb = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
  counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
}
const mode = [...counts].sort((a, b) => b[1] - a[1])[0][0];
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
console.log(`Node (loadModel): ${parts.length} partes; color mayoritario de la máscara ${hex(mode)} (PALETA.pcb ${hex(PALETA.pcb)})`);
if (parts.length !== result.parts || mode !== PALETA.pcb) process.exit(1);
