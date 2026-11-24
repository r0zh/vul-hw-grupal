// V1 «Revelado» (GUION.md §2, diapositiva 1): la CW1101 da una vuelta entera en 12 s sobre el suelo del estudio claro.
// Es un giradiscos: la cámara y las luces se quedan quietas y la placa gira 1° por fotograma sobre su eje vertical, en
// sentido antihorario visto desde arriba. El fotograma 360 sería el 0, así que el vídeo hace bucle sin costura y se
// puede arrastrar para girarla (js/figuras/cine-v1.js).
//
//   node render.mjs planos/v1.mjs --nativo --ancho 900 --alto 968 --muestras 256      (vídeo: 360 fotogramas)
//   node render.mjs planos/v1.mjs --nativo --ancho 1800 --alto 1936 --muestras 512 --hasta 0   (foto fija, al doble)
//
// Antes de codificar se aplana el fondo: cada canal a un nivel o menos del de #f5f5f7 pasa a ese valor exacto. El suelo
// sale a caballo entre dos niveles (244,8 y 246,6 de media en R y B), así que en el H.264 el croma salta entre 128 y 129
// y el fondo se llena de manchas que cambian en cada fotograma; aplanado, sale liso y a un nivel de la diapositiva.
// Al tablero, como mucho, le cambia un nivel. En salida/v1/:
//   L="if(between(val,244,246),245,val)"; B="if(between(val,246,248),247,val)"
//   ffmpeg -i 900x968-256-oidn/%04d.png -vf "lutrgb=r='$L':g='$L':b='$B'" -start_number 0 plano/%04d.png
//   sh ../../codificar.sh plano ../../../video/v1.mp4 30 -g 10 -bf 0          (GOP corto: se arrastra sin tirones)
//   ffmpeg -i 1800x1936-512-oidn/0000.png -vf "lutrgb=r='$L':g='$L':b='$B'" -q:v 2 ../../../img/cine/v1-revelado.jpg
//
// Respecto al guion, lo que cambió el piloto (pod/LEEME.md): las luces son las del estudio común (estudio.mjs, con
// light linking), no una caja en la dirección especular de la cámara, que blanquea la máscara; y los materiales son
// los del piloto, más el canto de FR-4 en crema #d8c9a3 en lugar del melocotón de los colores de vértice de placa.js.
import { loadModel, studio } from '../estudio.mjs';

export const duration = 12; // s a 30 fps: 360 fotogramas, 1° cada uno
export const START = -50; // grados en el fotograma 0: el USB-C delante a la izquierda, como el póster de la portada

// La placa flota 4 mm sobre el suelo, como en el piloto: apoyada, su sombra de contacto es una raya fina y la placa
// parece pegada al suelo; flotando, la sombra suave de debajo la separa de él.
const LIFT = 0.004;

// La del guion, en metros (P × 0,001), subida lo mismo que la placa: elevación 28°, a 230 mm del centro y fov vertical
// de 24° (unos 91 mm a 900 × 968). El foco está en el centro, que siempre sale nítido. f/22 en vez del f/32 del guion:
// los extremos se desenfocan unos 6 px como mucho, cuando la placa mira de punta, y eso la hace parecer pequeña, como en
// una foto macro; con f/32 (4 px) apenas se nota. En toda la vuelta, la placa cabe entre el 13 % y el 87 % del ancho y
// entre el 32 % y el 69 % del alto (proyectando todos sus vértices cada 3°).
export const CAMERA = { eye: [0, 0.112, 0.2031], target: [0, 0.004, 0], fov: 24, fStop: 22 };

const LOOKS = {
  mascara: { metallic: 0, roughness: 0.5, specular: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.15 },
  oro: { color: [1, 0.766, 0.336], metallic: 1, roughness: 0.24 },
  estano: { color: [0.82, 0.82, 0.8], metallic: 1, roughness: 0.2 },
  acero: { color: [0.75, 0.74, 0.71], metallic: 1, roughness: 0.16 },
  encapsulado: { metallic: 0, roughness: 0.6 },
  marcado: { metallic: 0, roughness: 0.7 },
  canto: { roughness: 0.7 },
};

const linear = (hex) => [16, 8, 0].map((shift) => {
  const c = ((hex >> shift) & 255) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
// placa.js pinta el canto con dos colores de vértice: el núcleo de FR-4 y las capas de cobre y máscara, más oscuras.
const CORE = linear(0xd8c9a3), LAYER = linear(0x9c8a64);

function recolorEdge(geometry) {
  const colors = Float32Array.from(geometry.colors);
  for (let i = 0; i < colors.length; i += 3) colors.set(colors[i + 2] > 0.2 ? CORE : LAYER, i); // núcleo: azul 0,44; capa: 0,04
  return { ...geometry, colors };
}

export async function scene() {
  const { parts } = await loadModel('cw1101.glb');
  const { environment, floor, lightMask } = studio({ azimuth: 0 }); // la cámara está en el acimut 0
  const materials = new Map(); // un material retocado por material original: las piezas siguen compartiéndolo
  const board = parts.map((part) => {
    const name = part.material?.name;
    if (!materials.has(part.material)) materials.set(part.material, { ...part.material, ...LOOKS[name], lightMask });
    // Al marco P del guion: el contorno de la placa va de (0, 0) a (30, 61,1) mm en X y −Z, y lo más bajo (unas
    // almohadillas de la cara de abajo) está a −0,13 mm.
    const matrix = Float32Array.from(part.matrix);
    matrix[12] -= 0.015; matrix[13] += LIFT + 0.00013; matrix[14] += 0.03055;
    return { ...part, geometry: name === 'canto' ? recolorEdge(part.geometry) : part.geometry, matrix, material: materials.get(part.material) };
  });
  return { parts: [floor, ...board], environment };
}

// Ángulo de la placa en el instante t, en grados: 30° por segundo desde START.
export const angle = (t) => START + (360 * t) / duration;

export function frame(t, { parts }) {
  const a = (angle(t) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // Giro sobre el eje Y de P (x' = c·x + s·z, z' = −s·x + c·z) aplicado a cada columna de la matriz.
  const turn = (m) => {
    const out = Float32Array.from(m);
    for (let j = 0; j < 16; j += 4) { out[j] = c * m[j] + s * m[j + 2]; out[j + 2] = -s * m[j] + c * m[j + 2]; }
    return out;
  };
  return { camera: CAMERA, parts: parts.map((part) => (part.name === 'suelo' ? part : { ...part, matrix: turn(part.matrix) })) };
}
