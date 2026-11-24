// Escena «placa»: la ChipWhisperer-Nano (CW1101) en 3D, con un recorrido guiado por sus piezas.
// mount(container, { static, step }) → { steps: 5, start, stop, step, dispose }; no recibe datos.
// buildBoardModel() → THREE.Group de la placa sola, sin renderer (para exportarla a GLB).
// Pasos: 0, vista de producto con giro lento; 1, capturador ATSAM4S16B y USB-C; 2, ADC1173;
// 3, víctima STM32F042F6P6; 4, camino esquemático de la medida (víctima → MEASURE → ADC).
// Cotas en mm tomadas de las fotos de la placa (arriba.jpg). El eje largo de la placa es −Z.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { PALETA, css } from '../paleta.js';

const W = 30, L = 61.1, H = 1.6;
const TAU = 2 * Math.PI;
const { clamp, lerp, degToRad } = THREE.MathUtils;
const point = (x, y, h = H) => new THREE.Vector3(x, h, -y);
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
const indexOfStep = n => clamp(Math.trunc(Number(n)) || 0, 0, 4);

function outline() {
  const s = new THREE.Shape();
  s.moveTo(1, 0);
  s.lineTo(29, 0); s.quadraticCurveTo(30, 0, 30, 1);
  s.lineTo(30, 46.8); s.quadraticCurveTo(30, 47.8, 29, 47.8);
  s.lineTo(28.25, 47.8); s.quadraticCurveTo(27.55, 47.8, 27.55, 48.5);
  s.lineTo(27.55, 60.1); s.quadraticCurveTo(27.55, L, 26.55, L);
  s.lineTo(3.45, L); s.quadraticCurveTo(2.45, L, 2.45, 60.1);
  s.lineTo(2.45, 48.5); s.quadraticCurveTo(2.45, 47.8, 1.75, 47.8);
  s.lineTo(1, 47.8); s.quadraticCurveTo(0, 47.8, 0, 46.8);
  s.lineTo(0, 1); s.quadraticCurveTo(0, 0, 1, 0);
  return s;
}

function drillTable() {
  const holes = [];
  function add(x, y, square = false, r = .5, rim = .85) {
    holes.push({ x, y, square, r, rim });
  }
  for (let i = 0; i < 10; i++) {
    add(2.27, 13 + i * 2.54);
    add(4.81, 13 + i * 2.54, i === 0);
  }
  for (let i = 0; i < 8; i++) add(6.45 + i * 2.54, 59);
  for (const x of [4.7, 20.5]) {
    for (let i = 0; i < 3; i++) add(x + i * 2.5, 40.5, i === 0);
  }
  for (let i = 0; i < 19; i++) add(3.75 + i * 1.25, 48, false, .3, .43);
  return holes;
}

// Filas de pasivos tomadas de la fotografía cenital.
function passiveLayout() {
  // x, y, eje largo en Y, tipo (0 = resistencia) y longitud.
  return [
    [7.6,56.4,1,0,1.55],[7.6,54.2,0,1],[7.6,52.5,0,0],[10.4,54.5,0,1],
    [25.0,55.9,1,0],[24.0,53.8,0,1,2],[26,50.2,1,0],
    [12.3,40.3,1,0],[15.55,40.7,1,0],[15.55,38.8,1,0],[17.5,38.6,1,1,1.9],
    [19.5,38.4,0,1],[19.3,36.9,0,0],[27.8,40.2,1,0],
    [28.0,38.3,0,0],[26.5,37.25,0,1],[27.3,35.6,0,1,1.9],[25.0,35.15,1,0],
    [24.9,33.15,0,0],[22,33.2,0,0],[24.65,31.7,0,1,1.9],[21.9,31.7,0,1],
    [24.55,30.2,0,0],[21.9,29.8,0,1],[24.4,28.4,0,1,2],[27,29.35,1,0],
    [21.9,27.2,1,1],[24.65,26.65,0,1],[22.15,24.1,1,0,2.5],[24.85,23.7,1,1,1.9],
    [15.2,25.9,1,0],[18.15,25.9,1,0],[7.4,31.6,1,0],[9.85,32.2,0,0],
    [6.65,27.7,1,0],[12.1,28.4,1,1],[7.1,24.1,1,0],[8.65,24.1,1,0],
    [22.45,20.9,0,1],[22,18.55,1,0],[23.65,18.3,1,1,1.9],[22.35,14.1,0,1],
    [27,20.9,1,0],[28.8,19.3,1,1],[8.6,15.7,1,0],[8.4,12.55,1,1,1.9],
    [10.1,11.3,1,0,2],[13.3,11.82,1,0],[15.65,10.9,1,0],
    [20.45,11.95,0,1,1.9],[23.45,12.1,0,1,1.9],[19.9,10.45,1,1],
    [21.45,10,1,1],[23.55,10.4,0,0],[27,10.4,1,0],[28.8,10.4,1,0],
    [13.65,9.0,1,0],[14.9,9.0,1,1],[17.8,8.0,0,0],[20.05,8.05,0,1],
    [23.3,7.8,1,0],[1.65,5.7,1,0],[5.3,10.35,0,1,1.9],[9.7,8.7,0,0,1.9],
    [11.4,5.15,1,1,2],[11.25,2.15,1,1,2],[23.65,1.65,0,0],
    [20.55,6.95,0,1],[16.15,6.95,0,0],[14.0,6.95,0,1],
  ];
}

