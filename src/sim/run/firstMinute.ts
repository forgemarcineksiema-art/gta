/**
 * The island's first minute (M8.10 slice 14, docs/M8.10_PLAN.md §1.4, DESIGN §6.6's route redrawn): from the summit by
 * the tower down Crown Avenue with the town and the bay ahead, round the centre's roundabout, on to the Coral Hotel's
 * garage, about 1.2 km. The plan's points laid on the network's lanes (the shortest way on from each to the next), the
 * way into the garage at its end, and each of the plan's steps (the swap, the billboard, the takedown, the delivery)
 * at its place along it.
 */
import type { DropOff } from '../city/cover';
import type { Lane, RoadGraph } from '../city/roads';
import { alongLane, garageEntry, junctionCurve, laneAt, laneLength, laneSpan, resample, type Pt } from '../city/route';
import type { P2 } from '../island/geom';
import { FIRST_MINUTE, FIRST_MINUTE_STEPS } from '../island/plan';
import type { TrackSample } from '../track';

export type FirstMinuteStep = (typeof FIRST_MINUTE_STEPS)[number]['step'];

export interface FirstMinuteRoute {
  /** The lanes it drives, in order. */
  lanes: number[];
  /** 3 m samples from the start into the middle of the garage. */
  samples: TrackSample[];
  /** Each step's route distance (m): where along the route its place is. */
  steps: Record<FirstMinuteStep, number>;
  /** The route distance where the way into the garage leaves the lane. */
  entryS: number;
}

/** A point's lane: within this far of its line (m; the plan's points are the sketch's), running the route's way there (the cosine of the angle at least). */
const ON_LANE = 25;
const SAME_WAY = 0.5;
/** Off the last lane this far before the door, into the garage (the grid's cold open's). */
const TURN_IN = 20;

/** The lane at (x, z) running toward (tx, tz): the nearest whose heading there is the way on, -1 with none. */
function laneToward(graph: RoadGraph, x: number, z: number, tx: number, tz: number): number {
  const wx = tx - x, wz = tz - z, wl = Math.hypot(wx, wz) || 1;
  let best = -1, bestD = ON_LANE;
  for (const lane of graph.lanes) {
    const pts = lane.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i] as Pt, b = pts[i + 1] as Pt, dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (l * l)));
      const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
      if (d < bestD && (dx * wx + dz * wz) / (l * wl) >= SAME_WAY) { bestD = d; best = lane.id; }
    }
  }
  return best;
}

/** The lanes from lane `from` on to lane `to`, the fewest metres (both included), or null when `to` cannot be reached. */
export function lanePath(graph: RoadGraph, from: number, to: number): number[] | null {
  if (from === to) return [from];
  const n = graph.lanes.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || (dist[i] as number) < (dist[u] as number))) u = i;
    if (u < 0 || !Number.isFinite(dist[u])) return null;
    if (u === to) break;
    done[u] = 1;
    const len = laneLength(graph.lanes[u] as Lane);
    for (const v of (graph.lanes[u] as Lane).next) {
      if (done[v]) continue;
      const d = (dist[u] as number) + len;
      if (d < (dist[v] as number)) { dist[v] = d; prev[v] = u; }
    }
  }
  const out: number[] = [];
  for (let v = to; v >= 0; v = prev[v] as number) out.push(v);
  return out.reverse();
}

/**
 * The first minute's route on the island's `graph` into `garage` (the hotel's): null if a point has no lane its way or
 * a leg cannot be driven.
 */
export function firstMinuteRoute(graph: RoadGraph, garage: DropOff): FirstMinuteRoute | null {
  const pts = FIRST_MINUTE;
  // each point's lane, running toward the next point (the last toward the garage's door); a point with none near (the
  // roundabout's middle) is passed on the way from the one before to the one after
  const at: number[] = [];
  for (let k = 0; k < pts.length; k++) {
    const [x, z] = pts[k] as P2, [tx, tz] = k + 1 < pts.length ? (pts[k + 1] as P2) : [garage.door.x, garage.door.z];
    const lane = laneToward(graph, x, z, tx, tz);
    if (lane >= 0) at.push(lane);
    else if (k === 0) return null;
  }
  const lanes: number[] = [at[0] as number];
  for (let k = 0; k + 1 < at.length; k++) {
    const leg = lanePath(graph, at[k] as number, at[k + 1] as number);
    if (!leg) return null;
    for (const id of leg.slice(1)) lanes.push(id);
  }
  // the samples: from the start's place on its lane, lane by lane through their junctions, off the last one into the door
  const raw: Pt[] = [];
  const [sx, sz] = pts[0] as P2;
  for (let k = 0; k < lanes.length; k++) {
    const lane = graph.lanes[lanes[k] as number] as Lane, last = k === lanes.length - 1;
    const from = k === 0 ? alongLane(lane, sx, sz).s : 0;
    const to = last ? Math.max(from, alongLane(lane, garage.door.x, garage.door.z).s - TURN_IN) : laneLength(lane);
    laneSpan(lane, from, to, raw);
    if (!last) junctionCurve(lane, graph.lanes[lanes[k + 1] as number] as Lane, raw);
  }
  const lastLane = graph.lanes[lanes[lanes.length - 1] as number] as Lane;
  const turnS = Math.max(0, alongLane(lastLane, garage.door.x, garage.door.z).s - TURN_IN);
  const entryAt = raw.length;
  garageEntry(garage, raw[raw.length - 1] as Pt, laneAt(lastLane, turnS).yaw, raw);
  const samples = resample(raw);
  // the entry's route distance: the sample nearest where the way in began
  const turn = raw[entryAt - 1] as Pt;
  let entryS = 0, bestTurn = Infinity;
  for (const s of samples) { const d = Math.hypot(s.x - turn.x, s.z - turn.z); if (d < bestTurn) { bestTurn = d; entryS = s.s; } }
  // each step at the sample nearest its place, in order along the route
  const steps = {} as Record<FirstMinuteStep, number>;
  let from = 0;
  for (const st of FIRST_MINUTE_STEPS) {
    let best = Infinity, s = from;
    for (const q of samples) {
      if (q.s < from) continue;
      const d = Math.hypot(q.x - st.at[0], q.z - st.at[1]);
      if (d < best) { best = d; s = q.s; }
    }
    steps[st.step] = s;
    from = s;
  }
  return { lanes, samples, steps, entryS };
}
