import { AI_CONFIG } from '../config/gameConfig';
import { CarStats } from '../config/carStats';
import { clamp, damp } from '../core/math';
import { Track, TrackLocation, TrackPoint, newTrackPoint } from '../track/Track';
import { CarInput, CarState, forwardX, forwardZ, rightX, rightZ, speedOf, steerLimit } from './Car';

export interface Neighbor {
  /** Signed track distance ahead of this car (m, + = ahead). */
  ds: number;
  /** Lateral offset of the neighbor on the track. */
  lateral: number;
}

/**
 * Spline-following driver. Used by the rivals (and by the player's car after the finish line).
 * It could be extended later with a card-using brain; it only produces a CarInput.
 */
export class AIDriver {
  private lane: number;
  private readonly phase: number;
  private readonly target: TrackPoint = newTrackPoint();
  private time = 0;

  constructor(
    private readonly baseLane: number,
    /** 0..1-ish scale on corner speed and top speed. */
    readonly skill: number,
    seed: number,
  ) {
    this.lane = baseLane;
    this.phase = (seed % 1000) / 159;
  }

  update(
    car: CarState,
    loc: TrackLocation,
    track: Track,
    stats: CarStats,
    neighbors: readonly Neighbor[],
    dt: number,
    out: CarInput,
  ): void {
    this.time += dt;
    const speed = speedOf(car);
    const limit = track.halfWidth - 2.6;

    // ---- Lane choice: base lane + gentle wander + avoid cars just ahead
    let wanted = this.baseLane + Math.sin(this.time * 0.35 + this.phase) * 0.9;
    for (const n of neighbors) {
      if (n.ds > 0 && n.ds < 16 && Math.abs(n.lateral - this.lane) < 2.5) {
        const dir = n.lateral > 0 ? -1 : 1;
        wanted = this.lane + dir * 3.4;
        break;
      }
    }
    wanted = clamp(wanted, -limit, limit);
    this.lane = damp(this.lane, wanted, 1.6, dt);

    // ---- Steering: pure pursuit towards a point ahead on the chosen lane
    const lookahead = clamp(7 + speed * 0.55, 10, 48);
    track.pointAt(loc.s + lookahead, this.lane, this.target);
    const dx = this.target.x - car.x;
    const dz = this.target.z - car.z;
    const lf = dx * forwardX(car.heading) + dz * forwardZ(car.heading);
    const lr = dx * rightX(car.heading) + dz * rightZ(car.heading);
    const e = Math.atan2(lr, lf);
    const wheelbase = stats.distFront + stats.distRear;
    const delta = Math.atan((2 * wheelbase * Math.sin(e)) / lookahead);
    out.steer = clamp((delta * 1.35) / steerLimit(stats, speed), -1, 1);

    // ---- Speed planning: slow for corners ahead, respecting braking distance
    const cap = stats.maxSpeed * car.speedScale;
    let targetSpeed = cap;
    const aLat = AI_CONFIG.cornerAccel * this.skill;
    const brake = 19;
    for (let d = 0; d <= 90; d += 10) {
      const k = Math.abs(track.curvatureAt(loc.s + d));
      const vAllowed = Math.sqrt(aLat / Math.max(k, 1e-4));
      const vReach = Math.sqrt(vAllowed * vAllowed + 2 * brake * d);
      if (vReach < targetSpeed) targetSpeed = vReach;
    }
    if (car.offTrack) targetSpeed = Math.min(targetSpeed, 22);

    const err = targetSpeed - speed;
    if (err > 1.5) {
      out.throttle = 1;
      out.brake = 0;
    } else if (err > -1) {
      out.throttle = 0.35;
      out.brake = 0;
    } else {
      out.throttle = 0;
      out.brake = clamp(-err / 7, 0, 1);
    }
    out.handbrake = false;
  }
}
