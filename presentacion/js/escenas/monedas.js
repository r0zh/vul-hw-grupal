// Diez monedas, una trucada: la analogía del ataque sin matemáticas. Cada moneda tiene su barra
// con el porcentaje de caras y una franja azul marca lo que puede hacer el azar con N tiradas
// (± 1,5/√N, tres desviaciones típicas). Con pocas tiradas la franja lo cubre todo; con 1000 se
// estrecha y solo la trucada (60 % de caras) se queda fuera, y su barra se vuelve azul.
//
// mount(container, options) → { steps: 6, start, stop, step, toss, reset, reveal, pick, onPick, dispose }
//   pasos: N = 0, 1, 10, 100 y 1000, y el 5 revela (verde, anillo y «trucada: sale cara el 60 %»).
//   options.trucada  índice 0–9 de la trucada (6, la G); options.semilla  semilla del sorteo (2026).
//   options.static   dibuja una vez el paso options.step (o el 5); options.onCount(n)  N mostrada.
//   options.primerplano ('cara' o 'cruz') encuadra una sola moneda para inspeccionar el troquel.
//   pick(i | null) cambia el voto; onPick(fn) avisa de un toque (en la moneda o en su letra) y
//   devuelve cómo cancelar la escucha. Mientras alguien escucha, el puntero es una mano sobre ellas.
//   toss(n) tira n veces más y devuelve la N total; reset({ trucada, semilla }) empieza otra partida;
//   reveal() revela. countHeads(seed, rigged, n) da las caras de cada moneda en sus n tiradas.
//
// Cada moneda tiene su propio generador, así que el resultado con N tiradas no depende de cómo se
// agrupen las tandas. Con la semilla 2026 y la G trucada: con 10 tiradas H lleva 7 caras y G, 6;
// con 100, G lleva 62 y las diez siguen dentro de la franja; con 1000, solo G se sale (580 caras,
// franja del 45,3 al 54,7 %).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { PALETA, css } from '../paleta.js';

const LETTERS = 'ABCDEFGHIJ';
const TOTALS = [0, 1, 10, 100, 1000, 1000];
const DEFAULT_SEED = 2026;
const BASE = 1.12, HEIGHT = 4.42, EDGE = 4.91, FRONT = 0.16;
const FILL_WIDTH = .364, FILL_INSET = .065, FILL_HEIGHT = HEIGHT - 2 * FILL_INSET;
const REST = -20 * Math.PI / 180, TAU = 2 * Math.PI;
const { clamp, lerp, smoothstep } = THREE.MathUtils;
const ease = t => 1 - (1 - t) ** 5;
const columnX = i => i - 4.5;
const halfBand = n => n ? Math.min(0.5, 1.5 / Math.sqrt(n)) : 0;
// Opacidad del relleno y de los bordes de la franja: que aguante un proyector lavado desde la última fila.
const BAND_ALPHA = 0.26, EDGE_ALPHA = 0.85;
const trials = n => n === 1 ? '1 tirada' : n + ' tiradas';

function randomStream(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let bits = Math.imul(state ^ state >>> 15, state | 1);
    bits ^= bits + Math.imul(bits ^ bits >>> 7, bits | 61);
    return ((bits ^ bits >>> 14) >>> 0) / 2 ** 32;
  };
}

function validateGame(seed, rigged) {
  if (!Number.isSafeInteger(seed)) throw new RangeError('La semilla debe ser un entero.');
  if (!Number.isInteger(rigged) || rigged < 0 || rigged > 9)
    throw new RangeError('La moneda trucada debe estar entre 0 y 9.');
}

function validateCount(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('Se necesita un número entero de tiradas ≥ 0.');
}

function streams(seed, rigged) {
  validateGame(seed, rigged);
  return Array.from(LETTERS, (_, i) => {
    const random = randomStream(seed ^ Math.imul(i + 1, 0x9e3779b9));
    const probability = i === rigged ? 0.6 : 0.5;
    return () => Number(random() < probability);
  });
}

export function countHeads(seed, rigged, n) {
  validateCount(n);
  return streams(seed, rigged).map(flip => {
    let heads = 0;
    for (let j = 0; j < n; j++) heads += flip();
    return heads;
  });
}

function historyFor(seed, rigged) {
  const flips = streams(seed, rigged);
  const sums = flips.map(() => [0]);
  return {
    extend(n) {
      sums.forEach((row, i) => {
        while (row.length <= n) row.push(row[row.length - 1] + flips[i]());
      });
    },
    ratio: (i, n) => n ? sums[i][n] / n : 0,
    // Sin tiradas, el valor queda al frente. Tras el lanzamiento, cara es el retrato.
    face: (i, n) => n > 0 && sums[i][n] > sums[i][n - 1] ? REST : REST + Math.PI,
  };
}

// El perfil está en milímetros. Una moneda ocupa el 82 % del paso entre columnas.
const DIAMETER = 23.25, CORE_RADIUS = 8, HALF_THICKNESS = 2.33 / 2;
const COIN_WIDTH = 0.82, MM = COIN_WIDTH / DIAMETER;

function turnedProfile(profile, segments) {
  const positions = [], indices = [], uvs = [];
  for (const [radius, z, groove = 0] of profile) {
    for (let i = 0; i < segments; i++) {
      const angle = TAU * i / segments;
      // Seis sectores lisos alternan con seis sectores de nueve estrías cada uno.
      const reeded = Math.floor(i * 12 / segments) % 2 === 0;
      const r = radius - (reeded ? groove * (1 - Math.cos(108 * angle)) / 2 : 0);
      const x = r * Math.cos(angle), y = r * Math.sin(angle);
      positions.push(x * MM, y * MM, z * MM);
      uvs.push(0.5 + x / DIAMETER, 0.5 + y / DIAMETER);
    }
  }
  for (let j = 0; j < profile.length - 1; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * segments + i, b = j * segments + (i + 1) % segments;
      indices.push(a, b, a + segments, b, b + segments, a + segments);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const gray = value => `rgb(${value},${value},${value})`;

function slope(ctx, x1, y1, x2, y2, stops) {
  const ramp = ctx.createLinearGradient(x1, y1, x2, y2);
  for (const [at, level] of stops) ramp.addColorStop(at, gray(level));
  return ramp;
}

function stamp(ctx, outline, height) {
  ctx.fillStyle = typeof height === 'number' ? gray(height) : height;
  ctx.fill(new Path2D(outline));
}

function ridge(ctx, outline, width, height) {
  ctx.strokeStyle = gray(height);
  ctx.lineWidth = width;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(outline));
}

// Volumen continuo bajo el troquel. La altura se funde con la superficie que lo rodea.
function volume(ctx, x, y, rx, ry, tilt, height) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(rx, ry);
  const dome = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  dome.addColorStop(0, gray(height));
  dome.addColorStop(.48, `rgba(${height},${height},${height},0.70)`);
  dome.addColorStop(1, `rgba(${height},${height},${height},0)`);
  ctx.fillStyle = dome;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

function star(ctx, x, y, radius) {
  // Diez facetas inclinadas alrededor de la cumbre de cada estrella.
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = Math.PI * i / 5 - Math.PI / 2, r = i % 2 ? radius * 0.44 : radius;
    return [x + r * Math.cos(angle), y + r * Math.sin(angle)];
  });
  for (let i = 0; i < 10; i++) {
    const [ax, ay] = points[i], [bx, by] = points[(i + 1) % 10];
    const dx = bx - ax, dy = by - ay;
    const t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
    stamp(ctx, `M${x},${y} L${ax},${ay} ${bx},${by}Z`,
      slope(ctx, ax + t * dx, ay + t * dy, x, y, [[0, 86], [1, 220]]));
  }
}

