/** M8.10 slice 0: the island's plan as data (docs/M8.10_PLAN.md, its §1 the design). */
import { describe, expect, it } from 'vitest';
import { catmullRom, inPolygon, polylineLength, selfCrossing, type P2 } from '../../../src/sim/island/geom';
import {
  BAY, BUOYS, CAMERAS, COVERS, BREAKERS, FIRST_MINUTE, GARAGES, HIGHWAY, JOBS, JUMPS, PLACES, RIVAL_RINGS, ROADBLOCK_SITES, ROADS,
  SERVICES, SLIPWAYS, STASH, SUMMIT, GARDEN, coastline, districtOf, landArea, naturalHeight, onLand,
} from '../../../src/sim/island/plan';

const count = <T>(xs: readonly T[], pred: (x: T) => boolean): number => xs.filter(pred).length;

describe('M8.10 slice 0: the plan', () => {
  it('0.1 the land is 2.54 km², the causeway and the islet 0.09', () => {
    const { island, extra } = landArea();
    expect(island / 1e6).toBeGreaterThan(2.49);
    expect(island / 1e6).toBeLessThan(2.59);
    expect(extra / 1e6).toBeGreaterThan(0.07);
    expect(extra / 1e6).toBeLessThan(0.11);
  });

  it('0.2 the coast is a simple closed curve', () => {
    expect(selfCrossing(coastline())).toBe(false);
  });

  it('0.3 the highway is one loop of 5–6 km (the grid\'s ring is 5.4)', () => {
    let length = 0;
    for (let i = 0; i < HIGHWAY.length; i++) {
      const piece = HIGHWAY[i], next = HIGHWAY[(i + 1) % HIGHWAY.length];
      if (!piece || !next) throw new Error('highway');
      const end = piece.points[piece.points.length - 1] as P2, start = next.points[0] as P2;
      expect(Math.hypot(end[0] - start[0], end[1] - start[1])).toBeLessThan(0.01);
      length += polylineLength(piece.smooth ? catmullRom(piece.points, false, 6) : piece.points);
    }
    expect(length).toBeGreaterThan(5000);
    expect(length).toBeLessThan(6000);
  });

  it('0.4 every placed thing is on land, but what belongs on the water', () => {
    const land: Array<[string, P2]> = [
      ...JOBS.flatMap((j, i): Array<[string, P2]> => [[`job ${i}`, j.at], ...(j.to ? [[`job ${i} to`, j.to] as [string, P2]] : [])]),
      ...RIVAL_RINGS.map((r): [string, P2] => [`rival ${r.rival}`, r.at]),
      ...GARAGES.map((g): [string, P2] => [g.name, g.at]),
      // the piers' gap is over the water; a camera on the bay bridge too (world axes: +X west, +Z north)
      ...JUMPS.filter((j) => !(j.kind === 'gap' && j.at[1] < -400 && j.at[0] < -460)).map((j, i): [string, P2] => [`jump ${i}`, j.at]),
      ...CAMERAS.filter((c) => !(c[0] < -515 && c[0] > -852 && c[1] < -600)).map((c, i): [string, P2] => [`camera ${i}`, c]),
      ...COVERS.filter((c) => c.kind !== 'viaduct').map((c): [string, P2] => [`cover ${c.kind}`, c.at]),
      ...BREAKERS.map((b): [string, P2] => [`breaker ${b.kind}`, b.at]),
      ...ROADBLOCK_SITES.map((r, i): [string, P2] => [`roadblock ${i}`, r]),
      ...SERVICES.map((s): [string, P2] => [`service ${s.kind}`, s.at]),
      ...Object.entries(STASH).map(([k, p]): [string, P2] => [`stash ${k}`, p]),
      ...SLIPWAYS.map((s, i): [string, P2] => [`slipway ${i}`, s.at]),
      ...FIRST_MINUTE.map((p, i): [string, P2] => [`first minute ${i}`, p]),
      ['lighthouse', [PLACES.lighthouse.x, PLACES.lighthouse.z]],
      ['hotel', [PLACES.hotel.x, PLACES.hotel.z]],
      ['waterworks', [PLACES.waterworks.x, PLACES.waterworks.z]],
      ['mega-ramp', [PLACES.megaRamp.x, PLACES.megaRamp.z]],
    ];
    const off = land.filter(([, p]) => !onLand(p[0], p[1])).map(([name]) => name);
    expect(off).toEqual([]);
    const water: Array<[string, P2]> = [
      ...BUOYS.map((b, i): [string, P2] => [`buoy ${i}`, b]),
      ['duck', [PLACES.duck.x, PLACES.duck.z]],
      ...SLIPWAYS.map((s, i): [string, P2] => [`slipway ${i} foot`, [s.at[0] + s.out[0] * 40, s.at[1] + s.out[1] * 40]]),
    ];
    expect(water.filter(([, p]) => onLand(p[0], p[1])).map(([name]) => name)).toEqual([]);
  });

  it('0.5 what stands where: the plan §1.4\'s counts', () => {
    expect(JOBS.length).toBe(28);
    for (const [kind, n] of [['delivery', 6], ['order', 6], ['escape', 4], ['trial', 4], ['race', 4], ['rage', 2], ['mayhem', 2]] as const) expect(count(JOBS, (j) => j.kind === kind)).toBe(n);
    expect(RIVAL_RINGS.map((r) => r.rival).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(GARAGES.length).toBe(3);
    expect(JUMPS.length).toBe(20);
    expect(count(JUMPS, (j) => j.kind === 'mega')).toBe(1);
    expect(count(JUMPS, (j) => j.billboard)).toBe(8);
    expect(CAMERAS.length).toBe(10);
    expect(COVERS.length).toBe(13);
    expect(BREAKERS.length).toBe(8);
    expect(ROADBLOCK_SITES.length).toBe(6);
    for (const [kind, n] of [['fuel', 3], ['repair', 2], ['paint', 2]] as const) expect(count(SERVICES, (s) => s.kind === kind)).toBe(n);
    expect(Object.keys(STASH).length).toBe(8);
    expect(SLIPWAYS.length).toBe(2);
  });

  it('0.6 the names come true: each place in its district', () => {
    // the hill under Crown Heights, the highest ground on the island
    expect(districtOf(SUMMIT.x, SUMMIT.z)).toBe('crown');
    expect(naturalHeight(SUMMIT.x, SUMMIT.z)).toBeGreaterThan(50);
    for (let x = -900; x <= 900; x += 50) for (let z = -800; z <= 800; z += 50) if (onLand(x, z)) expect(naturalHeight(x, z)).toBeLessThanOrEqual(naturalHeight(SUMMIT.x, SUMMIT.z));
    // the botanic garden and Palm Avenue in Palm Gardens, the bay in Coral Quay, the port in Sunset Works
    expect(districtOf(GARDEN.x, GARDEN.z)).toBe('gardens');
    // Palm Avenue's lower half (world axes)
    expect(districtOf(60, -600)).toBe('gardens');
    const bayMiddle = BAY.reduce((a, p) => [a[0] + p[0] / BAY.length, a[1] + p[1] / BAY.length], [0, 0]);
    expect(districtOf(bayMiddle[0], bayMiddle[1])).toBe('marina');
    expect(onLand(bayMiddle[0], bayMiddle[1])).toBe(false);
    expect(districtOf(-370, 560)).toBe('foundry');
    // the map's orientation: Crown Heights up and to the left (north-west: +Z and +X in the world), the bay down right
    expect(SUMMIT.z).toBeGreaterThan(0);
    expect(SUMMIT.x).toBeGreaterThan(0);
    expect(bayMiddle[0]).toBeLessThan(0);
    expect(bayMiddle[1]).toBeLessThan(0);
    for (const g of GARAGES) expect(districtOf(g.at[0], g.at[1])).toBe({ hideout: 'crown', scrapyard: 'foundry', hotel: 'marina' }[g.name]);
  });

  it('0.7 the main roads stay on land but for their bridges', () => {
    for (const road of [...HIGHWAY, ...ROADS]) {
      if (road.span === 'bridge' || road.span === 'viaduct') continue;
      const pts = road.smooth ? catmullRom(road.points, false, 10) : road.points;
      const off = pts.filter((p) => !onLand(p[0], p[1]));
      expect(off.length, road.id).toBe(0);
    }
    expect(inPolygon(PLACES.runway.x0 + 20, PLACES.runway.z0 + 10, coastline())).toBe(false);
  });
});
