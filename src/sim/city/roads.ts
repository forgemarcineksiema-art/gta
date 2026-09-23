/**
 * Directed right-hand lanes. Junction connections are curves, never teleports.
 * The plan is a 7×7 grid (perimeter loop = highway) plus authored off-grid
 * roads: every lane is a polyline, so diagonals and arcs use the same code as
 * the grid streets, and the bot, reset projection, minimap and traffic (M3)
 * never need to know which is which.
 */
import type { TrackDef, TrackSample } from '../track';

export const BLOCK = 225;
export const CITY_HALF = 787.5;
export const ROAD_HALF = 12;
export const HIGHWAY_HALF = 19;
/** Highway lane centres, metres right of the centreline: two real graph lanes per direction (decision 14, revisited in M4). */
export const HIGHWAY_LANE_OFFSETS = [4, 12] as const;
/** Lane endpoints stop this far from the junction centre; the connection curve fills the rest. */
export const LANE_INSET = 23;

/** A point of a road's centreline or a lane; `y` is its height over the ground (the highway over the crossings), 0 when absent. */
export interface RoadPoint { x: number; z: number; y?: number }

/**
 * The highway over the four crossings with the central streets (M5.5 slice 8; DESIGN.md §5, M4_PLAN §5 B):
 * the deck's height (m), its flat half length over the crossing, each ramp's length. The street passes
 * under to its stub by the sea; the ring no longer meets it there.
 */
export const OVERPASS = { height: 7.5, deck: 24, ramp: 110 } as const;
export const OVERPASS_NODES: ReadonlyArray<readonly [number, number]> = [[0, -3], [0, 3], [-3, 0], [3, 0]];

/** The deck's height `d` m along the ring from an overpass's crossing: flat over it, then a smooth ramp to the ground. */
export function overpassProfile(d: number): number {
  const a = Math.abs(d), o = OVERPASS;
  if (a <= o.deck) return o.height;
  if (a >= o.deck + o.ramp) return 0;
  const t = (o.deck + o.ramp - a) / o.ramp;
  return o.height * t * t * (3 - 2 * t);
}

/** An overpass's frame at a point: along the ring from its crossing, across it, and whether the ring runs along X there. */
export function overpassFrame(k: number, x: number, z: number): { along: number; across: number; alongX: boolean } {
  const [gx, gz] = OVERPASS_NODES[k] as readonly [number, number];
  const alongX = Math.abs(gz) === 3;
  return alongX ? { along: x - gx * BLOCK, across: z - gz * BLOCK, alongX } : { along: z - gz * BLOCK, across: x - gx * BLOCK, alongX };
}

/** The highway's height at a point on its carriageway (within `margin` m of its edges), 0 off the overpasses. */
export function highwayHeightAt(x: number, z: number, margin = 0): number {
  for (let k = 0; k < OVERPASS_NODES.length; k++) {
    const f = overpassFrame(k, x, z);
    if (Math.abs(f.across) > HIGHWAY_HALF + margin) continue;
    const h = overpassProfile(f.along);
    if (h > 0) return h;
  }
  return 0;
}

/** Inside an overpass's footprint (its ramps and deck, grown by `margin` m): the ground's highway things stay out. */
export function underOverpass(x: number, z: number, margin = 0): boolean {
  for (let k = 0; k < OVERPASS_NODES.length; k++) {
    const f = overpassFrame(k, x, z);
    if (Math.abs(f.across) <= HIGHWAY_HALF + margin && Math.abs(f.along) <= OVERPASS.deck + OVERPASS.ramp + margin) return true;
  }
  return false;
}
export interface RoadNode { id: number; x: number; z: number; outgoing: number[] }
export interface Lane {
  id: number; from: number; to: number; highway: boolean;
  /** Metres right of the road centreline this lane was built at. Two highway lanes per direction differ only in this. */
  offset: number;
  /** Authored off-grid road this lane belongs to, if any. */
  special?: string;
  /** Lane centre path from the start point to the end point, inset from both junctions. */
  points: RoadPoint[];
  x0: number; z0: number; x1: number; z1: number;
  /** Heading at the start and at the end of the lane (equal on straight lanes). */
  yaw0: number; yaw: number;
  next: number[];
}
export interface RoadGraph { nodes: RoadNode[]; lanes: Lane[]; special: SpecialRoad[] }

/** An authored road between two grid junctions: a sampled centreline and a half width. */
export interface SpecialRoad {
  name: string;
  /** Grid indices (-3..3) of the two junctions. */
  from: [number, number];
  to: [number, number];
  centre: RoadPoint[];
  halfWidth: number;
  /** Pavement colour family; the chunk generator picks the district colour. */
  kind: 'avenue' | 'service' | 'parkway' | 'quay';
}

