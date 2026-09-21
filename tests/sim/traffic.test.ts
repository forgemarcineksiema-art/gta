/**
 * Kinematic traffic on the city graph: lane holding, separation, determinism,
 * braking for a stopped player, and the cost of a full pool.
 */
import { describe, expect, it } from 'vitest';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import type { LanePose, LaneProjection } from '../../src/sim/traffic/lanes';
import { createWorld, run } from './helpers';

const pose: LanePose = { x: 0, z: 0, yaw: 0 };

describe('traffic', () => {
  it('stays on its lane at or under the limit', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    const bot = new TrackBot('muscle', CITY_BOT_TUNING);
    const traffic = sim.traffic as Traffic;
    try {
      for (let i = 0; i < 30 * 60; i++) {
        bot.drive(sim, sim.controls, 1 / 60);
        sim.step();
        for (let a = 0; a < traffic.capacity; a++) {
          if (traffic.state[a] !== AgentState.Kinematic) continue;
          const lane = traffic.lane[a] as number;
          traffic.lanes.positionAt(lane, traffic.s[a] as number, traffic.laneOffset[a] as number, pose, traffic.next[a]);
          const dx = (traffic.x[a] as number) - pose.x;
          const dz = (traffic.z[a] as number) - pose.z;
          expect(Math.hypot(dx, dz)).toBeLessThan(0.6);
          expect(traffic.speed[a] as number).toBeLessThanOrEqual((traffic.lanes.limit[lane] as number) + 0.1);
        }
      }
      expect(traffic.count(AgentState.Kinematic)).toBeGreaterThan(10);
    } finally { sim.dispose(); }
  }, 60_000);

  it('keeps cars apart, including through junctions', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    const bot = new TrackBot('muscle', CITY_BOT_TUNING);
    const traffic = sim.traffic as Traffic;
    let minSame = Infinity;
    let minAny = Infinity;
    try {
      for (let step = 0; step < 60 * 60; step++) {
        bot.drive(sim, sim.controls, 1 / 60);
        sim.step();
        for (let i = 0; i < traffic.capacity; i++) {
          if (traffic.state[i] !== AgentState.Kinematic) continue;
          for (let j = i + 1; j < traffic.capacity; j++) {
            if (traffic.state[j] !== AgentState.Kinematic) continue;
            const dx = (traffic.x[i] as number) - (traffic.x[j] as number);
            const dz = (traffic.z[i] as number) - (traffic.z[j] as number);
            const dist = Math.hypot(dx, dz);
            if (dist < minAny) minAny = dist;
            if (traffic.lane[i] === traffic.lane[j] && dist < minSame) minSame = dist;
          }
        }
      }
      console.log(`[traffic] waited past junction ${traffic.waitedPast}, min same-lane ${minSame.toFixed(2)} m, min any ${minAny.toFixed(2)} m, alive ${traffic.count(AgentState.Kinematic)}`);
      expect(traffic.count(AgentState.Kinematic)).toBeGreaterThan(10);
      expect(minSame).toBeGreaterThanOrEqual(4.5);
      expect(minAny).toBeGreaterThanOrEqual(2.5);
    } finally { sim.dispose(); }
  }, 120_000);

  it('is identical from the same seed and inputs', async () => {
    const runOnce = async () => {
      const sim = await createWorld({ map: 'city', seed: 7, traffic: 1, peds: 0, record: false });
      try {
        for (let i = 0; i < 600; i++) {
          sim.controls.throttle = 1;
          sim.controls.steer = Math.sin(i / 40) * 0.4;
          sim.step();
        }
        return {
          x: Array.from(sim.traffic?.x ?? []),
          z: Array.from(sim.traffic?.z ?? []),
          state: Array.from(sim.traffic?.state ?? []),
        };
      } finally { sim.dispose(); }
    };
    expect(await runOnce()).toEqual(await runOnce());
  }, 60_000);

  it('stops behind a stopped player and does not hit them', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lanes = traffic.lanes;
    let lane = -1;
    for (let i = 0; i < lanes.laneCount; i++) {
      if ((lanes.limit[i] as number) === 14 && (lanes.length[i] as number) > 110) { lane = i; break; }
    }
    expect(lane).toBeGreaterThanOrEqual(0);
    lanes.positionAt(lane, 90, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const agent = traffic.spawnAt(lane, 60, 'compact');
    expect(agent).toBeGreaterThanOrEqual(0);
    try {
      run(sim, 8);
      const here = sim.vehicle.body.translation();
      const proj: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0 };
      lanes.project(lane, here.x, here.z, proj);
      const along = proj.s - (traffic.s[agent] as number);
      const hits: string[] = [];
      sim.events.readFrom(0, (e) => { if (e.kind === 'hit') hits.push(e.kind); });
      expect(hits).toEqual([]);
      expect(traffic.speed[agent] as number).toBeLessThan(1);
      expect(along).toBeGreaterThanOrEqual(5);
      expect(along).toBeLessThanOrEqual(9);
    } finally { sim.dispose(); }
  }, 30_000);

  it('steps 48 agents in under 3 ms', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    try {
      let filled = false;
      for (let i = 0; i < 30 * 60 && !filled; i++) {
        sim.controls.throttle = 1;
        sim.step();
        filled = traffic.count(AgentState.Kinematic) >= 48;
      }
      expect(filled).toBe(true);
      const steps = 3600;
      const t0 = performance.now();
      for (let i = 0; i < steps; i++) {
        sim.controls.throttle = 1;
        sim.step();
      }
      const mean = (performance.now() - t0) / steps;
      console.log(`[traffic] mean step ${mean.toFixed(3)} ms with ${traffic.count(AgentState.Kinematic)} agents`);
      expect(mean).toBeLessThan(3);
    } finally { sim.dispose(); }
  }, 60_000);

  it('lends a body near the player and returns it far away', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    const bot = new TrackBot('muscle', CITY_BOT_TUNING);
    const traffic = sim.traffic as Traffic;
    const bodies = traffic.tuning.physicsBodies;
    try {
      for (let step = 0; step < 60 * 60; step++) {
        bot.drive(sim, sim.controls, 1 / 60);
        sim.step();
        const px = sim.vehicle.body.translation().x;
        const pz = sim.vehicle.body.translation().z;
        let lent = 0;
        for (let i = 0; i < traffic.capacity; i++) {
          if (traffic.state[i] === AgentState.Free) continue;
          const dx = (traffic.x[i] as number) - px;
          const dz = (traffic.z[i] as number) - pz;
          const dist = Math.hypot(dx, dz);
          const held = traffic.state[i] === AgentState.Physical || traffic.state[i] === AgentState.Disturbed || traffic.state[i] === AgentState.Wrecked;
          if (held) lent++;
          if (dist < 35) expect(traffic.state[i]).not.toBe(AgentState.Kinematic);
          if (dist > 70) expect(held).toBe(false);
        }
        expect(lent).toBeLessThanOrEqual(bodies);
      }
      expect(traffic.guardHops).toBe(0);
    } finally { sim.dispose(); }
  }, 120_000);

  it('pushes a car in a rear-end and keeps most of the player speed', async () => {
    const sim = await createWorld({ map: 'city', seed: 3, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lane = longLane(traffic, 14, 120);
    const pose = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 40, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const agent = traffic.spawnAt(lane, 60, 'compact');
    traffic.speed[agent] = 10;
    let hitAt = -1;
    let hitSpeed = 0;
    let pushed = false;
    let maxSpeed = 0;
    let after = -1;
    try {
      for (let i = 0; i < 180; i++) {
        const yaw = pose.yaw;
        if (hitAt < 0 && i < 25) sim.vehicle.setVelocity(Math.sin(yaw) * (80 / 3.6), 0, Math.cos(yaw) * (80 / 3.6));
        sim.step();
        maxSpeed = Math.max(maxSpeed, traffic.speed[agent]);
        if (maxSpeed > 12) pushed = true;
        if (hitAt < 0) {
          sim.events.readFrom(0, (e) => {
            if (e.kind === 'hit' && e.target === agent) hitAt = sim.time;
          });
          if (hitAt >= 0) hitSpeed = Math.abs(sim.vehicle.telemetry.speed);
        } else if (sim.time >= hitAt + 1 && after < 0) {
          after = Math.abs(sim.vehicle.telemetry.speed);
          break;
        }
      }
      expect(hitAt).toBeGreaterThan(0);
      expect(hitAt).toBeLessThan(2);
      expect(pushed).toBe(true);
      expect(after).toBeGreaterThan(hitSpeed * 0.25);
      expect(after).toBeLessThan(hitSpeed * 0.85);
      expect(sim.hasNaN()).toBe(false);
      const held = traffic.state[agent] === AgentState.Disturbed || traffic.state[agent] === AgentState.Physical || traffic.state[agent] === AgentState.Wrecked;
      expect(held).toBe(true);
    } finally { sim.dispose(); }
  }, 30_000);

  it('knocks a stopped car sideways in a T-bone and stays upright', async () => {
    const sim = await createWorld({ map: 'city', seed: 5, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lane = longLane(traffic, 14, 120);
    const pose = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 40, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const agent = traffic.spawnAt(lane, 48, 'compact');
    traffic.speed[agent] = 0;
    sim.step();
    traffic.setFacing(agent, pose.yaw + Math.PI / 2);
    const x0 = traffic.x[agent] as number;
    const z0 = traffic.z[agent] as number;
    const fx = Math.sin(pose.yaw);
    const fz = Math.cos(pose.yaw);
    let moved = 0;
    try {
      for (let i = 0; i < 100; i++) {
        traffic.state[agent] = AgentState.Disturbed;
        traffic.disturbedFor[agent] = 4;
        if (i < 15) sim.vehicle.setVelocity(fx * (100 / 3.6), 0, fz * (100 / 3.6));
        sim.step();
        const dx = (traffic.x[agent] as number) - x0;
        const dz = (traffic.z[agent] as number) - z0;
        moved = Math.max(moved, Math.abs(dx * fx + dz * fz));
      }
      expect(moved).toBeGreaterThanOrEqual(3);
      expect(upnessOf(sim)).toBeGreaterThan(0.8);
      expect(sim.hasNaN()).toBe(false);
    } finally { sim.dispose(); }
  }, 30_000);

  it('returns a body once the player drives away', async () => {
    const sim = await createWorld({ map: 'city', seed: 9, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lane = longLane(traffic, 14, 140);
    const pose = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 30, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const agent = traffic.spawnAt(lane, 48, 'muscle');
    let disturbed = false;
    try {
      for (let i = 0; i < 150 && !disturbed; i++) {
        sim.vehicle.setVelocity(Math.sin(pose.yaw) * 25, 0, Math.cos(pose.yaw) * 25);
        sim.step();
        disturbed = traffic.state[agent] === AgentState.Disturbed || traffic.state[agent] === AgentState.Wrecked;
      }
      expect(disturbed).toBe(true);
      traffic.lanes.positionAt(lane, 30, 0, pose);
      const away = 90;
      sim.vehicle.teleport({ x: pose.x + Math.sin(pose.yaw) * -away, y: 1, z: pose.z + Math.cos(pose.yaw) * -away }, pose.yaw);
      for (let i = 0; i < 90; i++) sim.step();
      const dx = (traffic.x[agent] as number) - sim.vehicle.body.translation().x;
      const dz = (traffic.z[agent] as number) - sim.vehicle.body.translation().z;
      expect(Math.hypot(dx, dz)).toBeLessThan(traffic.tuning.despawn);
      expect(traffic.state[agent]).not.toBe(AgentState.Free);
      expect(traffic.state[agent] === AgentState.Kinematic || traffic.state[agent] === AgentState.Wrecked).toBe(true);
      expect(traffic.state[agent]).not.toBe(AgentState.Physical);
      expect(traffic.state[agent]).not.toBe(AgentState.Disturbed);
    } finally { sim.dispose(); }
  }, 30_000);
});

function longLane(traffic: Traffic, limit: number, minLength: number): number {
  for (let i = 0; i < traffic.lanes.laneCount; i++) {
    if ((traffic.lanes.limit[i] as number) === limit && (traffic.lanes.length[i] as number) > minLength) return i;
  }
  return 0;
}

function upnessOf(sim: { vehicle: { slot: number }; transforms: { currRot: Float32Array } }): number {
  const q = sim.transforms.currRot;
  const i = sim.vehicle.slot * 4;
  const x = q[i] as number;
  const z = q[i + 2] as number;
  return 1 - 2 * (x * x + z * z);
}
