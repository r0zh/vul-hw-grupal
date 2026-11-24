// V2 «Anatomía de una traza» (GUION.md §3, diapositiva «montaje»): la señal de la CW1101 de la víctima al USB-C, en cinco trozos
// que avanzan con los pasos de la diapositiva y un bucle para el último. Es un solo timeline de 462 fotogramas a 30 fps
// que va en dos vídeos, v2.mp4 (TROZOS) y v2-bucle.mp4 (BUCLE):
//   paso 0 · víctima      0–59   K0 quieta 0,4 s y baja a K1
//   paso 1 · shunt       60–137  K1 → K2; se dibuja la medida desde la víctima hasta la zona MEASURE
//   paso 2 · ADC        138–209  K2 → K3; la medida llega al ADC
//   paso 3 · capturador 210–287  K3 → K4; cuatro muestras van del ADC al capturador y entran en el USB-C
//   paso 4 · reloj      288–341  K4 → K5; se dibujan el reloj y el disparo
//   bucle               342–461  disparo, cinco tics con su muestra, el paquete al USB-C y calma (periódico, 4 s)
// Coordenadas del guion en el marco P, en mm (origen en el centro del contorno de la PCB, +Z hacia el USB-C); la escena
// va en metros, con la placa levantada LIFT como en el piloto. Los recorridos son un esquema (GUION §1): no son pistas.
//
// Render y vídeos (desde cine/; el JSON de las etiquetas es el de render.mjs --anclas, sin GPU):
//   node render.mjs planos/v2.mjs --nativo --ancho 1152 --alto 724 --muestras 128
//   d=$PWD/salida/v2/1152x724-128-oidn; mkdir -p v2a v2b; for i in $(seq 0 461); do n=$(printf %04d $i)
//     if [ $i -le 341 ]; then ln -s $d/$n.png v2a/; else ln -s $d/$n.png v2b/$(printf %04d $((i - 342))).png; fi; done
//   sh codificar.sh v2a v2.mp4 30 -force_key_frames 0,1.95,1.9833,4.55,4.5833,6.95,6.9833,9.55,9.5833,11.35
//   sh codificar.sh v2b v2-bucle.mp4
//   node render.mjs planos/v2.mjs --anclas ../video/v2.json --ancho 1152 --alto 724
// (los fotogramas clave, en el primero y el último de cada trozo: el módulo del deck salta ahí sin decodificar de lejos).
//
// Sesión de Cook (GUION §1): las piezas de los recorridos existen desde el primer fotograma y solo cambian valores. Cada
// una lleva material propio (rugosidad 0,3 + i·1e-4, para que el empaquetador no las fusione) con mezcla (opacidad 0 sin
// dibujar, 0,999 dibujada) y emisión mínima 1e-4. Su emisión no entra en el muestreo de luces (emissiveMis: false): así no
// hay triángulos emisivos y el árbol de luces es siempre el de las cajas, que cambiar la emisión rehace con otro número de
// nodos y Cook entonces recompila. Se ven igual (la cámara y los rebotes las encuentran), solo que no iluminan por NEE.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { loadModel, studio } from '../estudio.mjs';

export const fps = 30;
export const TROZOS = [[0, 59], [60, 137], [138, 209], [210, 287], [288, 341]]; // primer y último fotograma de cada paso
export const BUCLE = [342, 461];
export const duration = (BUCLE[1] + 1) / fps; // 15,4 s

const LIFT = 4; // mm: la placa flota sobre el suelo como en el piloto (sombra suave y separada)
const world = ([x, y, z]) => [x * 1e-3, (y + LIFT + 0.13) * 1e-3, z * 1e-3];
const LENS = { fov: 22, fStop: 22 };

