import * as THREE from 'three';
import { RIVALS } from '../config/gameConfig';
import { randomSeed } from '../core/rng';
import { buildCarMesh, CarMesh } from '../scene/CarMesh';
import { World } from '../scene/World';
import { newTrackPoint } from '../track/Track';

/** Menu background: a camera gliding along a random circuit with a few cars driving ahead. */
export class Showcase {
  readonly world = new World(randomSeed());
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2600);
  private readonly cars: Array<{ mesh: CarMesh; offset: number; lat: number; speed: number }> = [];
  private s = 0;
  private readonly pt = newTrackPoint();
  private readonly look = newTrackPoint();
  private readonly tmp = new THREE.Vector3();

  constructor() {
    RIVALS.slice(0, 4).forEach((r, i) => {
      const mesh = buildCarMesh(r.color);
      this.world.scene.add(mesh.root);
      this.cars.push({ mesh, offset: 26 + i * 16, lat: i % 2 ? 4 : -4, speed: 1 });
    });
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    const track = this.world.track;
    this.s += 24 * dt;
    track.pointAt(this.s, 6.5, this.pt);
    this.camera.position.set(this.pt.x, 3.2, this.pt.z);
    track.pointAt(this.s + 34, -1, this.look);
    this.camera.lookAt(this.look.x, 1.4, this.look.z);

    for (const c of this.cars) {
      track.pointAt(this.s + c.offset, c.lat, this.pt);
      c.mesh.root.position.set(this.pt.x, 0, this.pt.z);
      c.mesh.root.rotation.y = this.pt.heading;
    }
    this.world.followShadow(this.camera.position.x, this.camera.position.z);
    this.world.sky.follow(this.camera.getWorldPosition(this.tmp));
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.world.scene, this.camera);
  }

  dispose(): void {
    this.world.dispose();
  }
}
