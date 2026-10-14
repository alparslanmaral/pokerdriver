import * as THREE from 'three';
import { Rng } from '../core/rng';
import { SCENERY, TRACK } from '../config/trackConfig';
import { Track, newTrackPoint } from '../track/Track';
import { makeWindowTexture } from './textures';

/** Low-poly roadside scenery: pines, round trees, buildings and far mountains (all instanced). */
export function buildScenery(track: Track, seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'scenery';
  const rng = new Rng(seed ^ 0x9e3779b9);
  const pt = newTrackPoint();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // ---- Candidate placement helper
  const minTreeDist = TRACK.wallOffset + SCENERY.treeMinGap;
  function place(minDist: number, maxDist: number): { x: number; z: number } | null {
    for (let attempt = 0; attempt < 12; attempt++) {
      const s = rng.range(0, track.length);
      const side = rng.chance(0.5) ? 1 : -1;
      const lat = side * (TRACK.wallOffset + rng.range(minDist, maxDist));
      track.pointAt(s, lat, pt);
      if (track.distanceToCenterline(pt.x, pt.z) >= TRACK.wallOffset + minDist * 0.9) return { x: pt.x, z: pt.z };
    }
    return null;
  }

  // ---- Trees
  const pineCount = Math.floor(SCENERY.treeCount * 0.6);
  const roundCount = SCENERY.treeCount - pineCount;

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6);
  trunkGeo.translate(0, 1.1, 0);
  const pineGeoA = new THREE.ConeGeometry(2.1, 3.6, 7);
  pineGeoA.translate(0, 3.6, 0);
  const pineGeoB = new THREE.ConeGeometry(1.5, 3.0, 7);
  pineGeoB.translate(0, 5.6, 0);
  const roundGeo = new THREE.IcosahedronGeometry(2.0, 0);
  roundGeo.translate(0, 4.0, 0);

  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, SCENERY.treeCount);
  const pinesA = new THREE.InstancedMesh(pineGeoA, leafMat, pineCount);
  const pinesB = new THREE.InstancedMesh(pineGeoB, leafMat, pineCount);
  const rounds = new THREE.InstancedMesh(roundGeo, leafMat, roundCount);

  let ti = 0;
  let pi = 0;
  let ri = 0;
  for (let i = 0; i < SCENERY.treeCount; i++) {
    const p = place(minTreeDist - TRACK.wallOffset, SCENERY.treeMaxDistance);
    if (!p) continue;
    const scale = rng.range(0.8, 1.7);
    const isPine = i < pineCount;
    dummy.position.set(p.x, -0.05, p.z);
    dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
    dummy.scale.set(scale, scale * rng.range(0.9, 1.25), scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(ti++, dummy.matrix);
    if (isPine) {
      color.setHSL(rng.range(0.28, 0.38), rng.range(0.4, 0.6), rng.range(0.18, 0.3));
      pinesA.setMatrixAt(pi, dummy.matrix);
      pinesA.setColorAt(pi, color);
      pinesB.setMatrixAt(pi, dummy.matrix);
      pinesB.setColorAt(pi, color);
      pi++;
    } else {
      color.setHSL(rng.range(0.18, 0.34), rng.range(0.45, 0.65), rng.range(0.28, 0.4));
      rounds.setMatrixAt(ri, dummy.matrix);
      rounds.setColorAt(ri, color);
      ri++;
    }
  }
  trunks.count = ti;
  pinesA.count = pi;
  pinesB.count = pi;
  rounds.count = ri;
  for (const m of [trunks, pinesA, pinesB, rounds]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = true;
    m.receiveShadow = false;
    m.frustumCulled = false;
    group.add(m);
  }

  // ---- Buildings (three height classes, each its own instanced mesh with window texture)
  const classes = [
    { h: 10, wall: '#b9a58b', seed: 1 },
    { h: 22, wall: '#9aa6b2', seed: 2 },
    { h: 40, wall: '#8795a8', seed: 3 },
  ];
  const buildCount = SCENERY.buildingCount;
  const perClass = Math.ceil(buildCount / classes.length);
  for (const cls of classes) {
    const tex = makeWindowTexture(cls.seed, cls.wall);
    tex.repeat.set(3, cls.h / 6);
    const geo = new THREE.BoxGeometry(1, cls.h, 1);
    geo.translate(0, cls.h / 2, 0);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.InstancedMesh(geo, mat, perClass);
    let n = 0;
    for (let i = 0; i < perClass; i++) {
      const p = place(SCENERY.buildingMinDistance, SCENERY.buildingMaxDistance);
      if (!p) continue;
      dummy.position.set(p.x, -0.05, p.z);
      dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      dummy.scale.set(rng.range(12, 26), 1, rng.range(12, 26));
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // ---- Mountains on the horizon
  const mountainMat = new THREE.MeshLambertMaterial({ color: 0x6f86a0, flatShading: true });
  const cx = (Math.min(...track.xs) + Math.max(...track.xs)) / 2;
  const cz = (Math.min(...track.zs) + Math.max(...track.zs)) / 2;
  for (let i = 0; i < SCENERY.mountainCount; i++) {
    const a = (i / SCENERY.mountainCount) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const r = SCENERY.mountainRadius * rng.range(0.9, 1.15);
    const height = rng.range(180, 420);
    const m = new THREE.Mesh(new THREE.ConeGeometry(rng.range(180, 320), height, 6 + rng.int(0, 2)), mountainMat);
    m.position.set(cx + Math.cos(a) * r, height / 2 - 4, cz + Math.sin(a) * r);
    m.rotation.y = rng.range(0, Math.PI);
    group.add(m);
  }

  return group;
}
