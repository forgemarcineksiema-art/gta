/**
 * The island's main road network (M8.10 slice 4, docs/M8.10_PLAN.md): the plan's roads sampled, joined where one's end
 * meets another (a T, a corner, a roundabout's spoke), split there into edges, and laned both ways at each class's
 * offsets (the highway two a way as the grid's), the roundabouts one way round with the centre on the left. The result
 * is the grid's `RoadGraph`, so `lanePath`, `projectOnLane`, the traffic, the police, the bot and the way read it as they
 * read the grid's. The highway crosses nothing at grade: where another road runs across it, it passes over or under
 * (its deck over a passage, its tunnel under the hill), and no node is made. A lane point's `y` is its height: the
 * ground's where the road runs on it, the tunnel's or the deck's where it does not.
 */
import { HIGHWAY_LANE_OFFSETS, type Lane, type RoadGraph, type RoadNode, type RoadPoint } from '../city/roads';
import { catmullRom, resample, type P2 } from './geom';
import { HALF_WIDTH, MAX_GRADE, type Ground } from './ground';
import { RINGS, ROADS, highwayLoop, type RoadClass, type SpanKind } from './plan';
import { districtStreets } from './streets';

/** A road's ends join another road within this (m); joins this close along a road are one node. */
const JOIN = 3;
const MERGE = 8;
/** The centrelines are sampled about this often (m); a lane's first and last steps are at least `MIN_STEP`. */
const SAMPLE = 6;
const MIN_STEP = 3;
/** How far a lane stops short of a node: the widest road there plus this (m); a roundabout's own lanes stop `RING_INSET` short. */
const INSET_PAD = 8;
const RING_INSET = 6;
/** Where the highway leaves the ground, its deck's least height over the sea (m), by span. */
const DECK: Readonly<Record<SpanKind, number>> = { ground: 0, tunnel: 0, viaduct: 8, bridge: 10, overpass: 0 };

/** A sampled line of the network: its points (with the tunnel's or a deck's height where it leaves the ground), its class. */
interface Line { id: string; cls: RoadClass; pts: RoadPoint[]; onGround: boolean[]; firm: boolean[]; closed: boolean; ring: boolean; s: number[] }
/** A lane eases between the ground and the tunnel's or a deck's profile over this many samples each side of the change. */
const EASE = 3;

/** The graph, its sampled lines, and each lane's road (by id). */
export interface IslandNetwork { graph: RoadGraph; lines: Line[]; laneRoad: string[] }

/**
 * Whether a lane's point runs on the ground: its line's nearest point is firmly on it (the highway leaves it in the
 * tunnel and on the decks, and eases off it at their ends).
 */
export function onTheGround(net: IslandNetwork, lane: { highway: boolean }, x: number, z: number): boolean {
  if (!lane.highway) return true;
  const line = net.lines[0] as Line;
  return line.firm[nearestIndex(line, { x, z })] as boolean;
}

/** Arc lengths along a polyline (closed: the last entry is the whole loop). */
function lengths(pts: readonly RoadPoint[], closed: boolean): number[] {
  const s = [0];
  const n = pts.length, last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = pts[i] as RoadPoint, b = pts[(i + 1) % n] as RoadPoint;
    s.push((s[i] as number) + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return s;
}

/** The point `s` along a line (wrapped on a closed one), its height interpolated. */
function pointAt(line: Line, s: number): RoadPoint {
  const total = line.s[line.s.length - 1] as number;
  const d = line.closed ? ((s % total) + total) % total : Math.max(0, Math.min(total, s));
  const n = line.pts.length;
  for (let i = 0; i + 1 < line.s.length; i++) {
    const s0 = line.s[i] as number, s1 = line.s[i + 1] as number;
    if (d > s1 && i + 2 < line.s.length) continue;
    const a = line.pts[i] as RoadPoint, b = line.pts[(i + 1) % n] as RoadPoint, t = s1 > s0 ? (d - s0) / (s1 - s0) : 0;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t };
  }
  return { ...(line.pts[0] as RoadPoint) };
}

