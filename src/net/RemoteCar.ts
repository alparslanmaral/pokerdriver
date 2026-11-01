import { NET } from '../config/netConfig';
import { CarState } from '../car/Car';
import { wrapAngle } from '../core/math';
import { CarSnap, FLAG, SNAP } from './protocol';

interface Sample {
  t: number;
  x: number;
  z: number;
  heading: number;
  vLong: number;
  vLat: number;
  yawRate: number;
}

/**
 * Network-driven car: buffers the owner's snapshots and plays them back slightly in the past (snapshot interpolation),
 * extrapolating briefly when packets are late. Sender timestamps are mapped onto the local clock with a
 * min-latency offset estimate, so network jitter does not make the car stutter.
 */
export class RemoteCar {
  /** Latest progress info, straight from the owner. */
  total = 0;
  finishTime = -1;
  private flags = 0;
  private offset = Infinity;
  private readonly buf: Sample[] = [];

  push(ts: number, nowMs: number, s: CarSnap): void {
    const off = nowMs - ts;
    this.offset = off < this.offset ? off : this.offset + 0.05;
    this.total = s[SNAP.total];
    this.finishTime = s[SNAP.finishTime];
    this.flags = s[SNAP.flags];
    this.buf.push({
      t: ts + this.offset,
      x: s[SNAP.x],
      z: s[SNAP.z],
      heading: s[SNAP.heading],
      vLong: s[SNAP.vLong],
      vLat: s[SNAP.vLat],
      yawRate: s[SNAP.yawRate],
    });
    if (this.buf.length > 40) this.buf.shift();
  }

  get hasData(): boolean {
    return this.buf.length > 0;
  }

  /** Write the interpolated pose and velocities into a CarState (used for drawing, minimap, smoke, collisions). */
  sample(nowMs: number, out: CarState): void {
    const n = this.buf.length;
    if (n === 0) return;
    const tr = nowMs - NET.interpDelayMs;
    const buf = this.buf;
    out.drifting = (this.flags & FLAG.drifting) !== 0;
    out.nitroTime = (this.flags & FLAG.nitro) !== 0 ? 1 : 0;
    out.shieldTime = (this.flags & FLAG.shield) !== 0 ? 1 : 0;

    // Drop samples that are fully in the past
    while (buf.length > 2 && buf[1].t < tr) buf.shift();

    const a = buf[0];
    if (buf.length === 1 || tr <= a.t) {
      this.apply(a, 0, out);
      return;
    }
    const b = buf[1];
    if (tr <= b.t) {
      const k = (tr - a.t) / (b.t - a.t);
      if (Math.hypot(b.x - a.x, b.z - a.z) > NET.teleportDistance) {
        this.apply(k < 0.5 ? a : b, 0, out);
        return;
      }
      out.x = a.x + (b.x - a.x) * k;
      out.z = a.z + (b.z - a.z) * k;
      out.heading = a.heading + wrapAngle(b.heading - a.heading) * k;
      out.vLong = a.vLong + (b.vLong - a.vLong) * k;
      out.vLat = a.vLat + (b.vLat - a.vLat) * k;
      out.yawRate = a.yawRate + (b.yawRate - a.yawRate) * k;
      return;
    }
    // Ran out of snapshots: carry on with the last known velocity for a short while
    const last = buf[buf.length - 1];
    this.apply(last, Math.min(tr - last.t, NET.maxExtrapolateMs) / 1000, out);
  }

  private apply(s: Sample, extra: number, out: CarState): void {
    const fx = -Math.sin(s.heading);
    const fz = -Math.cos(s.heading);
    const rx = Math.cos(s.heading);
    const rz = -Math.sin(s.heading);
    out.x = s.x + (fx * s.vLong + rx * s.vLat) * extra;
    out.z = s.z + (fz * s.vLong + rz * s.vLat) * extra;
    out.heading = s.heading + s.yawRate * extra;
    out.vLong = s.vLong;
    out.vLat = s.vLat;
    out.yawRate = s.yawRate;
  }
}
