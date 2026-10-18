// Auditoría visual: por cada figura, saca una captura, mide píxeles y
// geometría, y marca anomalías (recortes, cajas estiradas, texto invisible,
// páginas que desbordan). Escribe review/visual/index.html + visual.json.
//
// No juzga estética; caza el tipo de fallo que se ve a simple vista:
// una figura en blanco, una celda de 900×24, contenido recortado.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { launch, findChrome } from './cdp.mjs';

// Se sirve la raíz del repositorio y la página se abre en /web/, igual que
// GitHub Pages la sirve bajo /vul-hw-grupal/: una ruta absoluta se rompería aquí.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 8127, BASE = `http://localhost:${PORT}`;
const OUT = join(ROOT, 'web', 'review', 'visual');
// Contrastes aceptados a mano (ninguno por ahora): { sel: /regex/, text: /regex/ }.
const ACCEPTED_CONTRAST = [];
const isAccepted = (sel, text) => ACCEPTED_CONTRAST.some((r) => r.sel.test(sel) && r.text.test(text));
const STRETCH = 12;         // ancho/alto máximo razonable para una caja con texto
const MIN_COVERAGE = 0.008; // menos que esto y la figura está prácticamente en blanco
const PAD_X = 2;            // px mínimos entre un texto SVG y el borde lateral de la caja que lo contiene
const STATES_MAX = 24;      // estados por figura que recorre el fuzz de controles
// --page=<trozo de ruta>: audita solo esas páginas (el gate de una nota no repasa la librería)
const ONLY = (process.argv.find((a) => a.startsWith('--page=')) ?? '').slice(7);
// Las reglas de geometría fallan el gate; VISUAL_RULES=0 las deja fuera (páginas de la librería).
const RULES = process.env.VISUAL_RULES !== '0';
const PNG = join(OUT, 'png'); // una captura por figura/estado/checkpoint, para revisarlas a ojo

// strict: true = el contraste bajo falla el gate.
const PAGES = [
  { path: '/web/index.html', strict: true, widgets: ['cpa-leak', 'cpa-live', 'figure.diag'] },
];

