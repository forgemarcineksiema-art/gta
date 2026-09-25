/**
 * M8.10 slice 13: the traffic, the parked cars and the walkers on the island (docs/M8.10_PLAN.md), the level crossings' stop. Traffic-pool runs of
 * ten seconds and more: run with LONG=1 (the gate); life.test.ts holds the quick look.
 */
import { describe, expect, it } from 'vitest';
import { clearControls, type SimWorld } from '../../../src/sim';
import type { Island } from '../../../src/sim/island/Island';
import { TRAIN, type LevelCrossing, type WorksPlace } from '../../../src/sim/island/places/works';
import { AgentState, type Traffic } from '../../../src/sim/traffic/Traffic';
import { createWorld } from '../helpers';

/** The moving cars within 320 m of the player a km of lane within 320 m. */
function perKm(sim: SimWorld): number {
  const traffic = sim.traffic as Traffic, p = sim.probe, r = 320;
  let cars = 0;
  for (let i = 0; i < traffic.pool; i++) {
    const st = traffic.state[i];
    if ((st === AgentState.Kinematic || st === AgentState.Physical) && traffic.parkedCiv[i] !== 1 && Math.hypot((traffic.x[i] as number) - p.x, (traffic.z[i] as number) - p.z) < r) cars++;
  }
  let metres = 0;
  for (const l of traffic.streets.graph.lanes) for (let k = 0; k + 1 < l.points.length; k++) {
    const a = l.points[k] as { x: number; z: number }, b = l.points[k + 1] as { x: number; z: number };
    if (Math.hypot((a.x + b.x) / 2 - p.x, (a.z + b.z) / 2 - p.z) < r) metres += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return cars / (metres / 1000);
}

/** `seconds` of the car held on the brakes. */
function hold(sim: SimWorld, seconds: number): void {
  for (let i = 0; i < 60 * seconds; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
}

describe('M8.10 slice 13: life on the island', () => {
  it('13.1 the traffic\'s density per km of lane as on the grid', async () => {
    const grid = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    let gridKm = 0;
    try { hold(grid, 8); gridKm = perKm(grid); } finally { grid.dispose(); }
    const island = await createWorld({ map: 'island', seed: 42, traffic: 1, peds: 0, record: false });
    try {
      hold(island, 8);
      const isleKm = perKm(island);
      console.log(`13.1 cars a km of lane: grid ${gridKm.toFixed(2)}, island ${isleKm.toFixed(2)}`);
      expect(isleKm).toBeGreaterThan(0.75 * gridKm);
      expect(isleKm).toBeLessThan(1.25 * gridKm);
    } finally { island.dispose(); }
  }, 120_000);

  it('13.2 a parked car on a 10 % street stays', async () => {
    const sim = await createWorld({ map: 'island', seed: 42, traffic: 1, peds: 0, record: false });
    try {
      const island = sim.island as Island, traffic = sim.traffic as Traffic;
      // the bay whose street falls nearest 10 % along it
      let best: { x: number; z: number; yaw: number } | null = null, bestErr = Infinity, grade = 0;
      for (const b of island.surfaces.parking) {
        const fx = Math.sin(b.yaw) * 3, fz = Math.cos(b.yaw) * 3;
        const g = Math.abs(island.heightAt(b.x + fx, b.z + fz) - island.heightAt(b.x - fx, b.z - fz)) / 6;
        if (Math.abs(g - 0.1) < bestErr) { bestErr = Math.abs(g - 0.1); best = b; grade = g; }
      }
      expect(best).not.toBeNull();
      if (!best) return;
      expect(grade).toBeGreaterThan(0.08);
      // the player 20 m off along the street, near enough that the parked car is lent its body
      const px = best.x - Math.sin(best.yaw) * 20, pz = best.z - Math.cos(best.yaw) * 20;
      island.sync(px, pz, true);
      sim.vehicle.teleport({ x: px, y: island.heightAt(px, pz) + 0.8, z: pz }, best.yaw);
      const a = traffic.spawnAtPoint(best.x, best.z, best.yaw, 'sedan', AgentState.Parked);
      expect(a).toBeGreaterThanOrEqual(0);
      hold(sim, 10);
      expect(traffic.state[a]).toBe(AgentState.Parked);
      expect(Math.hypot((traffic.x[a] as number) - best.x, (traffic.z[a] as number) - best.z)).toBeLessThan(0.3);
    } finally { sim.dispose(); }
  }, 120_000);

  it('13.3 a walker\'s feet on the pavement\'s top, on the island\'s slopes too', async () => {
    const sim = await createWorld({ map: 'island', seed: 42, traffic: 0, peds: 1, record: false });
    try {
      const island = sim.island as Island, peds = sim.peds;
      expect(peds).not.toBeNull();
      if (!peds) return;
      hold(sim, 10);
      let walking = 0, sloped = 0;
      for (let i = 0; i < peds.capacity; i++) {
        if (!peds.active[i]) continue;
        const x = peds.x[i] as number, z = peds.z[i] as number, slot = peds.slot[i] as number;
        const y = sim.transforms.currPos[slot * 3 + 1] as number, foot = island.standAt(x, z);
        // (a walker's step bobs 4 cm)
        expect(y - foot, `a walker at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeGreaterThanOrEqual(-0.01);
        expect(y - foot, `a walker at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeLessThan(0.05 + 0.1);
        walking++;
        if (Math.abs(island.heightAt(x + 3, z) - island.heightAt(x - 3, z)) / 6 > 0.05 || Math.abs(island.heightAt(x, z + 3) - island.heightAt(x, z - 3)) / 6 > 0.05) sloped++;
      }
      console.log(`13.3 ${walking} walkers, ${sloped} on slopes`);
      expect(walking).toBeGreaterThan(10);
      expect(sloped).toBeGreaterThan(0);
    } finally { sim.dispose(); }
  }, 120_000);

  it('13.4 a car stops short of a shut level crossing and goes over once it opens', async () => {
    const sim = await createWorld({ map: 'island', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const island = sim.island as Island, traffic = sim.traffic as Traffic, lanes = traffic.lanes;
      const works = island.places.find((p) => p.id === 'works') as WorksPlace;
      const c = works.crossings[0] as LevelCrossing;
      // a lane over the crossing with 50 m of run-up to its line
      const proj = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
      let lane = -1, line = 0;
      for (let l = 0; l < lanes.laneCount && lane < 0; l++) {
        lanes.project(l, c.x, c.z, proj);
        if (proj.dist < c.half + 2 && proj.s - c.out - 3.5 > 50 && proj.s < (lanes.length[l] as number)) { lane = l; line = proj.s - c.out - 3.5; }
      }
      expect(lane).toBeGreaterThanOrEqual(0);
      // the barriers down: the timetable at the first pass over it, less the barriers' lead
      const pass = c.passes[0] as { from: number; to: number };
      works.train.time = pass.from - TRAIN.lead;
      // the player beside the road, out of the way
      const px = c.x + 25 * Math.sign(c.uz || 1), pz = c.z - 25 * Math.sign(c.ux || 1);
      island.sync(px, pz, true);
      sim.vehicle.teleport({ x: px, y: island.ground.surfaceHeight(px, pz) + 1, z: pz }, 0);
      const car = traffic.spawnAt(lane, line - 40, 'sedan');
      expect(car).toBeGreaterThanOrEqual(0);
      hold(sim, 6);
      expect(c.closed).toBe(true);
      expect(traffic.lane[car]).toBe(lane);
      expect(traffic.s[car] as number).toBeLessThan(line + 0.5);
      expect(traffic.speed[car] as number).toBeLessThan(0.5);
      // open: over the rails
      works.train.time = pass.to + TRAIN.after + TRAIN.move + 1;
      hold(sim, 6);
      expect(c.closed).toBe(false);
      const past = traffic.lane[car] !== lane || (traffic.s[car] as number) > line + c.out + 3.5;
      expect(past).toBe(true);
    } finally { sim.dispose(); }
  }, 120_000);
});
