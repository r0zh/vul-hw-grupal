// Prueba de humo en el navegador: sirve la raíz del repositorio, carga la
// página en Chromium headless y comprueba que sus custom elements se han
// pintado y que no ha habido errores. Atrapa fallos que `node --check` no ve
// (un ReferenceError que solo existe en el navegador, una ruta absoluta).
//
// La página se abre en /web/, no en la raíz: GitHub Pages la sirve bajo
// /vul-hw-grupal/, así que una ruta absoluta (/js/...) fallaría aquí también.
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findChrome } from './cdp.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 8123, BASE = `http://localhost:${PORT}`;
const PAGES = [
  { path: '/web/index.html', must: ['cpa-live id="cpa-main"', 'data-recovered="16"', 'cpa-leak id="leak"', 'data-hw="4"', 'Datos simulados', 'aes-title'] },
];
const chrome = findChrome();
if (!chrome) { console.log('smoke: no hay Chromium, se omite'); process.exit(0); }

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);
for (let i = 0; i < 50; i++) {
  try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
}

let failed = false;
for (const page of PAGES) {
  // El script de la página guarda los errores en window.__pageErrors; aquí se vuelcan al DOM.
  const dom = execFileSync(chrome, ['--headless', '--no-sandbox', '--disable-gpu',
    '--virtual-time-budget=6000', '--dump-dom', BASE + page.path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const missing = page.must.filter((needle) => !dom.includes(needle));
  const errors = dom.match(/data-page-errors="([^"]*)"/);
  if (errors) missing.push(`sin errores (hay: ${errors[1]})`);
  for (const needle of missing) console.error(`smoke: FALLA ${page.path} — falta ${needle}`);
  if (missing.length) failed = true;
  else console.log(`smoke: ok ${page.path}`);
}
stop();
if (failed) process.exit(1);
console.log('smoke: todas las páginas bien');
