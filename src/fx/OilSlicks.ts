import * as THREE from 'three';
import { EFFECTS } from '../config/gameConfig';

/** Oil patches dropped behind the player by the Straight reward. Rivals driving over them lose speed. */
export class OilSlicks {
  readonly mesh: THREE.InstancedMesh;
  private readonly xs = new Float32Array(EFFECTS.oilMaxPatches);
  private readonly zs = new Float32Array(EFFECTS.oilMaxPatches);
  private readonly expire = new Float32Array(EFFECTS.oilMaxPatches);
  private next = 0;
  private readonly dummy = new THREE.Object3D();

  constructor() {
    const geo = new THREE.CircleGeometry(EFFECTS.oilRadius, 18);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x07060d,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, EFFECTS.oilMaxPatches);
    this.mesh.frustumCulled = false;
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    for (let i = 0; i < EFFECTS.oilMaxPatches; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.expire[i] = -1;
    }
  }

  spawn(x: number, z: number, now: number): void {
    const i = this.next;
    this.next = (this.next + 1) % EFFECTS.oilMaxPatches;
    this.xs[i] = x;
    this.zs[i] = z;
    this.expire[i] = now + EFFECTS.oilLifetime;
    const s = 0.8 + Math.random() * 0.5;
    this.dummy.position.set(x, 0.045, z);
    this.dummy.scale.set(s, 1, s);
    this.dummy.rotation.y = Math.random() * 6;
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Hide expired patches. */
  update(now: number): void {
    let dirty = false;
    for (let i = 0; i < EFFECTS.oilMaxPatches; i++) {
      if (this.expire[i] > 0 && now > this.expire[i]) {
        this.expire[i] = -1;
        this.dummy.position.set(0, -10, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        dirty = true;
      }
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** True if the point touches a live patch. */
  hits(x: number, z: number, radius: number): boolean {
    const r = radius + EFFECTS.oilRadius * 0.85;
    const r2 = r * r;
    for (let i = 0; i < EFFECTS.oilMaxPatches; i++) {
      if (this.expire[i] < 0) continue;
      const dx = this.xs[i] - x;
      const dz = this.zs[i] - z;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
