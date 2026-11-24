// Renderiza un plano en PNG numerados: salida/<id>/<ancho>x<alto>-<muestras>-<denoise>/0000.png… Un plano es
// planos/<id>.mjs y exporta `duration` (s), `fps` (opcional, 30), `scene()` → { parts, environment } (puede ser async; se
// llama una vez) y `frame(t, escena)` → { camera, parts?, environment?, key?, seed? }: lo que cambia en el instante t. Dos
// fotogramas con la misma `key` son iguales: el segundo copia el PNG del primero (esperas, pausas) en vez de trazarlo.
// `seed` (por defecto, el número de fotograma) fija el ruido: con la cámara quieta, la misma semilla deja quieto lo que
// no cambia, aunque cambie otra cosa del plano (un brillo, una pieza que se mueve).
// Con `anclas(t)` → { id: [x, y, z] en metros }, `--anclas f.json` escribe sin renderizar, para cada fotograma, dónde cae
// cada ancla en la imagen (fracción del ancho y del alto desde arriba a la izquierda), con la cámara de `frame` y lo
// que exporte el plano en `cues`: es lo que leen las etiquetas HTML que acompañan al vídeo.
//
//   node render.mjs planos/piloto.mjs --nativo     GPU con Cook (RTX, Vulkan): 1920×1080, 256 muestras, OIDN
//   node render.mjs planos/piloto.mjs --previa     CPU de Crucible aquí: 480×270, 16 muestras (sin desenfoque)
//   node render.mjs planos/v2.mjs --anclas v2.json --ancho 1152 --alto 724   anclas de las etiquetas, sin GPU
//
// Opciones: --ancho --alto --muestras --rebotes (8) --exposicion (1) --desde N --hasta M (fotogramas, los dos incluidos)
// --fotogramas 0,59,137 (solo esos: fotos fijas en una sesión)
// --denoise (nativo: oidn|atrous|none; previa: wavelet|oidn|none) --procesos N (previa).
// No repite los PNG que ya existen: se puede cortar, reanudar y repartir por trozos.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createCamera, renderPathTracedImage, toneMapToRgba8 } from '@codepawlhq/crucible/addons/path-tracer';
import { encodePng } from './node_modules/@codepawlhq/cook/output/png.mjs';

const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: {
  previa: { type: 'boolean' }, nativo: { type: 'boolean' },
  ancho: { type: 'string' }, alto: { type: 'string' }, muestras: { type: 'string' }, rebotes: { type: 'string', default: '8' },
  exposicion: { type: 'string', default: '1' }, desde: { type: 'string' }, hasta: { type: 'string' },
  denoise: { type: 'string' }, procesos: { type: 'string', default: '1' }, anclas: { type: 'string' }, fotogramas: { type: 'string' },
} });
const native = opt.nativo === true;
if ((opt.anclas === undefined && native === (opt.previa === true)) || positionals.length !== 1) {
  console.error('Uso: node render.mjs planos/<id>.mjs --previa|--nativo|--anclas f.json [--ancho --alto --muestras --desde --hasta --denoise --procesos]');
  process.exit(2);
}
const int = (value, name) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`--${name} pide un entero ≥ 0, no ${value}`);
  return n;
};
const width = int(opt.ancho ?? (native ? 1920 : 480), 'ancho'), height = int(opt.alto ?? (native ? 1080 : 270), 'alto');
const samples = int(opt.muestras ?? (native ? 256 : 16), 'muestras'), bounces = int(opt.rebotes, 'rebotes');
const exposure = Number(opt.exposicion), processes = int(opt.procesos, 'procesos');
const denoise = opt.denoise ?? (native ? 'oidn' : 'wavelet');
if (!(native ? ['oidn', 'atrous', 'none'] : ['wavelet', 'oidn', 'none']).includes(denoise)) throw new RangeError(`--denoise ${denoise} no vale en este modo`);
if (native && processes > 1) throw new RangeError('--procesos es solo para --previa: en nativo hay una GPU y una sesión');

