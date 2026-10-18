// The learning check: drive every widget in headless Chromium, assert the
// observable claims in spec/*.mjs, screenshot each state, and write a
// reviewable contact sheet to review/. Run:
//
//   node scripts/learn.mjs            # todas las specs
//   node scripts/learn.mjs --note=cpa
//
// Sirve la raíz del repositorio y abre la página en /web/, como Pages.
//
// Exit code 1 means at least one claim failed. Read the printed widget text
// to see what a learner would see in that state.
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { launch, findChrome } from './cdp.mjs';
import { assert } from '../spec/helpers.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const WEB = join(ROOT, 'web');
const PORT = 8126, BASE = `http://localhost:${PORT}`;
const REVIEW = join(WEB, 'review');
const only = process.argv.find((a) => a.startsWith('--note='))?.split('=')[1];

if (!findChrome()) { console.error('learn: no chromium found; set CHROME=/path/to/chrome'); process.exit(1); }

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);

for (let i = 0; i < 50; i++) {
  try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
}

const specDir = join(WEB, 'spec');
let specs = [];
for (const f of readdirSync(specDir).filter((f) => f.endsWith('.mjs') && f !== 'helpers.mjs').sort()) {
  const mod = await import(pathToFileURL(join(specDir, f)).href);
  if (mod.spec) specs.push(mod.spec);
}
if (only) specs = specs.filter((s) => s.slug === only);
if (!specs.length) { console.error(`learn: no spec matches ${only ?? '(all)'}`); stop(); process.exit(1); }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
mkdirSync(REVIEW, { recursive: true });

const report = { started: new Date().toISOString(), notes: [] };
let failures = 0;

for (const spec of specs) {
  console.log(`\n=== ${spec.slug} — ${spec.title} (${spec.page})`);
  const page = await launch({ url: BASE + spec.page });
  const ready = spec.ready ?? `!!document.querySelector(${JSON.stringify(spec.widget + '[data-rendered]')})`;
  const claims = [];

  for (const claim of spec.claims) {
    await page.send('Page.navigate', { url: BASE + spec.page });
    await page.waitFor(ready);
    await page.setViewport(1366, 900);
    await page.waitFor('document.readyState === "complete"');
    // Count interactions: a claim that needs many knob turns to show a
    // concept is a candidate for a simpler default or a preset button.
    await page.evalJs(`window.__events = 0; for (const t of ['input', 'change', 'click'])
      document.addEventListener(t, () => window.__events++, true);`);
    let status = 'pass', error = null;
    try {
      await claim.run({ page, assert });
      const errors = await page.evalJs('window.__pageErrors ?? []');
      if (errors.length) throw new Error(`errores en la página: ${errors.join(' | ')}`);
    } catch (e) { status = 'fail'; error = e.message; }
    const events = await page.evalJs('window.__events ?? 0');
    const text = await page.evalJs(`(document.querySelector(${JSON.stringify(spec.widget)})?.querySelector('.out'))?.innerText ?? ''`);
    let shot = null;
    try { shot = await page.screenshot(); } catch { /* screenshot is for review, not correctness */ }
    if (status === 'fail') failures++;
    claims.push({ id: claim.id, why: claim.why, status, error, text, events, shot });
    const flag = events > 3 ? ` [!] ${events} interactions` : ` [${events}]`;
    console.log(`  ${status === 'pass' ? 'ok  ' : 'FAIL'} ${claim.id}${flag}${error ? ` — ${error}` : ''}`);
    if (text) console.log(`       ${text.replace(/\n/g, ' | ')}`);
  }
  await page.close();
  report.notes.push({ slug: spec.slug, title: spec.title, page: spec.page,
    claims: claims.map(({ shot, ...c }) => c) });
  writeFileSync(join(REVIEW, `${spec.slug}.html`), noteHtml(spec, claims));
}

writeFileSync(join(REVIEW, 'report.json'), JSON.stringify(report, null, 2));
writeFileSync(join(REVIEW, 'index.html'), indexHtml(report));
stop();
console.log(`\nlearn: ${failures ? `${failures} failing claim(s)` : 'all claims pass'} — web/review/`);
if (failures) process.exit(1);

function noteHtml(spec, claims) {
  const rows = claims.map((c) => `
    <section class="claim ${c.status}">
      <h2><span class="badge">${c.status}</span> ${esc(c.id)} <span class="ev">${c.events} interaction${c.events === 1 ? '' : 's'}</span></h2>
      <p class="why">${esc(c.why)}</p>
      ${c.error ? `<pre class="err">${esc(c.error)}</pre>` : ''}
      <pre class="text">${esc(c.text)}</pre>
      ${c.shot ? `<img alt="screenshot of ${esc(c.id)}" src="data:image/jpeg;base64,${c.shot}">` : ''}
    </section>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>${esc(spec.title)} — learning check</title>
  <style>body{font:15px/1.5 system-ui,sans-serif;max-width:1000px;margin:2rem auto;padding:0 1rem;background:#fcfcfb;color:#1c1c1a}
  .claim{border:1px solid #e1e0d9;border-radius:8px;padding:1rem;margin:1.4rem 0}
  .claim.fail{border-color:#d03b3b;background:#fdf1f1}
  .badge{font:11px ui-monospace;text-transform:uppercase;color:#1baf7a} .fail .badge{color:#d03b3b}
  h2{font-size:1rem;margin:0 0 .3rem} .why{color:#898781;margin:.2rem 0 .6rem}
  .ev{float:right;font:11px ui-monospace;color:#898781}
  pre{background:#f4f3ee;border-radius:6px;padding:.6rem .8rem;overflow:auto} pre.err{background:#fbe3e3}
  img{max-width:100%;border:1px solid #e1e0d9;border-radius:6px}</style>
  <p><a href="./index.html">← all notes</a></p><h1>${esc(spec.title)}</h1>${rows}`;
}

function indexHtml(rep) {
  const notes = rep.notes.map((n) => {
    const pass = n.claims.filter((c) => c.status === 'pass').length;
    const rows = n.claims.map((c) => `<tr class="${c.status}"><td>${esc(c.id)}</td><td>${c.status}</td><td>${c.events}</td><td>${esc(c.error ?? '')}</td></tr>`).join('');
    return `<h2><a href="./${esc(n.slug)}.html">${esc(n.title)}</a> — ${pass}/${n.claims.length}</h2>
      <table><tr><th>claim</th><th>status</th><th>interactions</th><th>error</th></tr>${rows}</table>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><title>Learning check</title>
  <style>body{font:15px/1.5 system-ui,sans-serif;max-width:1000px;margin:2rem auto;padding:0 1rem;background:#fcfcfb;color:#1c1c1a}
  table{border-collapse:collapse;width:100%}td,th{border:1px solid #e1e0d9;padding:3px 8px;text-align:left;font-size:13px}
  tr.fail td{background:#fdf1f1}</style>
  <h1>Learning check</h1><p>${rep.started}</p>${notes}`;
}
