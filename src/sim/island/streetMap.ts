/**
 * The island's streets as the traffic, the walkers and the police read them (M8.10 slice 13): its network's lanes, the
 * surfaces' kerbside bays, the plan's districts, lights at the avenues' junctions (the crossing ways green in turn,
 * by the way each arrives), the ground's height and the pavements' tops, each lane's road's kind by its class, the
 * railway's level crossings.
 */
import type { Lane } from '../city/roads';
import type { RoadKind } from '../traffic/bodies';
import type { StreetMap } from '../traffic/streets';
import { HALF_WIDTH } from './ground';
import { CHUNK_X0, CHUNK_Z0, type Island } from './Island';
import type { WorksPlace } from './places/works';
import { districtOf, type RoadClass } from './plan';
import { PAVEMENT } from './surfaces';

/** Each class's kind for the traffic (its limit and its bodies). */
const KIND: Readonly<Record<RoadClass, RoadKind>> = {
  highway: 'highway', avenue: 'avenue', street: 'street', side: 'street', serpentine: 'parkway', ramp: 'avenue', dirt: 'service', taxiway: 'service',
};
/** The classes with a footway both sides. */
const WALKED: ReadonlySet<RoadClass> = new Set<RoadClass>(['avenue', 'street', 'side']);
/** Two ways arriving at a light are one phase when their headings are within this of each other or of opposite (rad). */
const SAME_WAY = Math.PI / 4;

export function islandStreets(island: Island): StreetMap {
  const net = island.network, graph = net.graph;
  const lineOf = new Map(net.lines.map((l) => [l.id, l]));
  const road = (lane: Lane): { cls: RoadClass; ring: boolean } | undefined => {
    const l = lineOf.get(net.laneRoad[lane.id] ?? '');
    return l ? { cls: l.cls, ring: l.ring } : undefined;
  };
  // the lights: a junction of three ways or more with an avenue among them, no highway, ramp or roundabout at it
  const signals: number[] = [];
  const axis = new Uint8Array(graph.lanes.length);
  for (const node of graph.nodes) {
    const touching = graph.lanes.filter((l) => l.from === node.id || l.to === node.id);
    const roads = touching.map(road);
    if (roads.some((r) => !r || r.ring || r.cls === 'highway' || r.cls === 'ramp') || !roads.some((r) => r?.cls === 'avenue')) continue;
    const ways = new Set(touching.map((l) => (l.from === node.id ? l.to : l.from)));
    if (ways.size < 3) continue;
    // each arriving lane's phase: with the first arriving way's heading (either way along it) or across it; a
    // junction whose ways all run one way (a road joining at a slant) gets no light
    const arriving = touching.filter((l) => l.to === node.id).sort((a, b) => a.id - b.id);
    const first = arriving[0];
    if (!first) continue;
    const phase = arriving.map((l) => {
      const d = Math.abs(Math.atan2(Math.sin(l.yaw - first.yaw), Math.cos(l.yaw - first.yaw)));
      return d < SAME_WAY || d > Math.PI - SAME_WAY ? 0 : 1;
    });
    if (!phase.includes(1)) continue;
    arriving.forEach((l, k) => { axis[l.id] = phase[k] as number; });
    signals.push(node.id);
  }
  return {
    graph,
    bays: island.surfaces.parking,
    district: (x, z) => districtOf(x, z),
    signals,
    signalAxis: (l) => (axis[l.id] === 1 ? 1 : 0),
    signalStep: (node) => node % 4,
    // the drawn ground (over the tunnel its lid's, not the physics' trench under it)
    groundAt: (x, z) => island.ground.surfaceHeight(x, z),
    // a junction's box is the road's own surface (the lanes' heights are the ground's where they run on it)
    roadAt: (x, z) => island.ground.surfaceHeight(x, z),
    footAt: (x, z) => island.standAt(x, z),
    footway: (l) => {
      const r = road(l);
      return r && !l.highway && WALKED.has(r.cls) ? HALF_WIDTH[r.cls] + PAVEMENT / 2 - l.offset : NaN;
    },
    kind: (l) => {
      const r = road(l);
      return r ? KIND[r.cls] : null;
    },
    half: Math.max(-CHUNK_X0, -CHUNK_Z0),
    byKm: true,
    // the Works' level crossings, shut while the freight train comes (slice 9)
    crossings: (island.places.find((p) => p.id === 'works') as WorksPlace | undefined)?.crossings ?? [],
    nearestLane: (x, z, y) => island.nearestLane(x, z, y),
  };
}
