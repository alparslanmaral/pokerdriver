import * as THREE from 'three';
import { WORLD } from '../config/trackConfig';
import { Track, generateTrack } from '../track/Track';
import { disposeObject3D } from './dispose';
import { buildScenery } from './Scenery';
import { Sky } from './Sky';
import { buildTrackMesh } from './TrackMesh';

/** Static race environment: sky, fog, lights, track, scenery. Cars and effects are added by the Race. */
export class World {
  readonly scene = new THREE.Scene();
  readonly track: Track;
  readonly sky = new Sky();
  readonly sun: THREE.DirectionalLight;
  private readonly sunOffset = new THREE.Vector3(...WORLD.sunDirection).normalize().multiplyScalar(160);

  constructor(readonly seed: number) {
    this.track = generateTrack(seed);

    this.scene.fog = new THREE.Fog(WORLD.skyHorizon, WORLD.fogNear, WORLD.fogFar);
    this.scene.add(this.sky.mesh);

    const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a6b3c, 1.35);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(WORLD.shadowMapSize, WORLD.shadowMapSize);
    const r = WORLD.shadowRange;
    sun.shadow.camera.left = -r;
    sun.shadow.camera.right = r;
    sun.shadow.camera.top = r;
    sun.shadow.camera.bottom = -r;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 400;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.06;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);

    this.scene.add(buildTrackMesh(this.track));
    this.scene.add(buildScenery(this.track, seed));
  }

  /** Keep the shadow frustum centred on the focus point (snapped to texels to avoid shimmering). */
  followShadow(x: number, z: number): void {
    const texel = (WORLD.shadowRange * 2) / WORLD.shadowMapSize;
    const sx = Math.round(x / texel) * texel;
    const sz = Math.round(z / texel) * texel;
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx + this.sunOffset.x, this.sunOffset.y, sz + this.sunOffset.z);
    this.sun.target.updateMatrixWorld();
  }

  dispose(): void {
    disposeObject3D(this.scene);
    this.sun.shadow.map?.dispose();
  }
}
