/**
 * The police brain and the damage model (docs/M4_PLAN.md slice 3c): a nudge
 * is not a kill, a police car takes a real slam to write off, hitting a
 * police car nobody was chasing you in costs heat and gets you seen, and a
 * lost pursuit searches where it last saw the player. The arrest across the
 * city (bot-free but traffic-pool driven) is in brain.long.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { POLICE } from '../../src/sim/police/tuning';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import type { SimWorld } from '../../src/sim';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run, runUntil } from './helpers';

/** The island's east boundary wall face (a fixed, restitution-1 solid). */
const WALL_FACE = 786.5;

/** A straight street lane long enough for a chase-and-bump. */
function streetLane(traffic: Traffic): number {
  const lanes = traffic.lanes;
  for (let i = 0; i < lanes.laneCount; i++) {
    if ((lanes.limit[i] as number) === TRAFFIC.speedStreet && (lanes.length[i] as number) > 150) return i;
  }
  return -1;
}

describe('the police brain', () => {
  it('3c.1 a nudge from behind leaves a police car and a civilian driving on, dented at most', async () => {
    for (const kind of ['police', 'civilian'] as const) {
      const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
      const traffic = sim.traffic as Traffic;
      try {
        const lane = streetLane(traffic);
        expect(lane).toBeGreaterThanOrEqual(0);
        const pose = { x: 0, z: 0, yaw: 0 };
        traffic.lanes.positionAt(lane, 20, 0, pose);
        sim.city?.sync(pose.x, pose.z, true);
        sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
        run(sim, 0.5);
        // a police record ahead on the lane (the dispatcher never spawns in view, so the flag is set by hand)
        const agent = traffic.spawnAt(lane, 50, kind === 'police' ? 'police' : 'compact');
        expect(agent).toBeGreaterThanOrEqual(0);
        if (kind === 'police') traffic.police[agent] = 1;
        // close from 30 m back at 4 m/s over the car's 14 m/s, let go at the touch
        let touched = false, maxDv = 0;
        run(sim, 10, (_t, _c, s) => {
          const dv = traffic.playerDv[agent] as number;
          maxDv = Math.max(maxDv, dv);
          if (dv > 0.5) touched = true;
          if (!touched) s.vehicle.setVelocity(Math.sin(pose.yaw) * 18, s.vehicle.telemetry.vy, Math.cos(pose.yaw) * 18);
        });
        run(sim, 6);
        console.log(`[brain] ${kind} nudged at dv ${maxDv.toFixed(1)} m/s: state ${traffic.state[agent]}, damage ${(traffic.damage[agent] as number).toFixed(2)}, speed ${(traffic.speed[agent] as number).toFixed(1)}`);
        expect(touched).toBe(true);
        expect(maxDv).toBeGreaterThan(TRAFFIC.disturbedImpact);
        expect(traffic.state[agent]).not.toBe(AgentState.Wrecked);
        expect(traffic.state[agent]).not.toBe(AgentState.Free);
        expect(traffic.damage[agent] as number).toBeLessThan(0.3);
        expect(traffic.speed[agent] as number).toBeGreaterThan(4);
      } finally { sim.dispose(); }
    }
  }, 60_000);

  it('3c.2 a police car shoved into a wall at speed is still a takedown, worth police money', async () => {
    // the player's own damage off: a 110 km/h wall hit would wreck it too and spill part of the bag
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, damage: false });
    const traffic = sim.traffic as Traffic;
    try {
      const yaw = Math.PI / 2, z = 100;
      sim.vehicle.teleport({ x: WALL_FACE - 26, y: 1, z }, yaw);
      const agent = traffic.spawnParkedPolice(WALL_FACE - 3.5, z, yaw, 'police');
      run(sim, 0.5);
      let takedowns = 0, seq = sim.events.sequence;
      for (let i = 0; i < 3 * 60; i++) {
        if (i < 60) sim.vehicle.setVelocity(Math.sin(yaw) * (110 / 3.6), sim.vehicle.telemetry.vy, Math.cos(yaw) * (110 / 3.6));
        sim.step();
        seq = sim.events.readFrom(seq, (e) => { if (e.kind === 'takedown' && e.target === agent) takedowns++; });
      }
      expect(takedowns).toBe(1);
      expect(traffic.state[agent]).toBe(AgentState.Wrecked);
      expect(sim.run.bag).toBe(BALANCE.bag.policeTakedown);
    } finally { sim.dispose(); }
  }, 30_000);

  it('3c.3 hitting a police car nobody was chasing you in costs heat, once per contact', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    try {
      const lane = streetLane(traffic);
      const pose = { x: 0, z: 0, yaw: 0 };
      traffic.lanes.positionAt(lane, 40, 0, pose);
      sim.city?.sync(pose.x, pose.z, true);
      sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
      run(sim, 0.5);
      traffic.lanes.positionAt(lane, 50, 0, pose);
      traffic.spawnParkedPolice(pose.x, pose.z, pose.yaw, 'police');
      run(sim, 0.3);
      expect(sim.heat.points).toBe(0);
      // roll into its back bumper at 20 km/h and stay against it
      run(sim, 2.5, (_t, c, s) => { if (s.probe.speed < 20 / 3.6) c.throttle = 0.4; });
      expect(sim.heat.points).toBe(BALANCE.heat.policeHit);
    } finally { sim.dispose(); }
  }, 30_000);

  it('3c.4 a lost pursuit drives to the last fix instead of wandering off', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 20 });
    const traffic = sim.traffic as Traffic;
    const police = sim.police as NonNullable<SimWorld['police']>;
    try {
      sim.spawnAt('highway');
      expect(runUntil(sim, 15, (s) => s.pursuit.state === 'active')).toBeGreaterThan(0);
      const fixX = sim.pursuit.lastX, fixZ = sim.pursuit.lastZ;
      // gone: across the island, out of every ray's reach
      sim.spawnAt('marina');
      expect(runUntil(sim, 2, (s) => s.pursuit.state === 'lost')).toBeGreaterThan(0);
      const toFix = (): number[] => Array.from(police.units).filter((a) => a >= 0)
        .map((a) => Math.hypot((traffic.x[a] as number) - fixX, (traffic.z[a] as number) - fixZ));
      const start = toFix();
      let closest = Math.min(...start);
      run(sim, POLICE.escapeSeconds[1] as number - 1, () => { closest = Math.min(closest, ...toFix()); });
      const end = toFix();
      console.log(`[brain] search: to the fix ${start.map((d) => d.toFixed(0)).join('/')} m at the loss, ${end.map((d) => d.toFixed(0)).join('/')} m later, closest ${closest.toFixed(0)} m`);
      expect(sim.pursuit.state).toBe('lost');
      expect(closest).toBeLessThan(POLICE.search.reach);
      for (let k = 0; k < end.length; k++) expect(end[k] as number).toBeLessThan(Math.max(start[k] as number, POLICE.search.reach) + 60);
    } finally { sim.dispose(); }
  }, 60_000);
});
