import { CarStats, PHYSICS } from '../config/carStats';
import { clamp, smoothstep, sign } from '../core/math';

/**
 * Arcade car model: a bicycle model with a saturating tire curve (slip angle based),
 * a tapered acceleration curve, handbrake drifting and surface modifiers.
 * Deterministic: only depends on state, input, stats and the fixed dt.
 *
 * Frame convention (shared with Track): forward = (-sin h, -cos h), right = (cos h, -sin h).
 * yawRate > 0 turns the nose to the left; steer input > 0 steers to the right.
 */

export interface CarInput {
  throttle: number; // 0..1
  brake: number; // 0..1 (reverse when stopped)
  steer: number; // -1..1, + = right
  handbrake: boolean;
}

export function neutralInput(): CarInput {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false };
}

export interface CarState {
  x: number;
  z: number;
  heading: number;
  /** Velocity along the car's forward axis (m/s). */
  vLong: number;
  /** Velocity along the car's right axis (m/s). */
  vLat: number;
  yawRate: number;
  /** Smoothed front wheel angle (rad, + = right). */
  steerAngle: number;
  // Timed effects (seconds remaining)
  nitroTime: number;
  shieldTime: number;
  slowTime: number;
  slowFactor: number;
  oilTime: number;
  // Surface (set by the race before each step)
  offTrack: boolean;
  // Telemetry
  accLong: number;
  accLat: number;
  rearSlip: number;
  drifting: boolean;
  /** Speed multiplier applied on top of stats (rubber banding). */
  speedScale: number;
}

export function createCarState(): CarState {
  return {
    x: 0,
    z: 0,
    heading: 0,
    vLong: 0,
    vLat: 0,
    yawRate: 0,
    steerAngle: 0,
    nitroTime: 0,
    shieldTime: 0,
    slowTime: 0,
    slowFactor: 1,
    oilTime: 0,
    offTrack: false,
    accLong: 0,
    accLat: 0,
    rearSlip: 0,
    drifting: false,
    speedScale: 1,
  };
}

export function forwardX(h: number): number {
  return -Math.sin(h);
}
export function forwardZ(h: number): number {
  return -Math.cos(h);
}
export function rightX(h: number): number {
  return Math.cos(h);
}
export function rightZ(h: number): number {
  return -Math.sin(h);
}

export function speedOf(c: CarState): number {
  return Math.hypot(c.vLong, c.vLat);
}

/** Maximum front wheel angle (rad) at the given speed. */
export function steerLimit(stats: CarStats, speed: number): number {
  const t = smoothstep(0, stats.steerSpeedRef, speed);
  return stats.steerLow + (stats.steerHigh - stats.steerLow) * Math.pow(t, 0.7);
}

/** Pacejka-lite lateral force: linear around zero, peaking at `peak`, falling off beyond. */
function tireForce(alpha: number, stiffness: number, peak: number, shape: number): number {
  const b = stiffness / (peak * shape);
  return peak * Math.sin(shape * Math.atan(b * alpha));
}

