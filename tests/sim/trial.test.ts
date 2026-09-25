/**
 * The time trial on a coin line (M5.5 slice 10, DESIGN.md §4): four trials,
 * each 1.1–1.9 km of lane path from its marker to a finish across the road;
 * starting one lays the coins along the way; crossing the finish pays by the
 * medal the time wins (3,000 / 5,000 / 8,000), the best medal is kept and
 * saved; slower than bronze fails it with nothing paid.
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { lanePathTo, pointTarget } from '../../src/sim/jobs/place';
import { trialMedal, trialTimes, type JobDef } from '../../src/sim/jobs/catalog';
import { BALANCE } from '../../src/sim/balance';
import { collect, apply, defaultSave } from '../../src/sim/save/format';
import { createWorld, run } from './helpers';

/** The road's trials: the sea trial (M8.8 slice 20) runs by its buoys, pinned in sea.test.ts. */
function trials(sim: SimWorld): JobDef[] {
  return sim.jobs.defs.filter((d) => d.kind === 'trial' && !d.route);
}

/** Into the marker's ring, stopped: the job starts. */
function enter(sim: SimWorld, d: JobDef): void {
  sim.city?.sync(d.x, d.z, true);
  sim.vehicle.teleport({ x: d.x, y: 0.8, z: d.z }, d.yaw);
  sim.vehicle.setVelocity(0, 0, 0);
  run(sim, 0.2, (_t, c) => { c.brake = 1; });
}

/** Across the finish, `elapsed` s after the start. */
function finish(sim: SimWorld, d: JobDef, elapsed: number): void {
  sim.jobs.remaining = d.limitSeconds - elapsed;
  sim.city?.sync(d.targetX, d.targetZ, true);
  sim.vehicle.teleport({ x: d.targetX, y: 0.8, z: d.targetZ }, 0);
  sim.vehicle.setVelocity(0, 0, 0);
  run(sim, 2 / 60);
}

describe('the time trial', () => {
  it('10.1 four trials, 1.1–1.9 km by lane path each, the bronze limit at the bronze pace, gold paying 8,000', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const t = trials(sim);
      expect(t.length).toBe(4);
      const tr = BALANCE.jobs.trial;
      for (const d of t) {
        const p = lanePathTo(sim.city!, sim.traffic!.lanes, d.x, d.z, pointTarget(sim.city!, d.targetX, d.targetZ));
        expect(p.length).toBeGreaterThanOrEqual(tr.minPath - 30);
        expect(p.length).toBeLessThanOrEqual(tr.maxPath + 30);
        expect(Math.abs(d.limitSeconds - p.length / (tr.speeds[0] as number))).toBeLessThan(3);
        expect(d.payout).toBe(8000);
        expect(d.heat).toBe(0);
        const [g, s, b] = trialTimes(d.limitSeconds);
        expect(g).toBeLessThan(s);
        expect(s).toBeLessThan(b);
      }
    } finally { sim.dispose(); }
  }, 60_000);

  it('10.2 the coins lay the line; the medal by the clock pays gold 8,000, silver 5,000, bronze 3,000; the best is kept and saved', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const d = trials(sim)[0]!;
      const [g, s, b] = trialTimes(d.limitSeconds);
      const paid: number[] = [];
      const read = (): void => { sim.events.readFrom(seq, (e) => { if (e.kind === 'jobDone') paid.push(e.value); }); };
      let seq = sim.events.sequence;
      enter(sim, d);
      expect(sim.jobs.state).toBe('active');
      expect(sim.coins!.routeTotal).toBeGreaterThan(20);
      finish(sim, d, g - 2);
      expect(sim.jobs.state).toBe('done');
      expect(sim.jobs.lastMedal).toBe(3);
      read();
      expect(paid).toEqual([8000]);
      // silver, then bronze: the pay by the medal, the best stays gold
      for (const [elapsed, medal, pay] of [[(g + s) / 2, 2, 5000], [(s + b) / 2, 1, 3000]] as const) {
        run(sim, BALANCE.jobs.holdSeconds + 0.2);
        // off the marker and back in (a finished job re-arms once the car has left the ring)
        sim.vehicle.teleport({ x: d.x + 30, y: 0.8, z: d.z + 30 }, 0);
        run(sim, 0.1);
        seq = sim.events.sequence;
        paid.length = 0;
        enter(sim, d);
        finish(sim, d, elapsed);
        expect(sim.jobs.lastMedal).toBe(medal);
        read();
        expect(paid).toEqual([pay]);
      }
      expect(sim.jobs.medals.get(d.id)).toBe(3);
      expect(trialMedal(d.limitSeconds, b + 1)).toBe(0);
      // saved and read back
      const doc = defaultSave();
      collect(sim, doc);
      expect(doc.medals).toBe('3');
      const again = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
      try {
        apply(again, doc);
        expect(again.jobs.medals.get(d.id)).toBe(3);
      } finally { again.dispose(); }
    } finally { sim.dispose(); }
  }, 60_000);

  it('10.3 slower than bronze: no medal, nothing paid', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const d = trials(sim)[1]!;
      const seq = sim.events.sequence;
      enter(sim, d);
      sim.jobs.remaining = 0.5;
      run(sim, 1);
      expect(sim.jobs.state).toBe('failed');
      let done = 0;
      sim.events.readFrom(seq, (e) => { if (e.kind === 'jobDone') done++; });
      expect(done).toBe(0);
      expect(sim.jobs.medals.has(d.id)).toBe(false);
    } finally { sim.dispose(); }
  }, 60_000);
});
