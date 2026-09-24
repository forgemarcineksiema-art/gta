/**
 * The standoff (M7 slice 8, DESIGN.md §15.2): a civilian held up nose to nose
 * by a stopped player goes round them on the side away from them, creeping as
 * it steers: out on the oncoming side when the player stands at its kerb (the
 * M6 gate's case, where it pulled toward the player for good), to its kerb when
 * the player stands toward the middle. It never touches the player. And a
 * shoved car whose body is returned far from the player blends back onto its
 * lane instead of jumping.
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { createWorld, run } from './helpers';

/** A straight street lane with a lane the other way beside it. */
function streetWithReverse(traffic: Traffic, sim: SimWorld): number {
  const lanes = traffic.lanes;
  for (let i = 0; i < lanes.laneCount; i++) {
    if ((lanes.limit[i] as number) !== TRAFFIC.speedStreet || (lanes.length[i] as number) < 150) continue;
    if (sim.city!.graph.lanes[i]!.points.length !== 2 || (traffic.reverse[i] as number) < 0) continue;
    return i;
  }
  throw new Error('no straight street with a reverse lane');
}

async function standoff(playerSide: number): Promise<{ passed: boolean; moved: number; hits: number }> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
  try {
    sim.police!.dispatching = false;
    const traffic = sim.traffic as Traffic;
    const lane = streetWithReverse(traffic, sim);
    const pose = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 70, 0, pose);
    // right of the civilian's way is (-cos yaw, sin yaw): its kerb
    const px = pose.x - Math.cos(pose.yaw) * playerSide, pz = pose.z + Math.sin(pose.yaw) * playerSide;
    sim.city?.sync(px, pz, true);
    sim.vehicle.teleport({ x: px, y: 0.8, z: pz }, pose.yaw + Math.PI);
    sim.vehicle.setVelocity(0, 0, 0);
    // parked on the handbrake (a held brake at a standstill reverses)
    run(sim, 1, (_t, c) => { c.handbrake = 1; });
    const agent = traffic.spawnAt(lane, 30, 'sedan');
    const start = sim.probe;
    const x0 = start.x, z0 = start.z;
    let hits = 0, cursor = sim.events.sequence;
    let passed = false;
    for (let k = 0; k < 20 * 60 && !passed; k++) {
      sim.controls.handbrake = 1;
      sim.step();
      cursor = sim.events.readFrom(cursor, (e) => { if (e.kind === 'hit' && e.target === agent) hits++; });
      if (traffic.state[agent] === AgentState.Free) break;
      const ahead = ((traffic.x[agent] as number) - x0) * Math.sin(pose.yaw) + ((traffic.z[agent] as number) - z0) * Math.cos(pose.yaw);
      if (ahead > 6) passed = true;
    }
    return { passed, moved: Math.hypot(sim.probe.x - x0, sim.probe.z - z0), hits };
  } finally { sim.dispose(); }
}

describe('the standoff', () => {
  it('M7 8.1 a civilian nose to nose with a stopped player goes round them on the far side, and never touches them', async () => {
    // the player at the civilian's kerb (the M6 gate's case): round on the oncoming side
    const kerb = await standoff(1.2);
    expect(kerb.passed).toBe(true);
    expect(kerb.hits).toBe(0);
    expect(kerb.moved).toBeLessThan(0.3);
    // the player toward the middle: round by the kerb
    const middle = await standoff(-1.2);
    expect(middle.passed).toBe(true);
    expect(middle.hits).toBe(0);
    expect(middle.moved).toBeLessThan(0.3);
  }, 60_000);

  it('M7 8.3 a car rammed off its lane whose body is returned blends back over a second: never more than 0.5 m a step', async () => {
    const sim = await createWorld({ map: 'city', seed: 9, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic;
      const lane = streetWithReverse(traffic, sim);
      const pose = { x: 0, z: 0, yaw: 0 };
      traffic.lanes.positionAt(lane, 30, 0, pose);
      sim.city?.sync(pose.x, pose.z, true);
      sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
      const agent = traffic.spawnAt(lane, 42, 'sedan');
      traffic.speed[agent] = 0;
      let knocked = false;
      for (let i = 0; i < 150 && !knocked; i++) {
        sim.vehicle.setVelocity(Math.sin(pose.yaw) * 20, 0, Math.cos(pose.yaw) * 20);
        sim.step();
        knocked = traffic.state[agent] === AgentState.Disturbed;
      }
      expect(knocked, `state ${traffic.state[agent]}`).toBe(true);
      // shoved 3 m off its lane to its kerb side, where a T-bone would leave it
      const lent = traffic as unknown as { bodies: Array<{ translation(): { x: number; y: number; z: number }; setTranslation(p: { x: number; y: number; z: number }, wake: boolean): void }>; agentBody: Int16Array };
      const body = lent.bodies[lent.agentBody[agent] as number]!;
      const at = body.translation();
      body.setTranslation({ x: at.x - Math.cos(pose.yaw) * 3, y: at.y, z: at.z + Math.sin(pose.yaw) * 3 }, true);
      for (let i = 0; i < 30; i++) { sim.controls.handbrake = 1; sim.step(); }
      // away: the settled car's body goes back and the car returns to its lane
      sim.vehicle.teleport({ x: pose.x - Math.sin(pose.yaw) * 90, y: 1, z: pose.z - Math.cos(pose.yaw) * 90 }, pose.yaw);
      sim.vehicle.setVelocity(0, 0, 0);
      let worst = 0, px = traffic.x[agent] as number, pz = traffic.z[agent] as number;
      for (let i = 0; i < 240; i++) {
        sim.controls.handbrake = 1;
        sim.step();
        if (traffic.state[agent] === AgentState.Free) break;
        const x = traffic.x[agent] as number, z = traffic.z[agent] as number;
        worst = Math.max(worst, Math.hypot(x - px, z - pz));
        px = x;
        pz = z;
      }
      expect(traffic.state[agent] === AgentState.Kinematic || traffic.state[agent] === AgentState.Wrecked).toBe(true);
      expect(worst).toBeLessThan(0.5);
    } finally { sim.dispose(); }
  }, 60_000);
});
