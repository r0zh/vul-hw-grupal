// Utilidades compartidas por los componentes de la página.
import { isNarrow } from '../kit/base.js';

export const es = (x, d = 2) => Number(x).toLocaleString('es-ES', { maximumFractionDigits: d, useGrouping: false });
export const hex2 = (b) => `0x${b.toString(16).padStart(2, '0')}`;
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Miles con espacio fino, como en la memoria (10 000), y sin tocar los de cuatro cifras.
export const miles = (n) => (Math.abs(n) < 10000 ? String(n) : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));

// Etiqueta obligatoria de toda figura con trazas sintéticas (AGENTS.md) y su
// pareja para las que salen de la placa.
export const SIM_BADGE = '<span class="sim-badge" title="Trazas generadas con el modelo de analisis/simulate.py">Datos simulados</span>';
export const REAL_BADGE = '<span class="real-badge" title="Medido en nuestro ChipWhisperer-Nano el 13 de noviembre de 2026">Medida real</span>';

// Ancho del lienzo de las gráficas en unidades del viewBox. En pantallas
// estrechas el lienzo es más pequeño para que el texto no se encoja al
// escalar el SVG.
export const plotWidth = () => (isNarrow() ? 420 : 720);

// Paso de las marcas de un eje que cubre `span` unidades, para que no pasen de `max`.
export function tickStep(span, max) {
  return [1, 2, 4, 5, 8, 10, 16, 20, 40, 50, 80, 100, 160, 200, 400, 500, 1000, 2000, 5000].find((s) => span / s <= max) ?? 10000;
}

// Camino SVG de una línea de n puntos; x(i) e y(i) dan las coordenadas.
export function linePath(n, x, y) {
  let d = '';
  for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(i).toFixed(1)}`;
  return d;
}

// Huella corta y estable de una lista de números, para comprobar en los
// claims que la misma semilla da el mismo resultado tras recargar.
export function digest(values) {
  let h = 0x811c9dc5;
  for (const v of values) {
    for (const ch of Number(v).toFixed(9)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
