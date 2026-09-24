/**
 * Near-miss and oncoming-lane boost. Bands are wide enough for a retune of ECONOMY.
 * Long (M7 slice 0): moved out of the quick verify's minute; `npm run verify:gate` runs it.
 */
import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../../src/sim/economy';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

describe('boost economy', () => {
  it('counts one oncoming near miss and ignores a 3 m pass', async () => {
    const close = await pass('close', 0.95 + 0.85 + 1);
    expect(close.kinds.filter((k) => k === 'nearMissOncoming')).toHaveLength(1);
    expect(close.boost - close.before).toBeCloseTo(ECONOMY.nearMissOncomingBoost, 3);
    const wide = await pass('wide', 0.95 + 0.85 + 3);
    expect(wide.kinds.filter((k) => k === 'nearMissOncoming' || k === 'nearMiss')).toHaveLength(0);
  }, 30_000);

  it('pays for the oncoming lane and not for the right direction', async () => {
    const against = await holdLane(true);
    const expected = 3 * ECONOMY.oncomingBoostPerSecond;
    expect(against.boost - against.before).toBeGreaterThan(expected * 0.85);
    expect(against.boost - against.before).toBeLessThan(expected * 1.15);
    expect(against.oncoming).toBeGreaterThanOrEqual(2);
    const withFlow = await holdLane(false);
    expect(withFlow.oncoming).toBe(0);
  }, 30_000);

  it('caps the meter at 1', async () => {
    const sim = await createWorld({ map: 'city', seed: 4, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lane = street(traffic);
    const pose = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 40, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 0.8, z: pose.z }, pose.yaw);
    run(sim, 1);
    sim.vehicle.boostMeter = 0.95;
    const agent = place(traffic, lane, 70, 1);
    try {
      run(sim, 3, (_t, c) => {
        c.throttle = 1;
        sim.vehicle.setVelocity(Math.sin(pose.yaw) * (100 / 3.6), 0, Math.cos(pose.yaw) * (100 / 3.6));
      });
      expect(sim.vehicle.boostMeter).toBe(1);
      void agent;
    } finally { sim.dispose(); }
  }, 30_000);
});

async function pass(name: string, lateral: number): Promise<{ kinds: string[]; boost: number; before: number }> {
  const sim = await createWorld({ map: 'city', seed: name === 'close' ? 4 : 5, traffic: 0, peds: 0, record: false });
  const traffic = sim.traffic as Traffic;
  const lane = street(traffic);
  const pose = { x: 0, z: 0, yaw: 0 };
  traffic.lanes.positionAt(lane, 50, 0, pose);
  sim.vehicle.teleport({ x: pose.x, y: 0.8, z: pose.z }, pose.yaw);
  run(sim, 1);
  sim.vehicle.boostMeter = 0.2;
  const before = sim.vehicle.boostMeter;
  place(traffic, lane, 90, lateral);
  const kinds: string[] = [];
  try {
    run(sim, 3, () => {
      sim.vehicle.setVelocity(Math.sin(pose.yaw) * (100 / 3.6), 0, Math.cos(pose.yaw) * (100 / 3.6));
    });
    sim.events.readFrom(0, (e) => kinds.push(e.kind));
    return { kinds, boost: sim.vehicle.boostMeter, before };
  } finally { sim.dispose(); }
}

async function holdLane(opposed: boolean): Promise<{ boost: number; before: number; oncoming: number }> {
  const sim = await createWorld({ map: 'city', seed: 8, traffic: 0, peds: 0, record: false });
  const traffic = sim.traffic as Traffic;
  const lane = street(traffic);
  const pose = { x: 0, z: 0, yaw: 0 };
  traffic.lanes.positionAt(lane, 60, 0, pose);
  const yaw = opposed ? pose.yaw + Math.PI : pose.yaw;
  sim.vehicle.teleport({ x: pose.x, y: 0.8, z: pose.z }, yaw);
  run(sim, 0.5);
  traffic.lanes.positionAt(lane, 60, 0, pose);
  sim.vehicle.teleport({ x: pose.x, y: sim.vehicle.body.translation().y, z: pose.z }, yaw);
  sim.vehicle.boostMeter = 0.1;
  const before = sim.vehicle.boostMeter;
  let oncoming = 0;
  try {
    run(sim, 3, () => {
      sim.vehicle.setVelocity(Math.sin(yaw) * (80 / 3.6), 0, Math.cos(yaw) * (80 / 3.6));
    });
    sim.events.readFrom(0, (e) => { if (e.kind === 'oncoming') oncoming++; });
    return { boost: sim.vehicle.boostMeter, before, oncoming };
  } finally { sim.dispose(); }
}

function street(traffic: Traffic): number {
  for (let i = 0; i < traffic.lanes.laneCount; i++) {
    if ((traffic.lanes.limit[i] as number) === 14 && (traffic.lanes.length[i] as number) > 100) return i;
  }
  return 0;
}

function place(traffic: Traffic, lane: number, s: number, lateral: number): number {
  const pose = { x: 0, z: 0, yaw: 0 };
  traffic.lanes.positionAt(lane, s, lateral, pose);
  const agent = traffic.spawnAt(lane, s, 'compact');
  traffic.x[agent] = pose.x;
  traffic.z[agent] = pose.z;
  traffic.yaw[agent] = pose.yaw + Math.PI;
  traffic.speed[agent] = 0;
  traffic.state[agent] = AgentState.Disturbed;
  traffic.disturbedFor[agent] = 30;
  return agent;
}