// Fotogramas clave del guion (P, mm). El foco va al objetivo, que es el sujeto.
const K = [
  { eye: [-86.9, 164.9, 0.0], target: [-0.1, 1.5, 3.4] }, // K0 general
  { eye: [-70.2, 64.4, -68.7], target: [-1.4, 3.4, -16.4] }, // K1 víctima
  { eye: [-81.5, 100.5, -53.6], target: [2.3, 3.1, -8.9] }, // K2 shunt
  { eye: [-76.1, 76.3, -26.8], target: [0.1, 3.2, 6.7] }, // K3 ADC
  { eye: [-107.6, 96.3, -8.1], target: [0.2, 3.9, 26.0] }, // K4 capturador
  // K5 reloj: la del guion desplazada 6 mm hacia la cámara y 4 hacia el USB-C, para que la placa suba y se corra a la
  // izquierda y la tarjeta del paso 4 quepa abajo a la derecha sin taparla.
  { eye: [-58.4, 184.2, 3.5], target: [-6.2, 1.5, 7.0] },
].map(({ eye, target }) => {
  const d = eye.map((c, k) => c - target[k]), dist = Math.hypot(...d);
  return { target, dist, az: Math.atan2(d[0], d[2]), el: Math.asin(d[1] / dist) };
});
// Movimientos de cámara: [desde, hasta] en segundos del timeline, de K[i] a K[i + 1]. Cada uno acaba antes del último
// fotograma de su trozo (el del paso 0, en 1,95 s y no en 2,0), para que ese fotograma, que es el póster, esté en su clave.
const MOVES = [[0.4, 1.95], [2.0, 3.6], [4.6, 6.2], [7.0, 8.6], [9.6, 11.0]];

// Etiquetas (GUION §3): ancla en P, paso, segundo del timeline en que entran (con la cámara ya quieta) y esquina de arriba
// a la izquierda de la tarjeta, en fracción del contenedor. Las cuatro van en el mismo sitio, el suelo vacío de arriba a la
// izquierda de cada encuadre, y la línea baja recta hasta el ancla; la del paso 4 no tiene ancla y va abajo a la derecha.
const CARD = [0.045, 0.08];
const ETIQUETAS = [
  { id: 'victima', paso: 0, entra: 1.85, ancla: [1.8, 2.7, -23.65], tarjeta: CARD },
  { id: 'shunt', paso: 1, entra: 4.4, ancla: [5.7, 3.41, -21.3], tarjeta: CARD },
  { id: 'adc', paso: 2, entra: 6.8, ancla: [1.6, 2.7, -1.55], tarjeta: CARD },
  { id: 'capturador', paso: 3, entra: 9.4, ancla: [0.2, 3.1, 11.65], tarjeta: CARD },
  { id: 'regalado', paso: 4, entra: 11.4, ancla: null },
];
export const cues = {
  trozos: TROZOS, bucle: BUCLE,
  etiquetas: ETIQUETAS.map(({ id, paso, entra, tarjeta }) => ({ id, paso, entra: Math.round(entra * fps), ...(tarjeta ? { tarjeta } : {}) })),
};
export const anclas = () => Object.fromEntries(ETIQUETAS.filter((e) => e.ancla).map((e) => [e.id, world(e.ancla)]));

// cubic-bezier(.65, 0, .35, 1) del guion: se invierte x(u) por bisección.
function ease(s) {
  if (s <= 0) return 0;
  if (s >= 1) return 1;
  const bezier = (u, a, b) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (bezier(mid, 0.65, 0.35) < s) lo = mid; else hi = mid;
  }
  return bezier((lo + hi) / 2, 0, 1);
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const progress = (t, [a, b]) => clamp01((t - a) / (b - a));

