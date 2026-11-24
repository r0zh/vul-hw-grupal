// Columna de «Qué acaba de pasar» (diapositiva «por-dentro»): el número de trazas y el puesto del candidato correcto siguen a la
// montaña, que los anuncia con el evento «cine-fotograma» (js/figuras/cine-v3.js en cada fotograma del vídeo y
// js/figuras/por-dentro.js, su respaldo, en cada paso). Con empates no hay puesto que dar: se dice con cuántos falsos. Sin
// eventos (sin JS) se queda lo que trae el HTML, que es el último paso.
//
// mount(container) → { steps: 1, start, stop, step, dispose }

export function mount(container) {
  const slide = container.closest('.diapo') ?? container;
  const n = container.querySelector('.marcador-n');
  const puesto = container.querySelector('.puesto');
  const valor = container.querySelector('.puesto-n');
  const onFrame = ({ detail: d }) => {
    n.textContent = d.n;
    puesto.dataset.estado = d.empates > 0 ? 'empate' : d.puesto === 1 ? 'primero' : '';
    valor.textContent = d.empates > 0 ? `empate con ${d.empates} falsos` : `${d.puesto}.º`;
  };
  slide.addEventListener('cine-fotograma', onFrame);
  container.dataset.ready = '1';
  return { steps: 1, start() {}, stop() {}, step() {}, dispose() { slide.removeEventListener('cine-fotograma', onFrame); } };
}
