// El CPA de la demo, en un hilo aparte para que la animación no se pare.
// Acumula los estadísticos suficientes de web/js/model/cpa.js (no guarda las
// trazas) y, cuando se le pide, ataca los 16 bytes.
//
// Mensajes que recibe:
//   { type: 'reset', gen, S, key }          nueva captura: S muestras por traza y la
//                                           clave (16 bytes), solo para puntuar
//   { type: 'add', gen, count, plaintexts: Uint8Array(count·16), traces: Float32Array(count·S) }
//   { type: 'compute', gen, byte }
// Responde a cada 'compute', siempre, con { type: 'result', gen, n, byte, S, rho, bytes }
// (o con { error } si el cálculo falla):
// rho es ρ(k, t) del byte pedido (Float32Array de 256·S, fila k) y bytes, por
// cada byte, el candidato que gana, el puesto del correcto y los dos picos. Si
// la petición es de otra captura o aún no hay dos trazas, rho y bytes son null.
import { createAccumulator, attack } from '../../web/js/model/cpa.js';

let acc = null, key = null, gen = 0;

self.onmessage = ({ data: m }) => {
  if (m.type === 'reset') {
    ({ gen, key } = m);
    acc = createAccumulator(m.S);
    return;
  }
  const current = acc && m.gen === gen;
  if (m.type === 'add') {
    if (current) acc.add({ traces: m.traces, plaintexts: m.plaintexts }, 0, m.count);
    return;
  }
  if (m.type !== 'compute') return;
  if (!current || acc.n < 2) {
    self.postMessage({ type: 'result', gen: m.gen, n: acc?.n ?? 0, byte: m.byte, S: acc?.nSamples ?? 0, rho: null, bytes: null });
    return;
  }
  try {
    const res = attack(acc, key);
    const rho = Float32Array.from(res[m.byte].rho);
    self.postMessage({
      type: 'result', gen, n: acc.n, byte: m.byte, S: acc.nSamples, rho,
      bytes: res.map((r) => ({ guess: r.guess, rank: r.rank, correct: r.correctPeak, wrong: r.bestWrongPeak })),
    }, [rho.buffer]);
  } catch (err) {
    // Siempre se responde: la demo no se queda esperando un resultado que no llega.
    self.postMessage({ type: 'result', gen, n: acc.n, byte: m.byte, error: String(err?.message ?? err) });
  }
};
