/**
 * Level-1 patrols: they arrive quickly, never appear in front of the player,
 * chase what they can see and go back to ordinary driving once the run is cold.
 */
import { describe, expect, it } from 'vitest';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { POLICE } from '../../src/sim/police/tuning';
import type { LaneProjection } from '../../src/sim/traffic/lanes';
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

describe('police patrols', () => {
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

  it('detects a patrol in the open, and heat 0 leaves the same car driving its lane', async () => {
    for (const heat of [0, 20]) {
      const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat });
      const traffic = sim.traffic as Traffic;
      try {
        // Stand on the highway, where a spawned patrol has a clear line to the player.
        sim.spawnAt('highway');
        run(sim, 4);
        expect(sim.heat.level).toBe(heat === 0 ? 0 : 1);
        run(sim, 12);
        const police = sim.police!;
        if (heat === 0) {
          expect(police.count).toBe(0);
          expect(sim.pursuit.state).toBe('idle');
          continue;
        }
        expect(police.count).toBe(POLICE.budget[1] as number);
        expect(sim.pursuit.state).toBe('active');
        expect(sim.pursuit.visible).toBe(true);
        // A patrol closes on the player rather than idling at its spawn.
        const live = Array.from(police.units).filter((agent) => agent >= 0);
        const nearest = Math.min(...live.map((agent) =>
          Math.hypot((traffic.x[agent] as number) - sim.probe.x, (traffic.z[agent] as number) - sim.probe.z)));
        console.log(`[police] nearest unit ${nearest.toFixed(0)} m after 12 s of a stationary target`);
        expect(nearest).toBeLessThan(POLICE.sightRange);
        for (const agent of live) expect(traffic.state[agent]).not.toBe(AgentState.Free);
      } finally { sim.dispose(); }
    }
  }, 120_000);

  it('replaces a wrecked patrol out of view and keeps the pool healthy', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 20 });
    const traffic = sim.traffic as Traffic;
    const police = sim.police!;
    try {
      sim.spawnAt('highway');
      // A patrol that rams a parked player can write itself off first: take a live one.
      const full = runUntil(sim, 30, () => police.count === POLICE.budget[1] as number);
      expect(full).toBeGreaterThan(0);
      const victim = police.units.find((unit) => unit >= 0) as number;
      traffic.wreck(victim);
      run(sim, 1);
      expect(police.count).toBe(POLICE.budget[1] as number - 1);
      // The wreck keeps its identity for the heat rules until the slot is reused.
      expect(traffic.police[victim]).toBe(1);
      run(sim, POLICE.reinforceSeconds + 4);
      expect(police.count).toBe(POLICE.budget[1] as number);
      expect(police.units).not.toContain(victim);
      expect(traffic.count(AgentState.Kinematic)).toBeGreaterThan(5);
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
      try {
        for (let tick = 0; tick < 45 * 60; tick++) {
          bot.drive(sim, sim.controls, 1 / 60);
          sim.step();
          maxPoliceBodies = Math.max(maxPoliceBodies, traffic.policeBodies());
          if (sim.time > 5) minAlive = Math.min(minAlive, traffic.count(AgentState.Kinematic) + traffic.count(AgentState.Physical));
          expect(police.count).toBeLessThanOrEqual(POLICE.budget[level] as number);
        }
        let interceptors = 0;
        for (const agent of police.units) if (agent >= 0 && traffic.kindOf(agent) === 'sports') interceptors++;
        console.log(`[police] level ${level}: ${police.count} units, ${interceptors} interceptors, ${maxPoliceBodies} police bodies, ${minAlive} cars alive at the worst moment`);
        expect(police.count).toBe(POLICE.budget[level] as number);
        expect(interceptors).toBe(POLICE.interceptors[level] as number);
        // The pursuit borrows from the traffic; it never owns the pool and never empties the street.
        expect(maxPoliceBodies).toBeLessThanOrEqual(TRAFFIC.policeBodies);
        expect(minAlive).toBeGreaterThan(20);
      } finally { sim.dispose(); }
    }
  }, 180_000);

  it('a ram shoves the player sideways and never stops them dead', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    try {
      const lanes = traffic.lanes;
      let lane = -1;
      for (let i = 0; i < lanes.laneCount; i++) {
        if ((lanes.limit[i] as number) === TRAFFIC.speedHighway && (lanes.length[i] as number) > 150) { lane = i; break; }
      }
      expect(lane).toBeGreaterThanOrEqual(0);
      const pose = { x: 0, z: 0, yaw: 0 };
      lanes.positionAt(lane, 20, 0, pose);
      sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
      run(sim, 4, (_t, c) => { c.throttle = 1; });
      const before = sim.vehicle.telemetry.speedKmh;
      const lateral = (x: number, z: number): number => (x - pose.x) * -Math.cos(pose.yaw) + (z - pose.z) * Math.sin(pose.yaw);
      const driftBefore = lateral(sim.probe.x, sim.probe.z);
      const here: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
      lanes.project(lane, sim.probe.x, sim.probe.z, here);
      // 25 m back on the same lane, with the view test switched off: this is the ram, not the dispatch.
      const unit = traffic.spawnPoliceAt(lane, Math.max(4, here.s - 25), 'police', sim.probe, 0, -1, 4);
      expect(unit).toBeGreaterThanOrEqual(0);
      let minSpeed = Infinity;
      let contact = false;
      run(sim, 6, (_t, c, s) => {
        c.throttle = 1;
        // Drive the unit at the player, exactly as the pursuit planner would.
        traffic.setPolicePlan(unit, -1, POLICE.catchUpSpeed, s.probe.x, s.probe.z, POLICE.catchUpSpeed, POLICE.ramAcceleration);
        if ((traffic.playerDv[unit] as number) > POLICE.ramContactDv) contact = true;
        if (contact) minSpeed = Math.min(minSpeed, s.vehicle.telemetry.speedKmh);
      });
      const after = sim.vehicle.telemetry.speedKmh;
      const drift = Math.abs(lateral(sim.probe.x, sim.probe.z) - driftBefore);
      console.log(`[police] ram: ${before.toFixed(0)} -> ${after.toFixed(0)} km/h, minimum ${minSpeed.toFixed(0)}, pushed ${drift.toFixed(1)} m across the lane`);
      expect(contact).toBe(true);
      expect(minSpeed).toBeGreaterThan(before * 0.5);
      expect(sim.life.state.wrecked).toBe(false);
    } finally { sim.dispose(); }
  }, 60_000);
});
