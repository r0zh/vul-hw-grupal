// V3 «La montaña» (GUION.md, §4): |ρ(k, t)| del byte 0 con las N primeras trazas medidas de web/data/nano-tinyaes.json,
// calculado con el CPA de la diapositiva (web/js/model/cpa.js), como una maqueta: base blanca, superficie gris, la fila
// del candidato correcto en un tubo azul y un velo translúcido a la altura del mejor falso. Cada fotograma es un N real.
//
//   node render.mjs planos/v3.mjs --nativo --ancho 1200 --alto 826 --muestras 160   (el vídeo; las fotos fijas, al doble)
//   node planos/v3.mjs [salida.json]   comprueba las cifras del guion y escribe las anclas de las etiquetas
//                                      (por defecto, presentacion/video/v3.json)
//
// Un solo vídeo de 313 fotogramas a 30 fps; PASOS dice qué trozo reproduce cada paso de la diapositiva:
//   0          paso 0, el póster: N = 5
//   1–60       paso 1: N = round(5·4^(i/59)), de 5 a 20
//   61–150     paso 2: N = round(20·5^(i/89)), de 20 a 100; en el fotograma 77 (0,53 s) llega a 27 y el correcto pasa a primero
//   151–312    paso 3: N = round(100·4^(i/89)) hasta 400 (3,0 s), quieto 0,4 s y baja a la vista frontal en 2,0 s
//
// Marco M del guion, en mm: origen en el centro de la cara de arriba de la base, X el tiempo, Y |ρ| y Z el candidato
// (0x00 al fondo). En la escena, metros: mundo = 0,001 · (X, Y + 6, Z), porque la base mide 6 mm y apoya en el suelo.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createEnvironmentMap, cylinder, sphere } from '@codepawlhq/crucible';
import { createCamera } from '@codepawlhq/crucible/addons/path-tracer';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { fromCampaignJSON, createAccumulator, correlate, peaks } from '../../../web/js/model/cpa.js';
import { BACKGROUND, orbit, studio } from '../estudio.mjs';

export const fps = 30;
export const PASOS = [[0, 0], [1, 60], [61, 150], [151, 312]]; // [primer, último] fotograma de cada paso
const TOTAL = PASOS.at(-1)[1] + 1;
export const duration = TOTAL / fps;
const MOVE = [253, 312]; // la cámara baja de 3,4 a 5,4 s del paso 3 (el último fotograma ya es la vista frontal)

// N de cada fotograma.
export function countAt(i) {
  if (i <= 0) return 5;
  if (i <= 60) return Math.round(5 * 4 ** ((i - 1) / 59));
  if (i <= 150) return Math.round(20 * 5 ** ((i - 61) / 89));
  return Math.round(100 * 4 ** (Math.min(i - 151, 89) / 89));
}

// ── Datos: el mismo CPA que la diapositiva, sobre las trazas medidas ──
const campaign = fromCampaignJSON(JSON.parse(readFileSync(new URL('../../../web/data/nano-tinyaes.json', import.meta.url), 'utf8')));
const S = campaign.nSamples, OFFSET = campaign.meta.muestras[0], BYTE = 0, KEY = campaign.key[BYTE];
const TIE = 1e-9; // con 5 trazas, 86 falsos llegan a |ρ| = 1 como el correcto: el redondeo no decide el puesto
const needed = new Set([5, 20, 27, 100, 400, ...Array.from({ length: TOTAL }, (_, i) => countAt(i))]);
const fields = new Map(); // N → { abs, peak, at, puesto, empates, mejorFalso }
const ranks = []; // puesto del correcto con cada N de 5 a 400, para el assert
{
  const acc = createAccumulator(S);
  for (let n = 5; n <= 400; n++) {
    acc.add(campaign, acc.n, n);
    const rho = correlate(acc, BYTE);
    const { peak, at } = peaks(rho, S);
    let puesto = 1, empates = 0, mejorFalso = 0;
    for (let k = 0; k < 256; k++) {
      if (k === KEY) continue;
      if (peak[k] > peak[KEY] - TIE) puesto++; // los empates cuentan en contra, como rankOf de cpa.js
      if (Math.abs(peak[k] - peak[KEY]) <= TIE) empates++;
      mejorFalso = Math.max(mejorFalso, peak[k]);
    }
    ranks[n] = puesto;
    if (needed.has(n)) fields.set(n, { abs: Float32Array.from(rho, (v) => Math.min(1, Math.abs(v))), peak, at, puesto, empates, mejorFalso });
  }
}

