// Utilidades compartidas por los componentes de la página.
export const es = (x, d = 2) => Number(x).toLocaleString('es-ES', { maximumFractionDigits: d, useGrouping: false });
export const hex2 = (b) => `0x${b.toString(16).padStart(2, '0')}`;
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Etiqueta obligatoria de toda figura con trazas sintéticas (AGENTS.md).
export const SIM_BADGE = '<span class="sim-badge" title="Trazas generadas con el modelo de analisis/simulate.py">Datos simulados</span>';

// Huella corta y estable de una lista de números, para comprobar en los
// claims que la misma semilla da el mismo resultado tras recargar.
export function digest(values) {
  let h = 0x811c9dc5;
  for (const v of values) {
    for (const ch of Number(v).toFixed(9)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
