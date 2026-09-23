/**
 * Fares (M5.5 slice 13, DESIGN.md §4 item 1): in a taxi with no job a walker
 * ahead hails; stopping by them starts a fare to a point 300–900 m on by lane
 * path; near misses and jumps tip; the delivered fare pays the ride and the
 * tips, the chain carries the leftover time into the next fare; a hot fare
 * raises the heat while it rides. Not in any other car.
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { BALANCE } from '../../src/sim/balance';
import { lanePathTo, pointTarget } from '../../src/sim/jobs/place';
import { PedPose, type Pedestrians } from '../../src/sim/traffic/Pedestrians';
import type { Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run, runUntil } from './helpers';

/** The player cruising a street lane in the given body, the crowd round it. */
async function cruising(body: 'taxi' | 'muscle'): Promise<SimWorld> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 1, record: false, spawn: 'crown' });
  sim.police!.dispatching = false;
  sim.coldOpen.active = false;
  sim.carBody = body;
  run(sim, 2);
  return sim;
}

/** Stop the car alongside the hailer. */
function stopBy(sim: SimWorld, h: number): void {
  const peds = sim.peds as Pedestrians;
  const x = peds.x[h] as number, z = peds.z[h] as number;
  sim.vehicle.teleport({ x: x + 3, y: 0.8, z }, 0);
  sim.vehicle.setVelocity(0, 0, 0);
  run(sim, 0.2, (_t, c) => { c.brake = 1; });
}

describe('fares', () => {
  it('13.1 in a taxi a walker ahead hails; in any other car nobody does', async () => {
    const taxi = await cruising('taxi');
    try {
      const t = runUntil(taxi, BALANCE.fares.hailEvery * 3, (s) => s.fares.hailer >= 0, (_t, c) => { c.throttle = 0.3; });
      expect(t).toBeGreaterThan(0);
      expect((taxi.peds as Pedestrians).pose[taxi.fares.hailer]).toBe(PedPose.Hail);
    } finally { taxi.dispose(); }
    const muscle = await cruising('muscle');
    try {
      run(muscle, BALANCE.fares.hailEvery * 3, (_t, c) => { c.throttle = 0.3; });
      expect(muscle.fares.hailer).toBe(-1);
    } finally { muscle.dispose(); }
  }, 60_000);

  it('13.2 stopping by the hailer starts the fare; tips ride on it; the delivery pays and the chain carries the time on', async () => {
    const sim = await cruising('taxi');
    try {
      expect(runUntil(sim, BALANCE.fares.hailEvery * 3, (s) => s.fares.hailer >= 0, (_t, c) => { c.throttle = 0.3; })).toBeGreaterThan(0);
      const h = sim.fares.hailer;
      stopBy(sim, h);
      expect(sim.jobs.state).toBe('active');
      const d = sim.jobs.running!;
      expect(d.kind).toBe('fare');
      expect((sim.peds as Pedestrians).active[h]).toBe(0);
      const path = lanePathTo(sim.city!, (sim.traffic as Traffic).lanes, d.x, d.z, pointTarget(sim.city!, d.targetX, d.targetZ));
      expect(path.length).toBeGreaterThan(200);
      expect(path.length).toBeLessThan(1100);
      // a near miss and a jump on the way
      sim.events.push('nearMiss', 0, d.x, 0, d.z, -1);
      sim.events.push('jump', 20, d.x, 0, d.z, -1);
      run(sim, 2 / 60);
      const tips = BALANCE.fares.tips.nearMiss + BALANCE.fares.tips.jump;
      expect(sim.fares.tips).toBe(tips);
      // at the mark: the ride and the tips
      const seq = sim.events.sequence;
      sim.vehicle.teleport({ x: d.targetX, y: 0.8, z: d.targetZ }, 0);
      sim.vehicle.setVelocity(0, 0, 0);
      run(sim, 2 / 60);
      let paid = -1;
      sim.events.readFrom(seq, (e) => { if (e.kind === 'jobDone') paid = e.value; });
      expect(paid).toBe(d.payout + tips);
      expect(sim.fares.chain).toBe(1);
      const carried = sim.fares.carry;
      expect(carried).toBeGreaterThan(0);
      // the fare's def goes; the next passenger waves; their clock carries the leftover
      run(sim, BALANCE.jobs.holdSeconds + 0.2);
      expect(sim.jobs.defOf(d.id)).toBeNull();
      expect(runUntil(sim, BALANCE.fares.hailEvery * 3, (s) => s.fares.hailer >= 0, (_t, c) => { c.throttle = 0.3; })).toBeGreaterThan(0);
      stopBy(sim, sim.fares.hailer);
      const next = sim.jobs.running!;
      expect(next.kind).toBe('fare');
      const bare = lanePathTo(sim.city!, (sim.traffic as Traffic).lanes, next.x, next.z, pointTarget(sim.city!, next.targetX, next.targetZ)).length / BALANCE.fares.speed + BALANCE.fares.slack;
      expect(next.limitSeconds).toBeGreaterThan(bare + carried - 3);
    } finally { sim.dispose(); }
  }, 60_000);

  it('13.3 a hot fare raises the heat while it rides', async () => {
    const sim = await cruising('taxi');
    try {
      expect(runUntil(sim, BALANCE.fares.hailEvery * 3, (s) => s.fares.hailer >= 0, (_t, c) => { c.throttle = 0.3; })).toBeGreaterThan(0);
      stopBy(sim, sim.fares.hailer);
      expect(sim.jobs.running?.kind).toBe('fare');
      sim.fares.hot = true;
      const before = sim.heat.points;
      run(sim, 3, (_t, c) => { c.brake = 1; });
      expect(sim.heat.points - before).toBeGreaterThan(BALANCE.fares.hot.heatPerSecond * 3 * 0.8);
    } finally { sim.dispose(); }
  }, 60_000);
});
