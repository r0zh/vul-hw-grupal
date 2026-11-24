// Exporta la presentación a PDF, una página 16:9 por diapositiva: cada una en
// su último paso y con los módulos en modo estático (index.html?estatico).
//
//   CHROME=~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome \
//   node presentacion/scripts/exportar.mjs [--escala 2] [--solo 1,7,12] [--borrador]
//
// Sirve la raíz del repositorio (para que funcionen las rutas ../web/…), abre
// la presentación en Chromium sin ventana (web/scripts/cdp.mjs) a 1920×1080 y,
// por diapositiva, espera a que todas sus .escena tengan data-ready (20 s como
// mucho). Deja un PNG por diapositiva en presentacion/build/png/ y el PDF, con
// el título de la presentación, en presentacion/build/presentacion.pdf (con
// --solo, solo los PNG pedidos). Sale con código 1 si la página da errores
// (excepciones, promesas rechazadas o console.error), si algo se sale del
// escenario de 1920×1080 o si una escena no se monta (data-montaje="fallo") o
// no llega a data-ready: el PDF tendría un hueco. Con --borrador, esto último
// solo avisa (para exportar mientras se trabaja).
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../web/scripts/cdp.mjs';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const BUILD = fileURLToPath(new URL('../build/', import.meta.url));
const PNG = join(BUILD, 'png');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};
const args = process.argv.slice(2);
const opcion = (nombre, defecto) => { const i = args.indexOf(nombre); return i >= 0 ? args[i + 1] : defecto; };
const ESCALA = Number(opcion('--escala', 2));
const SOLO = opcion('--solo', null)?.split(',').map(Number);
const BORRADOR = args.includes('--borrador');
const ESPERA = 20000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const servidor = createServer(async (req, res) => {
  try {
    const fichero = normalize(join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!fichero.startsWith(RAIZ)) throw new Error('fuera de la raíz');
    const datos = await readFile(fichero);
    res.writeHead(200, { 'content-type': TIPOS[extname(fichero).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(datos);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}`;

if (!SOLO) await rm(PNG, { recursive: true, force: true });
await mkdir(PNG, { recursive: true });

const page = await launch({ url: 'about:blank', width: 1920, height: 1080 });
const errores = [], fuera = [], huecos = [], pngs = [];
try {
  // Errores de JavaScript (no los 404 de recursos: un póster que aún no existe no es un error).
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__errores = [];
      addEventListener('error', (e) => { if (e instanceof ErrorEvent) window.__errores.push('error: ' + e.message); });
      addEventListener('unhandledrejection', (e) => window.__errores.push('promesa: ' + (e.reason?.stack || e.reason)));
      const _ce = console.error.bind(console);
      console.error = (...a) => { window.__errores.push('console.error: ' + a.map(String).join(' ')); _ce(...a); };`,
  });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: ESCALA, mobile: false });
  await page.send('Page.navigate', { url: `${base}/presentacion/index.html?estatico` });
  await page.waitFor('document.readyState === "complete" && !!window.deck && document.fonts.status === "loaded"', 30000);
  const total = await page.evalJs('deck.total');

  for (let i = 0; i < total; i++) {
    if (SOLO && !SOLO.includes(i + 1)) continue;
    await page.evalJs(`deck.ir(${i})`);
    const listo = `(() => { const d = deck.diapositivas[${i}];
      return [...d.querySelectorAll('.escena')].every((e) => e.dataset.ready === '1' || e.dataset.montaje === 'fallo')
        && [...d.querySelectorAll('img')].every((im) => im.complete); })()`;
    try {
      await page.waitFor(listo, ESPERA);
    } catch {
      const faltan = await page.evalJs(`[...deck.diapositivas[${i}].querySelectorAll('.escena')]
        .filter((e) => e.dataset.ready !== '1').map((e) => e.dataset.modulo).join(', ')`);
      huecos.push(`diapositiva ${i + 1}: sin data-ready tras ${ESPERA / 1000} s (${faltan}); se queda el póster`);
    }
    const fallos = await page.evalJs(`[...deck.diapositivas[${i}].querySelectorAll('.escena[data-montaje="fallo"]')].map((e) => e.dataset.modulo).join(', ')`);
    if (fallos) huecos.push(`diapositiva ${i + 1}: no se pudo montar ${fallos}; se ve el póster o un recuadro`);
    await page.evalJs('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    await sleep(300);

    // ¿Algo se sale del escenario? (rectángulos visibles fuera de 1920×1080, salvo
    // los que recorta un antepasado, como las columnas de las cifras que ruedan)
    const sale = await page.evalJs(`(() => {
      const esc = document.querySelector('.escenario').getBoundingClientRect(), out = [];
      const fuera = (r) => r.left < esc.left - 1 || r.top < esc.top - 1 || r.right > esc.right + 1 || r.bottom > esc.bottom + 1;
      const recortado = (el) => {
        for (let a = el.parentElement; a && !a.classList.contains('diapo'); a = a.parentElement) {
          if (getComputedStyle(a).overflow !== 'visible' && !fuera(a.getBoundingClientRect())) return true;
        }
        return false;
      };
      for (const el of deck.diapositivas[${i}].querySelectorAll('*')) {
        if (el.closest('.notas')) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
        if (fuera(r) && !recortado(el)) {
          const name = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].join('.') : '');
          out.push(name + ' [' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(', ') + ']');
        }
      }
      return out.slice(0, 8);
    })()`);
    const id = await page.evalJs(`deck.diapositivas[${i}].id`);
    if (sale.length) fuera.push(`diapositiva ${i + 1} (${id}): ${sale.join('; ')}`);

    const nombre = `${String(i + 1).padStart(2, '0')}-${id}.png`;
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(PNG, nombre), Buffer.from(data, 'base64'));
    pngs.push(nombre);
    console.log('captura:', join(PNG, nombre));
  }
  errores.push(...await page.evalJs('window.__errores || []'));

  if (!SOLO) {
    const titulo = (await page.evalJs('document.title')).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const paginas = pngs.map((f) => `<div class="p"><img src="png/${f}" alt=""></div>`).join('\n');
    await writeFile(join(BUILD, 'pdf.html'), `<!doctype html><meta charset="utf-8"><title>${titulo}</title><style>
      @page { size: 1920px 1080px; margin: 0 }
      html, body { margin: 0; background: #f5f5f7 }
      .p { width: 1920px; height: 1080px; overflow: hidden; break-after: page }
      .p:last-child { break-after: auto }
      .p img { display: block; width: 1920px; height: 1080px }
    </style>\n${paginas}`);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.navigate', { url: `${base}/presentacion/build/pdf.html` });
    await page.waitFor('document.readyState === "complete" && [...document.images].every((i) => i.complete && i.naturalWidth)', 60000);
    const { data } = await page.send('Page.printToPDF', {
      printBackground: true, preferCSSPageSize: true, paperWidth: 20, paperHeight: 11.25,
      marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
    });
    await writeFile(join(BUILD, 'presentacion.pdf'), Buffer.from(data, 'base64'));
    console.log('pdf:', join(BUILD, 'presentacion.pdf'), `(${pngs.length} páginas)`);
  }
} finally {
  await page.close();
  servidor.close();
}

for (const h of huecos) (BORRADOR ? console.warn : console.error)(BORRADOR ? 'aviso:' : 'escena sin dibujar:', h);
for (const f of fuera) console.error('se sale del escenario:', f);
console.log(errores.length ? `ERRORES DE PÁGINA (${errores.length}):\n${errores.join('\n')}` : 'sin errores de página');
process.exit(errores.length || fuera.length || (huecos.length && !BORRADOR) ? 1 : 0);
