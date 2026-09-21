/** Directed right-hand lanes. Junction connections are curves, never teleports. */
import type { TrackDef, TrackSample } from '../track';

export const BLOCK = 225;
export const CITY_HALF = 787.5;
export const ROAD_HALF = 12;
export const HIGHWAY_HALF = 19;
export interface RoadNode { id: number; x: number; z: number; outgoing: number[] }
export interface Lane {
  id: number; from: number; to: number; highway: boolean;
  x0: number; z0: number; x1: number; z1: number; yaw: number; next: number[];
}
export interface RoadGraph { nodes: RoadNode[]; lanes: Lane[] }

export function buildRoadGraph(): RoadGraph {
  const nodes: RoadNode[] = [];
  const lanes: Lane[] = [];
  for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) {
    nodes.push({ id: nodes.length, x: x * BLOCK, z: z * BLOCK, outgoing: [] });
  }
  const add = (a: RoadNode, b: RoadNode) => {
    const dx = (b.x - a.x) / BLOCK, dz = (b.z - a.z) / BLOCK;
    const highway = (a.x === b.x && Math.abs(a.x) === 675) || (a.z === b.z && Math.abs(a.z) === 675);
    // +X points left when facing +Z; the right-hand lane is on -X.
    const offset = highway ? 6 : 4.5;
    const inset = 23;
    const lane: Lane = {
      id: lanes.length, from: a.id, to: b.id, highway,
      x0: a.x + dx * inset - dz * offset, z0: a.z + dz * inset + dx * offset,
      x1: b.x - dx * inset - dz * offset, z1: b.z - dz * inset + dx * offset,
      yaw: Math.atan2(dx, dz), next: [],
    };
    lanes.push(lane); a.outgoing.push(lane.id);
  };
  for (const a of nodes) for (const b of nodes) {
    if (Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === BLOCK) add(a, b);
  }
  for (const lane of lanes) {
    // These broad arcade junctions permit U-turns; the connection curve handles them too.
    lane.next = [...(nodes[lane.to] as RoadNode).outgoing];
  }
  return { nodes, lanes };
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
  const length = Math.hypot(lane.x1 - lane.x0, lane.z1 - lane.z0);
  const steps = Math.ceil(length / 3);
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    out.push({ x: lane.x0 + (lane.x1 - lane.x0) * t, z: lane.z0 + (lane.z1 - lane.z0) * t, yaw: lane.yaw, curvature: 0, s: 0 });
  }
  const cx0 = lane.x1 + Math.sin(lane.yaw) * 24, cz0 = lane.z1 + Math.cos(lane.yaw) * 24;
  const cx1 = next.x0 - Math.sin(next.yaw) * 24, cz1 = next.z0 - Math.cos(next.yaw) * 24;
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
