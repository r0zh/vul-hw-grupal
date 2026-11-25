// Escena «mesa»: la mesa de laboratorio que haría lo mismo que el ChipWhisperer-Nano, en 3D y a escala (mm).
// Un chip en una placa de pruebas, una resistencia en su alimentación con la sonda de un osciloscopio encima, el
// cable de disparo, el portátil y, delante, la CW1101 de escenas/placa.js: toda la mesa en una placa.
// Es un montaje equivalente, no el nuestro: lo dice la nota de la escena.
//
// mount(container, { static, step, ventana }) → { steps: 8, start, stop, step(n), update(datos), dispose }
//   Pasos 0 a 2, la historia, a todo el contenedor y con rótulos:
//     0  el chip en su placa de pruebas, de cerca; lo demás queda en la niebla
//     1  la mesa entera: sale la resistencia, se pincha la sonda, crecen los cables y la pantalla dibuja una traza
//     2  la CW1101 delante, con la mesa desvaída detrás
//   Pasos 3 a 7, el recuadro que acompaña al vídeo V2, sin rótulos: la cámara enfoca lo que equivale a cada
//   pieza de la placa (3 el chip, 4 la resistencia y la sonda, 5 la pantalla del osciloscopio con un punto por
//   muestra, 6 el osciloscopio y el portátil, 7 el cable de disparo).
//   options.ventana  [ancho, alto] en fracción del contenedor: la parte central en la que se componen los pasos
//                    3 a 7 (la diapositiva encoge la escena y enseña solo esa ventana). Por defecto, [1, 1].
//   update(datos)    lo que sale en las pantallas, medido con el Nano (js/figuras/mesa.js lo carga):
//                    { muestras, cifrado, trazas }: los códigos del ADC del principio de una traza, la traza media
//                    del cifrado entero y unas cuantas trazas para la lista del portátil. Con null, se quedan vacías.
//   Los textos de los rótulos salen de los <template data-etiqueta="id"> del contenedor y, si no hay, de TEXTOS.
//   data-ready="1" llega con el primer dibujo tras update().
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildBoardModel } from './placa.js';
import { PALETA, css } from '../paleta.js';

const STEPS = 8;
const INSET = 3;          // primer paso del recuadro
const FOV = 24;
const FLIGHT = 0.9;       // segundos de un cambio de vista
const { clamp, lerp, degToRad } = THREE.MathUtils;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
const style = (color) => `#${color.getHexString()}`;
const part = (value, from, to) => clamp((value - from) / (to - from), 0, 1);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const back = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const stepIndex = (n) => clamp(Math.trunc(Number(n)) || 0, 0, STEPS - 1);

// Dónde va cada cosa sobre la mesa (x a la derecha, z hacia quien mira).
const PLACE = {
  bread: { x: -200, z: 88, yaw: 0.14 },
  scope: { x: -70, z: -60, yaw: 0 },
  laptop: { x: 290, z: -15, yaw: -0.3 },
  nano: { x: 80, z: 190, yaw: 0.5, y: 27, tilt: 0.72 },   // la CW1101 flota inclinada hacia quien mira
};

// La placa de pruebas, en sus ejes: 30 columnas a 2,54 mm, cinco filas a cada lado del canal y dos raíles.
const PITCH = 2.54, COLUMNS = 30, TOP = 8.5;
const col = (i) => -36.83 + PITCH * i;
const ROW = { a: -13.97, b: -11.43, c: -8.89, d: -6.35, e: -3.81, f: 3.81, g: 6.35, h: 8.89, i: 11.43, j: 13.97 };
const RAIL = { backMinus: -22.2, backPlus: -19.66, frontPlus: 19.66, frontMinus: 22.2 };
const CHIP = { first: 9, last: 22 };                                // columnas del chip, a caballo del canal
const SUPPLY = { x: col(15), from: RAIL.frontPlus, to: ROW.h };     // del raíl de + a la patilla de alimentación

// El osciloscopio, en sus ejes: el frontal mira a +z.
const SCOPE = { front: 59, screen: { x: -62, y: 84, w: 132, h: 99 }, bnc: { y: 28, ch1: 55, ch2: 88, ext: 121 } };
const LID_TILT = 0.36;    // la tapa del portátil, echada hacia atrás
const VEIL_Z = 136;       // el velo del paso 2: delante de toda la mesa y detrás de la CW1101
const VEIL = 0.62;        // y lo que tapa: la mesa se sigue reconociendo

// Vistas: adónde mira la cámara, qué tiene que caber (ancho y alto, en mm, a la altura del objetivo), desde dónde
// (acimut y elevación, en grados) y dónde empieza y acaba la niebla, en mm más allá del objetivo. El paso 2 no usa
// niebla: la mesa entera se desvae por igual tras un velo, y delante queda la CW1101.
const POSES = [
  { at: 'chip', fit: [180, 72], az: -14, el: 38, fog: [32, 68] },
  { at: v3(63, 84, 20), fit: [900, 356], az: -5, el: 17 },
  { at: v3(88, 62, 78), fit: [690, 274], az: -2, el: 17 },
  { at: 'chip', fit: [116, 62], az: 16, el: 36, fog: [38, 86] },
  { at: 'shunt', fit: [70, 40], az: 22, el: 32, fog: [45, 190] },
  { at: 'screen', fit: [226, 128], az: -10, el: 5 },
  { at: v3(128, 72, -30), fit: [720, 262], az: -4, el: 13 },
  { at: v3(-80, 30, 40), fit: [400, 180], az: -8, el: 30 },
];
const NO_FOG = [2500, 6000];
const CAMERA = ['x', 'y', 'z', 'dist', 'az', 'el', 'fogNear', 'fogFar'];
// Lo que enseña la pantalla del osciloscopio en cada paso.
const SCREENS = ['apagada', 'entera', 'entera', 'entera', 'entera', 'cerca', 'entera', 'entera'];