// Objetivo en línea recta; ojo en esféricas alrededor de él (acimut por el lado corto), y el foco a la par.
export function camera(t) {
  let i = 0;
  while (i < MOVES.length - 1 && t >= MOVES[i + 1][0]) i++;
  const e = ease(progress(t, MOVES[i])), A = K[i], B = K[i + 1];
  const mix = (a, b) => a + (b - a) * e;
  let dAz = B.az - A.az;
  dAz -= 2 * Math.PI * Math.round(dAz / (2 * Math.PI));
  const target = A.target.map((c, k) => mix(c, B.target[k]));
  const az = A.az + dAz * e, el = mix(A.el, B.el), dist = mix(A.dist, B.dist);
  const eye = [target[0] + dist * Math.cos(el) * Math.sin(az), target[1] + dist * Math.sin(el), target[2] + dist * Math.cos(el) * Math.cos(az)];
  return { eye: world(eye), target: world(target), ...LENS, focusDistance: dist * 1e-3 };
}

// ── Recorridos (GUION §3): nodos (X, Z) en P, a h = 3.41 mm; las cápsulas pasan a 3,6 sobre el capturador ──
const H = 3.41;
const PATHS = {
  medida: [[1.8, -23.65], [3.35, -23.65], [8, -19], [8, -16.45], [8, -9.95], [8, -5.47], [4.48, -1.95], [3.8, -1.95]],
  // Del ADC al capturador y al USB-C; el último nodo ya está dentro de la carcasa, que tapa la cápsula al entrar.
  muestras: [[1.6, 2.6, H], [0.2, 6.4, 3.6], [0.2, 11.65, 3.6], [2.5, 18, 3.6], [2.5, 24.3, H], [2.5, 26.5, H]],
  relojAdc: [[-6.3, 11.65], [-8.5, 9.5], [-8.5, -1.55], [-1.9, -1.55]],
  relojVictima: [[-8.5, -1.55], [-8.5, -21], [-5.85, -23.65], [-1.7, -23.65]],
  disparo: [[5.3, -25], [11, -19.3], [11, 9], [6.5, 11.65]],
};

// Esquinas redondeadas como signalPath() de placa.js (radio ≤ 0,85 mm y ≤ 0,4 de cada tramo) y una tabla de longitud de
// arco: at(s) da el punto y la tangente a s mm del principio.
function track(nodes) {
  const pts = nodes.map(([x, z, h = H]) => [x, h, z]);
  const dense = [pts[0]];
  const sub = (a, b) => a.map((c, k) => c - b[k]), len = (v) => Math.hypot(...v);
  const lerp = (a, b, u) => a.map((c, k) => c + (b[k] - c) * u);
  for (let i = 1; i < pts.length - 1; i++) {
    const at = pts[i], before = pts[i - 1], after = pts[i + 1];
    const r = Math.min(0.85, len(sub(at, before)) * 0.4, len(sub(at, after)) * 0.4);
    const entry = lerp(at, before, r / len(sub(at, before))), exit = lerp(at, after, r / len(sub(at, after)));
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      dense.push(lerp(lerp(entry, at, u), lerp(at, exit, u), u));
    }
  }
  dense.push(pts.at(-1));
  const cumulative = [0];
  for (let i = 1; i < dense.length; i++) cumulative.push(cumulative[i - 1] + len(sub(dense[i], dense[i - 1])));
  const length = cumulative.at(-1);
  function at(s) {
    s = Math.min(length, Math.max(0, s));
    let lo = 0, hi = dense.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cumulative[mid] <= s) lo = mid; else hi = mid; }
    const span = cumulative[hi] - cumulative[lo] || 1;
    const p = lerp(dense[lo], dense[hi], (s - cumulative[lo]) / span);
    // Tangente por diferencias centradas: gira con suavidad en las esquinas.
    const a = lerp(dense[Math.max(0, lo - 1)], dense[lo], 0.5), b = lerp(dense[hi], dense[Math.min(dense.length - 1, hi + 1)], 0.5);
    const d = sub(b, a), n = len(d) || 1;
    return { p, t: d.map((c) => c / n) };
  }
  return { length, at, nodeAt: (i) => cumulative[Math.min(dense.length - 1, 1 + 13 * (i - 1) + 6)] };
}
const T = Object.fromEntries(Object.entries(PATHS).map(([k, v]) => [k, track(v)]));
// Donde la rama de la víctima sale de la del ADC (la esquina (-8.5, -1.55) de relojAdc), en mm de esa rama.
const JUNCTION = T.relojAdc.nodeAt(2);

