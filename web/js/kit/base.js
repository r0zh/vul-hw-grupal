// NoteElement: the custom-element base. Subclasses supply defaults/build/render.
import { createModel } from './model.js';

// Dos disposiciones, ancha y estrecha (móvil). Las figuras eligen el ancho de
// su lienzo con isNarrow() al pintar y se repintan si la ventana cruza el
// umbral, de modo que el texto de las gráficas se lee también en un teléfono.
const NARROW = typeof matchMedia === 'undefined' ? null : matchMedia('(max-width: 560px)');
export const isNarrow = () => !!NARROW?.matches;

export class NoteElement extends (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) {
  connectedCallback() {
    if (this._ready) return;
    this._ready = true;
    this.model = createModel(this.defaults());
    this.model.subscribe(() => this.render());
    this.build();
    this.render();
    NARROW?.addEventListener('change', () => this.render());
  }
  defaults() { return {}; }
  build() {}
  render() {}
  attr(name, fallback = null) { return this.getAttribute(name) ?? fallback; }
  attrNum(name, fallback) { const v = this.getAttribute(name); return v == null ? fallback : Number(v); }
  set(patch) { this.model.set(patch); }
  reset(patch) { this.model.reset(patch); }
  markRendered() { this.dataset.rendered = 'true'; }
}

export function define(name, cls) {
  if (typeof customElements !== 'undefined' && !customElements.get(name)) customElements.define(name, cls);
}
