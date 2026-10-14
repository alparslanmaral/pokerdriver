/**
 * Cabin layout. Car-local space: +X = car right, +Y up, -Z = forward. Right-hand drive:
 * the driver (eye + wheel) sits at +X, the card table is in the center console to the left of the wheel.
 */

export const CABIN = {
  eye: { x: 0.4, y: 1.2, z: 0.12 },
  pitchDeg: -3.5,
  wheel: { x: 0.5, y: 0.86, z: -0.64, radius: 0.17, tilt: -0.5 },
  /** The card table panel on the center console. */
  table: { x: -0.2, y: 0.88, z: -0.74, width: 0.64, height: 0.384 },
  dash: { topY: 0.96, frontZ: -1.18, width: 2.0 },
  windshield: { topY: 1.6, topZ: -0.46 },
} as const;

/** Native pixel size of the card table DOM panel (scaled to the projected 3D table at runtime). */
export const TABLE_DOM = { width: 440, height: 264 };