if (!findChrome()) { console.error('visual: no chromium; set CHROME=/path/to/chrome'); process.exit(1); }
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);
for (let i = 0; i < 50; i++) { try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
mkdirSync(PNG, { recursive: true });

async function pixelMetrics(page, dataUrl, ink = null) {
  return page.evalJs(`(async () => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = ${JSON.stringify(dataUrl)}; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const hist = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
    let modal = 0, mc = -1;
    for (const [k, v] of hist) if (v > mc) { mc = v; modal = k; }
    let nonBg = 0; let run = 0, blank = 0;
    for (let y = 0; y < c.height; y++) {
      let row = 0;
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
        if (key !== modal) row++;
      }
      nonBg += row;
      if (row / c.width < 0.005) { run++; blank = Math.max(blank, run); } else run = 0;
    }
    let inkFrac = null;
    const inkArg = ${JSON.stringify(ink)};
    if (inkArg) {
      const m = String(inkArg).match(/[0-9.]+/g);
      if (m) {
        const [ir, ig, ib] = m.slice(0, 3).map(Number);
        let hits = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (Math.abs(d[i] - ir) + Math.abs(d[i + 1] - ig) + Math.abs(d[i + 2] - ib) < 90) hits++;
        }
        inkFrac = hits / (c.width * c.height);
      }
    }
    return { w: c.width, h: c.height, coverage: nonBg / (c.width * c.height), blankRun: blank / c.height, inkFrac };
  })()`);
}

async function widgetAudit(page, sel, index = null) {
  return page.evalJs(`(() => {
    const SKIP = ['STYLE', 'SCRIPT', 'TITLE', 'OPTION', 'DEFS', 'MARKER', 'TD', 'TH', 'TABLE', 'THEAD', 'TBODY', 'TR'];
    const all = [...document.querySelectorAll(${JSON.stringify(sel)})];
    const els = ${index == null ? 'all' : `all.slice(${index}, ${index} + 1)`};
    const clipped = [], stretched = [], hiddenText = [], overlaps = [], lowContrast = [];
    const crossing = [], cut = [], spill = [];
    const direct = (n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('').trim();
    const lum = (col) => {
      const m = String(col).match(/[\\d.]+/g); if (!m) return null;
      const [r, g, b] = m.slice(0, 3).map(Number);
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const contrast = (a, b) => {
      const la = lum(a), lb = lum(b); if (la == null || lb == null) return null;
      const hi = Math.max(la, lb), lo = Math.min(la, lb);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const el of els) {
      const cs = getComputedStyle(el);
      const frame = el.getBoundingClientRect();
      // el recorte real: la figura Y cada ancestro con overflow/scroll (el SVG también recorta)
      const clipBox = (n) => {
        let r = { left: frame.left, top: frame.top, right: frame.right, bottom: frame.bottom };
        for (let e = n.parentElement; e; e = e.parentElement) {
          const st = getComputedStyle(e);
          if (st.overflow !== 'visible' || st.overflowX !== 'visible' || st.overflowY !== 'visible') {
            const b = e.getBoundingClientRect();
            r = { left: Math.max(r.left, b.left), top: Math.max(r.top, b.top), right: Math.min(r.right, b.right), bottom: Math.min(r.bottom, b.bottom) };
          }
          if (e === el) break;
        }
        return r;
      };
      const visible = (b, clip) => b.left + b.width / 2 >= clip.left && b.left + b.width / 2 <= clip.right
        && b.top + b.height / 2 >= clip.top && b.top + b.height / 2 <= clip.bottom;
      if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX === 'hidden') clipped.push(sel);
      const cands = [];
      for (const n of el.querySelectorAll('*')) {
        if (SKIP.includes(n.tagName)) continue;
        const st = getComputedStyle(n);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
        // un ancestro con opacity: 0 (render viejo durante un tween) tampoco se ve
        if (n.checkVisibility && !n.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        const text = direct(n); if (!text) continue;
        if (!n.getClientRects().length) continue;
        const rects = [...n.getClientRects()].filter((r) => r.width >= 2 && r.height >= 2);
        if (!rects.length) { hiddenText.push({ tag: n.tagName.toLowerCase(), text: text.slice(0, 24) }); continue; }
        const clip = clipBox(n);
        // un inline que se parte en dos líneas tiene dos fragmentos: se miden por separado
        for (const r of rects) cands.push({ n, text: text.slice(0, 28), b: r, clip });
        const b = rects[0];
        const boxed = st.borderTopWidth !== '0px' || st.backgroundColor !== 'rgba(0, 0, 0, 0)';
        if (boxed && text.length <= 24 && b.width > 280 && b.width / b.height > ${STRETCH}) {
          stretched.push({ tag: n.tagName.toLowerCase(), cls: String(n.className?.baseVal ?? n.className ?? '').slice(0, 24), w: Math.round(b.width), h: Math.round(b.height), text: text.slice(0, 24) });
        }
      }
      // texto SVG contra las cajas que pinta su propio <svg>. En SVG una etiqueta no es hija de
      // su caja y nada la recorta: o cabe dentro con margen, o está fuera; si cruza el borde, falla.
      const shapes = [...el.querySelectorAll('svg rect, svg circle, svg ellipse')].map((s) => {
        const st = getComputedStyle(s);
        const stroked = st.stroke !== 'none' && parseFloat(st.strokeWidth) > 0 && Number(st.strokeOpacity) > 0;
        const filled = st.fill !== 'none' && Number(st.fillOpacity) > 0;
        return (stroked || filled) && Number(st.opacity) > 0.1 ? { s, b: s.getBoundingClientRect() } : null;
      }).filter((x) => x && x.b.width >= 12 && x.b.height >= 10);
      for (const c of cands) {
        if (!c.n.ownerSVGElement) continue;
        // recortado por el borde de la figura: se ve una parte y el resto no
        const svgBox = c.n.ownerSVGElement.getBoundingClientRect();
        if (c.b.right > svgBox.right + 1 || c.b.left < svgBox.left - 1 || c.b.bottom > svgBox.bottom + 1 || c.b.top < svgBox.top - 1) {
          cut.push(c.text);
          continue;
        }
        for (const sh of shapes) {
          if (sh.s.ownerSVGElement !== c.n.ownerSVGElement) continue;
          const ix = Math.min(c.b.right, sh.b.right) - Math.max(c.b.left, sh.b.left);
          const iy = Math.min(c.b.bottom, sh.b.bottom) - Math.max(c.b.top, sh.b.top);
          if (ix <= 1 || iy <= 1) continue;                      // separados
          // la caja de un <text> incluye ascendentes y descendentes: en vertical se tolera 1 px
          const inside = c.b.left >= sh.b.left + ${PAD_X} && c.b.right <= sh.b.right - ${PAD_X}
            && c.b.top >= sh.b.top - 1 && c.b.bottom <= sh.b.bottom + 1;
          if (inside) continue;
          crossing.push({ text: c.text, tw: Math.round(c.b.width), th: Math.round(c.b.height), bw: Math.round(sh.b.width), bh: Math.round(sh.b.height) });
          break;
        }
      }
      // HTML: una caja pintada cuyo contenido se sale sin que nadie lo haya pedido (overflow visible)
      for (const n of el.querySelectorAll('*')) {
        if (n.namespaceURI !== 'http://www.w3.org/1999/xhtml' || ['INPUT', 'SELECT', 'TEXTAREA'].includes(n.tagName)) continue;
        const st = getComputedStyle(n);
        if (st.display === 'none' || st.display === 'inline' || st.display === 'contents') continue;
        if (st.borderTopWidth === '0px' && st.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
        if (st.overflowX !== 'visible' || st.overflowY !== 'visible') continue;
        if (n.scrollWidth > n.clientWidth + 2 || n.scrollHeight > n.clientHeight + 2) {
          spill.push({ tag: n.tagName.toLowerCase(), text: (n.textContent || '').trim().slice(0, 28) });
        }
      }
      // texto encima de texto: intersección de dos cajas visibles sin relación padre-hijo
      for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
        const a = cands[i], c = cands[j];
        if (a.n.contains(c.n) || c.n.contains(a.n)) continue;
        const x = Math.max(0, Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left));
        const y = Math.max(0, Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top));
        if (x <= 1 || y <= 1) continue;
        // solo lo que se ve dentro del recorte real (el resto está scrolleado o clipado)
        if (!visible(a.b, a.clip) || !visible(c.b, c.clip)) continue;
        const frac = (x * y) / Math.min(a.b.width * a.b.height, c.b.width * c.b.height);
        if (frac > 0.4) overlaps.push({ a: a.text, b: c.text, frac: +frac.toFixed(2) });
      }
      // contraste: tinta del texto contra la primera capa pintada detrás
      for (const c of cands.slice(0, 100)) {
        if (c.n.closest('button:disabled, [aria-disabled="true"]')) continue;
        const cx = c.b.left + c.b.width / 2, cy = c.b.top + c.b.height / 2;
        if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
        if (!visible(c.b, c.clip)) continue;
        const alphaOf = (col) => {
          const m = String(col).match(/rgba?\(([^)]+)\)/); if (!m) return 1;
          const p = m[1].split(',').map((v) => parseFloat(v));
          return p.length > 3 ? p[3] : 1;
        };
        const SHAPES = ['rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'image', 'use'];
        const paints = (e) => {
          const st = getComputedStyle(e);
          if (Number(st.opacity) < 0.5) return null;               // un velo apenas tiñe
          const isShape = e.namespaceURI === 'http://www.w3.org/2000/svg' && SHAPES.includes(e.tagName.toLowerCase());
          const col = st.backgroundColor !== 'rgba(0, 0, 0, 0)' ? st.backgroundColor
            : (isShape && st.fill !== 'none' && st.fill !== 'currentColor' ? st.fill : null);
          return col && alphaOf(col) * Number(st.opacity) >= 0.5 ? col : null;
        };
        // un elemento HTML con fondo propio (una celda, una etiqueta) se mide contra ese fondo
        let bg = c.n.ownerSVGElement ? null : paints(c.n);
        if (!bg) for (const e of document.elementsFromPoint(cx, cy)) {
          if (e === c.n || e.contains(c.n) || c.n.contains(e)) continue;
          bg = paints(e); if (bg) break;
        }
        if (!bg) {   // sin capa pintada: el fondo más cercano del árbol
          for (let e = c.n.parentElement; e; e = e.parentElement) {
            const st = getComputedStyle(e);
            if (st.backgroundColor !== 'rgba(0, 0, 0, 0)' && alphaOf(st.backgroundColor) >= 0.5) { bg = st.backgroundColor; break; }
          }
        }
        if (!bg) bg = getComputedStyle(document.body).backgroundColor;
        if (!bg) continue;
        const st = getComputedStyle(c.n);
        // en SVG, la tinta que se pinta puede venir de un <tspan> hijo
        const spans = c.n.ownerSVGElement ? [...c.n.querySelectorAll('tspan')].filter((t) => t.textContent.trim()) : [];
        const ink = c.n.ownerSVGElement ? (spans.length ? getComputedStyle(spans[0]).fill : st.fill) : st.color;
        const r = contrast(ink, bg);
        if (r != null && r < 3) lowContrast.push({ text: c.text, ratio: +r.toFixed(2), ink, bg,
          x: c.b.left + scrollX, y: c.b.top + scrollY, w: c.b.width, h: c.b.height });
      }
    }
    return { count: els.length, clipped, stretched, hiddenText,
      crossing: crossing.slice(0, 5), cut: cut.slice(0, 5), spill: spill.slice(0, 5),
      overlaps: overlaps.slice(0, 5), lowContrast: lowContrast.slice(0, 5) };
  })()`);
}

async function pageOverflow(page, width) {
  await page.setViewport(width, 900);
  return page.evalJs('document.documentElement.scrollWidth - window.innerWidth');
}

const report = { started: new Date().toISOString(), pages: [] };
let issues = 0;
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
const nth = (sel, i) => `document.querySelectorAll(${JSON.stringify(sel)})[${i}]`;
const CONTROLS = "'button, select, input'";

async function capture(page, sel, i, file) {
  const b = await page.evalJs(`(() => { const r = ${nth(sel, i)}.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; })()`);
  const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
    clip: { x: Math.round(b.x), y: Math.round(b.y), width: Math.ceil(b.w), height: Math.ceil(b.h), scale: 1 } });
  writeFileSync(join(PNG, file), Buffer.from(shot.data, 'base64'));
  return shot.data;
}

