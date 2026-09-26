/** M8.10 slice 12: the airfield and the islet (docs/M8.10_PLAN.md). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ASPHALT, SAND, SEA, clearControls, type SimWorld } from '../../../src/sim';
import type { StaticDesc } from '../../../src/sim/scene';
import { inPolygon } from '../../../src/sim/island/geom';
import type { Island } from '../../../src/sim/island/Island';
import { MEGA, RAMP_FOOT, type AirfieldPlace } from '../../../src/sim/island/places/airfield';
import { PLACES, ROADS, islet } from '../../../src/sim/island/plan';
import { createWorld, islandStatics } from '../helpers';
import { flyTo } from './seaRoute';

const RUNWAY = PLACES.runway, AXIS = (RUNWAY.x0 + RUNWAY.x1) / 2;
const upness = (q: { x: number; z: number }): number => 1 - 2 * (q.x * q.x + q.z * q.z);

describe('M8.10 slice 12: the airfield and the islet', () => {
  // one world for the reads and the Phantom's run, on the runway: the island's build takes seconds, more under load
  let sim: SimWorld, island: Island;
  beforeAll(async () => {
    sim = await createWorld({ map: 'island', spawn: 'runway', body: 'phantom', traffic: 0, peds: 0 });
    island = sim.island as Island;
  }, 60_000);
  afterAll(() => sim.dispose());
  const statics = (): StaticDesc[] => islandStatics(island);

  it('12.1 the runway\'s straight: 650 m or more on one line from its threshold over the ramp\'s lip, level, paved and clear to the ramp\'s foot', () => {
    const g = island.ground, north = RUNWAY.z1 - 1, y0 = g.surfaceHeight(AXIS, north);
    let run = 0;
    for (let z = north; z > RAMP_FOOT; z -= 2, run += 2) {
      for (const dx of [-15, -8, 0, 8, 15]) expect(g.surface(AXIS + dx, z), `the runway at ${dx}, ${z}`).toBe(ASPHALT);
      expect(Math.abs(g.height(AXIS, z) - y0), `the runway's level at ${z}`).toBeLessThan(0.1);
    }
    // nothing solid stands on it: a wall's or a trunk's footprint off the runway's width to the ramp's foot
    for (const st of statics()) {
      if (st.tag !== 'building' && st.tag !== 'trunk') continue;
      const s = st.shape, reach = s.kind === 'box' ? Math.hypot(s.hx, s.hz) : s.kind === 'cylinder' ? s.radius : 0;
      const on = st.position.z - reach < north && st.position.z + reach > RAMP_FOOT && Math.abs(st.position.x - AXIS) - reach < (RUNWAY.x1 - RUNWAY.x0) / 2;
      expect(on, `a wall at ${st.position.x.toFixed(0)}, ${st.position.z.toFixed(0)}`).toBe(false);
    }
    // the ramp on the runway's line, launching down it: the straight runs from the threshold to its lip
    expect(MEGA.x).toBeCloseTo(AXIS, 6);
    expect(Math.cos(MEGA.yaw)).toBeCloseTo(-1, 6);
    expect(run).toBeGreaterThanOrEqual(600);
    expect(north - MEGA.z).toBeGreaterThanOrEqual(650);
    // its paint on it, just over its surface: the threshold's twelve stripes and the rest of its marks
    const marks = (island.places.find((p) => p.id === 'airfield') as AirfieldPlace).marks;
    for (const m of marks) {
      expect(Math.abs(m.x - AXIS) + m.hx, 'a mark on the runway').toBeLessThan(20);
      expect(m.z > RUNWAY.z0 && m.z < RUNWAY.z1, 'a mark on the runway').toBe(true);
      expect(m.y - g.surfaceHeight(m.x, m.z)).toBeGreaterThan(0.04);
      expect(m.y - g.surfaceHeight(m.x, m.z)).toBeLessThan(0.08);
    }
    expect(marks.filter((m) => m.z > north - 35 && m.hz === 15).length).toBe(12);
    expect(marks.length).toBeGreaterThan(40);
  });

  it('12.2 from the runway at the Phantom\'s top speed the mega-ramp lands it on the islet, about 4 s in the air, upright', () => {
    let foot = 0, off = -1, landed = -1, flight = 0, at = { x: 0, z: 0, y: 0 }, upOnLanding = 0, upAfter = 1;
    for (let i = 0; i < 60 * 40; i++) {
      const p = sim.vehicle.body.translation(), q = sim.vehicle.body.rotation();
      const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
      const err = Math.atan2(Math.sin(Math.atan2(AXIS - p.x, -40) - yaw), Math.cos(Math.atan2(AXIS - p.x, -40) - yaw));
      clearControls(sim.controls);
      // flat out down the runway's line, the boost kept for its last stretch
      sim.controls.throttle = 1;
      sim.controls.boost = p.z < 150 ? 1 : 0;
      sim.controls.steer = Math.max(-1, Math.min(1, -err * 2.5));
      sim.step();
      const tm = sim.vehicle.telemetry;
      if (foot === 0 && p.z < RAMP_FOOT) foot = tm.speedKmh;
      if (off < 0 && tm.airborne && p.z < MEGA.z + 3) off = i;
      if (off >= 0 && landed < 0 && !tm.airborne && i - off > 30) {
        landed = i;
        flight = (i - off) / 60;
        at = { x: p.x, y: p.y, z: p.z };
        upOnLanding = upness(q);
      }
      if (landed >= 0) upAfter = Math.min(upAfter, upness(q));
      if (landed >= 0 && i - landed > 45) break;
    }
    // its top speed: the bodies' pin has it at 220 km/h or more on the long straight
    expect(foot).toBeGreaterThan(215);
    expect(landed).toBeGreaterThan(0);
    expect(flight).toBeGreaterThan(3.5);
    expect(flight).toBeLessThan(5.5);
    expect(inPolygon(at.x, at.z, islet())).toBe(true);
    expect(island.ground.onLand(at.x, at.z)).toBe(true);
    expect(at.y).toBeGreaterThan(SEA.level + 1);
    expect(upOnLanding).toBeGreaterThan(0.9);
    expect(upAfter).toBeGreaterThan(0.8);
  }, 120_000);

  it('12.3 the hovercraft reaches the islet from the sea: through its surf and up its beach, onto its sand', () => {
    // the same world, the car swapped for the hovercraft, put on the open sea 45 m off the islet's north-eastern shore
    // (outside the surf's gate every car stops at)
    sim.setBody('hover');
    const end = flyTo(sim, [[-1085, -280], [-1055, -335], [-1035, -358]], 30);
    expect(end.arrived).toBe(true);
    expect(inPolygon(end.x, end.z, islet())).toBe(true);
    expect(island.ground.onLand(end.x, end.z)).toBe(true);
    expect(island.surface.at(end.x, end.z)).toBe(SAND);
    expect(end.y).toBeGreaterThan(SEA.level + 1);
  }, 120_000);

  it('12.4 the taxiways run dry: under the highway a metre over the sea, over the water on their bridges\' decks with the sea beside them', () => {
    const g = island.ground;
    for (const id of ['taxiway-north', 'taxiway-south', 'runway-link']) {
      const road = g.roads.find((r) => r.id === id);
      expect(road, id).toBeDefined();
      for (const h of road?.h ?? []) expect(h, id).toBeGreaterThan(SEA.level + 0.9);
    }
    for (const r of ROADS.filter((q) => q.cls === 'taxiway' && q.id !== 'runway-link')) {
      const [a, b] = r.points as [[number, number], [number, number]];
      const wet: Array<[number, number]> = [];
      for (let t = 0; t <= 1; t += 0.005) {
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        if (!g.onLand(x, z)) wet.push([x, z]);
      }
      expect(wet.length, r.id).toBeGreaterThan(20);
      // the deck: the road's height on its line; 4 m past its railings the sea's floor (clear of the shores' edges)
      wet.forEach(([x, z], i) => {
        expect(g.surfaceHeight(x, z), `${r.id} at ${x.toFixed(0)}`).toBeGreaterThan(SEA.level + 1);
        if (i >= 6 && i < wet.length - 6) for (const side of [-1, 1]) expect(g.surfaceHeight(x, z + side * 17), `${r.id} beside at ${x.toFixed(0)}`).toBeLessThan(SEA.level);
      });
      // a railing along each edge over the water
      const z = a[1], rails = statics().filter((st) => st.tag === 'building' && Math.abs(Math.abs(st.position.z - z) - 12.45) < 0.2 && !g.onLand(st.position.x, st.position.z));
      expect(rails.filter((st) => st.position.z > z).length, r.id).toBeGreaterThan(1);
      expect(rails.filter((st) => st.position.z < z).length, r.id).toBeGreaterThan(1);
    }
  });

  it('12.5 on the causeway three hangars, the tower and three planes, off the runway; palms round the islet\'s landing, none on it', () => {
    const all = statics(), inRect = (r: { x0: number; z0: number; x1: number; z1: number }, st: StaticDesc): boolean => st.position.x > r.x0 - 2 && st.position.x < r.x1 + 2 && st.position.z > r.z0 - 2 && st.position.z < r.z1 + 2;
    for (const r of PLACES.hangars) expect(all.filter((st) => st.tag === 'building' && inRect(r, st)).length).toBeGreaterThanOrEqual(5);
    const t = PLACES.controlTower;
    expect(all.some((st) => st.tag === 'building' && Math.hypot(st.position.x - t.x, st.position.z - t.z) < 3 && st.position.y > 10)).toBe(true);
    // the planes' fuselages: their solid boxes between the tower and the northern taxiway
    const fuselages = all.filter((st) => st.tag === 'building' && st.position.x > RUNWAY.x1 && st.position.z > 215 && st.position.z < 360 && st.shape.kind === 'box' && Math.max(st.shape.hx, st.shape.hz) > 3);
    expect(fuselages.length).toBeGreaterThanOrEqual(3);
    const palms = all.filter((st) => st.tag === 'trunk' && inPolygon(st.position.x, st.position.z, islet()));
    expect(palms.length).toBeGreaterThanOrEqual(8);
    for (const p of palms) expect(Math.abs(p.position.x - MEGA.x)).toBeGreaterThan(15);
  });
});
