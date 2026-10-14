/**
 * Car tuning. The whole arcade model is driven by a CarStats object so that a future
 * garage / upgrade layer can simply hand a different stats object to the physics.
 * Units: meters, seconds, radians. "Accelerations" are m/s^2 (mass is normalised to 1).
 */

export interface CarStats {
  // Longitudinal
  maxSpeed: number;
  accel: number;
  /** Shape of the acceleration taper: 1 - (v/vmax)^power. */
  accelCurvePower: number;
  brakeDecel: number;
  reverseMaxSpeed: number;
  reverseAccel: number;
  dragLinear: number;
  dragQuad: number;
  rolling: number;
  // Geometry (bicycle model)
  distFront: number; // CG -> front axle
  distRear: number; // CG -> rear axle
  yawInertia: number;
  yawDamping: number;
  // Lateral grip
  gripFront: number;
  gripRear: number;
  stiffnessFront: number;
  stiffnessRear: number;
  /** Pacejka-like shape factor; higher = grip falls off more after the peak. */
  slideShape: number;
  // Steering
  steerLow: number; // max wheel angle (rad) at standstill
  steerHigh: number; // max wheel angle at steerSpeedRef
  steerSpeedRef: number;
  steerResponse: number; // smoothing rate (1/s)
  // Handbrake
  handbrakeRearGrip: number; // multiplier on rear grip while pulled
  handbrakeDecel: number;
  // Surfaces
  offTrackGripMul: number;
  offTrackSpeedMul: number;
  offTrackDrag: number;
  // Nitro
  nitroAccelMul: number;
  nitroSpeedMul: number;
  // Collision shape
  halfWidth: number;
  halfLength: number;
}

export const DEFAULT_CAR_STATS: CarStats = {
  maxSpeed: 61,
  accel: 17,
  accelCurvePower: 2.2,
  brakeDecel: 30,
  reverseMaxSpeed: 12,
  reverseAccel: 9,
  dragLinear: 0.04,
  dragQuad: 0.00045,
  rolling: 0.25,

  distFront: 1.3,
  distRear: 1.4,
  yawInertia: 2.4,
  yawDamping: 0.9,

  gripFront: 22,
  gripRear: 24,
  stiffnessFront: 62,
  stiffnessRear: 68,
  slideShape: 1.4,

  steerLow: 0.55,
  steerHigh: 0.07,
  steerSpeedRef: 52,
  steerResponse: 14,

  handbrakeRearGrip: 0.5,
  handbrakeDecel: 9,

  offTrackGripMul: 0.62,
  offTrackSpeedMul: 0.55,
  offTrackDrag: 0.35,

  nitroAccelMul: 1.7,
  nitroSpeedMul: 1.28,

  halfWidth: 0.95,
  halfLength: 2.15,
};

/** Rivals share the default stats; skill scales the top speed. */
export function makeRivalStats(skill: number): CarStats {
  return { ...DEFAULT_CAR_STATS, maxSpeed: DEFAULT_CAR_STATS.maxSpeed * skill * 0.97 };
}

/** World-level physics constants that are not per-car. */
export const PHYSICS = {
  /** Speed (m/s) under which tire slip is computed against this floor value to avoid singularities. */
  minSlipSpeed: 2.2,
  /** Oil makes the tires slippery. */
  oilGripMul: 0.3,
  // Walls
  wallRestitution: 0.38,
  /** Fraction of tangential speed lost on a full-force wall hit. */
  wallTangentLoss: 0.35,
  /** Continuous speed loss (1/s) while scraping a wall. */
  wallScrapeDrag: 1.6,
  /** How strongly a wall hit turns the car parallel to the wall (0..1). */
  wallAlign: 0.5,
  // Car-to-car
  carRestitution: 0.3,
  carPush: 1.0,
  carCircleRadius: 1.0,
  carCircleOffset: 1.15,
  // Crashes
  /** Closing speed (m/s) above which an impact is a "hard crash". */
  hardCrashSpeed: 10.5,
  /** Seconds after a hard crash during which no new hard crash can fire. */
  hardCrashCooldown: 0.8,
};
