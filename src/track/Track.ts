import * as THREE from 'three';
import { TRACK } from '../config/trackConfig';
import { Rng } from '../core/rng';
import { clamp, wrapAngle } from '../core/math';

/**
 * Closed circuit centerline data. All gameplay systems (AI, lap counting, ranking, walls,
 * card boxes) use this class; the visual mesh lives in scene/TrackMesh.ts.
 *
 * Conventions: heading h means forward = (-sin h, -cos h), right = (cos h, -sin h);
 * positive heading change = left turn; positive lateral offset = right of the centerline
 * (looking along the direction of travel).
 */

export interface TrackLocation {
  /** Index of the segment start sample. */
  index: number;
  /** Position along the segment [0..1). */
  t: number;
  /** Arc length from the start/finish line [0..length). */
  s: number;
  /** Signed offset from the centerline (+ = right). */
  lateral: number;
  /** Distance to the centerline. */
  dist: number;
}

export interface TrackPoint {
  x: number;
  z: number;
  heading: number;
  /** Forward tangent. */
  tx: number;
  tz: number;
  /** Right normal. */
  rx: number;
  rz: number;
}

export function newLocation(): TrackLocation {
  return { index: 0, t: 0, s: 0, lateral: 0, dist: 0 };
}

export function newTrackPoint(): TrackPoint {
  return { x: 0, z: 0, heading: 0, tx: 0, tz: 0, rx: 0, rz: 0 };
}

export class Track {
  readonly count: number;
  readonly length: number;
  /** Real distance between consecutive samples. */
  readonly spacing: number;
  readonly xs: Float32Array;
  readonly zs: Float32Array;
  readonly txs: Float32Array;
  readonly tzs: Float32Array;
  readonly headings: Float32Array;
  /** Signed curvature (1/m), positive = left. */
  readonly curvature: Float32Array;
  readonly halfWidth = TRACK.halfWidth;
  readonly wallOffset = TRACK.wallOffset;

  constructor(
    points: THREE.Vector3[],
    length: number,
    readonly seed: number,
  ) {
    const n = points.length;
    this.count = n;
    this.length = length;
    this.spacing = length / n;
    this.xs = new Float32Array(n);
    this.zs = new Float32Array(n);
    this.txs = new Float32Array(n);
    this.tzs = new Float32Array(n);
    this.headings = new Float32Array(n);
    this.curvature = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.xs[i] = points[i].x;
      this.zs[i] = points[i].z;
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = this.xs[j] - this.xs[i];
      const dz = this.zs[j] - this.zs[i];
      const len = Math.hypot(dx, dz) || 1;
      this.txs[i] = dx / len;
      this.tzs[i] = dz / len;
      this.headings[i] = Math.atan2(-this.txs[i], -this.tzs[i]);
    }
    const w = 3;
    for (let i = 0; i < n; i++) {
      const a = this.headings[(i - w + n) % n];
      const b = this.headings[(i + w) % n];
      this.curvature[i] = wrapAngle(b - a) / (2 * w * this.spacing);
    }
  }

  private wrapS(s: number): number {
    s %= this.length;
    return s < 0 ? s + this.length : s;
  }

  /** Interpolated centerline point (plus an optional lateral offset) at arc length s. */
  pointAt(s: number, lateral: number, out: TrackPoint): TrackPoint {
    s = this.wrapS(s);
    const f = s / this.spacing;
    const i = Math.floor(f) % this.count;
    const j = (i + 1) % this.count;
    const t = f - Math.floor(f);
    let tx = this.txs[i] * (1 - t) + this.txs[j] * t;
    let tz = this.tzs[i] * (1 - t) + this.tzs[j] * t;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    out.tx = tx;
    out.tz = tz;
    out.rx = -tz;
    out.rz = tx;
    out.heading = Math.atan2(-tx, -tz);
    const cx = this.xs[i] + (this.xs[j] - this.xs[i]) * t;
    const cz = this.zs[i] + (this.zs[j] - this.zs[i]) * t;
    out.x = cx + out.rx * lateral;
    out.z = cz + out.rz * lateral;
    return out;
  }

  curvatureAt(s: number): number {
    s = this.wrapS(s);
    const f = s / this.spacing;
    const i = Math.floor(f) % this.count;
    const j = (i + 1) % this.count;
    const t = f - Math.floor(f);
    return this.curvature[i] * (1 - t) + this.curvature[j] * t;
  }

  /**
   * Project a world position onto the centerline. `hint` (previous index) keeps the search local
   * and avoids jumping to another part of the loop where it passes nearby.
   */
  locate(x: number, z: number, hint: number, out: TrackLocation): TrackLocation {
    const n = this.count;
    let bestD2 = Infinity;
    let bestI = hint;
    let bestT = 0;
    const W = 14;
    for (let k = -W; k <= W; k++) {
      const i = (hint + k + n) % n;
      const res = this.segmentDistance(i, x, z);
      if (res.d2 < bestD2) {
        bestD2 = res.d2;
        bestI = i;
        bestT = res.t;
      }
    }
    if (bestD2 > 30 * 30) {
      for (let i = 0; i < n; i++) {
        const res = this.segmentDistance(i, x, z);
        if (res.d2 < bestD2) {
          bestD2 = res.d2;
          bestI = i;
          bestT = res.t;
        }
      }
    }
    const j = (bestI + 1) % n;
    const cx = this.xs[bestI] + (this.xs[j] - this.xs[bestI]) * bestT;
    const cz = this.zs[bestI] + (this.zs[j] - this.zs[bestI]) * bestT;
    const rx = -this.tzs[bestI];
    const rz = this.txs[bestI];
    out.index = bestI;
    out.t = bestT;
    out.s = (bestI + bestT) * this.spacing;
    out.lateral = (x - cx) * rx + (z - cz) * rz;
    out.dist = Math.sqrt(bestD2);
    return out;
  }

  private tmp = { d2: 0, t: 0 };

  private segmentDistance(i: number, x: number, z: number): { d2: number; t: number } {
    const j = (i + 1) % this.count;
    const ax = this.xs[i];
    const az = this.zs[i];
    const dx = this.xs[j] - ax;
    const dz = this.zs[j] - az;
    const len2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
    const px = ax + dx * t - x;
    const pz = az + dz * t - z;
    this.tmp.d2 = px * px + pz * pz;
    this.tmp.t = t;
    return this.tmp;
  }

  /** Smallest distance from a world point to the centerline (full scan, for scenery placement). */
  distanceToCenterline(x: number, z: number): number {
    let best = Infinity;
    for (let i = 0; i < this.count; i += 1) {
      const dx = this.xs[i] - x;
      const dz = this.zs[i] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  }

  /** Signed distance (m) from `from` to `to` along the track, in (-length/2, length/2]. */
  deltaS(from: number, to: number): number {
    let d = (to - from) % this.length;
    if (d > this.length / 2) d -= this.length;
    else if (d <= -this.length / 2) d += this.length;
    return d;
  }
}