const TEXTOS = {
  chip: '<strong>El chip que cifra</strong>',
  resistencia: '<strong>Resistencia</strong>, con la sonda encima',
  osciloscopio: '<strong>Osciloscopio</strong>',
  disparo: '<strong>Cable de disparo</strong>: avisa de cuándo empieza',
  portatil: '<strong>Portátil</strong>: guarda las trazas',
  nano: '<strong>ChipWhisperer-Nano</strong>: todo eso, en esta placa',
  nota: 'Mesa de laboratorio equivalente (esquema). En las pantallas, trazas medidas con el ChipWhisperer-Nano.',
};
// Rótulos: en qué pasos salen, hacia dónde se apartan de su ancla (px) y por qué lado se enganchan.
const LABELS = [
  { id: 'chip', steps: [0], side: 'arriba', dx: 0, dy: -86 },
  { id: 'resistencia', steps: [1], side: 'arriba', dx: -157, dy: -163, width: 270 },
  { id: 'osciloscopio', steps: [1], side: 'arriba', dx: 0, dy: -40 },
  { id: 'disparo', steps: [1], side: 'abajo', dx: 90, dy: 56, width: 540 },
  { id: 'portatil', steps: [1], side: 'abajo', dx: 0, dy: 52 },
  { id: 'nano', steps: [2], side: 'derecha', dx: 150, dy: -20 },
];
const NOTED = [1, 2];     // pasos con la nota: los que enseñan las pantallas
const DESCRIPTIONS = [
  'Mesa de laboratorio en 3D: un chip en una placa de pruebas.',
  'Mesa de laboratorio equivalente: el chip en su placa de pruebas, una resistencia en su alimentación con la sonda de un osciloscopio encima, el cable de disparo y un portátil.',
  'Delante de la mesa de laboratorio, la placa ChipWhisperer-Nano, que hace lo mismo que toda la mesa.',
  'En la mesa de laboratorio: el chip en su placa de pruebas.',
  'En la mesa de laboratorio: una resistencia en la alimentación del chip, con la sonda del osciloscopio encima.',
  'En la mesa de laboratorio: la pantalla del osciloscopio, con un punto por cada muestra de una traza.',
  'En la mesa de laboratorio: el osciloscopio, que guarda la traza entera, y el portátil que la recibe.',
  'En la mesa de laboratorio: el cable de disparo, del chip al osciloscopio.',
];

// ── Utilidades de modelado ──
function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasTexture(source) {
  const map = new THREE.CanvasTexture(source);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

const alongZ = (geometry) => geometry.rotateX(Math.PI / 2);

// Un puente de hilo rígido entre dos agujeros: sale y entra en vertical.
function jumper(a, b, height, radius, material) {
  const lift = v3(0, height, 0);
  const curve = new THREE.CubicBezierCurve3(a, a.clone().add(lift), b.clone().add(lift), b);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 28, radius, 8), material);
}

// Un camino recto con las esquinas redondeadas (las patas dobladas de la resistencia).
function bentPath(points, bend) {
  const path = new THREE.CurvePath();
  let from = points[0];
  for (let i = 1; i < points.length; i++) {
    const corner = points[i], next = points[i + 1];
    if (!next) { path.add(new THREE.LineCurve3(from, corner)); break; }
    const a = corner.clone().add(from.clone().sub(corner).setLength(bend));
    const b = corner.clone().add(next.clone().sub(corner).setLength(bend));
    path.add(new THREE.LineCurve3(from, a), new THREE.QuadraticBezierCurve3(a, corner, b));
    from = b;
  }
  return path;
}

// Un cable tendido por unos puntos. Se puede enseñar a medias, desde su principio (grow).
function cable(points, radius, material, segments = 110) {
  const radial = 10;
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, radial), material);
  mesh.userData = { curve, segments, perSegment: radial * 6 };
  return mesh;
}

function grow(mesh, fraction) {
  const { segments, perSegment } = mesh.userData;
  mesh.visible = fraction > 0.002;
  mesh.geometry.setDrawRange(0, Math.round(clamp(fraction, 0, 1) * segments) * perSegment);
}

