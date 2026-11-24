// Montaña de correlación del CPA: |ρ(k, t)| como superficie, con el tiempo en X, el candidato k
// en Z (0x00 al fondo) y |ρ| en Y, la fila del candidato correcto, el velo del mejor falso (el
// mayor |ρ| de los 255 candidatos falsos, el plano del vídeo V3 de cine/GUION.md) y el máximo
// global. Sin candidato correcto no hay falsos y no hay velo.
//
// mount(container, options) → { steps: 3, start, stop, step, update, dispose }
//   options.static  dibuja una sola vez el paso options.step (o el último), sin bucle.
//   options.step    vista: 0 general en 3/4 con vaivén, 1 baja de frente, 2 cenital.
//   options.data    datos iniciales, como en update(), sin transición.
//   options.showN   chip «N = … trazas» arriba a la izquierda (por defecto no: el deck ya
//                   lleva su contador).
// update({ rho, S, correct, n, offset }, { duration = 250 } = {})
//   rho: 256·S valores, fila k (con signo o sin él); S: muestras por fila; correct: 0–255 o
//   null; n: trazas; offset: muestra absoluta de la primera columna.
//
// Las etiquetas son HTML (CSS2DRenderer) de tamaño fijo en píxeles del escenario de 1920×1080:
// no escalan con el contenedor. El encuadre se calcula para que la maqueta llene el hueco que
// dejan, así se leen igual en el deck que en el panel de la demo.
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { PALETA, css } from '../paleta.js';

const ROWS = 256;
const rowTicks = [0, 128, 255];
const WIDTH = 11.2, DEPTH = 6.8, HEIGHT = 4.3;
const X = WIDTH / 2, Z = DEPTH / 2;
const RAD = Math.PI / 180;
const SWING = 8 * RAD;
// [azimut, elevación] de cada paso.
const views = [[23 * RAD, 30 * RAD], [0, 5 * RAD], [0, 85 * RAD]];
// Píxeles que piden las etiquetas alrededor de la maqueta en cada paso: [izq., der., arriba, abajo].
// A la derecha va «el correcto», al pie de su fila; el valor del candidato lo dice la cresta.
const RESERVE = [[10, 232, 52, 42], [44, 232, 52, 88], [10, 240, 52, 78]];
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const ease = t => 1 - (1 - t) ** 5;
const rowZ = k => -Z + DEPTH * k / (ROWS - 1);
const hex = k => '0x' + k.toString(16).padStart(2, '0');
const decimal = value => value.toFixed(2).replace('.', ',');
const viewIndex = n => clamp(Math.trunc(Number(n)) || 0, 0, 2);
// Aire alrededor: un 8 % en un contenedor grande y menos en uno pequeño (el panel de la demo).
const air = (size, ref) => 0.08 * size * Math.min(1, size / ref);

function validateData({ rho, S, correct = null, n, offset = 0 }) {
  if (!Number.isInteger(S) || S < 2) throw new Error('montana: S debe ser un entero ≥ 2 (muestras por fila).');
  if (!(rho instanceof Float32Array || rho instanceof Float64Array) || rho.length !== ROWS * S)
    throw new Error(`montana: rho debe ser un Float32Array o Float64Array de 256 × S = ${ROWS * S} valores.`);
  if (correct !== null && (!Number.isInteger(correct) || correct < 0 || correct >= ROWS))
    throw new Error('montana: correct debe ser un candidato de 0 a 255, o null.');
  if (!Number.isSafeInteger(n) || n <= 0 || !Number.isSafeInteger(offset))
    throw new Error('montana: n debe ser un entero positivo y offset, un entero.');
}

// De 3 a 5 marcas redondas en el eje de tiempo.
function timeTicks(samples, offset) {
  const end = offset + samples - 1;
  const decade = 10 ** Math.floor(Math.log10(samples / 3));
  const intervals = [0.5, 1, 2, 2.5, 5, 10].map(v => Math.max(1, Math.round(v * decade)));
  const count = spacing => Math.floor(end / spacing) - Math.ceil(offset / spacing) + 1;
  const valid = intervals.filter(spacing => count(spacing) >= 3 && count(spacing) <= 5);
  const spacing = (valid.length ? valid : intervals).reduce((a, b) =>
    Math.abs(Math.log(a * 3 / samples)) <= Math.abs(Math.log(b * 3 / samples)) ? a : b);
  const ticks = [];
  for (let t = Math.ceil(offset / spacing) * spacing; t <= end; t += spacing) ticks.push(t);
  return ticks;
}

