import * as THREE from 'three';
import { TRACK, WORLD } from '../config/trackConfig';
import { Track, newTrackPoint } from '../track/Track';
import {
  makeBannerTexture,
  makeBarrierTexture,
  makeCheckerTexture,
  makeGrassTexture,
  makeGravelTexture,
  makeKerbTexture,
  makeRoadTexture,
} from './textures';

interface ProfilePoint {
  lat: number;
  y: number;
  u: number;
}

/**
 * Sweep a two-point cross-section along the whole closed track. Each face owns its vertices
 * (hard edges). v is arc length divided by `vLength`.
 */
function buildStrip(track: Track, faces: Array<[ProfilePoint, ProfilePoint]>, vLength: number): THREE.BufferGeometry {
  const n = track.count;
  const perFace = (n + 1) * 2;
  const positions = new Float32Array(faces.length * perFace * 3);
  const uvs = new Float32Array(faces.length * perFace * 2);
  const indices: number[] = [];
  const pt = newTrackPoint();

  faces.forEach((face, f) => {
    const base = f * perFace;
    for (let i = 0; i <= n; i++) {
      const s = i * track.spacing;
      track.pointAt(i === n ? 0 : s, 0, pt);
      for (let k = 0; k < 2; k++) {
        const p = face[k];
        const vi = base + i * 2 + k;
        positions[vi * 3] = pt.x + pt.rx * p.lat;
        positions[vi * 3 + 1] = p.y;
        positions[vi * 3 + 2] = pt.z + pt.rz * p.lat;
        uvs[vi * 2] = p.u;
        uvs[vi * 2 + 1] = s / vLength;
      }
      if (i < n) {
        const a = base + i * 2;
        const b = a + 1;
        const a2 = a + 2;
        const b2 = a + 3;
        indices.push(a, b, a2, b, b2, a2);
      }
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function flatFace(latA: number, latB: number, y: number, uA: number, uB: number): [ProfilePoint, ProfilePoint] {
  return latA < latB
    ? [
        { lat: latA, y, u: uA },
        { lat: latB, y, u: uB },
      ]
    : [
        { lat: latB, y, u: uB },
        { lat: latA, y, u: uA },
      ];
}

/** Visual representation of the circuit: road, kerbs, shoulders, barriers, start line and gantry. */
export function buildTrackMesh(track: Track): THREE.Group {
  const group = new THREE.Group();
  group.name = 'track';
  const hw = TRACK.halfWidth;
  const kw = TRACK.kerbWidth;
  const wo = TRACK.wallOffset;

  // Ground
  const grassTex = makeGrassTexture(WORLD.grassColor);
  grassTex.repeat.set(900, 900);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(5400, 5400),
    new THREE.MeshLambertMaterial({ map: grassTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.12;
  ground.receiveShadow = true;
  group.add(ground);

  // Road
  const roadMat = new THREE.MeshLambertMaterial({ map: makeRoadTexture() });
  roadMat.polygonOffset = true;
  roadMat.polygonOffsetFactor = -1;
  roadMat.polygonOffsetUnits = -1;
  const road = new THREE.Mesh(buildStrip(track, [flatFace(-hw, hw, 0, 0, 1)], TRACK.roadTexLength), roadMat);
  road.receiveShadow = true;
  group.add(road);

  // Kerbs (both sides)
  const kerbTex = makeKerbTexture();
  const kerbMat = new THREE.MeshLambertMaterial({ map: kerbTex });
  kerbMat.polygonOffset = true;
  kerbMat.polygonOffsetFactor = -2;
  kerbMat.polygonOffsetUnits = -2;
  const kerbGeo = buildStrip(
    track,
    [flatFace(hw, hw + kw, 0.025, 0, 1), flatFace(-hw - kw, -hw, 0.025, 0, 1)],
    TRACK.kerbBlockLength * 2,
  );
  const kerbs = new THREE.Mesh(kerbGeo, kerbMat);
  kerbs.receiveShadow = true;
  group.add(kerbs);

  // Gravel shoulders between the kerb and the barrier
  const gravelTex = makeGravelTexture();
  const gravelMat = new THREE.MeshLambertMaterial({ map: gravelTex });
  gravelMat.polygonOffset = true;
  gravelMat.polygonOffsetFactor = -1;
  gravelMat.polygonOffsetUnits = -1;
  const shoulderW = wo - hw - kw;
  const gravelGeo = buildStrip(
    track,
    [flatFace(hw + kw, wo, -0.03, 0, shoulderW / 4), flatFace(-wo, -hw - kw, -0.03, 0, shoulderW / 4)],
    4,
  );
  const gravel = new THREE.Mesh(gravelGeo, gravelMat);
  gravel.receiveShadow = true;
  group.add(gravel);

  // Barriers
  const barrierFaces: Array<[ProfilePoint, ProfilePoint]> = [];
  const h = TRACK.wallHeight;
  const th = TRACK.wallThickness;
  for (const side of [1, -1]) {
    barrierFaces.push([
      { lat: side * wo, y: 0, u: 0 },
      { lat: side * wo, y: h, u: 1 },
    ]);
    barrierFaces.push([
      { lat: side * wo, y: h, u: 0.12 },
      { lat: side * (wo + th), y: h, u: 0.12 },
    ]);
    barrierFaces.push([
      { lat: side * (wo + th), y: h, u: 1 },
      { lat: side * (wo + th), y: 0, u: 0 },
    ]);
  }
  const barrierMat = new THREE.MeshLambertMaterial({ map: makeBarrierTexture(), side: THREE.DoubleSide });
  const barriers = new THREE.Mesh(buildStrip(track, barrierFaces, TRACK.barrierTexLength), barrierMat);
  barriers.castShadow = true;
  barriers.receiveShadow = true;
  group.add(barriers);

  // Start / finish line + gantry
  const start = newTrackPoint();
  track.pointAt(0, 0, start);
  const startGroup = new THREE.Group();
  startGroup.position.set(start.x, 0, start.z);
  startGroup.rotation.y = start.heading;
  group.add(startGroup);

  const lineMat = new THREE.MeshBasicMaterial({ map: makeCheckerTexture() });
  lineMat.polygonOffset = true;
  lineMat.polygonOffsetFactor = -3;
  lineMat.polygonOffsetUnits = -3;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 3), lineMat);
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.035;
  startGroup.add(line);

  const postMat = new THREE.MeshLambertMaterial({ color: 0x30343c });
  const gantryY = 7.2;
  for (const side of [1, -1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, gantryY, 8), postMat);
    post.position.set(side * (wo + 1.6), gantryY / 2, 0);
    post.castShadow = true;
    startGroup.add(post);
  }
  const beamW = (wo + 1.6) * 2;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(beamW, 1.5, 0.7), postMat);
  beam.position.set(0, gantryY, 0);
  beam.castShadow = true;
  startGroup.add(beam);
  const bannerMat = new THREE.MeshBasicMaterial({ map: makeBannerTexture('START / FINISH') });
  for (const dir of [1, -1]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(beamW * 0.62, 1.3), bannerMat);
    banner.position.set(0, gantryY, dir * 0.36);
    if (dir === -1) banner.rotation.y = Math.PI;
    startGroup.add(banner);
  }

  return group;
}
