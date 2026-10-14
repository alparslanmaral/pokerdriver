import * as THREE from 'three';
import { CABIN } from '../config/cabinConfig';
import { PLAYER_COLOR } from '../config/gameConfig';
import { makeMirrorTexture } from './textures';

/**
 * Procedural right-hand-drive cabin (car-local space: +X right, +Y up, -Z forward).
 * Everything the game needs to talk to is exposed on the returned object.
 */
export interface Cabin {
  root: THREE.Group;
  /** Camera mount at the driver's eye. */
  eye: THREE.Object3D;
  /** Rotating part of the steering wheel (local Z is the wheel axis). */
  wheelSpin: THREE.Object3D;
  /** Wheel center, used to project the wheel into screen space. */
  wheelCenter: THREE.Object3D;
  /** Invisible disc that is ray-tested to grab the wheel. */
  wheelHit: THREE.Object3D;
  /** Card table anchors (left / right edge midpoints) for projecting the DOM overlay. */
  tableLeftEdge: THREE.Object3D;
  tableRightEdge: THREE.Object3D;
  /** A point on the dashboard's front edge used to compute the window drop-zone line. */
  dashEdge: THREE.Object3D;
  updateCluster(speedKmh: number, nitroFrac: number, shield: boolean): void;
  dispose(): void;
}

function mat(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

/** A box stretched between two points (used for pillars and rails). */
function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, material: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), material);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
  return m;
}

