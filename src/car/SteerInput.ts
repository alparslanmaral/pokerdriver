import { WHEEL } from '../config/gameConfig';
import { clamp } from '../core/math';

/**
 * Digital steering (A/D, arrow keys or on-screen touch buttons) driving the 3D wheel.
 *  - while a direction is held the wheel turns towards full lock at a fixed rate,
 *  - when nothing is held a damped spring returns it to center, so the car straightens.
 */
export class SteerInput {
  /** Wheel angle in radians, + = clockwise (steer right). */
  angle = 0;
  /** Requested direction: -1 = left, 0 = none, +1 = right. */
  direction = 0;

  private velocity = 0;
  readonly maxAngle = (WHEEL.maxAngleDeg * Math.PI) / 180;
  private readonly turnRate = (WHEEL.turnRateDeg * Math.PI) / 180;

  /** Normalised steering input in [-1, 1] with a response curve for finer control near center. */
  get value(): number {
    const x = clamp(this.angle / this.maxAngle, -1, 1);
    return Math.sign(x) * Math.pow(Math.abs(x), WHEEL.steerExponent);
  }

  /** Advance the wheel. Call once per physics step. */
  update(dt: number, speed: number): void {
    if (this.direction !== 0) {
      const target = this.direction * this.maxAngle;
      // Turning against the current angle (counter-steer) is faster so quick corrections feel snappy
      const opposing = Math.sign(target) !== Math.sign(this.angle) && this.angle !== 0;
      const step = this.turnRate * (opposing ? WHEEL.counterSteerBoost : 1) * dt;
      this.angle += clamp(target - this.angle, -step, step);
      this.velocity = 0;
      return;
    }
    const k = WHEEL.springK + WHEEL.springSpeedK * speed * speed * 0.05;
    const c = 2 * WHEEL.springDampingRatio * Math.sqrt(k);
    this.velocity += (-k * this.angle - c * this.velocity) * dt;
    this.angle += this.velocity * dt;
    if (Math.abs(this.angle) < 1e-4 && Math.abs(this.velocity) < 1e-3) {
      this.angle = 0;
      this.velocity = 0;
    }
  }

  /** Drop any held direction (pause, finish, focus loss). */
  release(): void {
    this.direction = 0;
  }
}