// Mechón de sección redondeada. Se afila en ambos extremos siguiendo la curva de la cabeza.
function hairLock(ctx, x0, y0, cx, cy, x1, y1, width, crest) {
  const spine = [];
  for (let j = 0; j <= 20; j++) {
    const t = j / 20, s = 1 - t;
    const x = s*s*x0 + 2*t*s*cx + t*t*x1, y = s*s*y0 + 2*t*s*cy + t*t*y1;
    const dx = s*(cx-x0) + t*(x1-cx), dy = s*(cy-y0) + t*(y1-cy);
    const taper = width * Math.sin(Math.PI * t) ** .7 / Math.hypot(dx, dy);
    spine.push({ x, y, nx: -dy * taper, ny: dx * taper });
  }
  for (let j = 0; j < 5; j++) {
    const arc = j * Math.PI / 10, radius = Math.cos(arc);
    const left = [], right = [];
    for (const { x, y, nx, ny } of spine) {
      left.push(`${x + nx * radius},${y + ny * radius}`);
      right.push(`${x - nx * radius},${y - ny * radius}`);
    }
    stamp(ctx, 'M' + left.concat(right.reverse()).join(' ') + 'Z', Math.round(140 + (crest - 140) * Math.sin(arc)));
  }
}

function nationalDie(ctx) {
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12 - Math.PI / 2;
    star(ctx, 128 + 105 * Math.cos(a), 128 + 105 * Math.sin(a), 7.5);
  }
  ctx.font = 'bold 13px "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = gray(180);
  const legend = 'ESPAÑA  2015';
  for (let i = 0; i < legend.length; i++) {
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate((i - (legend.length - 1) / 2) * 0.156);
    ctx.fillText(legend[i], 0, -72);
    ctx.restore();
  }

  // El cuello termina en un único corte oblicuo bajo la mandíbula.
  const bust = 'M94 181 C101 177 111 168 109 159 ' +
    'Q101 161 97 157 Q94 154 95 149 Q95 147 91 146 Q89 144 92 141 ' +
    'Q88 140 89 137 L91 133 Q84 134 82 131 Q81 129 84 126 Q91 118 94 112 ' +
    'Q90 110 92 106 L94 99 Q92 95 95 90 Q96 81 104 77 ' +
    'C109 72 115 67 123 68 C130 65 137 67 143 69 Q162 71 170 90 Q178 106 171 124 ' +
    'Q167 136 161 145 C154 157 157 169 168 178 Q159 185 148 191 Q122 189 94 181Z';
  ctx.save();
  ctx.translate(-16, -6);
  ctx.scale(1.12, 1.12);
  ctx.clip(new Path2D(bust));
  stamp(ctx, bust, slope(ctx, 83, 114, 167, 149, [[0, 144], [.28, 212], [.57, 172], [1, 63]]));
  volume(ctx, 111, 100, 21, 15, -.25, 233);
  volume(ctx, 105, 114, 20, 6, -.16, 89);
  volume(ctx, 111, 137, 16, 14, .3, 136);
  volume(ctx, 116, 124, 23, 11, -.35, 214);
  volume(ctx, 126, 144, 21, 7, -.55, 179);
  volume(ctx, 100, 152, 11, 7, -.05, 223);
  stamp(ctx, 'M97 157 C111 161 124 153 136 145 Q148 138 152 127 L168 125 ' +
    'L177 194 L89 196Z', slope(ctx, 116, 147, 149, 185, [[0, 94], [.35, 139], [.7, 165], [1, 103]]));
  volume(ctx, 131, 163, 30, 6.3, -.91, 187);
  volume(ctx, 115, 165, 12, 7, -.38, 149);
  volume(ctx, 153, 164, 7, 20, -.21, 120);

  const hair = 'M90 102 Q95 103 99 97 Q101 93 105 94 Q111 89 117 92 Q123 89 132 99 ' +
    'Q139 101 140 111 L143 118 Q147 116 148 110 Q157 101 160 112 L154 131 L158 138 ' +
    'Q172 128 176 113 L174 82 L150 63 L115 62 L90 78Z';
  ctx.save();
  ctx.clip(new Path2D(hair));
  stamp(ctx, hair, slope(ctx, 109, 69, 153, 133, [[0, 111], [.24, 152], [.52, 141], [1, 101]]));
  const locks = [
    [93,96, 92,85, 111,78, 2.4,178], [95,97, 99,83, 117,78, 2.8,184],
    [100,91, 108,81, 130,80, 3.1,182], [104,84, 111,70, 135,71, 2.7,173],
    [116,77, 129,67, 147,73, 2.6,167], [115,84, 130,73, 151,80, 3.6,177],
    [104,94, 116,84, 132,87, 2.4,181], [118,89, 135,78, 153,87, 3.1,171],
    [133,92, 146,81, 162,91, 3.0,165], [134,98, 147,86, 161,92, 2.1,179],
    [143,103, 150,90, 168,96, 3.0,166], [143,112, 150,100, 167,99, 2.0,171],
    [149,77, 164,79, 169,94, 2.9,161], [160,113, 169,109, 171,101, 2.8,172],
    [158,125, 167,118, 171,109, 2.7,165], [156,133, 167,126, 170,118, 1.8,154],
  ];
  for (const lock of locks) hairLock(ctx, ...lock);
  ctx.restore();

  stamp(ctx, 'M94 107 Q100 102 112 104 L118 108 Q105 107 97 113 L92 112Z',
    slope(ctx, 99, 103, 101, 114, [[0, 165], [.48, 226], [1, 133]]));
  volume(ctx, 101, 114, 6.7, 3.5, -.17, 176);
  stamp(ctx, 'M95.6 114.5 Q99.5 110.5 107.8 112 Q103 113.9 97.2 116.4Z',
    slope(ctx, 100, 111, 101, 116.5, [[0, 122], [.50, 179], [1, 146]]));
  volume(ctx, 98.6, 114.1, 1.25, 1.7, .23, 106);
  ridge(ctx, 'M96 114 Q100.7 110.6 107.8 112', .82, 197);
  stamp(ctx, 'M92 119 Q96 116 98 116 Q98 123 94 127 Q91 130 85 131 L83 129Z',
    slope(ctx, 86, 122, 97, 128, [[0, 224], [.6, 207], [1, 148]]));
  ridge(ctx, 'M90 132 Q93 129 96 131', 1.35, 137);
  volume(ctx, 94, 136, 7.2, 3.4, -.1, 213);
  volume(ctx, 99, 144, 9, 3.7, -.1, 208);
  ridge(ctx, 'M91 141 Q96 140 101 141', 1.2, 128);
  ridge(ctx, 'M97 151 Q101 153 105 151', 1.4, 178);
  stamp(ctx, 'M142 115 Q144 105 152 104 Q161 103 159 114 Q158 120 152 126 ' +
    'Q148 131 144 127 Q141 123 142 115Z',
    slope(ctx, 142, 107, 157, 125, [[0, 129], [.45, 201], [.76, 178], [1, 116]]));
  ridge(ctx, 'M145 117 Q145 109 152 108 Q157 108 156 113 Q155 118 151 120', 1.7, 129);
  ridge(ctx, 'M146 123 Q150 122 150 118 Q148 116 152 113', 1.5, 194);
  ctx.restore();
}