const planPath = resolve(positionals[0]);
const id = basename(planPath, '.mjs');
const plan = await import(pathToFileURL(planPath).href);
const fps = plan.fps ?? 30, total = Math.round(plan.duration * fps);
const first = int(opt.desde ?? 0, 'desde'), last = Math.min(int(opt.hasta ?? total - 1, 'hasta'), total - 1);
if (opt.anclas !== undefined) {
  if (typeof plan.anclas !== 'function') throw new Error(`${id} no exporta anclas(t)`);
  const scene = await plan.scene(), anchors = {};
  for (let i = 0; i < total; i++) {
    const c = createCamera(plan.frame(i / fps, scene).camera, width, height);
    for (const [name, p] of Object.entries(plan.anclas(i / fps))) {
      const d = p.map((v, k) => v - c.eye[k]), dot = (a) => a.reduce((s, v, k) => s + v * d[k], 0), z = dot(c.forward);
      const at = [0.5 + dot(c.right) / z / (2 * c.halfWidth), 0.5 - dot(c.above) / z / (2 * c.halfHeight)];
      (anchors[name] ??= []).push(z > 0 ? at.map((v) => Math.round(v * 1e4) / 1e4) : null);
    }
  }
  writeFileSync(opt.anclas, JSON.stringify({ plan: id, fps, width, height, frames: total, ...plan.cues, anchors }));
  console.log(`${opt.anclas}: ${Object.keys(anchors).length} anclas × ${total} fotogramas (${width}×${height})`);
  process.exit(0);
}
// Cada ajuste va a su carpeta, para que un trozo reanudado nunca mezcle fotogramas de dos ajustes.
const dir = fileURLToPath(new URL(`./salida/${id}/${width}x${height}-${samples}-${native ? denoise : `previa-${denoise}`}/`, import.meta.url));
mkdirSync(dir, { recursive: true });
const pngPath = (i) => `${dir}${String(i).padStart(4, '0')}.png`;
const pending = [];
const wanted = opt.fotogramas?.split(',').map((v) => int(v, 'fotogramas'));
for (let i = first; i <= last; i++) if ((!wanted || wanted.includes(i)) && !existsSync(pngPath(i))) pending.push(i);
console.log(`${id}: ${total} fotogramas a ${fps} fps; faltan ${pending.length} entre ${first} y ${last} · ${native ? 'nativo' : 'previa'} ${width}×${height}, ${samples} muestras, denoise ${denoise} → ${dir}`);

// Previa en varios procesos: el trazador de CPU usa un solo hilo en Node, así que cada hijo hace un trozo seguido.
if (processes > 1 && pending.length > 1) {
  const n = Math.min(processes, pending.length), size = Math.ceil(pending.length / n);
  const children = [];
  for (let k = 0; k < n; k++) {
    const part = pending.slice(k * size, (k + 1) * size);
    if (!part.length) continue;
    const args = [fileURLToPath(import.meta.url), planPath, '--previa', '--ancho', width, '--alto', height, '--muestras', samples,
      '--rebotes', bounces, '--exposicion', exposure, '--denoise', denoise, '--desde', part[0], '--hasta', part.at(-1)].map(String);
    children.push(new Promise((done) => spawn(process.execPath, args, { stdio: 'inherit' }).on('exit', done)));
  }
  process.exit((await Promise.all(children)).some((code) => code !== 0) ? 1 : 0);
}
if (!pending.length) process.exit(0);

const base = await plan.scene();
const twins = new Map(); // key → primer fotograma con esa clave que ya tiene PNG
const keyOf = (i) => plan.frame(i / fps, base).key;
for (let i = first; i <= last; i++) {
  const key = existsSync(pngPath(i)) ? keyOf(i) : undefined;
  if (key !== undefined && !twins.has(key)) twins.set(key, i);
}
const traceOptions = { width, height, samples, bounces, seed: 0 };
const oidn = denoise === 'oidn' ? await openOidn() : null;
const trace = native ? await openNative() : preview;
const vram = native ? watchVram() : null;