// Fallos de geometría: valen para cualquier estado de la figura, sin mirar píxeles.
function geometryProblems(geo) {
  const problems = [];
  if (geo.clipped.length) problems.push(`recorta contenido (${geo.clipped.length})`);
  if (geo.stretched.length) problems.push(`caja estirada: ${geo.stretched[0].w}×${geo.stretched[0].h} «${geo.stretched[0].text}»`);
  if (geo.hiddenText.length) problems.push(`texto invisible: ${geo.hiddenText[0].text}`);
  if (geo.overlaps.length) problems.push(`texto solapado: «${geo.overlaps[0].a}» × «${geo.overlaps[0].b}»`);
  if (RULES) {
    for (const c of geo.crossing) problems.push(`texto que cruza el borde de una caja: «${c.text}» (texto ${c.tw}×${c.th} px, caja ${c.bw}×${c.bh} px)`);
    if (geo.cut.length) problems.push(`texto recortado por el borde de la figura: «${geo.cut[0]}»`);
    if (geo.spill.length) problems.push(`contenido que desborda su caja <${geo.spill[0].tag}>: «${geo.spill[0].text}»`);
  }
  return problems;
}

// Cada control de la figura, uno a uno: un botón una vez y cinco veces, cada opción de un
// select, cada casilla, y los extremos de un rango. Los estados no iniciales también se ven.
async function controlActions(page, sel, i) {
  const controls = await page.evalJs(`[...${nth(sel, i)}.querySelectorAll(${CONTROLS})].map((c) => ({
    tag: c.tagName, type: c.type || '', disabled: c.disabled, min: c.min, max: c.max,
    options: c.tagName === 'SELECT' ? [...c.options].map((o) => o.value) : [],
    label: (c.textContent || c.getAttribute('aria-label') || c.name || c.id || '').trim().replace(/\s+/g, ' ').slice(0, 24) }))`);
  const actions = [];
  controls.forEach((c, k) => {
    if (c.disabled) return;
    if (c.tag === 'SELECT') c.options.slice(0, 6).forEach((v) => actions.push({ k, value: v, label: `${c.label || 'select'} = ${v}` }));
    else if (c.tag === 'BUTTON') { actions.push({ k, times: 1, label: `clic «${c.label}»` }); actions.push({ k, times: 4, label: `5 clics «${c.label}»` }); }
    else if (c.type === 'checkbox' || c.type === 'radio') actions.push({ k, times: 1, label: `casilla ${c.label || k}` });
    else if (c.type === 'range' || c.type === 'number') [c.min, c.max].filter((v) => v !== '' && v != null).forEach((v) => actions.push({ k, value: v, label: `${c.label || c.type} = ${v}` }));
  });
  return actions.slice(0, STATES_MAX);
}

