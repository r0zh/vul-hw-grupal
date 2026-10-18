// One shared hover/click tooltip. content(ev) returns a string or Node.
const CSS = `.ak-tip { position: absolute; display: none; pointer-events: none; z-index: 50; max-width: 320px;
  background: var(--c-bg, #fff); color: var(--c-ink, #1c1c1a); padding: 6px 9px; border: 1px solid var(--c-line, #e1e0d9);
  border-radius: 5px; box-shadow: 0 2px 10px rgba(11,11,11,.12); font: 11.5px/1.5 system-ui, sans-serif; text-align: left; }
.ak-tip.pinned { pointer-events: auto; border-color: var(--c-accent, #2a78d6); }`;
let styled = false, open = 0;

export function attachTip(host, content, { parent = document.body, cls = 'ak-tip' } = {}) {
  if (!styled) { styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); }
  const tip = parent.appendChild(document.createElement('div'));
  tip.className = cls;
  let pinned = false;
  const show = (ev) => {
    const c = content(ev);
    if (c == null || c === '') { tip.style.display = 'none'; return; }
    if (typeof c === 'string') tip.textContent = c; else tip.replaceChildren(c);
    tip.style.display = 'block';
    tip.style.left = `${Math.min(ev.clientX + 14, document.documentElement.clientWidth - tip.offsetWidth - 8)}px`;
    tip.style.top = `${ev.clientY + 14}px`;
  };
  host.addEventListener('mousemove', (ev) => { if (!pinned) show(ev); });
  host.addEventListener('mouseleave', () => { if (!pinned) tip.style.display = 'none'; });
  document.addEventListener('click', (ev) => {
    if (tip.contains(ev.target)) return;
    if (pinned) { pinned = false; open--; tip.classList.remove('pinned'); tip.style.display = 'none'; return; }
    if (open || !host.contains(ev.target)) return;
    pinned = true; open++; tip.classList.add('pinned'); show(ev);
  }, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && pinned) { pinned = false; open--; tip.style.display = 'none'; } });
  return tip;
}
