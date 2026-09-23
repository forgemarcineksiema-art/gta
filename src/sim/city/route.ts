/**
 * Drives through the city as sampled paths: the shortest lane chain between
 * two lanes (Dijkstra by lane length, U-turns included), a chain's points
 * with its junction curves, a swerve through a billboard gate, the turn off a
 * lane into a garage, and a uniform 3 m resampling with heading and curvature
 * (the shape `TrackBot` follows). Used by the cold open's route and the
 * drive-to-a-drop-off bot. Not per step: these allocate.
 */
import type { TrackSample } from '../track';
import type { DropOff } from './cover';
import { GARAGE } from './cover';
import { lanePath, type Lane, type RoadGraph, type RoadPoint } from './roads';

export interface Pt { x: number; z: number }

export function laneLength(lane: Lane): number {
  let len = 0;
  for (let i = 0; i + 1 < lane.points.length; i++) {
    const a = lane.points[i] as Pt, b = lane.points[i + 1] as Pt;
    len += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return len;
}

/** Lanes from `from` to `to` inclusive, or [] when unreachable. */
export function laneChain(graph: RoadGraph, from: number, to: number): number[] {
  const lanes = graph.lanes;
  const dist = new Float64Array(lanes.length).fill(Infinity);
  const prev = new Int32Array(lanes.length).fill(-1);
  const done = new Uint8Array(lanes.length);
  dist[from] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < lanes.length; i++) if (!done[i] && (dist[i] as number) < best) { best = dist[i] as number; u = i; }
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const n of (lanes[u] as Lane).next) {
      const d = best + laneLength(lanes[n] as Lane);
      if (d < (dist[n] as number)) { dist[n] = d; prev[n] = u; }
    }
  }
  const chain: number[] = [];
  for (let l = to; l >= 0; l = prev[l] as number) chain.unshift(l);
  return chain[0] === from ? chain : [];
}

/** Every lane of a chain but the last with its junction curve into the next; the last lane is left to the caller. */
export function chainPoints(graph: RoadGraph, chain: readonly number[], out: Pt[]): void {
  for (let i = 0; i + 1 < chain.length; i++) {
    for (const s of lanePath(graph.lanes[chain[i] as number] as Lane, graph.lanes[chain[i + 1] as number] as Lane)) out.push({ x: s.x, z: s.z });
  }
}

/** The junction curve from a lane's end to the next lane's start (the tail of `lanePath`), start included, end excluded. */
export function junctionCurve(lane: Lane, next: Lane, out: Pt[]): void {
  const cx0 = lane.x1 + Math.sin(lane.yaw) * 24, cz0 = lane.z1 + Math.cos(lane.yaw) * 24;
  const cx1 = next.x0 - Math.sin(next.yaw0) * 24, cz1 = next.z0 - Math.cos(next.yaw0) * 24;
  for (let i = 0; i < 24; i++) {
    const t = i / 24, u = 1 - t;
    out.push({
      x: u ** 3 * lane.x1 + 3 * u * u * t * cx0 + 3 * u * t * t * cx1 + t ** 3 * next.x0,
      z: u ** 3 * lane.z1 + 3 * u * u * t * cz0 + 3 * u * t * t * cz1 + t ** 3 * next.z0,
    });
  }
}

/** Distance along a lane's polyline to the projection of a point, and the signed metres to its right. */
export function alongLane(lane: Lane, x: number, z: number): { s: number; lateral: number } {
  let best = Infinity, at = 0, lateral = 0, travelled = 0;
  for (let i = 0; i + 1 < lane.points.length; i++) {
    const a = lane.points[i] as Pt, b = lane.points[i + 1] as Pt;
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (len * len || 1)));
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < best) {
      best = d;
      at = travelled + t * len;
      // right of the direction of travel is (-dz, dx) / len (+X is left when facing +Z)
      lateral = ((x - px) * -dz + (z - pz) * dx) / (len || 1);
    }
    travelled += len;
  }
  return { s: at, lateral };
}

/** A lane's point at distance `s`, shifted `right` metres to its right, with the heading there. */
export function laneAt(lane: Lane, s: number, right = 0): Pt & { yaw: number; y: number } {
  let travelled = 0;
  for (let i = 0; i + 1 < lane.points.length; i++) {
    const a = lane.points[i] as RoadPoint, b = lane.points[i + 1] as RoadPoint;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (s <= travelled + len || i + 2 === lane.points.length) {
      const t = len > 0 ? Math.max(0, Math.min(1, (s - travelled) / len)) : 0;
      const nx = len > 0 ? -(b.z - a.z) / len : 0, nz = len > 0 ? (b.x - a.x) / len : 0;
      return { x: a.x + (b.x - a.x) * t + nx * right, z: a.z + (b.z - a.z) * t + nz * right, yaw: Math.atan2(b.x - a.x, b.z - a.z), y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t };
    }
    travelled += len;
  }
  const p = lane.points[0] as RoadPoint;
  return { x: p.x, z: p.z, yaw: lane.yaw0, y: p.y ?? 0 };
}

