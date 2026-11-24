// Lo común a los planos: el estudio claro y la carga de los modelos de modelos/. Unidades en metros.
//
// El fondo del vídeo es el suelo: la cámara siempre mira hacia abajo, así que detrás de la placa solo hay suelo. Dos
// grupos de luces, separados con light linking (material.lightMask: bit 25 + i para el área i):
// - el suelo lo ilumina solo un panel enorme encima, y el cielo; con eso brilla igual en todo el encuadre salvo donde
//   la placa le tapa el panel, que es la sombra suave. Su albedo se calcula para que el tone map «neutral» de
//   render.mjs lo deje en #f5f5f7, el fondo de las diapositivas;
// - la placa (`lightMask` que devuelve studio) recibe solo las cajas de luz y el cielo. Las superficies planas
//   reflejan lo que tienen detrás a la altura de la cámara, así que de eso depende el aspecto: un gris medio deja la
//   máscara negra algo levantada y el oro claro; más brillo (o una caja de luz ahí) y la máscara se ve blanca.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { box, createEnvironmentMap } from '@codepawlhq/crucible';

// Radiancia lineal que toneMapToRgba8 (viewTransform 'neutral', exposure 1) deja en (245, 245, 247) = #f5f5f7, buscada
// probando valores con esa misma función. Cerca de ahí la curva es plana: ±5 % de brillo mueve 1 nivel como mucho.
export const BACKGROUND = [1.342, 1.342, 1.362];

const unit = (v) => v.map((c) => c / Math.hypot(...v));
const towards = (from, to) => unit(to.map((c, k) => c - from[k]));

// Punto a `distance` de `center`, con acimut (desde +Z hacia +X) y elevación en grados.
export function orbit(azimuth, elevation, distance, [x, y, z] = [0, 0, 0]) {
  const a = azimuth * Math.PI / 180, e = elevation * Math.PI / 180;
  return [x + distance * Math.cos(e) * Math.sin(a), y + distance * Math.sin(e), z + distance * Math.cos(e) * Math.cos(a)];
}

// Una caja de luz rectangular que mira al origen. `radiance` es su brillo (la intensidad de Crucible son las candelas
// del rectángulo entero: radiancia × área).
function softbox(azimuth, elevation, distance, width, height, radiance) {
  const position = orbit(azimuth, elevation, distance);
  return { position, direction: towards(position, [0, 0, 0]), up: [0, 1, 0], width, height, intensity: radiance * width * height };
}

// E/π bajo el centro de un rectángulo emisor de semilados a y b a una altura h, por unidad de radiancia (factor de forma).
function viewFactor(a, b, h) {
  const x = a / h, y = b / h, X = Math.hypot(1, x), Y = Math.hypot(1, y);
  return (2 / Math.PI) * (x / X * Math.atan(y / X) + y / Y * Math.atan(x / Y));
}

// `azimuth`: acimut medio de la cámara, para colocar las luces respecto a ella; `key` y `rim` escalan la principal
// (grande, arriba a la izquierda de la cámara) y la de recorte (una tira baja detrás de la placa: cantos y brillos).
export function studio({ azimuth = 60, key = 1, rim = 1 } = {}) {
  // Cielo de 128×64 (fila de arriba primero), lineal en el seno de la altura; bajo el horizonte, como en él.
  const W = 128, H = 64, horizon = 0.5, zenith = 1, tint = [1, 1, 1.01], data = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    const v = horizon + (zenith - horizon) * Math.max(0, Math.sin(Math.PI / 2 - Math.PI * (y + 0.5) / H));
    for (let x = 0; x < W; x++) data.set(tint.map((t) => v * t), (y * W + x) * 3);
  }
  // Suelo blanco mate sin brillo especular: devuelve albedo × E/π, con E/π = (horizonte + 2·cénit)/3 del cielo más
  // radiancia × factor de forma del panel (4 m × 4 m a 1,5 m: casi igual en todo lo que ve la cámara).
  const panel = { size: 4, height: 1.5, radiance: 1 };
  const irradiance = (horizon + 2 * zenith) / 3, fromPanel = panel.radiance * viewFactor(panel.size / 2, panel.size / 2, panel.height);
  const floor = {
    name: 'suelo', geometry: box(0),
    matrix: new Float32Array([8, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 8, 0, 0, -0.005, 0, 1]), // 8 m × 8 m, cara de arriba en y = 0
    material: { color: BACKGROUND.map((c, k) => c / (irradiance * tint[k] + fromPanel)), roughness: 1, metallic: 0, specular: 0, lightMask: 1 << 27 },
  };
  const environment = {
    map: createEnvironmentMap({ width: W, height: H, data, intensity: 1 }),
    keyIntensity: 0, // sin sol: la luz dura no pega con un render de producto
    areaLights: [
      softbox(azimuth - 50, 55, 0.4, 0.45, 0.45, 3 * key), // bit 25, principal
      softbox(azimuth + 180, 10, 0.35, 0.9, 0.12, 4 * rim), // bit 26, recorte: baja, para no reflejarse en toda la placa
      { position: [0, panel.height, 0], direction: [0, -1, 0], up: [0, 0, 1], width: panel.size, height: panel.size, intensity: panel.radiance * panel.size ** 2 }, // bit 27, solo el suelo
    ],
  };
  return { environment, floor, lightMask: (1 << 25) | (1 << 26) };
}

// Carga modelos/<name> con el lector de glTF de Crucible. Crucible decodifica las texturas con createImageBitmap, que
// Node no tiene; los PNG que escribe exportar-glb.mjs (Chromium) son RGBA o RGB de 8 bits sin entrelazar, así que basta
// con zlib y los cinco filtros de línea del PNG.
export async function loadModel(name) {
  globalThis.createImageBitmap ??= async (blob) => decodePng(Buffer.from(await blob.arrayBuffer()));
  const { parseGltf } = await import('@codepawlhq/crucible/addons/gltf');
  const bytes = readFileSync(new URL(`./modelos/${name}`, import.meta.url));
  return parseGltf(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

export function decodePng(png) {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), type = png[25];
  if (png[24] !== 8 || (type !== 6 && type !== 2) || png[28] !== 0) throw new Error('Solo leo PNG RGBA o RGB de 8 bits sin entrelazar');
  const chunks = [];
  // Hasta IEND: GLTFExporter rellena cada imagen con ceros hasta un múltiplo de 4 bytes.
  for (let at = 8; at + 12 <= png.length; at += 12 + png.readUInt32BE(at)) {
    const chunk = png.toString('latin1', at + 4, at + 8);
    if (chunk === 'IEND') break;
    if (chunk === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + png.readUInt32BE(at)));
  }
  const raw = inflateSync(Buffer.concat(chunks)), n = type === 6 ? 4 : 3, stride = width * n;
  if (raw.length !== (stride + 1) * height) throw new Error('PNG con datos de otra longitud');
  const data = new Uint8Array(width * height * 4).fill(255); // Uint8Array: Crucible toma una imagen con .data por RGBA8 ya decodificado
  let up = new Uint8Array(stride), row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x < n ? 0 : row[x - n], b = up[x], c = x < n ? 0 : up[x - n];
      let p = 0;
      if (filter === 1) p = a;
      else if (filter === 2) p = b;
      else if (filter === 3) p = (a + b) >> 1;
      else if (filter === 4) {
        const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[x] = line[x] + p;
    }
    for (let x = 0; x < width; x++) for (let k = 0; k < n; k++) data[(y * width + x) * 4 + k] = row[x * n + k];
    [up, row] = [row, up];
  }
  return { width, height, data, close() {} };
}
