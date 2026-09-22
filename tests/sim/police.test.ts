/**
 * Level-1 patrols: detection in the open, reinforcement after a wreck, and the
 * ram. The bot-driven dispatch and roster pins are in police.long.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { POLICE } from '../../src/sim/police/tuning';
import type { LaneProjection } from '../../src/sim/traffic/lanes';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run, runUntil } from './helpers';

describe('police patrols', () => {
  it('detects a patrol in the open, and heat 0 leaves the same car driving its lane', async () => {
    for (const heat of [0, 20]) {
      const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat });
      const traffic = sim.traffic as Traffic;
      try {
        // Stand on the highway, where a spawned patrol has a clear line to the player.
        sim.spawnAt('highway');
        run(sim, 4);
        expect(sim.heat.level).toBe(heat === 0 ? 0 : 1);
        const police = sim.police!;
        if (heat === 0) {
          run(sim, 12);
          expect(police.count).toBe(0);
          expect(sim.pursuit.state).toBe('idle');
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

  it('3.13 unitsWithin counts live police cars only, never the civilian beside the player', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const police = sim.police!;
    try {
      const x = 0, z = 700;
      const a = traffic.spawnParkedPolice(x + 3.5, z, 0, 'police');
      traffic.spawnParkedPolice(x - 3.5, z, 0, 'sports');
      traffic.spawnAtPoint(x, z + 5, 0, 'compact', AgentState.Abandoned);
      traffic.spawnParkedPolice(x + 10, z, 0, 'police');
      expect(police.unitsWithin(x, z, POLICE.busted.range)).toBe(2);
      traffic.wreck(a);
      expect(police.unitsWithin(x, z, POLICE.busted.range)).toBe(1);
      expect(police.unitsWithin(x, z, 12)).toBe(2);
    } finally { sim.dispose(); }
  });

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