/** The nearest point of a line to (x, z): its distance and how far along. */
function project(line: Line, x: number, z: number): { d: number; s: number } {
  let best = { d: Infinity, s: 0 };
  const n = line.pts.length, last = line.closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = line.pts[i] as RoadPoint, b = line.pts[(i + 1) % n] as RoadPoint, dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best.d) best = { d, s: (line.s[i] as number) + t * Math.sqrt(len2) };
  }
  return best;
}

/** The part of a line from `s0` to `s1` (along it; past its end on a closed one), the ends exact. */
function slice(line: Line, s0: number, s1: number): RoadPoint[] {
  const out: RoadPoint[] = [pointAt(line, s0)];
  const total = line.s[line.s.length - 1] as number;
  for (let lap = 0; lap <= (line.closed ? 1 : 0); lap++) {
    for (let i = 0; i < line.pts.length; i++) {
      const s = (line.s[i] as number) + lap * total;
      if (s > s0 + 0.5 && s < s1 - 0.5) out.push({ ...(line.pts[i] as RoadPoint) });
    }
  }
  out.push(pointAt(line, s1));
  return out;
}

/** The highway's loop and the other roads, sampled; the tunnel's and the decks' heights between their ends' ground. */
function lines(ground: Ground): Line[] {
  const out: Line[] = [];
  const sample = (points: readonly P2[], smooth: boolean): RoadPoint[] => (smooth ? catmullRom(points, false, SAMPLE) : resample(points, SAMPLE)).map(([x, z]) => ({ x, z }));
  // the highway: one smooth loop, each stretch off the ground with its own profile between the ground at its two ends
  const loop = highwayLoop(SAMPLE);
  const pts: RoadPoint[] = loop.pts.map(([x, z]) => ({ x, z }));
  const spanAt = (i: number): SpanKind => loop.span[(i + pts.length) % pts.length] as SpanKind;
  const onGround = pts.map((_, i) => spanAt(i) === 'ground');
  for (let i = 0; i < pts.length; i++) {
    if (onGround[i] || onGround[(i - 1 + pts.length) % pts.length] === false) continue;
    // a stretch off the ground starts here (its first point is the mouth or the abutment, on the ground's edge)
    let end = i;
    while (!onGround[(end + 1) % pts.length]) end++;
    const run = Array.from({ length: end - i + 2 }, (_, k) => pts[(i + k) % pts.length] as RoadPoint);
    const first = run[0] as RoadPoint, last = run[run.length - 1] as RoadPoint, span = spanAt(i);
    const h0 = ground.highwayAt(first.x, first.z) ?? ground.surfaceHeight(first.x, first.z), h1 = ground.highwayAt(last.x, last.z) ?? ground.surfaceHeight(last.x, last.z);
    const s = lengths(run, false), total = s[s.length - 1] as number, grade = MAX_GRADE.highway;
    run.slice(0, -1).forEach((q, k) => {
      const d = s[k] as number;
      // the tunnel straight between its mouths; a deck up at the highway's grade to its height over the sea, and down
      const line = h0 + ((h1 - h0) * d) / total;
      // an overpass carries the highway's own graded profile over the road beneath
      q.y = span === 'overpass' ? (ground.highwayAt(q.x, q.z) ?? line) : span === 'tunnel' ? line : Math.max(line, Math.min(DECK[span], h0 + grade * d, h1 + grade * (total - d)));
    });
  }
  out.push({ id: 'highway', cls: 'highway', pts, onGround, firm: [], closed: true, ring: false, s: [] });
  for (const r of [...ROADS, ...districtStreets().roads]) {
    const p = sample(r.points, r.smooth);
    out.push({ id: r.id, cls: r.cls, pts: p, onGround: p.map(() => true), firm: [], closed: false, ring: false, s: [] });
  }
  for (const g of RINGS) {
    const n = Math.max(12, Math.round((2 * Math.PI * g.r) / SAMPLE));
    const p: RoadPoint[] = [];
    // the way round with the centre on the left (+X is a car's left facing +Z): the angle rising, x = sin, z = cos
    for (let k = 0; k < n; k++) { const a = (2 * Math.PI * k) / n; p.push({ x: g.x + Math.sin(a) * g.r, z: g.z + Math.cos(a) * g.r }); }
    out.push({ id: g.id, cls: g.cls, pts: p, onGround: p.map(() => true), firm: [], closed: true, ring: true, s: [] });
  }
  for (const l of out) {
    l.s = lengths(l.pts, l.closed);
    // every point its height, the ground's where it runs on it, so a cut between two points has one too
    l.pts.forEach((p, i) => { if (l.onGround[i]) p.y = ground.surfaceHeight(p.x, p.z); });
    // firmly on the ground: `EASE` samples from a tunnel's mouth or a deck's end, where the lanes ease from one to the other
    const n = l.pts.length;
    l.firm = l.onGround.map((g, i) => {
      for (let k = -EASE; k <= EASE; k++) {
        const j = l.closed ? (((i + k) % n) + n) % n : Math.max(0, Math.min(n - 1, i + k));
        if (!l.onGround[j]) return false;
      }
      return g;
    });
  }
  return out;
}