function commonDie(ctx) {
  for (const y of [62, 88, 114, 140, 166, 192]) {
    const span = Math.sqrt(106 ** 2 - (y - 128) ** 2);
    ridge(ctx, `M${128 - span} ${y}H${128 + span}`, 1.1, 94);
    star(ctx, 128 - span, y, 4.5);
    star(ctx, 128 + span, y, 4.5);
  }
  // El golfo de Finlandia separa las dos masas de tierra. La tierra es una meseta de altura
  // constante: las pendientes suaves de 8 bits dejaban rayas y anillos en el reflejo.
  // El este del continente acaba en un borde curvo dentro del centro.
  const mainland = `M94 147 L94 142 96 140 98 134 99 127 Q104 126 110 129 L118 131
    Q122 128 123 123 L121 120 116 117 117 115 123 116 124 113 128 114 132 112 133 110
    139 108 141 105 149 104 150 102 150 97 151 94 155 91 153 101 162 103 171 100
    172 102 177 98 176 93 179 91 182 93 182 88 180 86 182 84 188 84 Q194 88 199 88
    Q205 91 205 99 Q206 111 211 123 208 122 204 123 202 127 202 129 200 131 198 137 200 139
    195 143 191 143 188 145 190 147 186 145 186 149 190 152 187 153 188 158 185 156
    183 158 180 154 183 151 180 151 176 145 175 141 166 136 163 131 161 132 160 130
    156 129 Q155 132 160 137 L162 139 167 140 166 142 174 146 175 149 169 146
    168 148 170 149 167 155 165 154 167 150 165 147 160 144 153 139 151 135 147 133
    140 136 136 134 Q132 133 131 139 L122 144 120 146 121 148 118 151 114 152
    106 151 102 153 99 149Z`;
  const nordic = `M188 80 Q184 81 179 84 L175 82 174 77 Q175 72 180 65
    Q178 63 175 66 L173 71 168 76 Q166 80 171 85 L170 88 167 89 166 96 163 96 162 98
    160 99 156 86 Q154 88 152 89 L149 90 146 87 148 84 146 83 148 80 147 78
    150 76 153 75 153 73 157 71 160 65 164 61 165 58 169 55 171 52 172 54
    176 49 179 47 183 49 182 54 185 58 184 61 187 67 191 71 190 76Z`;
  const islands = `M115 109 L119 108 120 110 123 108 129 110 133 109 132 107 134 105
    131 103 132 101 129 94 127 92 131 89 126 88 129 84 126 83 123 87 121 88 122 91
    120 94 123 93 122 96 125 96 125 101 122 100 121 103 118 103 121 106Z
    M106 101 L109 100 107 99 110 97 109 96 110 94 113 94 115 92 119 93 120 95
    118 97 117 101 113 103Z M146 139 L149 137 149 140 148 142 147 141Z
    M145 144 L148 143 150 144 149 150 145 150Z M155 153 Q160 154 166 152
    L164 158 157 156Z M190 160 L198 159 197 161 192 162Z`;
  // El mapa se reduce un 10 % hacia la península ibérica para que Escandinavia no pise el anillo.
  ctx.save();
  ctx.translate(100, 150);
  ctx.scale(.9, .9);
  ctx.translate(-100, -150);
  stamp(ctx, mainland + nordic + islands, 166);
  ctx.restore();
  // El uno y la palabra comparten la línea de base. El uno conserva su pie y bisel.
  // Desplazado 4 unidades a la derecha para que la bandera y el pie no pisen el anillo.
  stamp(ctx, 'M49 94 Q63 88 73 72 L91 66 L91 174 L103 178 L103 185 L58 185 L58 178 ' +
    'L69 174 L69 96 L51 104Z', 196);
  stamp(ctx, 'M84 77 L87 75 L87 176 L83 174Z', 213);
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillStyle = gray(199);
  ctx.textAlign = 'left';
  ctx.fillText('EURO', 107, 185);
}

// Suavizado separable de las alturas de 8 bits antes de calcular su pendiente.
function smoothHeights(bytes, size) {
  const rows = new Float32Array(size * size), field = new Float32Array(rows.length).fill(28);
  for (let y = 0; y < size; y++) {
    for (let x = 2; x < size - 2; x++) {
      const i = y * size + x, p = i * 4;
      rows[i] = (bytes[p-8] + 2*bytes[p-4] + 3*bytes[p] + 2*bytes[p+4] + bytes[p+8]) / 9;
    }
  }
  for (let y = 2; y < size - 2; y++) {
    for (let x = 2; x < size - 2; x++) {
      const i = y * size + x;
      field[i] = (rows[i-2*size] + 2*rows[i-size] + 3*rows[i] + 2*rows[i+size] + rows[i+2*size]) / 9;
    }
  }
  return field;
}

// Desenfoque de caja separable en coma flotante, con los bordes del lienzo repetidos.
function boxBlur(src, size, radius) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), n = 2 * radius + 1;
  for (const [from, to, stride, step] of [[src, tmp, size, 1], [tmp, out, 1, size]]) {
    for (let line = 0; line < size; line++) {
      const start = line * stride;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += from[start + clamp(k, 0, size - 1) * step];
      for (let k = 0; k < size; k++) {
        to[start + k * step] = sum / n;
        sum += from[start + Math.min(k + radius + 1, size - 1) * step] - from[start + Math.max(k - radius, 0) * step];
      }
    }
  }
  return out;
}

// Dos radios de bisel conservan las letras y redondean los hombros de los motivos.
function dieTextures(paint) {
  const size = 1024, designSize = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.scale(size / designSize, size / designSize);
  ctx.fillStyle = gray(28);
  ctx.fillRect(0, 0, designSize, designSize);
  paint(ctx);
  const die = document.createElement('canvas');
  die.width = die.height = size;
  const surface = die.getContext('2d', { willReadFrequently: true });
  surface.filter = 'blur(1.5px)';
  surface.drawImage(canvas, 0, 0);
  surface.globalAlpha = 0.46;
  surface.filter = 'blur(5px)';
  surface.drawImage(canvas, 0, 0);
  const height = smoothHeights(surface.getImageData(0, 0, size, size).data, size);
  // Las cúpulas suaves del retrato dejaban curvas de nivel (escalones de 8 bits) en el reflejo.
  // Donde la pendiente es pequeña manda una versión muy suavizada; en los bordes, la nítida.
  const wide = boxBlur(boxBlur(height, size, 5), size, 5);

  // FP16 evita escalones visibles al reflejar una caja sobre el campo casi liso.
  const normals = new Uint16Array(size * size * 4), finish = new Uint8Array(normals.length);
  const rough = new Uint8Array(normals.length);
  const { toHalfFloat } = THREE.DataUtils;
  const one = toHalfFloat(1);
  const gain = 22 / (8 * 255);
  const coreSlope = -Math.tan(6.5 * Math.PI / 180) / CORE_RADIUS;
  const brassSlope = Math.tan(3.5 * Math.PI / 180);
  for (let y = 0; y < size; y++) {
    const v = (.5 - (y + .5) / size) * DIAMETER;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // En una DataTexture la primera fila corresponde a v=0, en la parte baja del disco.
      const p = ((size - 1 - y) * size + x) * 4;
      const l = x ? -1 : 0, r = x < size - 1 ? 1 : 0;
      const a = y ? i - size : i, b = y < size - 1 ? i + size : i;
      // Gradiente de una cubeta parabólica en mm, sumado al Sobel del troquel.
      // El canal de latón tiene su propio fondo entre la junta y el listel.
      const u = ((x + .5) / size - .5) * DIAMETER;
      const radius = Math.hypot(u, v);
      const bowl = radius <= CORE_RADIUS ? coreSlope : -brassSlope * clamp((radius - 9.5) / 1.5, -1, 1) / radius;
      const sx = height[a+l] + 2*height[i+l] + height[b+l] - height[a+r] - 2*height[i+r] - height[b+r];
      const sy = height[b+l] + 2*height[b] + height[b+r] - height[a+l] - 2*height[a] - height[a+r];
      const wx = wide[a+l] + 2*wide[i+l] + wide[b+l] - wide[a+r] - 2*wide[i+r] - wide[b+r];
      const wy = wide[b+l] + 2*wide[b] + wide[b+r] - wide[a+l] - 2*wide[a] - wide[a+r];
      const sharp = smoothstep(Math.max(Math.hypot(sx, sy), Math.hypot(wx, wy)), 3, 12);
      const nx = gain * lerp(wx, sx, sharp) + bowl * u;
      const ny = gain * lerp(wy, sy, sharp) + bowl * v;
      const scale = .5 / Math.sqrt(1 + nx * nx + ny * ny);
      normals[p] = toHalfFloat(.5 + nx * scale);
      normals[p+1] = toHalfFloat(.5 + ny * scale);
      normals[p+2] = toHalfFloat(.5 + scale);
      normals[p+3] = one;
      // El cuño deja los altos algo más satinados que el campo pulido.
      const level = Math.round(235 + height[i] * 0.075);
      finish[p] = finish[p+1] = finish[p+2] = level;
      finish[p+3] = 255;
      // Campo pulido (0,22) y relieve satinado (0,50): el contraste de brillo dibuja el troquel.
      rough[p] = rough[p+1] = rough[p+2] = Math.round(255 * lerp(.22, .50, smoothstep(height[i], 34, 120)));
      rough[p+3] = 255;
    }
  }
  function texture(data, colorSpace, type) {
    const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, type);
    map.colorSpace = colorSpace;
    map.generateMipmaps = true;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.needsUpdate = true;
    return map;
  }
  return { normalMap: texture(normals, THREE.NoColorSpace, THREE.HalfFloatType),
    map: texture(finish, THREE.SRGBColorSpace, THREE.UnsignedByteType),
    roughnessMap: texture(rough, THREE.NoColorSpace, THREE.UnsignedByteType) };
}

