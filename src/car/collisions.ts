import { CarStats, PHYSICS } from '../config/carStats';
import { clamp, wrapAngle } from '../core/math';
import { Track, TrackLocation } from '../track/Track';
import { CarState, forwardX, forwardZ, setWorldVelocity, worldVelocity } from './Car';

export interface ImpactInfo {
  kind: 'wall' | 'car';
  /** Closing speed along the contact normal (m/s). */
  impact: number;
  /** World contact point. */
  x: number;
  z: number;
}

const tmpV = { x: 0, z: 0 };
const tmpW = { x: 0, z: 0 };

/**
 * Resolve the barrier on both sides of the track against the car's oriented box (approximated by its
 * lateral extent). Returns impact info when the car actually hit the wall this step.
 */
export function resolveWall(
  c: CarState,
  loc: TrackLocation,
  track: Track,
  stats: CarStats,
  dt: number,
): ImpactInfo | null {
  const tx = track.txs[loc.index];
  const tz = track.tzs[loc.index];
  const rx = -tz;
  const rz = tx;

  const fx = forwardX(c.heading);
  const fz = forwardZ(c.heading);
  const cosA = fx * tx + fz * tz;
  const sinA = fx * rx + fz * rz;
  const ext = Math.abs(sinA) * stats.halfLength + Math.abs(cosA) * stats.halfWidth;

  const side = loc.lateral >= 0 ? 1 : -1;
  const pen = Math.abs(loc.lateral) + ext - track.wallOffset;
  if (pen <= 0) return null;

  const shield = c.shieldTime > 0;

  // Push back inside
  c.x -= side * pen * rx;
  c.z -= side * pen * rz;

  worldVelocity(c, tmpV);
  const nx = side * rx; // points INTO the wall
  const nz = side * rz;
  const vn = tmpV.x * nx + tmpV.z * nz;
  const preSpeed = Math.hypot(tmpV.x, tmpV.z);

  let result: ImpactInfo | null = null;

  if (vn > 0) {
    const e = shield ? 1 : PHYSICS.wallRestitution;
    let vx = tmpV.x - (1 + e) * vn * nx;
    let vz = tmpV.z - (1 + e) * vn * nz;

    if (!shield) {
      // Tangential speed loss, stronger for harder hits
      const loss = PHYSICS.wallTangentLoss * clamp(vn / 18, 0.12, 1);
      const vnAfter = vx * nx + vz * nz;
      const tvx = vx - vnAfter * nx;
      const tvz = vz - vnAfter * nz;
      vx = vnAfter * nx + tvx * (1 - loss);
      vz = vnAfter * nz + tvz * (1 - loss);
    } else {
      const post = Math.hypot(vx, vz) || 1;
      vx *= preSpeed / post;
      vz *= preSpeed / post;
    }

    // Turn the nose towards the wall direction so the car slides along it instead of sticking
    const trackHeading = Math.atan2(-tx, -tz);
    const desired = cosA >= 0 ? trackHeading : trackHeading + Math.PI;
    const err = wrapAngle(desired - c.heading);
    c.heading += err * PHYSICS.wallAlign * clamp(vn / 12, 0.1, 1);
    c.yawRate *= 0.4;

    setWorldVelocity(c, vx, vz);
    result = {
      kind: 'wall',
      impact: vn,
      x: c.x + nx * stats.halfWidth,
      z: c.z + nz * stats.halfWidth,
    };
  } else if (!shield) {
    // Scraping along the wall
    const k = Math.max(0, 1 - PHYSICS.wallScrapeDrag * dt);
    c.vLong *= k;
    c.vLat *= k;
  }
  return result;
}

/**
 * Two-circle-per-car collision with a small positional push and a restitution impulse.
 * Returns the closing speed when the cars actually collided (0 otherwise).
 */
export function resolveCarPair(a: CarState, b: CarState, stats: CarStats): ImpactInfo | null {
  const dxc = a.x - b.x;
  const dzc = a.z - b.z;
  if (dxc * dxc + dzc * dzc > 36) return null;

  const r = PHYSICS.carCircleRadius;
  const off = PHYSICS.carCircleOffset;
  const afx = forwardX(a.heading);
  const afz = forwardZ(a.heading);
  const bfx = forwardX(b.heading);
  const bfz = forwardZ(b.heading);

  // Find the deepest overlapping circle pair
  let bestPen = 0;
  let bnx = 0;
  let bnz = 0;
  let acx = 0;
  let acz = 0;
  let bcx = 0;
  let bcz = 0;
  for (let i = -1; i <= 1; i += 2) {
    const ax = a.x + afx * off * i;
    const az = a.z + afz * off * i;
    for (let j = -1; j <= 1; j += 2) {
      const bx = b.x + bfx * off * j;
      const bz = b.z + bfz * off * j;
      const dx = ax - bx;
      const dz = az - bz;
      const d = Math.hypot(dx, dz);
      const pen = 2 * r - d;
      if (pen > bestPen) {
        bestPen = pen;
        const inv = d > 1e-5 ? 1 / d : 0;
        bnx = d > 1e-5 ? dx * inv : -afz;
        bnz = d > 1e-5 ? dz * inv : afx;
        acx = ax;
        acz = az;
        bcx = bx;
        bcz = bz;
      }
    }
  }
  if (bestPen <= 0) return null;

  const push = bestPen * 0.5 * PHYSICS.carPush;
  a.x += bnx * push;
  a.z += bnz * push;
  b.x -= bnx * push;
  b.z -= bnz * push;

  worldVelocity(a, tmpV);
  worldVelocity(b, tmpW);
  const vn = (tmpV.x - tmpW.x) * bnx + (tmpV.z - tmpW.z) * bnz;
  if (vn >= 0) return null;

  const shieldA = a.shieldTime > 0;
  const shieldB = b.shieldTime > 0;
  const j = (-(1 + PHYSICS.carRestitution) * vn) / 2;
  // A shielded car is not slowed or pushed: the other car absorbs the whole impulse.
  const ja = shieldA ? 0 : shieldB ? 2 * j : j;
  const jb = shieldB ? 0 : shieldA ? 2 * j : j;

  // Yaw kicks from off-centre contact
  const kick = 0.5 / stats.yawInertia;
  const aox = acx - a.x;
  const aoz = acz - a.z;
  const box = bcx - b.x;
  const boz = bcz - b.z;
  a.yawRate += kick * (aoz * bnx * ja - aox * bnz * ja);
  b.yawRate += kick * (boz * -bnx * jb - box * -bnz * jb);

  const avx = tmpV.x + bnx * ja;
  const avz = tmpV.z + bnz * ja;
  const bvx = tmpW.x - bnx * jb;
  const bvz = tmpW.z - bnz * jb;
  setWorldVelocity(a, avx, avz);
  setWorldVelocity(b, bvx, bvz);

  return { kind: 'car', impact: -vn, x: (acx + bcx) / 2, z: (acz + bcz) / 2 };
}