// Tubo de radio r (mm) entre s0 y s1 de un recorrido, en metros; tapas semiesféricas en los extremos que se pidan.
function tube(path, s0, s1, r, { start = false, end = false, sides = 12, step = 0.1 } = {}) {
  const rings = [];
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  const frame = (t) => {
    const side = [-t[2], 0, t[0]], k = Math.hypot(...side) || 1;
    const s = side.map((c) => c / k);
    const up = [s[1] * t[2] - s[2] * t[1], s[2] * t[0] - s[0] * t[2], s[0] * t[1] - s[1] * t[0]];
    return { s, up };
  };
  const ring = (p, t, radius, offset, normalTilt) => {
    const { s, up } = frame(t);
    const out = [];
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * 2 * Math.PI, c = Math.cos(a), si = Math.sin(a);
      const radial = s.map((v, k) => c * v + si * up[k]);
      const nrm = radial.map((v, k) => v * Math.cos(normalTilt) + t[k] * Math.sin(normalTilt));
      out.push({ p: p.map((v, k) => v + radial[k] * radius + t[k] * offset), n: nrm });
    }
    return out;
  };
  const caps = 6;
  if (start) {
    const { p, t } = path.at(s0);
    for (let k = 1; k < caps; k++) { const phi = (Math.PI / 2) * (1 - k / caps); rings.push(ring(p, t, r * Math.cos(phi), -r * Math.sin(phi), -phi)); }
  }
  for (let i = 0; i <= n; i++) { const { p, t } = path.at(s0 + ((s1 - s0) * i) / n); rings.push(ring(p, t, r, 0, 0)); }
  if (end) {
    const { p, t } = path.at(s1);
    for (let k = 1; k < caps; k++) { const phi = (Math.PI / 2) * (k / caps); rings.push(ring(p, t, r * Math.cos(phi), r * Math.sin(phi), phi)); }
  }
  const positions = [], normals = [], indices = [];
  for (const rg of rings) for (const v of rg) { positions.push(...world(v.p)); normals.push(...v.n); }
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + ((j + 1) % sides), c = a + sides, d = b + sides;
      indices.push(a, c, b, b, c, d);
    }
  }
  // Polos: cierran las tapas.
  const pole = (ringIndex, p, nrm) => {
    const index = positions.length / 3;
    positions.push(...world(p)); normals.push(...nrm);
    for (let j = 0; j < sides; j++) {
      const a = ringIndex * sides + j, b = ringIndex * sides + ((j + 1) % sides);
      if (ringIndex === 0) indices.push(index, a, b); else indices.push(index, b, a);
    }
  };
  if (start) { const { p, t } = path.at(s0); pole(0, p.map((v, k) => v - t[k] * r), t.map((v) => -v)); }
  if (end) { const { p, t } = path.at(s1); pole(rings.length - 1, p.map((v, k) => v + t[k] * r), t); }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}

// Cápsula a lo largo de +Z, centrada, en metros: radio r y largo total l (mm).
function capsule(r, l) {
  const straight = { length: l - 2 * r, at: (s) => ({ p: [0, -LIFT - 0.13, s - (l - 2 * r) / 2], t: [0, 0, 1] }) };
  return tube(straight, 0, straight.length, r, { start: true, end: true, sides: 16, step: straight.length });
}

