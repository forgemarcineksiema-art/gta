/** Metre-based paint, junction furniture and usable parallel parking for every road in the city. */
import { PALETTE } from '../palette';
import { quatFromYaw, type StaticDesc } from '../scene';
import { Architecture } from './architecture';
import { BLOCK, HIGHWAY_HALF, HIGHWAY_LANE_OFFSETS, ROAD_HALF, distanceToPolyline, type RoadGraph, type RoadPoint, type SpecialRoad } from './roads';

/** Halfway between the two highway lane centres: where the lane dash goes. */
const HIGHWAY_LANE_DIVIDER = (HIGHWAY_LANE_OFFSETS[0] + HIGHWAY_LANE_OFFSETS[1]) / 2;

export const PARKING = { width: 3, length: 7, kerbGap: 0.35 } as const;
/** How each district uses its kerb: spaces per group, groups kept (1 = all), line colour, P stencil. */
export const PARKING_STYLE: Record<string, { group: number; every: number; colour: number; symbol: boolean }> = {
  crown: { group: 5, every: 1, colour: PALETTE.roadWhite, symbol: true },
  marina: { group: 5, every: 1, colour: PALETTE.roadWhite, symbol: true },
  // Quieter residential kerbs: short groups, every second one left unmarked.
  gardens: { group: 3, every: 2, colour: PALETTE.roadWhite, symbol: true },
  // Yellow lines and no P: loading bays for the yards, not visitor parking.
  foundry: { group: 3, every: 1, colour: PALETTE.roadYellow, symbol: false },
};
export interface ParkingBay {
  road: string; x: number; z: number; yaw: number;
  width: number; length: number;
}
type RoadKind = 'street' | SpecialRoad['kind'] | 'highway';
interface Road { id: string; kind: RoadKind; points: RoadPoint[]; halfWidth: number; district: string }
interface Frame extends RoadPoint { tx: number; tz: number }
/**
 * One approach to a junction, in metres from the node: where the centreline has left the other arms, the crossing
 * centre, the stop line. A tangential join (the parkway, M7 slice 11) has no stop line: `merge` is where its approach
 * half has left the other arm, `giveWay` its double broken line's first row.
 */
export interface Approach { road: string; end: boolean; exit: number; crossing: number | null; stop: number | null; merge: number | null; giveWay: number | null }
interface Run { s0: number; s1: number; segment: number; offset: number; width: number; color: number; tag: string }

/** Highway lane dashes: 4 m of paint every 12 m. */
const LANE_DASH = 12;
/** Longest merged paint box; keeps every box inside one chunk's neighbourhood. */
const RUN_MAX = 12;
/** The give-way line: dashes 0.6 m across with 0.3 m gaps, 0.2 m deep, two rows 0.45 m apart, from 0.3 m off the centreline. */
const GIVE_WAY = { dash: 0.6, gap: 0.3, depth: 0.2, rows: 0.45, inner: 0.3 } as const;
/** Worn patches (M7 slice 11): a road's paint wears in stretches of this many metres, about one in four. */
const WEAR_STRETCH = 36;

/** The dash centres of a give-way row across a half of `halfWidth`, 0.6 m short of its edge. */
function giveWayDashes(halfWidth: number): number[] {
  const out: number[] = [];
  for (let o = GIVE_WAY.inner + GIVE_WAY.dash / 2; o + GIVE_WAY.dash / 2 <= halfWidth - 0.6 + 1e-9; o += GIVE_WAY.dash + GIVE_WAY.gap) out.push(o);
  return out;
}

