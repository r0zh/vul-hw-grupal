import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { envelope } from '../../../web/js/model/spa.js';
import { PALETA, css } from '../paleta.js';

const STEPS = 4;
const WIDTH = 16.8;
const HEIGHT = 2.6;
const THICKNESS = 0.035;
const FACE = THICKNESS / 2;
const COLUMNS = 2800;
const STACK = { x: -4.37, y: -0.14, rise: 0.46, depth: 0.40, width: 5.5, height: 0.46 };
const FLAT_THICKNESS = 0.02;
const ALTERNATE_TINT = 0.06;
const FOLD = {
  duration: 1400, stagger: 45, liftEnd: 0.54, gatherStart: 0.38, clearance: 0.12, introEnd: 0.33, pan: 1.90,
};
// `room`: cuánto se puede acercar cada vista en un contenedor más ancho que 16:9
// antes de que la altura no le quepa (la diapositiva le da unos 1710×630).
const VIEWS = {
  sheet: { x: 0, y: 0.43, z: 0, distance: 25.25, room: 2.3 },
  stack: { x: 0.46, y: 1.82, z: -1.82, distance: 20, room: 1.03 },
  focus: { x: 0.26, y: 1.68, z: -1.08, distance: 19.85, room: 1 },
};
const FOCUS_LABEL = { width: 444, height: 76, gap: 18, margin: 0.04 };
const { lerp, clamp, degToRad, smoothstep } = THREE.MathUtils;
const tone = {
  paper: new THREE.Color(PALETA.superficie),
  ink: new THREE.Color(PALETA.tinta),
  blue: new THREE.Color(PALETA.acento),
  background: new THREE.Color(PALETA.fondo),
};
// El tinte se mezcla en sRGB, como en CSS: mezclado en lineal sale lila.
const alternate = (() => {
  const [a, b] = [PALETA.superficie, PALETA.acento].map((hex) => new THREE.Color(hex).getRGB({}, THREE.SRGBColorSpace));
  const mix = (key) => lerp(a[key], b[key], ALTERNATE_TINT);
  return new THREE.Color().setRGB(mix('r'), mix('g'), mix('b'), THREE.SRGBColorSpace);
})();

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t ** 3 : 1 - 4 * (1 - t) ** 3;
}

function formatCount(n) {
  return n < 10000 ? String(n) : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
}

function stepNumber(value, fallback) {
  return Number.isFinite(value) ? clamp(Math.trunc(value), 0, STEPS - 1) : fallback;
}

function weightsFor(n) {
  return Array.from({ length: STEPS }, (_, i) => Number(i === n));
}

function makeTraceStyle() {
  return {
    band: new THREE.MeshBasicMaterial({
      color: PALETA.tinta, opacity: 0.14, transparent: true, depthWrite: false, toneMapped: false,
    }),
    crest: new LineMaterial({
      color: PALETA.tinta, linewidth: 2, alphaToCoverage: true, toneMapped: false,
    }),
  };
}

