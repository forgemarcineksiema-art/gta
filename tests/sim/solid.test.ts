/**
 * Solid cars (docs/M8.6_PLAN.md, DESIGN.md §18): a driving car stays on its four wheels under a push, and a shaken car
 * drives again only once it is back on them, with nothing left to see of the turn.
 */
import { describe, expect, it } from 'vitest';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import type { SimWorld } from '../../src/sim';
import { createWorld, run } from './helpers';

function streetLane(sim: SimWorld, min = 150): number {
  const lanes = (sim.traffic as Traffic).lanes;
  for (let i = 0; i < lanes.laneCount; i++) {
    if ((lanes.limit[i] as number) !== TRAFFIC.speedStreet || (lanes.length[i] as number) < min) continue;
    if (sim.city!.graph.lanes[i]!.points.length !== 2) continue;
    return i;
  }
  throw new Error('no street lane');
}

function pose(sim: SimWorld, lane: number, s: number, offset = 0): { x: number; z: number; yaw: number } {
  const p = { x: 0, z: 0, yaw: 0 };
  (sim.traffic as Traffic).lanes.positionAt(lane, s, offset, p);
  return p;
}

/** The drawn pose of an agent: its transform slot's position and rotation. */
function drawn(sim: SimWorld, agent: number): { y: number; q: [number, number, number, number] } {
  const slot = (sim.traffic as Traffic).slot[agent] as number;
  const p = sim.transforms.currPos, r = sim.transforms.currRot;
  return { y: p[slot * 3 + 1] as number, q: [r[slot * 4] as number, r[slot * 4 + 1] as number, r[slot * 4 + 2] as number, r[slot * 4 + 3] as number] };
}

function upOf(q: [number, number, number, number]): number {
  return 1 - 2 * (q[0] * q[0] + q[2] * q[2]);
}

/** The angle between two rotations, degrees. */
function turn(a: [number, number, number, number], b: [number, number, number, number]): number {
  const dot = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
  return 2 * Math.acos(dot) * 180 / Math.PI;
}

describe('solid cars: on four wheels', () => {
  it('M8.6 0.1 a driving car stays level and on its road, pushed on its flank and carrying the player on its tail', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      const lane = streetLane(sim);
      const at = pose(sim, lane, 60);
      sim.city?.sync(at.x, at.z, true);
      const agent = traffic.spawnAt(lane, 60, 'compact', AgentState.Kinematic);
      traffic.speed[agent] = 0;
      traffic.pace[agent] = 0.01;
      // the player square to the car's left flank, a hand's width off it
      const yaw = at.yaw - Math.PI / 2;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const off = sim.vehicle.tuning.chassisHalfExtents.z + traffic.halfWidthOf(agent) + 0.25;
      sim.vehicle.teleport({ x: at.x - fx * off, y: 0.8, z: at.z - fz * off }, yaw);
      sim.vehicle.setVelocity(0, 0, 0);
      run(sim, 0.4);
      expect(traffic.state[agent]).toBe(AgentState.Physical);
      const y0 = drawn(sim, agent).y;
      let physical = 0, least = 1, drop = 0;
      const watch = (): void => {
        if (traffic.state[agent] !== AgentState.Physical) return;
        physical++;
        const d = drawn(sim, agent);
        least = Math.min(least, upOf(d.q));
        drop = Math.max(drop, Math.abs(d.y - y0));
      };
      // a shove that builds from a walk to a run, as a unit's does
      const x0 = traffic.x[agent] as number, z0 = traffic.z[agent] as number, t0 = sim.tick;
      run(sim, 2, (tick) => {
        const v = Math.min(4, 0.8 + (tick - t0) / 60 * 1.5);
        sim.vehicle.setVelocity(fx * v, sim.vehicle.telemetry.vy, fz * v);
        watch();
      });
      const moved = Math.hypot((traffic.x[agent] as number) - x0, (traffic.z[agent] as number) - z0);
      // then the player's car let down onto its tail, as after a jump or climbing a pile: its weight off the middle
      const cy = traffic.yaw[agent] as number, bx = Math.sin(cy), bz = Math.cos(cy);
      const tail = traffic.halfLengthOf(agent) * 0.7;
      sim.vehicle.teleport({ x: (traffic.x[agent] as number) - bx * tail, y: 2.3, z: (traffic.z[agent] as number) - bz * tail }, cy);
      sim.vehicle.setVelocity(0, 0, 0);
      run(sim, 2, watch);
      console.log(`[solid] pushed ${moved.toFixed(2)} m, then carried the player; ${physical} driving steps: least up ${least.toFixed(5)}, height off ${(drop * 100).toFixed(1)} cm`);
      expect(physical).toBeGreaterThan(150);
      expect(moved).toBeGreaterThan(0.5);
      expect(least).toBeGreaterThan(0.999);
      expect(drop).toBeLessThan(0.02);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.6 0.2 a shaken car dropped onto its wheels at a lean drives again with no visible turn or drop', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      const lane = streetLane(sim);
      const at = pose(sim, lane, 60), back = pose(sim, lane, 45);
      sim.city?.sync(at.x, at.z, true);
      sim.vehicle.teleport({ x: back.x, y: 0.8, z: back.z }, back.yaw);
      sim.vehicle.setVelocity(0, 0, 0);
      const agent = traffic.spawnAt(lane, 60, 'compact', AgentState.Kinematic);
      traffic.speed[agent] = 0;
      traffic.pace[agent] = 0.01;
      run(sim, 0.4);
      expect(traffic.state[agent]).toBe(AgentState.Physical);
      // shaken: half a metre up, leaning 20° on its long axis, let go
      traffic.disturb(agent);
      const body = traffic.rigidBodyOf(agent)!;
      const p = body.translation();
      const half = 10 * Math.PI / 180;
      const qy = { x: 0, y: Math.sin(at.yaw / 2), z: 0, w: Math.cos(at.yaw / 2) };
      // yaw then a roll about the car's own long axis (local z)
      const qr = { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) };
      body.setTranslation({ x: p.x, y: p.y + 0.5, z: p.z }, true);
      body.setRotation({
        x: qy.w * qr.x + qy.x * qr.w + qy.y * qr.z - qy.z * qr.y,
        y: qy.w * qr.y - qy.x * qr.z + qy.y * qr.w + qy.z * qr.x,
        z: qy.w * qr.z + qy.x * qr.y - qy.y * qr.x + qy.z * qr.w,
        w: qy.w * qr.w - qy.x * qr.x - qy.y * qr.y - qy.z * qr.z,
      }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      sim.step();
      let prev = drawn(sim, agent), jump = -1, drop = -1, fell = 0;
      for (let k = 0; k < 6 * 60 && traffic.state[agent] === AgentState.Disturbed; k++) {
        sim.step();
        const now = drawn(sim, agent);
        fell = Math.max(fell, prev.y - now.y);
        if ((traffic.state[agent] as AgentState) === AgentState.Physical) { jump = turn(prev.q, now.q); drop = Math.abs(now.y - prev.y); }
        prev = now;
      }
      console.log(`[solid] back on its wheels after ${sim.time.toFixed(2)} s: the reattach turned it ${jump.toFixed(2)}°, moved it ${(drop * 100).toFixed(1)} cm`);
      expect(fell).toBeGreaterThan(0); // it fell: the shaken body meets the ground
      expect(traffic.state[agent]).toBe(AgentState.Physical);
      expect(jump).toBeGreaterThanOrEqual(0);
      expect(jump).toBeLessThan(2);
      expect(drop).toBeLessThan(0.05);
    } finally { sim.dispose(); }
  }, 60_000);
});