const node = (gx: number, gz: number): RoadPoint => ({ x: gx * BLOCK, z: gz * BLOCK });

/** Resample a polyline at a uniform spacing (the last point is kept exactly). */
export function resample(points: RoadPoint[], spacing: number): RoadPoint[] {
  const out: RoadPoint[] = [];
  let carried = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as RoadPoint, b = points[i + 1] as RoadPoint;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = carried; d < len; d += spacing) out.push(height({ x: a.x + (b.x - a.x) * d / len, z: a.z + (b.z - a.z) * d / len }, a, b, d / len));
    carried = ((carried - len) % spacing + spacing) % spacing;
  }
  out.push({ ...(points[points.length - 1] as RoadPoint) });
  return out;
}

function straight(name: string, from: [number, number], to: [number, number], halfWidth: number, kind: SpecialRoad['kind']): SpecialRoad {
  return { name, from, to, halfWidth, kind, centre: resample([node(...from), node(...to)], 9) };
}

/** Circular arc from one junction to another about `centre`, along the shorter sweep. */
function arc(name: string, from: [number, number], to: [number, number], centre: RoadPoint, halfWidth: number, kind: SpecialRoad['kind']): SpecialRoad {
  const a = node(...from), b = node(...to);
  const radius = Math.hypot(a.x - centre.x, a.z - centre.z);
  const t0 = Math.atan2(a.z - centre.z, a.x - centre.x);
  let sweep = Math.atan2(b.z - centre.z, b.x - centre.x) - t0;
  sweep = Math.atan2(Math.sin(sweep), Math.cos(sweep));
  const steps = Math.ceil(Math.abs(sweep) * radius / 4.5);
  const points: RoadPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = t0 + sweep * i / steps;
    points.push({ x: centre.x + Math.cos(t) * radius, z: centre.z + Math.sin(t) * radius });
  }
  points[0] = a; points[points.length - 1] = b;
  return { name, from, to, halfWidth, kind, centre: points };
}

/** Catmull-Rom curve through control points; the first and last are the junctions. */
function spline(name: string, from: [number, number], to: [number, number], control: RoadPoint[], halfWidth: number, kind: SpecialRoad['kind']): SpecialRoad {
  const pts = [node(...from), ...control, node(...to)];
  const raw: RoadPoint[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)] as RoadPoint, p1 = pts[i] as RoadPoint;
    const p2 = pts[i + 1] as RoadPoint, p3 = pts[Math.min(pts.length - 1, i + 2)] as RoadPoint;
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      raw.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      });
    }
  }
  raw.push(pts[pts.length - 1] as RoadPoint);
  return { name, from, to, halfWidth, kind, centre: resample(raw, 4.5) };
}

/**
 * The M2.2 loop: each district contributes one road that asks for different
 * driving. Crown: two straight diagonals aimed at the tower. Sunset Works: a
 * narrow service chicane through the yards. Palm Gardens: a 225 m radius
 * parkway arc. Coral Quay: a 503 m radius sweep along the quay.
 */
export const SPECIAL_ROADS: SpecialRoad[] = [
  straight('Crown Diagonal West', [-3, -1], [-2, -2], 12, 'avenue'),
  straight('Crown Diagonal North', [-2, -2], [-1, -3], 12, 'avenue'),
  spline('Works Chicane', [1, -2], [2, -1], [{ x: 300, z: -425 }, { x: 340, z: -370 }, { x: 340, z: -305 }, { x: 395, z: -250 }], 8, 'service'),
  arc('Garden Parkway', [-1, 2], [-2, 1], { x: -225, z: 225 }, 10, 'parkway'),
  arc('Quay Sweep', [2, 1], [1, 2], { x: 675, z: 675 }, 12, 'quay'),
];

/** A point between `a` and `b` at `t` keeps their height when they have one. */
function height(p: RoadPoint, a: RoadPoint, b: RoadPoint, t: number): RoadPoint {
  if (a.y === undefined && b.y === undefined) return p;
  p.y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t;
  return p;
}

/** Offset a polyline to its right (facing along it); +X is left when facing +Z. */
function offsetRight(points: RoadPoint[], offset: number): RoadPoint[] {
  return points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)] as RoadPoint, next = points[Math.min(points.length - 1, i + 1)] as RoadPoint;
    const tx = next.x - prev.x, tz = next.z - prev.z, len = Math.hypot(tx, tz) || 1;
    return p.y === undefined ? { x: p.x - tz / len * offset, z: p.z + tx / len * offset } : { x: p.x - tz / len * offset, z: p.z + tx / len * offset, y: p.y };
  });
}