function makeRibbon(points, style) {
  const vertices = new Float32Array(points.length * 6);
  const ridge = new Float32Array(points.length * 3);
  const faces = [];
  const y = (adc) => -0.86 + adc * (0.75 * HEIGHT / 145);
  points.forEach(({ x, lo, hi }, i) => {
    vertices.set([x, y(lo), FACE + 0.006, x, y(hi), FACE + 0.006], 6 * i);
    ridge.set([x, y(hi), FACE + 0.014], 3 * i);
    if (i) {
      const a = 2 * (i - 1);
      faces.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(faces);
  return [
    new THREE.Mesh(geometry, style.band),
    new Line2(new LineGeometry().setPositions(ridge), style.crest),
  ];
}

function makeCard(spa, span, styles) {
  const { round, from, to } = span;
  const width = WIDTH * (to - from) / spa.end;
  const cuts = [from];
  if (round === 1) {
    cuts.push(...spa.fuga.filter((edge) => from < edge && edge < to));
  }
  cuts.push(to);

  const sections = cuts.slice(1).map((end, i) => {
    const start = cuts[i];
    const columns = Math.min(end - start, Math.max(1, Math.round(COLUMNS * (end - start) / spa.end)));
    return { start, end, columns, ...envelope(spa.mean, start, end, columns) };
  });

  const group = new THREE.Group();
  const localX = (cycle) => lerp(
    from === 0 ? 0.12 / width : 0,
    to === spa.end ? 1 - 0.12 / width : 1,
    (cycle - from) / (to - from),
  );

  const point = (section, index, cycle) => ({
    x: localX(cycle), lo: section.lo[index], hi: section.hi[index],
  });

  // En el corte azul, ambas cintas comparten el mismo vértice.
  const joins = sections.slice(1).map((next, i) => {
    const previous = sections[i];
    const a = point(previous, previous.columns - 1, next.start);
    const b = point(next, 0, next.start);
    return { x: b.x, lo: (a.lo + b.lo) / 2, hi: (a.hi + b.hi) / 2 };
  });
  sections.forEach((section, i) => {
    const { start, end, columns } = section;
    const points = Array.from({ length: columns }, (_, c) =>
      point(section, c, start + (c + 0.5) * (end - start) / columns));
    points.unshift(joins[i - 1] ?? point(section, 0, start));
    points.push(joins[i] ?? point(section, columns - 1, end));
    let style = styles.rear;
    if (round === 0) style = styles.intro;
    if (round === 1) style = start >= spa.fuga[0] && end <= spa.fuga[1] ? styles.leak : styles.first;
    group.add(...makeRibbon(points, style));
  });

  return { round, group, width, x: WIDTH * (from / spa.end - 0.5) };
}

function makeShadow() {
  const width = 128;
  const height = 48;
  const data = new Uint8Array(width * height * 4);
  const white = PALETA.superficie & 0xff;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = Math.abs(2 * x / (width - 1) - 1);
      const v = Math.abs(2 * y / (height - 1) - 1);
      const d = clamp(Math.hypot(Math.max(0, u - 0.82) / 0.18, v), 0, 1);
      const alpha = (1 - d * d) ** 3;
      data.set([white, white, white, Math.round(255 * alpha)], 4 * (y * width + x));
    }
  }
  const map = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({
    color: PALETA.tinta, map, transparent: true, opacity: 0.19, depthWrite: false, toneMapped: false,
    side: THREE.DoubleSide,
  }));
}

function makeAnnotation(scene, count, { small = false, twoLines = false, blue = false } = {}) {
  const element = document.createElement('div');
  element.className = `etiqueta-3d etiqueta-cascada${small ? ' etiqueta-cascada--ronda' : ''}`;
  Object.assign(element.style, {
    font: 'inherit',
    fontSize: small ? 'calc(20px * var(--cascada-label-scale))' : 'calc(24px * var(--cascada-label-scale))',
    fontWeight: small ? '550' : '600',
    lineHeight: '1.2',
    color: css(small ? PALETA.tenue : PALETA.tinta),
    whiteSpace: twoLines ? 'pre' : 'nowrap',
    textAlign: 'center',
  });
  // Los números de ronda van sin píldora, aunque la hoja de estilos de la
  // presentación le ponga una a toda .etiqueta-3d.
  Object.assign(element.style, small ? {
    padding: '0', background: 'none', borderRadius: '0', boxShadow: 'none',
  } : {
    padding: 'calc(9px * var(--cascada-label-scale)) calc(16px * var(--cascada-label-scale))',
    background: css(PALETA.superficie),
    borderRadius: '22px',
    boxShadow: `0 4px 16px ${css(PALETA.tinta)}18, 0 1px 3px ${css(PALETA.tinta)}10`,
  });
  if (twoLines) {
    element.style.boxSizing = 'border-box';
    element.style.width = `calc(${FOCUS_LABEL.width}px * var(--cascada-label-scale))`;
  }

  const label = new CSS2DObject(element);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(count * 6), 3);
  geometry.setAttribute('position', position.setUsage(THREE.DynamicDrawUsage));
  const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: blue ? PALETA.acento : PALETA.tenue,
    transparent: true, depthWrite: false, toneMapped: false,
  }));
  line.frustumCulled = false;
  const group = new THREE.Group();
  group.visible = false;
  group.add(label, line);
  scene.add(group);

  return { group, label, line };
}

function placeAnnotation({ group, label, line }, opacity, anchor, ...segments) {
  group.visible = opacity > 0;
  if (!group.visible) return;
  label.position.fromArray(anchor);
  label.element.style.opacity = opacity;
  line.material.opacity = opacity * 0.8;
  const position = line.geometry.getAttribute('position');
  segments.forEach(([x, y, z], i) => position.setXYZ(i, x, y, z));
  position.needsUpdate = true;
}

function placeDimension(annotation, opacity, left, right, y, z, anchor) {
  const tick = 0.072;
  placeAnnotation(annotation, opacity, anchor,
    [left, y, z], [right, y, z],
    [left, y - tick, z], [left, y + tick, z],
    [right, y - tick, z], [right, y + tick, z],
    [(left + right) / 2, y, z], anchor,
  );
}