function euroCoins(instances, environment) {
  // Colores del propio metal (reflectancia), no de la interfaz: latón níquel dorado pálido y
  // cuproníquel plateado algo cálido. El oro de PALETA, más anaranjado, daba un anillo tostado.
  const brass = new THREE.Color(0xdcbd7a);
  const nickel = new THREE.Color(0xd9d6d0);
  const metal = (color, maps = {}) => new THREE.MeshPhysicalMaterial({
    color, metalness: 1, roughness: maps.roughnessMap ? 1 : 0.28, envMap: environment, ...maps,
  });
  const rim = DIAMETER / 2;
  const edge = turnedProfile([[11.50, -1.06], [rim, -.86, .075], [rim, -.68, .16],
    [rim, .68, .16], [rim, .86, .075], [11.50, 1.06]], 432);
  const meshes = [instances(edge, metal(brass))];
  const ring = turnedProfile([[11.50, 1.06], [11.40, HALF_THICKNESS], [11.21, HALF_THICKNESS],
    [11.09, 1.115], [10.98, .984], [10.86, .97], [8.09, .97], [CORE_RADIUS, .925]], 144);
  const coreLip = turnedProfile([[CORE_RADIUS, .925], [7.94, .97], [7.82, .98]], 144);
  const field = new THREE.CircleGeometry(7.82 * MM, 144).translate(0, 0, .98 * MM);
  const uv = field.attributes.uv, position = field.attributes.position;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, .5 + position.getX(i) / COIN_WIDTH, .5 + position.getY(i) / COIN_WIDTH);
  for (const [side, paint] of [nationalDie, commonDie].entries()) {
    const maps = dieTextures(paint);
    const silver = metal(nickel, maps);
    for (const [geometry, material] of [[ring, metal(brass, maps)], [coreLip, silver], [field, silver]]) {
      // Al aterrizar en cruz el giro es sobre X. Así ambas inscripciones se leen derechas.
      meshes.push(instances(side ? geometry.clone().rotateX(Math.PI) : geometry, material));
    }
  }
  return meshes;
}

// Cada caja proyecta un rectángulo de bordes suaves en el entorno de reflejos.
function studioBox(direction, halfWidth, halfHeight, intensity) {
  const forward = new THREE.Vector3(...direction).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
  const up = new THREE.Vector3().crossVectors(forward, right);
  return ray => {
    const depth = ray.dot(forward);
    if (depth <= 0) return 0;
    const u = Math.abs(ray.dot(right)) / (depth * halfWidth);
    const v = Math.abs(ray.dot(up)) / (depth * halfHeight);
    return intensity * (1 - smoothstep(u, 0.17, 1)) * (1 - smoothstep(v, 0.23, 1));
  };
}

// Estudio de las monedas: degradado de gris medio (abajo) a claro (arriba), una caja de luz
// arriba a la izquierda, una tira estrecha a la derecha que perfila el reborde y un cenital que
// da el destello al girar. El suelo no baja de gris medio: ninguna cara se queda negra.
// Se hornea una sola vez en el PMREM compartido por los dos encuadres.
function coinStudio() {
  const studio = new THREE.Scene();
  const sky = new THREE.SphereGeometry(20, 96, 48);
  const boxes = [
    studioBox([-0.45, 0.72, 0.53], 0.42, 0.32, 1.8),
    studioBox([0.93, 0.12, 0.35], 0.12, 0.75, 1.8),
    studioBox([0, 0.97, 0.25], 0.5, 0.35, 1),
  ];
  const ray = new THREE.Vector3();
  const position = sky.attributes.position, colors = [];
  for (let i = 0; i < position.count; i++) {
    ray.fromBufferAttribute(position, i).normalize();
    const fill = ray.y < 0 ? lerp(0.42, 0.3, -ray.y) : lerp(0.42, 0.9, smoothstep(ray.y, 0, 0.85));
    const light = boxes.reduce((sum, box) => sum + box(ray), fill);
    colors.push(light, light, light);
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  studio.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  return studio;
}

// La geometría compartida parte de y=0.
function capsule(width, height, bevel) {
  const r = width / 2 - bevel;
  const shape = new THREE.Shape();
  shape.moveTo(-r, width / 2);
  shape.absarc(0, width / 2, r, Math.PI, TAU, false);
  shape.lineTo(r, height - width / 2);
  shape.absarc(0, height - width / 2, r, 0, Math.PI, false);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.026, bevelThickness: bevel,
    bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
}

function softShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 63);
  for (const [at, alpha] of [[0,'a6'], [0.18,'86'], [0.5,'40'], [0.8,'0d'], [1,'00']])
    gradient.addColorStop(at, css(PALETA.tinta) + alpha);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function sceneStyle() {
  const style = document.createElement('style');
  style.textContent = `
    .monedas-stage { position:absolute; inset:0; overflow:hidden; isolation:isolate; font:inherit; }
    .monedas-stage canvas,.monedas-overlay { position:absolute; inset:0; display:block; }
    .monedas-stage canvas { touch-action:manipulation; }
    .monedas-overlay { pointer-events:none; font:inherit; }
    .monedas-anchor { width:0; height:0; font:inherit; }
    .monedas-anchor > .etiqueta-3d { position:absolute; left:0; top:0; margin:0; box-sizing:border-box;
      font:inherit; font-size:var(--monedas-font,24px); line-height:1.22; letter-spacing:-.018em;
      color:${css(PALETA.tinta)}; font-variant-numeric:tabular-nums; text-align:center; }
    .monedas-anchor > .monedas-value { padding:0; background:none; border:0; border-radius:0;
      font-size:var(--monedas-value-font,24px);
      box-shadow:none; font-weight:600; white-space:nowrap; transform:translate(-50%,-100%);
      text-shadow:0 0 3px ${css(PALETA.superficie)},0 0 8px ${css(PALETA.superficie)}; }
    .monedas-anchor > .monedas-letter { transform:translate(-50%,0); font-size:var(--monedas-font,24px); }
    .monedas-anchor > .monedas-count { font-size:var(--monedas-count-font,48px); font-weight:600;
      line-height:1.1; letter-spacing:-.045em; }
    .monedas-anchor > .monedas-pill { width:max-content; max-width:none;
      background:${css(PALETA.superficie)}; border:1px solid ${css(PALETA.linea)}99;
      border-radius:1.1em; padding:.37em .62em; font-weight:550; white-space:pre;
      box-shadow:0 5px 18px -8px ${css(PALETA.tinta)}38; }
    .monedas-anchor > .monedas-reward { color:${css(PALETA.ok)}; width:max-content;
      max-width:none; border-color:${css(PALETA.okVivo)}60; }
    .monedas-anchor > .monedas-chance { width:7.3em; white-space:normal; text-wrap:balance; }
    .monedas-guide { position:absolute; left:0; top:0; height:1.3px; transform-origin:0 50%;
      background:${css(PALETA.tenue)}99; }
  `;
  return style;
}

