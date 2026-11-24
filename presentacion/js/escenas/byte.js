// Escena «byte»: de dónde sale la fuga. Un byte del mensaje (texto claro p) se combina con
// el de la clave k (XOR), pasa por la S-box y su número de unos (peso de Hamming) llena una barra
// de consumo (modelo en media, no una medida). Ejemplo del FIPS-197: p = 0x32,
// k = 0x2b; todos los valores se calculan con SBOX y HW de web/js/model/aes.js.
//
// Pasos: 0 p y k · 1 XOR · 2 S-box y salida · 3 unos encendidos y barra ·
// 4 bucle de 8 textos claros con la tira de pesos (sin bucle en estático o con
// movimiento reducido). update({ p }) fija otro texto claro (0–255) y, en el
// paso 4, para el bucle hasta el siguiente step().
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETA, css } from '../paleta.js';
import { HW, SBOX } from '../../../web/js/model/aes.js';

const STEPS = 5;
const KEY = 0x2b;
const SEQUENCE = [0x32, 0x11, 0x30, 0x88, 0x40, 0x43, 0x56, 0xa8];
const INTERVAL = 1200;
const DATA_DURATION = 460;
const STEP_DURATION = 760;
const BIT_PITCH = 0.69;
const CELL_PITCH = 0.187;
const METER_PITCH = 0.36;
const HISTORY_PITCH = 0.322;
const BASELINE = -1.93;
const CAMERA_FOV = 20;
const CAMERA_YAW = THREE.MathUtils.degToRad(20);
const CAMERA_ELEVATION = THREE.MathUtils.degToRad(16);
// Encuadre por paso: centro (x, y), ancho visible, fracción del alto 16:9 que
// ocupa el contenido con su margen y huecos entre columnas que se ven. En 16:9
// manda el ancho; en un contenedor más apaisado (la diapositiva le da unos
// 1760×612) manda el alto, y las columnas se separan para llenar el ancho.
const FRAMES = [
  [-7, 1.80, 10.8, 0.82, 0],
  [-7, 0.74, 13.6, 0.95, 0],
  [-1.33, 0.45, 17.65, 0.84, 2],
  [-0.52, -0.16, 19.45, 0.89, 3],
  [1.00, -0.07, 22.35, 0.79, 4],
];

const hex = (value) => `0x${value.toString(16).padStart(2, '0')}`;
const bitAt = (value, index) => (value >> (7 - index)) & 1;
const unit = (value) => THREE.MathUtils.clamp(value, 0, 1);
const easeOutQuint = (value) => 1 - (1 - value) ** 5;
const bitOffset = (index) => (index - 3.5) * BIT_PITCH;
const cellX = (index) => ((index & 15) - 7.5) * CELL_PITCH;
const cellY = (index) => (7.5 - (index >> 4)) * CELL_PITCH;
const byteValues = (p) => {
  const xor = p ^ KEY;
  const output = SBOX[xor];
  return { p, xor, output, weight: HW[output] };
};
const HISTORY = SEQUENCE.map(byteValues);