const times = [];
for (const i of pending) {
  const started = performance.now();
  const f = plan.frame(i / fps, base);
  if (twins.has(f.key) && existsSync(pngPath(twins.get(f.key)))) {
    copyFileSync(pngPath(twins.get(f.key)), pngPath(i));
    console.log(`  ${String(i).padStart(4, '0')}: copia de ${String(twins.get(f.key)).padStart(4, '0')}`);
    continue;
  }
  if (f.key !== undefined) twins.set(f.key, i);
  const { color, note } = await trace({ parts: f.parts, environment: f.environment, camera: f.camera }, f.seed ?? i);
  const rgba = toneMapToRgba8(color, width, height, { viewTransform: 'neutral', exposure });
  writeFileSync(`${pngPath(i)}.tmp`, encodePng(rgba, width, height));
  renameSync(`${pngPath(i)}.tmp`, pngPath(i)); // un PNG a medias nunca cuenta como hecho
  const seconds = (performance.now() - started) / 1000;
  times.push(seconds);
  console.log(`  ${String(i).padStart(4, '0')}: ${seconds.toFixed(2)} s (${note})`);
  // El addon libera los planos de cada fotograma desde el bucle de eventos: sin esta espera, la memoria crece.
  await new Promise((done) => setImmediate(done));
}
if (!times.length) process.exit(0); // todo eran copias
const steady = times.length > 1 ? times.slice(1) : times; // el primero compila los shaders y sube la escena
const mean = steady.reduce((a, b) => a + b, 0) / steady.length;
console.log(`${times.length} fotogramas en ${times.reduce((a, b) => a + b, 0).toFixed(0)} s; ${mean.toFixed(2)} s por fotograma sin contar el primero (${times[0].toFixed(1)} s)`
  + `${vram ? `; VRAM: pico de ${await vram.stop()} MiB en toda la tarjeta (nvidia-smi)` : ''}`);

// CPU de Crucible, un hilo: sirve para revisar encuadres sin GPU. No dibuja la profundidad de campo.
async function preview(view, i) {
  const r = await renderPathTracedImage({ parts: view.parts ?? base.parts, environment: view.environment ?? base.environment, camera: view.camera },
    { ...traceOptions, seed: i, denoise: denoise === 'wavelet', threads: 1 });
  return { color: oidn ? oidn(r.features) : r.linear, note: r.report.ignored.join(' ') || 'cpu' };
}

// Cook en la GPU con una sesión (README de @codepawlhq/cook, «Sessions»): la escena se sube, se compila y se construye
// una vez. Si el plano solo mueve la cámara, cada fotograma manda solo la cámara (packCameraParams); si devuelve
// parts o environment, se vuelve a empaquetar y session.update cambia materiales, luces y transformaciones sin
// recompilar; lo que update no admite (otro número de piezas, texturas, cielo) abre una sesión nueva.
async function openNative() {
  const cook = await import('@codepawlhq/cook');
  if (!cook.findNativeAddon()) throw new Error('Falta el addon de Cook: npx cook fetch-addon');
  const { buildJobNativeInput, buildFlattenedJobNativeInput } = await import('@codepawlhq/cook/job-input');
  const { encodePackFile } = await import('@codepawlhq/cook/pack-file');
  // Crucible 0.22.0 no publica buildTraceScene ni el empaquetador de tablas: se toman de su build igual que hace su propio
  // trabajo de render (exportNativeScene, en su build/). Estos nombres de fichero cambian con cada versión.
  const build = new URL('./node_modules/@codepawlhq/crucible/build/', import.meta.url);
  const { buildTraceScene, resolveTexture } = (await import(new URL('path-tracer-scene-cakEyFmm.js', build))).u;
  const pack = (await import(new URL('path-tracer-gpu-pack-CBRnnSFk.js', build))).d;
  const limits = { instancing: true, instanceNormalMappedParts: true, maximumTriangles: 4_000_000, maximumInstances: 1_000_000, maximumLights: 256, maximumParts: 1_000_000 };
  const packScene = (view, camera) => {
    const scene = buildTraceScene(view.parts ?? base.parts, view.environment ?? base.environment, limits);
    // Sin geometría compartida no hay instancias: va aplanada (como hace exportNativeScene).
    const toInput = scene.instances ? buildJobNativeInput : buildFlattenedJobNativeInput;
    return toInput(scene, camera, { ...traceOptions, clampIndirect: 10 }, pack, resolveTexture);
  };
  let session = null;
  return (view, i) => {
    const camera = createCamera(view.camera, width, height);
    let note = 'solo cámara';
    if (!session) {
      const input = packScene(view, camera);
      writeFileSync(`${dir}escena.cookpack`, encodePackFile(input)); // para `npx cook info` o `npx cook render`
      session = cook.createNativeSession(input, { kernel: 'cycles' });
      note = 'sesión nueva';
    } else if (view.parts || view.environment) {
      const input = packScene(view, camera);
      try {
        const report = session.update(input);
        note = `update ${report.uploadedTables?.join?.(',') ?? ''}`.trim();
      } catch (error) {
        session.close();
        session = cook.createNativeSession(input, { kernel: 'cycles' });
        note = `sesión nueva: ${error.message}`;
      }
    }
    const r = session.render({ width, height, samples, seed: i, camera, ...(denoise === 'atrous' ? { denoise: 'atrous' } : {}) });
    const color = rgbOf(denoise === 'atrous' ? r.denoisedRgba : r.rgba);
    note += `; traza ${(r.tracedSeconds ?? 0).toFixed(2)} s${r.compileSeconds > 1 ? `, compila ${r.compileSeconds.toFixed(1)} s` : ''}`;
    const started = performance.now();
    const out = oidn ? oidn({ color, albedo: r.albedo, normal: unit(r.normal) }) : color;
    if (oidn) note += `, OIDN ${((performance.now() - started) / 1000).toFixed(2)} s`;
    return { color: out, note };
  };
}

