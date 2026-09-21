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
});
