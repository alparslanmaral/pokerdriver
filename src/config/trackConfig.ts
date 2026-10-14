/** Track generation + scenery tuning. */

export const TRACK = {
  /** Number of Catmull-Rom control points around the loop. */
  controlPoints: 30,
  /** Base radius (m) of the polar shape before harmonics are applied. */
  baseRadius: 300,
  /** Horizontal stretch applied after generation, for more elongated circuits. */
  stretchMin: 1.0,
  stretchMax: 1.45,
  /** Spacing (m) between centerline samples. */
  sampleSpacing: 4,
  /** Half width of the asphalt. */
  halfWidth: 9,
  kerbWidth: 0.9,
  /** Barrier inner face distance from the centerline. */
  wallOffset: 12.6,
  wallThickness: 0.7,
  wallHeight: 1.0,
  /** Tightest allowed centerline curvature radius (m); generator retries until satisfied. */
  minCurveRadius: 56,
  /** Min distance between non-adjacent parts of the loop = this * wallOffset * 2. */
  minSeparationFactor: 1.5,
  maxGenerationAttempts: 80,
  /** Texture repeat lengths (m). */
  roadTexLength: 16,
  kerbBlockLength: 1.6,
  barrierTexLength: 6,
} as const;

export const SCENERY = {
  treeCount: 900,
  buildingCount: 70,
  /** Trees are placed from wallOffset + treeMinGap outwards up to treeMaxDistance. */
  treeMinGap: 4,
  treeMaxDistance: 90,
  buildingMinDistance: 55,
  buildingMaxDistance: 260,
  mountainCount: 18,
  mountainRadius: 1250,
} as const;

export const WORLD = {
  fogNear: 140,
  fogFar: 1300,
  skyTop: 0x2f6fb8,
  skyHorizon: 0xcfe3f2,
  skyBottom: 0x9fb8c8,
  grassColor: '#4f8f3c',
  sunDirection: [0.5, 0.78, 0.38] as [number, number, number],
  shadowRange: 70,
  shadowMapSize: 2048,
} as const;