function makeMaterials() {
  const surface = (color, roughness, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const cableColor = mix(PALETA.tenue, PALETA.linea, 0.3);
  return {
    shell: surface(mix(PALETA.linea, PALETA.superficie, 0.12), 0.64),     // carcasas: osciloscopio y sonda
    bezel: surface(mix(PALETA.linea, PALETA.tenue, 0.28), 0.6),
    knob: surface(mix(PALETA.superficie, PALETA.linea, 0.75), 0.48),
    key: surface(mix(PALETA.linea, PALETA.tenue, 0.4), 0.6),
    print: surface(PALETA.tenue, 0.7),
    metal: surface(PALETA.linea, 0.32, 0.85),
    board: surface(PALETA.superficie, 0.8),
    dark: surface(mix(PALETA.tinta, PALETA.pcb, 0.36), 0.7, 0.04),
    rubber: surface(mix(PALETA.pcb, PALETA.tinta, 0.3), 0.87),
    pcb: surface(PALETA.pcb, 0.6, 0.05),
    cream: surface(mix(PALETA.oro, PALETA.serigrafia, 0.42), 0.58, 0.06),
    red: surface(mix(PALETA.mal, PALETA.serigrafia, 0.12), 0.55),
    pale: surface(mix(PALETA.superficie, PALETA.linea, 0.6), 0.6),
    alu: surface(mix(PALETA.linea, PALETA.superficie, 0.18), 0.38, 0.72),
    cable: surface(cableColor, 0.62),
    signal: surface(PALETA.acento, 0.5),                                  // la medida, en azul como en el vídeo
    triggerCable: surface(cableColor, 0.62),
    linkCable: surface(cableColor, 0.62),
    cableColor,
  };
}

// ── La placa de pruebas, con el chip, la resistencia, la sonda y el adaptador USB-serie ──
function breadboardTexture() {
  const S = 12, W = 80, D = 53;
  const canvas = makeCanvas(W * S, D * S), g = canvas.getContext('2d');
  const px = (x) => (x + W / 2) * S, pz = (z) => (z + D / 2) * S;
  g.fillStyle = css(PALETA.superficie);
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = style(mix(PALETA.superficie, PALETA.linea, 0.65));
  g.fillRect(0, pz(-1.25), canvas.width, 2.5 * S);                       // el canal central
  const line = (z, color) => { g.fillStyle = color; g.fillRect(px(-37.5), pz(z) - 0.3 * S, 75 * S, 0.6 * S); };
  const plus = style(mix(PALETA.mal, PALETA.superficie, 0.3)), minus = style(mix(PALETA.acento, PALETA.superficie, 0.4));
  line(17.9, plus); line(24, minus); line(-17.9, plus); line(-24, minus);
  g.fillStyle = style(mix(PALETA.linea, PALETA.tenue, 0.6));
  const hole = (x, z) => { g.beginPath(); g.roundRect(px(x) - 0.55 * S, pz(z) - 0.55 * S, 1.1 * S, 1.1 * S, 0.2 * S); g.fill(); };
  for (let i = 0; i < COLUMNS; i++) {
    for (const z of Object.values(ROW)) hole(col(i), z);
    if (i % 6 !== 5) for (const z of Object.values(RAIL)) hole(col(i), z);
  }
  return canvasTexture(canvas);
}

function buildBreadboard(mat) {
  const group = new THREE.Group();
  const put = (mesh, x, y, z, parent = group) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
  put(new THREE.Mesh(new RoundedBoxGeometry(82, TOP, 55, 3, 1.4), mat.board), 0, TOP / 2, 0);
  const face = put(new THREE.Mesh(new THREE.PlaneGeometry(80, 53),
    new THREE.MeshStandardMaterial({ map: breadboardTexture(), roughness: 0.84 })), 0, TOP + 0.04, 0);
  face.rotation.x = -Math.PI / 2;

  // El chip, de 28 patillas, a caballo del canal.
  const chipX = (col(CHIP.first) + col(CHIP.last)) / 2;
  put(new THREE.Mesh(new RoundedBoxGeometry(35.2, 3.4, 6.7, 2, 0.45), mat.dark), chipX, TOP + 2.9, 0);
  put(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 20), mat.print), col(CHIP.first) + 0.3, TOP + 4.6, 2.1);
  const pins = CHIP.last - CHIP.first + 1;
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 3.2, 0.32), mat.metal, pins * 2);
  const shoulders = new THREE.InstancedMesh(new THREE.BoxGeometry(1.25, 0.32, 0.75), mat.metal, pins * 2);
  const temp = new THREE.Object3D();
  for (let k = 0; k < pins * 2; k++) {
    const side = k < pins ? 1 : -1, x = col(CHIP.first + (k % pins));
    temp.position.set(x, TOP + 1.3, side * 3.81); temp.updateMatrix(); legs.setMatrixAt(k, temp.matrix);
    temp.position.set(x, TOP + 2.75, side * 3.5); temp.updateMatrix(); shoulders.setMatrixAt(k, temp.matrix);
  }
  group.add(legs, shoulders);

  // La alimentación del chip. En el paso 0 llega por un puente; después, por la resistencia, en el mismo sitio.
  const a = v3(SUPPLY.x, TOP, SUPPLY.from), b = v3(SUPPLY.x, TOP, SUPPLY.to);
  const middle = a.clone().lerp(b, 0.5).setY(TOP + 2.8);
  const bridge = jumper(a, b, 6.5, 0.55, mat.red);
  group.add(bridge);
  const shunt = new THREE.Group();
  shunt.position.copy(middle);
  const legPath = [a.clone().setY(TOP - 0.6), a.clone().setY(TOP + 2.8), b.clone().setY(TOP + 2.8), b.clone().setY(TOP - 0.6)];
  shunt.add(new THREE.Mesh(new THREE.TubeGeometry(bentPath(legPath.map((p) => p.sub(middle)), 0.9), 40, 0.3, 8), mat.metal));
  shunt.add(new THREE.Mesh(alongZ(new THREE.CapsuleGeometry(1.3, 4.2, 6, 16)), mat.cream));
  // Las franjas de una resistencia de 27 Ω, la del Nano: rojo, violeta, negro y oro (código de colores).
  for (const [z, color] of [[2.1, 0xc1272d], [1.05, 0x7d4fb8], [0, PALETA.tinta], [-1.9, PALETA.oro]]) {
    const band = new THREE.Mesh(alongZ(new THREE.CylinderGeometry(1.36, 1.36, 0.6, 16)), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    band.position.z = z;
    shunt.add(band);
  }
  group.add(shunt);

  // La sonda del osciloscopio, enganchada en la pata del lado del chip. Sale de su punta: crece desde ella.
  const probe = new THREE.Group();
  probe.position.set(SUPPLY.x, TOP + 2.8, SUPPLY.to + 1.1);
  probe.quaternion.setFromUnitVectors(v3(0, 1, 0), v3(-0.84, 0.46, -0.28).normalize());
  const turned = (top, bottom, height, y, material) =>
    put(new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 24), material), 0, y + height / 2, 0, probe);
  turned(0.5, 0.5, 5, 0, mat.metal);          // gancho
  turned(3, 1, 11, 4.5, mat.shell);           // punta
  turned(3.9, 3.9, 33, 15.5, mat.shell);      // cuerpo
  turned(4.15, 4.15, 3.6, 41, mat.signal);    // anillo del canal
  turned(1.8, 3.3, 9, 48.5, mat.rubber);      // salida del cable
  group.add(probe);

  // El adaptador USB-serie: por él llegan del portátil la alimentación y los mensajes.
  const adapter = new THREE.Group();
  adapter.position.set(66, 0, 2);
  put(new THREE.Mesh(new THREE.BoxGeometry(34, 1.6, 17), mat.pcb), 0, 1.4, 0, adapter);
  put(new THREE.Mesh(new RoundedBoxGeometry(9, 4.2, 8, 2, 0.8), mat.metal), 13.5, 4.3, 0, adapter);
  put(new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.1, 5.5), mat.dark), -1, 2.75, 0, adapter);
  put(new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 10.4), mat.dark), -15, 3.5, 0, adapter);
  group.add(adapter);
  const header = (k) => v3(51, 4.8, 2 + (k - 1.5) * PITCH);
  group.add(jumper(header(0), v3(col(27), TOP, RAIL.backMinus), 13, 0.5, mat.cable));          // masa
  group.add(jumper(header(1), v3(col(22), TOP, ROW.b), 10, 0.5, mat.pale));                    // datos
  group.add(jumper(header(2), v3(col(21), TOP, ROW.c), 9, 0.5, mat.pale));
  group.add(jumper(header(3), v3(col(27), TOP, RAIL.frontPlus), 13, 0.5, mat.red));            // alimentación
  group.add(jumper(v3(col(15), TOP, ROW.c), v3(col(14), TOP, RAIL.backMinus), 5.5, 0.5, mat.cable)); // masa del chip

  group.updateMatrixWorld(true);   // aún en el origen: los puntos de la sonda salen en los ejes de la placa
  return {
    group, bridge, shunt, probe,
    // puntos en los ejes de la placa de pruebas; mount() los pasa a los de la mesa
    points: {
      chip: v3(chipX, TOP + 4.6, 0),
      shunt: middle.clone(),
      probeRear: probe.localToWorld(v3(0, 57.5, 0)),
      probeLead: probe.localToWorld(v3(0, 74, 0)),
      trigger: v3(col(19), TOP, ROW.a),
      usb: v3(66 + 18, 4.3, 2),
      usbLead: v3(66 + 36, 2.4, 2),
    },
  };
}