function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function silkTexture(bottom, passives) {
  const canvas = document.createElement('canvas');
  canvas.width = W * 44; canvas.height = Math.ceil(L * 44);
  const g = canvas.getContext('2d');
  g.scale(canvas.width / W, canvas.height / L);
  const v = y => bottom ? y : L - y;
  const ink = css(PALETA.serigrafia);
  g.fillStyle = css(PALETA.pcb); g.fillRect(0, 0, W, L);
  g.lineJoin = 'round'; g.lineCap = 'round';

  function line(coords, width = .11) {
    g.lineWidth = width; g.beginPath();
    coords.forEach(([x,y], i) => i ? g.lineTo(x,v(y)) : g.moveTo(x,v(y)));
    g.stroke();
  }
  function rect(x, y, w, d, width = .115) {
    g.lineWidth = width; g.strokeRect(x - w / 2, v(y) - d / 2, w, d);
  }
  function text(value, x, y, size, angle = 0, weight = 550, maxWidth = 100) {
    g.save(); g.translate(x, v(y)); g.rotate(degToRad(angle));
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = weight + ' ' + size + 'px Arial, sans-serif';
    g.fillText(value, 0, 0, maxWidth); g.restore();
  }
  // Los haces de pistas apenas se distinguen bajo la máscara.
  g.strokeStyle = css(PALETA.linea); g.globalAlpha = .11;
  function trace(coords) {
    line(coords, .075);
    const [x,y] = coords[coords.length - 1];
    g.beginPath(); g.arc(x, v(y), .11, 0, TAU); g.stroke();
  }
  if (!bottom) {
    for (let i = 0; i < 16; i++) {
      const x = 11.45 + i * .5, y = 15.15 + i * .5;
      const spread = (i - 7.5) * .13, tail = (i % 4) * .39;
      trace([[x,24.2],[x,25.1 + tail],[x + spread,26.1 + tail],[x + spread,27.3 + tail]]);
      trace([[x,13.8],[x,12.8 - tail],[x + spread,11.7 - tail],[x + spread,10.5 - tail]]);
      trace([[20.4,y],[21.7 + tail,y],[22.8 + tail,y + spread],[24 + tail,y + spread]]);
      trace([[10,y],[9.5 - tail,y],[8.15 - tail,y + spread],[7.4 - tail,y + spread]]);
    }
    for (const [cx,cy,count] of [[16.6,32.1,12],[16.8,54.2,10]]) {
      for (let i = 0; i < count; i++) {
        const y = cy + (i - (count - 1) / 2) * .65;
        for (const side of [-1,1]) {
          const dx = (3.6 + (i % 3) * .45) * side, dy = (i - count / 2) * .26;
          trace([[cx + 2.5 * side,y],[cx + dx,y],[cx + dx + Math.abs(dy) * side,y + dy],
            [cx + dx + (1.0 + Math.abs(dy)) * side,y + dy]]);
        }
      }
    }
    for (let i = 0; i < 6; i++) {
      const x = 3 + i * 4.65;
      trace([[x,43],[x,46.7],[x + .75,47.45],[x + .75,49.4]]);
    }
  } else {
    for (let i = 0; i < 7; i++) {
      trace([[6 + i * 1.05,57.8],[6 + i * 1.05,40 - i],[11 + i * 1.05,35 - i],[11 + i * 1.05,22 - i * .4]]);
      trace([[9 + i,9],[9 + i,11 + i * .5],[13 + i,15 + i * .5],[13 + i,20 + i * .4]]);
    }
  }
  g.strokeStyle = ink; g.globalAlpha = .89;
  if (!bottom) {
    rect(15.34,59,20.45,2.68); text('J6',4.05,59,1.32,-90,700);
    rect(3.54,24.43,5.18,25.39); text('J3',2.72,10.78,1.28,180,700);
    for (const [x,name] of [[7.2,'GLITCH'],[23,'MEASURE']]) {
      rect(x,40.5,7.72,2.55); text(name,x,38.6,1.1,180,650);
    }
    for (const [x,y,w,d] of [[7,50.2,2.15,2.2],[22.9,50.2,2.15,2.2],
      [7.9,20.3,2.25,1.6],[17.5,10.3,2.88,2.33]]) rect(x,y,w,d);
    for (const [x,y] of [[4.5,55.7],[4.5,51.8],[27,33.6],[27,25.2],[24.5,4.3],[26.4,4.3]]) {
      rect(x,y,1.24,2.46);
      line([[x - .49,y - .98],[x + .49,y - .98]],.14);
    }
    text('TRIG',28.62,33.6,1.02,-90); text('ARM',28.62,25.2,1.02,-90);
    text('USB',23.28,4.3,.94,-90); text('ERROR',28.02,4.3,1.03,-90);
    text('nRST',7.26,17.75,1.04,-90); text('TP1',23.23,56.65,.62,180);
    text('TP2',23.54,57.46,.72,180);
    g.globalAlpha = .70;
    for (const [x,y,vertical,,length = 1.45] of passives) {
      const w = length * .49;
      rect(x,y,vertical ? w + .32 : length + .36,vertical ? length + .36 : w + .32,.09);
    }
    for (const [x,y] of [[9.95,24.25],[19.22,35.98],[19.51,57.43],[7.65,29.9]]) {
      g.fillStyle = ink; g.beginPath(); g.arc(x,v(y),.16,0,TAU); g.fill();
    }
  } else {
    text('ChipWhisperer Nano',8.18,24.6,2.42,-90,750,30);
    text('by NewAE Technology Inc.',10.72,26.0,1.65,-90,450,30);
    text('cwdocs.com/cwnano',13.12,33.7,1.50,-90,450,18.4);
    text('NAE-CW1101-05',20.22,29.5,1.60,-90,500,23);
    text('ChipWhisperer is a registered trademark of NewAE Technology Inc.',28.74,23, .92,-90,500,39);
    text('CE',20.3,11.8,3.7,-90,600,5.3);
    g.lineWidth = .15; g.beginPath(); g.arc(24.7,12.5,1.95,0,TAU); g.stroke();
    text('Pb',24.7,12.5,1.38,-90);
    line([[23.3,5.8],[23.6,7.8],[24.9,7.8],[25.12,5.8],[23.3,5.8]]);
    line([[23.1,5.55],[25.35,5.55]]); line([[22.8,5.15],[25.65,8.15]]);
    line([[22.8,8.15],[25.65,5.15]]);
    rect(6.7,5.65,7.0,6.4); text('1',4.8,11.1,1.27,-90);
    text('2',2.25,11.1,1.27,-90); text('20',2.25,37.7,1.27,-90);
    for (const [x,y,name] of jumpers) {
      rect(x,y,1.86,1.45); text(name,x - 1.2,y,.57,-90);
    }
    text('ERASE',14.7,11.63,1.0); text('Cut traces before snapping.',15,49.7,1.22,0,650,22.0);
    const names = ['+3v3','BOOT0','CLKIN','nRST','GPIO4','GPIO2','GPIO1','GND'];
    names.forEach((name,i) => text(name,6.45 + i * 2.54,55.12,1.16,-90,650));
  }
  return canvasTexture(canvas);
}

const jumpers = [[14.7,10,'SJ1'],[24.2,21.1,'SJ2'],[17.2,32.0,'SJ3'],
  [17.2,35.9,'SJ4'],[23.6,38.0,'SJ5'],[27.3,36.9,'SJ6']];

function boardFaces(group, tex, holes) {
  const shape = outline();
  for (const {x,y,r} of holes) {
    const path = new THREE.Path();
    path.absarc(x,y,r,0,TAU,true); shape.holes.push(path);
  }
  const top = new THREE.ShapeGeometry(shape,12);
  for (const bottom of [true,false]) {
    const geometry = bottom ? top.clone() : top;
    const pos = geometry.attributes.position, uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const v = pos.getY(i) / L;
      uv.setXY(i,pos.getX(i) / W,bottom ? 1 - v : v);
    }
    geometry.rotateX(-Math.PI / 2);
    if (bottom) {
      // Cara de abajo con la normal hacia −Y y el giro de los triángulos invertido, en vez de
      // BackSide: así se exporta bien a GLB, que no conoce BackSide.
      const index = geometry.index.array;
      for (let i = 0; i < index.length; i += 3) [index[i+1],index[i+2]] = [index[i+2],index[i+1]];
      geometry.scale(1,-1,1);
    }
    const mesh = new THREE.Mesh(geometry,new THREE.MeshPhysicalMaterial({
      map: tex[Number(bottom)], roughness: .68, metalness: .11, clearcoat: .18, clearcoatRoughness: .52,
    }));
    mesh.position.y = bottom ? 0 : H; group.add(mesh);
  }

  // El laminado asoma por el canto. Cada taladro lleva su propio barril metálico.
  const edge = outline().getPoints(10);
  const vertices = [], colors = [];
  const core = mix(PALETA.oro,PALETA.serigrafia,.46);
  const layer = mix(PALETA.oro,PALETA.tinta,.36);
  for (const [lo,hi,color] of [[0,.07,layer],[.07,.36,core],[.36,.4,layer],
    [.4,1.26,core],[1.26,1.30,layer],[1.30,1.54,core],[1.54,H,layer]]) {
    for (let i = 1; i < edge.length; i++) {
      const a = edge[i-1], b = edge[i];
      for (const [p,h] of [[a,lo],[b,lo],[a,hi],[b,lo],[b,hi],[a,hi]]) {
        vertices.push(p.x,h,-p.y); colors.push(color.r,color.g,color.b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  group.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.81})));
}