// Piezas de los recorridos. La medida (tubo de 0,5 mm) va en tramos de 0,5 mm para dibujarse; el reloj, en tramos de 1 mm,
// y el disparo, a trazos de 1,5 mm con huecos de 1 mm, los dos de 0,36 mm (el guion dice 0,3: a 1152 px quedaban en 3 px).
function pieces(name, size, radius, gap = 0) {
  const path = T[name], out = [];
  const count = Math.max(1, Math.round(path.length / (size + gap)));
  const pitch = path.length / count;
  for (let i = 0; i < count; i++) {
    const s0 = i * pitch, s1 = gap ? s0 + pitch - gap : (i + 1) * pitch;
    out.push({ name, s0, s1, mid: (s0 + s1) / 2, geometry: tube(path, s0, s1, radius, { start: gap > 0 || i === 0, end: gap > 0 || i === count - 1 }) });
  }
  return out;
}
const PIECES = [...pieces('medida', 0.5, 0.25), ...pieces('relojAdc', 1, 0.18), ...pieces('relojVictima', 1, 0.18), ...pieces('disparo', 1.5, 0.18, 1)];
const CAPSULES = [...Array(4)].map(() => capsule(0.45, 2)).concat([capsule(0.45, 4.5)]); // cuatro muestras y el paquete

// Azul #0071e3 en lineal: con emisión 1, el mapa de tonos neutral lo deja en (2, 112, 226).
const BLUE = [0, 0.1651, 0.7682];
const glass = (i, lightMask) => ({
  name: `v2-${i}`, color: [0.01, 0.012, 0.02], metallic: 0, roughness: 0.3 + i * 1e-4, specular: 0.5,
  emissiveColor: BLUE, emission: 1e-4, emissiveMis: false, alphaMode: 'blend', opacity: 0, doubleSided: true, lightMask,
});

// Materiales del piloto: metales con su reflectancia real y la máscara con barniz semimate.
const LOOKS = {
  mascara: { metallic: 0, roughness: 0.5, specular: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.15 },
  oro: { color: [1, 0.766, 0.336], metallic: 1, roughness: 0.24 },
  estano: { color: [0.82, 0.82, 0.8], metallic: 1, roughness: 0.2 },
  acero: { color: [0.75, 0.74, 0.71], metallic: 1, roughness: 0.16 },
  encapsulado: { metallic: 0, roughness: 0.6 },
  marcado: { metallic: 0, roughness: 0.7 },
};

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export async function scene() {
  const { parts } = await loadModel('cw1101.glb');
  // Luces del piloto (estudio.mjs) colocadas para el acimut medio de las cámaras, unos 250°: ninguna caja cae en la
  // dirección especular de la cámara, que blanquearía la máscara.
  const { environment, floor, lightMask } = studio({ azimuth: 250 });
  const materials = new Map();
  const board = parts.map((part) => {
    if (!materials.has(part.material)) materials.set(part.material, { ...part.material, ...LOOKS[part.material?.name], lightMask });
    const matrix = Float32Array.from(part.matrix);
    matrix[12] -= 0.015; matrix[13] += (LIFT + 0.13) * 1e-3; matrix[14] += 0.03055;
    return { ...part, matrix, material: materials.get(part.material) };
  });
  const glow = [...PIECES, ...CAPSULES.map((geometry) => ({ geometry }))].map(({ geometry }, i) => (
    { name: `v2-${i}`, geometry, matrix: IDENTITY, material: glass(i, lightMask) }));
  return { parts: [floor, ...board], glow, environment };
}

// ── Estado de los recorridos en el segundo t ──
// Un trazo que se dibuja: la cabeza va de a a b (mm) entre los segundos t0 y t1; la cabeza brilla el triple y se apaga
// en 0,15 s al terminar.
const draws = (t, steps) => {
  let head = 0, glow = 0;
  for (const { span, from, to } of steps) {
    if (t < span[0]) break;
    head = from + (to - from) * ease(progress(t, span));
    glow = t <= span[1] ? 1 : Math.exp(-(t - span[1]) / 0.15);
  }
  return { head, glow };
};
const MEDIDA = [{ span: [2.6, 3.8], from: 0, to: T.medida.nodeAt(4) }, { span: [5.1, 6.0], from: T.medida.nodeAt(4), to: T.medida.length }];
// Reloj y disparo en el paso 4: el reloj sale del capturador, llega al ADC y, desde la esquina, a la víctima.
const CLOCK_SPAN = [10.0, 10.9], CLOCK_TOTAL = JUNCTION + T.relojVictima.length;
const LOOP0 = BUCLE[0] / fps;
const TICKS = [0.6, 1.1, 1.6, 2.1, 2.6];