function annotationOpacity(weight) {
  return clamp((weight - 0.73) / 0.27, 0, 1);
}

export function mount(container, options = {}) {
  const isStatic = options.static === true;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(25, 1, 0.45, 80);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearAlpha(0);

  const viewport = document.createElement('div');
  Object.assign(viewport.style, { position: 'absolute', inset: '0', overflow: 'hidden' });
  const overlay = new CSS2DRenderer();
  Object.assign(overlay.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  viewport.append(renderer.domElement, overlay.domElement);

  const note = document.createElement('div');
  Object.assign(note.style, {
    position: 'absolute', right: '3%', bottom: '3%', font: 'inherit',
    fontSize: 'calc(16px * var(--cascada-label-scale))', color: css(PALETA.tenue),
    pointerEvents: 'none',
  });
  viewport.append(note);

  const originalPosition = container.style.position;
  const originalRole = container.getAttribute('role');
  const originalLabel = container.getAttribute('aria-label');
  const positionChanged = getComputedStyle(container).position === 'static';
  if (positionChanged) container.style.position = 'relative';
  container.setAttribute('role', 'img');
  container.setAttribute('aria-label', 'Traza de consumo del cifrado AES-128 y sus diez rondas.');
  delete container.dataset.ready;
  container.append(viewport);

  const studio = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const reflections = pmrem.fromScene(studio, 0.04, 0.1, 100, { size: 128 });
  studio.dispose();
  pmrem.dispose();
  scene.environment = reflections.texture;
  const keyLight = new THREE.DirectionalLight(PALETA.superficie, 2);
  keyLight.position.set(-3, 7, 6);
  scene.add(keyLight);

  const paperGeometry = new THREE.BoxGeometry(1, HEIGHT, THICKNESS).translate(0.5, 0, 0);
  paperGeometry.clearGroups();
  paperGeometry.addGroup(0, 24, 0);
  paperGeometry.addGroup(24, 12, 1);
  // La cara impresa conserva su blanco y los cantos reciben la luz de estudio.
  const paperMaterials = [
    new THREE.MeshStandardMaterial({ color: PALETA.superficie, roughness: 0.83, envMapIntensity: 0.68 }),
    new THREE.MeshBasicMaterial({ color: PALETA.superficie, toneMapped: false }),
  ];
  const styles = {
    intro: makeTraceStyle(), first: makeTraceStyle(), leak: makeTraceStyle(), rear: makeTraceStyle(),
  };
  const shadow = makeShadow();
  scene.add(shadow);

  const complete = makeAnnotation(scene, 4);
  const period = makeAnnotation(scene, 4);
  const stack = makeAnnotation(scene, 1);
  const focus = makeAnnotation(scene, 1, { twoLines: true, blue: true });
  const flatLabels = Array.from({ length: 11 }, () => makeAnnotation(scene, 1, { small: true }));
  const frontLabel = makeAnnotation(scene, 1, { small: true });
  const backLabel = makeAnnotation(scene, 1, { small: true });
  stack.label.element.textContent = '10 rondas casi iguales';
  focus.label.element.textContent = 'ronda 1: aquí se mezcla la clave\ny aquí miramos';
  frontLabel.label.element.textContent = 'Ronda 1';
  backLabel.label.element.textContent = 'Ronda 10';
  // Alineadas por la derecha con su ancla, a la izquierda de su tarjeta.
  frontLabel.label.center.set(1, 0.5);
  backLabel.label.center.set(1, 0.5);

  const target = new THREE.Vector3();
  const orbit = new THREE.Spherical();
  const matrix = new THREE.Matrix4();
  const paperColor = new THREE.Color();
  const focusAnchor = new THREE.Vector3();
  let width = 0;
  let height = 0;
  let data;
  let paper;
  let cards = [];
  let currentStep = stepNumber(options.step, isStatic ? STEPS - 1 : 0);
  let weights = weightsFor(currentStep);
  let fold = Number(currentStep >= 2);
  let labelScale = 1;
  let transition;
  let running = false;
  let entering = false;
  let disposed = false;
  let frame = null;

  function applyCards(tint, highlight) {
    const introOpacity = 1 - smoothstep(fold, 0.025, FOLD.introEnd);
    const roundTime = FOLD.duration - (cards.length - 2) * FOLD.stagger;
    const rise = STACK.rise * (1 + FOLD.clearance * smoothstep(fold, 0.24, 0.46) *
      (1 - smoothstep(fold, 0.62, 0.87)));
    let y = 0;
    let z = 0;
    for (const card of cards) {
      const { round, group } = card;
      const intro = round === 0;
      const index = intro ? cards.length - 1 : round - 1;
      const delay = (round - 1) * FOLD.stagger;
      const progress = intro ? 0 : clamp((fold * FOLD.duration - delay) / roundTime, 0, 1);
      // Cada tarjeta gana altura respecto a la anterior antes de crecer a lo ancho.
      const lift = easeInOutCubic(clamp(progress / FOLD.liftEnd, 0, 1));
      const gather = easeInOutCubic(clamp((progress - FOLD.gatherStart) / (1 - FOLD.gatherStart), 0, 1));
      y += (round === 1 ? STACK.y : rise) * lift;
      if (round > 1) z -= STACK.depth * lift;
      const x = lerp(card.x, STACK.x, gather);
      const cardWidth = card.width * lerp(1, STACK.width, gather);
      const cardHeight = lerp(1, STACK.height, lift);
      const thickness = lerp(FLAT_THICKNESS, 1, gather);
      group.position.set(x, y, z);
      group.scale.set(cardWidth, cardHeight, 1);
      group.visible = !intro || introOpacity > 0;
      matrix.makeScale(cardWidth, cardHeight, thickness).setPosition(x, y, z + FACE * (1 - thickness));
      paper.setMatrixAt(index, matrix);
      paperColor.copy(tone.paper);
      if (round % 2) paperColor.lerp(alternate, tint);
      if (intro) paperColor.lerp(tone.background, 1 - introOpacity);
      if (round > 1) paperColor.lerp(tone.background, highlight * 0.64);
      paper.setColorAt(index, paperColor);
    }
    paper.count = cards.length - Number(introOpacity === 0);
    paper.instanceMatrix.needsUpdate = true;
    paper.instanceColor.needsUpdate = true;

    styles.intro.band.opacity = 0.14 * introOpacity;
    styles.intro.crest.color.copy(tone.ink).lerp(tone.background, 1 - introOpacity);
    styles.rear.band.opacity = lerp(0.14, 0.055, highlight);
    styles.rear.crest.color.copy(tone.ink).lerp(tone.background, 0.59 * highlight);
    styles.leak.band.opacity = lerp(0.14, 0.16, highlight);
    styles.leak.band.color.copy(tone.ink).lerp(tone.blue, highlight);
    styles.leak.crest.color.copy(tone.ink).lerp(tone.blue, highlight);
  }

  function placeFocus(opacity) {
    if (!opacity) {
      focus.group.visible = false;
      return;
    }
    const { position, scale } = cards[1].group;
    const { from, to } = data.rounds[0];
    const middle = (data.fuga[0] + data.fuga[1]) / 2;
    const edge = [
      position.x + scale.x * (middle - from) / (to - from),
      position.y - scale.y * HEIGHT / 2,
      position.z + FACE + 0.003,
    ];
    focusAnchor.fromArray(edge).project(camera);

    // Separa la píldora del borde en pantalla, incluso al cambiar el tamaño.
    const padX = width * FOCUS_LABEL.margin + FOCUS_LABEL.width * labelScale / 2;
    const halfHeight = FOCUS_LABEL.height * labelScale / 2;
    const padBottom = Math.max(height * FOCUS_LABEL.margin, height * 0.03 + 28 * labelScale);
    const x = clamp((focusAnchor.x + 1) * width / 2, padX, width - padX);
    const y = Math.min((1 - focusAnchor.y) * height / 2 + FOCUS_LABEL.gap * labelScale + halfHeight,
      height - padBottom - halfHeight);
    focusAnchor.set(2 * x / width - 1, 1 - 2 * y / height, focusAnchor.z).unproject(camera);
    const anchor = focusAnchor.toArray();
    placeAnnotation(focus, opacity, anchor, edge, anchor);
  }

  function applyAnnotations() {
    const flatVisibility = 1 - smoothstep(fold, 0.015, 0.15);
    const stackVisibility = smoothstep(fold, 0.86, 0.995);
    const wComplete = annotationOpacity(weights[0]) * flatVisibility;
    const wPeriod = annotationOpacity(weights[1]) * flatVisibility;
    const wStack = annotationOpacity(weights[2]) * stackVisibility;
    const wFocus = annotationOpacity(weights[3]) * stackVisibility;
    const cardTop = HEIGHT / 2;
    const fullY = cardTop + 0.44;
    placeDimension(complete, wComplete, -WIDTH / 2, WIDTH / 2, fullY, FACE, [0, fullY + 0.37, FACE]);

    const second = cards[2];
    const periodY = cardTop + 0.68;
    placeDimension(period, wPeriod, second.x, second.x + second.width, periodY, FACE,
      [second.x + second.width / 2, periodY + 0.36, FACE]);
    flatLabels.forEach((annotation, i) => {
      const x = cards[i].x + cards[i].width / 2;
      const anchor = [x, cardTop + 0.25, FACE];
      placeAnnotation(annotation, wPeriod, anchor, [x, cardTop, FACE], anchor);
    });

    const rear = cards.at(-1).group;
    const front = cards[1].group.position;
    const rearZ = rear.position.z + FACE;
    const rearTop = rear.position.y + rear.scale.y * HEIGHT / 2;
    const titleX = rear.position.x + rear.scale.x / 2;
    const titleAnchor = [titleX, rearTop + 0.54, rearZ];
    placeAnnotation(stack, wStack, titleAnchor, [titleX, rearTop, rearZ], titleAnchor);

    const frontZ = front.z + FACE;
    const firstAnchor = [front.x - 0.27, front.y - 0.37, frontZ];
    const lastAnchor = [rear.position.x - 0.27, rear.position.y + 0.09, rearZ];
    const edgeLabels = Math.max(wStack, wFocus);
    placeAnnotation(frontLabel, edgeLabels, firstAnchor, [front.x, firstAnchor[1], frontZ], firstAnchor);
    placeAnnotation(backLabel, edgeLabels, lastAnchor, [rear.position.x, lastAnchor[1], rearZ], lastAnchor);
    placeFocus(wFocus);
  }

  function draw() {
    if (!data || !width || !height || disposed) return;
    const [, tint, waterfall, highlight] = weights;
    const spread = waterfall + highlight;
    const { sheet, stack: stackView, focus: focusView } = VIEWS;
    const aspect = width / height;
    // La cámara acompaña las últimas tarjetas mientras todavía se abren a la derecha.
    const pan = FOLD.pan * smoothstep(fold, 0.31, 0.62) * (1 - smoothstep(fold, 0.62, 0.84));
    target.set(
      sheet.x * (1 - spread) + stackView.x * waterfall + focusView.x * highlight + pan,
      sheet.y * (1 - spread) + stackView.y * waterfall + focusView.y * highlight,
      sheet.z * (1 - spread) + stackView.z * waterfall + focusView.z * highlight,
    );
    orbit.set(sheet.distance * (1 - spread) + stackView.distance * waterfall + focusView.distance * highlight,
      degToRad(90 - 15 * spread), degToRad(29 * spread));
    camera.aspect = aspect;
    // Más estrecho que 16:9: se aleja para que quepa el ancho. Más ancho: se
    // acerca hasta llenar el ancho como a 16:9, si la altura de la vista lo deja.
    const room = sheet.room * (1 - spread) + stackView.room * waterfall + focusView.room * highlight;
    camera.zoom = Math.min(aspect / (16 / 9), room);
    camera.updateProjectionMatrix();
    camera.position.setFromSpherical(orbit).add(target);
    camera.lookAt(target);
    camera.rotateZ(degToRad(-5.5 * spread));
    camera.updateMatrixWorld();

    applyCards(tint, highlight);
    shadow.rotation.x = -Math.PI * spread / 2;
    shadow.position.set(0.25 * spread, lerp(-0.12, -0.79, spread), lerp(-0.11, -0.46, spread));
    shadow.scale.set(lerp(17.8, 10.7, spread), lerp(3.34, 2.46, spread), 1);
    shadow.material.opacity = 0.19 * (1 - smoothstep(fold, 0.025, 0.31)) + 0.14 * smoothstep(fold, 0.72, 0.98);
    applyAnnotations();

    renderer.render(scene, camera);
    overlay.render(scene, camera);
    if (container.dataset.ready !== '1') container.dataset.ready = '1';
  }

  function resize() {
    if (disposed) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === width && h === height) return;
    width = w;
    height = h;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    overlay.setSize(width, height);
    labelScale = Math.min(1, width / 1400, height / 560);
    viewport.style.setProperty('--cascada-label-scale', String(labelScale));
    draw();
  }

  function clearCards() {
    if (paper) {
      paper.removeFromParent();
      paper.dispose();
    }
    for (const { group } of cards) {
      group.removeFromParent();
      for (const mesh of group.children) mesh.geometry.dispose();
    }
  }

  function update(spa) {
    if (disposed) return;
    clearCards();
    data = spa;
    cards = [{ round: 0, from: 0, to: spa.rounds[0].from }, ...spa.rounds]
      .map((span) => makeCard(spa, span, styles));
    paper = new THREE.InstancedMesh(paperGeometry, paperMaterials, cards.length);
    paper.frustumCulled = false;
    paper.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(paper, ...cards.map(({ group }) => group));

    complete.label.element.textContent = `El cifrado completo: ${formatCount(spa.end)} ciclos`;
    period.label.element.textContent = `una ronda cada ${formatCount(spa.period)} ciclos`;
    flatLabels.forEach(({ label }, i) => { label.element.textContent = i ? String(cards[i].round) : 'inicio'; });
    note.textContent = `Medida real · media de ${formatCount(spa.traces)} trazas`;
    container.setAttribute('aria-label',
      `Traza de consumo de AES-128, media de ${formatCount(spa.traces)} trazas. ` +
      `${formatCount(spa.end)} ciclos, diez rondas y la zona de la primera ronda donde más fuga.`);
    draw();
  }

  function advance(now) {
    if (!transition) return;
    transition.elapsed += Math.max(0, now - transition.last);
    transition.last = now;
    const progress = Math.min(1, transition.elapsed / transition.duration);
    const eased = transition.cubic ? easeInOutCubic(progress) : 1 - (1 - progress) ** 5;
    weights = transition.from.map((value, i) => lerp(value, transition.to[i], eased));
    fold = lerp(transition.fromFold, transition.toFold, transition.cubic ? progress : eased);
    if (progress === 1) transition = undefined;
  }

  function schedule() {
    if (!running || !transition || frame !== null) return;
    frame = requestAnimationFrame((now) => {
      frame = null;
      advance(now);
      draw();
      schedule();
    });
  }

  function start() {
    if (disposed || isStatic || running) return;
    running = true;
    // El step() que llega con start() (al entrar en la diapositiva, también
    // hacia atrás) salta sin animar; los siguientes ya animan.
    entering = true;
    queueMicrotask(() => { entering = false; });
    if (transition) transition.last = performance.now();
    schedule();
  }

  function cancelFrame() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  function stop() {
    running = false;
    cancelFrame();
  }

  function step(n) {
    n = stepNumber(n, currentStep);
    if (disposed || n === currentStep) return;
    const previous = currentStep;
    currentStep = n;
    const to = weightsFor(n);
    const toFold = Number(n >= 2);
    if (!data || isStatic || motion.matches || !running || entering) {
      transition = undefined;
      cancelFrame();
      weights = to;
      fold = toFold;
      draw();
      return;
    }

    const now = performance.now();
    advance(now);
    const cubic = (previous === 1 && n === 2) || (previous === 2 && n === 1);
    const duration = cubic ? FOLD.duration : n === 2 || (previous >= 2 && n < 2) ? 1200 : 780;
    transition = { from: weights, to, fromFold: fold, toFold, cubic, elapsed: 0, last: now, duration };
    schedule();
  }

  function onMotionChange() {
    if (!motion.matches || !transition) return;
    transition = undefined;
    cancelFrame();
    weights = weightsFor(currentStep);
    fold = Number(currentStep >= 2);
    draw();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  if (!isStatic) motion.addEventListener('change', onMotionChange);
  resize();

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    observer.disconnect();
    if (!isStatic) motion.removeEventListener('change', onMotionChange);
    clearCards();
    for (const { group, line } of [complete, period, stack, focus, ...flatLabels, frontLabel, backLabel]) {
      group.clear();
      line.geometry.dispose();
      line.material.dispose();
    }
    paperGeometry.dispose();
    for (const material of paperMaterials) material.dispose();
    for (const { band, crest } of Object.values(styles)) {
      band.dispose();
      crest.dispose();
    }
    shadow.geometry.dispose();
    shadow.material.map.dispose();
    shadow.material.dispose();
    reflections.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    viewport.remove();
    if (positionChanged) container.style.position = originalPosition;
    if (originalRole === null) container.removeAttribute('role');
    else container.setAttribute('role', originalRole);
    if (originalLabel === null) container.removeAttribute('aria-label');
    else container.setAttribute('aria-label', originalLabel);
    delete container.dataset.ready;
  }

  return { steps: STEPS, start, stop, step, update, dispose };
}