export function stepCar(c: CarState, input: CarInput, stats: CarStats, dt: number): void {
  const nitro = c.nitroTime > 0;
  const slowMul = c.slowTime > 0 ? c.slowFactor : 1;
  const oil = c.oilTime > 0;

  let vF = c.vLong;
  const vR = c.vLat;
  const w = c.yawRate;

  const gripMul = (c.offTrack ? stats.offTrackGripMul : 1) * (oil ? PHYSICS.oilGripMul : 1);
  const maxSpeed =
    stats.maxSpeed * c.speedScale * (nitro ? stats.nitroSpeedMul : 1) * slowMul * (c.offTrack ? stats.offTrackSpeedMul : 1);

  // ---- Steering (smoothed, speed sensitive)
  const speed = Math.hypot(vF, vR);
  const steerTarget = clamp(input.steer, -1, 1) * steerLimit(stats, speed);
  c.steerAngle += (steerTarget - c.steerAngle) * (1 - Math.exp(-stats.steerResponse * dt));
  const delta = c.steerAngle;

  // ---- Longitudinal forces
  let aL = 0;
  if (input.throttle > 0) {
    if (vF > -1) {
      const r = Math.max(0, vF) / maxSpeed;
      const taper = r >= 1 ? 0 : 1 - Math.pow(r, stats.accelCurvePower);
      aL += input.throttle * stats.accel * (nitro ? stats.nitroAccelMul : 1) * slowMul * taper;
    } else {
      aL += input.throttle * stats.brakeDecel; // throttle while rolling backwards = brake
    }
  }
  if (input.brake > 0) {
    if (vF > 0.8) aL -= input.brake * stats.brakeDecel;
    else if (vF > -stats.reverseMaxSpeed) aL -= input.brake * stats.reverseAccel;
  }
  if (vF > maxSpeed) aL -= (vF - maxSpeed) * 2.5;

  // Drag / rolling resistance
  aL -= stats.dragLinear * vF + stats.dragQuad * Math.abs(vF) * vF;
  if (c.offTrack) aL -= stats.offTrackDrag * vF;
  aL -= sign(vF) * stats.rolling * Math.min(1, Math.abs(vF));

  if (input.handbrake && Math.abs(vF) > 0.5) aL -= sign(vF) * stats.handbrakeDecel;

  // ---- Lateral tire forces (accelerations)
  const slipSpeed = Math.max(Math.abs(vF), PHYSICS.minSlipSpeed);
  const frontLat = vR - w * stats.distFront;
  const rearLat = vR + w * stats.distRear;
  const alphaF = Math.atan2(frontLat - vF * Math.tan(delta), slipSpeed);
  const alphaR = Math.atan2(rearLat, slipSpeed);

  const rearGripMul = input.handbrake ? stats.handbrakeRearGrip : 1;
  const peakF = stats.gripFront * gripMul;
  const peakR = stats.gripRear * gripMul * rearGripMul;
  const Ff = -tireForce(alphaF, stats.stiffnessFront * gripMul, peakF, stats.slideShape);
  const Fr = -tireForce(alphaR, stats.stiffnessRear * gripMul * rearGripMul, peakR, stats.slideShape);

  // Front force is perpendicular to the steered wheel: split into body lateral / longitudinal parts
  const cosD = Math.cos(delta);
  const sinD = Math.sin(delta);
  const aR = Ff * cosD + Fr;
  aL -= Ff * sinD * 0.6;

  const torque = (-stats.distFront * Ff * cosD + stats.distRear * Fr) / stats.yawInertia;

  // ---- Integrate (body frame, includes frame-rotation coupling terms)
  const dvF = aL - w * vR;
  const dvR = aR + w * vF;
  let newVF = vF + dvF * dt;
  const newVR = vR + dvR * dt;
  c.yawRate = w + (torque - w * stats.yawDamping) * dt;

  // Don't let friction flip the sign when coasting to a stop
  if (input.throttle === 0 && input.brake === 0 && ((vF > 0 && newVF < 0) || (vF < 0 && newVF > 0))) newVF = 0;
  vF = newVF;

  c.accLong = dvF;
  c.accLat = aR;
  c.vLong = vF;
  c.vLat = newVR;

  // ---- Pose
  c.heading += c.yawRate * dt;
  const fx = forwardX(c.heading);
  const fz = forwardZ(c.heading);
  const rx = rightX(c.heading);
  const rz = rightZ(c.heading);
  c.x += (fx * c.vLong + rx * c.vLat) * dt;
  c.z += (fz * c.vLong + rz * c.vLat) * dt;

  // ---- Telemetry + timers
  c.rearSlip = Math.abs(alphaR);
  c.drifting = c.rearSlip > 0.2 && speed > 7;
  if (c.nitroTime > 0) c.nitroTime = Math.max(0, c.nitroTime - dt);
  if (c.shieldTime > 0) c.shieldTime = Math.max(0, c.shieldTime - dt);
  if (c.slowTime > 0) c.slowTime = Math.max(0, c.slowTime - dt);
  if (c.oilTime > 0) c.oilTime = Math.max(0, c.oilTime - dt);
}

/** World-space velocity helpers (used by collisions). */
export function worldVelocity(c: CarState, out: { x: number; z: number }): void {
  const fx = forwardX(c.heading);
  const fz = forwardZ(c.heading);
  const rx = rightX(c.heading);
  const rz = rightZ(c.heading);
  out.x = fx * c.vLong + rx * c.vLat;
  out.z = fz * c.vLong + rz * c.vLat;
}

export function setWorldVelocity(c: CarState, vx: number, vz: number): void {
  const fx = forwardX(c.heading);
  const fz = forwardZ(c.heading);
  const rx = rightX(c.heading);
  const rz = rightZ(c.heading);
  c.vLong = vx * fx + vz * fz;
  c.vLat = vx * rx + vz * rz;
}
