// NoteElement: the custom-element base. Subclasses supply defaults/build/render.
import { createModel } from './model.js';

export class NoteElement extends (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) {
  connectedCallback() {
    if (this._ready) return;
    this._ready = true;
    this.model = createModel(this.defaults());
    this.model.subscribe(() => this.render());
    this.build();
    this.render();
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
