/**
 * The jobs skeleton (docs/M4_PLAN.md slice 4): a delivery ring starts the
 * job and adds its heat once, arrival pays the payout with the time bonus
 * into the bag, the clock fails it, a second ring does nothing while one
 * runs, and abandon is silent.
 * Long (M7 slice 0): moved out of the quick verify's minute; `npm run verify:gate` runs it.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import type { EventKind } from '../../src/sim/events';
import type { SimWorld } from '../../src/sim';
import type { Traffic } from '../../src/sim/traffic/Traffic';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { createWorld, run, runUntil } from './helpers';

/** A straight street lane's pose at `s`. */
function street(sim: SimWorld, s: number): { x: number; z: number; yaw: number } {
  const lanes = (sim.traffic as Traffic).lanes;
  for (let i = 0; i < lanes.laneCount; i++) {
    if ((lanes.limit[i] as number) !== TRAFFIC.speedStreet || (lanes.length[i] as number) < 150) continue;
    if (sim.city!.graph.lanes[i]!.points.length !== 2) continue;
    const pose = { x: 0, z: 0, yaw: 0 };
    lanes.positionAt(i, s, 0, pose);
    return pose;
  }
  throw new Error('no straight street lane');
}

function count(sim: SimWorld, from: number, kind: EventKind): number {
  let n = 0;
  sim.events.readFrom(from, (e) => { if (e.kind === kind) n++; });
  return n;
}

/** A delivery 25 m ahead of the car on a street, its target 300 m away. */
async function jobWorld(): Promise<{ sim: SimWorld; id: number; from: { x: number; z: number; yaw: number } }> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
  // these pin the job rules: the beat stays out (a scripted brake past standstill reverses into a patrol)
  sim.police!.dispatching = false;
  const from = street(sim, 20);
  const fx = Math.sin(from.yaw), fz = Math.cos(from.yaw);
  const id = sim.jobs.add({
    kind: 'delivery', x: from.x + fx * 25, z: from.z + fz * 25, yaw: from.yaw,
    targetX: from.x + 300, targetZ: from.z, payout: 5000, limitSeconds: 90, heat: 6,
  });
  sim.city?.sync(from.x, from.z, true);
  sim.vehicle.teleport({ x: from.x, y: 0.8, z: from.z }, from.yaw);
  return { sim, id, from };
}

describe('jobs', () => {
  it('4.7 driving into the ring starts the job with its heat once; arrival pays the time bonus into the bag', async () => {
    const { sim, id, from } = await jobWorld();
    try {
      const seq = sim.events.sequence;
      const fx = Math.sin(from.yaw), fz = Math.cos(from.yaw);
      const t = runUntil(sim, 8, (s) => s.jobs.state === 'active', (_t, _c, s) => s.vehicle.setVelocity(fx * 10, s.vehicle.telemetry.vy, fz * 10));
      expect(t).toBeGreaterThan(0);
      expect(sim.jobs.active).toBe(id);
      expect(sim.jobs.remaining).toBeCloseTo(90, 1);
      expect(sim.heat.points).toBe(6);
      // rolling on through the ring starts nothing more and adds no more heat
      run(sim, 2, (_t, _c, s) => s.vehicle.setVelocity(fx * 10, s.vehicle.telemetry.vy, fz * 10));
      expect(count(sim, seq, 'jobStart')).toBe(1);
      expect(sim.heat.points).toBe(6);
      // arrival with the clock at 30 s left
      expect(runUntil(sim, 90, (s) => s.jobs.remaining <= 30)).toBeGreaterThan(0);
      const remaining = sim.jobs.remaining;
      const bag = sim.run.bag;
      sim.vehicle.teleport({ x: from.x + 300, y: 0.8, z: from.z }, from.yaw);
      sim.step();
      const paid = Math.round(5000 * (1 + BALANCE.jobs.timeBonus * remaining / 90));
      expect(sim.run.bag - bag).toBe(paid);
      expect(count(sim, seq, 'jobDone')).toBe(1);
      expect(sim.jobs.state).toBe('done');
      run(sim, BALANCE.jobs.holdSeconds + 0.1);
      expect(sim.jobs.state).toBe('idle');
    } finally { sim.dispose(); }
  }, 60_000);

  it('4.8 the clock fails it with no pay; a second ring does nothing while one runs; abandon is silent', async () => {
    const { sim, id, from } = await jobWorld();
    try {
      const seq = sim.events.sequence;
      const fx = Math.sin(from.yaw), fz = Math.cos(from.yaw);
      // a second marker 60 m on, driven into while the first job runs
      const second = sim.jobs.add({
        kind: 'delivery', x: from.x + fx * 85, z: from.z + fz * 85, yaw: from.yaw,
        targetX: from.x - 300, targetZ: from.z, payout: 3000, limitSeconds: 60, heat: 4,
      });
      run(sim, 9, (_t, _c, s) => s.vehicle.setVelocity(fx * 10, s.vehicle.telemetry.vy, fz * 10));
      run(sim, 3, (_t, c) => { c.brake = 1; });
      expect(sim.jobs.state).toBe('active');
      expect(sim.jobs.active).toBe(id);
      expect(count(sim, seq, 'jobStart')).toBe(1);
      expect(sim.heat.points).toBe(6);
      expect(second).not.toBe(id);
      // stopped, far from the target: the clock runs out
      const bag = sim.run.bag;
      const failed = runUntil(sim, 95, (s) => s.jobs.state === 'failed');
      expect(failed).toBeGreaterThan(0);
      expect(count(sim, seq, 'jobFailed')).toBe(1);
      expect(sim.run.bag).toBe(bag);
      expect(sim.heat.points).toBe(6);
      // back into the first ring after the hold: it starts again; abandon then goes idle with no event
      run(sim, BALANCE.jobs.holdSeconds + 0.1);
      sim.vehicle.teleport({ x: from.x + fx * 25, y: 0.8, z: from.z + fz * 25 }, from.yaw);
      run(sim, 0.2);
      expect(sim.jobs.state).toBe('active');
      const before = sim.events.sequence;
      sim.jobs.abandon();
      expect(sim.jobs.state).toBe('idle');
      expect(sim.jobs.active).toBe(-1);
      expect(sim.events.sequence).toBe(before);
    } finally { sim.dispose(); }
  }, 120_000);
});
