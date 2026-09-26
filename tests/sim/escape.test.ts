/**
 * Pursuit escape (docs/history/M5_PLAN.md slice 3): the marker sets the heat to its
 * level's threshold and the police have the player on the same step; the
 * escape pays `bounty × level`; a higher heat is kept; busted ends it with no
 * bounty; the level-4 marker brings the level-4 roster. City, seed 42.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { POLICE } from '../../src/sim/police/tuning';
import type { JobDef, SimWorld } from '../../src/sim';
import type { Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, runUntil } from './helpers';

function escapes(sim: SimWorld): JobDef[] {
  return sim.jobs.defs.filter((d) => d.kind === 'escape');
}

function drop(sim: SimWorld, x: number, z: number, yaw = 0): void {
  sim.city?.sync(x, z, true);
  sim.vehicle.teleport({ x, y: 0.8, z }, yaw);
  sim.vehicle.setVelocity(0, 0, 0);
}

function count(sim: SimWorld, from: number, kind: string): number {
  let n = 0;
  sim.events.readFrom(from, (e) => { if (e.kind === kind) n++; });
  return n;
}

async function quietWorld(traffic = 0): Promise<SimWorld> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic, peds: 0, record: false });
  if (traffic === 0) sim.police!.dispatching = false;
  return sim;
}

describe('pursuit escape', () => {
  it('3.1 entering sets the heat to the level\'s threshold and the pursuit active on the same step', async () => {
    const sim = await quietWorld();
    try {
      const d = escapes(sim).find((e) => e.level === 3)!;
      drop(sim, d.x, d.z, d.yaw);
      sim.step();
      expect(sim.jobs.state).toBe('active');
      expect(sim.jobs.active).toBe(d.id);
      expect(Number.isNaN(sim.jobs.remaining)).toBe(true);
      expect(sim.heat.points).toBeGreaterThanOrEqual(BALANCE.heatThresholds[2] as number);
      expect(sim.heat.level).toBe(3);
      expect(sim.pursuit.state).toBe('active');
      // and the door's multiplier knows the police had the player at 3
      expect(sim.run.maxHeat).toBe(3);
    } finally { sim.dispose(); }
  });

  it('3.2 the escape pays bounty × level into the bag', async () => {
    const sim = await quietWorld();
    try {
      const d = escapes(sim).find((e) => e.level === 2)!;
      drop(sim, d.x, d.z, d.yaw);
      sim.step();
      const bag = sim.run.bag;
      const seq = sim.events.sequence;
      // nobody on duty: the radio's fix runs out, then the sight is lost and the cooldown runs out
      const t = runUntil(sim, BALANCE.jobs.escape.radioSeconds + (POLICE.escapeSeconds[2] ?? 8) + 2, (s) => s.jobs.state === 'done');
      expect(t).toBeGreaterThan(BALANCE.jobs.escape.radioSeconds);
      let paid = -1;
      sim.events.readFrom(seq, (e) => { if (e.kind === 'jobDone') paid = e.value; });
      expect(paid).toBe(BALANCE.jobs.escape.bounty * 2);
      expect(sim.run.bag - bag).toBe(BALANCE.jobs.escape.bounty * 2 + BALANCE.bag.escapePerLevel * 2);
      expect(count(sim, seq, 'escape')).toBe(1);
    } finally { sim.dispose(); }
  });

  it('3.3 a higher heat is kept: the ratchet never lowers', async () => {
    const sim = await quietWorld();
    try {
      sim.heat.add(90);
      const d = escapes(sim).find((e) => e.level === 2)!;
      drop(sim, d.x, d.z, d.yaw);
      sim.step();
      expect(sim.jobs.state).toBe('active');
      expect(sim.heat.points).toBe(90);
    } finally { sim.dispose(); }
  });

  it('3.4 busted ends the job with no bounty', async () => {
    const sim = await quietWorld();
    try {
      const d = escapes(sim).find((e) => e.level === 2)!;
      drop(sim, d.x, d.z, d.yaw);
      sim.step();
      expect(sim.jobs.state).toBe('active');
      // two cruisers either side of the stopped car
      const p = sim.probe;
      const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
      (sim.traffic as Traffic).spawnParkedPolice(p.x + rx * 3.5, p.z + rz * 3.5, p.yaw, 'police');
      (sim.traffic as Traffic).spawnParkedPolice(p.x - rx * 3.5, p.z - rz * 3.5, p.yaw, 'police');
      const seq = sim.events.sequence;
      expect(runUntil(sim, POLICE.busted.seconds + 1, (s) => s.run.state === 'busted')).toBeGreaterThan(0);
      expect(sim.jobs.state).toBe('idle');
      expect(count(sim, seq, 'jobDone')).toBe(0);
      expect(count(sim, seq, 'jobFailed')).toBe(0);
    } finally { sim.dispose(); }
  });

  it('3.5 the level-4 marker brings the level-4 roster within 3 s', async () => {
    const sim = await quietWorld(1);
    try {
      const d = escapes(sim).find((e) => e.level === 4)!;
      drop(sim, d.x, d.z, d.yaw);
      // the ground roster: the level's budget less the helicopter's place (M5.5 slice 9)
      const ground = (POLICE.budget[4] as number) - 1;
      const t = runUntil(sim, 3, (s) => s.police!.count >= ground);
      expect(sim.heat.level).toBe(4);
      expect(t).toBeGreaterThan(0);
      expect(sim.police!.count).toBe(ground);
    } finally { sim.dispose(); }
  });
});