/** A road's wear seed from its id (FNV-1a). */
function wearSeed(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Whether a road's paint is worn in stretch `k` (junction paint asks with its own keys). */
function wornAt(seed: number, k: number): boolean {
  let h = Math.imul(seed ^ Math.imul(k, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) % 4 === 0;
}

/** The worn tone of a line colour; anything else (the parking's) keeps its colour. */
export function wornTone(color: number): number {
  return color === PALETTE.roadWhite ? PALETTE.roadWhiteWorn : color === PALETTE.roadYellow ? PALETTE.roadYellowWorn : color;
}

/** The perimeter as one closed centreline: four straights joined by quarter circles about the inner kerb corners. */
export function highwayLoop(): RoadPoint[] {
  const inner = 3 * BLOCK - HIGHWAY_HALF, points: RoadPoint[] = [];
  const corners = [[-inner, inner, Math.PI], [inner, inner, Math.PI / 2], [inner, -inner, 0], [-inner, -inner, -Math.PI / 2]] as const;
  for (const [cx, cz, from] of corners) for (let i = 0; i <= 16; i++) {
    const t = from - Math.PI / 2 * i / 16;
    points.push({ x: cx + Math.cos(t) * HIGHWAY_HALF, z: cz + Math.sin(t) * HIGHWAY_HALF });
  }
  points.push({ ...(points[0] as RoadPoint) });
  return points;
}

/** One owner per whole marking/bay, even where a road crosses a streaming boundary. */
export function buildRoadMarkings(graph: RoadGraph, districtAt: (x: number, z: number) => { id: string }): { chunks: Map<string, StaticDesc[]>; parking: ParkingBay[]; approaches: Approach[] } {
  const statics: StaticDesc[] = [], parking: ParkingBay[] = [], allApproaches: Approach[] = [];
  const architecture = new Architecture(statics);
  const roads: Road[] = [];
  for (const lane of graph.lanes) {
    if (lane.special || lane.highway || lane.from > lane.to) continue;
    const a = graph.nodes[lane.from] as RoadPoint, b = graph.nodes[lane.to] as RoadPoint;
    roads.push({ id: `grid-${lane.from}-${lane.to}`, kind: 'street', points: [a, b], halfWidth: ROAD_HALF, district: districtAt((a.x + b.x) / 2, (a.z + b.z) / 2).id });
  }
  for (const r of graph.special) {
    const mid = r.centre[Math.floor(r.centre.length / 2)] as RoadPoint;
    roads.push({ id: r.name, kind: r.kind, points: r.centre, halfWidth: r.halfWidth, district: districtAt(mid.x, mid.z).id });
  }
  roads.push({ id: 'highway', kind: 'highway', points: highwayLoop(), halfWidth: HIGHWAY_HALF, district: '' });

  for (const road of roads) {
    const highway = road.kind === 'highway', street = road.kind === 'street';
    // Streets, the avenue and the quay have frontage and kerbside bays; the parkway, the service road and the highway have edge lines.
    const kerbside = street || road.kind === 'avenue' || road.kind === 'quay';
    const distances = [0];
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1] as RoadPoint, b = road.points[i] as RoadPoint;
      distances.push((distances[i - 1] as number) + Math.hypot(b.x - a.x, b.z - a.z));
    }
    const total = distances[distances.length - 1] as number;
    const segmentAt = (s: number): number => {
      let i = 0;
      while (i + 2 < distances.length && (distances[i + 1] as number) < s) i++;
      return i;
    };
    const frame = (s: number, offset = 0): Frame => {
      const i = segmentAt(s);
      const a = road.points[i] as RoadPoint, b = road.points[i + 1] as RoadPoint;
      const length = (distances[i + 1] as number) - (distances[i] as number);
      const tx = (b.x - a.x) / length, tz = (b.z - a.z) / length;
      return { x: a.x + tx * (s - (distances[i] as number)) - tz * offset, z: a.z + tz * (s - (distances[i] as number)) + tx * offset, tx, tz };
    };
    // A bounding circle rejects the whole footprint, not just its centre. In
    // particular a bay must never run into a diagonal road or its pavement tip.
    const others = graph.special.filter(r => r.name !== road.id);
    const clear = (p: RoadPoint, radius: number): boolean => {
      if (!others.every(r => distanceToPolyline(r.centre, p.x, p.z) > r.halfWidth + radius + 1)) return false;
      if (street) return true;
      const gx = Math.round(p.x / BLOCK), gz = Math.round(p.z / BLOCK);
      const half = (g: number) => Math.abs(g) === 3 ? HIGHWAY_HALF : ROAD_HALF;
      // On the highway only the side streets' mouths are foreign; its own box is the road.
      if (highway) return (Math.abs(gx) === 3 || Math.abs(p.x - gx * BLOCK) > ROAD_HALF + radius + 1)
        && (Math.abs(gz) === 3 || Math.abs(p.z - gz * BLOCK) > ROAD_HALF + radius + 1);
      return Math.abs(p.x - gx * BLOCK) > half(gx) + radius + 1 && Math.abs(p.z - gz * BLOCK) > half(gz) + radius + 1;
    };
    const rect = (s: number, offset: number, width: number, length: number, color: number, tag: string,
      fadeEnd = 0, underlay: number = PALETTE.asphalt, y = 0.064, yawOffset = 0): StaticDesc | null => {
      const p = frame(s, offset);
      if (!clear(p, Math.hypot(width, length) / 2)) return null;
      const st = architecture.box(p.x, y - 0.001, p.z, width / 2, 0.001, length / 2, color, tag, 'top');
      st.rotation = quatFromYaw(Math.atan2(p.tx, p.tz) + yawOffset);
      if (fadeEnd) st.paint = { underlay, fadeEnd };
      return st;
    };
    const runs = new Map<string, Run>();
    const wear = wearSeed(road.id);
    const flush = (run: Run) => {
      const a = frame(run.s0, run.offset), b = frame(run.s1, run.offset);
      const distance = Math.hypot(b.x - a.x, b.z - a.z);
      const color = wornAt(wear, Math.floor(run.s0 / WEAR_STRETCH)) ? wornTone(run.color) : run.color;
      const st = architecture.box((a.x + b.x) / 2, 0.063, (a.z + b.z) / 2, run.width / 2, 0.001, distance / 2, color, run.tag, 'top');
      st.rotation = quatFromYaw(Math.atan2(b.x - a.x, b.z - a.z));
    };
    // Consecutive clear strokes of one line merge into a box of at most RUN_MAX;
    // a box never spans a polyline bend, so curves stay chords of 2 m.
    const stroke = (s: number, length: number, offset: number, width: number, color: number, tag: string, clearance = true) => {
      const key = `${tag}:${offset}`, run = runs.get(key), segment = segmentAt(s), end = s + length;
      const a = frame(s, offset), b = frame(end, offset);
      const ok = !clearance || clear({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, Math.hypot(length, width) / 2);
      if (run && ok && run.s1 === s && run.segment === segment && segmentAt(end) === segment && end - run.s0 <= RUN_MAX) { run.s1 = end; return; }
      if (run) { flush(run); runs.delete(key); }
      if (ok) runs.set(key, { s0: s, s1: end, segment, offset, width, color, tag });
    };

    const nodeOf = (end: boolean) => road.points[end ? road.points.length - 1 : 0] as RoadPoint;
    const fromNode = (end: boolean, d: number) => end ? total - d : d;
    // Stop lines span the approach lane; kerbside roads keep the bay strip clear.
    const stopOuter = kerbside ? 8.1 : road.halfWidth - 0.6;
    const stripeCount = Math.floor((2 * road.halfWidth - 3) / 3) + 1;
    const stripes = Array.from({ length: stripeCount }, (_, i) => (i - (stripeCount - 1) / 2) * 3);
    const approach = (end: boolean): Approach => {
      const node = nodeOf(end), f = frame(fromNode(end, 0));
      const gx = Math.round(node.x / BLOCK), gz = Math.round(node.z / BLOCK);
      const vx = Math.abs(gx) === 3 ? HIGHWAY_HALF : ROAD_HALF, vz = Math.abs(gz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
      const alongX = street && Math.abs(f.tx) > 0.99, alongZ = street && Math.abs(f.tz) > 0.99;
      // Where the centreline is past every other arm's carriageway: a street leaves
      // the crossing street's box, an authored road leaves both grid boxes (a
      // tangential parkway join runs beside the street for 70 m first).
      let exit = 0;
      for (; exit < 160; exit += 0.5) {
        const p = frame(fromNode(end, exit));
        if ((alongZ || Math.abs(p.x - node.x) >= vx) && (alongX || Math.abs(p.z - node.z) >= vz)) break;
      }
      // No pedestrian crossing on any approach to the perimeter, nor across the service road.
      const hasCrossing = road.kind !== 'service' && Math.abs(node.x) < 3 * BLOCK && Math.abs(node.z) < 3 * BLOCK;
      let crossing: number | null = null;
      // Move the WHOLE crossing past a diagonal merge and its pavement wedge; never
      // leave a few isolated zebra stripes on either side of a road. An authored
      // road's crossing waits until both of its edges are 6 m clear of the grid
      // kerb lines, so it lands on the wedge, not on the street.
      const guards: Array<[number, number]> = street ? [[-14.25, 2.5], [14.25, 2.5]] : [[-road.halfWidth, 5], [road.halfWidth, 5]];
      if (hasCrossing) for (let d = exit + 4; d <= (street ? 54 : exit + 70); d += 2) {
        const s = fromNode(end, d);
        if (stripes.every(o => clear(frame(s, o), 2.5)) && guards.every(([o, r]) => clear(frame(s, o), r))) { crossing = d; break; }
      }
      // Some parkway/quay joins are tangential: no connected pair of footways exists
      // within this approach. Omit that crossing rather than fragment it; the stop
      // line then sits just past the other arm, or wherever the merge lets it.
      let stop: number | null = crossing === null ? null : crossing + 5;
      if (stop === null) for (let d = exit + 2; d <= exit + 40; d += 1) {
        const s = fromNode(end, d), side = end ? 1 : -1;
        if ([1, (0.7 + stopOuter) / 2, stopOuter - 0.3].every(o => clear(frame(s, side * o), 2.5))) { stop = d; break; }
      }
      // The parkway joins both junctions tangentially (M7 slice 11): its stop line stood 112 m out, where the whole
      // road had left the street. It gives way instead where its approach half meets the other arm: the merge is
      // where that half (the centreline and its kerb-side edge) has left the junction cross, the double broken
      // line the first place past it where every dash is clear of the street.
      let merge: number | null = null, giveWay: number | null = null;
      if (road.kind === 'parkway') {
        const side = end ? 1 : -1, dashes = giveWayDashes(road.halfWidth);
        let edge = exit;
        for (let d = 0; d < 160; d += 0.5) {
          const p = frame(fromNode(end, d), side * road.halfWidth);
          if (Math.abs(p.x - node.x) >= vx && Math.abs(p.z - node.z) >= vz) { edge = d; break; }
        }
        merge = Math.max(exit, edge);
        const radius = Math.hypot(GIVE_WAY.dash, GIVE_WAY.depth) / 2;
        for (let d = merge; d <= merge + 5 && giveWay === null; d += 0.5) {
          if (dashes.every(o => clear(frame(fromNode(end, d), side * o), radius) && clear(frame(fromNode(end, d + GIVE_WAY.rows), side * o), radius))) giveWay = d;
        }
        stop = null;
      }
      const result = { road: road.id, end, exit, crossing, stop, merge, giveWay };
      allApproaches.push(result);
      return result;
    };
    const approaches = highway ? null : [approach(false), approach(true)];
    const margin = (a: Approach) => (a.stop ?? (a.giveWay === null ? a.exit + 4 : a.giveWay + GIVE_WAY.rows)) + 5;
    const start = approaches ? margin(approaches[0] as Approach) : 0;
    const finish = approaches ? total - margin(approaches[1] as Approach) : total;

    // Measure dash phase along the entire road, never restart it at a chunk or
    // polyline segment.
    for (let s = start; s < finish; s += 2) {
      const length = Math.min(2, finish - s), mid = s + length / 2;
      if (highway) {
        // The perimeter has priority: its double yellow and lane dashes run on
        // through every side-street mouth; only the inner edge line breaks there,
        // and it stops for the kerb corners.
        for (const side of [-1, 1]) stroke(s, length, side * 0.24, 0.18, PALETTE.roadYellow, 'paint-centre', false);
        // The dash sits between the two carriageway lanes; the graph drives their centres.
        if (mid % LANE_DASH < 4) for (const side of [-1, 1]) stroke(s, length, side * HIGHWAY_LANE_DIVIDER, 0.22, PALETTE.roadWhite, 'paint-lane', false);
        stroke(s, length, HIGHWAY_HALF - 3, 0.22, PALETTE.roadWhite, 'paint-edge', false);
        const f = frame(s), g = frame(s + length);
        if (Math.abs(f.tx - g.tx) + Math.abs(f.tz - g.tz) < 1e-9) stroke(s, length, -(HIGHWAY_HALF - 3), 0.22, PALETTE.roadWhite, 'paint-edge');
        continue;
      }
      const solid = mid < start + 24 || mid > finish - 24;
      if (solid) {
        for (const side of [-1, 1]) stroke(s, length, side * 0.24, 0.18, PALETTE.roadYellow, 'paint-centre');
      } else if (Math.floor(mid / 6) % 2 === 0) {
        stroke(s, length, 0, 0.24, PALETTE.roadYellow, 'paint-centre');
      }
      if (!kerbside) for (const side of [-1, 1]) stroke(s, length, side * (road.halfWidth - 0.6), 0.22, PALETTE.roadWhite, 'paint-edge');
    }
    for (const run of runs.values()) flush(run);

    for (const end of [false, true]) {
      if (!approaches) break;
      const ap = approaches[end ? 1 : 0] as Approach, node = nodeOf(end), sign = end ? 1 : -1, side = sign;
      // a junction's paint wears as one: about one approach in four
      const white = wornAt(wear, -1 - (end ? 1 : 0)) ? PALETTE.roadWhiteWorn : PALETTE.roadWhite;
      if (ap.crossing !== null) for (const o of stripes) rect(fromNode(end, ap.crossing), o, 1.6, 3.5, white, 'paint-crosswalk', 110);
      if (ap.giveWay !== null) {
        for (const row of [0, GIVE_WAY.rows]) for (const o of giveWayDashes(road.halfWidth)) {
          rect(fromNode(end, ap.giveWay + row), side * o, GIVE_WAY.dash, GIVE_WAY.depth, white, 'paint-giveway', 75);
        }
      }
      if (ap.stop === null) continue;
      const s = fromNode(end, ap.stop);
      rect(s, side * (0.7 + stopOuter) / 2, stopOuter - 0.7, 0.5, white, 'paint-stop', 75);
      // Arrows describe the single broad lane: straight on through a crossroads,
      // left or right at the perimeter. An authored road merges at an angle, so
      // its options are the wedge's, and it gets none.
      if (!street) continue;
      const f = frame(fromNode(end, 0));
      const canContinue = graph.nodes.some(n => Math.abs(n.x - node.x - f.tx * sign * BLOCK) < 0.1
        && Math.abs(n.z - node.z - f.tz * sign * BLOCK) < 0.1);
      // The whole arrow or none: a merge must not clip a wing off it.
      const arrow = s - sign * 10;
      if (!clear(frame(arrow, side * 4.5), 2.6)) continue;
      if (canContinue) {
        rect(arrow - sign * 0.5, side * 4.5, 0.45, 3.6, white, 'paint-arrow', 100);
        for (const wing of [-1, 1]) rect(arrow + sign * 1.1, side * 4.5 + wing * 0.55, 0.45, 1.65,
          white, 'paint-arrow', 100, PALETTE.asphalt, 0.064, wing * sign * Math.PI / 4);
      } else {
        const bar = arrow + sign * 0.6;
        rect(arrow - sign * 0.6, side * 4.5, 0.45, 2.4, white, 'paint-arrow', 100);
        rect(bar, side * 4.5, 2.9, 0.45, white, 'paint-arrow', 100);
        // A box rotated by t has its length along cos(t)*along - sin(t)*across.
        for (const w of [-1, 1]) for (const u of [-1, 1]) rect(bar + u * 0.45, side * 4.5 + w * 1.25, 0.45, 1.27,
          white, 'paint-arrow', 100, PALETTE.asphalt, 0.064, Math.atan2(w, u));
      }
    }

    // Complete 3 x 7 m spaces. Group gaps are access/manoeuvring breaks; their
    // starts are measured from the junction, independently of streaming tiles.
    const style = PARKING_STYLE[road.district];
    if (!kerbside || !style) continue;
    const bayStart = start + 14, bayFinish = finish - 14;
    for (const side of [-1, 1]) {
      const offset = side * (road.halfWidth - PARKING.kerbGap - PARKING.width / 2);
      let group: number[] = [], groups = 0;
      const flushGroup = () => {
        const bays = group;
        group = [];
        if (!bays.length || groups++ % style.every !== 0) return;
        const first = (bays[0] as number) - PARKING.length / 2, last = (bays[bays.length - 1] as number) + PARKING.length / 2;
        for (const s of bays) {
          const p = frame(s, offset);
          parking.push({ road: road.id, x: p.x, z: p.z, yaw: Math.atan2(p.tx, p.tz) + (side < 0 ? Math.PI : 0), width: PARKING.width, length: PARKING.length });
          rect(s, offset, PARKING.width, PARKING.length, PALETTE.asphaltBay, 'parking-surface', 0, PALETTE.asphalt, 0.04);
          // Longitudinal edges remain readable in the distance. Cross bars fade
          // per pixel to the pad colour before their projected thickness aliases.
          for (const edge of [-1, 1]) rect(s, offset + edge * (PARKING.width / 2 - 0.12), 0.24, PARKING.length,
            style.colour, 'paint-parking-edge', 150, PALETTE.asphaltBay);
        }
        for (let s = first + 0.12; s <= last; s += PARKING.length) {
          rect(s, offset, PARKING.width - 0.48, 0.24, style.colour, 'paint-parking-divider', 52, PALETTE.asphaltBay);
        }
        rect(last - 0.12, offset, PARKING.width - 0.48, 0.24, style.colour, 'paint-parking-divider', 52, PALETTE.asphaltBay);
        if (!style.symbol) return;
        // Stencil P, facing the direction of traffic, in the first space.
        const s = bays[side > 0 ? 0 : bays.length - 1] as number, direction = side > 0 ? 1 : -1;
        for (const [u, v, w, h] of [[-0.5, 0, 0.24, 2], [0, 0.88, 1.2, 0.24], [0, 0.05, 1.2, 0.24], [0.5, 0.46, 0.24, 0.85]] as const) {
          rect(s + direction * v, offset + direction * u, w, h, PALETTE.roadWhite, 'paint-parking-symbol', 65, PALETTE.asphaltBay);
        }
      };
      let inGroup = 0;
      for (let s = bayStart + PARKING.length / 2; s + PARKING.length / 2 <= bayFinish; s += PARKING.length) {
        if (inGroup === style.group) { flushGroup(); inGroup = 0; continue; }
        if (!clear(frame(s, offset), Math.hypot(PARKING.width, PARKING.length) / 2 + 2)) { flushGroup(); inGroup = 0; continue; }
        group.push(s); inGroup++;
      }
      flushGroup();
    }
  }
  const chunks = new Map<string, StaticDesc[]>();
  for (const st of statics) {
    const key = `${Math.floor((st.position.x + BLOCK / 2) / BLOCK)},${Math.floor((st.position.z + BLOCK / 2) / BLOCK)}`;
    const list = chunks.get(key) ?? [];
    list.push(st); chunks.set(key, list);
  }
  return { chunks, parking, approaches: allApproaches };
}
