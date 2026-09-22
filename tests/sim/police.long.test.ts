/**
 * Long-running police pins: the bot under the pursuit for 45–90 s of sim time
 * per case. Run by `npm run verify:gate` and `npm run test:long`, not by the
 * quick `npm run verify` (CLAUDE.md, working method).
 */
import { describe, expect, it } from 'vitest';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { POLICE } from '../../src/sim/police/tuning';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import type { SimWorld } from '../../src/sim';
import { createWorld } from './helpers';

/** Signed angle between the player's nose and the bearing to a point, degrees. */
function viewAngle(sim: SimWorld, x: number, z: number): number {
  const probe = sim.probe;
  const along = (x - probe.x) * Math.sin(probe.yaw) + (z - probe.z) * Math.cos(probe.yaw);
  const side = (x - probe.x) * -Math.cos(probe.yaw) + (z - probe.z) * Math.sin(probe.yaw);
  return Math.abs(Math.atan2(side, along)) * 180 / Math.PI;
}

describe('police patrols (long)', () => {
  it('sends the level-1 pair within three seconds and never into the view cone', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 20 });
    const bot = new TrackBot('muscle', CITY_BOT_TUNING);
    const traffic = sim.traffic as Traffic;
    const police = sim.police!;
    let firstUnit = -1;
    let worstSpawn = 180;
    const seen = new Set<number>();
    try {
      for (let tick = 0; tick < 90 * 60; tick++) {
        bot.drive(sim, sim.controls, 1 / 60);
        sim.step();
        for (let u = 0; u < police.units.length; u++) {
          const agent = police.units[u] as number;
          if (agent < 0 || seen.has(agent)) continue;
          seen.add(agent);
          // The step that placed it: judge the spawn pose against the player's own view.
          const distance = Math.hypot((traffic.x[agent] as number) - sim.probe.x, (traffic.z[agent] as number) - sim.probe.z);
          const angle = viewAngle(sim, traffic.x[agent] as number, traffic.z[agent] as number);
          expect(distance).toBeGreaterThanOrEqual(POLICE.spawnMin - 1);
          expect(traffic.kindOf(agent)).toBe('police');
          expect(traffic.police[agent]).toBe(1);
          if (angle < worstSpawn) worstSpawn = angle;
          if (firstUnit < 0) firstUnit = sim.time;
        }
        expect(police.count).toBeLessThanOrEqual(POLICE.budget[1] as number);
      }
      console.log(`[police] first unit at ${firstUnit.toFixed(2)} s, ${seen.size} dispatched, closest spawn to the view axis ${worstSpawn.toFixed(0)}°`);
      expect(firstUnit).toBeGreaterThanOrEqual(0);
      expect(firstUnit).toBeLessThanOrEqual(3);
      expect(worstSpawn).toBeGreaterThan(POLICE.viewHalfAngleDeg);
      expect(police.count).toBe(POLICE.budget[1] as number);
    } finally { sim.dispose(); }
  }, 120_000);

  it('pays for the level it is at and keeps the body pool shared', async () => {
    for (const level of [2, 5]) {
      const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: level * 20 });
      const bot = new TrackBot('muscle', CITY_BOT_TUNING);
      const traffic = sim.traffic as Traffic;
      const police = sim.police!;
      let maxPoliceBodies = 0;
      let minAlive = Infinity;
      let minCivilians = Infinity;
      try {
        for (let tick = 0; tick < 45 * 60; tick++) {
          bot.drive(sim, sim.controls, 1 / 60);
          sim.step();
          maxPoliceBodies = Math.max(maxPoliceBodies, traffic.policeBodies());
          if (sim.time > 5) {
            minAlive = Math.min(minAlive, traffic.count(AgentState.Kinematic) + traffic.count(AgentState.Physical));
            let civilians = 0;
            for (let i = 0; i < traffic.capacity; i++) {
              const st = traffic.state[i];
              if (traffic.police[i] === 0 && (st === AgentState.Kinematic || st === AgentState.Physical)) civilians++;
            }
            minCivilians = Math.min(minCivilians, civilians);
          }
          expect(police.count).toBeLessThanOrEqual(POLICE.budget[level] as number);
        }
        let interceptors = 0;
        // the Chief (level 5, slice 7) drives the sports body but is not one of the level's interceptors
        for (const agent of police.units) if (agent >= 0 && agent !== police.chief && traffic.kindOf(agent) === 'sports') interceptors++;
        console.log(`[police] level ${level}: ${police.count} units, ${interceptors} interceptors, ${maxPoliceBodies} police bodies, ${minAlive} cars alive at the worst moment`);
        expect(police.count).toBe(POLICE.budget[level] as number);
        expect(interceptors).toBe(POLICE.interceptors[level] as number);
        // The pursuit borrows from the traffic; it never owns the pool and never empties the street.
        expect(maxPoliceBodies).toBeLessThanOrEqual(TRAFFIC.policeBodies);
        expect(minAlive).toBeGreaterThan(20);
        // at level 5 the pursuit holds up to 14 of the 48 records (8 units, 4 parked patrols, 2 roadblock cars)
        expect(minCivilians).toBeGreaterThanOrEqual(level === 5 ? 28 : 36);
      } finally { sim.dispose(); }
    }
  }, 180_000);
});
