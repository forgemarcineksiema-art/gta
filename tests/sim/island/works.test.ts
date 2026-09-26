/** M8.10 slice 9: Sunset Works: the dry canal's bridges, the freight train and its crossings (docs/M8.10_PLAN.md). */
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_DT, clearControls, type SimWorld } from '../../../src/sim';
import type { Island } from '../../../src/sim/island/Island';
import { TRAIN, isWorks, type LevelCrossing, type WorksPlace } from '../../../src/sim/island/places/works';
import { CANAL, canalBed, canalLength, canalStation, pointAt } from '../../../src/sim/island/shapes/works';
import { createWorld } from '../helpers';

/** Whether any unit of the train covers the road's carriageway where it crosses the line. */
function occupied(works: WorksPlace, c: LevelCrossing): boolean {
  const t = works.train, reach = (c.half + TRAIN.half * Math.abs(c.ux)) / Math.max(0.3, Math.abs(c.uz));
  return t.units.some((u) => Math.abs(t.x + u.offset - c.x) < u.length / 2 + reach);
}

describe('M8.10 slice 9: Sunset Works', () => {
  let sim: SimWorld, island: Island, works: WorksPlace;
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => {
    sim = await createWorld({ map: 'island', traffic: 0, peds: 0 });
    island = sim.island as Island;
    works = island.places.find(isWorks) as WorksPlace;
  }, 120_000);

  it('9.2 the canal runs 6 m deep to the sea, and its five bridges clear 5 m over its floor', () => {
    const world = sim.world, length = canalLength(), p = { x: 0, z: 0 };
    expect(length).toBeGreaterThan(900);
    // the channel: its floor over the sea, the banks 6 m over it, all the way between its ramps
    for (let s = CANAL.rampWest + 10; s < length - CANAL.rampEast - 10; s += 50) {
      pointAt(s, p);
      const floor = island.heightAt(p.x, p.z);
      expect(floor, `the floor at ${s.toFixed(0)}`).toBeGreaterThan(0);
      expect(canalBed(p.x + 40, p.z + 40)).toBe(Infinity);
      const rx = p.x - 1, rz = p.z;
      expect(island.ground.surfaceHeight(rx, rz) - floor, `the depth at ${s.toFixed(0)}`).toBeGreaterThan(5.9);
    }
    // the bridges: the harbour road, the three streets, the highway
    const roads = works.bridges.map((b) => b.road);
    expect(roads.length).toBe(5);
    expect(roads.filter((r) => r === 'harbour-road').length).toBe(1);
    expect(roads.filter((r) => /^highway-/.test(r)).length).toBe(1);
    expect(roads.filter((r) => /^foundry-street-/.test(r)).length).toBe(3);
    for (const b of works.bridges) {
      island.sync(b.x, b.z, true);
      world.step();
      // the physics' ground under it is the canal's floor; a ray up from it meets the deck's underside 5 m up or more
      const floor = island.heightAt(b.x, b.z);
      expect(Math.abs(floor - b.floor), b.road).toBeLessThan(0.05);
      const up = world.castRay(new RAPIER.Ray({ x: b.x, y: floor + 0.2, z: b.z }, { x: 0, y: 1, z: 0 }), 30, true);
      expect(up, b.road).not.toBeNull();
      expect(0.2 + (up?.timeOfImpact ?? 0), b.road).toBeGreaterThan(5);
      // and the road's surface on the deck: a ray down from over it lands on the road's height
      const down = world.castRay(new RAPIER.Ray({ x: b.x, y: b.top + 5, z: b.z }, { x: 1e-4, y: -1, z: 1e-4 }), 30, true);
      expect(Math.abs(b.top + 5 - (down?.timeOfImpact ?? 99) - b.top), b.road).toBeLessThan(0.03);
    }
  });

  it('9.3 the train keeps its timetable, and the barriers are down 8 s before it reaches each crossing and until it has cleared it', () => {
    expect(works.crossings.length).toBe(4);
    const t = works.train;
    t.time = 0;
    const steps = Math.round((TRAIN.period * 2 + 10) / FIXED_DT);
    const downSince = works.crossings.map(() => -Infinity), wasOn = works.crossings.map(() => false);
    const departures: number[] = [], passes = works.crossings.map(() => 0);
    let still = true;
    for (let i = 0; i < steps; i++) {
      island.step(FIXED_DT);
      // the train moves smoothly: never faster than its top speed
      expect(Math.abs(t.x - t.prevX)).toBeLessThan(TRAIN.speed * FIXED_DT + 1e-6);
      const moving = t.speed > 0.01;
      if (moving && still) departures.push(t.time);
      still = !moving;
      works.crossings.forEach((c, k) => {
        if (c.down >= 1) downSince[k] = Math.min(downSince[k] as number, t.time);
        else downSince[k] = Infinity;
        const on = occupied(works, c);
        if (on) {
          // down, and down for 8 s at least when the train first reached the road
          expect(c.down, `crossing ${k} at ${t.time.toFixed(2)}`).toBe(1);
          if (!wasOn[k]) {
            expect(t.time - downSince[k], `crossing ${k}'s barriers ahead of the train`).toBeGreaterThanOrEqual(TRAIN.lead - 0.05);
            passes[k] = (passes[k] as number) + 1;
          }
        }
        // up again when the train is far: neither on it nor due within the barriers' lead
        if (!on && !c.passes.some((p) => [0, -TRAIN.period, TRAIN.period].some((sh) => {
          const ph = (t.time % TRAIN.period) + sh;
          return ph > p.from - TRAIN.lead - TRAIN.move - 0.1 && ph < p.to + TRAIN.after + TRAIN.move + 0.1;
        }))) expect(c.down, `crossing ${k} open at ${t.time.toFixed(2)}`).toBe(0);
        wasOn[k] = on;
      });
    }
    // a departure every 90 s, each way in turn, and every crossing crossed on every pass
    expect(departures.length).toBeGreaterThanOrEqual(4);
    departures.forEach((d, k) => expect(Math.abs(d - (departures[0] as number) - k * (TRAIN.period / 2))).toBeLessThan(0.1));
    for (const n of passes) expect(n).toBeGreaterThanOrEqual(4);
  });

  it('9.4 a car in the train\'s way is stopped and never passes through it', () => {
    const t = works.train, c = works.crossings.find((q) => Math.abs(q.uz) > 0.99 && q.road.startsWith('foundry-street-')) as LevelCrossing;
    expect(c).toBeDefined();
    // the train's middle on the crossing at speed, heading east: when does it get there (s into the timetable)
    let at = 0;
    for (let s = 0; s < TRAIN.period / 2; s += 0.01) if (Math.abs(t.middleAt(s) - c.x) < 0.2) { at = s; break; }
    // inside a unit: within its footprint and under its roof
    const inside = (x: number, y: number, z: number): boolean => Math.abs(z - t.z) < TRAIN.half && t.units.some((u) => Math.abs(t.x + u.offset - x) < u.length / 2 && y < t.railAt(x) + TRAIN.ride + u.height);
    const setTrain = (time: number): void => {
      t.time = time - FIXED_DT;
      island.step(FIXED_DT);
    };
    // a car driven at the crossing at 70 km/h as the train is on it
    island.sync(c.x, c.z, true);
    setTrain(at - 1.4);
    const side = Math.sign(c.uz), start = c.z - side * 32;
    sim.vehicle.teleport({ x: c.x - 3, y: island.heightAt(c.x - 3, start) + 0.7, z: start }, side > 0 ? 0 : Math.PI);
    sim.vehicle.body.setLinvel({ x: 0, y: 0, z: side * 19.5 }, true);
    let slowest = Infinity, reached = false;
    for (let i = 0; i < 60 * 3.5; i++) {
      clearControls(sim.controls);
      sim.controls.throttle = 1;
      sim.step();
      const p = sim.vehicle.body.translation(), v = sim.vehicle.body.linvel();
      if (occupied(works, c)) {
        // never on the train's far side while it is there, never inside it
        expect(side * (p.z - t.z), `at ${i}`).toBeLessThan(0);
        expect(inside(p.x, p.y, p.z)).toBe(false);
        if (side * (p.z - t.z) > -6) { reached = true; slowest = Math.min(slowest, side * v.z); }
      }
    }
    expect(reached).toBe(true);
    expect(slowest).toBeLessThan(5);
    // a car standing on the crossing when the train comes: pushed out of its way, never through it
    setTrain(at - 3.2);
    sim.vehicle.teleport({ x: c.x - 3, y: island.heightAt(c.x - 3, c.z) + 0.7, z: c.z }, 0);
    let hit = false;
    for (let i = 0; i < 60 * 5; i++) {
      clearControls(sim.controls);
      sim.controls.handbrake = 1;
      sim.step();
      const p = sim.vehicle.body.translation();
      expect(inside(p.x, p.y, p.z), `at ${i}`).toBe(false);
      if (Math.hypot(p.x - (c.x - 3), p.z - c.z) > 2) hit = true;
    }
    expect(hit).toBe(true);
  });

  it('9.5 the canal\'s way in and out: its ramps no steeper than 16 %, every bridge over its floor between them', () => {
    // (the drive from end to end is 9.1, works.long.test.ts)
    const length = canalLength(), p = { x: 0, z: 0 }, q = { x: 0, z: 0 };
    let steepest = 0;
    for (let s = 0; s + 2 < length; s += 2) {
      pointAt(s, p);
      pointAt(s + 2, q);
      steepest = Math.max(steepest, Math.abs(island.heightAt(q.x, q.z) - island.heightAt(p.x, p.z)) / 2);
    }
    expect(steepest).toBeLessThan(0.16);
    const st = { d: 0, s: 0, past: 0 };
    for (const b of works.bridges) {
      canalStation(b.x, b.z, st);
      expect(st.d, b.road).toBeLessThan(2);
      expect(st.s, b.road).toBeGreaterThan(CANAL.rampWest);
      expect(st.s, b.road).toBeLessThan(length - CANAL.rampEast);
    }
  });
});
