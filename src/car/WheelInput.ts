import * as THREE from 'three';
import { WHEEL } from '../config/gameConfig';
import { clamp, wrapAngle } from '../core/math';

/**
 * Mouse-driven steering wheel.
 *  - press on the wheel to grab it, drag around the wheel center to rotate it (angle deltas are accumulated),
 *  - release (mouse up, leaving the window, window blur) lets go and the wheel springs back to center.
 * Cards share the same mouse, so grabbing the wheel and picking cards are mutually exclusive by nature.
 */
export class WheelInput {
  /** Wheel angle in radians, + = clockwise (steer right). */
  angle = 0;
  held = false;
  hover = false;
  enabled = true;

  private velocity = 0;
  private lastPointerAngle = 0;
  private readonly centerPx = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly tmp = new THREE.Vector3();
  readonly maxAngle = (WHEEL.maxAngleDeg * Math.PI) / 180;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly hitObject: THREE.Object3D,
    private readonly centerObject: THREE.Object3D,
  ) {}

  attach(): void {
    this.canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('blur', this.release);
    document.documentElement.addEventListener('mouseleave', this.release);
    document.addEventListener('visibilitychange', this.release);
  }

  detach(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('blur', this.release);
    document.documentElement.removeEventListener('mouseleave', this.release);
    document.removeEventListener('visibilitychange', this.release);
    this.canvas.style.cursor = '';
  }

  /** Normalised steering input in [-1, 1] with a response curve for finer control near center. */
  get value(): number {
    const x = clamp(this.angle / this.maxAngle, -1, 1);
    return Math.sign(x) * Math.pow(Math.abs(x), WHEEL.steerExponent);
  }

  /** Raw wheel position in [-1, 1] (linear). */
  get normalized(): number {
    return clamp(this.angle / this.maxAngle, -1, 1);
  }

  /** Advance the spring that re-centers the wheel when it is not held. Call once per physics step. */
  update(dt: number, speed: number): void {
    if (this.held && this.enabled) return;
    const k = WHEEL.springK + WHEEL.springSpeedK * speed * speed * 0.05;
    const c = 2 * WHEEL.springDampingRatio * Math.sqrt(k);
    this.velocity += (-k * this.angle - c * this.velocity) * dt;
    this.angle += this.velocity * dt;
    if (Math.abs(this.angle) < 1e-4 && Math.abs(this.velocity) < 1e-3) {
      this.angle = 0;
      this.velocity = 0;
    }
  }

  /** Update the wheel's projected screen center (client pixels). Call after the camera pose is final. */
  refreshProjection(): void {
    this.centerObject.getWorldPosition(this.tmp);
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    this.tmp.project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    this.centerPx.set(
      rect.left + (this.tmp.x * 0.5 + 0.5) * rect.width,
      rect.top + (-this.tmp.y * 0.5 + 0.5) * rect.height,
    );
  }

  private hitTest(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.intersectObject(this.hitObject, false).length > 0;
  }

  private pointerAngle(clientX: number, clientY: number): number {
    return Math.atan2(clientY - this.centerPx.y, clientX - this.centerPx.x);
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled || e.button !== 0) return;
    this.refreshProjection();
    if (!this.hitTest(e.clientX, e.clientY)) return;
    this.held = true;
    this.velocity = 0;
    this.lastPointerAngle = this.pointerAngle(e.clientX, e.clientY);
    this.canvas.style.cursor = 'grabbing';
    e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    if (this.held) {
      const dx = e.clientX - this.centerPx.x;
      const dy = e.clientY - this.centerPx.y;
      if (dx * dx + dy * dy < WHEEL.deadZonePx * WHEEL.deadZonePx) return;
      const a = this.pointerAngle(e.clientX, e.clientY);
      this.angle = clamp(this.angle + wrapAngle(a - this.lastPointerAngle), -this.maxAngle, this.maxAngle);
      this.lastPointerAngle = a;
      return;
    }
    if (this.enabled && e.target === this.canvas) {
      const over = this.hitTest(e.clientX, e.clientY);
      if (over !== this.hover) {
        this.hover = over;
        this.canvas.style.cursor = over ? 'grab' : '';
      }
    } else if (this.hover) {
      this.hover = false;
      this.canvas.style.cursor = '';
    }
  };

  private onUp = (): void => {
    this.release();
  };

  readonly release = (): void => {
    if (!this.held) return;
    this.held = false;
    this.canvas.style.cursor = this.hover ? 'grab' : '';
  };
}