function inlineGlyph(pathData) {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  const path = document.createElementNS(namespace, 'path');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  Object.assign(svg.style, { width: '0.72em', height: '0.72em', verticalAlign: 'middle' });
  path.setAttribute('d', pathData);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.05');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

const xorGlyph = () => inlineGlyph('M11 6a5 5 0 1 1-10 0 5 5 0 1 1 10 0ZM6 3.5v5M3.5 6h5');
const arrowGlyph = () => inlineGlyph('M1 6h10M7.5 2.5 11 6l-3.5 3.5');

function hexField(heading, ...prefix) {
  const value = document.createElement('span');
  value.style.fontVariantNumeric = 'tabular-nums';
  heading.append(...prefix, value);
  return value;
}

function roundedOutline(path, width, height, radius, x = 0) {
  const left = x - width / 2;
  const right = x + width / 2;
  const bottom = -height / 2;
  const top = height / 2;
  path.moveTo(left + radius, bottom);
  path.lineTo(right - radius, bottom);
  path.quadraticCurveTo(right, bottom, right, bottom + radius);
  path.lineTo(right, top - radius);
  path.quadraticCurveTo(right, top, right - radius, top);
  path.lineTo(left + radius, top);
  path.quadraticCurveTo(left, top, left, top - radius);
  path.lineTo(left, bottom + radius);
  path.quadraticCurveTo(left, bottom, left + radius, bottom);
  return path;
}

// La textura de contacto se comparte entre las carcasas y se desvanece en los bordes.
function contactTexture() {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = Math.abs(2 * x / (size - 1) - 1);
      const v = Math.abs(2 * y / (size - 1) - 1);
      const radius = Math.hypot(Math.max(0, u - 0.63) / 0.37, Math.max(0, v - 0.19) / 0.81);
      const alpha = (1 - THREE.MathUtils.smoothstep(radius, 0, 1)) ** 2;
      const offset = 4 * (y * size + x);
      pixels[offset] = (PALETA.tinta >> 16) & 255;
      pixels[offset + 1] = (PALETA.tinta >> 8) & 255;
      pixels[offset + 2] = PALETA.tinta & 255;
      pixels[offset + 3] = Math.round(47 * alpha);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function mount(container, options = {}) {
  const staticMode = options.static === true;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 130);
  const cameraDirection = new THREE.Vector3(
    Math.sin(CAMERA_YAW) * Math.cos(CAMERA_ELEVATION),
    Math.sin(CAMERA_ELEVATION),
    Math.cos(CAMERA_YAW) * Math.cos(CAMERA_ELEVATION),
  );
  const halfFovTangent = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearAlpha(0);
  const canvas = renderer.domElement;
  const labelRenderer = new CSS2DRenderer();
  const overlay = labelRenderer.domElement;
  for (const element of [canvas, overlay]) {
    Object.assign(element.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    element.setAttribute('aria-hidden', 'true');
  }
  Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });

  const oldPosition = container.style.position;
  const oldRole = container.getAttribute('role');
  const oldLabel = container.getAttribute('aria-label');
  const oldReady = container.dataset.ready;
  const positionAdjusted = getComputedStyle(container).position === 'static';
  if (positionAdjusted) container.style.position = 'relative';
  container.setAttribute('role', 'img');
  container.append(canvas, overlay);

  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, 0.04);
  room.traverse((object) => { if (object.isInstancedMesh) object.dispose(); });
  room.dispose();
  pmrem.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.78;
  const keyLight = new THREE.DirectionalLight(PALETA.superficie, 1.82);
  keyLight.position.set(-4, 7, 10);
  scene.add(keyLight);

  const resources = new Set();
  const labels = [];
  const own = (resource) => {
    resources.add(resource);
    return resource;
  };
  const color = (value) => new THREE.Color(value);
  const accent = color(PALETA.acento);
  const white = color(PALETA.superficie);
  const pale = color(PALETA.fondo);
  const lineColor = color(PALETA.linea);
  const grayKey = lineColor.clone().lerp(color(PALETA.tenue), 0.08);
  const gridColor = lineColor.clone().lerp(color(PALETA.tenue), 0.075);
  const bandColor = gridColor.clone().lerp(accent, 0.28);
  const meterIdle = pale.clone().lerp(lineColor, 0.29);
  const historyGray = lineColor.clone().lerp(color(PALETA.tenue), 0.12);
  const material = (value, roughness) =>
    own(new THREE.MeshStandardMaterial({ color: value, roughness }));
  const ceramic = material(PALETA.superficie, 0.46);
  const keyMaterial = material(PALETA.superficie, 0.41);
  const recessMaterial = material(lineColor.clone().lerp(color(PALETA.tenue), 0.16), 0.61);
  const gridMaterial = material(PALETA.superficie, 0.57);
  const gridBed = material(lineColor.clone().lerp(color(PALETA.tenue), 0.24), 0.62);
  const trackMaterial = material(pale.clone().lerp(lineColor, 0.19), 0.68);
  const flowMaterial = material(PALETA.tenue, 0.67);
  const shadowMaterial = own(new THREE.MeshBasicMaterial({
    color: PALETA.superficie, map: own(contactTexture()),
    transparent: true, depthWrite: false, toneMapped: false,
  }));

  const rounded = (w, h, d, radius, segments = 1) =>
    own(new RoundedBoxGeometry(w, h, d, segments, radius));
  const unitBox = own(new THREE.BoxGeometry());
  const shadowPlane = own(new THREE.PlaneGeometry());
  const trayGeometry = rounded(5.73, 0.89, 0.26, 0.12, 2);
  const bezel = roundedOutline(new THREE.Shape(), 5.69, 0.85, 0.113);
  for (let i = 0; i < 8; i++) {
    bezel.holes.push(roundedOutline(new THREE.Path(), 0.654, 0.661, 0.062, bitOffset(i)));
  }
  const bezelGeometry = own(new THREE.ExtrudeGeometry(bezel, {
    depth: 0.137, bevelSize: 0.009, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 4,
  }));
  const socketGeometry = rounded(0.65, 0.66, 0.065, 0.032);
  const stemGeometry = rounded(0.49, 0.48, 0.216, 0.034);
  const capGeometry = rounded(0.613, 0.608, 0.172, 0.071, 2);
  const rimGeometry = rounded(0.64, 0.635, 0.085, 0.04);
  const tileGeometry = rounded(0.161, 0.161, 0.044, 0.021);
  const meterGeometry = rounded(0.58, 0.275, 0.081, 0.038);
  const historyGeometry = rounded(0.21, 1, 0.11, 0.054);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  function mesh(parent, geometry, surface, x, y, z) {
    const object = new THREE.Mesh(geometry, surface);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  }

  function instances(parent, geometry, surface, count, dynamic = false) {
    const object = own(new THREE.InstancedMesh(geometry, surface, count));
    if (dynamic) {
      object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      object.frustumCulled = false;
    }
    parent.add(object);
    return object;
  }

  function place(batch, index, x, y, z, sx = 1, sy = 1, sz = 1) {
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    batch.setMatrixAt(index, dummy.matrix);
  }

  function flush(batch) {
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
  }

  function group(x, y) {
    const object = new THREE.Group();
    object.position.set(x, y, 0);
    scene.add(object);
    return object;
  }

  function shadow(parent, width, height) {
    const object = mesh(parent, shadowPlane, shadowMaterial, 0.055, -0.115, -0.37);
    object.scale.set(width, height, 1);
  }

  function label(parent, y, anchorY, { detail = '', multiline = false, x = 0 } = {}) {
    const element = document.createElement('div');
    element.className = 'etiqueta-3d etiqueta-byte';
    Object.assign(element.style, {
      font: 'inherit',
      fontSize: 'var(--byte-font, 24px)',
      fontWeight: '560',
      color: css(PALETA.tinta),
      background: css(PALETA.superficie),
      padding: '0.37em 0.64em',
      borderRadius: multiline || detail ? '0.8em' : '999px',
      boxShadow: `0 2px 12px ${css(PALETA.tinta)}15`,
      whiteSpace: multiline ? 'pre' : 'nowrap',
      textAlign: 'center',
      lineHeight: '1.16',
    });

    const heading = document.createElement('span');
    element.append(heading);
    if (detail) {
      const secondary = document.createElement('span');
      secondary.textContent = detail;
      Object.assign(secondary.style, {
        display: 'block', fontSize: '0.76em', fontWeight: '450',
        marginTop: '0.28em', color: css(PALETA.tenue),
      });
      element.append(secondary);
    }

    const object = new CSS2DObject(element);
    object.position.set(x, y, 0.30);
    parent.add(object);
    labels.push(object);

    const guide = new THREE.Line(
      own(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y, 0.30),
        new THREE.Vector3(0, anchorY, 0.15),
      ])),
      own(new THREE.LineBasicMaterial({
        color: PALETA.tenue, transparent: true, opacity: 0.62, depthWrite: false,
      })),
    );
    parent.add(guide);

    return { element, heading, guide };
  }

  function drawLabel(item, visibility) {
    item.element.style.opacity = visibility;
    item.guide.material.opacity = visibility * 0.62;
  }

  function row(x, y, ...caption) {
    const body = group(x, y);
    shadow(body, 6.53, 1.58);
    mesh(body, trayGeometry, ceramic, 0, 0, -0.135);
    mesh(body, bezelGeometry, ceramic, 0, 0, -0.006);
    const sockets = instances(body, socketGeometry, recessMaterial, 8);
    const stems = instances(body, stemGeometry, recessMaterial, 8, true);
    const rims = instances(body, rimGeometry, keyMaterial, 8, true);
    const caps = instances(body, capGeometry, keyMaterial, 8, true);
    for (let i = 0; i < 8; i++) place(sockets, i, bitOffset(i), 0, 0.008);
    flush(sockets);
    const tag = label(body, 1.13, 0.444);
    return { body, stems, rims, caps, x, y, tag, value: hexField(tag.heading, ...caption) };
  }

  // Filas separadas lo justo para que cada etiqueta quepa entre su bandeja y la de arriba.
  // Rótulos en palabras de todos los días: mensaje (p), clave (k), su XOR y la salida de la S-box.
  const plain = row(-7, 2.52, 'mensaje = ');
  const key = row(-7, 0.45, 'clave = ');
  const xor = row(-7, -1.72, 'mensaje ', xorGlyph(), ' clave = ');
  const output = row(3.02, -0.55, 'tras la S-box = ');

  const box = group(-2.03, -0.39);
  shadow(box, 4.07, 3.98);
  mesh(box, rounded(3.31, 3.31, 0.42, 0.18, 2), ceramic, 0, 0, -0.20);
  mesh(box, rounded(3.103, 3.103, 0.057, 0.028), gridBed, 0, 0, 0.017);
  const grid = instances(box, tileGeometry, gridMaterial, 256);
  for (let i = 0; i < 256; i++) {
    place(grid, i, cellX(i), cellY(i), 0.06);
    grid.setColorAt(i, gridColor);
  }
  grid.instanceColor.setUsage(THREE.DynamicDrawUsage);
  flush(grid);
  const highlights = instances(box, tileGeometry, keyMaterial, 256, true);
  const boxTag = label(box, 2.24, 1.647);
  const lookupTag = label(box, -2.29, -1.648);
  const lookupCoordinates = document.createElement('span');
  const lookupValue = hexField(lookupTag.heading, lookupCoordinates, ' ', arrowGlyph(), ' ');
  boxTag.heading.textContent = 'S-box';

  const meterY = BASELINE + 4 * METER_PITCH;
  const meter = group(6.78, meterY);
  shadow(meter, 1.30, 3.83);
  mesh(meter, rounded(0.81, 3.15, 0.285, 0.13, 2), ceramic, 0, 0, -0.143);
  mesh(meter, rounded(0.673, 2.987, 0.062, 0.03), trackMaterial, 0, 0, 0.011);
  const segments = instances(meter, meterGeometry, keyMaterial, 8, true);
  const meterTag = label(meter, -2.37, -1.57, { detail: 'más unos, más consumo', x: -0.45 });

  const history = group(9.03, meterY);
  shadow(history, 3.21, 3.83);
  mesh(history, rounded(2.78, 3.15, 0.285, 0.125, 2), ceramic, 0, 0, -0.143);
  const tracks = instances(history, unitBox, trackMaterial, 8);
  const marks = instances(history, historyGeometry, keyMaterial, 8, true);
  for (let i = 0; i < 8; i++) {
    place(tracks, i, (i - 3.5) * HISTORY_PITCH, 0, 0.009, 0.21, 8 * METER_PITCH, 0.020);
  }
  flush(tracks);
  const historyTag = label(history, 2.44, 1.57, { multiline: true, x: -1.46 });
  historyTag.heading.textContent = 'la corriente sigue\nal número de unos';

  // Flecha de left a right; span() la estira cuando las columnas se separan.
  function connector(y) {
    const body = group(0, y);
    const stem = mesh(body, unitBox, flowMaterial, 0, 0, -0.02);
    const arms = [-1, 1].map((direction) => {
      const arm = mesh(body, unitBox, flowMaterial, 0, direction * 0.064, -0.02);
      arm.scale.set(0.174, 0.035, 0.045);
      arm.rotation.z = -direction * Math.PI / 4;
      return arm;
    });
    body.span = (left, right) => {
      const length = right - left;
      body.position.x = left;
      stem.position.x = length / 2;
      stem.scale.set(length, 0.035, 0.045);
      for (const arm of arms) arm.position.x = length - 0.065;
    };
    return body;
  }

  const incoming = connector(xor.y);
  const outgoing = connector(output.y);
  const consumption = connector(output.y);
  const sampling = connector(meterY);

  // Separación extra entre columnas (S-box, salida, barra y tira), en unidades de
  // la escena: 0 en 16:9 y más cuanto más apaisado es el contenedor. Cada paso
  // tiene la suya (gapFor, de resize) y se anima con el encuadre.
  let gap = 0;
  let gapFor = [0, 0, 0, 0, 0];
  function spread(value) {
    gap = value;
    box.position.x = -2.03 + gap;
    output.x = 3.02 + 2 * gap;
    meter.position.x = 6.78 + 3 * gap;
    history.position.x = 9.03 + 4 * gap;
    incoming.span(-4.03, -3.78 + gap);
    outgoing.span(-0.28 + gap, 0.07 + 2 * gap);
    consumption.span(6.01 + 2 * gap, 6.28 + 3 * gap);
    sampling.span(7.28 + 3 * gap, 7.57 + 4 * gap);
  }
  spread(0);
  const packet = group(0, 0);
  const packetKeys = instances(packet, capGeometry, keyMaterial, 8, true);

  const motions = new Set();
  const channel = (value = 0) => ({ value });
  const frame = FRAMES[0].map(channel);
  const spreading = channel();
  const xorKeys = Array.from({ length: 8 }, () => channel());
  const rowBits = Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => channel()));
  const cells = Array.from({ length: 256 }, () => channel());
  const rowBands = new Float32Array(16);
  const columnBands = new Float32Array(16);
  const levels = HISTORY.map(() => channel());
  const selected = HISTORY.map(() => channel());
  const weight = channel();
  const reveal = {
    xor: channel(), box: channel(), lookup: channel(), output: channel(),
    meter: channel(), fill: channel(), history: channel(),
  };
  const tagTone = {
    plain: channel(1), input: channel(1), xor: channel(1), lookup: channel(1),
  };

  let width = 0;
  let height = 0;
  let elapsed = 0;
  let previousFrame = null;
  let raf = null;
  let running = false;
  let disposed = false;
  let currentStep = 0;
  let manualP = SEQUENCE[0];
  let displayed = byteValues(manualP);
  let selectedCell = displayed.xor;
  let chartStart = 0;
  let chartTick = 0;
  let recorded = 0;
  let manualOverride = false;
  let packetStart = null;
  let packetByte = 0;
  let scanXor = false;

  function move(track, target, duration = 0, delay = 0) {
    if (!duration || Math.abs(track.value - target) < 0.00001) {
      track.value = target;
      motions.delete(track);
      return;
    }
    Object.assign(track, { from: track.value, target, start: elapsed + delay, duration });
    motions.add(track);
  }

  function advanceMotions() {
    for (const track of motions) {
      const progress = unit((elapsed - track.start) / track.duration);
      track.value = THREE.MathUtils.lerp(track.from, track.target, easeOutQuint(progress));
      if (progress === 1) motions.delete(track);
    }
  }

  function setByte(p, duration) {
    const values = byteValues(p);
    [values.p, values.xor, values.output].forEach((value, rowIndex) => {
      rowBits[rowIndex].forEach((track, i) => move(track, bitAt(value, i), duration));
    });
    if (selectedCell !== values.xor) {
      move(cells[selectedCell], 0, duration);
      selectedCell = values.xor;
    }
    move(cells[selectedCell], 1, duration);
    move(weight, values.weight, duration);
    displayed = values;
    refreshText();
  }

  function setChart(count, index, duration) {
    recorded = count;
    HISTORY.forEach((sample, i) => {
      move(levels[i], i < count ? sample.weight : 0, duration);
      move(selected[i], Number(i === index), duration);
    });
  }

  function refreshText() {
    const { p, xor: intermediate, output: result, weight: hamming } = displayed;
    const coordinates = `fila ${(intermediate >> 4).toString(16)}, columna ${(intermediate & 15).toString(16)}`;
    plain.value.textContent = hex(p);
    key.value.textContent = hex(KEY);
    xor.value.textContent = hex(intermediate);
    output.value.textContent = hex(result);
    lookupCoordinates.textContent = coordinates;
    lookupValue.textContent = hex(result);
    meterTag.heading.textContent = `${hamming} ${hamming === 1 ? 'uno' : 'unos'}`;

    const description = [`mensaje = ${hex(p)}`, `clave = ${hex(KEY)}`];
    if (currentStep >= 1) description.push(`mensaje XOR clave = ${hex(intermediate)}`);
    if (currentStep >= 2) description.push(`S-box, ${coordinates}: ${hex(result)}`, `tras la S-box = ${hex(result)}`);
    if (currentStep >= 3) description.push(`${hamming} unos de 8, modelo de consumo medio`);
    if (currentStep === 4) description.push('tira de ocho barras con el número de unos de cada mensaje');
    container.setAttribute('aria-label', `Cadena de un byte en AES. ${description.join('. ')}.`);
  }

  function drawRow(row, bits, emphasis = 0) {
    for (let i = 0; i < 8; i++) {
      const lift = typeof bits === 'number' ? bitAt(bits, i) : bits[i].value;
      const appear = row === xor ? xorKeys[i].value : 1;
      const scan = scanXor && (row === plain || row === key) ? Math.sin(Math.PI * xorKeys[i].value) : 0;
      const z = 0.014 + lift * 0.223 + scan * 0.045 - 0.26 * (1 - appear);
      const size = Math.max(0.001, 0.78 + 0.22 * appear);
      place(row.stems, i, bitOffset(i), 0, z - 0.12, size, size, size);
      place(row.caps, i, bitOffset(i), 0, z, size, size, size);
      place(row.rims, i, bitOffset(i), 0, z - 0.043, size, size, size);
      tint.copy(grayKey).lerp(white, lift).lerp(accent, Math.max(lift * emphasis, scan * 0.35));
      row.caps.setColorAt(i, tint);
      row.rims.setColorAt(i, tint.copy(grayKey).lerp(accent, Math.max(lift, scan)));
    }
    flush(row.caps);
    flush(row.rims);
    flush(row.stems);
  }

  function revealBody(body, value, from = 0.70) {
    body.visible = value > 0.001;
    body.scale.setScalar(THREE.MathUtils.lerp(from, 1, value));
    body.position.z = -0.24 * (1 - value);
  }

  function drawPacket() {
    const progress = packetStart === null ? 1 : unit((elapsed - packetStart - 75) / 450);
    packet.visible = progress > 0 && progress < 1;
    if (progress === 1) packetStart = null;
    if (!packet.visible) return;
    const travel = 1 - (1 - progress) ** 2;
    packet.position.set(THREE.MathUtils.lerp(xor.x, -3.57 + gap, travel), xor.y, 0.29);
    packet.scale.setScalar(THREE.MathUtils.lerp(1, 0.055, travel));
    for (let i = 0; i < 8; i++) {
      const active = bitAt(packetByte, i);
      place(packetKeys, i, bitOffset(i), 0, active * 0.13);
      packetKeys.setColorAt(i, active ? white : grayKey);
    }
    flush(packetKeys);
  }

  function drawGrid() {
    rowBands.fill(0);
    columnBands.fill(0);
    let illuminated = 0;
    for (let i = 0; i < cells.length; i++) {
      const lift = cells[i].value * reveal.lookup.value;
      if (lift <= 0.001) continue;
      rowBands[i >> 4] += lift;
      columnBands[i & 15] += lift;
      // La baldosa se extruye desde la rejilla para que la elevación no deje hueco.
      place(highlights, illuminated, cellX(i), cellY(i), 0.061 + 0.082 * lift, 1, 1, 1 + 0.164 * lift / 0.044);
      highlights.setColorAt(illuminated++, tint.copy(gridColor).lerp(accent, lift));
    }
    highlights.count = illuminated;
    flush(highlights);
    for (let i = 0; i < cells.length; i++) {
      const strength = unit(Math.max(rowBands[i >> 4], columnBands[i & 15]));
      grid.setColorAt(i, tint.copy(gridColor).lerp(bandColor, strength));
    }
    grid.instanceColor.needsUpdate = true;
  }

  function render() {
    spread(spreading.value);
    const [frameX, y, designWidth, fit, gaps] = frame.map((track) => track.value);
    camera.aspect = width / height;
    const designHeight = designWidth * 9 / 16 * fit;
    // El centro se corre con las columnas, algo más que la mitad de lo que se
    // ensancha: la cámara mira desde la derecha y ese lado sale más grande.
    const x = frameX + gaps * gap * 0.67;
    const distance = Math.max((designWidth + gaps * gap) / camera.aspect, designHeight) / (2 * halfFovTangent);
    camera.position.copy(cameraDirection).multiplyScalar(distance).add(new THREE.Vector3(x, y, 0));
    camera.lookAt(x, y, 0);
    camera.updateProjectionMatrix();

    drawRow(plain, rowBits[0]);
    drawRow(key, KEY);
    drawRow(xor, rowBits[1]);
    drawRow(output, rowBits[2], reveal.fill.value);
    revealBody(xor.body, reveal.xor.value, 0.84);
    revealBody(box, reveal.box.value, 0.78);
    revealBody(output.body, reveal.output.value, 0.45);
    output.body.position.x = output.x - 2.87 * (1 - output.body.scale.x);
    revealBody(meter, reveal.meter.value);
    revealBody(history, reveal.history.value, 0.84);
    incoming.visible = reveal.box.value > 0.97;
    outgoing.visible = reveal.output.value > 0.94;
    consumption.visible = reveal.meter.value > 0.97;
    sampling.visible = reveal.history.value > 0.97;
    if (box.visible) drawGrid();

    const level = weight.value * reveal.fill.value;
    for (let i = 0; i < 8; i++) {
      const lit = unit(level - i);
      const y = (i - 3.5) * METER_PITCH;
      place(segments, i, 0, y, 0.070 + 0.056 * lit);
      segments.setColorAt(i, tint.copy(meterIdle).lerp(accent, lit));
      const length = levels[i].value * METER_PITCH;
      const size = Math.max(0.0001, length);
      place(marks, i, (i - 3.5) * HISTORY_PITCH, -4 * METER_PITCH + size / 2, 0.072, 1, size, 1);
      marks.setColorAt(i, tint.copy(historyGray).lerp(accent, selected[i].value));
    }
    flush(segments);
    flush(marks);
    drawPacket();

    drawLabel(plain.tag, tagTone.plain.value);
    drawLabel(key.tag, tagTone.input.value);
    drawLabel(xor.tag, reveal.xor.value * tagTone.xor.value);
    drawLabel(boxTag, reveal.box.value * tagTone.lookup.value);
    drawLabel(lookupTag, reveal.lookup.value * tagTone.lookup.value);
    drawLabel(output.tag, unit((reveal.output.value - 0.20) / 0.80));
    drawLabel(meterTag, reveal.meter.value);
    drawLabel(historyTag, reveal.history.value);

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    container.dataset.ready = '1';
  }

  function resize() {
    if (disposed) return;
    const nextWidth = Math.max(1, container.clientWidth);
    const nextHeight = Math.max(1, container.clientHeight);
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    // Etiquetas de 24 px fijos en el escenario de 1920×1080: se leen desde el fondo del aula.
    overlay.style.setProperty('--byte-font', '24px');
    // En cada paso, el ancho que sobra a su altura, repartido entre sus huecos, con
    // un 15 % de reserva: la perspectiva agranda lo de la derecha y las etiquetas
    // de ese lado se saldrían. Los pasos 0 y 1 (solo las filas) usan el del 2.
    const room = (n) => {
      const [, , w, fit, gaps] = FRAMES[n];
      return Math.max(0, 0.85 * (w * 9 / 16 * fit * (width / height) - w) / gaps);
    };
    gapFor = [room(2), room(2), room(2), room(3), room(4)];
    move(spreading, gapFor[currentStep]);
    renderer.setSize(width, height, false);
    labelRenderer.setSize(width, height);
    render();
  }

  function setStep(n, animate) {
    scanXor = animate && n === 1 && currentStep === 0;
    const playLookup = animate && n === 2 && reveal.lookup.value < 0.999;
    currentStep = n;
    const duration = animate ? STEP_DURATION : 0;
    FRAMES[n].forEach((value, i) => move(frame[i], value, duration));
    move(spreading, gapFor[n], duration);

    move(reveal.xor, Number(n >= 1), duration);
    xorKeys.forEach((track, i) => {
      move(track, Number(n >= 1), scanXor ? 365 : duration, scanXor ? 105 + 43 * i : 0);
    });
    move(reveal.box, Number(n >= 2), duration);
    move(reveal.lookup, Number(n >= 2), playLookup ? 335 : duration, playLookup ? 500 : 0);
    move(reveal.output, Number(n >= 2), playLookup ? 330 : duration, playLookup ? 565 : 0);
    move(reveal.meter, Number(n >= 3), duration);
    move(reveal.fill, Number(n >= 3), animate && n === 3 ? 660 : duration, animate && n === 3 ? 115 : 0);
    move(reveal.history, Number(n === 4), duration);
    // En el paso 4 el texto claro vuelve a ser protagonista: es lo que cambia en cada cifrado.
    move(tagTone.plain, n === 2 || n === 3 ? 0.5 : 1, duration);
    move(tagTone.input, n >= 2 ? 0.5 : 1, duration);
    move(tagTone.xor, n >= 3 ? 0.5 : 1, duration);
    move(tagTone.lookup, n >= 3 ? 0.5 : 1, duration);

    manualOverride = false;
    chartTick = 0;
    chartStart = elapsed;
    const completeChart = staticMode || media.matches;
    const index = completeChart ? SEQUENCE.length - 1 : 0;
    const p = n === 4 ? SEQUENCE[index] : manualP;
    setByte(p, animate ? DATA_DURATION : 0);
    setChart(n === 4 ? index + 1 : 0, n === 4 ? index : -1, duration);

    packetStart = playLookup ? elapsed : null;
    packetByte = displayed.xor;
  }

  function step(n) {
    if (disposed || !Number.isInteger(n) || n < 0 || n >= STEPS) return;
    setStep(n, running && !staticMode && !media.matches);
    render();
  }

  function update(data) {
    const p = data?.p;
    if (disposed || !Number.isInteger(p) || p < 0 || p > 255) return;
    const duration = running && !staticMode && !media.matches ? DATA_DURATION : 0;
    manualP = p;
    if (currentStep === 4) {
      manualOverride = true;
      const index = SEQUENCE.indexOf(p);
      setChart(recorded, index < recorded ? index : -1, duration);
    }
    setByte(p, duration);
    if (packetStart !== null) packetByte = displayed.xor;
    render();
  }

  function tick(timestamp) {
    raf = null;
    if (!running || disposed || media.matches) return;
    if (previousFrame !== null) elapsed += Math.max(0, timestamp - previousFrame);
    previousFrame = timestamp;

    let changed = motions.size > 0 || packetStart !== null;
    advanceMotions();
    if (currentStep === 4 && !manualOverride) {
      const tickIndex = Math.floor((elapsed - chartStart) / INTERVAL);
      if (tickIndex > chartTick) {
        chartTick = tickIndex;
        const index = chartTick % SEQUENCE.length;
        setByte(SEQUENCE[index], DATA_DURATION);
        setChart(Math.min(chartTick + 1, SEQUENCE.length), index, DATA_DURATION);
        changed = true;
      }
    }
    if (changed) render();
    if (running && !disposed) raf = requestAnimationFrame(tick);
  }

  function start() {
    if (running || disposed || staticMode) return;
    running = true;
    if (!media.matches) raf = requestAnimationFrame(tick);
  }

  function cancelFrame() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    previousFrame = null;
  }

  function stop() {
    running = false;
    cancelFrame();
  }

  function motionChanged() {
    if (staticMode || disposed) return;
    cancelFrame();
    const preserveInput = manualOverride && currentStep === 4;
    const savedCount = recorded;
    setStep(currentStep, false);
    if (preserveInput) {
      const count = media.matches ? SEQUENCE.length : savedCount;
      const index = SEQUENCE.indexOf(manualP);
      manualOverride = true;
      setByte(manualP, 0);
      setChart(count, index < count ? index : -1, 0);
    }
    render();
    if (running && !media.matches) raf = requestAnimationFrame(tick);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  if (!staticMode) media.addEventListener('change', motionChanged);
  const initialStep = Number.isInteger(options.step) && options.step >= 0 && options.step < STEPS
    ? options.step : STEPS - 1;
  setStep(staticMode ? initialStep : 0, false);
  resize();

  function dispose() {
    if (disposed) return;
    stop();
    disposed = true;
    observer.disconnect();
    if (!staticMode) media.removeEventListener('change', motionChanged);
    motions.clear();
    for (const item of labels) item.removeFromParent();
    scene.clear();
    scene.environment = null;
    for (const resource of resources) resource.dispose();
    environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    overlay.remove();
    if (positionAdjusted) container.style.position = oldPosition;
    if (oldRole === null) container.removeAttribute('role');
    else container.setAttribute('role', oldRole);
    if (oldLabel === null) container.removeAttribute('aria-label');
    else container.setAttribute('aria-label', oldLabel);
    if (oldReady === undefined) delete container.dataset.ready;
    else container.dataset.ready = oldReady;
  }

  return { steps: STEPS, start, stop, step, update, dispose };
}
