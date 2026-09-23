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
import { createWorld, run, runUntil } from './helpers';

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
        // the pin is level 1's pair: the bot's speeding past them and the chase's drip (M5.5) are put back
        if (sim.heat.level > 1) sim.heat.set(20);
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
        // the helicopter keeps one of the budget's places from its level on (M5.5 slice 9); a parked patrol or a
        // roadblock's car that joins the chase (M4 slice 6, `enlist`) may take that place back
        expect(police.count).toBeGreaterThanOrEqual((POLICE.budget[level] as number) - (level >= POLICE.heli.fromLevel ? 1 : 0));
        expect(police.count).toBeLessThanOrEqual(POLICE.budget[level] as number);
        expect(interceptors).toBe(POLICE.interceptors[level] as number);
        // The pursuit borrows from the traffic; it never owns the pool and never empties the street.
        expect(maxPoliceBodies).toBeLessThanOrEqual(TRAFFIC.policeBodies);
        expect(minAlive).toBeGreaterThan(20);
        // at level 5 the police hold up to the roster's budget (a patrol that joins in takes the helicopter's place
        // back), the parked patrols, the roadblock's two cars and the donut shop's two (M5.5 slice 18); the streets
        // thin as the chase grows (M5.5, DESIGN.md §13.8: `densityByLevel`), and the rest are civilians
        const moving = Math.floor(TRAFFIC.agents * (TRAFFIC.densityByLevel[level] as number));
        const held = (POLICE.budget[5] as number) + POLICE.parked.count + 2 + 2;
        expect(minCivilians).toBeGreaterThanOrEqual(level === 5 ? moving - held : 36);
      } finally { sim.dispose(); }
    }
  }, 180_000);
});

// Moved unchanged from `police.test.ts` in M5.1: over ~10 s of wall time under the parallel suite.
describe('police patrols (long)', () => {
  it('detects a patrol in the open, and heat 0 keeps the beat driving its lanes with no chase', async () => {
    for (const heat of [0, 20]) {
      // the beat is part of the traffic (M5.5): the heat-0 case runs with civilians on
      const sim = await createWorld({ map: 'city', seed: 42, traffic: heat === 0 ? 1 : 0, peds: 0, record: false, heat });
      const traffic = sim.traffic as Traffic;
      try {
        // Stand on the highway, where a spawned patrol has a clear line to the player.
        sim.spawnAt('highway');
        run(sim, 4);
        expect(sim.heat.level).toBe(heat === 0 ? 0 : 1);
        const police = sim.police!;
        if (heat === 0) {
          // the beat (M5.5): budget[0] patrols on duty, lane drivers with the lights off, and no chase
          // without a crime, however long they look at the player
          run(sim, 12);
          expect(police.count).toBe(POLICE.budget[0] as number);
          expect(sim.pursuit.state).toBe('idle');
          expect(sim.heat.level).toBe(0);
          for (const agent of police.units) {
            if (agent < 0) continue;
            expect(traffic.police[agent]).toBe(1);
            expect(traffic.lights[agent]).toBe(0);
            expect([AgentState.Kinematic, AgentState.Physical]).toContain(traffic.state[agent]);
          }
          continue;
        }
        // the pair is on duty and sees the player within the window...
        const found = runUntil(sim, 12, (s) => s.pursuit.state === 'active' && s.police!.count === (POLICE.budget[1] as number));
        expect(found).toBeGreaterThan(0);
        expect(sim.pursuit.visible).toBe(true);
        // ...closing on the player rather than idling at its spawn,
        const live = Array.from(police.units).filter((agent) => agent >= 0);
        const nearest = Math.min(...live.map((agent) =>
          Math.hypot((traffic.x[agent] as number) - sim.probe.x, (traffic.z[agent] as number) - sim.probe.z)));
        console.log(`[police] nearest unit ${nearest.toFixed(0)} m when the pursuit went active on a stationary target`);
        expect(nearest).toBeLessThan(POLICE.sightRange);
        for (const agent of live) expect(traffic.state[agent]).not.toBe(AgentState.Free);
        // ...and a player who just sits there is boxed and busted (the arrest, slice 3c)
        expect(runUntil(sim, 20, (s) => s.run.state === 'busted')).toBeGreaterThan(0);
      } finally { sim.dispose(); }
    }
  }, 120_000);
});