function roundedRect(path, x, y, w, h, r) {
  path.moveTo(x+r,y); path.lineTo(x+w-r,y); path.quadraticCurveTo(x+w,y,x+w,y+r);
  path.lineTo(x+w,y+h-r); path.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  path.lineTo(x+r,y+h); path.quadraticCurveTo(x,y+h,x,y+h-r);
  path.lineTo(x,y+r); path.quadraticCurveTo(x,y,x+r,y);
  return path;
}

function leadGeometry() {
  // Perfil de una pata de ala de gaviota, desde el encapsulado hasta la soldadura.
  const path = new THREE.Shape();
  path.moveTo(-.10,.70); path.lineTo(.24,.70); path.quadraticCurveTo(.47,.70,.52,.48);
  path.lineTo(.61,.22); path.quadraticCurveTo(.64,.15,.74,.15); path.lineTo(1,.15);
  path.lineTo(1,.04); path.lineTo(.70,.04); path.quadraticCurveTo(.54,.04,.49,.20);
  path.lineTo(.39,.48); path.quadraticCurveTo(.36,.58,.23,.58); path.lineTo(-.1,.58); path.closePath();
  return new THREE.ExtrudeGeometry(path,{depth:1,bevelEnabled:false,curveSegments:3}).translate(0,0,-.5);
}

// La placa sola, sin renderer ni luces: un THREE.Group en mm (1 unidad = 1 mm) con la cara de
// componentes hacia +Y, el eje largo hacia −Z y el origen en la esquina del borde del USB
// (X = 0, Y = 0 de las cotas; un punto (X, Y) de la cara de arriba está en (X, 1,6, −Y)).
// Materiales PBR estándar y texturas de canvas (necesita DOM), listos para GLTFExporter.
export function buildBoardModel() {
  const group = new THREE.Group();
  group.name = 'CW1101';
  const passive = passiveLayout(), holes = drillTable();
  boardFaces(group,[silkTexture(false,passive),silkTexture(true,passive)],holes);
  function surface(color,roughness,metalness = 0,side = THREE.FrontSide) {
    return new THREE.MeshStandardMaterial({color,roughness,metalness,side});
  }
  const gold = surface(PALETA.oro,.32,.77,THREE.DoubleSide);
  // El oro de la cara de abajo es más mate: la luz de relleno sube en vertical y, con la cámara casi en vertical por
  // debajo, su brillo dejaría los pads color crema.
  const goldBottom = surface(PALETA.oro,.7,.77,THREE.DoubleSide);
  const tin = surface(PALETA.linea,.35,.82);
  const steel = surface(PALETA.serigrafia,.275,.91);
  const dark = surface(mix(PALETA.tinta,PALETA.pcb,.36),.74,.04);
  const rubber = surface(mix(PALETA.pcb,PALETA.tinta,.3),.87);
  const cream = surface(mix(PALETA.oro,PALETA.serigrafia,.28),.58,.06);
  const ceramic = surface(mix(PALETA.oro,PALETA.tinta,.42),.62);
  const lens = new THREE.MeshPhysicalMaterial({
    color:mix(PALETA.oro,PALETA.superficie,.76),roughness:.19,metalness:.12,clearcoat:.8,
  });
  const unit = new THREE.BoxGeometry();
  const bevel = new RoundedBoxGeometry(1,1,1,1,.10);
  const disc = new THREE.CylinderGeometry(1,1,1,24);
  const lead = leadGeometry();
  const batches = new Map(), temp = new THREE.Object3D();
  function part(geo,mat,x,y,h,w=1,height=1,depth=1,angle=0) {
    const key = geo.uuid + mat.uuid;
    if (!batches.has(key)) batches.set(key,{geo,mat,transforms:[]});
    temp.position.set(x,h,-y); temp.scale.set(w,height,depth); temp.rotation.set(0,angle,0);
    temp.updateMatrix(); batches.get(key).transforms.push(temp.matrix.clone());
  }
  function box(mat,x,y,w,d,h,base=H,angle=0,geometry=bevel) {
    part(geometry,mat,x,y,base+h/2,w,h,d,angle);
  }
  const barrel = new THREE.CylinderGeometry(1,1,1,24,1,true);
  const rings = new Map();
  for (const {x,y,r,rim,square} of holes) {
    const key = [r,rim,square].join('/');
    if (!rings.has(key)) {
      let geo;
      if (square) {
        const s = roundedRect(new THREE.Shape(),-rim,-rim,2*rim,2*rim,.10);
        const hole = new THREE.Path(); hole.absarc(0,0,r,0,TAU,true); s.holes.push(hole);
        geo = new THREE.ShapeGeometry(s,12);
      } else {
        geo = new THREE.RingGeometry(r,rim,24);
      }
      rings.set(key,geo.rotateX(-Math.PI/2));
    }
    part(rings.get(key),gold,x,y,H+.012);
    part(rings.get(key),goldBottom,x,y,-.012);
    part(barrel,gold,x,y,H/2,r,H,r);
  }
  for (const x of [2.9,7.3,11.8,18.9,23.3,27.8]) box(gold,x,44.7,2.2,5,.044);
  for (const x of [4,12.4,19.1,27.7]) box(goldBottom,x,44.7,2.95,5,.045,-.045);
  for (let i=0;i<5;i++) for (const y of [3.8,7.5]) box(goldBottom,4.2+i*1.25,y,.60,1.8,.046,-.046);
  for (const x of [13.2,21.8]) for (const y of [1.3,5.8]) box(tin,x,y,.94,1.55,.13,-.13);
  const via = new THREE.RingGeometry(.11,.22,12).rotateX(-Math.PI/2);
  for (let i=0;i<4;i++) for (let j=0;j<3;j++) part(via,goldBottom,13+i*1.56,17+j*2.25+(i%2)*.65,-.014);
  for (const [x,y] of jumpers) {
    for (const sign of [-1,1]) box(goldBottom,x+sign*.42,y,.72,1.06,.045,-.045);
  }
  for (const x of [7.4,8.4]) box(gold,x,20.3,.9,1.1,.055);
  for (const x of [7,22.9]) box(tin,x,50.2,1.8,1.8,.15);
  for (const [x,y] of [[21.4,56.6],[22.4,55.6]]) part(disc,gold,x,y,H+.022,.5,.044,.5);

  for (const [x,y,vertical,kind,length=1.45] of passive) {
    const angle = vertical ? Math.PI/2 : 0, width = length*.49;
    const height = kind ? length*.35 : length*.22;
    box(kind ? (length>1.8 ? ceramic : cream) : dark,x,y,length*.78,width,height,H,angle);
    for (const sign of [-1,1]) {
      const shift = sign * length * .405;
      box(tin,x+shift*Math.cos(angle),y+shift*Math.sin(angle),length*.19,width*1.04,height*.99,H,angle,unit);
    }
  }
  for (const [x,y] of [[4.5,55.7],[4.5,51.8],[27,33.6],[27,25.2],[24.5,4.3],[26.4,4.3]]) {
    box(cream,x,y,.81,1.63,.29);
    for (const sign of [-1,1]) box(tin,x,y+sign*.67,.83,.33,.3);
    box(lens,x,y,.75,1.02,.29,H+.28);
    box(gold,x,y+.08,.20,.30,.014,H+.57);
  }

  const stamps = [];
  function imprint(x,y,w,d,top,angle,lines,mark=true) {
    stamps.push({x,y,w,d,top,angle,lines,mark});
  }
  function chip(x,y,w,d,h,pins,pitch,reach,lines,angle,quad=false) {
    const base = H+.10;
    const body = new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,.095),dark);
    body.position.copy(point(x,y,base+h/2)); group.add(body);
    // La anchura del terminal deja visible la separación entre pines incluso en el LQFP.
    for (let i=0;i<pins;i++) {
      const offset = (i-(pins-1)/2)*pitch, pinWidth = pitch*.50;
      for (const sign of [-1,1]) {
        part(lead,tin,x+sign*w/2,y+offset,H,reach,h+.1,pinWidth,sign>0 ? 0 : Math.PI);
        box(tin,x+sign*(w/2+reach*.85),y+offset,reach*.54,pinWidth*1.21,.055,H,0,unit);
        if (quad) {
          part(lead,tin,x+offset,y+sign*d/2,H,reach,h+.1,pinWidth,sign*Math.PI/2);
          box(tin,x+offset,y+sign*(d/2+reach*.85),pinWidth*1.21,reach*.54,.055,H,0,unit);
        }
      }
    }
    imprint(x,y,w,d,base+h,angle,lines);
  }
  chip(16.8,54.2,4.4,6.5,1,10,.65,1,
    [['ST',.99,700],['32F042F6P6',.68],['GK5RT',.53],['CHN241RNA',.49]],90);
  chip(16.6,32.1,4.4,7.8,1,12,.65,1,
    [['24A1TFUG3',.66],['ADC1173',.96,550],['CIMTC',.70]],90);
  chip(15.2,18.9,10,10,1.4,16,.5,1,
    [['Atmel',2.25,700],['ATSAM4S16B',.99],['MU     ARM',.78],['2404 A',.63]],-90,true);
  chip(9.3,28.2,2.96,3,.78,4,.65,.59,[['H74R',.65]],-90);
  box(dark,27,15.3,3,3,.82);
  imprint(27,15.3,3,3,H+.82,0,[['3361',.51],['B160',.44],['452',.4]]);
  for (let i=0;i<4;i++) for (const sign of [-1,1]) {
    const off=(i-1.5)*.5;
    box(tin,27+sign*1.49,15.3+off,.36,.25,.18);
    box(tin,27+off,15.3+sign*1.49,.25,.36,.18);
  }
  for (const [x,y,name,count] of [[9.1,35.9,'32N',3],[22.9,36.4,'AX4A',6]]) {
    box(dark,x,y,2.9,1.56,.87,H+.06);
    imprint(x,y,2.9,1.56,H+.93,180,[[name,.59]]);
    for (const sign of [-1,1]) {
      const offsets = count===6 ? [-.96,0,.96] : sign>0 ? [0] : [-.96,.96];
      for (const off of offsets) part(lead,tin,x+off,y+sign*.78,H,.72,.92,.37,sign*Math.PI/2);
    }
  }
  box(steel,17.5,10.3,2.5,2,.8);
  imprint(17.5,10.3,2.5,2,H+.8,0,[['11',.49],['8D',.39]],false);
  box(tin,5.9,7.42,3.58,2.0,.42);
  box(tin,5.9,8.19,3.64,.60,.27,H+.28);
  box(dark,5.9,5,6.5,3.5,1.6,H+.06);
  for (const x of [3.8,6.1,8.5]) part(lead,tin,x,3.25,H,1.27,1.35,.72,-Math.PI/2);
  imprint(5.9,5,6.5,3.5,H+1.66,0,[['LD33',.98,600],['ST     F224',.54]]);

  // Carcasa hueca del USB-C. La boca y la lengüeta se ven desde el extremo del conector.
  const shell = roundedRect(new THREE.Shape(),-4.45,0,8.9,3.2,1.34);
  shell.holes.push(roundedRect(new THREE.Path(),-4.24,.21,8.48,2.78,1.15));
  const sleeve = new THREE.Mesh(new THREE.ExtrudeGeometry(shell,{
    depth:7.5,curveSegments:10,bevelEnabled:true,bevelSegments:2,bevelThickness:.035,bevelSize:.035,
  }),steel);
  sleeve.position.set(17.5,H+.02,-6); group.add(sleeve);
  box(rubber,17.5,5.65,8.12,.56,2.64,H+.27);
  box(rubber,17.5,2.06,6.60,5.05,.52,H+1.37);
  for (let i=0;i<12;i++) {
    const x = 17.5+(i-5.5)*.48;
    box(gold,x,1.35,.24,3.34,.027,H+1.884,0,unit);
    box(tin,x,6.29,.22,.50,.18,H,0,unit);
  }
  for (const x of [15.3,19.7]) {
    box(rubber,x,4.71,1.5,.7,.027,H+3.25);
    box(tin,x-.1,4.89,.94,.20,.05,H+3.27);
  }
  box(tin,17.5,3.33,1.12,.47,.065,H+3.25);

  for (const {geo,mat,transforms} of batches.values()) {
    const mesh = new THREE.InstancedMesh(geo,mat,transforms.length);
    transforms.forEach((matrix,i) => mesh.setMatrixAt(i,matrix));
    mesh.instanceMatrix.needsUpdate = true; group.add(mesh);
  }
  group.add(packagePrint(stamps));
  return group;
}

