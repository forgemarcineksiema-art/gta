/**
 * Traffic with character (M5.5 slice 3, docs/DESIGN.md §13.8): a driver per
 * record (the pace and the class under the limit), the overtake on the
 * highway, the flinch at the player coming head-on, the pull-over for a lit
 * unit and the unit going round, the pass round a dead car, the clone cap.
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { bodySpec } from '../../src/sim/traffic/bodies';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { createWorld, run } from './helpers';

const T = TRAFFIC;

/** A straight two-point street lane at least `min` m long that has a lane the other way. */
function streetLane(sim: SimWorld, min = 150): number {
  const traffic = sim.traffic as Traffic;
  const lanes = traffic.lanes;
  for (let i = 0; i < lanes.laneCount; i++) {
    if ((lanes.limit[i] as number) !== T.speedStreet || (lanes.length[i] as number) < min) continue;
    if (sim.city!.graph.lanes[i]!.points.length !== 2 || (traffic.reverse[i] as number) < 0) continue;
    return i;
  }
  throw new Error('no street lane');
}

/** A slow (outer) highway lane with a parallel lane whose straight run goes on for two more lanes. */
function highwaySlowLane(sim: SimWorld): number {
  const traffic = sim.traffic as Traffic;
  const lanes = traffic.lanes;
  for (let i = 0; i < lanes.laneCount; i++) {
    const other = traffic.parallel[i] as number;
    if (other < 0 || (lanes.offset[i] as number) <= (lanes.offset[other] as number) || (lanes.length[i] as number) < 170) continue;
    let lane = i, ok = true;
    for (let k = 0; k < 2 && ok; k++) {
      const next = lanes.outs(lane).find((o) => lanes.straightThrough(lane, o) && (lanes.offset[o] as number) === (lanes.offset[i] as number));
      if (next === undefined) ok = false; else lane = next;
    }
    if (ok) return i;
  }
  throw new Error('no highway lane');
}

/**
 * The player stopped 60 m behind the lane's start, facing along it: inside the despawn radius, out of the
 * cars' way and beyond the 40 m where bodies are lent, so the scene runs on the kinematic path.
 */
function parkPlayerBehind(sim: SimWorld, lane: number): void {
  const p = pose(sim, lane, 0);
  const x = p.x - Math.sin(p.yaw) * 60, z = p.z - Math.cos(p.yaw) * 60;
  sim.city?.sync(x, z, true);
  sim.vehicle.teleport({ x, y: 0.8, z }, p.yaw);
  sim.vehicle.setVelocity(0, 0, 0);
}

function pose(sim: SimWorld, lane: number, s: number): { x: number; z: number; yaw: number } {
  const p = { x: 0, z: 0, yaw: 0 };
  (sim.traffic as Traffic).lanes.positionAt(lane, s, 0, p);
  return p;
}