/** Offset a polyline to its right by `offset` (+X is left facing +Z), keeping each point's height. */
function offsetRight(points: readonly RoadPoint[], offset: number): RoadPoint[] {
  return points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)] as RoadPoint, next = points[Math.min(points.length - 1, i + 1)] as RoadPoint;
    const tx = next.x - prev.x, tz = next.z - prev.z, len = Math.hypot(tx, tz) || 1;
    return { x: p.x - (tz / len) * offset, z: p.z + (tx / len) * offset, ...(p.y === undefined ? {} : { y: p.y }) };
  });
}

/** Cut `a` metres off a polyline's start and `b` off its end, along it. */
function trim(points: readonly RoadPoint[], a: number, b: number): RoadPoint[] {
  const cut = (pts: RoadPoint[], left: number): RoadPoint[] => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i] as RoadPoint, q = pts[i + 1] as RoadPoint, len = Math.hypot(q.x - p.x, q.z - p.z);
      if (len < left) { left -= len; continue; }
      const t = left / len;
      const at = { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, ...(p.y === undefined ? {} : { y: p.y + ((q.y ?? p.y) - p.y) * t }) };
      // no stub of a first step: a point within `MIN_STEP` of the cut goes
      const rest = pts.slice(i + 1);
      if (rest.length > 1 && Math.hypot((rest[0] as RoadPoint).x - at.x, (rest[0] as RoadPoint).z - at.z) < MIN_STEP) rest.shift();
      return [at, ...rest];
    }
    return pts.slice(-2);
  };
  return cut(cut([...points], a).reverse(), b).reverse();
}