// Las cifras del guion (§4), comprobadas con el CPA de la diapositiva.
const firstStable = ranks.findLastIndex((r, n) => n >= 5 && r !== 1) + 1;
for (const [n, correcto, muestra, mejorFalso, puesto] of [[20, 0.783, 463, 0.849, 7], [27, 0.781, 462, 0.778, 1], [100, 0.730, 462, 0.503, 1], [400, 0.576, 462, 0.250, 1]]) {
  const f = fields.get(n);
  const got = [f.peak[KEY].toFixed(3), f.at[KEY] + OFFSET, f.mejorFalso.toFixed(3), f.puesto];
  if (String(got) !== String([correcto.toFixed(3), muestra, mejorFalso.toFixed(3), puesto])) throw new Error(`V3: con N = ${n} sale ${got}, no lo del guion`);
}
if (firstStable !== 27) throw new Error(`V3: el correcto es siempre el primero desde N = ${firstStable}, no desde 27`);
if (fields.get(5).peak[KEY] < 1 - TIE || fields.get(5).mejorFalso < 1 - TIE) throw new Error('V3: con 5 trazas el correcto y el mejor falso deberían llegar a |ρ| = 1');

// ── Maqueta, en mm del marco M ──
const BASE = { w: 236, h: 6, d: 148 }, HALF_X = 112, HALF_Z = 68, Y_SCALE = 86, Y_FLOOR = 0.5;
const xOf = (t) => -HALF_X + (2 * HALF_X * t) / (S - 1);
const zOf = (k) => -HALF_Z + (2 * HALF_Z * k) / 255;
const yOf = (rho) => Y_SCALE * rho + Y_FLOOR;
const TUBE = 0.9, VEIL = { w: 228, d: 140 }, ROD = 0.5, AXIS = 0.4; // radios y medidas en mm
const RHO_AXIS = [-115, -71], TIME_Z = 71, KEY_X = 115, TICK = 3; // los ejes van por el margen de la base
const toWorld = (x, y, z) => [x / 1000, (y + BASE.h) / 1000, z / 1000];