// Marca de ST grabada en el plástico. El trazo inclinado une las dos letras.
function stampLogo(g, x, y, height) {
  g.save();
  g.translate(x - height, y - height * .5);
  g.scale(height, height);
  g.strokeStyle = g.fillStyle;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = .15;
  g.beginPath();
  g.moveTo(.04, .88);
  g.lineTo(.81, .88);
  g.quadraticCurveTo(1.04, .88, .88, .66);
  g.lineTo(.51, .31);
  g.quadraticCurveTo(.34, .12, .59, .12);
  g.lineTo(1.96, .12);
  g.lineTo(1.84, .31);
  g.lineTo(1.57, .31);
  g.lineTo(1.23, .89);
  g.stroke();
  g.restore();
}

function packagePrint(stamps) {
  const canvas = document.createElement('canvas');
  const cell = 384, cols = 3, rows = Math.ceil(stamps.length/cols);
  canvas.width=cols*cell; canvas.height=rows*cell;
  const g=canvas.getContext('2d'), positions=[], uvs=[];
  stamps.forEach(({x,y,w,d,top,angle,lines,mark},index) => {
    const col=index%cols, row=Math.floor(index/cols);
    g.save(); g.translate((col+.5)*cell,(row+.5)*cell);
    g.scale(cell/w,cell/d);
    g.fillStyle=css(PALETA.serigrafia);
    if (mark) {
      g.globalAlpha=.43; g.beginPath(); g.arc(-w*.385,-d*.38,Math.min(w,d)*.034,0,TAU); g.fill();
    }
    g.rotate(degToRad(angle)); g.globalAlpha=.66;
    g.textAlign='center'; g.textBaseline='middle';
    const total = lines.reduce((sum,[,size]) => sum+size*1.22,0);
    let baseline = -total/2;
    for (const [value,size,weight=450] of lines) {
      g.font=weight+' '+size+'px '+(weight>=600?'Arial, sans-serif':'monospace');
      const center = baseline + size*.61;
      if (value === 'ST') {
        stampLogo(g, 0, center, size);
      } else if (value.startsWith('ST ')) {
        stampLogo(g, -w*.21, center, size);
        g.fillText(value.slice(2).trim(), w*.13, center);
      } else {
        g.fillText(value,0,center,(Math.abs(angle)===90?d:w)*.86);
      }
      baseline+=size*1.22;
    }
    g.restore();
    for (const [u,v] of [[0,0],[1,0],[0,1],[1,0],[1,1],[0,1]]) {
      positions.push(x+(u-.5)*w,top+.009,-y-(v-.5)*d);
      uvs.push((col+u)/cols,1-(row+1-v)/rows);
    }
  });
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  return new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({
    map:canvasTexture(canvas),transparent:true,depthWrite:false,toneMapped:false,
  }));
}