// ── El osciloscopio ──
function panelTexture() {
  const S = 4, W = 276, H = 126;
  const canvas = makeCanvas(W * S, H * S), g = canvas.getContext('2d');
  const px = (x) => (x + W / 2) * S, py = (y) => (144 - y) * S;       // el panel va de y = 18 a y = 144
  g.fillStyle = style(mix(PALETA.superficie, PALETA.linea, 0.22));
  g.fillRect(0, 0, canvas.width, canvas.height);
  // Los tres grupos de mandos y, debajo, sus tomas.
  g.strokeStyle = style(mix(PALETA.linea, PALETA.tenue, 0.35));
  g.lineWidth = 0.5 * S;
  g.fillStyle = css(PALETA.tenue);
  g.font = `600 ${3.4 * S}px Inter, system-ui, sans-serif`;
  g.textAlign = 'center';
  for (const [x, name] of [[SCOPE.bnc.ch1, 'CANAL 1'], [SCOPE.bnc.ch2, 'CANAL 2'], [SCOPE.bnc.ext, 'DISPARO']]) {
    g.beginPath();
    g.roundRect(px(x - 15), py(126), 30 * S, 82 * S, 3 * S);
    g.stroke();
    g.fillText(name, px(x), py(130));
  }
  return canvasTexture(canvas);
}

function buildScope(mat, screenMap) {
  const group = new THREE.Group();
  const put = (mesh, x, y, z) => { mesh.position.set(x, y, z); group.add(mesh); return mesh; };
  const F = SCOPE.front;
  put(new THREE.Mesh(new RoundedBoxGeometry(300, 150, 118, 5, 11), mat.shell), 0, 81, 0);
  for (const x of [-120, 120]) for (const z of [-40, 40]) put(new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 20), mat.rubber), x, 3, z);
  put(new THREE.Mesh(new THREE.PlaneGeometry(276, 126), new THREE.MeshStandardMaterial({ map: panelTexture(), roughness: 0.74 })), 0, 81, F + 0.15);

  const { x: sx, y: sy, w, h } = SCOPE.screen;
  put(new THREE.Mesh(new RoundedBoxGeometry(w + 12, h + 12, 3, 2, 2.5), mat.bezel), sx, sy, F + 1.2);
  put(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: screenMap, toneMapped: false })), sx, sy, F + 2.8);
  for (const y of [120, 102, 84, 66, 48]) put(new THREE.Mesh(new RoundedBoxGeometry(9, 6.5, 3, 2, 1), mat.key), 19, y, F + 1.2);

  // Mandos: uno pequeño y uno grande por grupo, con una tecla entre los dos y la toma debajo.
  const knob = (x, y, radius, depth, turn) => {
    const body = put(new THREE.Mesh(alongZ(new THREE.CylinderGeometry(radius, radius * 1.05, depth, 28)), mat.knob), x, y, F + depth / 2);
    const pivot = new THREE.Group();
    pivot.rotation.z = turn;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.17, radius * 0.6, 0.5), mat.print);
    mark.position.set(0, radius * 0.5, depth / 2 + 0.2);
    pivot.add(mark);
    body.add(pivot);
  };
  [SCOPE.bnc.ch1, SCOPE.bnc.ch2, SCOPE.bnc.ext].forEach((x, k) => {
    knob(x, 112, 6.5, 9, [0.5, -0.9, 0.2][k]);
    put(new THREE.Mesh(new RoundedBoxGeometry(11, 5.5, 3, 2, 1), mat.key), x, 93, F + 1.2);
    knob(x, 68, 10.5, 11, [-0.7, 0.4, 1.1][k]);
    put(new THREE.Mesh(alongZ(new THREE.CylinderGeometry(7.6, 7.6, 2, 6)), mat.metal), x, SCOPE.bnc.y, F + 1);
    put(new THREE.Mesh(alongZ(new THREE.CylinderGeometry(5.6, 5.6, 9, 20)), mat.metal), x, SCOPE.bnc.y, F + 4.5);
  });
  put(new THREE.Mesh(new RoundedBoxGeometry(12, 7, 3, 2, 1.2), mat.key), -122, 26, F + 1.2);    // encendido

  // Los conectores de los dos cables, que se ven cuando el cable llega a su toma.
  const plug = (x) => {
    const one = new THREE.Group();
    one.position.set(x, SCOPE.bnc.y, F + 9);
    const shellPart = new THREE.Mesh(alongZ(new THREE.CylinderGeometry(6.4, 6.4, 13, 20)), mat.metal);
    shellPart.position.z = 6.5;
    const boot = new THREE.Mesh(alongZ(new THREE.CylinderGeometry(2.4, 4.2, 10, 20)), mat.rubber);
    boot.position.z = 18;
    one.add(shellPart, boot);
    group.add(one);
    return one;
  };
  return {
    group, plugs: { probe: plug(SCOPE.bnc.ch1), trigger: plug(SCOPE.bnc.ext) },
    points: {
      ch1: v3(SCOPE.bnc.ch1, SCOPE.bnc.y, F + 32), ext: v3(SCOPE.bnc.ext, SCOPE.bnc.y, F + 32),
      screen: v3(sx + 16, sy - 4, F), top: v3(0, 158, 0), side: v3(150, 34, -30),
    },
  };
}

// ── El portátil ──
function keyboardTexture(mat) {
  const S = 4, W = 296, H = 204;
  const canvas = makeCanvas(W * S, H * S), g = canvas.getContext('2d');
  g.fillStyle = style(mat.alu.color);
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = style(mix(PALETA.linea, PALETA.tenue, 0.3));
  // Cinco filas de teclas y, debajo, el panel táctil.
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k < 14; k++) {
      g.beginPath();
      g.roundRect((14 + k * 19.3) * S, (14 + row * 19) * S, 16.6 * S, 16.2 * S, 2.4 * S);
      g.fill();
    }
  }
  g.fillStyle = style(mix(PALETA.linea, PALETA.superficie, 0.15));
  g.beginPath();
  g.roundRect(96 * S, 122 * S, 104 * S, 68 * S, 5 * S);
  g.fill();
  return canvasTexture(canvas);
}

