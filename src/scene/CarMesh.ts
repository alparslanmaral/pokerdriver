import * as THREE from 'three';

/** Low-poly rival car (model forward = -Z, matching the physics heading). */
export interface CarMesh {
  root: THREE.Group;
  wheels: THREE.Mesh[];
}

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
wheelGeo.rotateZ(Math.PI / 2);
const tireMat = new THREE.MeshLambertMaterial({ color: 0x15161a });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2a38 });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff4c2 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2b2b });

export function buildCarMesh(color: number): CarMesh {
  const root = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color });

  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.3), body);
  lower.position.y = 0.6;
  root.add(lower);

  const cabinMesh = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.5, 2.1), glassMat);
  cabinMesh.position.set(0, 1.1, 0.35);
  root.add(cabinMesh);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.7), body);
  roof.position.set(0, 1.38, 0.35);
  root.add(roof);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.25), body);
  hood.position.set(0, 0.92, -1.45);
  root.add(hood);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.35), body);
  spoiler.position.set(0, 1.2, 2.05);
  root.add(spoiler);
  for (const s of [-0.7, 0.7]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.06), tireMat);
    post.position.set(s, 1.05, 2.05);
    root.add(post);
  }

  for (const s of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.05), lightMat);
    head.position.set(s, 0.72, -2.16);
    root.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.05), tailMat);
    tail.position.set(s, 0.78, 2.16);
    root.add(tail);
  }

  const wheels: THREE.Mesh[] = [];
  for (const [x, z] of [
    [-0.98, -1.35],
    [0.98, -1.35],
    [-0.98, 1.4],
    [0.98, 1.4],
  ]) {
    const w = new THREE.Mesh(wheelGeo, tireMat);
    w.position.set(x, 0.36, z);
    root.add(w);
    wheels.push(w);
  }

  root.traverse((o) => {
    o.castShadow = true;
  });
  return { root, wheels };
}
