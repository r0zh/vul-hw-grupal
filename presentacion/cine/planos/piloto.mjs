// Piloto de los vídeos: la CW1101 de modelos/cw1101.glb (exportar-glb.mjs) flotando en el estudio claro, 2 s con la
// cámara girando despacio a su alrededor y profundidad de campo suave. Fija luces, materiales y tiempos antes de los
// planos del guion.
import { loadModel, orbit, studio } from '../estudio.mjs';

export const duration = 2; // segundos, a 30 fps

const LIFT = 0.004; // la placa flota 4 mm sobre el suelo: sombra suave y separada
const AZIMUTH = [50, 74], ELEVATION = 27, DISTANCE = 0.155; // grados y metros, desde el centro de la placa
const LENS = { fov: 24, fStop: 8 }; // fov vertical en grados; f/8 desenfoca un poco los extremos de la placa

// placa.js ajustó los materiales para WebGL; en el trazado, los metales llevan su reflectancia real (F0 lineal del oro,
// el estaño y el níquel) y la máscara, un barniz semimate con poco brillo especular, para que se lea negra.
const LOOKS = {
  mascara: { metallic: 0, roughness: 0.5, specular: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.15 },
  oro: { color: [1, 0.766, 0.336], metallic: 1, roughness: 0.24 },
  estano: { color: [0.82, 0.82, 0.8], metallic: 1, roughness: 0.2 },
  acero: { color: [0.75, 0.74, 0.71], metallic: 1, roughness: 0.16 },
  encapsulado: { metallic: 0, roughness: 0.6 },
  marcado: { metallic: 0, roughness: 0.7 },
};

export async function scene() {
  const { parts } = await loadModel('cw1101.glb');
  const { environment, floor, lightMask } = studio({ azimuth: (AZIMUTH[0] + AZIMUTH[1]) / 2 });
  const materials = new Map(); // un material retocado por material original: las piezas siguen compartiéndolo
  const board = parts.map((part) => {
    if (!materials.has(part.material)) materials.set(part.material, { ...part.material, ...LOOKS[part.material?.name], lightMask });
    // Al origen: el contorno de la placa va de (0, 0) a (30, 61,1) mm en X y −Z, y lo más bajo (unas almohadillas de
    // la cara de abajo) está a −0,13 mm.
    const matrix = Float32Array.from(part.matrix);
    matrix[12] -= 0.015; matrix[13] += LIFT + 0.00013; matrix[14] += 0.03055;
    return { ...part, matrix, material: materials.get(part.material) };
  });
  return { parts: [floor, ...board], environment };
}

// Un arco de AZIMUTH[0] a AZIMUTH[1] con entrada y salida suaves, mirando al centro de la placa.
export function frame(t) {
  const s = Math.min(1, Math.max(0, t / duration)), ease = s * s * (3 - 2 * s);
  const target = [0, LIFT + 0.0026, 0];
  return { camera: { eye: orbit(AZIMUTH[0] + (AZIMUTH[1] - AZIMUTH[0]) * ease, ELEVATION, DISTANCE, target), target, ...LENS } };
}