function buildLaptop(mat, displayMap) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new RoundedBoxGeometry(304, 11, 212, 4, 4.5), mat.alu);
  base.position.y = 5.5;
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(296, 204),
    new THREE.MeshStandardMaterial({ map: keyboardTexture(mat), roughness: 0.5, metalness: 0.35 }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 11.05;
  const hinge = new THREE.Group();
  hinge.position.set(0, 11, -103);
  hinge.rotation.x = -LID_TILT;
  const lid = new THREE.Mesh(new RoundedBoxGeometry(304, 206, 5, 4, 2.4), mat.alu);
  lid.position.y = 103;
  const display = new THREE.Mesh(new THREE.PlaneGeometry(288, 186), new THREE.MeshBasicMaterial({ map: displayMap, toneMapped: false }));
  display.position.set(0, 104, 2.56);
  hinge.add(lid, display);
  // Los dos conectores USB de su lado izquierdo.
  const ports = [v3(-152, 5.5, -48), v3(-152, 5.5, 8)];
  for (const p of ports) {
    const usb = new THREE.Mesh(new RoundedBoxGeometry(12, 5, 10, 2, 1), mat.rubber);
    usb.position.set(p.x - 6, p.y, p.z);
    group.add(usb);
  }
  group.add(base, deck, hinge);
  return {
    group,
    points: {
      // de cada conector, dónde acaba su cable y por dónde llega
      ports: ports.map((p) => ({ end: v3(p.x - 12, p.y, p.z), lead: v3(p.x - 40, 2.2, p.z) })),
      front: v3(0, 11, 104),
    },
  };
}

// ── Las pantallas, dibujadas con las trazas medidas ──
const INK = { screen: mix(PALETA.superficie, PALETA.fondo, 0.6), grid: mix(PALETA.linea, PALETA.superficie, 0.15) };

// La del osciloscopio: apagada, de cerca (una línea y un punto por muestra) o con el cifrado entero. `sweep`, de
// 0 a 1, es hasta dónde ha llegado el barrido.
function drawScope(canvas, mode, sweep, data) {
  const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height, pad = 34;
  g.fillStyle = style(mode === 'apagada' ? mix(PALETA.linea, PALETA.superficie, 0.45) : INK.screen);
  g.fillRect(0, 0, W, H);
  if (mode === 'apagada') return;
  // Retícula de 10 × 8 divisiones.
  g.strokeStyle = style(INK.grid);
  g.lineWidth = 2;
  g.setLineDash([3, 9]);
  g.beginPath();
  for (let i = 1; i < 10; i++) { g.moveTo((W * i) / 10, 0); g.lineTo((W * i) / 10, H); }
  for (let j = 1; j < 8; j++) { g.moveTo(0, (H * j) / 8); g.lineTo(W, (H * j) / 8); }
  g.stroke();
  g.setLineDash([]);
  const samples = mode === 'cerca' ? data?.muestras : data?.cifrado;
  if (!samples?.length) return;
  let lo = Infinity, hi = -Infinity;
  for (const v of samples) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const y = (v) => pad + (H - 2 * pad) * (1 - (v - lo) / (hi - lo || 1));
  const blue = css(PALETA.acento);
  g.lineJoin = g.lineCap = 'round';
  if (mode === 'cerca') {
    const x = (i) => pad + ((W - 2 * pad) * i) / (samples.length - 1);
    const shown = Math.round(sweep * samples.length);
    if (shown < 1) return;
    g.strokeStyle = blue;
    g.lineWidth = 5;
    g.beginPath();
    for (let i = 0; i < shown; i++) g[i ? 'lineTo' : 'moveTo'](x(i), y(samples[i]));
    g.stroke();
    for (let i = 0; i < shown; i++) {
      g.beginPath();
      g.arc(x(i), y(samples[i]), 10, 0, 2 * Math.PI);
      g.fillStyle = blue;
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = style(INK.screen);
      g.stroke();
    }
    return;
  }
  // Entera: en cada columna caben decenas de muestras, así que se dibuja lo que un osciloscopio con detección de
  // picos: el máximo y el mínimo de la columna y, entre los dos, relleno.
  const columns = 220, upper = [], lower = [];
  for (let c = 0; c < columns; c++) {
    const from = Math.floor((c * samples.length) / columns), to = Math.max(from + 1, Math.floor(((c + 1) * samples.length) / columns));
    let min = Infinity, max = -Infinity;
    for (let i = from; i < to; i++) { if (samples[i] < min) min = samples[i]; if (samples[i] > max) max = samples[i]; }
    const cx = pad + ((W - 2 * pad) * c) / (columns - 1);
    upper.push([cx, y(max)]);
    lower.push([cx, y(min)]);
  }
  g.save();
  g.beginPath();
  g.rect(0, 0, pad + (W - 2 * pad) * sweep + 3, H);
  g.clip();
  g.beginPath();
  upper.forEach(([cx, cy], i) => g[i ? 'lineTo' : 'moveTo'](cx, cy));
  lower.reverse().forEach(([cx, cy]) => g.lineTo(cx, cy));
  g.closePath();
  g.fillStyle = `${blue}38`;
  g.fill();
  g.strokeStyle = blue;
  g.lineWidth = 4;
  g.stroke();
  g.restore();
}

// La del portátil: una ventana con las trazas ya guardadas, una por fila.
function drawLaptop(canvas, data) {
  const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  g.fillStyle = css(PALETA.superficie);
  g.fillRect(0, 0, W, H);
  g.fillStyle = style(mix(PALETA.fondo, PALETA.linea, 0.4));
  g.fillRect(0, 0, W, 64);
  g.fillStyle = css(PALETA.linea);
  for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(40 + k * 34, 32, 10, 0, 2 * Math.PI); g.fill(); }
  const rows = data?.trazas ?? [], count = 8, top = 96, rowHeight = (H - top - 24) / count;
  for (let r = 0; r < count; r++) {
    const y0 = top + r * rowHeight;
    g.fillStyle = style(mix(PALETA.linea, PALETA.superficie, 0.35));
    g.beginPath();
    g.roundRect(48, y0 + rowHeight * 0.3, 150, rowHeight * 0.26, 8);
    g.fill();
    const trace = rows[r];
    if (!trace?.length) continue;
    let lo = Infinity, hi = -Infinity;
    for (const v of trace) { if (v < lo) lo = v; if (v > hi) hi = v; }
    g.strokeStyle = r === 0 ? css(PALETA.acento) : style(mix(PALETA.acento, PALETA.superficie, 0.45));
    g.lineWidth = 3;
    g.lineJoin = 'round';
    g.beginPath();
    trace.forEach((v, i) => {
      const x = 250 + ((W - 300) * i) / (trace.length - 1);
      const y = y0 + rowHeight * 0.14 + rowHeight * 0.66 * (1 - (v - lo) / (hi - lo || 1));
      g[i ? 'lineTo' : 'moveTo'](x, y);
    });
    g.stroke();
  }
}