// frame: caja de la placa (x0, y0, x1, y1, altura) que tiene que caber en el encuadre del paso.
// outline: rectángulos del contorno azul, si no coinciden con las regiones de la atenuación.
const views = [
  {center:[15,29.8], azimuth:54, elevation:36, regions:[]},
  {center:[15.8,13.4], azimuth:38, elevation:41, frame:[4,-1.5,29,27,H+3.3],
    regions:[[15.2,18.9,13.0,13.0],[17.5,2.3,10.1,8.7]], outline:[[15.2,18.9,13.0,13.0],[17.5,3.4,10.1,6.2]],
    anchor:[18.9,17,3.12],
    title:'Capturador · ATSAM4S16B', text:': espera la señal de inicio, guarda las muestras y las manda al portátil por USB'},
  {center:[16.6,32.1], azimuth:68, elevation:57, frame:[3,20,30,45],
    regions:[[16.6,32.1,7.45,8.85]], anchor:[18.55,31.25,2.73],
    title:'Medidor (ADC) de 8 bits', text:' · una muestra en cada ciclo del chip: 7,5 millones por segundo'},
  {center:[16.8,53.4], azimuth:122, elevation:44, frame:[2.45,45,27.55,L],
    regions:[[16.8,54.2,7.42,7.64]], anchor:[18.68,54.35,2.73],
    title:'Víctima · STM32F042F6P6', text:': el chip que cifra con AES-128'},
  {center:[20.4,43.1], azimuth:86, elevation:57, frame:[9,29.5,28,L],
    regions:[[16.8,54.2,7.8,7.8],[23.1,44,11.9,10.6],[17.7,34.6,9.6,12.8]],
    anchor:[20.7,51.85,3.41], title:'Resistencia de 27 Ω (shunt)', text:' en la alimentación de la víctima: su tensión sigue a la corriente',
    detail:'recorrido esquemático'},
];

function focusMaterials() {
  const regions = Array.from({length:3},() => new THREE.Vector4());
  const weight = {value:0};
  const uniforms = {cwRegions:{value:regions},cwWeight:weight,
    cwPaper:{value:new THREE.Color(PALETA.fondo).convertLinearToSRGB()}};
  function style(material) {
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader = 'varying vec2 cwPoint;\n' + shader.vertexShader.replace(
        '#include <project_vertex>',[
          '#include <project_vertex>','vec4 cwLocal = vec4(transformed, 1.0);',
          '#ifdef USE_INSTANCING','cwLocal = instanceMatrix * cwLocal;','#endif',
          'vec4 cwWorld = modelMatrix * cwLocal;', 'cwPoint = vec2(cwWorld.x, -cwWorld.z);',
        ].join('\n'));
      shader.fragmentShader = [
        'varying vec2 cwPoint;', 'uniform vec4 cwRegions[3];','uniform float cwWeight;',
        'uniform vec3 cwPaper;', 'float cwDistance(vec4 box) {',
        '  vec2 d = abs(cwPoint - box.xy) - box.zw * 0.5 + 0.65;',
        '  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.65;', '}',
        shader.fragmentShader.replace('#include <colorspace_fragment>',[
          '#include <colorspace_fragment>',
          'float cwEdge = min(cwDistance(cwRegions[0]), min(cwDistance(cwRegions[1]), cwDistance(cwRegions[2])));',
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, cwPaper, cwWeight * smoothstep(-0.35, 1.05, cwEdge));',
        ].join('\n')),
      ].join('\n');
    };
    return material;
  }
  return {style,regions,weight};
}

function focusFrames() {
  return views.map((view,i) => {
    const group = new THREE.Group();
    if (!i) return group;
    const mat = new THREE.LineBasicMaterial({color:PALETA.acento,transparent:true,depthWrite:false,toneMapped:false});
    const frames = i===4 ? [[23,43.9,11.8,9.65]] : view.outline ?? view.regions;
    for (const [x,y,w,d] of frames) {
      const path=roundedRect(new THREE.Path(),x-w/2,y-d/2,w,d,.79);
      const pts=path.getPoints(8).map(p=>point(p.x,p.y,H+.085));
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),mat));
    }
    return group;
  });
}

function signalPath() {
  const group = new THREE.Group();
  const nodes = [[16.8,54.2],[18.35,54.2],[23,49.55],[23,47],[23,40.5],
    [23,36.02],[19.48,32.5],[18.8,32.5]].map(([x,y])=>point(x,y,H+1.81));
  const curve = new THREE.CurvePath();
  let last=nodes[0];
  for (let i=1;i<nodes.length-1;i++) {
    const at=nodes[i], before=nodes[i-1], after=nodes[i+1];
    const radius=Math.min(.85,at.distanceTo(before)*.40,at.distanceTo(after)*.40);
    const entry=at.clone().lerp(before,radius/at.distanceTo(before));
    const exit=at.clone().lerp(after,radius/at.distanceTo(after));
    curve.add(new THREE.LineCurve3(last,entry)); curve.add(new THREE.QuadraticBezierCurve3(entry,at,exit));
    last=exit;
  }
  curve.add(new THREE.LineCurve3(last,nodes.at(-1)));
  const samples = curve.getPoints(10), geometry = new LineGeometry();
  geometry.setPositions(samples.flatMap(p=>p.toArray()));
  const material = new LineMaterial({color:PALETA.acento,linewidth:3.6,toneMapped:false,
    transparent:true,depthWrite:false});
  const line = new Line2(geometry,material); group.add(line);
  const pulseMat = new THREE.MeshBasicMaterial({color:PALETA.acento,toneMapped:false,transparent:true});
  const pulses = new THREE.InstancedMesh(new THREE.CapsuleGeometry(1,2,4,12).rotateX(Math.PI/2),pulseMat,4);
  // El volumen de la instancia cambia con la fase y la trayectoria siempre cabe en la escena.
  pulses.frustumCulled=false; pulses.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(pulses);
  const pathLength=curve.getLength(), temp=new THREE.Object3D(), axis=new THREE.Vector3(0,0,1);
  temp.scale.set(.3,.3,.3);
  // Tabla de longitud de arco: la velocidad no depende de la densidad de las curvas.
  const points=curve.getSpacedPoints(320);
  const tangent=new THREE.Vector3();
  function move(distance) {
    for (let i=0;i<4;i++) {
      const t=((distance/pathLength + (i+.43)/4)%1)*(points.length-1);
      const k=Math.floor(t), next=points[k+1];
      temp.position.lerpVectors(points[k],next,t-k);
      temp.quaternion.setFromUnitVectors(axis,tangent.subVectors(next,points[k]).normalize());
      temp.updateMatrix(); pulses.setMatrixAt(i,temp.matrix);
    }
    pulses.instanceMatrix.needsUpdate=true;
  }
  move(0);
  function opacity(alpha) {
    group.visible=alpha>.002; material.opacity=alpha; pulseMat.opacity=alpha;
  }
  return {group,move,opacity,material};
}

function contactShadow() {
  const canvas=document.createElement('canvas');
  canvas.width=416; canvas.height=656;
  const g=canvas.getContext('2d');
  // Dos penumbras de la misma silueta mantienen la sombra pegada al objeto.
  g.fillStyle=css(PALETA.tinta);
  for (const [blur,alpha] of [[25,.21],[10,.13]]) {
    g.filter='blur('+blur+'px)'; g.globalAlpha=alpha; g.beginPath();
    g.roundRect(90,181,238,386,10); g.roundRect(109,83,200,140,11); g.fill();
  }
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(52,82),new THREE.MeshBasicMaterial({
    map:canvasTexture(canvas),transparent:true,depthWrite:false,toneMapped:false,
  }));
  mesh.rotation.x=-Math.PI/2; mesh.position.copy(point(15.25,29.7,-1.12)); mesh.renderOrder=-2;
  return mesh;
}

