import * as THREE from 'three';
import { BOXES } from '../config/cardConfig';
import { TRACK } from '../config/trackConfig';
import { Rng } from '../core/rng';
import { Track, newTrackPoint } from '../track/Track';
import { makeBoxFaceTexture } from '../scene/textures';
import { SUIT_SYMBOL } from '../cards/types';

interface Box {
  mesh: THREE.Mesh;
  halo: THREE.Mesh;
  x: number;
  z: number;
  phase: number;
  active: boolean;
  respawnIn: number;
  pop: number;
}

/** Floating rotating card cubes arranged in clusters across the road (Mario-Kart style item boxes). */
export class CardBoxes {
  readonly group = new THREE.Group();
  private readonly boxes: Box[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly materials: THREE.Material[] = [];
  private time = 0;

  constructor(track: Track, rng: Rng) {
    const geo = new THREE.BoxGeometry(BOXES.boxSize, BOXES.boxSize, BOXES.boxSize);
    const haloGeo = new THREE.BoxGeometry(BOXES.boxSize * 1.5, BOXES.boxSize * 1.5, BOXES.boxSize * 1.5);
    const faces: Array<[string, boolean]> = [
      [SUIT_SYMBOL.spades, false],
      [SUIT_SYMBOL.hearts, true],
      [SUIT_SYMBOL.diamonds, true],
      [SUIT_SYMBOL.clubs, false],
      ['A', false],
      ['?', true],
    ];
    const faceMats = faces.map(([sym, red]) => {
      const tex = makeBoxFaceTexture(sym, red);
      this.textures.push(tex);
      const m = new THREE.MeshBasicMaterial({ map: tex });
      this.materials.push(m);
      return m;
    });
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffd34d,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    this.materials.push(haloMat);

    const clusters = Math.max(3, Math.round(track.length / BOXES.clusterSpacing));
    const step = track.length / clusters;
    const pt = newTrackPoint();
    for (let c = 0; c < clusters; c++) {
      const s = (c + 0.5) * step + rng.range(-step * 0.15, step * 0.15);
      // Keep the starting grid clear
      if (s > track.length - 90 || s < 50) continue;
      const layout = rng.pick(BOXES.layouts);
      // Optional diagonal skew so clusters feel hand-placed
      const skew = rng.chance(0.4) ? rng.range(-1, 1) * 4 : 0;
      layout.forEach((lat, i) => {
        const along = skew !== 0 ? (i - (layout.length - 1) / 2) * (skew / layout.length) * 2 : 0;
        track.pointAt(s + along, Math.max(-TRACK.halfWidth + 1.5, Math.min(TRACK.halfWidth - 1.5, lat)), pt);
        const mesh = new THREE.Mesh(geo, faceMats);
        const halo = new THREE.Mesh(haloGeo, haloMat);
        mesh.position.set(pt.x, BOXES.hoverHeight, pt.z);
        halo.position.copy(mesh.position);
        this.group.add(mesh, halo);
        this.boxes.push({ mesh, halo, x: pt.x, z: pt.z, phase: rng.range(0, 6.28), active: true, respawnIn: 0, pop: 1 });
      });
    }
    this.geoms = [geo, haloGeo];
  }

  private geoms: THREE.BufferGeometry[];

  get count(): number {
    return this.boxes.length;
  }

  /** Index of an active box within the pickup radius of (x, z), or -1. */
  findTouching(x: number, z: number): number {
    const r2 = BOXES.pickupRadius * BOXES.pickupRadius;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (!b.active) continue;
      const dx = b.x - x;
      const dz = b.z - z;
      if (dx * dx + dz * dz < r2) return i;
    }
    return -1;
  }

  positionOf(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.boxes[i].x, BOXES.hoverHeight, this.boxes[i].z);
  }

  collect(i: number): void {
    const b = this.boxes[i];
    b.active = false;
    b.respawnIn = BOXES.respawnSeconds;
    b.mesh.visible = false;
    b.halo.visible = false;
  }

  update(dt: number): void {
    this.time += dt;
    for (const b of this.boxes) {
      if (!b.active) {
        b.respawnIn -= dt;
        if (b.respawnIn <= 0) {
          b.active = true;
          b.pop = 0;
          b.mesh.visible = true;
          b.halo.visible = true;
        }
        continue;
      }
      if (b.pop < 1) b.pop = Math.min(1, b.pop + dt * 2.5);
      const popScale = b.pop < 1 ? 1 + Math.sin(b.pop * Math.PI) * 0.25 : 1;
      const k = b.pop * popScale;
      const y = BOXES.hoverHeight + Math.sin(this.time * 2.2 + b.phase) * 0.14;
      b.mesh.position.y = y;
      b.halo.position.y = y;
      b.mesh.rotation.y = this.time * 1.5 + b.phase;
      b.mesh.rotation.x = this.time * 0.7 + b.phase;
      b.halo.rotation.copy(b.mesh.rotation);
      b.mesh.scale.setScalar(k);
      b.halo.scale.setScalar(k * (1 + Math.sin(this.time * 4 + b.phase) * 0.06));
    }
  }

  dispose(): void {
    for (const g of this.geoms) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