export function buildCabin(mirrorTexture?: THREE.Texture): Cabin {
  const root = new THREE.Group();
  root.name = 'cabin';

  const dark = mat(0x2a2d35);
  const darker = mat(0x191b20);
  const dashTopMat = mat(0x3a3e48);
  const trim = mat(0x4a505c);
  const accent = new THREE.MeshBasicMaterial({ color: 0xe63946 });
  const bodyMat = new THREE.MeshLambertMaterial({ color: PLAYER_COLOR });
  const D = CABIN.dash;

  // ---- Dashboard
  const dashDepth = 0.46;
  const dashZ = D.frontZ + dashDepth / 2;
  root.add(box(D.width, 0.15, dashDepth, dashTopMat, 0, D.topY - 0.075, dashZ));
  root.add(box(D.width, 0.85, 0.34, dark, 0, 0.45, D.frontZ + 0.17 + 0.1));
  root.add(box(D.width, 0.012, 0.03, accent, 0, D.topY + 0.002, D.frontZ + 0.02)); // thin red accent along the dash edge
  // Floor
  root.add(box(2.0, 0.05, 2.4, darker, 0, 0.12, 0.2));
  // Doors (beltline + inner panels)
  for (const side of [1, -1]) {
    root.add(box(0.1, 0.62, 2.0, dark, side * 0.97, 0.66, -0.05));
    root.add(box(0.14, 0.05, 2.0, trim, side * 0.95, 0.98, -0.05));
    root.add(box(0.2, 0.09, 0.7, trim, side * 0.86, 0.78, 0.1)); // armrest
  }
  // Center tunnel + shifter
  root.add(box(0.36, 0.6, 1.5, dark, -0.04, 0.3, 0.0));
  const shiftBase = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.14, 8), darker);
  shiftBase.position.set(-0.04, 0.66, -0.08);
  root.add(shiftBase);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), trim);
  knob.position.set(-0.04, 0.74, -0.08);
  root.add(knob);

  // ---- Hood
  const hood = box(1.7, 0.12, 1.15, bodyMat, 0, 0.9, D.frontZ - 0.62);
  hood.rotation.x = 0.07;
  root.add(hood);
  for (const side of [1, -1]) {
    const fender = box(0.28, 0.16, 1.3, bodyMat, side * 0.86, 0.9, D.frontZ - 0.55);
    fender.rotation.x = 0.05;
    root.add(fender);
  }

  // ---- Windshield frame
  const W = CABIN.windshield;
  const bottomL = new THREE.Vector3(-0.93, D.topY, D.frontZ + 0.04);
  const bottomR = new THREE.Vector3(0.93, D.topY, D.frontZ + 0.04);
  const topL = new THREE.Vector3(-0.95, W.topY, W.topZ);
  const topR = new THREE.Vector3(0.95, W.topY, W.topZ);
  root.add(beam(bottomL, topL, 0.08, 0.06, dark));
  root.add(beam(bottomR, topR, 0.08, 0.06, dark));
  root.add(box(1.9, 0.09, 0.14, dark, 0, W.topY + 0.02, W.topZ)); // header rail
  root.add(box(2.0, 0.05, 1.8, mat(0x24262b), 0, W.topY + 0.1, W.topZ + 0.9)); // roof liner
  for (const side of [1, -1]) {
    // roof rail above the side window
    root.add(box(0.08, 0.08, 1.6, dark, side * 0.93, W.topY + 0.03, W.topZ + 0.8));
  }

  // Faint sun-strip tint at the top of the glass
  const stripCanvas = document.createElement('canvas');
  stripCanvas.width = 4;
  stripCanvas.height = 64;
  const sctx = stripCanvas.getContext('2d')!;
  const sg = sctx.createLinearGradient(0, 0, 0, 64);
  sg.addColorStop(0, 'rgba(20,45,90,0.65)');
  sg.addColorStop(1, 'rgba(20,45,90,0)');
  sctx.fillStyle = sg;
  sctx.fillRect(0, 0, 4, 64);
  const stripTex = new THREE.CanvasTexture(stripCanvas);
  stripTex.colorSpace = THREE.SRGBColorSpace;
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(1.78, 0.2),
    new THREE.MeshBasicMaterial({ map: stripTex, transparent: true, depthWrite: false }),
  );
  const stripDir = new THREE.Vector3().subVectors(topL, bottomL).normalize();
  strip.position.set(0, W.topY - stripDir.y * 0.1, W.topZ - stripDir.z * 0.1);
  strip.rotation.x = Math.atan2(stripDir.z, stripDir.y);
  root.add(strip);

  // ---- Rear-view mirror
  const mirrorGroup = new THREE.Group();
  mirrorGroup.position.set(0.0, W.topY - 0.1, W.topZ - 0.04);
  mirrorGroup.rotation.y = 0.3;
  mirrorGroup.add(box(0.22, 0.065, 0.03, darker, 0, 0, 0));
  const mirrorFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.048),
    new THREE.MeshBasicMaterial({ map: mirrorTexture ?? makeMirrorTexture() }),
  );
  mirrorFace.position.z = 0.0155;
  mirrorGroup.add(mirrorFace);
  const stem = box(0.016, 0.06, 0.016, darker, 0, 0.06, -0.01);
  mirrorGroup.add(stem);
  root.add(mirrorGroup);

  // ---- Side mirrors
  for (const side of [1, -1]) {
    const m = new THREE.Group();
    m.position.set(side * 1.08, 1.02, D.frontZ + 0.55);
    m.add(box(0.07, 0.1, 0.16, bodyMat, 0, 0, 0));
    m.add(box(0.012, 0.085, 0.13, darker, -side * 0.04, 0, 0));
    root.add(m);
    root.add(box(0.14, 0.03, 0.04, bodyMat, side * 0.99, 0.98, D.frontZ + 0.55));
  }

  // ---- Instrument cluster (canvas, redrawn by updateCluster)
  const clusterCanvas = document.createElement('canvas');
  clusterCanvas.width = 512;
  clusterCanvas.height = 192;
  const cctx = clusterCanvas.getContext('2d')!;
  const clusterTex = new THREE.CanvasTexture(clusterCanvas);
  clusterTex.colorSpace = THREE.SRGBColorSpace;
  const cluster = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.15),
    new THREE.MeshBasicMaterial({ map: clusterTex }),
  );
  cluster.position.set(CABIN.wheel.x, 0.995, D.frontZ + dashDepth + 0.015);
  cluster.rotation.x = -0.9;
  root.add(cluster);

  let lastCluster = '';
  let lastClusterTime = 0;
  function updateCluster(speedKmh: number, nitroFrac: number, shield: boolean): void {
    const key = `${Math.round(speedKmh)}|${Math.round(nitroFrac * 30)}|${shield}`;
    if (key === lastCluster) return;
    // redraw at most ~20 times per second (canvas upload is not free)
    const now = performance.now();
    if (now - lastClusterTime < 50) return;
    lastClusterTime = now;
    lastCluster = key;
    cctx.fillStyle = '#07090c';
    cctx.fillRect(0, 0, 512, 192);
    // Speed arc
    const cx = 150;
    const cy = 120;
    const r = 84;
    const a0 = Math.PI * 0.8;
    const a1 = Math.PI * 2.2;
    cctx.lineWidth = 10;
    cctx.lineCap = 'round';
    cctx.strokeStyle = '#1e2733';
    cctx.beginPath();
    cctx.arc(cx, cy, r, a0, a1);
    cctx.stroke();
    const f = Math.min(1, speedKmh / 260);
    cctx.strokeStyle = f > 0.8 ? '#ff4d4d' : '#4dd2ff';
    cctx.beginPath();
    cctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * f);
    cctx.stroke();
    cctx.fillStyle = '#e8f6ff';
    cctx.font = 'bold 64px system-ui, sans-serif';
    cctx.textAlign = 'center';
    cctx.fillText(String(Math.round(speedKmh)), cx, cy + 20);
    cctx.font = '20px system-ui, sans-serif';
    cctx.fillStyle = '#7f95a8';
    cctx.fillText('km/h', cx, cy + 50);
    // Nitro bar
    cctx.fillStyle = '#1e2733';
    cctx.fillRect(300, 70, 170, 26);
    cctx.fillStyle = '#ffb703';
    cctx.fillRect(300, 70, 170 * nitroFrac, 26);
    cctx.fillStyle = '#7f95a8';
    cctx.font = '20px system-ui, sans-serif';
    cctx.textAlign = 'left';
    cctx.fillText('NITRO', 300, 62);
    // Shield lamp
    cctx.fillStyle = shield ? '#4dffb8' : '#1e2733';
    cctx.beginPath();
    cctx.arc(320, 140, 14, 0, Math.PI * 2);
    cctx.fill();
    cctx.fillStyle = '#7f95a8';
    cctx.fillText('SHIELD', 345, 148);
    clusterTex.needsUpdate = true;
  }
  updateCluster(0, 0, false);

  // ---- Steering wheel
  const wc = CABIN.wheel;
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(wc.x, wc.y, wc.z);
  wheelGroup.rotation.x = wc.tilt;
  root.add(wheelGroup);
  const wheelSpin = new THREE.Group();
  wheelGroup.add(wheelSpin);
  const leather = mat(0x17171b);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(wc.radius, 0.019, 10, 32), leather);
  wheelSpin.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.04, 20), mat(0x23252b));
  hub.rotation.x = Math.PI / 2;
  wheelSpin.add(hub);
  const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: 0xe63946 }));
  emblem.position.z = 0.0215;
  wheelSpin.add(emblem);
  for (const ang of [0, Math.PI, -Math.PI / 2]) {
    const spoke = box(wc.radius * 0.95, 0.03, 0.014, leather, 0, 0, 0);
    spoke.geometry.translate(wc.radius * 0.475, 0, 0);
    spoke.rotation.z = ang;
    wheelSpin.add(spoke);
  }
  const marker = box(0.022, 0.05, 0.026, new THREE.MeshBasicMaterial({ color: 0xffb703 }), 0, wc.radius, 0);
  wheelSpin.add(marker);
  // Steering column
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.3, 10), darker);
  column.rotation.x = Math.PI / 2;
  column.position.z = -0.17;
  wheelGroup.add(column);

  const wheelHit = new THREE.Mesh(
    new THREE.CircleGeometry(wc.radius * 1.15, 24),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
  );
  wheelGroup.add(wheelHit);

  // ---- Card table panel (center console, driver-oriented)
  const T = CABIN.table;
  const tableGroup = new THREE.Group();
  tableGroup.position.set(T.x, T.y, T.z);
  root.add(tableGroup);
  // The panel is driver-oriented: it faces the driver's eye (like a tilted center stack).
  tableGroup.lookAt(new THREE.Vector3(CABIN.eye.x, CABIN.eye.y, CABIN.eye.z));
  tableGroup.add(box(T.width + 0.1, T.height + 0.1, 0.05, darker, 0, 0, -0.03));
  const felt = new THREE.Mesh(
    new THREE.PlaneGeometry(T.width, T.height),
    new THREE.MeshBasicMaterial({ color: 0x0a2c1e }),
  );
  felt.position.z = 0.0;
  tableGroup.add(felt);
  const tableLeftEdge = new THREE.Object3D();
  tableLeftEdge.position.set(-T.width / 2, 0, 0);
  tableGroup.add(tableLeftEdge);
  const tableRightEdge = new THREE.Object3D();
  tableRightEdge.position.set(T.width / 2, 0, 0);
  tableGroup.add(tableRightEdge);
  // pedestal
  const pedestal = box(0.5, 0.5, 0.4, dark, T.x, 0.5, T.z - 0.12);
  root.add(pedestal);

  const dashEdge = new THREE.Object3D();
  dashEdge.position.set(0, D.topY, D.frontZ);
  root.add(dashEdge);

  const eye = new THREE.Object3D();
  eye.position.set(CABIN.eye.x, CABIN.eye.y, CABIN.eye.z);
  root.add(eye);

  return {
    root,
    eye,
    wheelSpin,
    wheelCenter: wheelGroup,
    wheelHit,
    tableLeftEdge,
    tableRightEdge,
    dashEdge,
    updateCluster,
    dispose() {
      clusterTex.dispose();
      stripTex.dispose();
    },
  };
}
