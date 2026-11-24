import { mount as mountCascada } from '../escenas/cascada.js';
import { fromSpaJSON } from '../../../web/js/model/spa.js';

let loading;

function loadSpa() {
  loading ??= fetch(new URL('../../../web/data/nano-spa.json', import.meta.url))
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((json) => ({ ...fromSpaJSON(json), fuga: json.rondas.ronda1 }))
    .catch((error) => {
      console.error('Error al cargar la traza de consumo de AES-128.', error);
      return null;
    });
  return loading;
}

export function mount(container, options = {}) {
  const { steps, start, stop, step, update, dispose } = mountCascada(container, options);
  let disposed = false;
  loadSpa().then((spa) => {
    if (spa && !disposed) update(spa);
  });

  return {
    steps, start, stop, step,
    dispose() {
      disposed = true;
      dispose();
    },
  };
}
