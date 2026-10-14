import * as THREE from 'three';
import { CABIN } from '../config/cabinConfig';
import { CAMERA } from '../config/gameConfig';
import { clamp, damp } from '../core/math';

/**
 * First-person camera mounted on the cabin's eye anchor: head sway with acceleration,
 * speed/nitro FOV, and crash shake.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private swayX = 0;
  private swayZ = 0;
  private roll = 0;
  private pitch = 0;
  private shake = 0;
  private fov: number = CAMERA.baseFov;
  private time = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.baseFov, aspect, CAMERA.near, CAMERA.far);
    this.camera.rotation.order = 'YXZ';
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.5, this.shake + amount);
  }

  /**
   * @param accLong longitudinal acceleration (m/s^2, + = speeding up)
   * @param accLat lateral acceleration (m/s^2, + = pushed to the right)
   */
  update(dt: number, speed: number, maxSpeed: number, accLong: number, accLat: number, nitro: boolean): void {
    this.time += dt;
    const k = CAMERA.swaySmoothing;
    const targetZ = clamp(accLong * CAMERA.swayLong, -CAMERA.swayMax, CAMERA.swayMax); // accelerate -> head back (+z)
    const targetX = clamp(-accLat * CAMERA.swayLat, -CAMERA.swayMax, CAMERA.swayMax); // pushed right -> head left
    this.swayZ = damp(this.swayZ, targetZ, k, dt);
    this.swayX = damp(this.swayX, targetX, k, dt);
    this.roll = damp(this.roll, clamp(accLat * CAMERA.rollPerLatAccel, -0.06, 0.06), k, dt);
    this.pitch = damp(this.pitch, clamp(accLong * CAMERA.pitchPerLongAccel, -0.05, 0.05), k, dt);

    this.shake = Math.max(0, this.shake - CAMERA.shakeDecay * dt);
    const sh = this.shake * this.shake * CAMERA.shakeAmount;
    const jx = Math.sin(this.time * 61.3) * sh;
    const jy = Math.sin(this.time * 47.9 + 1.7) * sh;

    const e = CABIN.eye;
    this.camera.position.set(e.x + this.swayX + jx, e.y + jy * 0.7, e.z + this.swayZ);
    this.camera.rotation.set(
      (CABIN.pitchDeg * Math.PI) / 180 + this.pitch + jy * 0.4,
      jx * 0.5,
      -this.roll + jx * 0.4,
    );

    const speedT = clamp(speed / maxSpeed, 0, 1.3);
    const targetFov = CAMERA.baseFov + CAMERA.speedFov * speedT * speedT + (nitro ? CAMERA.nitroFov : 0);
    this.fov = damp(this.fov, targetFov, 4, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
