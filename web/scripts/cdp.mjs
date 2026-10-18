// Minimal Chrome DevTools Protocol driver, no dependencies. Node >= 22 has a
// global WebSocket. Used by scripts/learn.mjs to drive real widgets in a real
// browser: set knobs, read rendered output, take screenshots.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome() {
  const env = process.env.CHROME;
  if (env) return env;
  return ['chromium', 'chromium-browser', 'google-chrome'].find((b) => {
    try { execFileSync('which', [b], { stdio: 'ignore' }); return true; } catch { return false; }
  });
}

export async function launch({ url, width = 1366, height = 900, chrome = findChrome() } = {}) {
  if (!chrome) throw new Error('no chromium found; set CHROME=/path/to/chrome');
  const dir = mkdtempSync(join(tmpdir(), 'notes-cdp-'));
  const proc = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=0', `--user-data-dir=${dir}`,
    `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });

  let port;
  for (let i = 0; i < 200 && !port; i++) {
    try { port = readFileSync(join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); }
    catch { await sleep(50); }
  }
  if (!port) { proc.kill(); throw new Error('chrome did not expose a debugging port'); }

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`));
    else p.resolve(msg.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });

  const page = {
    send,
    async evalJs(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result?.value;
    },
    async waitFor(expression, timeout = 10000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        try { if (await page.evalJs(expression)) return; } catch { /* page may still be loading */ }
        await sleep(50);
      }
      throw new Error(`waitFor timed out: ${expression}`);
    },
    async setViewport(w, h) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await sleep(100);
    },
    async screenshot() {
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
      return r.data;
    },
    async text() {
      return page.evalJs('document.body.innerText');
    },
    async close() {
      try { ws.close(); } catch { /* already closed */ }
      proc.kill();
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    },
  };
  return page;
}