function addLabel(scene, text, classes) {
  const anchor = document.createElement('div');
  anchor.className = 'monedas-anchor';
  const span = document.createElement('span');
  span.className = 'etiqueta-3d ' + classes;
  span.textContent = text;
  const object = new CSS2DObject(anchor);
  anchor.append(span);
  scene.add(object);
  return { object, span };
}

function guide(label, color) {
  const line = document.createElement('i');
  line.className = 'monedas-guide';
  line.style.backgroundColor = css(color) + 'aa';
  label.object.element.prepend(line);
  return line;
}

function lineBetween(line, x, y, dx, dy) {
  line.style.width = Math.hypot(dx, dy) + 'px';
  line.style.transform = `translate(${x}px,${y}px) rotate(${Math.atan2(dy, dx)}rad)`;
}

export function mount(container, options = {}) {
  let seed = options.semilla ?? DEFAULT_SEED, rigged = options.trucada ?? 6;
  let history = historyFor(seed, rigged);
  const closeup = ['cara', 'cruz'].includes(options.primerplano) ? options.primerplano : null;
  const fixed = options.static === true || !!closeup;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const stepIndex = n => clamp(Math.trunc(Number(n)) || 0, 0, TOTALS.length - 1);
  const initial = closeup ? 0 : stepIndex(options.step ?? (fixed ? 5 : 0));
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(PALETA.fondo, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const saved = ['role', 'aria-label', 'data-ready'].map(name => [name, container.getAttribute(name)]);
  const oldPosition = container.style.position;
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.setAttribute('role', 'img');
  container.removeAttribute('data-ready');
  const stage = document.createElement('div');
  stage.className = 'monedas-stage';
  const labels = new CSS2DRenderer();
  labels.sortObjects = false;
  labels.domElement.className = 'monedas-overlay';
  stage.append(sceneStyle(), renderer.domElement, labels.domElement);
  container.append(stage);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 300);
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = pmrem.fromScene(room, 0.04);
  scene.environment = studio.texture;
  scene.environmentIntensity = 0.82;
  const coinRoom = coinStudio();
  const coinLight = pmrem.fromScene(coinRoom, 0.02);
  coinRoom.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  room.dispose();
  pmrem.dispose();
  const key = new THREE.DirectionalLight(PALETA.superficie, 1.65);
  key.position.set(-3, 6, 5);
  scene.add(key);

  const plane = new THREE.PlaneGeometry();
  const texture = softShadow();
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  // La sombra de contacto de cada moneda se desvanece mientras está en el aire.
  shadowMaterial.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
      '#ifdef USE_COLOR\n\tdiffuseColor.a *= vColor.r;\n#endif');
  };
  const satin = new THREE.MeshStandardMaterial({ color: PALETA.superficie, roughness: 0.42, metalness: 0.12 });
  const fillMaterial = new THREE.MeshStandardMaterial({ color: PALETA.superficie, roughness: 0.52 });
  function instances(geometry, material) {
    const mesh = new THREE.InstancedMesh(geometry, material, LETTERS.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }
  const coins = euroCoins(instances, coinLight.texture);
  // La cámara de inspección solo ve la capa del modelo y su luz de estudio.
  if (closeup) {
    camera.layers.set(1);
    key.layers.enable(1);
    const flip = closeup === 'cruz' ? Math.PI : 0;
    const orientation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(REST + flip, .20, 0, 'YXZ'));
    for (const mesh of coins) {
      mesh.layers.set(1);
      mesh.count = 1;
      mesh.setMatrixAt(0, orientation);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  const tracks = instances(capsule(0.47, HEIGHT, 0.032), satin);
  const fillGeometry = capsule(FILL_WIDTH, FILL_HEIGHT, 0.019);
  // De cápsula a disco: se traslada el casquete superior y el inferior conserva su radio.
  const positions = fillGeometry.attributes.position;
  const offsets = new THREE.Float32BufferAttribute(new Float32Array(positions.count * 3), 3);
  for (let i = 0; i < positions.count; i++)
    if (positions.getY(i) > FILL_HEIGHT / 2) offsets.setY(i, FILL_WIDTH - FILL_HEIGHT);
  fillGeometry.morphTargetsRelative = true;
  fillGeometry.morphAttributes.position = [offsets];
  const fillPose = new THREE.Mesh(fillGeometry, fillMaterial);
  const fills = instances(fillGeometry, fillMaterial);
  const shadows = instances(plane, shadowMaterial);
  shadows.renderOrder = -2;
  const pose = new THREE.Object3D();
  function place(mesh, i, x, y, z, sx, sy, rotation = 0) {
    pose.position.set(x,y,z);
    pose.rotation.set(rotation,0,0);
    pose.scale.set(sx,sy,1);
    pose.updateMatrix();
    mesh.setMatrixAt(i, pose.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }
  for (let i = 0; i < LETTERS.length; i++) place(tracks, i, columnX(i), BASE, 0, 1, 1);
  const colors = Object.fromEntries(['tenue','acento','okVivo','superficie'].map(k => [k, new THREE.Color(PALETA[k])]));
  const color = new THREE.Color();
  function chartPlane(tint, opacity, order) {
    const mat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(plane, mat);
    mesh.renderOrder = order;
    scene.add(mesh);
    return mesh;
  }
  const band = chartPlane(PALETA.acento, BAND_ALPHA, 1);
  const borders = [chartPlane(PALETA.acento, EDGE_ALPHA, 2), chartPlane(PALETA.acento, EDGE_ALPHA, 2)];
  const middle = chartPlane(PALETA.tenue, 0.72, 3);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.449,0.47,96,1,Math.PI/2),
    new THREE.MeshBasicMaterial({ color: PALETA.okVivo, side: THREE.DoubleSide, toneMapped: false }));
  // Si el público falla, su anillo se atenúa: así destaca la trucada y no compiten dos anillos.
  const pickRing = new THREE.Mesh(new THREE.RingGeometry(0.425, 0.443, 96),
    new THREE.MeshBasicMaterial({ color: PALETA.acento, side: THREE.DoubleSide, toneMapped: false,
      transparent: true, depthWrite: false }));
  scene.add(ring, pickRing);

  const values = Array.from(LETTERS, () => addLabel(scene, '', 'monedas-value'));
  const letters = Array.from(LETTERS, (letter, i) => {
    const label = addLabel(scene, letter, 'monedas-value monedas-letter');
    label.object.position.set(columnX(i), -0.095, 0.49);
    return label;
  });
  const expected = addLabel(scene, '50 %', 'monedas-pill');
  const chance = addLabel(scene, 'lo que puede hacer el azar', 'monedas-pill monedas-chance');
  const reward = addLabel(scene, 'trucada: sale cara el 60 %', 'monedas-pill monedas-reward');
  const rewardGuide = guide(reward, PALETA.okVivo);
  const counter = addLabel(scene, '', 'monedas-value monedas-count');
  const sideNotes = [expected, chance].map((label, i) => {
    const sign = i ? 1 : -1;
    label.object.position.set(sign * EDGE, BASE + HEIGHT / 2, FRONT);
    const tint = i ? PALETA.acento : PALETA.tenue;
    return { label, sign, leader: guide(label, tint), elbow: guide(label, tint) };
  });
  let width = 0, height = 0, pitch = 1;
  const screen = new THREE.Vector3();
  function project(point) {
    screen.copy(point).project(camera);
    return { x: (1 + screen.x) * width / 2, y: (1 - screen.y) * height / 2 };
  }
  let count = -1, target = TOTALS[initial], clock = 0, batch = null;
  let chosen = null, pickListener = null;
  let revealTarget = initial === 5, revealLevel = Number(revealTarget), revealTween = null;
  let spread = 0, bandAlpha = 0;
  let running = false, disposed = false, pending = 0, lastFrame = 0;
  const columns = Array.from(LETTERS, () => ({ ratio: 0, angle: REST, lift: 0, flights: [] }));
  let variation;
  function reseed() { variation = randomStream(seed ^ 0x27d4eb2d); }
  reseed();

  function describe() {
    if (closeup) {
      container.setAttribute('aria-label', 'Moneda de 1 euro en primer plano. ' +
        (closeup === 'cara' ? 'Cara española con retrato, España y 2015.' : 'Cruz con el valor y el mapa de Europa.'));
      return;
    }
    const state = revealTarget ? ' La moneda ' + LETTERS[rigged] + ' está trucada y sale cara el 60 % de las veces.' : '';
    const vote = chosen === null ? '' : ' El público ha elegido la ' + LETTERS[chosen] + '.' +
      (revealTarget ? (chosen === rigged ? ' Ha acertado.' : ' No coincide.') : '');
    container.setAttribute('aria-label', 'Diez monedas de 1 euro, de la A a la J. ' + trials(count)
      + ' por moneda.' + (count ? ' Las barras muestran el porcentaje de caras. La franja azul marca el azar alrededor del 50 %.' : ' Las barras están vacías.') + state + vote);
  }
  function showCount(n) {
    if (count === n) return;
    count = n;
    counter.span.textContent = trials(n);
    describe();
    options.onCount?.(n);
  }
  function settle() {
    batch = revealTween = null;
    revealLevel = Number(revealTarget);
    history.extend(target);
    columns.forEach((col, i) => {
      col.ratio = history.ratio(i, target);
      col.angle = history.face(i, target);
      col.lift = 0;
      col.flights.length = 0;
    });
    spread = halfBand(target);
    bandAlpha = Number(target > 0);
    showCount(target);
    describe();
  }

  function draw() {
    if (disposed || !width || !height) return;
    if (closeup) {
      renderer.render(scene, camera);
      container.dataset.ready = '1';
      return;
    }
    const middleY = BASE + HEIGHT / 2;
    // La franja va entre las guías blancas y los rellenos: tiñe el hueco, no las barras.
    band.position.set(0, middleY, 0.07);
    band.scale.set(2 * EDGE, 2 * FILL_HEIGHT * spread, 1);
    band.material.opacity = BAND_ALPHA * bandAlpha;
    band.visible = chance.object.visible = bandAlpha > 0.001;
    borders.forEach((edge, i) => {
      edge.visible = band.visible;
      edge.material.opacity = EDGE_ALPHA * bandAlpha;
      edge.position.set(0, middleY + (i ? 1 : -1) * FILL_HEIGHT * spread, FRONT);
      edge.scale.set(2 * EDGE, 2.6 / pitch, 1);
    });
    middle.position.set(0, middleY, FRONT);
    middle.scale.set(2 * EDGE, 1.35 / pitch, 1);
    columns.forEach((col, i) => {
      const x = columnX(i);
      const raised = i === rigged ? revealLevel : 0;
      const y = 0.417 + col.lift + raised * 0.17;
      const z = 0.46 + col.lift * 0.17;
      place(coins[0], i, x, y, z, 1, 1, col.angle);
      for (let j = 1; j < coins.length; j++) {
        coins[j].setMatrixAt(i, pose.matrix);
        coins[j].instanceMatrix.needsUpdate = true;
      }
      const shrink = 1 / (1 + 0.35 * col.lift);
      place(shadows, i, x + 0.015, 0.003, 0.46, shrink, 0.86 * shrink, -Math.PI / 2);
      shadows.setColorAt(i, color.setRGB(1 / (1 + 2.5 * col.lift), 1, 1));
      const outside = count > 0 && Math.abs(col.ratio - 0.5) > spread + 1e-9;
      const muted = i === rigged ? 0 : revealLevel;
      color.copy(outside ? colors.acento : colors.tenue).lerp(colors.okVivo, raised).lerp(colors.superficie, muted * 0.3);
      fills.setColorAt(i, color);
      const fillHeight = FILL_HEIGHT * col.ratio;
      fillPose.morphTargetInfluences[0] = clamp((FILL_HEIGHT - fillHeight) / (FILL_HEIGHT - FILL_WIDTH), 0, 1);
      fills.setMorphAt(i, fillPose);
      const size = Math.min(1, fillHeight / FILL_WIDTH);
      place(fills, i, x, BASE + FILL_INSET, .091, size, size);
      const value = values[i];
      value.object.visible = (count > 0 || col.ratio > 0.001) && !(batch?.single && col.flights.length);
      // La fila fija de porcentajes queda por encima de las guías.
      value.object.position.set(x, BASE + HEIGHT + 0.1, FRONT);
      const percent = Math.round(100 * col.ratio) + '\u00a0%';
      if (value.span.textContent !== percent) value.span.textContent = percent;
      value.span.style.color = css(raised > 0.01 ? PALETA.ok : outside ? PALETA.acento : PALETA.tinta);
      value.span.style.opacity = String(1 - muted * 0.4);
      letters[i].span.style.color = css(i !== chosen ? PALETA.tinta : raised > .001 ? PALETA.ok : PALETA.acento);
      if (i === chosen) {
        pickRing.position.set(x, y, z);
        pickRing.rotation.x = col.angle;
      }
      if (i === rigged) {
        ring.position.set(x, y, z + 0.005);
        ring.rotation.x = col.angle;
      }
    });
    fills.instanceColor.needsUpdate = true;
    fills.morphTexture.needsUpdate = true;
    shadows.instanceColor.needsUpdate = true;
    const matched = chosen === rigged;
    pickRing.visible = chosen !== null;
    pickRing.material.color.copy(colors.acento).lerp(colors.okVivo, matched ? revealLevel : 0);
    pickRing.material.opacity = matched ? 1 : 1 - 0.55 * revealLevel;
    reward.object.visible = revealLevel > .001;
    ring.visible = reward.object.visible && !matched;
    ring.geometry.setDrawRange(0, 6 * Math.round(96 * revealLevel));
    if (reward.object.visible) {
      reward.object.position.set(columnX(rigged), BASE + HEIGHT + 0.1, FRONT);
      const top = project(reward.object.position);
      const margin = Math.min(width / 2, fontSize() * 8.25);
      const dx = clamp(top.x, margin, width - margin) - top.x;
      const above = Math.round(fontSize() * 1.22 + 12);
      reward.span.style.transform = `translate(calc(-50% + ${dx}px),calc(-100% - ${above}px))`;
      lineBetween(rewardGuide, dx, -above, -dx, 10);
      reward.object.element.style.opacity = String(revealLevel);
    }
    labels.render(scene, camera);
    renderer.render(scene, camera);
    container.dataset.ready = '1';
  }

  function fontSize() { return clamp(Math.min(width / 38, height / 32), 12, 24); }
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (disposed || w === width && h === height) return;
    width = w; height = h;
    if (!w || !h) return;
    renderer.setSize(w, h);
    labels.setSize(w, h);
    camera.aspect = w / h;
    if (closeup) {
      // La moneda llena el 80 % de la dimensión menor, con aire alrededor del canto.
      const halfFrame = COIN_WIDTH / (2 * 0.80 * Math.min(1, camera.aspect));
      // Ampliación óptica desde la distancia de la fila: la perspectiva conserva el reflejo.
      const distance = 24;
      camera.zoom = distance * Math.tan(camera.fov * Math.PI / 360) / halfFrame;
      const elevation = 14 * Math.PI / 180;
      camera.position.set(0, distance * Math.sin(elevation), distance * Math.cos(elevation));
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      draw();
      return;
    }
    const font = fontSize();
    const countFont = Math.min(font * 2, h * 0.065);
    stage.style.setProperty('--monedas-font', font + 'px');
    stage.style.setProperty('--monedas-count-font', countFont + 'px');
    // El contador, la revelación y los porcentajes tienen cada uno su propia altura.
    const topSpace = countFont * 1.15 + font * 3.6 + 30;
    const sideMargin = font * 6.8 + 32;
    const wideBottom = font + 50;
    const compact = (w - 2 * sideMargin) / 10.12 < .85 * (h - topSpace - wideBottom) / 6.36;
    const bottomSpace = compact ? font * 4.8 + 18 : wideBottom;
    pitch = Math.min((w - (compact ? 56 : 2 * sideMargin)) / 10.12,
      (h - topSpace - bottomSpace) / 6.36);
    pitch = Math.max(1, pitch);
    const distance = h / (2 * Math.tan(camera.fov * Math.PI / 360) * pitch);
    const tilt = 10 * Math.PI / 180, focusY = 2.84;
    // Cámara alta pero mirando en horizontal, con el encuadre descentrado (como un objetivo
    // descentrable): las barras salen verticales y paralelas, sin converger hacia abajo.
    const rise = distance * Math.sin(tilt);
    camera.position.set(0, focusY + rise, distance);
    camera.lookAt(0, focusY + rise, 0);
    camera.setViewOffset(w, h, 0, rise * pitch + (bottomSpace - topSpace) / 2, w, h);
    camera.updateMatrixWorld();
    const countBottom = Math.min(40, h * 0.035) + countFont * 1.1;
    counter.object.position.set(0, 1 - 2 * countBottom / h, 0).unproject(camera);
    // En los extremos, dos cimas a distinta altura se acercan por la perspectiva.
    // Reservar el ancho de «100 %» incluso en ese caso y con la fuente de reserva.
    let gap = Infinity, previousRight = -Infinity;
    for (let i = 0; i < LETTERS.length; i++) {
      const point = new THREE.Vector3(columnX(i), BASE + 0.045, FRONT);
      const bottomX = project(point).x;
      point.y += HEIGHT;
      const topX = project(point).x;
      gap = Math.min(gap, Math.min(bottomX, topX) - previousRight);
      previousRight = Math.max(bottomX, topX);
    }
    stage.style.setProperty('--monedas-value-font', Math.min(font, (gap - 4) / 3.1) + 'px');
    for (const { label, leader, elbow, sign } of sideNotes) {
      const anchor = project(label.object.position);
      const dx = sign * 15;
      lineBetween(leader, 0, 0, dx, 0);
      elbow.hidden = !compact;
      if (compact) {
        const bottom = project(new THREE.Vector3(0, -0.095, 0.49)).y + font * 1.45 + 7;
        lineBetween(elbow, dx, 0, 0, bottom - anchor.y);
        const edge = clamp(anchor.x + dx, 12, w - 12);
        label.span.style.transform = `translate(calc(${sign < 0 ? '0%' : '-100%'} + ${edge - anchor.x}px),${bottom - anchor.y}px)`;
      } else {
        label.span.style.transform = `translate(calc(${sign < 0 ? '-100%' : '0%'} + ${dx}px),-50%)`;
      }
    }
    draw();
  }

  // Si llega otra tanda en pleno vuelo, se conserva el arco actual y se enlaza
  // el siguiente desde su aterrizaje. El destino acumulado incluye ambas tandas.
  function planFlights(n, single, duration) {
    let firstLanding = Infinity, lastLanding = clock;
    columns.forEach((col, i) => {
      const delay = i * 17 + variation() * 17;
      const active = col.flights.find(flight => flight.start <= clock && clock < flight.end);
      const start = active ? active.end : clock + delay;
      const end = Math.max(clock + duration - 184 + delay, start + 280);
      const angle = active ? active.to : col.angle;
      const face = history.face(i, n);
      const turns = single ? 1 : 2 + Math.floor(variation() * 2);
      const to = face + TAU * (Math.ceil((angle - face) / TAU - 1e-9) + turns);
      const flight = { start, end, from: angle, to, lift: active ? 0 : col.lift,
        peak: (single ? 0.6 : 0.95) + variation() * (single ? 0.12 : 0.3) };
      col.flights = active ? [active, flight] : [flight];
      firstLanding = Math.min(firstLanding, end);
      lastLanding = Math.max(lastLanding, end);
    });
    return { firstLanding, lastLanding };
  }
  function fly(col) {
    while (col.flights.length && clock >= col.flights[0].end) {
      col.angle = col.flights.shift().to;
      col.lift = 0;
    }
    const flight = col.flights[0];
    if (!flight || clock < flight.start) return;
    const t = (clock - flight.start) / (flight.end - flight.start);
    col.angle = lerp(flight.from, flight.to, t * t * (3 - 2 * t));
    col.lift = (1 - t) * flight.lift + 4 * t * (1 - t) * flight.peak;
  }
  function revealTo(wanted) {
    if (revealTarget === wanted) return;
    revealTarget = wanted;
    revealTween = { from: revealLevel, start: clock };
    describe();
  }
  function moveTo(n, wanted) {
    history.extend(n);
    if (fixed || motion.matches) {
      target = n;
      revealTarget = wanted;
      settle();
      draw();
      return;
    }
    // Al saltar directamente al paso 5, la revelación sigue a la última tirada.
    if (!wanted || n === count) revealTo(wanted);
    if (n === target && batch) {
      batch.revealAfter = wanted;
      wake();
      return;
    }
    target = n;
    if (target < count || (target === count && batch)) {
      const poses = columns.map((col, i) => {
        col.flights.length = 0;
        const face = history.face(i, n);
        return { ratio: col.ratio, angle: col.angle, lift: col.lift,
          to: face + TAU * Math.round((col.angle - face) / TAU) };
      });
      batch = { back: true, start: clock, end: clock + 780, from: count, poses,
        spread, alpha: bandAlpha, revealAfter: wanted };
    } else if (n > count) {
      const single = count === 0 && n === 1;
      const duration = single ? 975 : Math.min(2260, 1300 + 300 * Math.log10(n - count + 1));
      const { firstLanding, lastLanding } = planFlights(n, single, duration);
      batch = { start: clock, end: lastLanding, from: count, single, firstLanding,
        countEnd: lastLanding - 185, revealAfter: wanted };
    }
    wake();
  }

  function advance(dt) {
    if (batch) {
      const t = clamp((clock - batch.start) / (batch.end - batch.start), 0, 1);
      if (batch.back) {
        const a = ease(t);
        showCount(Math.round(lerp(batch.from, target, a)));
        columns.forEach((col, i) => {
          const from = batch.poses[i];
          col.ratio = lerp(from.ratio, history.ratio(i, target), a);
          col.angle = lerp(from.angle, from.to, a);
          col.lift = (1 - a) * from.lift;
        });
        spread = lerp(batch.spread, halfBand(target), a);
        bandAlpha = lerp(batch.alpha, Number(target > 0), a);
      } else {
        const progress = clamp((clock - batch.start) / Math.max(1, batch.countEnd - batch.start), 0, 1);
        const n = batch.single ? Number(clock >= batch.firstLanding)
          : Math.round(lerp(batch.from, target, 1 - (1 - progress) ** 2));
        const firstSample = count === 0 && n > 0;
        showCount(n);
        const blend = 1 - Math.exp(-dt / 75);
        columns.forEach((col, i) => {
          fly(col);
          const landed = !batch.single || !col.flights.length;
          const value = landed ? history.ratio(i, n) : 0;
          col.ratio = lerp(col.ratio, value, batch.single || firstSample ? 1 : blend);
        });
        // El primer intervalo ya ocupa toda la escala en cuanto hay un dato.
        spread = lerp(spread, halfBand(n), bandAlpha === 0 ? 1 : blend);
        bandAlpha = Number(n > 0);
      }
      if (t === 1) {
        const wanted = batch.revealAfter;
        batch = null;
        showCount(target);
        columns.forEach((col, i) => {
          col.ratio = history.ratio(i, target);
          col.angle = history.face(i, target);
          col.lift = 0;
          col.flights.length = 0;
        });
        spread = halfBand(target);
        bandAlpha = Number(target > 0);
        revealTo(wanted);
      }
    }
    if (revealTween) {
      const t = clamp((clock - revealTween.start) / 600, 0, 1);
      revealLevel = lerp(revealTween.from, Number(revealTarget), t * (2 - t));
      if (t === 1) revealTween = null;
    }
  }
  function frame(now) {
    pending = 0;
    if (!running || disposed) return;
    const dt = Math.max(0, now - lastFrame);
    lastFrame = now;
    clock += dt;
    advance(dt);
    draw();
    if (running && (batch || revealTween) && !pending) pending = requestAnimationFrame(frame);
  }
  function wake() {
    if (running && !pending && (batch || revealTween)) {
      lastFrame = performance.now();
      pending = requestAnimationFrame(frame);
    }
  }
  function start() {
    if (fixed || disposed || running) return;
    running = true;
    wake();
  }
  function stop() {
    running = false;
    if (pending) cancelAnimationFrame(pending);
    pending = 0;
  }
  function step(index) {
    if (disposed) return;
    const view = stepIndex(index);
    moveTo(TOTALS[view], view === TOTALS.length - 1);
  }
  function toss(n) {
    validateCount(n);
    validateCount(target + n);
    if (!disposed && n > 0) moveTo(target + n, batch?.revealAfter ?? revealTarget);
    return target;
  }
  function reveal() {
    if (disposed) return;
    if (batch) batch.revealAfter = true;
    revealTo(true);
    if (fixed || motion.matches) {
      revealLevel = 1;
      revealTween = null;
      draw();
    } else wake();
  }
  function pick(index) {
    if (disposed) return;
    if (index !== null && (!Number.isInteger(index) || index < 0 || index >= LETTERS.length))
      throw new RangeError('La moneda elegida debe estar entre 0 y 9.');
    if (chosen === index) return;
    chosen = index;
    describe();
    draw();
  }
  function onPick(callback) {
    if (callback != null && typeof callback !== 'function') throw new TypeError('Se necesita una función.');
    if (!disposed) pickListener = callback;
    return () => { if (pickListener === callback) pickListener = null; };
  }
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const front = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.46), touched = new THREE.Vector3();
  function coinAt(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.set(2 * (event.clientX - rect.left) / rect.width - 1, 1 - 2 * (event.clientY - rect.top) / rect.height);
    ray.setFromCamera(pointer, camera);
    // La esfera que Three guarda para cada conjunto de instancias cambia durante el salto.
    for (const mesh of coins) mesh.computeBoundingSphere();
    const hit = ray.intersectObjects(coins, false)[0];
    if (hit) return hit.instanceId;
    // También vale tocar al lado de la moneda o su letra: la columna de debajo de las barras.
    if (!ray.ray.intersectPlane(front, touched) || touched.y < -0.45 || touched.y > 0.86) return null;
    const column = Math.round(touched.x + 4.5);
    return column >= 0 && column < LETTERS.length && Math.abs(touched.x - columnX(column)) < 0.46 ? column : null;
  }
  function clickCoin(event) {
    const index = coinAt(event);
    if (index === null) return;
    event.stopPropagation();
    pick(index);
    pickListener?.(index);
  }
  // Si alguien escucha los toques (el juego), la mano avisa de que la moneda se puede tocar.
  function hoverCoin(event) {
    renderer.domElement.style.cursor = pickListener && coinAt(event) !== null ? 'pointer' : '';
  }
  function reset({ semilla = seed, trucada = rigged } = {}) {
    if (disposed) return;
    history = historyFor(semilla, trucada);
    seed = semilla; rigged = trucada;
    reseed();
    target = 0;
    chosen = null;
    revealTarget = false;
    settle();
    draw();
  }
  function motionChanged() {
    if (!motion.matches) return;
    if (pending) cancelAnimationFrame(pending);
    pending = 0;
    revealTarget = batch?.revealAfter ?? revealTarget;
    settle();
    draw();
  }

  settle();
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  if (!fixed) {
    motion.addEventListener('change', motionChanged);
    renderer.domElement.addEventListener('click', clickCoin);
    renderer.domElement.addEventListener('pointermove', hoverCoin);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    observer.disconnect();
    if (!fixed) motion.removeEventListener('change', motionChanged);
    renderer.domElement.removeEventListener('click', clickCoin);
    renderer.domElement.removeEventListener('pointermove', hoverCoin);
    pickListener = null;
    const resources = new Set([texture, studio, coinLight]);
    scene.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) {
        resources.add(object.material);
        for (const map of ['normalMap', 'map', 'roughnessMap'])
          if (object.material[map]) resources.add(object.material[map]);
      }
      if (object.isInstancedMesh) resources.add(object);
    });
    scene.environment = null;
    resources.forEach(resource => resource.dispose());
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
    stage.remove();
    container.style.position = oldPosition;
    for (const [name, value] of saved) {
      if (value === null) container.removeAttribute(name);
      else container.setAttribute(name, value);
    }
  }
  return { steps: TOTALS.length, start, stop, step, toss, reset, reveal, pick, onPick, dispose };
}