function installStyle() {
  const id='estilo-escena-placa';
  if (document.getElementById(id)) return;
  const sheet=document.createElement('style'); sheet.id=id;
  // Tamaños en px del escenario de 1920×1080 de la presentación: no escalan con el contenedor,
  // para que la etiqueta se lea desde el fondo del aula. El canvas se funde con el fondo en los
  // bordes: un primer plano que se sale del contenedor no acaba en un corte seco. La nota lleva el fondo de la
  // diapositiva, con el texto donde estaba: solo se nota cuando la placa, acercada, le pasa por detrás.
  const fade = 'transparent, #000 44px, #000 calc(100% - 44px), transparent';
  sheet.textContent = `
    .cw1101-stage { position:absolute; inset:0; overflow:hidden; isolation:isolate; }
    .cw1101-stage > canvas, .cw1101-labels, .cw1101-guides { position:absolute; inset:0; display:block; }
    .cw1101-stage > canvas { mask-image:linear-gradient(to right, ${fade}), linear-gradient(${fade});
      mask-composite:intersect; }
    .cw1101-labels, .cw1101-guides, .cw1101-note { pointer-events:none; }
    .cw1101-guides { width:100%; height:100%; overflow:hidden; }
    .cw1101-labels .cw1101-card { box-sizing:border-box; font:inherit; font-size:24px;
      line-height:1.28; letter-spacing:-.012em; font-weight:400; color:${css(PALETA.tinta)};
      padding:14px 18px 15px; border-radius:12px; background:${css(PALETA.superficie)};
      box-shadow:0 0 0 1px ${css(PALETA.tinta)}0d, 0 6px 22px -8px ${css(PALETA.tinta)}40;
      width:max-content; max-width:var(--cw-card); text-wrap:pretty; pointer-events:none; }
    .cw1101-card strong { font-weight:650; } .cw1101-card small { display:block; font-size:19px;
      margin-top:6px; color:${css(PALETA.tenue)}; font-weight:450; letter-spacing:0; }
    .cw1101-note { position:absolute; right:calc(2.2% - 8px); bottom:calc(2.6% - 3px); margin:0; padding:3px 8px;
      border-radius:8px; background:${css(PALETA.fondo)}; font:inherit; text-align:right;
      font-size:16px; line-height:1.3; letter-spacing:0; color:${css(PALETA.tenue)}; }
  `;
  document.head.append(sheet);
}

// Contorno a dos alturas y la carcasa del USB-C: su envolvente convexa en pantalla es la placa.
const silhouette = (() => {
  const ring = outline().getPoints(4);
  const pts = ring.flatMap(p => [point(p.x,p.y,0),point(p.x,p.y,H+1.5)]);
  for (const x of [13.05,21.95]) for (const y of [-1.5,6]) pts.push(point(x,y,H+3.25));
  return pts;
})();

