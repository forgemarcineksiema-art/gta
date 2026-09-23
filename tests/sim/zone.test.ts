/**
 * Takedown rage and mayhem (M5.5 slice 12, the brief's activities): one timed
 * zone round the marker; only what happens inside it counts; reaching the
 * quota pays with the time bonus (6,000–15,000); the clock fails it.
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { BALANCE } from '../../src/sim/balance';
import type { JobDef } from '../../src/sim/jobs/catalog';
import { createWorld, run } from './helpers';

function start(sim: SimWorld, d: JobDef): void {
  sim.city?.sync(d.x, d.z, true);
  sim.vehicle.teleport({ x: d.x, y: 0.8, z: d.z }, d.yaw);
  sim.vehicle.setVelocity(0, 0, 0);
  run(sim, 0.1, (_t, c) => { c.brake = 1; });
}

function paidOf(sim: SimWorld, from: number): number {
  let paid = -1;
  sim.events.readFrom(from, (e) => { if (e.kind === 'jobDone') paid = e.value; });
  return paid;
}

describe('rage and mayhem', () => {
  it('12.1 two rage and two mayhem zones, their quotas, a minute each, pay in 6,000–15,000', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const z = BALANCE.jobs.zone;
      const rage = sim.jobs.defs.filter((d) => d.kind === 'rage'), mayhem = sim.jobs.defs.filter((d) => d.kind === 'mayhem');
      expect(rage.length).toBe(2);
      expect(mayhem.length).toBe(2);
      for (const d of [...rage, ...mayhem]) {
        expect(d.limitSeconds).toBe(z.seconds);
        expect(d.level).toBe(z[d.kind as 'rage' | 'mayhem'].quota);
        expect(d.payout).toBeGreaterThanOrEqual(6000);
        expect(d.payout * (1 + BALANCE.jobs.timeBonus)).toBeLessThanOrEqual(15000);
      }
      // the zones stand apart
      const all = [...rage, ...mayhem];
      for (const a of all) for (const b of all) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(z.radius * 2.5);
    } finally { sim.dispose(); }
  }, 60_000);

  it('12.2 rage: takedowns inside the zone count, outside they do not; the quota pays with the time bonus', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const d = sim.jobs.defs.find((j) => j.kind === 'rage')!;
      start(sim, d);
      expect(sim.jobs.state).toBe('active');
      // outside the zone: nothing counts
      const out = BALANCE.jobs.zone.radius + 40;
      sim.vehicle.teleport({ x: d.x + out, y: 0.8, z: d.z }, 0);
      run(sim, 1 / 60);
      sim.events.push('takedownTraffic', 0, d.x + out, 0.5, d.z, -1);
      run(sim, 2 / 60);
      expect(sim.jobs.inZone).toBe(false);
      expect(sim.jobs.zoneCount).toBe(0);
      // inside: each one counts, the quota ends it
      sim.vehicle.teleport({ x: d.x, y: 0.8, z: d.z }, 0);
      run(sim, 1 / 60);
      const seq = sim.events.sequence;
      for (let k = 0; k < d.level; k++) {
        sim.events.push(k % 2 ? 'takedown' : 'takedownTraffic', 0, d.x, 0.5, d.z, -1);
        run(sim, 2 / 60);
      }
      run(sim, 2 / 60);
      expect(sim.jobs.state).toBe('done');
      const paid = paidOf(sim, seq);
      expect(paid).toBeGreaterThan(d.payout);
      expect(paid).toBeLessThanOrEqual(Math.round(d.payout * (1 + BALANCE.jobs.timeBonus)));
    } finally { sim.dispose(); }
  }, 60_000);

  it('12.3 mayhem: the damage priced by the event; short of the quota the clock fails it', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const d = sim.jobs.defs.find((j) => j.kind === 'mayhem')!;
      const m = BALANCE.jobs.zone.mayhem;
      start(sim, d);
      sim.events.push('hit', 30, d.x, 0.5, d.z, 7);
      sim.events.push('hit', 30, d.x, 0.5, d.z, -1);
      sim.events.push('billboard', 0, d.x, 3, d.z, 1);
      run(sim, 2 / 60);
      expect(sim.jobs.zoneCount).toBe(Math.min(m.hitCap, 30 * m.hitPerMs) + Math.min(m.wallCap, 30 * m.wallPerMs) + m.billboard);
      // the clock runs out short of the quota
      const seq = sim.events.sequence;
      sim.jobs.remaining = 0.2;
      run(sim, 0.5);
      expect(sim.jobs.state).toBe('failed');
      expect(paidOf(sim, seq)).toBe(-1);
    } finally { sim.dispose(); }
  }, 60_000);
});