/**
 * Along `lane` from `fromS` to `toS` at 3 m, stepping out `swerve` metres to
 * the right (negative: left) around `swerveAt`, held for `swerveLength` m and
 * eased in and out over `ramp` m (a billboard gate across the footway); 0 for
 * none. The ease is a smoothstep, so the curvature has no kinks.
 */
export function laneSpan(lane: Lane, fromS: number, toS: number, out: Pt[], swerve = 0, swerveAt = 0, swerveLength = 0, ramp = 14): void {
  for (let s = fromS; s <= toS; s += 3) {
    let right = 0;
    if (swerve !== 0) {
      const d = Math.abs(s - swerveAt) - swerveLength / 2;
      const t = d <= 0 ? 1 : d < ramp ? 1 - d / ramp : 0;
      right = swerve * t * t * (3 - 2 * t);
    }
    out.push(laneAt(lane, s, right));
  }
}

/** Off the lane at `from` (heading `yaw`) into a garage: a curve to 2 m outside the door, then straight in to `deep` m inside. */
export function garageEntry(site: DropOff, from: Pt, yaw: number, out: Pt[], deep = GARAGE.depth / 2 + 2): void {
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
  const outside = { x: site.door.x - fx * 2, z: site.door.z - fz * 2 };
  const k = 7;
  const c1 = { x: from.x + Math.sin(yaw) * k, z: from.z + Math.cos(yaw) * k };
  const c2 = { x: outside.x - fx * k, z: outside.z - fz * k };
  for (let i = 1; i <= 12; i++) {
    const t = i / 12, u = 1 - t;
    out.push({
      x: u ** 3 * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * outside.x,
      z: u ** 3 * from.z + 3 * u * u * t * c1.z + 3 * u * t * t * c2.z + t ** 3 * outside.z,
    });
  }
  for (let d = 3; d <= deep; d += 3) out.push({ x: outside.x + fx * d, z: outside.z + fz * d });
}

/** Uniform samples every `spacing` m with heading and curvature, open at both ends. */
export function resample(raw: readonly Pt[], spacing = 3): TrackSample[] {
  const samples: TrackSample[] = [];
  let carried = 0, distance = 0;
  for (let i = 0; i + 1 < raw.length; i++) {
    const a = raw[i] as Pt, b = raw[i + 1] as Pt;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-6) continue;
    for (let d = carried; d < len; d += spacing) {
      samples.push({ x: a.x + (b.x - a.x) * d / len, z: a.z + (b.z - a.z) * d / len, yaw: 0, curvature: 0, s: distance });
      distance += spacing;
    }
    carried = (carried - len) % spacing;
    if (carried < 0) carried += spacing;
  }
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const p = samples[Math.max(0, i - 1)] as TrackSample, s = samples[i] as TrackSample, q = samples[Math.min(n - 1, i + 1)] as TrackSample;
    s.yaw = Math.atan2(q.x - p.x, q.z - p.z);
    if (i === 0 || i === n - 1) continue;
    const a = Math.atan2(s.x - p.x, s.z - p.z), b = Math.atan2(q.x - s.x, q.z - s.z);
    s.curvature = Math.atan2(Math.sin(b - a), Math.cos(b - a)) / spacing;
  }
  return samples;
}

/**
 * Samples inside or at the door of a garage are marked tight, so a speed plan
 * arrives at a crawl and stops at the end; only from route distance `fromS`
 * on, so an earlier pass by the same garage keeps its speed.
 */
export function crawlInto(samples: TrackSample[], site: DropOff, fromS = 0): void {
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
  for (const s of samples) {
    if (s.s < fromS) continue;
    const along = (s.x - site.x) * fx + (s.z - site.z) * fz;
    const across = -(s.x - site.x) * fz + (s.z - site.z) * fx;
    if (Math.abs(across) > GARAGE.width || along < -GARAGE.depth / 2 - 6 || along > GARAGE.depth / 2) continue;
    s.curvature = Math.max(Math.abs(s.curvature), along > -1 ? 1000 : 4);
  }
}
