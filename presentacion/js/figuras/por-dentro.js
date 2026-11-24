// Figura «por dentro»: la montaña de correlación con las trazas medidas de la web
// (web/data/nano-tinyaes.json) y el CPA de web/js/model/cpa.js, con N = 5, 20, 100
// y 400 trazas en los pasos 0 a 3. La cámara se queda en la vista general.
//
// Es el respaldo del vídeo V3 (js/figuras/cine-v3.js): como él, anuncia en cada paso el evento «cine-fotograma»
// (burbujea) con { n, puesto, empates, correcto, mejorFalso }, para la columna de la diapositiva (marcador.js).
//
// mount(container, options) → { steps: 4, start, stop, step, dispose }
//   options.byte    byte de la clave (0 por defecto).
//   options.static  dibuja una sola vez el paso options.step (o el 3).
//   options.showN   chip «N = … trazas» de la escena (por defecto no: el deck lleva contador).
import { mount as mountMountain } from '../escenas/montana.js';
import { fromCampaignJSON, createAccumulator, correlate, peaks } from '../../../web/js/model/cpa.js';

export const COUNTS = [5, 20, 100, 400];
const indexOfStep = (n) => Math.max(0, Math.min(COUNTS.length - 1, Math.trunc(Number(n)) || 0));
let request;

// La campaña se carga una sola vez para todas las figuras de la página.
export function loadCampaign() {
  request ??= fetch(new URL('../../../web/data/nano-tinyaes.json', import.meta.url))
    .then((response) => {
      if (!response.ok) throw new Error(`No se pudieron cargar las trazas medidas (${response.status}).`);
      return response.json();
    })
    .then(fromCampaignJSON)
    .catch((error) => { request = undefined; throw error; });
  return request;
}

// Datos de update() de la escena con las n primeras trazas, para cada n de `counts`
// (crecientes): el acumulador solo añade las trazas nuevas.
export function framesFor(campaign, byte, counts = COUNTS) {
  const acc = createAccumulator(campaign.nSamples);
  const offset = campaign.meta.muestras?.[0] ?? 0;
  const correct = campaign.key ? campaign.key[byte] : null;
  return counts.map((n) => {
    acc.add(campaign, acc.n, n);
    return { rho: correlate(acc, byte), S: campaign.nSamples, correct, n, offset };
  });
}

// Lo que anuncia «cine-fotograma», con los criterios de cine/planos/v3.mjs: los empates (a 1e-9) cuentan en contra.
export function standing({ rho, S, correct, n }) {
  const { peak } = peaks(rho, S);
  let puesto = 1, empates = 0, mejorFalso = 0;
  for (let k = 0; k < 256; k++) {
    if (k === correct) continue;
    if (peak[k] > peak[correct] - 1e-9) puesto++;
    if (Math.abs(peak[k] - peak[correct]) <= 1e-9) empates++;
    mejorFalso = Math.max(mejorFalso, peak[k]);
  }
  return { n, puesto, empates, correcto: peak[correct], mejorFalso };
}

export function mount(container, options = {}) {
  const fixed = options.static === true;
  const byte = options.byte ?? 0;
  const previous = { position: container.style.position, role: container.getAttribute('role'),
    label: container.getAttribute('aria-label'), ready: container.dataset.ready };
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  delete container.dataset.ready;
  // La escena va en un div interior: su marca de «listo» llega antes que los datos,
  // y la del contenedor solo se pone cuando ya se ha dibujado un paso con datos.
  const inner = document.createElement('div');
  inner.style.cssText = 'position:absolute;inset:0;font:inherit';
  container.append(inner);
  let selected = indexOfStep(options.step ?? (fixed ? COUNTS.length - 1 : 0));
  let running = false, disposed = false, scene, frames;
  const announce = () => {
    if (frames[selected].correct == null) return;
    container.dispatchEvent(new CustomEvent('cine-fotograma', { bubbles: true, detail: standing(frames[selected]) }));
  };

  function markReady() {
    if (disposed || inner.dataset.ready !== '1') return;
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', inner.getAttribute('aria-label'));
    container.dataset.ready = '1';
  }
  const observer = new MutationObserver(markReady);
  observer.observe(inner, { attributes: true, attributeFilter: ['data-ready', 'aria-label'] });

  loadCampaign().then((campaign) => {
    if (disposed) return;
    frames = framesFor(campaign, byte);
    scene = mountMountain(inner, { static: fixed, step: 0, data: frames[selected], showN: options.showN === true });
    markReady();
    announce();
    if (running) scene.start();
  }).catch((error) => {
    if (disposed) return;
    inner.textContent = error.message;
    inner.setAttribute('role', 'alert');
  });

  return {
    steps: COUNTS.length,
    start() { running = true; scene?.start(); },
    stop() { running = false; scene?.stop(); },
    step(n) {
      selected = indexOfStep(n);
      scene?.update(frames[selected], { duration: 800 });
      if (frames) announce();
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      scene?.dispose();
      inner.remove();
      container.style.position = previous.position;
      for (const [attr, value] of [['role', previous.role], ['aria-label', previous.label], ['data-ready', previous.ready]]) {
        if (value == null) container.removeAttribute(attr);
        else container.setAttribute(attr, value);
      }
      scene = frames = undefined;
    },
  };
}
