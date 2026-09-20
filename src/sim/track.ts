/**
 * The test track: a closed circuit for measuring the car instead of feeling it.
 *
 * The centreline is a closed Catmull-Rom spline through hand-placed control
 * points (fast sweeper, chicane, hairpin, back straight with a small jump,
 * esses, final corner), sampled every 3 m into a polyline with headings and
 * curvature. Gates along it make a lap valid; a lap timer tracks current, last
 * and best. Geometry (road, kerbs, edge posts, gantry, ramp) is emitted as the
 * same static descriptors and colliders as the rest of the playground.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS_TERRAIN } from './collision';
import { PALETTE } from './palette';
import { IDENTITY_QUAT, quatFromAxisAngle, quatFromYaw, type StaticDesc, type Vec3 } from './scene';

export interface TrackSample {
  x: number;
  z: number;
  /** Heading, radians, yaw about +Y (forward = (sin, 0, cos)). */
  yaw: number;
  /** Signed curvature, 1/m (+ = left). */
  curvature: number;
  /** Distance along the track from the start, m. */
  s: number;
}

export interface Gate {
  x: number;
  z: number;
  yaw: number;
  halfWidth: number;
  index: number;
}

export interface TrackDef {
  origin: { x: number; z: number };
  samples: TrackSample[];
  gates: Gate[];
  width: number;
  length: number;
  /** Start pose for the spawn point. */
  start: { x: number; z: number; yaw: number };
}

/** Control points relative to the track origin (x, z), clockwise-ish, closed. */
const CONTROL: Array<[number, number]> = [
  [0, 0],
  [0, 80],
  [0, 160],
  [28, 218],
  [95, 242],
  [160, 225],
  [196, 175],
  [174, 134],
  [194, 96],
  [170, 56],
  [205, -10],
  [190, -72],
  [140, -100],
  [60, -100],
  [40, -97],
  [12, -84],
  [0, -50],
];