/** Cut `inset` metres off both ends of a polyline, measured along it. */
function trim(points: RoadPoint[], inset: number): RoadPoint[] {
  const cut = (pts: RoadPoint[]): RoadPoint[] => {
    let left = inset;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i] as RoadPoint, b = pts[i + 1] as RoadPoint;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < left) { left -= len; continue; }
      const t = left / len;
      return [height({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, a, b, t), ...pts.slice(i + 1)];
    }
    return pts.slice(-1);
  };
  return cut(cut(points).reverse()).reverse();
}

export function buildRoadGraph(): RoadGraph {
  const nodes: RoadNode[] = [];
  const lanes: Lane[] = [];
  for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) {
    nodes.push({ id: nodes.length, x: x * BLOCK, z: z * BLOCK, outgoing: [] });
  }
  const nodeAt = (gx: number, gz: number): RoadNode => nodes[(gz + 3) * 7 + (gx + 3)] as RoadNode;
  const add = (a: RoadNode, b: RoadNode, centre: RoadPoint[], highway: boolean, special?: string, halfWidth = ROAD_HALF, laneOffset?: number) => {
    const offset = laneOffset ?? Math.min(4.5, halfWidth - 3.5);
    const points = offsetRight(trim(centre, LANE_INSET), offset);
    const first = points[0] as RoadPoint, second = points[1] as RoadPoint;
    const last = points[points.length - 1] as RoadPoint, before = points[points.length - 2] as RoadPoint;
    const lane: Lane = {
      id: lanes.length, from: a.id, to: b.id, highway, offset, points,
      x0: first.x, z0: first.z, x1: last.x, z1: last.z,
      yaw0: Math.atan2(second.x - first.x, second.z - first.z), yaw: Math.atan2(last.x - before.x, last.z - before.z),
      next: [], ...(special ? { special } : {}),
    };
    lanes.push(lane); a.outgoing.push(lane.id);
  };
  const overpass = (n: RoadNode): boolean => OVERPASS_NODES.some(([gx, gz]) => n.x === gx * BLOCK && n.z === gz * BLOCK);
  for (const a of nodes) for (const b of nodes) {
    if (Math.abs(a.x - b.x) + Math.abs(a.z - b.z) !== BLOCK) continue;
    const highway = (a.x === b.x && Math.abs(a.x) === 675) || (a.z === b.z && Math.abs(a.z) === 675);
    // the ring over a crossing is one lane from the node before to the node after (below)
    if (highway && (overpass(a) || overpass(b))) continue;
    const centre = [{ x: a.x, z: a.z }, { x: b.x, z: b.z }];
    if (highway) for (const off of HIGHWAY_LANE_OFFSETS) add(a, b, centre, true, undefined, ROAD_HALF, off);
    else add(a, b, centre, false);
  }
  for (const [gx, gz] of OVERPASS_NODES) {
    const alongX = Math.abs(gz) === 3;
    const before = alongX ? nodeAt(gx - 1, gz) : nodeAt(gx, gz - 1), after = alongX ? nodeAt(gx + 1, gz) : nodeAt(gx, gz + 1);
    const centre = resample([{ x: before.x, z: before.z }, { x: after.x, z: after.z }], 6).map((p) => ({ ...p, y: highwayHeightAt(p.x, p.z) }));
    for (const off of HIGHWAY_LANE_OFFSETS) add(before, after, centre, true, undefined, ROAD_HALF, off);
    for (const off of HIGHWAY_LANE_OFFSETS) add(after, before, [...centre].reverse(), true, undefined, ROAD_HALF, off);
  }
  for (const road of SPECIAL_ROADS) {
    const a = nodeAt(...road.from), b = nodeAt(...road.to);
    add(a, b, road.centre, false, road.name, road.halfWidth);
    add(b, a, [...road.centre].reverse(), false, road.name, road.halfWidth);
  }
  for (const lane of lanes) {
    // These broad arcade junctions permit U-turns; the connection curve handles them too.
    lane.next = [...(nodes[lane.to] as RoadNode).outgoing];
  }
  return { nodes, lanes, special: SPECIAL_ROADS };
}

/** A deterministic Euler tour visits every directed lane, including the perimeter. */
export function roadTour(graph: RoadGraph): number[] {
  const remaining = graph.nodes.map((n) => [...n.outgoing]);
  const stack: Array<{ node: number; via: number }> = [{ node: 24, via: -1 }];
  const reversed: number[] = [];
  while (stack.length) {
    const top = stack[stack.length - 1] as { node: number; via: number };
    const edge = remaining[top.node]?.pop();
    if (edge === undefined) { stack.pop(); if (top.via >= 0) reversed.push(top.via); }
    else stack.push({ node: (graph.lanes[edge] as Lane).to, via: edge });
  }
  return reversed.reverse();
}