function convexHull(points) {
  const pts = points.slice().sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const cross = (o,a,b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const half = list => {
    const out = [];
    for (const p of list) {
      while (out.length > 1 && cross(out.at(-2),out.at(-1),p) <= 0) out.pop();
      out.push(p);
    }
    out.pop(); return out;
  };
  return [...half(pts),...half(pts.reverse())];
}

// ¿Toca el rectángulo [x0,x1]×[y0,y1] el polígono convexo? Muestrea el rectángulo y los vértices.
function rectHitsHull(x0,y0,x1,y1,hull) {
  const inside = (x,y) => hull.every((a,i) => {
    const b = hull[(i+1)%hull.length];
    return (b[0]-a[0])*(y-a[1]) - (b[1]-a[1])*(x-a[0]) >= 0;
  });
  for (let i=0;i<=6;i++) for (let j=0;j<=4;j++) {
    if (inside(lerp(x0,x1,i/6),lerp(y0,y1,j/4))) return true;
  }
  return hull.some(([x,y]) => x>=x0 && x<=x1 && y>=y0 && y<=y1);
}

function annotations(stage,scene) {
  const renderer=new CSS2DRenderer();
  renderer.domElement.className='cw1101-labels'; renderer.sortObjects=false;
  const ns='http://www.w3.org/2000/svg';
  const guides=document.createElementNS(ns,'svg'), line=document.createElementNS(ns,'polyline');
  const halo=document.createElementNS(ns,'polyline'), dot=document.createElementNS(ns,'circle');
  halo.setAttribute('fill','none'); halo.setAttribute('stroke',css(PALETA.superficie));
  halo.setAttribute('stroke-width','3.5'); halo.setAttribute('stroke-opacity','.9');
  halo.setAttribute('stroke-linejoin','round'); halo.setAttribute('stroke-linecap','round');
  guides.setAttribute('class','cw1101-guides'); guides.setAttribute('aria-hidden','true');
  line.setAttribute('fill','none'); line.setAttribute('stroke',css(PALETA.tenue));
  line.setAttribute('stroke-width','1.25'); line.setAttribute('stroke-linejoin','round');
  dot.setAttribute('r','4'); dot.setAttribute('fill',css(PALETA.superficie));
  dot.setAttribute('stroke',css(PALETA.tinta)); dot.setAttribute('stroke-width','1.5');
  guides.append(halo,line,dot);
  const card=document.createElement('div'); card.className='etiqueta-3d cw1101-card';
  const label=new CSS2DObject(card); label.center.set(0,.5); scene.add(label);
  renderer.domElement.append(card); // en el DOM desde el principio, para poder medirla
  const note=document.createElement('p'); note.className='cw1101-note';
  note.textContent='Modelo 3D simplificado de la placa CW1101';
  stage.append(guides,renderer.domElement,note);
  let selected=0, cardLeft=0, cardOffset=0;
  const projected=new THREE.Vector3(), anchor=new THREE.Vector3();
  function select(n) {
    selected=n; label.visible=n!==0;
    card.replaceChildren();
    if (!n) { guides.style.visibility='hidden'; return; }
    const view=views[n], title=document.createElement('strong');
    title.textContent=view.title; card.append(title,document.createTextNode(view.text));
    if (view.detail) {
      const detail=document.createElement('small'); detail.textContent=view.detail; card.append(detail);
    }
    anchor.copy(point(...view.anchor));
  }
  function resize(w,h) {
    // En contenedores estrechos (el del montaje mide 1152 px) la tarjeta pasa a tres líneas y le
    // deja más ancho a la placa.
    const cardWidth=Math.min(500,w*.37);
    stage.style.setProperty('--cw-card',cardWidth+'px');
    cardLeft=w*.964-cardWidth;
    renderer.setSize(w,h);
    return cardLeft/w;
  }
  // Busca, cerca de la posición preferida, una altura de la columna de etiquetas libre de placa.
  function place(camera,w,h) {
    if (!selected) return;
    const hull=convexHull(silhouette.map(p => {
      const q=p.clone().project(camera); return [(q.x+1)*w/2,(1-q.y)*h/2];
    }));
    projected.copy(anchor).project(camera);
    const display=card.style.display; card.style.display='';
    const y=(1-projected.y)*h/2, half=(card.offsetHeight || 90)/2;
    const x0=cardLeft-14, x1=cardLeft+(card.offsetWidth || w*.3)+14;
    card.style.display=display;
    const preferred=clamp(y+h*[0,-.10,.22,.09,.14][selected],h*.1+half,h*.9-half);
    let best=preferred, cost=Infinity;
    for (let cy=h*.1+half; cy<=h*.9-half; cy+=6) {
      const c=Math.abs(cy-preferred)+(rectHitsHull(x0,cy-half-12,x1,cy+half+12,hull) ? 1e6 : 0);
      if (c<cost) { cost=c; best=cy; }
    }
    cardOffset=best-y;
  }
  function draw(camera,w,h) {
    if (selected) {
      projected.copy(anchor).project(camera);
      const x=(projected.x+1)*w/2, y=(1-projected.y)*h/2;
      const side=x<=cardLeft ? 1 : -1;
      const half=(card.offsetHeight || 90)/2;
      const cy=clamp(y+cardOffset,h*.06+half,h*.94-half);
      const endX=side>0 ? cardLeft : cardLeft+card.offsetWidth;
      label.position.set(cardLeft/w*2-1,1-cy/h*2,0).unproject(camera);
      const points=x+','+y+' '+(endX-side*w*.027)+','+cy+' '+endX+','+cy;
      line.setAttribute('points',points); halo.setAttribute('points',points);
      dot.setAttribute('cx',x); dot.setAttribute('cy',y);
      guides.style.visibility=Math.abs(projected.z)<=1 && x>=0 && x<=w && y>=0 && y<=h ? '' : 'hidden';
    }
    renderer.render(scene,camera);
  }
  return {select,resize,draw,place};
}

const hull = [[0,0],[30,0],[30,47],[27.55,L],[2.45,L],[0,47],
  [13.05,-1.5],[21.95,-1.5]].flatMap(([x,y])=>[point(x,y,0),point(x,y,H+1.4)]);
hull.push(point(13.05,-1.5,H+3.25),point(21.95,-1.5,H+3.25));
const FOV=28;
function frameHull([x0,y0,x1,y1,top=H+1.4]) {
  const pts=[];
  for (const x of [x0,x1]) for (const y of [y0,y1]) pts.push(point(x,y,0),point(x,y,top));
  return pts;
}

function composition(n,w,h,cardEdge) {
  const view=views[n], target=point(...view.center,H+.45);
  const theta=degToRad(view.azimuth), phi=degToRad(90-view.elevation);
  const tan=Math.tan(degToRad(FOV/2));
  // En el paso 0 la placa gira: el encuadre tiene que valer para cualquier acimut, así que se
  // ajusta la envolvente de 36 vistas y la placa nunca se sale ni cambia de tamaño al girar.
  const azimuths=n ? [theta] : Array.from({length:36},(_,i)=>theta+i*TAU/36);
  const basis=azimuths.flatMap(angle=>{
    const direction=new THREE.Vector3().setFromSphericalCoords(1,phi,angle);
    const right=new THREE.Vector3(Math.cos(angle),0,-Math.sin(angle));
    const up=direction.clone().cross(right);
    return (view.frame ? frameHull(view.frame) : hull).map(vertex=>{
      const p=vertex.clone().sub(target);
      return [p.dot(right)/(2*tan*w/h),-p.dot(up)/(2*tan),p.dot(direction)];
    });
  });
  const left = n ? .045 : .06;
  const rightEdge = n ? cardEdge - .035 : .94;
  const top = n ? .085 : .11;
  const bottom = n ? .89 : .87;
  function bounds(radius) {
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for (const [x,y,z] of basis) {
      const u=x/(radius-z), v=y/(radius-z);
      x0=Math.min(x0,u); x1=Math.max(x1,u); y0=Math.min(y0,v); y1=Math.max(y1,v);
    }
    return {x0,x1,y0,y1};
  }
  // Ajuste en perspectiva de los extremos proyectados, incluida la boca del USB.
  let low=Math.max(...basis.map(p=>p[2]))+1, high=400;
  for (let i=0;i<22;i++) {
    const radius=(low+high)/2, b=bounds(radius);
    if (b.x1-b.x0>rightEdge-left || b.y1-b.y0>bottom-top) low=radius;
    else high=radius;
  }
  const b=bounds(high);
  const shift=new THREE.Vector2((left+rightEdge-b.x0-b.x1)/2-.5,(top+bottom-b.y0-b.y1)/2-.5);
  return {target,theta,phi,radius:high,shift};
}

function focusPose(n) {
  const slots=views[n].regions, fallback=[15,30,35,68];
  return {
    rectangles:Array.from({length:3},(_,i)=>new THREE.Vector4(...(slots[i] || slots.at(-1) || fallback))),
    weights:views.map((_,i)=>Number(n===i)), fade: n ? .16 : 0,
  };
}

function releaseScene(scene) {
  const geometries=new Set(), materials=new Set(), textures=new Set();
  scene.traverse(object=>{
    if (object.isInstancedMesh) object.dispose();
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      for (const mat of [object.material].flat()) {
        materials.add(mat);
        for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
      }
    }
  });
  for (const resource of [...geometries,...materials,...textures]) resource.dispose();
  scene.clear();
}

