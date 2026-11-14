// La traza media del cifrado completo que enseña <cpa-spa> (data/nano-spa.json,
// generado por analisis/reales.py). Modelo puro, sin DOM: se prueba en Node.

// Deshace las escalas del JSON: la traza en códigos del ADC y las
// correlaciones entre 0 y 1.
export function fromSpaJSON(obj) {
  const mean = Float32Array.from(obj.mean, (v) => v / 10);
  return {
    synthetic: !!obj.synthetic,
    n: mean.length,
    mean,
    rho1: Float32Array.from(obj.rho1, (v) => v / 1000),
    rho10: Float32Array.from(obj.rho10, (v) => v / 1000),
    rounds: roundSpans(obj.rondas),
    period: obj.rondas.periodo,
    end: obj.rondas.fin,
    hz: obj.meta?.adc_hz ?? null,
    traces: obj.meta?.trazas ?? null,
  };
}

// Las diez rondas como tramos [desde, hasta) de la traza. Cada tramo va de la
// primera S-box de una ronda a la primera de la siguiente. La ronda 1 empieza
// en la primera muestra que correla con su S-box (|ρ| > 0,6) y las nueve
// primeras se repiten cada periodo, el que da la autocorrelación de la traza
// media. La décima está fuera del bucle del firmware y no tiene MixColumns:
// empieza donde aparece su S-box y acaba donde deja de fugar.
export function roundSpans({ periodo, ronda1, ronda10, fin }) {
  const start = ronda1[0];
  return Array.from({ length: 10 }, (_, r) => ({
    round: r + 1,
    from: r < 9 ? start + periodo * r : ronda10[0],
    to: r < 8 ? start + periodo * (r + 1) : r === 8 ? ronda10[0] : fin,
  }));
}

// Ronda a la que pertenece una muestra (1 a 10), o 0 si cae fuera del cifrado.
export function roundAt(rounds, sample) {
  const hit = rounds.find((r) => sample >= r.from && sample < r.to);
  return hit ? hit.round : 0;
}

// Envolvente para dibujar: por cada una de las `columns` columnas de píxeles
// que cubren [from, to), el mínimo y el máximo de las muestras que caen en ella.
export function envelope(values, from, to, columns) {
  const lo = new Float32Array(columns), hi = new Float32Array(columns);
  const span = (to - from) / columns;
  for (let c = 0; c < columns; c++) {
    const a = Math.floor(from + c * span), b = Math.max(a + 1, Math.floor(from + (c + 1) * span));
    let mn = Infinity, mx = -Infinity;
    for (let i = a; i < b && i < values.length; i++) {
      const v = values[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    lo[c] = mn; hi[c] = mx;
  }
  return { lo, hi };
}

// Parecido (correlación de Pearson) entre la traza media de dos rondas, sobre
// el tramo común. Mide lo que el ojo ve en la figura: que el dibujo se repite.
export function roundSimilarity(mean, a, b) {
  const n = Math.min(a.to - a.from, b.to - b.from);
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const x = mean[a.from + i], y = mean[b.from + i];
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  return (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
}