/** Build a seeded random closed circuit. Retries with calmer shapes until the geometry is valid. */
export function generateTrack(seed: number): Track {
  const rng = new Rng(seed);
  let lastGood: Track | null = null;

  for (let attempt = 0; attempt < TRACK.maxGenerationAttempts; attempt++) {
    const k = Math.max(0.25, 1 - attempt * 0.02);
    const harmonics = [
      { n: 2, amp: rng.range(0.07, 0.2) * k, phase: rng.range(0, Math.PI * 2) },
      { n: 3, amp: rng.range(0.05, 0.16) * k, phase: rng.range(0, Math.PI * 2) },
      { n: 4, amp: rng.range(0.03, 0.1) * k, phase: rng.range(0, Math.PI * 2) },
      { n: 5, amp: rng.range(0.02, 0.07) * k, phase: rng.range(0, Math.PI * 2) },
      { n: 7, amp: rng.range(0.0, 0.035) * k, phase: rng.range(0, Math.PI * 2) },
    ];
    const stretch = rng.range(TRACK.stretchMin, TRACK.stretchMax);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < TRACK.controlPoints; i++) {
      const theta = (i / TRACK.controlPoints) * Math.PI * 2 + rng.range(-0.025, 0.025);
      let r = 1;
      for (const h of harmonics) r += h.amp * Math.cos(h.n * theta + h.phase);
      r *= TRACK.baseRadius * rng.range(0.97, 1.03);
      pts.push(new THREE.Vector3(Math.cos(theta) * r * stretch, 0, Math.sin(theta) * r));
    }

    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    curve.arcLengthDivisions = 4000;
    const length = curve.getLength();
    const n = Math.round(length / TRACK.sampleSpacing);
    const sampled = curve.getSpacedPoints(n);
    sampled.pop(); // last == first
    const track = new Track(sampled, length, seed);
    lastGood = track;

    if (validateTrack(track)) return track;
  }
  return lastGood!;
}

function validateTrack(track: Track): boolean {
  // Tightest curvature radius
  let maxK = 0;
  for (let i = 0; i < track.count; i++) maxK = Math.max(maxK, Math.abs(track.curvature[i]));
  if (maxK > 1 / TRACK.minCurveRadius) return false;

  // Non-adjacent parts of the loop must stay clear of each other
  const minSep = TRACK.wallOffset * 2 * TRACK.minSeparationFactor;
  const minSep2 = minSep * minSep;
  const skip = Math.ceil(110 / track.spacing);
  const n = track.count;
  for (let i = 0; i < n; i += 2) {
    for (let j = i + skip; j < n; j += 2) {
      if (n - (j - i) < skip) continue; // circularly adjacent
      const dx = track.xs[i] - track.xs[j];
      const dz = track.zs[i] - track.zs[j];
      if (dx * dx + dz * dz < minSep2) return false;
    }
  }
  return true;
}
