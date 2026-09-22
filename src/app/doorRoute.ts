/**
 * A drive to a drop-off for the road bot (`?bot=door`, the slice-3a
 * measurement): the shortest lane path from the car's lane to the garage's
 * approach lane, a turn off that lane into the door, and a crawl to the middle
 * of the garage. Samples every 3 m with curvature, as `TrackBot` expects; the
 * last ones are marked tight so its speed plan arrives at a crawl.
 */
import { GARAGE, type DropOff, type Lane, type SimWorld, type TrackSample } from '../sim';
import { lanePath } from '../sim/city/roads';

const SPACING = 3;

export function routeToDropOff(sim: SimWorld, site: DropOff): TrackSample[] {
  const city = sim.city;
  if (!city || site.approachLane < 0) return [];
  const lanes = city.graph.lanes;
  const p = sim.vehicle.body.translation();
  const start = city.nearestLane(p.x, p.z);
  // Dijkstra over lanes by length; U-turns are connections like any other
  const dist = new Float64Array(lanes.length).fill(Infinity);
  const prev = new Int32Array(lanes.length).fill(-1);
  const done = new Uint8Array(lanes.length);
  dist[start] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < lanes.length; i++) if (!done[i] && (dist[i] as number) < best) { best = dist[i] as number; u = i; }
    if (u < 0 || u === site.approachLane) break;
    done[u] = 1;
    const lane = lanes[u] as Lane;
    for (const n of lane.next) {
      const d = best + polylineLength(lanes[n] as Lane);
      if (d < (dist[n] as number)) { dist[n] = d; prev[n] = u; }
    }
  }
  const chain: number[] = [];
  for (let l = site.approachLane; l >= 0; l = prev[l] as number) chain.unshift(l);
  if (chain[0] !== start) return [];

  const raw: Array<{ x: number; z: number }> = [];
  for (let i = 0; i + 1 < chain.length; i++) {
    for (const s of lanePath(lanes[chain[i] as number] as Lane, lanes[chain[i + 1] as number] as Lane)) raw.push({ x: s.x, z: s.z });
  }
  // along the approach lane to 14 m short of the door, then a curve into the opening
  const approach = lanes[site.approachLane] as Lane;
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
  let turn = { x: approach.x0, z: approach.z0 }, heading = { x: 0, z: 1 };
  let travelled = 0;
  const doorAlongLane = alongPolyline(approach, site.door.x, site.door.z);
  for (let i = 0; i + 1 < approach.points.length; i++) {
    const a = approach.points[i] as { x: number; z: number }, b = approach.points[i + 1] as { x: number; z: number };
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    heading = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
    const stop = doorAlongLane - 14;
    const steps = Math.ceil(len / SPACING);
    let reached = false;
    for (let k = 0; k < steps; k++) {
      const d = travelled + (k / steps) * len;
      if (d > stop) { reached = true; break; }
      turn = { x: a.x + (b.x - a.x) * k / steps, z: a.z + (b.z - a.z) * k / steps };
      raw.push(turn);
    }
    if (reached) break;
    travelled += len;
  }
  const outside = { x: site.door.x - fx * 2, z: site.door.z - fz * 2 };
  const k = 7;
  const c1 = { x: turn.x + heading.x * k, z: turn.z + heading.z * k };
  const c2 = { x: outside.x - fx * k, z: outside.z - fz * k };
  for (let i = 1; i <= 12; i++) {
    const t = i / 12, u = 1 - t;
    raw.push({
      x: u ** 3 * turn.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * outside.x,
      z: u ** 3 * turn.z + 3 * u * u * t * c1.z + 3 * u * t * t * c2.z + t ** 3 * outside.z,
    });
  }
  const insideEnd = GARAGE.depth / 2 + 2;
  for (let d = SPACING; d <= insideEnd; d += SPACING) raw.push({ x: outside.x + fx * d, z: outside.z + fz * d });

  // uniform 3 m samples with yaw and curvature, open at both ends
  const samples: TrackSample[] = [];
  let carried = 0, distance = 0;
  for (let i = 0; i + 1 < raw.length; i++) {
    const a = raw[i] as { x: number; z: number }, b = raw[i + 1] as { x: number; z: number };
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-6) continue;
    for (let d = carried; d < len; d += SPACING) {
      samples.push({ x: a.x + (b.x - a.x) * d / len, z: a.z + (b.z - a.z) * d / len, yaw: 0, curvature: 0, s: distance });
      distance += SPACING;
    }
    carried = (carried - len) % SPACING;
    if (carried < 0) carried += SPACING;
  }
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const prevS = samples[Math.max(0, i - 1)] as TrackSample, s = samples[i] as TrackSample, next = samples[Math.min(n - 1, i + 1)] as TrackSample;
    s.yaw = Math.atan2(next.x - prevS.x, next.z - prevS.z);
    if (i === 0 || i === n - 1) continue;
    const a = Math.atan2(s.x - prevS.x, s.z - prevS.z), b = Math.atan2(next.x - s.x, next.z - s.z);
    s.curvature = Math.atan2(Math.sin(b - a), Math.cos(b - a)) / SPACING;
  }
  // through the door and in: a crawl the speed plan brakes for, and a stop at the end
  for (const s of samples) {
    const along = (s.x - site.x) * fx + (s.z - site.z) * fz;
    const across = -(s.x - site.x) * fz + (s.z - site.z) * fx;
    if (Math.abs(across) > GARAGE.width || along < -GARAGE.depth / 2 - 6 || along > GARAGE.depth / 2) continue;
    s.curvature = Math.max(Math.abs(s.curvature), along > -1 ? 1000 : 4);
  }
  return samples;
}

function polylineLength(lane: Lane): number {
  let len = 0;
  for (let i = 0; i + 1 < lane.points.length; i++) {
    const a = lane.points[i] as { x: number; z: number }, b = lane.points[i + 1] as { x: number; z: number };
    len += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return len;
}

/** Distance along a lane's polyline to the projection of a point. */
function alongPolyline(lane: Lane, x: number, z: number): number {
  let best = Infinity, at = 0, travelled = 0;
  for (let i = 0; i + 1 < lane.points.length; i++) {
    const a = lane.points[i] as { x: number; z: number }, b = lane.points[i + 1] as { x: number; z: number };
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (len * len || 1)));
    const d = (a.x + dx * t - x) ** 2 + (a.z + dz * t - z) ** 2;
    if (d < best) { best = d; at = travelled + t * len; }
    travelled += len;
  }
  return at;
}
