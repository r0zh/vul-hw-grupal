// La mesa de laboratorio de la diapositiva «montaje»: monta la escena 3D (js/escenas/mesa.js) y le pasa las trazas
// medidas que salen en sus pantallas.
//   En el osciloscopio  el principio de una traza suelta, con un punto por muestra (web/data/nano-tinyaes.json,
//                       códigos del ADC de 0 a 255), y el cifrado entero, media de 100 trazas (web/data/nano-spa.json:
//                       la misma traza de la diapositiva «spa»).
//   En el portátil      las primeras trazas de la campaña, una por fila.
// Si los datos no cargan, las pantallas se quedan vacías y la diapositiva sigue valiendo.
import { mount as mountBench } from '../escenas/mesa.js';

const RAW = new URL('../../../web/data/nano-tinyaes.json', import.meta.url);
const WHOLE = new URL('../../../web/data/nano-spa.json', import.meta.url);
const ZOOM = 36;       // muestras de la vista de cerca: caben con sus puntos en la pantalla
const LISTED = 8;      // trazas de la lista del portátil
const ROW = 150;       // muestras de cada una

let loading;
function load() {
  loading ??= Promise.all([RAW, WHOLE].map((url) => fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${response.status} al pedir ${url.pathname}`);
    return response.json();
  }))).then(([raw, whole]) => ({
    muestras: raw.traces[0].slice(0, ZOOM),
    trazas: raw.traces.slice(0, LISTED).map((trace) => trace.slice(0, ROW)),
    cifrado: whole.mean.slice(0, Math.min(whole.mean.length, whole.rondas.fin + 200)),
  })).catch((error) => {
    console.warn('mesa: no se pudieron leer las trazas; las pantallas se quedan vacías', error);
    return null;
  });
  return loading;
}

export function mount(container, options = {}) {
  const { steps, start, stop, step, update, dispose } = mountBench(container, options);
  let disposed = false;
  load().then((data) => { if (!disposed) update(data); });
  return { steps, start, stop, step, dispose() { disposed = true; dispose(); } };
}