// OIDN dentro del addon de Cook, con la biblioteca oficial que deja pod/arranque.sh. Prueba la GPU (CUDA) y, si no
// puede, la CPU.
async function openOidn() {
  const { createNativeOidnDenoiser } = await import('@codepawlhq/cook');
  const libraryPath = process.env.OIDN_LIBRARY_PATH ?? '/workspace/opt/oidn/lib/libOpenImageDenoise.so.2';
  for (const device of [process.env.OIDN_DEVICE ?? 'cuda', 'cpu']) {
    try {
      const filter = createNativeOidnDenoiser({ libraryPath, device });
      console.log(`OIDN en ${device} (${libraryPath})`);
      return ({ color, albedo, normal }) => filter.denoise({ width, height, color, albedo, normal }).color;
    } catch (error) {
      console.log(`OIDN no abre en ${device}: ${error.message}`);
    }
  }
  throw new Error('No hay OIDN: ejecuta pod/arranque.sh o pon OIDN_LIBRARY_PATH; o usa --denoise atrous');
}

// Pico de memoria de la tarjeta mientras se renderiza: un nvidia-smi hijo escribe una lectura cada 250 ms (el trazado
// bloquea este proceso, así que un temporizador de aquí no saltaría). Cuenta toda la tarjeta.
function watchVram() {
  let peak = 0, text = '';
  const child = spawn('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits', '-lms', '250'], { stdio: ['ignore', 'pipe', 'ignore'] });
  child.on('error', () => {});
  child.stdout.on('data', (chunk) => {
    const lines = (text + chunk).split('\n');
    text = lines.pop();
    for (const line of lines) if (Number.isFinite(+line) && line.trim()) peak = Math.max(peak, +line);
  });
  return { stop: async () => { await new Promise((done) => setTimeout(done, 300)); child.kill(); return peak || '?'; } };
}

function rgbOf(rgba) {
  const rgb = new Float32Array((rgba.length / 4) * 3);
  for (let p = 0, q = 0; p < rgba.length; p += 4, q += 3) { rgb[q] = rgba[p]; rgb[q + 1] = rgba[p + 1]; rgb[q + 2] = rgba[p + 2]; }
  return rgb;
}

function unit(normal) {
  for (let p = 0; p < normal.length; p += 3) {
    const n = Math.hypot(normal[p], normal[p + 1], normal[p + 2]);
    if (n > 1e-6) for (let k = 0; k < 3; k++) normal[p + k] /= n;
  }
  return normal;
}