function dynamic(array, size) {
  return new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage);
}

// Faldones de los cuatro lados: siguen el borde de la superficie hasta la peana.
function makeSkirt(columns, xs) {
  const source = [], indices = [], positions = [], normals = [];
  function side(count, point, nx, nz) {
    for (let j = 0; j < count; j++) {
      const index = point(j), vertex = source.length * 2;
      const x = xs[index % columns], z = rowZ(Math.floor(index / columns));
      source.push(index);
      positions.push(x, 0, z, x, 0, z);
      normals.push(nx, 0, nz, nx, 0, nz);
      if (j + 1 < count) indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
    }
  }
  side(columns, j => (ROWS - 1) * columns + j, 0, 1);
  side(ROWS, k => (ROWS - k) * columns - 1, 1, 0);
  side(columns, j => columns - 1 - j, 0, -1);
  side(ROWS, k => k * columns, -1, 0);
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', dynamic(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return { source, geometry };
}

// Rejilla de 256 filas × ⌈S / g⌉ columnas, con g = ⌈S / 160⌉ muestras por columna.
function buildGrid(samples) {
  const group = Math.ceil(samples / 160);
  const columns = Math.ceil(samples / group);
  const count = columns * ROWS;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const indices = new Uint16Array((columns - 1) * (ROWS - 1) * 6);
  const xs = new Float32Array(columns);
  const inverseDx = new Float32Array(columns);
  for (let j = 0; j < columns; j++) {
    const mid = (j * group + Math.min(samples, (j + 1) * group) - 1) / 2;
    xs[j] = -X + WIDTH * mid / (samples - 1);
  }
  xs[0] = -X;
  xs[columns - 1] = X;
  for (let j = 0; j < columns; j++) {
    inverseDx[j] = HEIGHT / (xs[Math.min(j + 1, columns - 1)] - xs[Math.max(0, j - 1)]);
  }
  let index = 0;
  for (let k = 0; k < ROWS; k++) {
    for (let j = 0; j < columns; j++) {
      const i = k * columns + j;
      positions[i * 3] = xs[j];
      positions[i * 3 + 2] = rowZ(k);
      if (j === columns - 1 || k === ROWS - 1) continue;
      indices[index++] = i;
      indices[index++] = i + columns;
      indices[index++] = i + 1;
      indices[index++] = i + 1;
      indices[index++] = i + columns;
      indices[index++] = i + columns + 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute('position', dynamic(positions, 3));
  geometry.setAttribute('normal', dynamic(normals, 3));
  geometry.setAttribute('color', dynamic(colors, 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, HEIGHT / 2, 0),
    Math.hypot(X, HEIGHT / 2, Z));
  const profile = new LineGeometry();
  profile.setPositions(new Float32Array(columns * 3));
  profile.attributes.instanceStart.data.setUsage(THREE.DynamicDrawUsage);
  return { samples, columns, group, xs, inverseDx, geometry, profile, positions, normals, colors,
    skirt: makeSkirt(columns, xs),
    current: new Float32Array(count), from: new Float32Array(count), to: new Float32Array(count) };
}

function contactTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = css(PALETA.tinta);
  ctx.filter = 'blur(13px)';
  ctx.fillRect(36, 37, 312, 182);
  return new THREE.CanvasTexture(canvas);
}

function segments(points) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

// La clase base .etiqueta-3d va en el elemento visible, no en el ancla de tamaño cero: si no,
// el estilo de píldora del deck pinta píldoras vacías. Tamaños fijos en px del escenario.
function sceneStyles() {
  const style = document.createElement('style');
  const shadow = `0 1px 2px ${css(PALETA.tinta)}0f,0 6px 18px -6px ${css(PALETA.tinta)}29`;
  style.textContent = `
    .montana-stage { position:absolute; inset:0; overflow:hidden; isolation:isolate; font:inherit; }
    .montana-stage canvas,.montana-labels { position:absolute; inset:0; display:block; }
    .montana-labels { pointer-events:none; font:inherit; }
    .montana-label { width:0; height:0; font:inherit; }
    .montana-label > .etiqueta-3d { position:absolute; left:0; top:0; margin:0; max-width:none;
      white-space:nowrap; font:inherit; font-variant-numeric:tabular-nums; line-height:1.2;
      letter-spacing:-.01em; font-size:22px; font-weight:500; color:var(--c-eje, #515154);
      background:none; padding:0 .15em; border:0; border-radius:0; box-shadow:none;
      text-shadow:0 0 3px #fff,0 0 7px #fff,0 0 12px #fff; }
    .montana-title > .etiqueta-3d { font-size:23px; font-weight:600; color:${css(PALETA.tinta)}; }
    .montana-pill > .etiqueta-3d,.montana-correct > .etiqueta-3d,.montana-n {
      text-shadow:none; font-size:24px; font-weight:550; color:${css(PALETA.tinta)}; background:${css(PALETA.superficie)};
      border:1px solid ${css(PALETA.linea)}; border-radius:999px; padding:.34em .7em; box-shadow:${shadow}; }
    .montana-correct > .etiqueta-3d { color:${css(PALETA.acento)}; font-weight:600;
      background:var(--c-acento-suave, #e8f1fc); border-color:${css(PALETA.acento)}47; }
    .montana-label > i { position:absolute; left:0; top:0; height:1.5px;
      background:${css(PALETA.tenue)}99; transform-origin:left center; }
    .montana-correct > i { background:${css(PALETA.acento)}b3; }
    .montana-n { position:absolute; z-index:1; white-space:nowrap; line-height:1.2;
      font-variant-numeric:tabular-nums; letter-spacing:-.01em; pointer-events:none; }
  `;
  return style;
}

export function mount(container, options = {}) {
  if (options.data) validateData(options.data);
  const fixed = options.static === true;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(PALETA.fondo, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const previous = { position: container.style.position, role: container.getAttribute('role'),
    label: container.getAttribute('aria-label'), ready: container.dataset.ready };
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.setAttribute('role', 'img');
  container.setAttribute('aria-label', 'Superficie de correlación por tiempo y candidato, aún sin datos.');
  delete container.dataset.ready;
  const root = document.createElement('div');
  root.className = 'montana-stage';
  const labels = new CSS2DRenderer();
  labels.sortObjects = false;
  labels.domElement.className = 'montana-labels';
  root.append(sceneStyles(), renderer.domElement, labels.domElement);
  // Chip de N, fuera del CSS2DRenderer.
  const chip = options.showN ? document.createElement('div') : null;
  if (chip) {
    chip.className = 'montana-n';
    chip.hidden = true;
    root.append(chip);
  }
  container.append(root);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(25, 16 / 9, 0.1, 2500);
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = pmrem.fromScene(room, 0.04);
  scene.environment = studio.texture;
  scene.environmentIntensity = 0.62;
  room.dispose();
  pmrem.dispose();
  const keyLight = new THREE.DirectionalLight(PALETA.superficie, 2.05);
  keyLight.position.set(-4, 9, 5);
  scene.add(keyLight);

  const shadowMap = contactTexture();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 9.7),
    new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, opacity: 0.18, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.05, -0.24, 0.06);
  shadow.renderOrder = -2;
  const base = new THREE.Mesh(new RoundedBoxGeometry(WIDTH + 0.32, 0.19, DEPTH + 0.32, 3, 0.08),
    new THREE.MeshStandardMaterial({ color: PALETA.superficie, roughness: 0.64 }));
  base.position.y = -0.108;
  scene.add(shadow, base);

  let grid = buildGrid(options.data?.S ?? 300);
  const field = new THREE.Mesh(grid.geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }));
  const skirt = new THREE.Mesh(grid.skirt.geometry,
    new THREE.MeshStandardMaterial({ color: 0xe8e8ed, roughness: 0.9 }));
  skirt.frustumCulled = false;
  const lineMaterial = new LineMaterial({ color: PALETA.acento, linewidth: 3.5, toneMapped: false });
  const ridge = new Line2(grid.profile, lineMaterial);
  ridge.frustumCulled = false;
  const summit = new THREE.Mesh(new THREE.SphereGeometry(0.082, 20, 12),
    new THREE.MeshStandardMaterial({ color: PALETA.acento, roughness: 0.27 }));
  ridge.visible = summit.visible = false;
  const noise = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, DEPTH),
    new THREE.MeshBasicMaterial({ color: PALETA.superficie, transparent: true, opacity: 0.45,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  noise.rotation.x = -Math.PI / 2;
  noise.visible = false;
  const rim = new THREE.LineLoop(segments([-X,-Z,0, X,-Z,0, X,Z,0, -X,Z,0]),
    new THREE.LineBasicMaterial({ color: PALETA.tenue, transparent: true, depthWrite: false }));
  noise.add(rim);
  scene.add(field, skirt, noise, ridge, summit);

  const axisInk = () => new THREE.LineBasicMaterial({ color: PALETA.linea, toneMapped: false,
    transparent: true, depthWrite: false });
  const footY = 0.008, axisX = X + 0.12, axisZ = Z + 0.12;
  const floorAxes = new THREE.LineSegments(segments([-X,footY,axisZ, axisX,footY,axisZ,
    axisX,footY,axisZ, axisX,footY,-Z]), axisInk());
  const ruleX = -X - 0.12;
  const rule = [ruleX,0,0, ruleX,HEIGHT,0];
  for (const value of [0, 0.5, 1]) rule.push(ruleX-0.12,value*HEIGHT,0, ruleX,value*HEIGHT,0);
  const ruler = new THREE.LineSegments(segments(rule), axisInk());
  const candidateMarks = rowTicks.map(k => {
    const tick = new THREE.LineSegments(segments([axisX,footY,rowZ(k), axisX+0.1,footY,rowZ(k)]), axisInk());
    scene.add(tick);
    return tick;
  });
  const timeMarks = new THREE.LineSegments(new THREE.BufferGeometry(), floorAxes.material);
  scene.add(floorAxes, ruler, timeMarks);

  let width = 0, height = 0, marginX = 0, marginY = 0, running = false, disposed = false, pending = 0;
  let clock = 0, lastFrame = 0, dataTween = null, viewTween = null;
  let dirty = true, measure = true, correct = null, hasData = false, offset = 0;
  let view = viewIndex(options.step ?? (fixed ? 2 : 0));
  // Cámara: [azimut, elevación, distancia, desplazamiento x, desplazamiento y] (px).
  const pose = [0, 0, 28, 0, 0];
  let fits = views.map(() => [28, 0, 0]);
  const weights = views.map((_, i) => Number(i === view));
  let noiseY = 0, noiseAlpha = 0, goalY = 0, goalAlpha = 0;
  let goalPeak = 0, paintedFlat = -1, chipW = 0, chipH = 0;
  const rowAlpha = Float32Array.of(1, 1, 1), targetRowAlpha = rowAlpha.slice();
  const entries = [];
  const screen = new THREE.Vector3();
  const focus = new THREE.Vector3(0, 1.38, 0);
  const lowColor = new THREE.Color(0xe8e8ed);
  const highColor = new THREE.Color(PALETA.acento);
  const corners = [];
  for (const x of [-X - 0.16, X + 0.16]) for (const y of [-0.2, HEIGHT]) for (const z of [-Z - 0.16, Z + 0.16])
    corners.push(new THREE.Vector3(x, y, z));

  function annotation(kind, text, x, y, z, leader = false) {
    const el = document.createElement('div');
    el.className = 'montana-label montana-' + kind;
    const span = document.createElement('span');
    span.className = 'etiqueta-3d';
    span.textContent = text;
    const guide = leader ? document.createElement('i') : null;
    if (guide) el.append(guide);
    el.append(span);
    labels.domElement.append(el);
    const object = new CSS2DObject(el);
    object.position.set(x, y, z);
    object.center.set(0, 0);
    scene.add(object);
    const item = { object, span, guide, kind, w: 0, h: 0, alpha: 1, dx: 0, dy: 0 };
    entries.push(item);
    return item;
  }
  const timeLabels = Array.from({ length: 5 }, () => annotation('tick', '', 0, footY, axisZ));
  const keyLabels = rowTicks.map(k => annotation('tick', hex(k), axisX, footY, rowZ(k)));
  const heightLabels = [0, 0.5, 1].map(v => annotation('tick', String(v).replace('.', ','), ruleX, v*HEIGHT, 0));
  // Títulos en palabras de todos los días: |ρ| es el «parecido».
  const timeTitle = annotation('title', 'tiempo', 0, footY, axisZ);
  const keyTitle = annotation('title', 'candidato', axisX, footY, 0);
  const heightTitle = annotation('title', 'parecido', ruleX, HEIGHT, 0);
  // La regla de |ρ| se coloca a la profundidad del correcto, para leer su pico contra ella.
  function placeRuler(row) {
    const z = rowZ(row);
    ruler.position.z = z;
    for (const item of [...heightLabels, heightTitle]) item.object.position.z = z;
  }
  placeRuler(0);
  const correctLabel = annotation('correct', '', X, 0, 0, true);
  const peakLabel = annotation('pill', '', 0, 0, 0, true);
  const noiseLabel = annotation('pill', '', 0, 0, -Z, true);
  let tickCount = 0;

  function setTimeScale() {
    const ticks = timeTicks(grid.samples, offset);
    const points = [];
    tickCount = ticks.length;
    timeLabels.forEach((item, i) => {
      if (i >= tickCount) return;
      const x = -X + WIDTH * (ticks[i] - offset) / (grid.samples - 1);
      item.object.position.x = x;
      item.span.textContent = String(ticks[i]);
      points.push(x,footY,axisZ, x,footY,axisZ+0.1);
    });
    timeMarks.geometry.dispose();
    timeMarks.geometry = segments(points);
    measure = true;
  }

  function paintField() {
    const { columns, current, positions, normals, colors, inverseDx } = grid;
    // En la vista cenital se suaviza el relieve: se lee como mapa de calor.
    const relief = 1 - 0.7 * weights[2];
    paintedFlat = weights[2];
    let peak = 0;
    for (let k = 0; k < ROWS; k++) {
      const start = k * columns;
      const back = k > 0 ? start - columns : start;
      const front = k < ROWS - 1 ? start + columns : start;
      const inverseDz = HEIGHT * (ROWS - 1) / (DEPTH * ((front - back) / columns));
      for (let j = 0; j < columns; j++) {
        const i = start + j, p = i * 3, v = current[i];
        if (v > current[peak]) peak = i;
        positions[p + 1] = v * HEIGHT;
        const nx = (current[j ? i - 1 : i] - current[j < columns - 1 ? i + 1 : i]) * inverseDx[j] * relief;
        const nz = (current[back + j] - current[front + j]) * inverseDz * relief;
        const length = 1 / Math.sqrt(1 + nx * nx + nz * nz);
        normals[p] = nx * length;
        normals[p + 1] = length;
        normals[p + 2] = nz * length;
        // Rampa fija, no relativa al máximo: gris hasta 0,05 y azul a partir de 0,7.
        const t = clamp((v - 0.05) / 0.65, 0, 1);
        const s = t * t * (3 - 2 * t);
        colors[p] = mix(lowColor.r, highColor.r, s);
        colors[p + 1] = mix(lowColor.g, highColor.g, s);
        colors[p + 2] = mix(lowColor.b, highColor.b, s);
      }
    }
    for (const name of ['position', 'normal', 'color']) grid.geometry.attributes[name].needsUpdate = true;
    const edge = grid.skirt.geometry.attributes.position;
    for (let i = 0; i < grid.skirt.source.length; i++) edge.setY(2*i + 1, current[grid.skirt.source[i]] * HEIGHT);
    edge.needsUpdate = true;
    if (hasData) {
      // Al asentarse la malla prevalece el máximo del dato, incluso en empates de Float32.
      summit.position.fromArray(positions, (dataTween ? peak : goalPeak) * 3);
      summit.position.y += 0.055;
      peakLabel.object.position.copy(summit.position);
    }
    if (correct !== null) {
      const attrs = grid.profile.attributes;
      for (let j = 0; j < columns; j++) {
        const y = current[correct * columns + j] * HEIGHT + 0.024;
        if (j < columns - 1) attrs.instanceStart.setXYZ(j, grid.xs[j], y, rowZ(correct));
        if (j > 0) attrs.instanceEnd.setXYZ(j-1, grid.xs[j], y, rowZ(correct));
        if (j === columns - 1) correctLabel.object.position.set(X, y, rowZ(correct));
      }
      attrs.instanceStart.data.needsUpdate = true;
    }
    dirty = false;
  }

  function sampleField() {
    if (!dataTween) return;
    const t = clamp((clock - dataTween.at) / dataTween.duration, 0, 1);
    const amount = ease(t);
    for (let i = 0; i < grid.current.length; i++) grid.current[i] = mix(grid.from[i], grid.to[i], amount);
    noiseY = mix(dataTween.y, goalY, amount);
    noiseAlpha = mix(dataTween.alpha, goalAlpha, amount);
    for (let i = 0; i < rowAlpha.length; i++) rowAlpha[i] = mix(dataTween.rows[i], targetRowAlpha[i], amount);
    if (t === 1) dataTween = null;
    dirty = true;
  }

  const swinging = () => !fixed && !motion.matches;
  function aim(yaw, pitch, distance) {
    camera.position.setFromSphericalCoords(distance, Math.PI / 2 - pitch, yaw).add(focus);
    camera.lookAt(focus);
    camera.updateMatrixWorld();
  }
  // Rectángulo en px que ocupa la maqueta (peana incluida, |ρ| hasta 1) desde esos azimuts.
  function bounds(yaws, pitch, distance) {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const yaw of yaws) {
      aim(yaw, pitch, distance);
      for (const corner of corners) {
        screen.copy(corner).project(camera);
        const x = (screen.x + 1) * width / 2, y = (1 - screen.y) * height / 2;
        box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
      }
    }
    return box;
  }
  // Distancia y desplazamiento de cada paso para que la maqueta llene el hueco que dejan las
  // etiquetas y el aire. La escala vertical no depende de los datos: el encuadre no salta.
  function fitViews() {
    camera.clearViewOffset();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    fits = views.map(([yaw, pitch], i) => {
      const [left, right, up, down] = RESERVE[i];
      const top = up + (chip ? 60 : 0);  // el chip de N mide unos 47 px de alto
      const w = Math.max(width - left - right - 2 * marginX, width * 0.3);
      const h = Math.max(height - top - down - 2 * marginY, height * 0.3);
      const yaws = i === 0 && swinging() ? [yaw - SWING, yaw, yaw + SWING] : [yaw];
      let distance = 28, box = bounds(yaws, pitch, distance);
      for (let pass = 0; pass < 5; pass++) {
        distance *= Math.max((box[2] - box[0]) / w, (box[3] - box[1]) / h);
        box = bounds(yaws, pitch, distance);
      }
      return [distance, (box[0] + box[2] - width - left + right) / 2, (box[1] + box[3] - height - top + down) / 2];
    });
  }

  function sampleCamera() {
    const swing = swinging() && view === 0 ? SWING * Math.sin(clock * Math.PI / 10000) : 0;
    const t = viewTween ? clamp((clock - viewTween.at) / 780, 0, 1) : 1;
    const amount = ease(t);
    const target = [views[view][0] + swing, views[view][1], ...fits[view]];
    for (let i = 0; i < pose.length; i++) pose[i] = viewTween ? mix(viewTween.pose[i], target[i], amount) : target[i];
    for (let i = 0; i < weights.length; i++)
      weights[i] = viewTween ? mix(viewTween.weights[i], Number(i === view), amount) : Number(i === view);
    if (t === 1) viewTween = null;
    aim(pose[0], pose[1], pose[2]);
    camera.setViewOffset(width, height, pose[3], pose[4], width, height);
  }

  function sizeLabels() {
    // Se miden también las etiquetas que empezarán a aparecer en la siguiente vista.
    for (const item of entries) item.object.element.style.display = '';
    for (const item of entries) {
      item.w = item.span.offsetWidth;
      item.h = item.span.offsetHeight;
    }
    if (chip) {
      chipW = chip.offsetWidth;
      chipH = chip.offsetHeight;
    }
    measure = false;
  }

  function layout() {
    if (measure) sizeLabels();
    const pitched = 1 - weights[2], withKeys = 1 - weights[1];
    for (let i = 0; i < timeLabels.length; i++) {
      const item = timeLabels[i];
      item.alpha = Number(hasData && i < tickCount);
      item.dx = 0; item.dy = 23 + 18 * weights[1];
    }
    timeMarks.visible = hasData;
    for (let i = 0; i < keyLabels.length; i++) {
      const item = keyLabels[i];
      item.alpha = rowAlpha[i] * withKeys;
      item.dx = 16 + item.w / 2; item.dy = 3;
      candidateMarks[i].visible = item.alpha > 0.001;
      candidateMarks[i].material.opacity = item.alpha;
    }
    for (const item of heightLabels) {
      item.alpha = pitched; item.dx = -15 - item.w / 2; item.dy = 0;
    }
    timeTitle.alpha = Number(hasData);
    timeTitle.dx = 0; timeTitle.dy = 57 + 18 * weights[1];
    keyTitle.alpha = withKeys;
    keyTitle.dx = 46 + keyTitle.w / 2; keyTitle.dy = 33;
    heightTitle.alpha = pitched; heightTitle.dx = -15; heightTitle.dy = -31;
    correctLabel.alpha = Number(correct !== null);
    correctLabel.dx = 28 + correctLabel.w / 2; correctLabel.dy = -17;
    noiseLabel.alpha = noiseAlpha * pitched;
    noiseLabel.dx = 0; noiseLabel.dy = -52;
    peakLabel.alpha = Number(hasData);
    screen.copy(peakLabel.object.position).project(camera);
    peakLabel.dx = (screen.x > 0 ? -1 : 1) * (30 + peakLabel.w / 2);
    peakLabel.dy = -61;

    // Colocación voraz: primero las escalas y luego las píldoras, cada una en el hueco libre
    // más cercano a su sitio. La guía sigue anclada al dato.
    const occupied = [];
    if (chip && !chip.hidden) occupied.push([marginX, marginY, marginX + chipW, marginY + chipH]);
    const gap = 7;
    for (const item of entries) {
      const { object, span, guide, w, h, alpha } = item;
      object.visible = alpha > 0.001;
      if (!object.visible) continue;
      object.element.style.opacity = String(alpha);
      screen.copy(object.position).project(camera);
      const ax = (screen.x + 1) * width / 2, ay = (1 - screen.y) * height / 2;
      const left = marginX + w / 2, right = width - marginX - w / 2;
      const top = marginY + h / 2, bottom = height - marginY - h / 2;
      const desiredX = clamp(ax + item.dx, left, right);
      const desiredY = clamp(ay + item.dy, top, bottom);
      let bx = desiredX, by = desiredY, best = Infinity;
      // Los bordes de los rótulos previos delimitan todos los huecos posibles.
      const xs = [desiredX], ys = [desiredY];
      const intersects = (x, y, box) => x+w/2+gap > box[0] && x-w/2-gap < box[2]
        && y+h/2+gap > box[1] && y-h/2-gap < box[3];
      if (occupied.some(box => intersects(bx, by, box))) {
        for (const box of occupied) {
          xs.push(box[0] - gap - w/2, box[2] + gap + w/2);
          ys.push(box[1] - gap - h/2, box[3] + gap + h/2);
        }
        for (const x of xs) for (const y of ys) {
          const cost = (x-desiredX)**2 + (y-desiredY)**2;
          if (cost >= best || x < left || x > right || y < top || y > bottom) continue;
          if (occupied.some(box => intersects(x, y, box))) continue;
          bx = x; by = y; best = cost;
        }
      }
      occupied.push([bx-w/2, by-h/2, bx+w/2, by+h/2]);
      const dx = bx - ax, dy = by - ay;
      span.style.transform = 'translate(' + (dx - w/2) + 'px,' + (dy - h/2) + 'px)';
      if (guide) {
        const fraction = Math.min(w / (2 * Math.abs(dx)), h / (2 * Math.abs(dy)), 1);
        guide.style.width = Math.max(0, Math.hypot(dx,dy) * (1-fraction)) + 'px';
        guide.style.transform = 'rotate(' + Math.atan2(dy,dx) + 'rad)';
      }
    }
    ruler.visible = pitched > 0.001;
    ruler.material.opacity = pitched;
    lineMaterial.opacity = 1 - 0.6 * weights[2];
    lineMaterial.transparent = weights[2] > 0.001;
    noise.visible = noiseLabel.alpha > 0.001;
    noise.material.opacity = 0.45 * noiseLabel.alpha;
    rim.material.opacity = 0.7 * noiseLabel.alpha;
  }

  function draw() {
    if (disposed || !width || !height) return;
    sampleField();
    sampleCamera();
    if (Math.abs(weights[2] - paintedFlat) > 1e-3) dirty = true;
    if (dirty) paintField();
    noise.position.y = noiseY * HEIGHT;
    noiseLabel.object.position.y = noise.position.y;
    layout();
    renderer.render(scene, camera);
    labels.render(scene, camera);
    if (container.dataset.ready !== '1') container.dataset.ready = '1';
  }

  function update(data, { duration = 250 } = {}) {
    if (disposed) return;
    validateData(data);
    const { rho, S, correct: key = null, n, offset: first = 0 } = data;
    const changedSize = S !== grid.samples;
    if (changedSize) {
      grid.geometry.dispose();
      grid.profile.dispose();
      grid.skirt.geometry.dispose();
      grid = buildGrid(S);
      field.geometry = grid.geometry;
      skirt.geometry = grid.skirt.geometry;
      ridge.geometry = grid.profile;
    }
    if (offset !== first || changedSize || tickCount === 0) {
      offset = first;
      setTimeScale();
    }
    // current guarda el último relieve dibujado, también si llega otro lote a mitad.
    grid.from.set(grid.current);
    let max = -1, maxRow = 0, bestFalse = 0;
    for (let k = 0; k < ROWS; k++) {
      for (let j = 0; j < grid.columns; j++) {
        let value = 0;
        const start = j * grid.group, end = Math.min(S, start + grid.group);
        for (let t = start; t < end; t++) {
          const magnitude = Math.abs(rho[k*S+t]);
          if (magnitude > value && Number.isFinite(magnitude)) value = Math.min(1, magnitude);
        }
        grid.to[k*grid.columns+j] = value;
        if (k !== key && value > bestFalse) bestFalse = value;
        if (value > max) {
          max = value;
          maxRow = k;
          goalPeak = k * grid.columns + j;
        }
      }
    }
    goalY = bestFalse;
    goalAlpha = Number(key !== null);
    for (let i = 0; i < rowTicks.length; i++) targetRowAlpha[i] = Number(key === null || Math.abs(rowTicks[i] - key) >= 20);
    const ms = fixed || motion.matches || changedSize || !hasData ? 0 : duration;
    dataTween = ms > 0 && Number.isFinite(ms)
      ? { at: clock, duration: ms, y: noiseY, alpha: noiseAlpha, rows: rowAlpha.slice() } : null;
    if (!dataTween) {
      grid.current.set(grid.to);
      noiseY = goalY;
      noiseAlpha = goalAlpha;
      rowAlpha.set(targetRowAlpha);
    }
    correct = key;
    placeRuler(key ?? maxRow);
    hasData = summit.visible = true;
    ridge.visible = key !== null;
    // Sin el valor: ya lo pone la etiqueta de la cresta, y dos «0x2b» en sitios distintos despistan.
    correctLabel.span.textContent = key === null ? '' : 'el correcto';
    peakLabel.span.textContent = hex(maxRow) + ' · parecido ' + decimal(max);
    // El velo es el falso con más suerte: lo que puede hacer el azar, como la franja del juego de las monedas.
    noiseLabel.span.textContent = 'lo que puede hacer el azar · hasta ' + decimal(bestFalse);
    if (chip) {
      chip.hidden = false;
      chip.textContent = n + ' trazas';
    }
    container.setAttribute('aria-label', 'Parecido de cada candidato en cada instante, con ' + n + ' trazas'
      + '. Máximo ' + decimal(max) + ' en ' + hex(maxRow)
      + (key === null ? '.' : '; el candidato correcto es ' + hex(key) + '.'));
    dirty = measure = true;
    if (fixed) draw();
    else wake();
  }

  function resize() {
    if (disposed) return;
    const w = root.clientWidth, h = root.clientHeight;
    if (w === width && h === height) return;
    width = w; height = h;
    if (!w || !h) return;
    marginX = air(w, 1600);
    marginY = air(h, 900);
    if (chip) {
      chip.style.left = marginX + 'px';
      chip.style.top = marginY + 'px';
    }
    renderer.setSize(w, h);
    labels.setSize(w, h);
    lineMaterial.resolution.set(w, h);
    measure = true;
    fitViews();
    draw();
  }

  function frame(now) {
    pending = 0;
    if (!running) return;
    clock += now - lastFrame;
    lastFrame = now;
    draw();
    if (viewTween || dataTween || (view === 0 && swinging())) pending = requestAnimationFrame(frame);
  }
  function wake() {
    if (running && !pending) {
      lastFrame = performance.now();
      pending = requestAnimationFrame(frame);
    }
  }
  function start() {
    if (disposed || fixed || running) return;
    running = true;
    draw();
    wake();
  }
  function stop() {
    running = false;
    if (pending) cancelAnimationFrame(pending);
    pending = 0;
  }
  function step(n) {
    if (disposed) return;
    const next = viewIndex(n);
    if (next === view) return;
    viewTween = fixed || motion.matches ? null : { at: clock, pose: pose.slice(), weights: weights.slice() };
    view = next;
    if (fixed || motion.matches) draw();
    else wake();
  }
  function changeMotion() {
    if (motion.matches) {
      viewTween = dataTween = null;
      grid.current.set(grid.to);
      noiseY = goalY; noiseAlpha = goalAlpha; dirty = true;
      rowAlpha.set(targetRowAlpha);
    }
    if (width && height) fitViews();
    draw();
    wake();
  }
  function fontsReady() {
    if (disposed || !width || !height) return;
    measure = true;
    layout();
    labels.render(scene, camera);
  }
  setTimeScale();
  if (options.data) update(options.data, { duration: 0 });
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  motion.addEventListener('change', changeMotion);
  document.fonts?.addEventListener('loadingdone', fontsReady);

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    observer.disconnect();
    motion.removeEventListener('change', changeMotion);
    document.fonts?.removeEventListener('loadingdone', fontsReady);
    const resources = new Set();
    scene.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) resource.dispose();
    scene.environment = null;
    studio.dispose();
    shadowMap.dispose();
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
    root.remove();
    container.style.position = previous.position;
    for (const [attribute, value] of [['role', previous.role], ['aria-label', previous.label], ['data-ready', previous.ready]]) {
      if (value == null) container.removeAttribute(attribute);
      else container.setAttribute(attribute, value);
    }
  }
  return { steps: 3, start, stop, step, update, dispose };
}