function headBoost(s, head, glow) {
  return s > head ? 0 : 2 * glow * Math.exp(-(head - s) / 1.2);
}

// Estado: [emisión, opacidad] por pieza y [s, opacidad, recorrido] por cápsula.
export function state(t) {
  const loop = t >= LOOP0 ? (t - LOOP0) % 4 : null;
  const pieceState = [];
  const m = draws(t, MEDIDA);
  const clockDraw = (CLOCK_TOTAL * ease(progress(t, CLOCK_SPAN)));
  // En el bucle ya no queda brillo de ninguna cabeza: su primer fotograma enlaza con el último.
  const clockGlow = loop !== null ? 0 : t <= CLOCK_SPAN[1] ? 1 : Math.exp(-(t - CLOCK_SPAN[1]) / 0.1);
  if (loop !== null) m.glow = 0;
  const triggerHead = T.disparo.length * ease(progress(t, CLOCK_SPAN));
  // Tics del reloj: suben en un fotograma, se quedan 0,1 s y caen en otros 0,1 s.
  let tick = 0;
  if (loop !== null) for (const k of TICKS) {
    const d = loop - k;
    if (d >= 0 && d < 0.1) tick = 1; else if (d >= 0.1 && d < 0.2) tick = Math.max(tick, 1 - (d - 0.1) / 0.1);
  }
  // Pulso del disparo: de la víctima al capturador en 0,5 s; nace y muere fuera del trazo para entrar y salir suave.
  const pulse = loop !== null && loop < 0.6 ? -3 + (T.disparo.length + 6) * (loop / 0.6) : null;
  for (const piece of PIECES) {
    let emission = 1e-4, opacity = 0;
    if (piece.name === 'medida' && piece.s0 < m.head) {
      opacity = 0.999; emission = 1 + headBoost(piece.s0, m.head, m.glow);
    } else if (piece.name === 'relojAdc' || piece.name === 'relojVictima') {
      const head = piece.name === 'relojAdc' ? clockDraw : clockDraw - JUNCTION;
      if (piece.s0 < head) { opacity = 0.999; emission = 0.4 + 1.6 * tick + headBoost(piece.s0, head, clockGlow); }
    } else if (piece.name === 'disparo' && piece.s0 < triggerHead) {
      opacity = 0.999; emission = 0.7 + headBoost(piece.s0, triggerHead, clockGlow);
      if (pulse !== null) emission += 2.4 * Math.exp(-(((piece.mid - pulse) / 2.2) ** 2));
    }
    pieceState.push([emission, opacity]);
  }
  // Cápsulas: en el paso 3, cuatro muestras del ADC al USB-C; en el bucle, una muestra por tic hasta el capturador y el
  // paquete del capturador al USB-C.
  const capsules = [];
  const L = T.muestras.length, CAPTURER = T.muestras.nodeAt(2);
  const travel = (u, s0, s1) => s0 + (s1 - s0) * u;
  const fade = (s, s0, s1, tail) => Math.min(clamp01((s - s0) / 0.8), clamp01((s1 - s) / tail));
  for (let c = 0; c < 4; c++) {
    let s = 0, opacity = 0;
    const u = progress(t, [7.6 + 0.2 * c, 8.8 + 0.2 * c]);
    if (t > 7.6 + 0.2 * c && u < 1) { s = travel(u, 0, L); opacity = fade(s, 0, L, 2.2); }
    if (loop !== null) {
      const k = TICKS.findIndex((k0) => loop >= k0 && loop < k0 + 0.4);
      if (k >= 0 && k % 4 === c) { s = travel((loop - TICKS[k]) / 0.4, 0, CAPTURER); opacity = fade(s, 0, CAPTURER, 1.5); }
    }
    capsules.push([s, opacity * 0.999]);
  }
  {
    let s = CAPTURER, opacity = 0;
    if (loop !== null && loop >= 3.0 && loop < 3.6) { s = travel((loop - 3.0) / 0.6, CAPTURER, L); opacity = fade(s, CAPTURER, L, 2.6); }
    capsules.push([s, opacity * 0.999]);
  }
  return { pieces: pieceState, capsules };
}

