// Vista del ponente: habla con la presentación por BroadcastChannel('presentacion').
// Enseña la diapositiva actual (título y paso), sus notas y la siguiente, con
// cronómetro (empieza con la primera navegación; pausa y reinicio) y la hora.
const $ = (s) => document.querySelector(s);
const canal = new BroadcastChannel('presentacion');
const mandar = (tipo) => canal.postMessage({ tipo });

let desde = null, acumulado = 0, pausado = false;
const transcurrido = () => acumulado + (desde && !pausado ? Date.now() - desde : 0);
const dos = (n) => String(n).padStart(2, '0');

function reloj() {
  const s = Math.floor(transcurrido() / 1000);
  $('#crono').textContent = `${dos(Math.floor(s / 60))}:${dos(s % 60)}`;
  const d = new Date();
  $('#hora').textContent = `${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
setInterval(reloj, 500);
reloj();

canal.addEventListener('message', ({ data: m }) => {
  if (m?.tipo !== 'estado') return;
  if (m.navegaciones > 0 && desde === null && !pausado) desde = Date.now();
  $('#pos').textContent = `Diapositiva ${m.indice + 1} de ${m.total} · paso ${m.paso + 1} de ${m.pasos}${m.seccion ? ` · ${m.seccion}` : ''}`;
  $('#titulo').textContent = m.titulo;
  $('#quien').textContent = m.quien ? `Presenta: ${m.quien} (propuesta)` : '';
  $('#tiempo').textContent = m.tiempo ? `Tiempo: ${m.tiempo}` : '';
  $('#notas').innerHTML = m.notas || '<p>Sin notas.</p>';
  $('#siguiente').textContent = m.siguiente ? `${m.siguiente.indice + 1}. ${m.siguiente.titulo}` : 'fin';
  document.title = `Notas · ${m.indice + 1}. ${m.titulo}`;
});
mandar('pedir');

$('#pausa').addEventListener('click', (e) => {
  if (pausado) { pausado = false; if (desde !== null) desde = Date.now(); }
  else { acumulado = transcurrido(); pausado = true; }
  e.currentTarget.setAttribute('aria-pressed', String(pausado));
  e.currentTarget.textContent = pausado ? 'Seguir' : 'Pausa';
  reloj();
});
$('#reiniciar').addEventListener('click', () => {
  acumulado = 0;
  if (desde !== null) desde = Date.now();
  reloj();
});
$('#atras').addEventListener('click', () => mandar('anterior'));
$('#adelante').addEventListener('click', () => mandar('siguiente'));
addEventListener('keydown', (e) => {
  if (e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); mandar('siguiente'); }
  if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); mandar('anterior'); }
});
