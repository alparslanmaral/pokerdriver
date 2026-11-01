/**
 * Global game tuning that is not car-physics or card specific.
 * Everything gameplay-related that a future garage/shop/upgrade layer might touch lives in /config.
 */

export const SAVE_KEY = 'pokerracer.save.v1';

export const GAME = {
  laps: 3,
  rivalCount: 5,
  countdownSeconds: 3,
  /** Player start slot on the grid (0 = pole). */
  playerGridSlot: 3,
  /** Seconds after the player crosses the line before the finish screen opens. */
  finishScreenDelay: 2.2,
  maxPixelRatio: 2,
  /** Fixed physics step. */
  physicsHz: 120,
  /** Seconds the player must be stuck before the "press R" hint appears. */
  stuckHintSeconds: 3,
  /** Minimum seconds between two manual resets (R). */
  resetCooldown: 3,
} as const;

/** Money paid out by finishing position (index 0 = 1st). Anything past the array gets PAYOUT_DEFAULT. */
export const PAYOUTS: readonly number[] = [500, 350, 250];
export const PAYOUT_DEFAULT = 100;

export const RIVALS: readonly { name: string; color: number }[] = [
  { name: 'Ace', color: 0xd7263d },
  { name: 'Bluff', color: 0x1b6ca8 },
  { name: 'Kicker', color: 0xf2b705 },
  { name: 'River', color: 0x2e933c },
  { name: 'Shark', color: 0x8e44ad },
  { name: 'Dealer', color: 0xf07818 },
];

export const PLAYER_COLOR = 0xe4572e;

export const AI_CONFIG = {
  /** Lateral lane offsets (m) handed out to the rivals, shuffled per race. */
  laneOffsets: [-5.2, -3.1, -1.0, 1.0, 3.1, 5.2],
  /** Per-rival skill spread: multiplies top speed and cornering limit. */
  skillMin: 0.9,
  skillMax: 0.99,
  /** Max lateral acceleration (m/s^2) AI will plan corner speeds with, before skill scaling. */
  cornerAccel: 17,
  /** Rubber banding: max speed bonus/malus (fraction) and the distance (m) at which it saturates. */
  rubberMax: 0.07,
  rubberDistance: 160,
  /** Seconds standing still before an AI car gets teleported back onto the track. */
  stuckSeconds: 3,
} as const;

export const CAMERA = {
  near: 0.1,
  far: 2600,
  baseFov: 70,
  /** Extra FOV (deg) at max speed. */
  speedFov: 12,
  nitroFov: 8,
  /** Head sway: meters of camera travel per m/s^2 of acceleration. */
  swayLong: 0.0032,
  swayLat: 0.0035,
  swayMax: 0.09,
  /** Head roll (rad) per m/s^2 of lateral accel. */
  rollPerLatAccel: 0.0018,
  /** Pitch (rad) per m/s^2 of longitudinal accel. */
  pitchPerLongAccel: 0.0014,
  swaySmoothing: 7,
  shakeDecay: 3.2,
  shakeAmount: 0.05,
} as const;

export const WHEEL = {
  /** Max wheel rotation in each direction (deg). */
  maxAngleDeg: 270,
  /** Spring stiffness used when the wheel is let go, and its damping ratio (1 = critically damped). */
  springK: 70,
  springDampingRatio: 0.8,
  /** Extra self-aligning spring per m/s of speed. */
  springSpeedK: 0.6,
  /** How fast the wheel turns towards full lock while a steer key / touch button is held (deg/s). */
  turnRateDeg: 330,
  /** Multiplier on the turn rate when steering back against the current wheel angle. */
  counterSteerBoost: 1.6,
  /** Response curve exponent: steer = sign(x) * |x|^exponent. */
  steerExponent: 1.25,
} as const;

export const EFFECTS = {
  /** Cap for the nitro timer (s) – also the full-scale of the HUD bar. */
  nitroMaxSeconds: 20,
  /** Oil slicks. */
  oilDropInterval: 0.28,
  oilLifetime: 14,
  oilRadius: 1.9,
  oilMaxPatches: 64,
  /** Rival effect of touching oil. */
  oilSpeedFactor: 0.55,
  oilSlipSeconds: 1.4,
  oilCooldownPerCar: 2.0,
} as const;

/** Rear-view mirror: a low-res second render of the scene looking backwards. */
export const MIRROR = {
  enabled: true,
  width: 384,
  height: 92,
  /** Vertical FOV (deg) of the rear camera. */
  fov: 22,
  far: 450,
  /** Render the mirror every Nth frame. */
  everyNthFrame: 2,
} as const;
