// CPA [brier2004cpa] por estadísticos suficientes. No hace falta guardar las
// trazas: por cada byte j y cada valor v del texto claro se acumulan
//
//   c[j][v]     número de trazas con p_j = v
//   S[j][v][t]  suma de esas trazas
//
// y, una vez para todas, N, Σy[t] y Σy²[t]. Para el candidato k, con
// h_v = HW(SBox(v ⊕ k)):
//
//   Σx = Σ_v c[v]·h_v    Σx² = Σ_v c[v]·h_v²    Σxy[t] = Σ_v h_v·S[v][t]
//   ρ(k, t) = (N·Σxy − Σx·Σy) / √((N·Σx² − (Σx)²)·(N·Σy² − (Σy)²))
//
// Es exacto, no una aproximación (tests/cpa.test.js lo compara con la
// correlación directa), y añadir trazas es solo acumular.
//
// Las tres sumas sobre v son convoluciones XOR: Σ_v f(v ⊕ k)·g(v). Con la
// transformada de Walsh-Hadamard (H·H = 256·I) se calculan las 256 a la vez,
// conv = H(Hf · Hg) / 256, en 2·256·8 operaciones en lugar de 256². Un byte
// cuesta unas 4·10⁵ operaciones en vez de 6,3·10⁶, sea cual sea N, y los
// mandos responden en directo con los 16 bytes.
import { SBOX, HW } from './aes.js';

// Transformada de Walsh-Hadamard en el eje v de una matriz 256 × width
// (fila v, columna t), en su sitio y sin normalizar.
export function wht(a, width = 1) {
  for (let h = 1; h < 256; h <<= 1) {
    for (let i = 0; i < 256; i += h << 1) {
      for (let v = i; v < i + h; v++) {
        const p = v * width, q = (v + h) * width;
        for (let t = 0; t < width; t++) {
          const x = a[p + t], y = a[q + t];
          a[p + t] = x + y;
          a[q + t] = x - y;
        }
      }
    }
  }
  return a;
}

// Modelo de fuga del candidato: f(u) = HW(SBox(u)), con u = p ⊕ k.
const F1 = wht(Float64Array.from(SBOX, (s) => HW[s]));
const F2 = wht(Float64Array.from(SBOX, (s) => HW[s] ** 2));

export function createAccumulator(nSamples) {
  const S = nSamples;
  const acc = {
    nSamples: S,
    n: 0,
    count: Array.from({ length: 16 }, () => new Float64Array(256)),
    sum: Array.from({ length: 16 }, () => new Float64Array(256 * S)),
    sy: new Float64Array(S),
    syy: new Float64Array(S),
    // Añade las trazas [from, to) de una campaña (simulate() o fromCampaignJSON()).
    add(campaign, from = acc.n, to = campaign.n) {
      const { traces, plaintexts } = campaign;
      for (let i = from; i < to; i++) {
        const off = i * S;
        for (let t = 0; t < S; t++) {
          const y = traces[off + t];
          acc.sy[t] += y;
          acc.syy[t] += y * y;
        }
        for (let j = 0; j < 16; j++) {
          const v = plaintexts[16 * i + j];
          acc.count[j][v]++;
          const row = acc.sum[j], base = v * S;
          for (let t = 0; t < S; t++) row[base + t] += traces[off + t];
        }
      }
      acc.n += Math.max(0, to - from);
      return acc;
    },
  };
  return acc;
}

// ρ(k, t) de los 256 candidatos del byte j: Float64Array(256·S), fila k.
export function correlate(acc, j) {
  const S = acc.nSamples, N = acc.n;
  const sxy = wht(Float64Array.from(acc.sum[j]), S);
  const cnt = wht(Float64Array.from(acc.count[j]));
  const sx = new Float64Array(256), sxx = new Float64Array(256);
  for (let w = 0; w < 256; w++) {
    sx[w] = F1[w] * cnt[w];
    sxx[w] = F2[w] * cnt[w];
    for (let t = 0; t < S; t++) sxy[w * S + t] *= F1[w];
  }
  wht(sx); wht(sxx); wht(sxy, S);

  const rho = new Float64Array(256 * S);
  // Las varianzas que el redondeo deja en un residuo minúsculo son cero: una
  // predicción o una muestra constantes no aportan información y dan ρ = 0.
  const spread = (v, scale) => (v > 1e-9 * scale ? Math.sqrt(v) : 0);
  const dy = Float64Array.from(acc.sy, (sy, t) => spread(N * acc.syy[t] - sy * sy, N * acc.syy[t]));
  for (let k = 0; k < 256; k++) {
    const x = sx[k] / 256, xx = sxx[k] / 256, dx = spread(N * xx - x * x, N * xx);
    for (let t = 0; t < S; t++) {
      const den = dx * dy[t];
      rho[k * S + t] = den > 0 ? (N * (sxy[k * S + t] / 256) - x * acc.sy[t]) / den : 0;
    }
  }
  return rho;
}

// Pico max_t |ρ(k, t)| de cada candidato y el instante en que se alcanza.
export function peaks(rho, nSamples) {
  const peak = new Float64Array(256), at = new Int32Array(256);
  for (let k = 0; k < 256; k++) {
    let best = -1, bt = 0;
    for (let t = 0; t < nSamples; t++) {
      const a = Math.abs(rho[k * nSamples + t]);
      if (a > best) { best = a; bt = t; }
    }
    peak[k] = best; at[k] = bt;
  }
  return { peak, at };
}

// Puesto del candidato `correct` (1 = ganador). Los empates cuentan en contra.
export function rankOf(peak, correct) {
  let r = 1;
  for (let k = 0; k < 256; k++) if (k !== correct && peak[k] >= peak[correct]) r++;
  return r;
}

export const best = (peak) => peak.reduce((b, v, k) => (v > peak[b] ? k : b), 0);

// Resultado del ataque a los 16 bytes: candidato elegido y, si se conoce la
// clave (simulación o clave de laboratorio), puesto del correcto.
export function attack(acc, key = null) {
  return Array.from({ length: 16 }, (_, j) => {
    const rho = correlate(acc, j);
    const { peak, at } = peaks(rho, acc.nSamples);
    const guess = best(peak);
    const out = { byte: j, rho, peak, at, guess };
    if (key) {
      const c = key[j];
      let wrong = 0;
      for (let k = 0; k < 256; k++) if (k !== c && peak[k] > wrong) wrong = peak[k];
      Object.assign(out, { correct: c, rank: rankOf(peak, c), correctPeak: peak[c], bestWrongPeak: wrong });
    }
    return out;
  });
}

// Campaña real exportada del formato de AGENTS.md (.npz → JSON): `traces`
// (N×S), `plaintexts` (N×16) y, si se conoce, `key` (16). Acepta listas
// anidadas o cadenas hex de 16 bytes.
export function fromCampaignJSON(obj) {
  const bytes = (x) => (typeof x === 'string' ? Uint8Array.from(x.match(/../g), (b) => parseInt(b, 16)) : Uint8Array.from(x));
  const n = obj.traces.length, S = obj.traces[0].length;
  const traces = new Float32Array(n * S), plaintexts = new Uint8Array(n * 16);
  obj.traces.forEach((row, i) => {
    if (row.length !== S) throw new Error(`la traza ${i} no tiene ${S} muestras`);
    traces.set(row, i * S);
  });
  obj.plaintexts.forEach((p, i) => plaintexts.set(bytes(p), 16 * i));
  return {
    synthetic: !!obj.synthetic, n, nSamples: S, traces, plaintexts,
    key: obj.key ? bytes(obj.key) : null, meta: obj.meta ?? {},
  };
}