export function mount(container, options = {}) {
  installStyle();
  const isStatic=options.static===true;
  let selected=indexOfStep(options.step ?? (isStatic?4:0));
  const oldRole=container.getAttribute('role'), oldLabel=container.getAttribute('aria-label');
  const oldReady=container.dataset.ready, oldPosition=container.style.position;
  const needsPosition=getComputedStyle(container).position==='static';
  if (needsPosition) container.style.position='relative';
  container.setAttribute('role','img'); delete container.dataset.ready;
  const stage=document.createElement('div'); stage.className='cw1101-stage'; container.append(stage);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,...(isStatic?{preserveDrawingBuffer:true}:{})});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.NeutralToneMapping;
  renderer.setClearColor(PALETA.fondo,0); renderer.domElement.setAttribute('aria-hidden','true');
  stage.append(renderer.domElement);
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(FOV,1,.35,650);
  const focus=focusMaterials(), board=buildBoardModel(), frames=focusFrames(), signal=signalPath();
  board.traverse(object=>{ if (object.material) focus.style(object.material); });
  const shadow=contactShadow();
  scene.add(board,shadow,...frames,signal.group);
  scene.environmentIntensity=.83;
  const key=new THREE.DirectionalLight(PALETA.superficie,2.15);
  key.position.set(-24,78,13); key.target.position.copy(point(15,30));
  // Relleno desde abajo, en vertical: la cara de abajo (se ve al darle la vuelta) ya no sale negra, y la de arriba y
  // los cantos no lo reciben, así que la vista de arriba no cambia.
  const fill=new THREE.DirectionalLight(PALETA.superficie,2.4);
  fill.position.copy(point(15,30,-80)); fill.target.position.copy(point(15,30));
  scene.add(key,key.target,fill,fill.target);
  const labels=annotations(stage,scene);
  const controls=isStatic ? null : new OrbitControls(camera,renderer.domElement);
  const target=controls?.target ?? new THREE.Vector3(), shift=new THREE.Vector2();
  if (controls) {
    controls.enabled=false; controls.enablePan=false; controls.enableDamping=true;
    controls.dampingFactor=.095; controls.rotateSpeed=.68; controls.zoomSpeed=.68;
    // Tope de la rueda con margen sobre los 34 mm a los que quedan las esquinas de la placa del centro de giro de la
    // portada: más cerca, de canto, la cámara entra en el USB-C o en el PCB. En los pasos 1, 3 y 4 (solo salen como
    // respaldo de V2) el centro de giro está descentrado y, de canto y a fondo, la cámara aún puede entrar.
    controls.minDistance=40; controls.maxDistance=310; controls.autoRotateSpeed=1;
  }
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  let width=0,height=0,cardEdge=.69,envTarget=null,disposed=false,running=false;
  let frameId=null,lastTime=null,flight=null,touched=false,travel=0;
  const weights=[0,0,0,0,0], orbital=new THREE.Spherical(), offset=new THREE.Vector3();
  function applyVisual(start,end,t) {
    for (let i=0;i<3;i++) focus.regions[i].lerpVectors(start.rectangles[i],end.rectangles[i],t);
    focus.weight.value=lerp(start.fade,end.fade,t);
    for (let i=0;i<5;i++) {
      weights[i]=lerp(start.weights[i],end.weights[i],t);
      frames[i].visible=weights[i]>.002;
      if (i) frames[i].children[0].material.opacity=weights[i]*.83;
    }
    signal.opacity(weights[4]);
  }
  function applyCamera(start,end,t) {
    target.lerpVectors(start.target,end.target,t); shift.lerpVectors(start.shift,end.shift,t);
    const delta=Math.atan2(Math.sin(end.theta-start.theta),Math.cos(end.theta-start.theta));
    offset.setFromSphericalCoords(lerp(start.radius,end.radius,t),lerp(start.phi,end.phi,t),start.theta+delta*t);
    camera.position.copy(target).add(offset); camera.lookAt(target);
    camera.setViewOffset(width,height,-shift.x*width,-shift.y*height,width,height);
  }
  const probe=new THREE.PerspectiveCamera(FOV,1,.35,650);
  function placeCard(pose) {
    probe.position.copy(pose.target).add(new THREE.Vector3().setFromSphericalCoords(pose.radius,pose.phi,pose.theta));
    probe.lookAt(pose.target);
    probe.setViewOffset(width,height,-pose.shift.x*width,-pose.shift.y*height,width,height);
    probe.updateMatrixWorld();
    labels.place(probe,width,height);
  }
  function select() {
    labels.select(selected);
    const view=views[selected];
    const desc='Modelo 3D de la placa ChipWhisperer-Nano CW1101. ';
    container.setAttribute('aria-label',desc+(selected ? view.title+view.text+'.'+(view.detail?' Recorrido esquemático.':'')
      : 'Vista de tres cuartos de la cara de componentes, con la víctima y el conector USB-C en los extremos.'));
  }
  function draw() {
    if (!width || !height || disposed) return;
    if (!envTarget) {
      const generator=new THREE.PMREMGenerator(renderer), room=new RoomEnvironment();
      envTarget=generator.fromScene(room,.035,.1,100,{size:128});
      scene.environment = envTarget.texture;
      room.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
      room.dispose();
      generator.dispose();
    }
    // La sombra de contacto se apaga entre 8 y 3 mm de altura de la cámara sobre su plano: de canto y cerca, se vería
    // como una franja gris que flota bajo la placa.
    shadow.material.opacity=clamp((camera.position.y-shadow.position.y-3)/5,0,1);
    renderer.render(scene,camera); labels.draw(camera,width,height);
    container.dataset.ready='1';
  }
  function snap() {
    flight=null;
    const pose=focusPose(selected); applyVisual(pose,pose,1);
    if (!width || !height) return;
    const dest=composition(selected,width,height,cardEdge);
    placeCard(dest); applyCamera(dest,dest,1);
    if (selected===4) { travel=0; signal.move(0); }
    draw();
  }
  function clearInertia() {
    if (!controls) return;
    const old=camera.position.clone();
    controls.autoRotate=false; controls.enableDamping=false; controls.update();
    camera.position.copy(old); camera.lookAt(target); controls.enableDamping=true;
  }
  function step(n) {
    if (disposed) return;
    const next=indexOfStep(n);
    if (next!==selected && next===0) touched=false;
    selected=next; select(); clearInertia();
    if (!running || !width || !height || media.matches) { snap(); return; }
    orbital.setFromVector3(offset.copy(camera.position).sub(target));
    flight={
      time:0,manual:false,from:{target:target.clone(),shift:shift.clone(),theta:orbital.theta,
        phi:orbital.phi,radius:orbital.radius}, to:composition(selected,width,height,cardEdge),
      initial:{rectangles:focus.regions.map(v=>v.clone()),weights:weights.slice(),fade:focus.weight.value},
      final:focusPose(selected),
    };
    placeCard(flight.to);
  }
  function schedule() {
    if (running && width>0 && height>0 && frameId===null) frameId=requestAnimationFrame(tick);
  }
  function tick(time) {
    frameId=null;
    if (!running || disposed) return;
    const elapsed=lastTime===null?0:Math.max(0,(time-lastTime)/1000);
    const dt=Math.min(elapsed,.065); lastTime=time;
    let changed=false;
    if (flight) {
      flight.time+=elapsed;
      const t=1-Math.pow(1-Math.min(flight.time/.78,1),5);
      if (!flight.manual) applyCamera(flight.from,flight.to,t);
      applyVisual(flight.initial,flight.final,t); changed=true;
      if (t===1) flight=null;
    }
    if (controls && (!flight || flight.manual)) {
      controls.autoRotate=selected===0 && !touched && !media.matches && !flight;
      changed=controls.update(dt) || changed;
    }
    if (signal.group.visible && !media.matches) { travel+=22*dt; signal.move(travel); changed=true; }
    if (changed || inputDirty) draw();
    inputDirty = false;
    schedule();
  }
  function start() {
    if (disposed || isStatic || running) return;
    // Al volver a la diapositiva, la vista de producto vuelve a girar sola aunque antes se tocara.
    running=true; lastTime=null; touched=false; controls.enabled=true; schedule();
  }
  function cancelFrame() {
    if (frameId!==null) cancelAnimationFrame(frameId);
    frameId=null; lastTime=null;
  }
  function stop() {
    running=false; cancelFrame();
    if (controls) { controls.autoRotate=false; controls.enabled=false; }
  }
  function interact() {
    if (!running) return;
    touched=true; controls.autoRotate=false;
    if (flight) flight.manual=true;
  }
  // OrbitControls actualiza la cámara durante el evento de puntero, antes del siguiente RAF.
  let inputDirty=false;
  function changedByInput() { inputDirty=true; }
  function motionChanged() { if (!disposed) { clearInertia(); snap(); } }
  controls?.addEventListener('start',interact);
  controls?.addEventListener('change',changedByInput);
  if (controls) renderer.domElement.addEventListener('pointerdown',interact);
  media.addEventListener('change',motionChanged);
  function resize() {
    if (disposed) return;
    const w=stage.clientWidth,h=stage.clientHeight;
    if (w===width && h===height) return;
    width=w; height=h;
    if (!w || !h) { cancelFrame(); return; }
    renderer.setSize(w,h); signal.material.resolution.set(w,h);
    cardEdge=labels.resize(w,h); clearInertia(); snap(); schedule();
  }
  const observer=new ResizeObserver(resize);
  select(); observer.observe(container); resize();

  function dispose() {
    if (disposed) return;
    disposed=true; stop(); observer.disconnect();
    media.removeEventListener('change',motionChanged);
    renderer.domElement.removeEventListener('pointerdown',interact);
    controls?.removeEventListener('start',interact);
    controls?.removeEventListener('change',changedByInput); controls?.dispose();
    scene.environment=null; envTarget?.dispose(); releaseScene(scene);
    renderer.dispose(); renderer.forceContextLoss(); stage.remove();
    if (needsPosition) container.style.position=oldPosition;
    for (const [key,value] of [['role',oldRole],['aria-label',oldLabel]]) {
      if (value===null) container.removeAttribute(key); else container.setAttribute(key,value);
    }
    if (oldReady===undefined) delete container.dataset.ready; else container.dataset.ready=oldReady;
  }
  return {steps:5,start,stop,step,dispose};
}