const srgb = (hex) => [0, 2, 4].map((i) => { const c = parseInt(hex.slice(1 + i, 3 + i), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const LOOKS = {
  base: { color: srgb('#fbfbfd'), roughness: 0.5, metallic: 0 },
  superficie: { color: srgb('#dcdce1'), roughness: 0.6, metallic: 0 },
  correcto: { color: srgb('#0071e3'), roughness: 0.35, metallic: 0 },
  velo: { color: [1, 1, 1], roughness: 0.6, metallic: 0, alphaMode: 'blend', opacity: 0.25 },
  varilla: { color: srgb('#6e6e73'), roughness: 0.45, metallic: 0 },
};

// Matriz (por columnas, como Crucible) que escala, gira alrededor de Z y traslada; en mm, a metros.
function placed(sx, sy, sz, [x, y, z], angle = 0) {
  const c = Math.cos(angle), s = Math.sin(angle), m = 0.001;
  return new Float32Array([c * sx * m, s * sx * m, 0, 0, -s * sy * m, c * sy * m, 0, 0, 0, 0, sz * m, 0, ...toWorld(x, y, z), 1]);
}

// Superficie: rejilla de S × 256 vértices, abierta (sin faldones: así se ve como un campo de agujas y no como un
// bloque). Los índices no cambian entre fotogramas.
const surfaceIndices = (() => {
  const out = new Uint32Array((S - 1) * 255 * 6);
  let n = 0;
  for (let k = 0; k < 255; k++) for (let t = 0; t < S - 1; t++) {
    const i = k * S + t; // a → b sube en Z y a → c en X: normal hacia +Y
    out.set([i, i + S, i + 1, i + 1, i + S, i + S + 1], n);
    n += 6;
  }
  return out;
})();

function surface(abs) {
  const positions = new Float32Array(S * 256 * 3), normals = new Float32Array(S * 256 * 3);
  const h = (t, k) => yOf(abs[k * S + t]);
  const dx = (2 * HALF_X) / (S - 1), dz = (2 * HALF_Z) / 255;
  for (let k = 0; k < 256; k++) for (let t = 0; t < S; t++) {
    const p = 3 * (k * S + t), t0 = Math.max(0, t - 1), t1 = Math.min(S - 1, t + 1), k0 = Math.max(0, k - 1), k1 = Math.min(255, k + 1);
    positions.set(toWorld(xOf(t), h(t, k), zOf(k)), p);
    const gx = (h(t1, k) - h(t0, k)) / (dx * (t1 - t0)), gz = (h(t, k1) - h(t, k0)) / (dz * (k1 - k0)), l = Math.hypot(gx, 1, gz);
    normals.set([-gx / l, 1 / l, -gz / l], p);
  }
  return { positions, normals, indices: surfaceIndices };
}

// Tubo de la fila correcta: un cilindro por tramo y una esfera en cada vértice, en una sola malla.
const RING = 10, BALL = sphere(10, 6);
const TUBE_VERTS = (S - 1) * 2 * RING + S * (BALL.positions.length / 3);
const tubeIndices = (() => {
  const out = [];
  for (let j = 0; j < S - 1; j++) for (let r = 0; r < RING; r++) {
    const a = j * 2 * RING + r, b = j * 2 * RING + (r + 1) % RING;
    out.push(a, b, a + RING, b, b + RING, a + RING);
  }
  const ball = BALL.positions.length / 3;
  for (let j = 0; j < S; j++) for (const i of BALL.indices) out.push((S - 1) * 2 * RING + j * ball + i);
  return Uint32Array.from(out);
})();

function tube(points) {
  const positions = new Float32Array(TUBE_VERTS * 3), normals = new Float32Array(TUBE_VERTS * 3);
  let v = 0;
  for (let j = 0; j < S - 1; j++) {
    const [x0, y0, z] = points[j], [x1, y1] = points[j + 1], l = Math.hypot(x1 - x0, y1 - y0);
    const u = [-(y1 - y0) / l, (x1 - x0) / l]; // normal al tramo en el plano de la fila; la otra es Z
    for (const [x, y] of [[x0, y0], [x1, y1]]) for (let r = 0; r < RING; r++) {
      const a = (2 * Math.PI * r) / RING, n = [Math.cos(a) * u[0], Math.cos(a) * u[1], Math.sin(a)];
      positions.set(toWorld(x + TUBE * n[0], y + TUBE * n[1], z + TUBE * n[2]), 3 * v);
      normals.set(n, 3 * v++);
    }
  }
  for (const [x, y, z] of points) for (let i = 0; i < BALL.positions.length; i += 3) {
    const n = BALL.positions.subarray(i, i + 3);
    positions.set(toWorld(x + TUBE * n[0], y + TUBE * n[1], z + TUBE * n[2]), 3 * v);
    normals.set(n, 3 * v++);
  }
  return { positions, normals, indices: tubeIndices };
}

const rowPoints = (abs) => Array.from({ length: S }, (_, t) => [xOf(t), yOf(abs[KEY * S + t]) + TUBE / 2, zOf(KEY)]);

// ── Cámara ──
const LENS = { fov: 24, fStop: 11 };
const VIEWS = [
  { eye: [206.4, 335.0, 486.3], target: [12.4, 36.4, -9.7], focus: 666 }, // 3/4, pasos 0 a 3
  { eye: [0.0, 94.8, 616.6], target: [23.1, 45.6, -2.4], focus: 659 }, // frontal, final del paso 3
];
// cubic-bezier(.65, 0, .35, 1) del guion: x(s) = t por bisección.
function ease(t) {
  const bez = (s, p1, p2) => 3 * (1 - s) ** 2 * s * p1 + 3 * (1 - s) * s * s * p2 + s ** 3;
  let lo = 0, hi = 1;
  for (let k = 0; k < 40; k++) { const s = (lo + hi) / 2; if (bez(s, 0.65, 0.35) < t) lo = s; else hi = s; }
  return bez((lo + hi) / 2, 0, 1);
}
const spherical = ([x, y, z]) => { const d = Math.hypot(x, y, z); return [Math.atan2(x, z), Math.asin(y / d), d]; };
// Cámara del fotograma i, en el marco M: objetivo lineal, ojo en esféricas alrededor del objetivo y foco a la par.
export function cameraAt(i) {
  const s = ease(Math.min(1, Math.max(0, (i - MOVE[0] + 1) / (MOVE[1] - MOVE[0] + 1))));
  const [a, b] = VIEWS, mix = (p, q) => p + (q - p) * s;
  const target = a.target.map((v, k) => mix(v, b.target[k]));
  const [az0, el0, d0] = spherical(a.eye.map((v, k) => v - a.target[k]));
  const [az1, el1, d1] = spherical(b.eye.map((v, k) => v - b.target[k]));
  const az = mix(az0, az1), el = mix(el0, el1), d = mix(d0, d1);
  const eye = [target[0] + d * Math.cos(el) * Math.sin(az), target[1] + d * Math.sin(el), target[2] + d * Math.cos(el) * Math.cos(az)];
  return { eye, target, focus: mix(a.focus, b.focus) };
}
const worldCamera = ({ eye, target, focus }) => ({ eye: toWorld(...eye), target: toWorld(...target), ...LENS, focusDistance: focus / 1000 });

// ── Estudio ──
// El de estudio.mjs (light linking: el suelo con su panel y la maqueta con sus cajas), con las luces del guion a la
// escala de la maqueta. En la vista frontal la cámara ve el suelo hasta el horizonte: un panel de 30 m lo deja igual de
// claro hasta el borde, y cameraIntensity pone el cielo que se ve justo encima del horizonte en el mismo #f5f5f7.
const CENTER = [0, 0.03, 0];
const box2 = (azimuth, elevation, distance, width, height, radiance) => {
  const position = orbit(azimuth, elevation, distance, CENTER);
  const l = Math.hypot(...position.map((c, k) => CENTER[k] - c));
  return { position, direction: position.map((c, k) => (CENTER[k] - c) / l), up: [0, 1, 0], width, height, intensity: radiance * width * height };
};
const viewFactor = (a, b, h) => { const x = a / h, y = b / h, X = Math.hypot(1, x), Y = Math.hypot(1, y); return (2 / Math.PI) * (x / X * Math.atan(y / X) + y / Y * Math.atan(x / Y)); };
// Radiancias: la caja principal, la de recorte y el panel del suelo; `sky` escala el cielo de studio() (solo como luz: el
// relleno que llega a la maqueta) y `view` es el cielo que ve la cámara (cameraIntensity).
const LIGHTS = { key: 5, rim: 25, panel: 1.2, panelSize: 30, sky: 0.4, view: 2.55 };

export async function scene() {
  const { environment, floor, lightMask } = studio({ azimuth: 21 });
  const [, , panel] = environment.areaLights, { map } = environment, size = LIGHTS.panelSize;
  const before = viewFactor(panel.width / 2, panel.height / 2, panel.position[1]), after = viewFactor(size / 2, size / 2, panel.position[1]);
  // E/π del cielo sobre el suelo, despejada del albedo que calculó studio() (albedo = fondo / (cielo + panel)), y el
  // albedo con este cielo y este panel, para que el suelo siga dando #f5f5f7.
  const color = floor.material.color.map((c, k) => BACKGROUND[k] / ((BACKGROUND[k] / c - before) * LIGHTS.sky + after * LIGHTS.panel));
  environment.map = createEnvironmentMap({ width: map.width, height: map.height, data: map.data, intensity: map.intensity * LIGHTS.sky });
  environment.areaLights = [
    box2(-60, 50, 1.0, 1.0, 1.0, LIGHTS.key), // bit 25: principal, delante a la izquierda
    box2(180, 15, 0.9, 1.2, 0.08, LIGHTS.rim), // bit 26: recorte, detrás y baja
    { ...panel, width: size, height: size, intensity: LIGHTS.panel * size ** 2 }, // bit 27: solo el suelo
  ];
  environment.cameraIntensity = LIGHTS.view;
  const material = (name) => ({ name, ...LOOKS[name], lightMask });
  const materials = Object.fromEntries(Object.keys(LOOKS).map((name) => [name, material(name)]));
  const rounded = new RoundedBoxGeometry(BASE.w, BASE.h, BASE.d, 4, 2.5);
  const count = rounded.attributes.position.count;
  const baseGeometry = { positions: rounded.attributes.position.array, normals: rounded.attributes.normal.array, indices: Uint32Array.from({ length: count }, (_, i) => i) };
  const rod = cylinder(16, 0, 1);
  // Varillas de los ejes, quietas: |ρ| en la esquina del fondo a la izquierda, el tiempo delante y el candidato a la derecha.
  const axes = [];
  const bar = (length, radius, at, angle) => axes.push({ name: 'eje', geometry: rod, matrix: placed(radius, length, radius, at, angle), material: materials.varilla });
  const [rx, rz] = RHO_AXIS, top = yOf(1) + 6;
  bar(top, AXIS, [rx, top / 2, rz], 0);
  for (const v of [0, 0.5, 1]) bar(TICK, AXIS, [rx - TICK / 2, yOf(v), rz], Math.PI / 2);
  bar(2 * HALF_X, AXIS, [0, AXIS, TIME_Z], Math.PI / 2);
  for (const s of [500, 600, 700]) axes.push({ name: 'marca', geometry: rod, matrix: placedZ(AXIS, TICK, [xOf(s - OFFSET), AXIS, TIME_Z + TICK / 2]), material: materials.varilla });
  axes.push({ name: 'eje', geometry: rod, matrix: placedZ(AXIS, 2 * HALF_Z, [KEY_X, AXIS, 0]), material: materials.varilla });
  for (const k of [0, 128, 255]) bar(TICK, AXIS, [KEY_X + TICK / 2, AXIS, zOf(k)], Math.PI / 2);
  const fixed = [
    { ...floor, material: { ...floor.material, color } },
    { name: 'base', geometry: baseGeometry, matrix: placed(1, 1, 1, [0, -BASE.h / 2, 0]), material: materials.base },
    ...axes,
  ];
  const base = { fixed, materials, rod, unit: PLANE };
  return { parts: parts(0, base), environment, ...base };
}

// Un cilindro (eje Y) tumbado a lo largo de Z.
function placedZ(radius, length, at) {
  const m = 0.001;
  return new Float32Array([radius * m, 0, 0, 0, 0, 0, length * m, 0, 0, -radius * m, 0, 0, ...toWorld(...at), 1]);
}

function parts(i, base) {
  const f = fields.get(countAt(i)), veilY = yOf(f.mejorFalso);
  const { materials, rod, unit } = base;
  const frame = [
    [VEIL.w + 2 * ROD, [0, veilY, VEIL.d / 2], Math.PI / 2, 'x'], [VEIL.w + 2 * ROD, [0, veilY, -VEIL.d / 2], Math.PI / 2, 'x'],
    [VEIL.d, [VEIL.w / 2, veilY, 0], 0, 'z'], [VEIL.d, [-VEIL.w / 2, veilY, 0], 0, 'z'],
  ].map(([length, at, angle, axis]) => ({ name: 'marco', geometry: rod, material: materials.varilla,
    matrix: axis === 'x' ? placed(ROD, length, ROD, at, angle) : placedZ(ROD, length, at) }));
  return [
    ...base.fixed,
    { name: 'superficie', geometry: surface(f.abs), matrix: identity(), material: materials.superficie },
    { name: 'correcto', geometry: tube(rowPoints(f.abs)), matrix: identity(), material: materials.correcto },
    { name: 'velo', geometry: unit, matrix: placed(VEIL.w, 1, VEIL.d, [0, veilY, 0]), material: materials.velo, rayVisibility: { shadow: false } },
    ...frame,
  ];
}
const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
// El velo es una lámina sin grosor (con grosor, sus dos caras lo hacían casi opaco).
const PLANE = { positions: Float32Array.of(-0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0, 0.5), normals: Float32Array.of(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0),
  indices: Uint32Array.of(0, 1, 2, 2, 1, 3) };

// `key`: con la cámara quieta, dos fotogramas con el mismo N son el mismo render (render.mjs copia el PNG).
export function frame(t, base) {
  const i = Math.min(TOTAL - 1, Math.max(0, Math.round(t * fps)));
  return { camera: worldCamera(cameraAt(i)), parts: parts(i, base), key: i < MOVE[0] ? `N${countAt(i)}` : undefined };
}

// ── Etiquetas: anclas proyectadas con la misma cámara que el render ──
// La segunda cresta del correcto, desde la muestra 600: el mismo byte, que las mezclas que siguen a la S-box vuelven a
// cargar (memoria, §4.3). Con 400 trazas está en la muestra 730, con |ρ| = 0,48.
const AFTER = 600 - OFFSET;
function secondCrest(f) {
  let best = AFTER;
  for (let t = AFTER; t < S; t++) if (f.abs[KEY * S + t] > f.abs[KEY * S + best]) best = t;
  return best;
}
// Ids y anclas en M. El texto lo pone la diapositiva (js/figuras/cine-v3.js o index.html), no el render. `vista`: 0 la
// 3/4, 1 mientras la cámara baja y 2 la frontal.
function anchors(i) {
  const f = fields.get(countAt(i)), row = KEY * S, crest = f.at[KEY], crest2 = secondCrest(f);
  const [rx, rz] = RHO_AXIS;
  return {
    rho0: [rx - TICK, yOf(0), rz], rho05: [rx - TICK, yOf(0.5), rz], rho1: [rx - TICK, yOf(1), rz], 'eje-rho': [rx, yOf(1) + 6, rz],
    t500: [xOf(500 - OFFSET), 0, TIME_Z + TICK], t600: [xOf(600 - OFFSET), 0, TIME_Z + TICK], t700: [xOf(700 - OFFSET), 0, TIME_Z + TICK],
    'eje-t': [0, 0, TIME_Z + TICK],
    k00: [KEY_X + TICK, 0, zOf(0)], k80: [KEY_X + TICK, 0, zOf(128)], kff: [KEY_X + TICK, 0, zOf(255)], 'eje-k': [KEY_X + TICK, 0, 0],
    fila: [HALF_X + TUBE, yOf(0), zOf(KEY)], // al pie de la fila, quieta: la punta del tubo baila con pocas trazas
    cresta: [xOf(crest), yOf(f.abs[row + crest]) + 1.5 * TUBE, zOf(KEY)],
    // El velo, por su esquina delantera derecha en la vista 3/4 y por el centro del borde delantero en la frontal, donde
    // hay sitio encima para la etiqueta.
    velo: [i < MOVE[0] ? VEIL.w / 2 : 0, yOf(f.mejorFalso), VEIL.d / 2],
    cresta2: [xOf(crest2), yOf(f.abs[row + crest2]) + 1.5 * TUBE, zOf(KEY)],
  };
}
// Qué etiquetas se ven: ninguna mientras la cámara se mueve; la cresta desde el final del paso 1; en la vista frontal, sin
// el eje de candidatos y, como ya no se distinguen las filas, con la segunda cresta en vez de la fila del correcto.
function visible(i) {
  if (i >= MOVE[0] && i < MOVE[1]) return [];
  const ids = ['rho0', 'rho05', 'rho1', 'eje-rho', 't500', 't600', 't700', 'eje-t', 'velo'];
  if (i < MOVE[0]) ids.push('k00', 'k80', 'kff', 'eje-k', 'fila');
  else ids.push('cresta2');
  if (i >= PASOS[1][1]) ids.push('cresta');
  return ids;
}

export function labels(width = 1200, height = 826) {
  const ids = Object.keys(anchors(0));
  const frames = Array.from({ length: TOTAL }, (_, i) => {
    const f = fields.get(countAt(i)), cam = createCamera(worldCamera(cameraAt(i)), width, height), at = anchors(i);
    const anclas = ids.flatMap((id) => {
      const d = toWorld(...at[id]).map((c, k) => c - cam.eye[k]), z = d.reduce((s, c, k) => s + c * cam.forward[k], 0);
      const x = d.reduce((s, c, k) => s + c * cam.right[k], 0) / (z * cam.halfWidth);
      const y = d.reduce((s, c, k) => s + c * cam.above[k], 0) / (z * cam.halfHeight);
      return [(1 + x) / 2, (1 - y) / 2].map((v) => Math.round(v * 1e4) / 1e4);
    });
    const vis = visible(i);
    return { n: countAt(i), vista: i < MOVE[0] ? 0 : i < MOVE[1] ? 1 : 2, puesto: f.puesto, empates: f.empates, correcto: +f.peak[KEY].toFixed(3),
      muestra: f.at[KEY] + OFFSET, mejorFalso: +f.mejorFalso.toFixed(3), visibles: ids.map((id) => +vis.includes(id)).join(''), anclas };
  });
  return {
    fuente: 'web/data/nano-tinyaes.json (las N primeras trazas, muestras 440 a 739), CPA de web/js/model/cpa.js; lo escribe presentacion/cine/planos/v3.mjs',
    byte: BYTE, clave: `0x${KEY.toString(16).padStart(2, '0')}`, fps, ancho: width, alto: height, pasos: PASOS, ids, fotogramas: frames,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2] ?? fileURLToPath(new URL('../../video/v3.json', import.meta.url));
  writeFileSync(out, JSON.stringify(labels()));
  const last = (n) => fields.get(n);
  console.log(`Cifras del guion: bien. N = 5: |ρ| = 1 con ${last(5).empates} falsos empatados (puesto ${last(5).puesto} si cuentan en contra); `
    + `N = 20: puesto ${last(20).puesto}; desde N = ${firstStable}, siempre el primero; N = 400: ${last(400).peak[KEY].toFixed(3)} frente a ${last(400).mejorFalso.toFixed(3)}.`);
  console.log(`${TOTAL} fotogramas, ${needed.size} valores de N distintos → ${out}`);
}