/** Sample a lane and its connection at <= 3 m. Shared by bot and future traffic. */
export function lanePath(lane: Lane, next: Lane): TrackSample[] {
  const out: TrackSample[] = [];
  for (let i = 0; i + 1 < lane.points.length; i++) {
    const a = lane.points[i] as RoadPoint, b = lane.points[i + 1] as RoadPoint;
    const length = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(length / 3);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw, curvature: 0, s: 0 });
    }
  }
  const cx0 = lane.x1 + Math.sin(lane.yaw) * 24, cz0 = lane.z1 + Math.cos(lane.yaw) * 24;
  const cx1 = next.x0 - Math.sin(next.yaw0) * 24, cz1 = next.z0 - Math.cos(next.yaw0) * 24;
  for (let i = 0; i < 24; i++) {
    const t = i / 24, u = 1 - t;
    out.push({
      x: u ** 3 * lane.x1 + 3 * u * u * t * cx0 + 3 * u * t * t * cx1 + t ** 3 * next.x0,
      z: u ** 3 * lane.z1 + 3 * u * u * t * cz0 + 3 * u * t * t * cz1 + t ** 3 * next.z0,
      yaw: 0, curvature: 0, s: 0,
    });
  }
  return out;
}

/** Closest point on a lane's polyline; returns squared distance and writes the projection. */
export function projectOnLane(lane: Lane, x: number, z: number, out: { x: number; z: number; yaw: number; y?: number }, y?: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < lane.points.length; i++) {
    const a = lane.points[i] as RoadPoint, b = lane.points[i + 1] as RoadPoint;
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const px = a.x + dx * t, pz = a.z + dz * t, py = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t;
    // with a height given, a lane over or under counts its height gap (the street under a bridge is not the bridge)
    const dist = (x - px) ** 2 + (z - pz) ** 2 + (y === undefined ? 0 : 4 * (y - py) ** 2);
    if (dist < best) { best = dist; out.x = px; out.z = pz; out.yaw = Math.atan2(dx, dz); out.y = py; }
  }
  return best;
}

/** Squared distance from a point to a sampled centreline. */
export function distanceToPolyline(points: RoadPoint[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as RoadPoint, b = points[i + 1] as RoadPoint;
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2);
  }
  return Math.sqrt(best);
}

export interface CityRoute extends TrackDef { laneAtSample: number[] }
export function buildCityRoute(graph: RoadGraph): CityRoute {
  const tour = roadTour(graph);
  const raw: Array<{ x: number; z: number; lane: number }> = [];
  for (let i = 0; i < tour.length; i++) {
    const lane = graph.lanes[tour[i] as number] as Lane;
    const next = graph.lanes[tour[(i + 1) % tour.length] as number] as Lane;
    for (const p of lanePath(lane, next)) raw.push({ x: p.x, z: p.z, lane: lane.id });
  }
  // Uniform spacing is required by the pursuit controller's speed planner.
  const samples: TrackSample[] = [], laneAtSample: number[] = [];
  let carried = 0, distance = 0;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i] as typeof raw[number], b = raw[(i + 1) % raw.length] as typeof raw[number];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = carried; d < len; d += 3) {
      samples.push({ x: a.x + (b.x - a.x) * d / len, z: a.z + (b.z - a.z) * d / len, yaw: 0, curvature: 0, s: distance });
      laneAtSample.push(a.lane); distance += 3;
    }
    carried = (carried - len) % 3; if (carried < 0) carried += 3;
  }
  for (let i = 0; i < samples.length; i++) {
    const prev = samples[(i + samples.length - 1) % samples.length] as TrackSample;
    const p = samples[i] as TrackSample, next = samples[(i + 1) % samples.length] as TrackSample;
    p.yaw = Math.atan2(next.x - prev.x, next.z - prev.z);
    const a = Math.atan2(p.x - prev.x, p.z - prev.z), b = Math.atan2(next.x - p.x, next.z - p.z);
    p.curvature = Math.atan2(Math.sin(b - a), Math.cos(b - a)) / 3;
  }
  const first = samples[0] as TrackSample;
  return { samples, laneAtSample, gates: [], origin: { x: 0, z: 0 }, width: 24, length: distance, start: { x: first.x, z: first.z, yaw: first.yaw } };
}