describe('traffic with character', () => {
  it('3.1 every driver draws a pace from the table; free cars run at their own share of the limit and never above the fastest', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic;
      run(sim, 4);
      const paces = new Set<number>();
      let civilians = 0;
      for (let i = 0; i < traffic.capacity; i++) {
        if (traffic.state[i] !== AgentState.Kinematic || traffic.police[i] === 1) continue;
        civilians++;
        const pace = traffic.pace[i] as number;
        expect(T.pace.values.some((v) => Math.abs(v - pace) < 1e-6)).toBe(true);
        paces.add(pace);
        if ((traffic.angryLeft[i] as number) > 0) continue;
        const lane = traffic.lane[i] as number;
        const max = (traffic.lanes.limit[lane] as number) * Math.max(...T.pace.values) * Math.max(...Object.values(T.classPace));
        expect(traffic.speed[i] as number).toBeLessThanOrEqual(max + 0.1);
      }
      expect(civilians).toBeGreaterThan(15);
      expect(paces.size).toBeGreaterThanOrEqual(3);
      expect(traffic.clones / Math.max(1, traffic.spawns)).toBeLessThan(0.1);
    } finally { sim.dispose(); }
  }, 60_000);

  it('3.2 on the highway a fast car moves over past a slow one and gets ahead of it', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      const lane = highwaySlowLane(sim);
      const at = pose(sim, lane, 60);
      parkPlayerBehind(sim, lane);
      const slow = traffic.spawnAt(lane, 60, 'heavy');
      const fast = traffic.spawnAt(lane, 15, 'compact');
      traffic.pace[slow] = 0.85;
      traffic.pace[fast] = 1.18;
      traffic.bad[slow] = 0;
      traffic.bad[fast] = 0;
      const fx = Math.sin(at.yaw), fz = Math.cos(at.yaw);
      const along = (i: number): number => ((traffic.x[i] as number) - at.x) * fx + ((traffic.z[i] as number) - at.z) * fz;
      let moved = false;
      run(sim, 18, (_t, _c, s) => {
        if ((s.traffic!.lane[fast] as number) === (traffic.parallel[lane] as number)) moved = true;
      });
      expect(moved).toBe(true);
      expect(traffic.overtakes).toBeGreaterThanOrEqual(1);
      expect(along(fast)).toBeGreaterThan(along(slow) + 5);
    } finally { sim.dispose(); }
  }, 60_000);

  it('3.3 the player coming head-on: the car brakes hard, pulls to its kerb and honks', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      const lane = streetLane(sim);
      const car = traffic.spawnAt(lane, 30, 'compact');
      traffic.pace[car] = 1;
      traffic.bad[car] = 0;
      const p = pose(sim, lane, 95);
      sim.city?.sync(p.x, p.z, true);
      sim.vehicle.teleport({ x: p.x, y: 0.8, z: p.z }, p.yaw + Math.PI);
      const vx = -Math.sin(p.yaw) * 10, vz = -Math.cos(p.yaw) * 10;
      const seq = sim.events.sequence;
      run(sim, 1.3, (_t, _c, s) => s.vehicle.setVelocity(vx, s.vehicle.telemetry.vy, vz));
      let honks = 0;
      sim.events.readFrom(seq, (e) => { if (e.kind === 'honk' && e.target === car) honks++; });
      expect(traffic.flinches).toBeGreaterThanOrEqual(1);
      expect(traffic.shift[car] as number).toBeGreaterThanOrEqual(0.8);
      expect(traffic.speed[car] as number).toBeLessThan(8);
      expect(honks).toBeGreaterThanOrEqual(1);
    } finally { sim.dispose(); }
  }, 60_000);

  it('3.4 a lit unit behind: the car pulls to the kerb and crawls, the unit goes round it, the car comes back to its lane', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      const lane = streetLane(sim, 170);
      const at = pose(sim, lane, 90);
      parkPlayerBehind(sim, lane);
      const car = traffic.spawnAt(lane, 90, 'compact');
      traffic.pace[car] = 1;
      traffic.bad[car] = 0;
      const unit = traffic.spawnAt(lane, 50, 'police');
      traffic.police[unit] = 1;
      traffic.lights[unit] = 1;
      traffic.setPolicePlan(unit, -1, 17);
      const fx = Math.sin(at.yaw), fz = Math.cos(at.yaw);
      const along = (i: number): number => ((traffic.x[i] as number) - at.x) * fx + ((traffic.z[i] as number) - at.z) * fz;
      run(sim, 3, () => traffic.setPolicePlan(unit, -1, 17));
      expect(traffic.pullOvers).toBeGreaterThanOrEqual(1);
      expect(traffic.shift[car] as number).toBeGreaterThanOrEqual(1.2);
      expect(traffic.speed[car] as number).toBeLessThanOrEqual(T.pullOver.speed + 0.5);
      let passed = -1;
      run(sim, 8, (_t, _c, s) => {
        traffic.setPolicePlan(unit, -1, 17);
        if (passed < 0 && along(unit) > along(car) + 5) passed = s.time;
      });
      expect(passed).toBeGreaterThan(0);
      run(sim, T.pullOver.hold + 2, () => traffic.setPolicePlan(unit, -1, 17));
      expect(Math.abs(traffic.shift[car] as number)).toBeLessThanOrEqual(0.3);
    } finally { sim.dispose(); }
  }, 60_000);

  it('3.5 a queue of three behind an abandoned car goes round it on the oncoming side and back into its lane', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      const lane = streetLane(sim, 170);
      const at = pose(sim, lane, 100);
      parkPlayerBehind(sim, lane);
      // off the graph, as a swap leaves the player's old car
      const dead = traffic.spawnAtPoint(at.x, at.z, at.yaw, 'compact', AgentState.Abandoned);
      expect(dead).toBeGreaterThanOrEqual(0);
      const queue = [70, 55, 40].map((s) => {
        const i = traffic.spawnAt(lane, s, 'compact');
        traffic.pace[i] = 1;
        traffic.bad[i] = 0;
        return i;
      });
      const fx = Math.sin(at.yaw), fz = Math.cos(at.yaw);
      const past = (i: number): boolean => (traffic.lane[i] as number) !== lane
        || ((traffic.x[i] as number) - at.x) * fx + ((traffic.z[i] as number) - at.z) * fz > 8;
      // each waits its two seconds at the dead car, then crawls out and round: about six seconds a car
      run(sim, 24);
      for (const i of queue) expect(past(i), `car ${i} is still behind the abandoned car`).toBe(true);
      expect(traffic.gawks).toBeGreaterThanOrEqual(3);
      // and back on their side: nobody stays out on the oncoming lane
      run(sim, 4);
      for (const i of queue) expect(Math.abs(traffic.shift[i] as number)).toBeLessThanOrEqual(0.5);
    } finally { sim.dispose(); }
  }, 60_000);
});