// ── Rótulos en HTML, de 24 px fijos, con su línea hasta lo que nombran ──
function installStyle() {
  const id = 'estilo-escena-mesa';
  if (document.getElementById(id)) return;
  const sheet = document.createElement('style');
  sheet.id = id;
  sheet.textContent = `
    .mesa3d { position:absolute; inset:0; overflow:hidden; isolation:isolate; }
    .mesa3d > canvas { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .mesa3d-rotulos { position:absolute; inset:0; pointer-events:none; }
    .mesa3d-rotulos > svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
    .mesa3d-rotulos g, .mesa3d-rotulo, .mesa3d-nota { opacity:0; transition:opacity .18s; }
    .mesa3d-rotulos g.visible, .mesa3d-rotulo.visible, .mesa3d-nota.visible { opacity:1; transition-duration:.3s; }
    .mesa3d-rotulo { position:absolute; left:0; top:0; box-sizing:border-box; font:inherit; font-size:24px; line-height:1.28;
      letter-spacing:-.012em; font-weight:400; color:${css(PALETA.tinta)}; padding:12px 18px 13px; border-radius:12px;
      background:${css(PALETA.superficie)}; box-shadow:0 0 0 1px ${css(PALETA.tinta)}0d, 0 6px 22px -8px ${css(PALETA.tinta)}40;
      width:max-content; max-width:400px; text-wrap:balance; }
    .mesa3d-rotulo strong { font-weight:650; }
    .mesa3d-nota { position:absolute; left:calc(2.2% + 24px); top:calc(2.6% + 34px); max-width:300px; margin:0; font:inherit;
      font-size:16px; line-height:1.35; letter-spacing:0; color:${css(PALETA.tenue)}; }
  `;
  document.head.append(sheet);
}

const SIDES = {
  arriba: 'translate(-50%, -100%)', abajo: 'translate(-50%, 0)',
  izquierda: 'translate(-100%, -50%)', derecha: 'translate(0, -50%)',
};

function makeLabels(stage, text) {
  const ns = 'http://www.w3.org/2000/svg';
  const layer = document.createElement('div');
  layer.className = 'mesa3d-rotulos';
  const guides = document.createElementNS(ns, 'svg');
  guides.setAttribute('aria-hidden', 'true');
  layer.append(guides);
  const items = LABELS.map((spec) => {
    const card = document.createElement('div');
    card.className = 'etiqueta-3d mesa3d-rotulo';
    card.innerHTML = text(spec.id);
    card.style.transform = SIDES[spec.side];
    if (spec.width) card.style.maxWidth = `${spec.width}px`;
    const guide = document.createElementNS(ns, 'g');
    guide.innerHTML = `<line stroke="${css(PALETA.superficie)}" stroke-width="3.5" stroke-opacity=".9" stroke-linecap="round"/>`
      + `<line stroke="${css(PALETA.tenue)}" stroke-width="1.25"/>`
      + `<circle r="4" fill="${css(PALETA.superficie)}" stroke="${css(PALETA.tinta)}" stroke-width="1.5"/>`;
    guides.append(guide);
    layer.append(card);
    return { ...spec, card, guide };
  });
  const note = document.createElement('p');
  note.className = 'mesa3d-nota';
  note.innerHTML = text('nota');
  layer.append(note);
  stage.append(layer);
  const projected = new THREE.Vector3();
  let timer = 0;

  return {
    // Coloca cada rótulo junto a su ancla, que sigue a la cámara.
    place(camera, width, height, anchors) {
      for (const item of items) {
        projected.copy(anchors[item.id]).project(camera);
        const x = (projected.x * 0.5 + 0.5) * width, y = (0.5 - projected.y * 0.5) * height;
        const lx = x + item.dx, ly = y + item.dy;
        item.card.style.left = `${lx.toFixed(1)}px`;
        item.card.style.top = `${ly.toFixed(1)}px`;
        for (const line of item.guide.querySelectorAll('line')) {
          line.setAttribute('x1', x); line.setAttribute('y1', y); line.setAttribute('x2', lx); line.setAttribute('y2', ly);
        }
        const dot = item.guide.querySelector('circle');
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
      }
    },
    // Los del paso salen cuando la cámara ya casi ha llegado; los demás se van enseguida.
    show(step, delay) {
      clearTimeout(timer);
      const set = (only) => {
        for (const item of items) {
          const on = item.steps.includes(step);
          if (only && on) continue;
          item.card.classList.toggle('visible', on);
          item.guide.classList.toggle('visible', on);
        }
        if (!(only && NOTED.includes(step))) note.classList.toggle('visible', NOTED.includes(step));
      };
      if (delay > 0) { set(true); timer = setTimeout(set, delay); } else set(false);
    },
    dispose() { clearTimeout(timer); layer.remove(); },
  };
}