async function act(page, sel, i, a) {
  return page.evalJs(`(() => {
    const pick = () => [...${nth(sel, i)}.querySelectorAll(${CONTROLS})][${a.k}];
    if (${a.value === undefined}) { for (let n = 0; n < ${a.times ?? 1}; n++) { const c = pick(); if (!c || c.disabled) break; c.click(); } return true; }
    const c = pick(); if (!c || c.disabled) return false;
    c.value = ${JSON.stringify(a.value ?? '')};
    c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

for (const spec of PAGES) {
  if (ONLY && !spec.path.includes(ONLY)) continue;
  const page = await launch({ url: BASE + spec.path, width: 1366, height: 900 });
  const rows = [];
  const pageSlug = slug(spec.path.replace(/(index)?\.html$/, ''));
  for (const old of readdirSync(PNG)) if (old.startsWith(`${pageSlug}-`)) rmSync(join(PNG, old));
  const say = (row) => {
    if (row.problems.length) issues++;
    rows.push(row);
    console.log(`${row.problems.length ? 'FALLA' : 'ok   '} ${spec.path} ${row.sel}${row.problems.length ? ' — ' + row.problems.join('; ') : row.notes.length ? ' — ' + row.notes.join('; ') : ''}`);
  };
  for (const sel of spec.widgets) {
    await page.waitFor(`!!document.querySelector(${JSON.stringify(sel + '[data-rendered]')})`, 8000).catch(() => {});
    const count = await page.evalJs(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
    if (!count) { say({ sel, shot: '', px: { w: 0, h: 0, coverage: 0, blankRun: 0 }, geo: {}, problems: ['no existe'], notes: [] }); continue; }
    for (let i = 0; i < count; i++) {
      const tag = count > 1 ? `${sel} ${i + 1}/${count}` : sel;
      const base = `${pageSlug}-${slug(sel)}-${i + 1}`;
      await page.evalJs(`${nth(sel, i)}.scrollIntoView({ block: 'center' })`);
      await settle(150);
      const shot = await capture(page, sel, i, `${base}.png`);
      const geo = await widgetAudit(page, sel, i);
      const px = await pixelMetrics(page, `data:image/png;base64,${shot}`);
      // un texto puede estar en el DOM pero no pintado (clipeado, tapado): exige ver su tinta
      const verified = [];
      for (const lc of geo.lowContrast) {
        const crop = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
          clip: { x: Math.round(lc.x - 6), y: Math.round(lc.y - 6), width: Math.max(14, Math.round(lc.w + 12)), height: Math.max(14, Math.round(lc.h + 12)), scale: 2 } });
        const cp = await pixelMetrics(page, `data:image/png;base64,${crop.data}`, lc.ink);
        if (cp.inkFrac != null && cp.inkFrac > 0.002) verified.push(lc);
      }
      geo.acceptedContrast = verified.filter((lc) => isAccepted(sel, lc.text));
      geo.lowContrast = verified.filter((lc) => !isAccepted(sel, lc.text));
      const problems = geometryProblems(geo), notes = [];
      if (geo.lowContrast.length) {
        const msg = `contraste ${geo.lowContrast[0].ratio}:1 «${geo.lowContrast[0].text}»`;
        if (spec.strict) problems.push(msg); else notes.push(`${msg} (report-only)`);
      }
      if (px.coverage < MIN_COVERAGE) problems.push(`casi en blanco (${(px.coverage * 100).toFixed(2)}% de tinta)`);
      say({ sel: tag, shot, px, geo, problems, notes });

      // los demás estados de la figura: mismos fallos de geometría, sin repetir los ya dichos
      const told = new Set(problems);
      let states = 0;
      for (const a of await controlActions(page, sel, i)) {
        if (!await act(page, sel, i, a).catch(() => false)) continue;
        states++;
        await settle(250);
        const fresh = geometryProblems(await widgetAudit(page, sel, i)).filter((m) => !told.has(m));
        if (!fresh.length) continue;
        fresh.forEach((m) => told.add(m));
        const state = await capture(page, sel, i, `${base}-estado-${slug(a.label)}.png`);
        say({ sel: `${tag} · tras ${a.label}`, shot: state, px: await pixelMetrics(page, `data:image/png;base64,${state}`), geo: {}, problems: fresh, notes: [] });
      }
      console.log(`      ${tag}: ${states} estado(s) más recorridos`);
    }
  }
  const overflow = { 1366: await pageOverflow(page, 1366), 1312: await pageOverflow(page, 1312) };
  if (overflow[1366] > 1 || overflow[1312] > 1) issues++;
  report.pages.push({ path: spec.path, overflow, rows });
  await page.close();
}
stop();

const html = `<!doctype html><meta charset="utf-8"><title>Auditoría visual</title>
<style>body{font:14px/1.5 system-ui;max-width:1080px;margin:2rem auto;padding:0 1rem;background:#fcfcfb;color:#1c1c1a}
h2{margin-top:2rem} figure{margin:1rem 0;border:1px solid #e1e0d9;border-radius:8px;padding:10px;background:#fff}
figcaption{margin:.3rem 0 .6rem;color:#52514e} img{max-width:100%;border:1px solid #e1e0d9;border-radius:4px}
.falla{border-color:#d03b3b;background:#fdf1f1} code{font-size:12px}</style>
<h1>Auditoría visual</h1><p>${new Date().toISOString()} · ${issues ? `<b>${issues} problema(s)</b>` : 'sin problemas'}</p>
${report.pages.map((p) => `<h2><code>${esc(p.path)}</code></h2><p>desborde de página: 1366 → ${p.overflow[1366]}px · 1312 → ${p.overflow[1312]}px</p>` +
  p.rows.map((r) => `<figure class="${r.problems.length ? 'falla' : ''}">
    <figcaption><b>${esc(r.sel)}</b> — ${r.px.w}×${r.px.h}px · tinta ${(r.px.coverage * 100).toFixed(2)}% · racha vacía ${(r.px.blankRun * 100).toFixed(0)}%${r.problems.length ? ` — <b>${esc(r.problems.join('; '))}</b>` : ''}${r.notes?.length ? ` — ${esc(r.notes.join('; '))}` : ''}</figcaption>
    <img src="data:image/png;base64,${r.shot}" alt="${esc(r.sel)}"></figure>`).join('')).join('')}`;
writeFileSync(join(OUT, 'index.html'), html);
writeFileSync(join(OUT, 'visual.json'), JSON.stringify(report, (k, v) => (k === 'shot' ? undefined : v), 2));
console.log(`visual: ${issues ? `${issues} problema(s)` : 'todo limpio'} — web/review/visual/index.html · capturas en web/review/visual/png/`);
process.exit(issues ? 1 : 0);
