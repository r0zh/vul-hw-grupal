// Trazas sintéticas: el modelo de analisis/simulate.py con los parámetros de
// analisis/config.py. **Es una simulación, no una medida.** El generador
// conoce la clave porque la usa para construir la fuga; el CPA no la ve.
//
//   T_i[t] = b_i + d_i·s[t] + w_i[t]
//          + Σ_j g_1  · HW(SBox(p_ij ⊕ k_j)) · h[t − (15 + 2j)]    (1.ª ronda)
//          + Σ_j g_10 · HW(x_ij)            · h[t − (60 + 2j)]    (última ronda)
//
// con h = (0,5, 1,0, 0,5) y x_ij la entrada de la S-box de la última ronda en
// la posición de estado j. La secuencia de numpy no se puede reproducir, así
// que la equivalencia con Python se comprueba con estadística
// (tests/sim.test.js), no valor a valor.
import { SBOX, HW, keyExpansion, encryptDetailed, fromHex } from './aes.js';

export const LAB_KEY = fromHex('2b7e151628aed2a6abf7158809cf4f3c');

export const CONFIG = {
  seed: 20261018,
  nSamples: 96,
  firstStart: 15, firstSpacing: 2, firstGain: 1.0,
  lastStart: 60, lastSpacing: 2, lastGain: 0.8,
  kernel: [0.5, 1.0, 0.5],
  offsetRatio: 0.4, driftRatio: 0.05, driftFreq: 0.35,
};

// Desviación típica de la fuga de un byte, g_1·√Var(HW). Python la estima con
// la varianza combinada de los 16 bytes; con textos claros uniformes
// Var(HW) = 8·¼ = 2, así que aquí se usa el valor exacto g_1·√2.
export const SIGNAL_STD = CONFIG.firstGain * Math.SQRT2;

// Ruido total por muestra para una SNR: σ = std(g_1·HW) / √SNR.
export const noiseSigma = (snr) => SIGNAL_STD / Math.sqrt(snr);

// Pico esperado del candidato correcto en su instante de fuga.
export const rhoCeiling = (snr) => Math.sqrt(snr / (1 + snr));

// Instante central de la S-box del byte j en la primera ronda.
export const firstCenter = (j, cfg = CONFIG) => cfg.firstStart + cfg.firstSpacing * j;

// xoshiro128** con la semilla expandida por splitmix32. Determinista y
// suficiente para ruido de simulación (no es criptográfico).
export function rng(seed) {
  let x = seed >>> 0;
  const split = () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = split(), b = split(), c = split(), d = split();
  const u32 = () => {
    const out = Math.imul(((Math.imul(b, 5) << 7) | (Math.imul(b, 5) >>> 25)), 9) >>> 0;
    const t = b << 9;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t;
    d = (d << 11) | (d >>> 21);
    return out;
  };
  const uniform = () => (u32() + 0.5) / 4294967296;            // (0, 1)
  let spare = null;
  const normal = () => {                                       // Box-Muller
    if (spare !== null) { const s = spare; spare = null; return s; }
    const r = Math.sqrt(-2 * Math.log(uniform())), th = 2 * Math.PI * uniform();
    spare = r * Math.sin(th);
    return r * Math.cos(th);
  };
  return { u32, uniform, normal, byte: () => u32() >>> 24 };
}

// Clave aleatoria reproducible: la n-ésima «nueva clave» de una semilla.
export function randomKey(seed, n) {
  const r = rng((seed ^ Math.imul(n + 1, 0x27d4eb2d)) >>> 0);
  return Uint8Array.from({ length: 16 }, () => r.byte());
}

// Genera n trazas. Devuelve el mismo formato que una campaña real
// (fromCampaignJSON en cpa.js): matrices aplanadas por filas.
//
// Cada traza consume siempre la misma cantidad de números aleatorios y en el
// mismo orden, así que las n primeras trazas son las mismas pidas n o 4n:
// mover el deslizador de N no cambia las trazas que ya había.
export function simulate({ n, snr, key = LAB_KEY, seed = CONFIG.seed, cfg = CONFIG }) {
  const S = cfg.nSamples;
  const sigma = Number.isFinite(snr) ? noiseSigma(snr) : 0;
  const drift = Float64Array.from({ length: S }, (_, t) => Math.sin(2 * Math.PI * cfg.driftFreq * t / S));
  // El offset y la deriva son fracciones fijas de σ y el blanco completa σ²
  // en cada muestra, de modo que la SNR nominal es la que ve el CPA.
  const offsetStd = cfg.offsetRatio * sigma, driftStd = cfg.driftRatio * sigma;
  const whiteStd = drift.map((s) => sigma * Math.sqrt(1 - cfg.offsetRatio ** 2 - (cfg.driftRatio * s) ** 2));
  const rk = keyExpansion(key);
  const texts = rng(seed), noise = rng((seed ^ 0x5bd1e995) >>> 0);
  const half = cfg.kernel.length >> 1;

  const traces = new Float32Array(n * S);
  const plaintexts = new Uint8Array(n * 16), ciphertexts = new Uint8Array(n * 16);
  const row = new Float64Array(S);
  for (let i = 0; i < n; i++) {
    const p = plaintexts.subarray(16 * i, 16 * i + 16);
    for (let j = 0; j < 16; j++) p[j] = texts.byte();
    const { ciphertext, lastInput } = encryptDetailed(p, rk);
    ciphertexts.set(ciphertext, 16 * i);

    const b = offsetStd * noise.normal(), d = driftStd * noise.normal();
    for (let t = 0; t < S; t++) row[t] = b + d * drift[t] + whiteStd[t] * noise.normal();
    for (let j = 0; j < 16; j++) {
      const first = cfg.firstGain * HW[SBOX[p[j] ^ key[j]]];
      const last = cfg.lastGain * HW[lastInput[j]];
      const c1 = cfg.firstStart + cfg.firstSpacing * j, c10 = cfg.lastStart + cfg.lastSpacing * j;
      for (let o = 0; o < cfg.kernel.length; o++) {
        const t1 = c1 - half + o, t10 = c10 - half + o;
        if (t1 >= 0 && t1 < S) row[t1] += cfg.kernel[o] * first;
        if (t10 >= 0 && t10 < S) row[t10] += cfg.kernel[o] * last;
      }
    }
    traces.set(row, S * i);
  }
  return { synthetic: true, n, nSamples: S, traces, plaintexts, ciphertexts, key: Uint8Array.from(key), snr, seed };
}