describe('M8.8 slice 6: the three with connections; the rival at its car\'s pace', () => {
  it('M8.8 6.1 the Fake Cruiser\'s disco bar 40 m behind a car on its lane: it pulls over; a muscle car there, it drives on', async () => {
    for (const body of ['fakecop', 'muscle'] as const) {
      const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, body });
      try {
        sim.police!.dispatching = false;
        const traffic = sim.traffic as Traffic;
        const lane = streetLane(sim, 170);
        const p = pose(sim, lane, 60);
        sim.city?.sync(p.x, p.z, true);
        sim.vehicle.teleport({ x: p.x, y: 0.8, z: p.z }, p.yaw);
        sim.vehicle.setVelocity(0, 0, 0);
        const car = traffic.spawnAt(lane, 100, 'compact');
        traffic.pace[car] = 1;
        traffic.bad[car] = 0;
        run(sim, 1.5);
        if (body === 'fakecop') {
          expect(traffic.pullOvers).toBeGreaterThanOrEqual(1);
          expect(traffic.shift[car] as number).toBeGreaterThanOrEqual(1.2);
        } else {
          expect(traffic.pullOvers).toBe(0);
          expect(Math.abs(traffic.shift[car] as number)).toBeLessThan(0.3);
        }
      } finally { sim.dispose(); }
    }
  }, 60_000);

  it('M8.8 6.4 from a stop the Bubble\'s rival reaches 60 km/h before a sedan\'s record does, at its car\'s rate', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic;
      const lane = streetLane(sim, 170);
      parkPlayerBehind(sim, lane);
      const bubble = traffic.spawnRacer(lane, 110, 'bubble', 0, true);
      const sedan = traffic.spawnRacer(lane, 20, 'sedan', 0);
      const at = new Map<number, number>();
      run(sim, 4, (_t, _c, s) => {
        for (const i of [bubble, sedan]) {
          traffic.setRacePlan(i, -1, 25);
          if (!at.has(i) && (traffic.speed[i] as number) >= 60 / 3.6) at.set(i, s.time);
        }
      });
      expect(at.get(bubble)).toBeLessThan(at.get(sedan) as number);
      expect(at.get(bubble)).toBeCloseTo(60 / 3.6 / (bodySpec('bubble').aiAccel as number), 1);
      // a record with no rate of its own pulls away as a unit on a chase does
      expect(at.get(sedan)).toBeCloseTo(60 / 3.6 / (T.accel * 1.5), 1);
    } finally { sim.dispose(); }
  }, 60_000);
});
