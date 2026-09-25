/**
 * Level-1 patrols: reinforcement after a wreck and the ram. Detection in the
 * open and the bot-driven dispatch and roster pins are in police.long.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { POLICE } from '../../src/sim/police/tuning';
import type { LaneProjection } from '../../src/sim/traffic/lanes';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, kmh, run, runUntil, upness } from './helpers';

describe('police patrols', () => {

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

  it('6.7 / 6.9 at level 3 four patrols wait at the junctions within 450 m, lit within 200 m; at heat 0 the same car is dark and a swap candidate', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 60 });
    sim.police!.dispatching = false;
    const traffic = sim.traffic as Traffic;
    const police = sim.police!;
    try {
      // just north of the centre junction, looking south: the junction behind is 160 m off, the rest further
      sim.city?.sync(0, 4.5, true);
      sim.vehicle.teleport({ x: 4.5, y: 0.8, z: 30 }, Math.PI);
      run(sim, 2, (_t, c) => { c.brake = 1; });
      const sites = sim.cover!.parkedJunctions;
      const live = Array.from(police.parked).filter((a) => a >= 0);
      expect(live.length).toBe(POLICE.parked.count);
      let near = -1;
      for (let k = 0; k < police.parked.length; k++) {
        const agent = police.parked[k] as number;
        const site = sites[police.parkedAt[k] as number]!;
        expect(Math.hypot((traffic.x[agent] as number) - site.x, (traffic.z[agent] as number) - site.z)).toBeLessThan(0.5);
        expect(traffic.state[agent]).toBe(AgentState.Parked);
        const d = Math.hypot(site.x - sim.probe.x, site.z - sim.probe.z);
        expect(d).toBeLessThanOrEqual(POLICE.parked.radius);
        expect(traffic.lights[agent]).toBe(d < POLICE.parked.lightsRange ? 1 : 0);
        if (d < POLICE.parked.lightsRange && (near < 0 || d < Math.hypot((traffic.x[near] as number) - sim.probe.x, (traffic.z[near] as number) - sim.probe.z))) near = agent;
      }
      expect(near).toBeGreaterThanOrEqual(0);
      // the run ends: heat 0; the nearest car keeps its place, dark, and takes a swap like any car
      sim.heat.reset();
      run(sim, 1, (_t, c) => { c.brake = 1; });
      expect(traffic.state[near]).toBe(AgentState.Parked);
      expect(traffic.lights[near]).toBe(0);
      const x = traffic.x[near] as number, z = traffic.z[near] as number, yaw = traffic.yaw[near] as number;
      sim.city?.sync(x, z, true);
      sim.vehicle.teleport({ x: x + Math.cos(yaw) * 3.4, y: 0.8, z: z - Math.sin(yaw) * 3.4 }, yaw);
      run(sim, 0.8, (_t, c) => { c.brake = 1; });
      expect(sim.life.state.swapCandidate).toBe(near);
    } finally { sim.dispose(); }
  }, 60_000);

  it('6.8 a parked patrol that sees the player pulls out with a chase plan inside one sight tick, and the pursuit is on', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 60 });
    sim.police!.dispatching = false;
    const traffic = sim.traffic as Traffic;
    const police = sim.police!;
    try {
      // a patrol waits at a junction 150 m down the player's street, out of view behind the car
      const sites = sim.cover!.parkedJunctions;
      const index = sites.findIndex((j) => Math.hypot(j.x, j.z) < 400);
      const site = sites[index]!;
      const pose = { x: 0, z: 0, yaw: 0 };
      traffic.lanes.positionAt(site.lane, site.s - 150, 0, pose);
      sim.city?.sync(pose.x, pose.z, true);
      sim.vehicle.teleport({ x: pose.x, y: 0.8, z: pose.z }, pose.yaw + Math.PI);
      expect(runUntil(sim, 3, () => Array.from(police.parkedAt).includes(index), (_t, c) => { c.brake = 1; })).toBeGreaterThan(0);
      const agent = police.parked[Array.from(police.parkedAt).indexOf(index)] as number;
      // then the player stops 45 m from it, still facing away: in its line of sight
      traffic.lanes.positionAt(site.lane, site.s - 45, 0, pose);
      traffic.clearAround(pose.x, pose.z, 30);
      sim.vehicle.teleport({ x: pose.x, y: 0.8, z: pose.z }, pose.yaw + Math.PI);
      const from = sim.tick;
      const t = runUntil(sim, 2, () => Array.from(police.units).includes(agent), (_t, c) => { c.brake = 1; });
      expect(t).toBeGreaterThan(0);
      expect(sim.tick - from).toBeLessThanOrEqual(POLICE.sightEveryTicks + 1);
      expect([AgentState.Kinematic, AgentState.Physical]).toContain(traffic.state[agent]);
      run(sim, 1 / 60, (_t, c) => { c.brake = 1; });
      expect(['detected', 'active']).toContain(sim.pursuit.state);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 17.2 a ram on a bike at 50 km/h tumbles it, not a wreck, and it drives on within 2 s; the shove is 0.6 of a car\'s', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 20, car: 'moto', damage: true });
    sim.police!.dispatching = false;
    const traffic = sim.traffic as Traffic;
    const lanes = traffic.lanes;
    try {
      let lane = -1;
      for (let i = 0; i < lanes.laneCount; i++) {
        if ((lanes.limit[i] as number) === TRAFFIC.speedHighway && (lanes.length[i] as number) > 170) { lane = i; break; }
      }
      const pose = { x: 0, z: 0, yaw: 0 };
      lanes.positionAt(lane, 60, 0, pose);
      sim.city!.sync(pose.x, pose.z, true);
      sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
      const v = 50 / 3.6, fx = Math.sin(pose.yaw), fz = Math.cos(pose.yaw);
      run(sim, 0.5, (_t, _c, s) => s.vehicle.setVelocity(fx * v, s.vehicle.telemetry.vy, fz * v));
      const proj: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
      lanes.project(lane, sim.probe.x, sim.probe.z, proj);
      const unit = traffic.spawnPoliceAt(lane, Math.max(4, proj.s - 20), 'police', sim.probe, 0, -1, 4);
      sim.police!.enlist(unit);
      let shove = 0;
      const fell = runUntil(sim, 8, (s) => s.vehicle.tumbleLeft > 0, (_t, c, s) => {
        s.pursuit.force();
        c.throttle = kmh(s) < 50 ? 0.7 : 0;
        shove = Math.max(shove, traffic.ramAccel[unit] as number);
      });
      expect(fell).toBeGreaterThan(0);
      expect(shove).toBeCloseTo(POLICE.ramAcceleration * POLICE.bikeShove, 6);
      expect(sim.life.state.wrecked).toBe(false);
      const drives = runUntil(sim, 2, (s) => s.vehicle.tumbleLeft === 0 && kmh(s) > 5 && upness(s) > 0.9, (_t, c, s) => {
        if (s.vehicle.tumbleLeft === 0) c.throttle = 1;
      });
      expect(drives).toBeGreaterThan(0);
      expect(sim.life.state.wrecked).toBe(false);
    } finally { sim.dispose(); }
  }, 60_000);
});
