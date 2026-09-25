/**
 * What the traffic, the walkers and the police read of the streets they drive and walk (M8.10 slice 13): the grid's
 * city or the island. The lanes (the grid's `RoadGraph`), the kerbside bays, the districts, the lit junctions and each
 * lane's phase at one, the ground's height and a walker's foot on the footway, a lane's footway and its road's kind.
 */
import type { City } from '../city/City';
import { districtAt } from '../city/City';
import type { ParkingBay } from '../city/markings';
import { BLOCK, CITY_HALF, type Lane, type RoadGraph } from '../city/roads';
import { SIGNAL, signalledNodes } from '../city/signals';
import type { RoadKind } from './bodies';

export interface StreetMap {
  readonly graph: RoadGraph;
  /** The kerbside bays the parked cars stand in. */
  readonly bays: readonly ParkingBay[];
  /** The district's id at a point (the traffic's bodies, the walkers' looks). */
  district(x: number, z: number): string;
  /** The junctions with lights. */
  readonly signals: readonly number[];
  /** A lane's phase arriving at its junction's light: 0 or 1, the crossing ways' green in turn. */
  signalAxis(lane: Lane): 0 | 1;
  /** A light's place in the town's green wave, in steps of the tuning's offset. */
  signalStep(node: number): number;
  /** The ground's height at a point: where a car stands off its lane. */
  groundAt(x: number, z: number): number;
  /** The road's surface at a point across a junction (the grid's flat 0), or null to go straight from lane to lane. */
  readonly roadAt: ((x: number, z: number) => number) | null;
  /** Where a walker's foot is at a point on a footway (its top). */
  footAt(x: number, z: number): number;
  /** Metres right of a lane's line to the middle of its footway; NaN where it has none. */
  footway(lane: Lane): number;
  /** A lane's road's kind (its limit, its bodies), or null for the graph's own rule. */
  kind(lane: Lane): RoadKind | null;
  /** The half side of the square the map fits in (the helicopter's reach). */
  readonly half: number;
  /** The moving traffic's count by the lanes' length round the player (the island's), else the grid's fixed count. */
  readonly byKm: boolean;
  /** The level crossings (the island's railway): the cars stop short of one while it is shut. */
  readonly crossings: readonly LevelStop[];
  /**
   * The lane nearest a point, -1 with none; with the road's height under it given (`groundAt` for the street), a lane
   * over or under counts its height gap: the street, not a deck over it.
   */
  nearestLane(x: number, z: number, y?: number): number;
}

/**
 * A level crossing as the traffic reads it: where its road meets the rails, the road's half width, how far along the road
 * each barrier stands from the rails' middle, and whether it is shut (its barriers lowering, down or rising), live.
 */
export interface LevelStop { readonly x: number; readonly z: number; readonly half: number; readonly out: number; readonly closed: boolean }

/** Half the grid's footway strip (m), its path down its middle. */
const PAVEMENT_HALF = 2.25;

/** The grid's streets as the traffic has always read them. */
export function cityStreets(city: City): StreetMap {
  return {
    graph: city.graph,
    bays: city.roadMarkings.parking,
    district: (x, z) => districtAt(x, z).id,
    signals: signalledNodes(city.graph),
    signalAxis: (l) => {
      const pts = l.points, a = pts[pts.length - 2], b = pts[pts.length - 1];
      return a && b && Math.abs(b.x - a.x) < Math.abs(b.z - a.z) ? 1 : 0;
    },
    signalStep: (node) => {
      const n = city.graph.nodes[node];
      return n ? Math.round(n.x / BLOCK) + Math.round(n.z / BLOCK) + 2 * SIGNAL.within : 0;
    },
    groundAt: () => 0,
    roadAt: null,
    footAt: () => 0,
    footway: (l) => {
      let roadHalf = 12;
      let laneOffset = 4.5;
      if (l.highway) {
        roadHalf = 19;
        laneOffset = 6;
        // only the side that faces the city: the outer verge is parkland
        const mid = l.points[l.points.length >> 1] ?? l.points[0];
        if (!mid) return NaN;
        const rx = -Math.cos(l.yaw);
        const rz = Math.sin(l.yaw);
        if (rx * -mid.x + rz * -mid.z <= 0) return NaN;
      } else if (l.special) {
        for (const road of city.graph.special) {
          if (road.name !== l.special) continue;
          roadHalf = road.halfWidth;
          laneOffset = Math.min(4.5, road.halfWidth - 3.5);
        }
      }
      return roadHalf + PAVEMENT_HALF - laneOffset;
    },
    kind: () => null,
    half: CITY_HALF,
    byKm: false,
    crossings: [],
    nearestLane: (x, z, y) => city.nearestLane(x, z, y),
  };
}
