import { describe, expect, it } from 'vitest';
import { CAR_PRESETS } from '../../src/sim';
import { districtAt } from '../../src/sim/city/City';
import { buildRoadMarkings, highwayLoop, PARKING, PARKING_STYLE } from '../../src/sim/city/markings';
import { BLOCK, HIGHWAY_HALF, ROAD_HALF, SPECIAL_ROADS, buildRoadGraph, distanceToPolyline } from '../../src/sim/city/roads';
import { PALETTE } from '../../src/sim/palette';
import type { StaticDesc } from '../../src/sim/scene';

const graph = buildRoadGraph(), plan = buildRoadMarkings(graph, districtAt);
const marks = [...plan.chunks.values()].flat();
const special = new Map(SPECIAL_ROADS.map(r => [r.name, r]));
const yawOf = (st: StaticDesc) => 2 * Math.atan2(st.rotation.y, st.rotation.w);
const gridAligned = (st: StaticDesc) => { const r = Math.abs(yawOf(st)) % (Math.PI / 2); return r < 0.01 || r > Math.PI / 2 - 0.01; };
const lengthOf = (st: StaticDesc) => st.shape.kind === 'box' ? st.shape.hz * 2 : 0;
const onPerimeter = (st: StaticDesc) => Math.max(Math.abs(st.position.x), Math.abs(st.position.z)) > 3 * BLOCK - HIGHWAY_HALF - 3;