function releaseScene(scene) {
  const seen = new Set();
  scene.traverse((object) => {
    object.geometry?.dispose();
    for (const material of [object.material].flat().filter(Boolean)) {
      if (seen.has(material)) continue;
      seen.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}

export function mount(container, options = {}) {
  installStyle();
  const isStatic = options.static === true;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const inset = Array.isArray(options.ventana) ? options.ventana.map((f) => clamp(Number(f) || 1, 0.2, 1)) : [1, 1];
  const previous = { position: container.style.position, role: container.getAttribute('role'),
    label: container.getAttribute('aria-label'), ready: container.dataset.ready };
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.setAttribute('role', 'img');
  delete container.dataset.ready;

  const stage = document.createElement('div');
  stage.className = 'mesa3d';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, ...(isStatic ? { preserveDrawingBuffer: true } : {}) });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(PALETA.fondo, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.append(renderer.domElement);
  container.append(stage);

  const scene = new THREE.Scene();
  // La niebla tiene el color de la diapositiva: lo que queda lejos se desvanece en el fondo.
  scene.fog = new THREE.Fog(PALETA.fondo, 1e5, 2e5);
  scene.environmentIntensity = 0.83;
  const camera = new THREE.PerspectiveCamera(FOV, 2.5, 8, 4000);

  // ── La mesa ──
  const mat = makeMaterials(), accent = new THREE.Color(PALETA.acento);
  const scopeCanvas = makeCanvas(880, 660), laptopCanvas = makeCanvas(1152, 744);
  const scopeMap = canvasTexture(scopeCanvas), laptopMap = canvasTexture(laptopCanvas);
  const bread = buildBreadboard(mat), scope = buildScope(mat, scopeMap), laptop = buildLaptop(mat, laptopMap);
  const nano = new THREE.Group();
  const board = buildBoardModel();
  board.position.set(-15, 0.4, 30.55);   // centrada: en su modelo va de x = 0 a 30 y de z = −61,1 a 0
  nano.add(board);
  for (const [group, where] of [[bread.group, PLACE.bread], [scope.group, PLACE.scope], [laptop.group, PLACE.laptop], [nano, PLACE.nano]]) {
    group.position.set(where.x, where.y ?? 0, where.z);
    group.rotation.set(where.tilt ?? 0, where.yaw, 0);
    scene.add(group);
  }
  scene.updateMatrixWorld(true);
  const world = (group, point) => group.localToWorld(point.clone());
  const onTable = (x, z, y = 2) => v3(x, y, z);

  // Los cables entre aparatos, en los ejes de la mesa.
  const breadPoint = (name) => world(bread.group, bread.points[name]), scopePoint = (name) => world(scope.group, scope.points[name]);
  const probeRear = breadPoint('probeRear'), ch1 = scopePoint('ch1'), ext = scopePoint('ext'), side = scopePoint('side');
  const triggerHole = breadPoint('trigger');
  const [toScope, toBoard] = laptop.points.ports.map((port) => ({ end: world(laptop.group, port.end), lead: world(laptop.group, port.lead) }));
  const lane = scopePoint('ch1').z;    // delante del osciloscopio, a la altura de sus conectores
  const cables = {
    // la sonda: de su cola a la mesa, por detrás de la placa de pruebas, y al canal 1
    probe: cable([probeRear, breadPoint('probeLead'), v3(probeRear.x - 34, 30, probeRear.z - 18), onTable(probeRear.x - 38, probeRear.z - 42),
      onTable(probeRear.x - 14, lane - 6), onTable(PLACE.bread.x, lane - 2), onTable(ch1.x - 95, lane + 6), onTable(ch1.x - 45, lane + 8),
      v3(ch1.x - 15, 4, lane + 15), v3(ch1.x - 2, 16, lane + 13), ch1], 1.7, mat.signal),
    // el disparo: de una patilla del chip a la toma de disparo, por un carril más cerca de quien mira
    trigger: cable([triggerHole, triggerHole.clone().add(v3(1, 9, -2)), triggerHole.clone().add(v3(14, 7, -12)), onTable(triggerHole.x + 42, lane + 24, 1.6),
      onTable(ch1.x - 55, lane + 33, 1.6), onTable(ext.x - 40, lane + 33, 1.6), v3(ext.x - 4, 4, lane + 19), v3(ext.x - 1, 16, lane + 13), ext], 1.25, mat.triggerCable),
    // del osciloscopio al portátil, las trazas
    link: cable([side, side.clone().add(v3(12, -8, 2)), onTable(side.x + 22, side.z - 6), onTable(toScope.lead.x - 14, toScope.lead.z + 26),
      toScope.lead, toScope.end], 1.5, mat.linkCable, 70),
    // del portátil al adaptador, los mensajes y la alimentación, por detrás de donde va la CW1101
    messages: cable([breadPoint('usb'), breadPoint('usbLead'), onTable(ch1.x - 20, lane + 46), onTable(ext.x + 10, lane + 44),
      onTable(toBoard.lead.x - 18, toBoard.lead.z + 60), toBoard.lead, toBoard.end], 1.5, mat.cable),
  };
  scene.add(...Object.values(cables));

  // Sombras: un plano que solo las recibe, con el fondo de la diapositiva detrás.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.ShadowMaterial({ color: PALETA.tinta, opacity: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(6000, 3000), new THREE.MeshBasicMaterial({
    color: PALETA.fondo, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false,
  }));
  veil.position.set(0, 1400, VEIL_Z);
  scene.add(veil);
  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = object !== floor && !object.material.isMeshBasicMaterial;   // ni el suelo, ni las pantallas, ni el velo
    // Con sombras VSM, lo que las recibe también entra en el mapa: el velo daría sombra a toda la mesa.
    object.receiveShadow = object !== veil;
  });
  const key = new THREE.DirectionalLight(PALETA.superficie, 2.1);
  key.position.set(-260, 720, 400);
  key.target.position.set(90, 0, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 5;
  key.shadow.blurSamples = 14;
  key.shadow.bias = -0.0006;
  Object.assign(key.shadow.camera, { left: -560, right: 560, top: 440, bottom: -440, near: 200, far: 1700 });
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key, key.target);

  // Anclas de las vistas y de los rótulos.
  const anchors = {
    chip: world(bread.group, bread.points.chip),
    shunt: world(bread.group, bread.points.shunt),
    screen: world(scope.group, scope.points.screen),
    nano: world(nano, v3(0, 2, 0)),
  };
  const labelAnchors = {
    chip: anchors.chip, resistencia: anchors.shunt, osciloscopio: world(scope.group, scope.points.top),
    disparo: cables.trigger.userData.curve.getPoint(0.5), portatil: world(laptop.group, laptop.points.front), nano: anchors.nano,
  };
  const text = (id) => container.querySelector(`:scope > [data-etiqueta="${id}"]`)?.innerHTML ?? TEXTOS[id] ?? '';
  const labels = makeLabels(stage, text);

  // ── Estado: lo que se anima entre un paso y otro ──
  const state = {}, tweens = new Map();
  let current = stepIndex(options.step ?? (isStatic ? STEPS - 1 : 0));
  let width = 0, height = 0, environment = null, frameId = null, running = false, fresh = true, disposed = false;
  let data = null, updated = false, screenMode = SCREENS[current], drawnScreen = '';

  function go(name, to, duration = 0, delay = 0) {
    if (!(duration > 0) || state[name] === undefined) { tweens.delete(name); state[name] = to; return; }
    if (state[name] === to && !tweens.has(name)) return;
    tweens.set(name, { from: state[name], to, start: null, duration: duration * 1000, delay: delay * 1000 });
  }

  function advance(now) {
    for (const [name, tween] of tweens) {
      tween.start ??= now;
      const t = clamp((now - tween.start - tween.delay) / tween.duration, 0, 1);
      state[name] = lerp(tween.from, tween.to, ease(t));
      if (t === 1) tweens.delete(name);
    }
    return tweens.size > 0;
  }

  // Adónde tiene que llegar cada cosa en el paso n. La distancia sale de lo que tiene que caber: en el contenedor
  // entero o, en los pasos del recuadro, en su ventana central.
  function targets(n) {
    const pose = POSES[n], [fw, fh] = n >= INSET ? inset : [1, 1];
    const at = typeof pose.at === 'string' ? anchors[pose.at] : pose.at;
    const tan = Math.tan(degToRad(FOV / 2)), aspect = width / height || 2.5;
    const dist = Math.max(pose.fit[1] / (2 * tan * fh), pose.fit[0] / (2 * tan * aspect * fw));
    const [fogFrom, fogTo] = pose.fog ?? NO_FOG;
    return {
      x: at.x, y: at.y, z: at.z, dist, az: pose.az, el: pose.el, fogNear: dist + fogFrom, fogFar: dist + fogTo,
      measure: Number(n >= 1), trigger: Number(n >= 1), nano: Number(n === 2), veil: n === 2 ? VEIL : 0,
      tint: Number(n < 6), link: Number(n === 6), mark: Number(n === 7),
    };
  }

  function apply() {
    const el = degToRad(state.el), az = degToRad(state.az), flat = state.dist * Math.cos(el);
    camera.position.set(state.x + flat * Math.sin(az), state.y + state.dist * Math.sin(el), state.z + flat * Math.cos(az));
    camera.lookAt(state.x, state.y, state.z);
    scene.fog.near = state.fogNear;
    scene.fog.far = state.fogFar;
    // La medida: la resistencia ocupa el sitio del puente, sale la sonda y crece su cable hasta el canal 1.
    const swap = part(state.measure, 0, 0.3), out = part(state.measure, 0.12, 0.5), grown = part(state.measure, 0.35, 1);
    bread.bridge.visible = swap < 0.5;
    bread.shunt.visible = swap >= 0.5;
    bread.shunt.scale.setScalar(0.7 + 0.3 * back(part(swap, 0.5, 1)));
    bread.probe.visible = out > 0;
    bread.probe.scale.setScalar(Math.max(0.001, back(out)));
    grow(cables.probe, grown);
    scope.plugs.probe.visible = grown > 0.97;
    grow(cables.trigger, state.trigger);
    scope.plugs.trigger.visible = state.trigger > 0.97;
    veil.visible = state.veil > 0.003;
    veil.material.opacity = state.veil;
    nano.visible = state.nano > 0.01;
    nano.scale.setScalar(Math.max(0.001, back(state.nano)));
    // En azul, la medida; en los pasos 6 y 7, solo el cable del que se habla.
    mat.signal.color.lerpColors(mat.cableColor, accent, state.tint);
    mat.triggerCable.color.lerpColors(mat.cableColor, accent, state.mark);
    mat.linkCable.color.lerpColors(mat.cableColor, accent, state.link);
  }

  function drawScreens() {
    const wanted = `${screenMode}:${state.sweep.toFixed(3)}:${data ? 1 : 0}`;
    if (wanted === drawnScreen) return;
    drawnScreen = wanted;
    drawScope(scopeCanvas, screenMode, state.sweep, data);
    scopeMap.needsUpdate = true;
  }

  function draw() {
    if (!width || !height || disposed) return;
    if (!environment) {
      const generator = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
      environment = generator.fromScene(room, 0.035, 0.1, 100, { size: 128 });
      scene.environment = environment.texture;
      room.traverse((object) => { if (object.isInstancedMesh) object.dispose(); });
      room.dispose();
      generator.dispose();
    }
    apply();
    drawScreens();
    renderer.render(scene, camera);
    labels.place(camera, width, height, labelAnchors);
    if (updated) container.dataset.ready = '1';
  }

  function tick(now) {
    frameId = null;
    if (disposed) return;
    const more = advance(now);
    draw();
    if (more) schedule();
  }
  function schedule() {
    if (frameId === null && !disposed) frameId = requestAnimationFrame(tick);
  }

  function step(n) {
    if (disposed) return;
    const from = current;
    current = stepIndex(n);
    const snap = isStatic || motion.matches || fresh || !running || !width;
    fresh = false;
    const to = targets(current), time = (seconds) => (snap ? 0 : seconds);
    for (const name of CAMERA) go(name, to[name], time(FLIGHT));
    go('measure', to.measure, time(1), to.measure ? 0.15 : 0);
    go('trigger', to.trigger, time(0.8), to.trigger ? 0.55 : 0);
    go('veil', to.veil, time(0.6));
    go('nano', to.nano, time(0.5), to.nano ? 0.35 : 0);
    for (const name of ['tint', 'link', 'mark']) go(name, to[name], time(0.4));
    // Al cambiar lo que enseña la pantalla, vuelve a barrer; al salir del paso 0, cuando la cámara ya ha llegado.
    if (SCREENS[current] !== screenMode) {
      screenMode = SCREENS[current];
      go('sweep', 0);
      go('sweep', 1, time(1.1), from === 0 ? 0.9 : 0.4);
    }
    labels.show(current, time(FLIGHT * 750));
    container.setAttribute('aria-label', DESCRIPTIONS[current]);
    schedule();
  }

  function resize() {
    if (disposed) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (w === width && h === height) return;
    width = w;
    height = h;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // La vista depende de la forma del contenedor: se recoloca sin vuelo.
    const to = targets(current);
    for (const name of CAMERA) go(name, to[name]);
    schedule();
  }

  // Estado inicial, sin animación.
  const initial = targets(current);
  for (const [name, value] of Object.entries(initial)) state[name] = value;
  state.sweep = 1;
  labels.show(current, 0);
  container.setAttribute('aria-label', DESCRIPTIONS[current]);
  drawLaptop(laptopCanvas, null);
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  return {
    steps: STEPS,
    // Al entrar en la diapositiva, la escena se coloca en su paso sin vuelo.
    start() { if (!disposed && !isStatic) { running = true; fresh = true; } },
    stop() { running = false; },
    step,
    update(next) {
      if (disposed) return;
      data = next ?? null;
      updated = true;
      drawLaptop(laptopCanvas, data);
      laptopMap.needsUpdate = true;
      schedule();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      observer.disconnect();
      labels.dispose();
      scene.environment = null;
      environment?.dispose();
      releaseScene(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      stage.remove();
      container.style.position = previous.position;
      for (const [attr, value] of [['role', previous.role], ['aria-label', previous.label], ['data-ready', previous.ready]]) {
        if (value == null) container.removeAttribute(attr); else container.setAttribute(attr, value);
      }
    },
  };
}