/** Build the island's network on its ground. */
export function buildNetwork(ground: Ground): IslandNetwork {
  const all = lines(ground);
  // the nodes: every road's ends, each on another line (a ring for a spoke), those within MERGE one node
  const nodes: RoadNode[] = [];
  for (const [i, l] of all.entries()) {
    if (l.closed) continue;
    for (const end of [l.pts[0], l.pts[l.pts.length - 1]] as RoadPoint[]) {
      if (!all.some((m, j) => j !== i && project(m, end.x, end.z).d < JOIN)) throw new Error(`network: ${l.id} ends in a field at ${end.x.toFixed(0)}, ${end.z.toFixed(0)}`);
      if (!nodes.some((n) => Math.hypot(n.x - end.x, n.z - end.z) < MERGE)) nodes.push({ id: nodes.length, x: end.x, z: end.z, outgoing: [] });
    }
  }
  // and every crossing of a district's street with another road, at grade
  for (const [x, z] of districtStreets().junctions) if (!nodes.some((n) => Math.hypot(n.x - x, n.z - z) < MERGE)) nodes.push({ id: nodes.length, x, z, outgoing: [] });
  // each line stops at every node on it (a road running through a junction another's end makes stops there too)
  const stops: Array<Array<{ s: number; node: number }>> = all.map((l) => {
    const list: Array<{ s: number; node: number }> = [];
    for (const n of nodes) {
      const hit = project(l, n.x, n.z);
      if (hit.d < JOIN + MERGE / 2) list.push({ s: hit.s, node: n.id });
    }
    return list.sort((a, b) => a.s - b.s);
  });
  // each node's widest road, for the lanes' insets
  const widest = new Map<number, number>();
  all.forEach((l, i) => { for (const st of stops[i] as Array<{ s: number; node: number }>) widest.set(st.node, Math.max(widest.get(st.node) ?? 0, l.ring ? 0 : HALF_WIDTH[l.cls])); });
  const lanes: Lane[] = [], laneRoad: string[] = [];
  const addLane = (from: number, to: number, centre: RoadPoint[], line: Line, offset: number, onGround: (p: RoadPoint) => boolean): void => {
    let insetA = line.ring ? RING_INSET : (widest.get(from) ?? 0) + INSET_PAD;
    let insetB = line.ring ? RING_INSET : (widest.get(to) ?? 0) + INSET_PAD;
    // a short edge keeps a few metres of lane between its insets
    const length = lengths(centre, false).pop() as number;
    if (insetA + insetB > length - 4) { const k = Math.max(0, length - 4) / (insetA + insetB); insetA *= k; insetB *= k; }
    // firmly on the ground its height is the ground's; else its line's at its place along it (the tunnel, a deck, the ease)
    const pts = offsetRight(trim(centre, insetA, insetB), offset).map((p) => ({ x: p.x, z: p.z, y: onGround(p) ? ground.surfaceHeight(p.x, p.z) : (pointAt(line, project(line, p.x, p.z).s).y ?? 0) }));
    if (pts.length < 2) return;
    const first = pts[0] as RoadPoint, second = pts[1] as RoadPoint, last = pts[pts.length - 1] as RoadPoint, before = pts[pts.length - 2] as RoadPoint;
    const lane: Lane = {
      id: lanes.length, from, to, highway: line.cls === 'highway', offset, points: pts,
      x0: first.x, z0: first.z, x1: last.x, z1: last.z,
      yaw0: Math.atan2(second.x - first.x, second.z - first.z), yaw: Math.atan2(last.x - before.x, last.z - before.z), next: [],
    };
    lanes.push(lane);
    laneRoad.push(line.id);
    (nodes[from] as RoadNode).outgoing.push(lane.id);
  };
  all.forEach((l, i) => {
    const st = stops[i] as Array<{ s: number; node: number }>;
    const total = l.s[l.s.length - 1] as number;
    const edges = l.closed ? st.map((a, k) => [a, st[(k + 1) % st.length] as { s: number; node: number }] as const) : st.slice(0, -1).map((a, k) => [a, st[k + 1] as { s: number; node: number }] as const);
    for (const [a, b] of edges) {
      const s1 = b.s > a.s ? b.s : b.s + total;
      const centre = slice(l, a.s, s1);
      // on the ground unless its nearest centre point is the tunnel's, a deck's or their ease's
      const onGround = (p: RoadPoint): boolean => l.firm[nearestIndex(l, p)] as boolean;
      const offsets = l.cls === 'highway' ? HIGHWAY_LANE_OFFSETS : [l.ring ? 0 : Math.min(4.5, HALF_WIDTH[l.cls] - 3.5)];
      for (const off of offsets) {
        addLane(a.node, b.node, centre, l, off, onGround);
        if (!l.ring) addLane(b.node, a.node, [...centre].reverse(), l, off, onGround);
      }
    }
  });
  // the next lanes: every lane out of the node but the way back along the highway's own carriageway
  for (const lane of lanes) {
    const node = nodes[lane.to] as RoadNode;
    lane.next = node.outgoing.filter((id) => {
      const o = lanes[id] as Lane;
      return !(lane.highway && o.highway && o.to === lane.from);
    });
  }
  return { graph: { nodes, lanes, special: [] }, lines: all, laneRoad };
}

/** The index of a line's point nearest to `p`. */
function nearestIndex(line: Line, p: RoadPoint): number {
  let best = 0, bestD = Infinity;
  line.pts.forEach((q, i) => { const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bestD) { bestD = d; best = i; } });
  return best;
}
