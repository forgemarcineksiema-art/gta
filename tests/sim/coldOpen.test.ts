/**
 * The cold open (docs/M4_PLAN.md slice 4): the van at heat 1 with the pair
 * sent out of sight, the candidate drawn alongside, the coin line and the
 * route's reach, and skip (the bot through every verb, 4.5, is in
 * coldOpen.long.test.ts). City, seed 42, traffic on.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { POLICE } from '../../src/sim/police/tuning';
import type { SimWorld } from '../../src/sim';
import type { Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, runUntil } from './helpers';

/** Angle between the player's nose and the bearing to a point, degrees. */
function viewAngle(sim: SimWorld, x: number, z: number): number {
  const p = sim.probe;
  const along = (x - p.x) * Math.sin(p.yaw) + (z - p.z) * Math.cos(p.yaw);
  const side = (x - p.x) * -Math.cos(p.yaw) + (z - p.z) * Math.sin(p.yaw);
  return Math.abs(Math.atan2(side, along)) * 180 / Math.PI;
}

async function coldWorld(): Promise<SimWorld> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
  sim.coldOpen.start();
  return sim;
}

describe('cold open', () => {
  it('4.1 start() leaves a heavy at stage 2 on the loop spawn at heat 20, and the pair arrives within 3 s out of view', async () => {
    const sim = await coldWorld();
    const traffic = sim.traffic as Traffic;
    try {
      const spawn = sim.spawns.find((s) => s.name === 'loop')!;
      const p = sim.vehicle.body.translation();
      expect(sim.coldOpen.active).toBe(true);
      expect(sim.carId).toBe('heavy');
      expect(sim.life.state.stage).toBe(2);
      expect(Math.hypot(p.x - spawn.position.x, p.z - spawn.position.z)).toBeLessThan(1);
      expect(sim.heat.points).toBe(BALANCE.coldOpen.heat);
      expect(sim.heat.level).toBe(1);
      const seen = new Set<number>();
      let worst = 180;
      const t = runUntil(sim, 3, (s) => {
        for (const agent of s.police!.units) {
          if (agent < 0 || seen.has(agent)) continue;
          seen.add(agent);
          expect(traffic.kindOf(agent)).toBe('police');
          worst = Math.min(worst, viewAngle(s, traffic.x[agent] as number, traffic.z[agent] as number));
        }
        return s.police!.count === (POLICE.budget[1] as number);
      });
      expect(t).toBeGreaterThan(0);
      expect(worst).toBeGreaterThan(POLICE.viewHalfAngleDeg);
    } finally { sim.dispose(); }
  }, 60_000);

  it('4.2 a muscle car is a swap candidate within 10 s while the car holds its lane at 60 km/h', async () => {
    const sim = await coldWorld();
    const traffic = sim.traffic as Traffic;
    try {
      const yaw = sim.spawns.find((s) => s.name === 'loop')!.yaw;
      const v = 60 / 3.6;
      const t = runUntil(sim, 10, (s) => s.life.state.swapCandidate >= 0 && traffic.kindOf(s.life.state.swapCandidate) === 'muscle',
        (_t, c, s) => {
          c.throttle = 1;
          s.vehicle.setVelocity(Math.sin(yaw) * v, s.vehicle.telemetry.vy, Math.cos(yaw) * v);
        });
      expect(t).toBeGreaterThan(0);
      expect(sim.coldOpen.caption).toBe('swap');
    } finally { sim.dispose(); }
  }, 60_000);

  it('4.3 the coin line runs from the spawn to the marker: a coin within 6 m of every 30 m of the route', async () => {
    const sim = await coldWorld();
    try {
      const route = sim.coldOpen.route!;
      const coins: Array<{ x: number; z: number }> = [...sim.coins!.extra, ...sim.city!.coinLayout];
      // the gate's own line lies in its chunk's list
      for (const s of route.samples) if (s.s % 225 < 3) coins.push(...sim.city!.generate(Math.round(s.x / 225), Math.round(s.z / 225)).coins);
      expect(sim.coins!.extra.length).toBeGreaterThan(50);
      let gaps = 0;
      for (const s of route.samples) {
        if (s.s % 30 >= 3 || s.s > route.markerS) continue;
        if (!coins.some((c) => (c.x - s.x) ** 2 + (c.z - s.z) ** 2 <= 36)) gaps++;
      }
      expect(gaps).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);

  it('4.4 the marker and the hideout lie on one lane path under 1.5 km from the spawn, with a billboard gate on it', async () => {
    const sim = await coldWorld();
    try {
      const route = sim.coldOpen.route!;
      const samples = route.samples;
      const last = samples[samples.length - 1]!;
      expect(last.s).toBeLessThan(1500);
      for (let i = 1; i < samples.length; i++) expect(Math.hypot(samples[i]!.x - samples[i - 1]!.x, samples[i]!.z - samples[i - 1]!.z)).toBeLessThan(3.5);
      const near = (x: number, z: number): number => Math.min(...samples.map((s) => Math.hypot(s.x - x, s.z - z)));
      expect(near(route.markerX, route.markerZ)).toBeLessThan(1);
      expect(route.markerS).toBeGreaterThan(BALANCE.coldOpen.markerAt - 1);
      const job = sim.jobs.defOf(sim.coldOpen.job)!;
      expect(near(job.targetX, job.targetZ)).toBeLessThan(BALANCE.jobs.markerRadius);
      expect(route.gate).not.toBeNull();
      expect(near(route.gate!.x, route.gate!.z)).toBeLessThan(12);
      expect(route.gateS).toBeLessThan(route.markerS);
    } finally { sim.dispose(); }
  }, 60_000);

  it('4.6 skip() ends the script, and a second start() in the same world does nothing', async () => {
    const sim = await coldWorld();
    try {
      const job = sim.coldOpen.job;
      expect(sim.jobs.defOf(job)).not.toBeNull();
      sim.coldOpen.skip();
      expect(sim.coldOpen.active).toBe(false);
      expect(sim.coldOpen.caption).toBeNull();
      expect(sim.coldOpen.candidate).toBe(-1);
      expect(sim.jobs.defOf(job)).toBeNull();
      const defs = sim.jobs.defs.length;
      sim.coldOpen.start();
      expect(sim.coldOpen.active).toBe(false);
      expect(sim.jobs.defs.length).toBe(defs);
    } finally { sim.dispose(); }
  }, 60_000);
});
