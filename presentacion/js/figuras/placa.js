// Figura de la placa para las diapositivas: monta la escena y traduce el paso. options.desde
// (0 por defecto) se suma al paso de la diapositiva y options.hasta (4 por defecto) es el último:
// la portada usa { desde: 0, hasta: 0 }. options.orden, si está, da el paso de la escena para cada
// paso de la diapositiva: el montaje usa [3, 4, 2, 1, 0] (víctima, shunt, ADC, capturador y la placa
// entera), el orden del vídeo V2 al que respalda.
import { mount as mountBoard } from '../escenas/placa.js';

export function mount(container, options = {}) {
  const bounded = (n,max) => Math.max(0,Math.min(Math.trunc(Number(n)) || 0,max));
  const first = bounded(options.desde ?? 0,4);
  const last = Math.max(first,bounded(options.hasta ?? 4,4));
  const order = options.orden ?? Array.from({length:last-first+1},(_,k) => first+k);
  const steps = order.length;
  const absolute = k => bounded(order[bounded(k,steps-1)],4);
  const initial = options.step ?? (options.static===true ? steps-1 : 0);
  const scene = mountBoard(container,{...options,step:absolute(initial)});
  return {steps,start:scene.start,stop:scene.stop,step:k=>scene.step(absolute(k)),dispose:scene.dispose};
}
