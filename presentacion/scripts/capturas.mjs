// Capturas de una página con Chromium sin ventana (WebGL por SwiftShader), con
// el driver CDP de la web (web/scripts/cdp.mjs). Sirve para revisar las escenas
// 3D y las diapositivas a ojo.
//
//   CHROME=~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome \
//   node presentacion/scripts/capturas.mjs plan.json
//
// plan.json:
//   { "url": "http://localhost:8000/presentacion/prueba-placa.html",
//     "size": [1600, 900],
//     "waitFor": "document.querySelector('[data-ready]')",
//     "shots": [ { "eval": "window.escena.step(1)", "delay": 1200, "out": "/ruta/paso1.png" } ] }
//
// Al final imprime los errores de consola y las excepciones de la página, y
// sale con código 1 si hubo alguno.
import { readFileSync, writeFileSync } from 'node:fs';
import { launch } from '../../web/scripts/cdp.mjs';

const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [w, h] = plan.size ?? [1600, 900];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const page = await launch({ url: 'about:blank', width: w, height: h });
let errors = [];
try {
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__errores = [];
      addEventListener('error', (e) => window.__errores.push('error: ' + (e.message || e.target?.src || e.type)), true);
      addEventListener('unhandledrejection', (e) => window.__errores.push('promesa: ' + (e.reason?.stack || e.reason)));
      const _ce = console.error.bind(console);
      console.error = (...a) => { window.__errores.push('console.error: ' + a.map(String).join(' ')); _ce(...a); };`,
  });
  await page.setViewport(w, h);
  await page.send('Page.navigate', { url: plan.url });
  await page.waitFor('document.readyState === "complete"', 20000);
  if (plan.waitFor) await page.waitFor(plan.waitFor, plan.timeout ?? 30000);
  for (const s of plan.shots ?? []) {
    if (s.eval) await page.evalJs(s.eval);
    if (s.waitFor) await page.waitFor(s.waitFor, s.timeout ?? 30000);
    await sleep(s.delay ?? 800);
    const r = await page.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(s.out, Buffer.from(r.data, 'base64'));
    console.log('captura:', s.out);
  }
  errors = await page.evalJs('window.__errores || []');
  console.log(errors.length ? `ERRORES (${errors.length}):\n${errors.join('\n')}` : 'sin errores de consola');
} finally {
  await page.close();
}
process.exit(errors.length ? 1 : 0);