function placeOnPath(s) {
  const { p, t } = T.muestras.at(s);
  const z = t, x0 = [z[2], 0, -z[0]], k = Math.hypot(...x0) || 1, x = x0.map((v) => v / k);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const [px, py, pz] = world(p);
  return new Float32Array([...x, 0, ...y, 0, ...z, 0, px, py, pz, 1]);
}

const round = (v) => Math.round(v * 1e4) / 1e4;

export function frame(t, base) {
  const cam = camera(t), { pieces: ps, capsules } = state(t);
  const glow = base.glow.map((part, i) => {
    const capsule = i >= ps.length ? capsules[i - ps.length] : null;
    const [emission, opacity] = capsule ? [3, capsule[1]] : ps[i];
    return {
      ...part,
      matrix: capsule ? placeOnPath(capsule[0]) : part.matrix,
      material: { ...part.material, emission: Math.max(1e-4, opacity > 0 ? emission : 1e-4), opacity },
    };
  });
  // Clave de los fotogramas iguales (render.mjs copia el PNG en vez de repetirlo): cámara y estado redondeados. Con la
  // cámara quieta, una semilla por fotograma clave: el ruido que deja OIDN no baila mientras solo cambian los recorridos.
  const key = JSON.stringify([cam.eye, cam.target, cam.focusDistance].flat().map((v) => Math.round(v * 1e7))
    .concat(ps.flat().map(round), capsules.flat().map(round)));
  const still = !MOVES.some(([a, b]) => t > a && t < b);
  return { camera: cam, parts: [...base.parts, ...glow], key, seed: still ? 1000 + MOVES.filter(([, b]) => t >= b).length : undefined };
}

// Comprobación del timeline sin renderizar: node planos/v2.mjs
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = (i) => state(i / fps), lit = (st, name) => PIECES.filter((p, k) => p.name === name && st.pieces[k][1] > 0).length;
  // Cada trozo acaba en su fotograma clave, quieto: el último fotograma es el póster de su paso.
  TROZOS.forEach(([, end], i) => {
    const c = camera(end / fps), k = K[i + 1], d = Math.hypot(...world(k.target).map((v, j) => v - c.target[j]));
    assert.ok(d < 1e-6 && Math.abs(c.focusDistance - k.dist * 1e-3) < 1e-6, `el trozo ${i} no acaba en K${i + 1}`);
  });
  assert.equal(lit(at(TROZOS[0][1]), 'medida'), 0, 'en el paso 0 no hay medida');
  assert.equal(lit(at(TROZOS[2][1]), 'medida'), PIECES.filter((p) => p.name === 'medida').length, 'al acabar el paso 2 la medida llega al ADC');
  assert.ok(at(TROZOS[3][1]).capsules.every(([, o]) => o === 0), 'el último fotograma del paso 3 ya no tiene cápsulas');
  // El bucle enlaza: su último fotograma está en calma y es casi el del final de la entrada del paso 4.
  const calm = at(BUCLE[1]), entry = at(TROZOS[4][1]);
  assert.ok(calm.capsules.every(([, o]) => o === 0), 'el bucle acaba sin cápsulas');
  calm.pieces.forEach(([e, o], k) => assert.ok(o === entry.pieces[k][1] && Math.abs(e - entry.pieces[k][0]) < 0.05, `pieza ${k} del bucle`));
  console.log(`v2: ${PIECES.length} piezas y ${CAPSULES.length} cápsulas; trozos, medida, cápsulas y bucle bien`);
}