describe('road paint and usable parallel parking', () => {
  it('fits every playable chassis with manoeuvring room and leaves the active lanes clear', () => {
    expect(plan.parking.length).toBeGreaterThan(100);
    for (const tuning of Object.values(CAR_PRESETS)) {
      expect(PARKING.width - tuning.chassisHalfExtents.x * 2).toBeGreaterThanOrEqual(0.5);
      expect(PARKING.length - tuning.chassisHalfExtents.z * 2).toBeGreaterThanOrEqual(1);
    }
    for (const bay of plan.parking) {
      const authored = special.get(bay.road);
      if (authored) {
        // Kerbside on the avenue and the quay: the bay hugs the authored kerb and stays out of every grid street.
        expect(Math.abs(distanceToPolyline(authored.centre, bay.x, bay.z) - (authored.halfWidth - PARKING.kerbGap - PARKING.width / 2))).toBeLessThan(0.05);
        for (const v of [bay.x, bay.z]) expect(Math.abs(v - Math.round(v / BLOCK) * BLOCK)).toBeGreaterThan(ROAD_HALF + 4);
        continue;
      }
      const acrossX = Math.abs(Math.cos(bay.yaw)) > 0.5;
      const centre = acrossX ? bay.x : bay.z;
      const roadCentre = Math.round(centre / BLOCK) * BLOCK;
      expect(Math.abs(roadCentre)).toBeLessThan(3 * BLOCK); // no highway parking
      const nearEdge = Math.abs(centre - roadCentre) - bay.width / 2;
      const farEdge = Math.abs(centre - roadCentre) + bay.width / 2;
      expect(nearEdge).toBeGreaterThan(8);
      expect(farEdge).toBeLessThan(ROAD_HALF);
      const along = acrossX ? bay.z : bay.x;
      expect(Math.abs(along - Math.round(along / BLOCK) * BLOCK) - bay.length / 2).toBeGreaterThanOrEqual(35);
      for (const road of graph.special) {
        expect(distanceToPolyline(road.centre, bay.x, bay.z) - Math.hypot(bay.width, bay.length) / 2).toBeGreaterThan(road.halfWidth + 2);
      }
    }
    const roads = new Set(plan.parking.map(b => b.road));
    expect(roads.has('Crown Diagonal West') && roads.has('Crown Diagonal North') && roads.has('Quay Sweep')).toBe(true);
    expect(roads.has('Garden Parkway') || roads.has('Works Chicane')).toBe(false);
  });

  it('gives every space a complete pad and two edge lines, without duplicate streaming owners or overlaps', () => {
    expect(marks.filter(m => m.tag === 'parking-surface')).toHaveLength(plan.parking.length);
    expect(marks.filter(m => m.tag === 'paint-parking-edge')).toHaveLength(plan.parking.length * 2);
    expect(new Set(marks).size).toBe(marks.length);
    const footprints = new Set<string>();
    for (const mark of marks) {
      const key = `${mark.tag}:${mark.position.x.toFixed(4)}:${mark.position.z.toFixed(4)}`;
      expect(footprints.has(key)).toBe(false); footprints.add(key);
      expect(mark.face).toBe('top');
      expect(mark.tag).not.toBe('kerb'); expect(mark.tag).not.toBe('building');
    }
    for (let i = 0; i < plan.parking.length; i++) {
      const a = plan.parking[i];
      if (!a) continue;
      for (let j = i + 1; j < plan.parking.length; j++) {
        const b = plan.parking[j];
        if (!b || a.road !== b.road || Math.abs(a.yaw - b.yaw) > 0.1) continue;
        // Bays are pitched along the centreline; on the quay's 503 m arc the inner kerb pitch is 2 % shorter.
        expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThanOrEqual(PARKING.length * (special.has(a.road) ? 0.97 : 1) - 1e-6);
      }
    }
  });

  it('marks kerbs the way each district uses them: loading bays in the works, sparse bays in the gardens', () => {
    const edges = marks.filter(m => m.tag === 'paint-parking-edge');
    const symbols = marks.filter(m => m.tag === 'paint-parking-symbol');
    // A boundary street belongs to the district of its centreline, as the generator decides it.
    const streetDistrict = (st: StaticDesc): string => {
      const vertical = Math.abs(st.rotation.y) < 0.1 || Math.abs(Math.abs(st.rotation.y) - 1) < 0.1;
      return vertical ? districtAt(Math.round(st.position.x / BLOCK) * BLOCK, st.position.z).id : districtAt(st.position.x, Math.round(st.position.z / BLOCK) * BLOCK).id;
    };
    const gridEdges = edges.filter(gridAligned);
    expect(gridEdges.length).toBeGreaterThan(3000);
    for (const m of gridEdges) expect(m.color, `${m.position.x},${m.position.z}`).toBe(streetDistrict(m) === 'foundry' ? PALETTE.roadYellow : PALETTE.roadWhite);
    expect(edges.filter(m => !gridAligned(m)).every(m => m.color === PALETTE.roadWhite)).toBe(true);
    expect(symbols.filter(gridAligned).some(m => streetDistrict(m) === 'foundry')).toBe(false);
    expect(symbols.filter(m => m.position.x < 0 && m.position.z < 0).length).toBeGreaterThan(100);
    const count = (id: string) => plan.parking.filter(b => b.road.startsWith('grid-') && districtAt(b.x, b.z).id === id).length;
    expect(count('gardens') * 1.5).toBeLessThan(count('crown'));
    expect(PARKING_STYLE['gardens']?.every).toBe(2);
  });

  it('keeps crossings whole at every join and leaves the perimeter free of crossings', () => {
    const groups = new Map<string, number>();
    const crossings = marks.filter(m => m.tag === 'paint-crosswalk');
    for (const st of crossings.filter(gridAligned)) {
      const vertical = Math.abs(st.rotation.y) < 0.1;
      const across = vertical ? st.position.x : st.position.z;
      const along = vertical ? st.position.z : st.position.x;
      const roadCentre = Math.round(across / BLOCK) * BLOCK;
      expect(Math.abs(roadCentre)).toBeLessThan(3 * BLOCK);
      expect(Math.abs(Math.round(along / BLOCK) * BLOCK)).toBeLessThan(3 * BLOCK);
      const key = `${vertical}:${roadCentre}:${along.toFixed(2)}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    expect(groups.size).toBeGreaterThan(50);
    for (const count of groups.values()) expect(count).toBe(8);
    // Authored roads: a crossing at both ends inside the island, none at the
    // perimeter, none across the service road; every stripe is on the road and
    // off the grid carriageways, with the stripe count the width allows.
    const authored = crossings.filter(m => !gridAligned(m));
    const perRoad = new Map<string, number>();
    for (const st of authored) {
      let best = '', bestDistance = Infinity;
      for (const r of SPECIAL_ROADS) { const d = distanceToPolyline(r.centre, st.position.x, st.position.z); if (d < bestDistance) { bestDistance = d; best = r.name; } }
      const road = special.get(best);
      expect(road && bestDistance < road.halfWidth - 1).toBe(true);
      for (const v of [st.position.x, st.position.z]) expect(Math.abs(v - Math.round(v / BLOCK) * BLOCK)).toBeGreaterThan(ROAD_HALF + 2);
      perRoad.set(best, (perRoad.get(best) ?? 0) + 1);
    }
    expect(Object.fromEntries(perRoad)).toEqual({ 'Crown Diagonal West': 8, 'Crown Diagonal North': 8, 'Garden Parkway': 12, 'Quay Sweep': 16 });
    for (const a of plan.approaches.filter(a => special.has(a.road))) {
      expect(a.stop).not.toBeNull();
      if (a.crossing !== null) expect(a.stop).toBe(a.crossing + 5);
    }
  });

  it('furnishes every street approach: a stop line, then a straight or a turn arrow, whole or absent', () => {
    const streets = plan.approaches.filter(a => a.road.startsWith('grid-'));
    expect(streets).toHaveLength(120);
    // Only the two streets the parkway runs beside before its junctions have no room for a stop line.
    expect(streets.filter(a => a.stop === null)).toHaveLength(2);
    const perimeter = streets.filter(a => {
      const lane = graph.lanes.find(l => `grid-${l.from}-${l.to}` === a.road);
      const node = graph.nodes[a.end ? (lane?.to ?? 0) : (lane?.from ?? 0)];
      return node !== undefined && Math.max(Math.abs(node.x), Math.abs(node.z)) === 3 * BLOCK;
    });
    expect(perimeter).toHaveLength(20);
    for (const a of perimeter) { expect(a.crossing).toBeNull(); expect(a.stop).not.toBeNull(); }
    const arrows = marks.filter(m => m.tag === 'paint-arrow');
    // Straight arrows are 3 boxes, turn arrows 6; a merge removes a whole arrow, never a wing.
    let straight = 0, turn = 0, placed = 0;
    for (const a of streets) {
      if (a.stop === null) continue;
      const lane = graph.lanes.find(l => `grid-${l.from}-${l.to}` === a.road);
      const from = graph.nodes[lane?.from ?? 0], to = graph.nodes[lane?.to ?? 0];
      if (!from || !to) throw new Error(a.road);
      const tx = Math.sign(to.x - from.x), tz = Math.sign(to.z - from.z), sign = a.end ? 1 : -1, node = a.end ? to : from;
      const centre = { x: node.x - sign * tx * (a.stop + 10) - sign * 4.5 * tz, z: node.z - sign * tz * (a.stop + 10) + sign * 4.5 * tx };
      const parts = arrows.filter(m => Math.hypot(m.position.x - centre.x, m.position.z - centre.z) < 3).length;
      const room = graph.special.every(r => distanceToPolyline(r.centre, centre.x, centre.z) > r.halfWidth + 3.6);
      const atPerimeter = perimeter.includes(a);
      expect(parts, `${a.road} ${a.end ? 'end' : 'start'}`).toBe(room ? (atPerimeter ? 6 : 3) : 0);
      placed += parts;
      if (parts === 6) turn++; else if (parts === 3) straight++;
    }
    expect(placed).toBe(arrows.length);
    expect(turn).toBeGreaterThanOrEqual(19);
    expect(straight).toBeGreaterThan(80);
  });

  it('paints the perimeter as one priority loop: lanes, unbroken centre, edge line broken only at the mouths', () => {
    const loop = highwayLoop();
    expect(loop.length).toBe(4 * 17 + 1);
    expect(loop[0]).toEqual(loop[loop.length - 1]);
    // Straights on the perimeter centreline, corners inside it (a 19 m quarter circle about the kerb corner).
    for (const p of loop) { const reach = Math.max(Math.abs(p.x), Math.abs(p.z)); expect(reach).toBeLessThanOrEqual(3 * BLOCK + 1e-9); expect(reach).toBeGreaterThan(3 * BLOCK - HIGHWAY_HALF * (1 - Math.SQRT1_2) - 1e-9); }
    const lanes = marks.filter(m => m.tag === 'paint-lane');
    expect(lanes.length).toBeGreaterThan(800);
    expect(lanes.every(onPerimeter)).toBe(true);
    const centre = marks.filter(m => m.tag === 'paint-centre' && onPerimeter(m));
    for (let k = -2; k <= 2; k++) for (const [x, z] of [[-3 * BLOCK, k * BLOCK], [3 * BLOCK, k * BLOCK], [k * BLOCK, -3 * BLOCK], [k * BLOCK, 3 * BLOCK]]) {
      expect(centre.some(m => Math.hypot(m.position.x - (x as number), m.position.z - (z as number)) < 6.5), `double yellow through ${x},${z}`).toBe(true);
    }
    const edges = marks.filter(m => m.tag === 'paint-edge' && onPerimeter(m));
    const outer = edges.filter(m => Math.max(Math.abs(m.position.x), Math.abs(m.position.z)) > 3 * BLOCK);
    const inner = edges.filter(m => Math.max(Math.abs(m.position.x), Math.abs(m.position.z)) < 3 * BLOCK);
    const sum = (list: StaticDesc[]) => list.reduce((a, m) => a + lengthOf(m), 0);
    const straights = 4 * (6 * BLOCK - 2 * HIGHWAY_HALF), corners = 4 * Math.PI / 2 * (2 * HIGHWAY_HALF - 3);
    expect(sum(outer)).toBeCloseTo(straights + corners, -1);
    expect(sum(inner)).toBeGreaterThan(straights * 0.85);
    expect(sum(inner)).toBeLessThan(straights - 20 * 2 * ROAD_HALF);
    for (const m of inner) for (let k = -2; k <= 2; k++) {
      const alongX = Math.abs(m.position.x) < 3 * BLOCK - HIGHWAY_HALF + 1;
      const along = alongX ? m.position.x : m.position.z;
      expect(Math.abs(along - k * BLOCK) + lengthOf(m) / 2).toBeGreaterThan(ROAD_HALF);
    }
    for (const tag of ['paint-crosswalk', 'paint-stop', 'paint-arrow', 'parking-surface']) {
      expect(marks.filter(m => m.tag === tag && Math.max(Math.abs(m.position.x), Math.abs(m.position.z)) > 3 * BLOCK - HIGHWAY_HALF)).toHaveLength(0);
    }
  });

  it('merges line strokes into boxes no longer than a streaming-safe 12 m without changing their extent', () => {
    const lines = marks.filter(m => ['paint-centre', 'paint-edge', 'paint-lane'].includes(m.tag ?? ''));
    expect(lines.length).toBeLessThan(5000);
    for (const m of lines) expect(lengthOf(m)).toBeLessThanOrEqual(12 + 1e-6);
    const chunkOf = (v: number) => Math.floor((v + BLOCK / 2) / BLOCK);
    for (const [key, list] of plan.chunks) for (const m of list) expect(`${chunkOf(m.position.x)},${chunkOf(m.position.z)}`).toBe(key);
  });
});