const SAMPLE_SPACING = 3;
const GATE_COUNT = 8;

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export function buildTrackDef(origin: { x: number; z: number }, width = 12): TrackDef {
  const n = CONTROL.length;
  // dense sampling of the closed spline, then resample by arc length
  const dense: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const p0 = CONTROL[(i + n - 1) % n] as [number, number];
    const p1 = CONTROL[i] as [number, number];
    const p2 = CONTROL[(i + 1) % n] as [number, number];
    const p3 = CONTROL[(i + 2) % n] as [number, number];
    for (let k = 0; k < 40; k++) {
      const t = k / 40;
      dense.push([origin.x + catmull(p0[0], p1[0], p2[0], p3[0], t), origin.z + catmull(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  const samples: TrackSample[] = [];
  let acc = 0;
  let sTotal = 0;
  for (let i = 0; i < dense.length; i++) {
    const a = dense[i] as [number, number];
    const b = dense[(i + 1) % dense.length] as [number, number];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (samples.length === 0 || acc >= SAMPLE_SPACING) {
      samples.push({ x: a[0], z: a[1], yaw: Math.atan2(b[0] - a[0], b[1] - a[1]), curvature: 0, s: sTotal });
      acc = 0;
    }
    acc += seg;
    sTotal += seg;
  }
  // the closing segment ends where it started: drop trailing samples that sit on the first one
  const s0 = samples[0] as TrackSample;
  while (samples.length > 2) {
    const l = samples[samples.length - 1] as TrackSample;
    if (Math.hypot(l.x - s0.x, l.z - s0.z) < 2.5) samples.pop();
    else break;
  }
  // curvature from heading change between neighbours
  const m = samples.length;
  for (let i = 0; i < m; i++) {
    const prev = samples[(i + m - 1) % m] as TrackSample;
    const next = samples[(i + 1) % m] as TrackSample;
    let dyaw = next.yaw - prev.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const ds = Math.hypot(next.x - prev.x, next.z - prev.z);
    (samples[i] as TrackSample).curvature = ds > 0 ? dyaw / ds : 0;
  }
  const gates: Gate[] = [];
  for (let g = 0; g < GATE_COUNT; g++) {
    const smp = samples[Math.floor((g / GATE_COUNT) * m)] as TrackSample;
    gates.push({ x: smp.x, z: smp.z, yaw: smp.yaw, halfWidth: width / 2 + 2, index: g });
  }
  const first = samples[0] as TrackSample;
  return { origin, samples, gates, width, length: sTotal, start: { x: first.x, z: first.z, yaw: first.yaw } };
}

/** Emit the track's visuals and colliders. */
export function buildTrackGeometry(def: TrackDef, world: RAPIER.World, statics: StaticDesc[]): void {
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const half = def.width / 2;
  const S = def.samples;
  const m = S.length;
  const box = (hx: number, hy: number, hz: number, pos: Vec3, yaw: number, color: number, collide: boolean, tag: string, tilt = 0) => {
    const rot = tilt === 0 ? quatFromYaw(yaw) : mulYawTilt(yaw, tilt);
    statics.push({ shape: { kind: 'box', hx, hy, hz }, position: pos, rotation: rot, color, tag });
    if (collide) {
      world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(pos.x, pos.y, pos.z).setRotation(rot).setFriction(1).setCollisionGroups(GROUPS_TERRAIN), ground);
    }
  };
  for (let i = 0; i < m; i++) {
    const a = S[i] as TrackSample;
    const b = S[(i + 1) % m] as TrackSample;
    const cx = (a.x + b.x) / 2;
    const cz = (a.z + b.z) / 2;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    // road surface (visual; the ground collider is flat)
    box(half, 0.014, len / 2 + 0.6, { x: cx, y: 0.0, z: cz }, yaw, PALETTE.asphaltLight, false, 'road');
    // kerbs on both edges where the track bends, alternating colours
    const bend = Math.abs(a.curvature) > 1 / 90;
    if (bend) {
      for (const side of [-1, 1]) {
        const rx = Math.cos(yaw) * side;
        const rz = -Math.sin(yaw) * side;
        const kx = cx + rx * (half + 0.4);
        const kz = cz + rz * (half + 0.4);
        box(0.45, 0.05, len / 2 + 0.2, { x: kx, y: 0.05, z: kz }, yaw, i % 2 === 0 ? PALETTE.ramp : PALETTE.barrier, true, 'kerb');
      }
    }
    // edge posts every ~30 m
    if (i % 10 === 0) {
      for (const side of [-1, 1]) {
        const rx = Math.cos(yaw) * side;
        const rz = -Math.sin(yaw) * side;
        box(0.1, 0.9, 0.1, { x: cx + rx * (half + 2.2), y: 0.9, z: cz + rz * (half + 2.2) }, yaw, PALETTE.barrier, false, 'post');
        box(0.12, 0.12, 0.12, { x: cx + rx * (half + 2.2), y: 1.75, z: cz + rz * (half + 2.2) }, yaw, PALETTE.cone, false, 'post');
      }
    }
    // centre dashes
    if (i % 3 === 0) box(0.07, 0.02, 0.9, { x: cx, y: 0.005, z: cz }, yaw, PALETTE.laneMark, false, 'mark');
  }
  // start / finish: painted line and a gantry
  const st = def.start;
  const rx = Math.cos(st.yaw);
  const rz = -Math.sin(st.yaw);
  box(half, 0.02, 0.3, { x: st.x, y: 0.006, z: st.z }, st.yaw, PALETTE.laneMark, false, 'mark');
  for (const side of [-1, 1]) box(0.18, 3.0, 0.18, { x: st.x + rx * side * (half + 1.2), y: 3.0, z: st.z + rz * side * (half + 1.2) }, st.yaw, PALETTE.concrete, false, 'post');
  box(half + 1.4, 0.35, 0.25, { x: st.x, y: 6.2, z: st.z }, st.yaw, PALETTE.carBlue, false, 'board');
  // a small ramp on the back straight: the sample nearest (100, -100) from the origin
  let jumpIdx = 0;
  let jumpD = Infinity;
  for (let i = 0; i < m; i++) {
    const smp = S[i] as TrackSample;
    const d = (smp.x - (def.origin.x + 100)) ** 2 + (smp.z - (def.origin.z - 100)) ** 2;
    if (d < jumpD) {
      jumpD = d;
      jumpIdx = i;
    }
  }
  const jumpAt = S[jumpIdx] as TrackSample;
  const rad = (7 * Math.PI) / 180;
  const rl = 8;
  const fx = Math.sin(jumpAt.yaw);
  const fz = Math.cos(jumpAt.yaw);
  const cz2 = (Math.cos(rad) * rl) / 2;
  const cy = (Math.sin(rad) * rl) / 2 - 0.5 * Math.cos(rad) + 0.02;
  box(half * 0.7, 0.5, rl / 2, { x: jumpAt.x + fx * cz2, y: cy, z: jumpAt.z + fz * cz2 }, jumpAt.yaw, PALETTE.ramp, true, 'ramp', -rad);
  // gate markers (thin, visual only) so the sectors can be seen
  for (const g of def.gates) {
    if (g.index === 0) continue;
    const gx = Math.cos(g.yaw);
    const gz = -Math.sin(g.yaw);
    for (const side of [-1, 1]) box(0.1, 0.5, 0.1, { x: g.x + gx * side * (half + 0.8), y: 0.5, z: g.z + gz * side * (half + 0.8) }, g.yaw, PALETTE.carLime, false, 'post');
  }
}

/** yaw about Y then pitch about the local X axis (for the ramp). */
function mulYawTilt(yaw: number, tilt: number): { x: number; y: number; z: number; w: number } {
  const a = quatFromYaw(yaw);
  const b = quatFromAxisAngle(1, 0, 0, tilt);
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
void IDENTITY_QUAT;

export interface LapState {
  /** Seconds into the current lap (−1 before the first start crossing). */
  current: number;
  last: number;
  best: number;
  lapCount: number;
  /** Gates passed in the current lap. */
  gatesPassed: number;
  gateCount: number;
  /** Sim tick at which the current lap started, and at which the lap just completed had started. */
  lapStartTick: number;
  completedLapStartTick: number;
  /** Set for one step when a lap completes; true when it was a new best. */
  justCompleted: boolean;
  justBest: boolean;
}

/** Tracks gate crossings and lap times from the car position each step. */
export class LapTimer {
  readonly state: LapState = { current: -1, last: -1, best: -1, lapCount: 0, gatesPassed: 0, gateCount: 0, lapStartTick: -1, completedLapStartTick: -1, justCompleted: false, justBest: false };
  private readonly gates: Gate[];
  private readonly along: number[];
  private running = false;

  constructor(def: TrackDef) {
    this.gates = def.gates;
    this.along = def.gates.map(() => 0);
    this.state.gateCount = def.gates.length;
  }

  update(x: number, z: number, tick: number, time: number, dt: number): void {
    const st = this.state;
    st.justCompleted = false;
    st.justBest = false;
    if (this.running) st.current = time - (st.lapStartTick * dt);
    for (const g of this.gates) {
      const fx = Math.sin(g.yaw);
      const fz = Math.cos(g.yaw);
      const dx = x - g.x;
      const dz = z - g.z;
      const alongNow = dx * fx + dz * fz;
      const lateral = Math.abs(dx * Math.cos(g.yaw) - dz * Math.sin(g.yaw));
      const prev = this.along[g.index] as number;
      this.along[g.index] = alongNow;
      const crossed = prev < 0 && alongNow >= 0 && lateral <= g.halfWidth && Math.abs(alongNow - prev) < 8;
      if (!crossed) continue;
      if (g.index === 0) {
        if (this.running && st.gatesPassed === st.gateCount - 1) {
          const lapTime = time - st.lapStartTick * dt;
          st.completedLapStartTick = st.lapStartTick;
          st.last = lapTime;
          st.lapCount++;
          st.justCompleted = true;
          if (st.best < 0 || lapTime < st.best) {
            st.best = lapTime;
            st.justBest = true;
          }
        }
        this.running = true;
        st.lapStartTick = tick;
        st.gatesPassed = 0;
        st.current = 0;
      } else if (this.running && g.index === st.gatesPassed + 1) {
        st.gatesPassed = g.index;
      }
    }
  }

  reset(): void {
    this.running = false;
    this.state.current = -1;
    this.state.gatesPassed = 0;
    this.state.lapStartTick = -1;
    for (let i = 0; i < this.along.length; i++) this.along[i] = 0;
  }
}
