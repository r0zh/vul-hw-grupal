// DPA de un bit [kocher1999dpa] con los mismos estadísticos que el CPA
// (createAccumulator en cpa.js). Para el byte j, el candidato k y el bit b, la
// función de selección es el bit b de SBox(p_j ⊕ k): las trazas en las que
// vale 1 forman un grupo y el resto, otro, y se restan sus medias:
//
//   Δ(k, t) = media(T_i[t] | bit = 1) − media(T_i[t] | bit = 0)
//
// Como la selección solo depende de v = p_j, el grupo 1 del candidato k suma
// las S[v][t] con bit_b(SBox(v ⊕ k)) = 1. Es otra convolución XOR, así que la
// misma transformada de Walsh-Hadamard del CPA da los 256 candidatos a la vez.
// tests/dpa.test.js lo compara con la resta de medias hecha traza a traza.
import { SBOX } from './aes.js';
import { wht, peaks, rankOf, best } from './cpa.js';

// Función de selección transformada: f_b(u) = bit b de SBox(u), con u = p ⊕ k.
const SELECT = Array.from({ length: 8 }, (_, b) => wht(Float64Array.from(SBOX, (s) => (s >> b) & 1)));

// Δ(k, t) de los 256 candidatos del byte j con el bit `bit`: Float64Array(256·S),
// fila k. Si un grupo queda vacío (muy pocas trazas), la diferencia es 0.
export function differences(acc, j, bit) {
  const S = acc.nSamples, N = acc.n, f = SELECT[bit];
  const s1 = wht(Float64Array.from(acc.sum[j]), S), c1 = wht(Float64Array.from(acc.count[j]));
  for (let w = 0; w < 256; w++) {
    c1[w] *= f[w];
    for (let t = 0; t < S; t++) s1[w * S + t] *= f[w];
  }
  wht(c1); wht(s1, S);
  const diff = new Float64Array(256 * S);
  for (let k = 0; k < 256; k++) {
    const n1 = Math.round(c1[k] / 256), n0 = N - n1;
    if (n1 <= 0 || n0 <= 0) continue;
    for (let t = 0; t < S; t++) {
      const a = s1[k * S + t] / 256;
      diff[k * S + t] = a / n1 - (acc.sy[t] - a) / n0;
    }
  }
  return diff;
}

// Los dos grupos de un candidato: cuántas trazas tiene cada uno y su traza media.
export function groups(acc, j, bit, k) {
  const S = acc.nSamples, sum1 = new Float64Array(S);
  let n1 = 0;
  for (let v = 0; v < 256; v++) {
    if (!((SBOX[v ^ k] >> bit) & 1)) continue;
    n1 += acc.count[j][v];
    const row = acc.sum[j], base = v * S;
    for (let t = 0; t < S; t++) sum1[t] += row[base + t];
  }
  const n0 = acc.n - n1;
  return {
    n1, n0,
    mean1: sum1.map((s) => (n1 ? s / n1 : 0)),
    mean0: sum1.map((s, t) => (n0 ? (acc.sy[t] - s) / n0 : 0)),
  };
}

// Resultado del DPA en los 16 bytes con un bit: como attack() de cpa.js, pero
// el estadístico es |Δ| en lugar de |ρ|.
export function dpaAttack(acc, bit, key = null) {
  return Array.from({ length: 16 }, (_, j) => {
    const diff = differences(acc, j, bit);
    const { peak, at } = peaks(diff, acc.nSamples);
    const out = { byte: j, diff, peak, at, guess: best(peak) };
    if (key) {
      const c = key[j];
      let wrong = 0;
      for (let k = 0; k < 256; k++) if (k !== c && peak[k] > wrong) wrong = peak[k];
      Object.assign(out, { correct: c, rank: rankOf(peak, c), correctPeak: peak[c], bestWrongPeak: wrong });
    }
    return out;
  });
}
