/**
 * The police as a different animal (M5.5 slice 4, docs/DESIGN.md §13.9): the
 * police driving mode (round a slower car on the oncoming side), pressure
 * instead of a flat speed, the refill cadence by level, the roadside ambush,
 * the escape's progress and the search disc, the radio's lines, the chase's
 * bounty.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { EventLog } from '../../src/sim/events';
import { pressureSpeed } from '../../src/sim/police/Police';
import { DISPATCH, Pursuit } from '../../src/sim/police/Pursuit';
import { POLICE } from '../../src/sim/police/tuning';
import type { SimWorld } from '../../src/sim';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { createWorld, run, runUntil } from './helpers';

const P = POLICE;

function streetLane(sim: SimWorld): number {
  const traffic = sim.traffic as Traffic;
  const lanes = traffic.lanes;
  for (let i = 0; i < lanes.laneCount; i++) {
    if ((lanes.limit[i] as number) !== TRAFFIC.speedStreet || (lanes.length[i] as number) < 170) continue;
    if (sim.city!.graph.lanes[i]!.points.length !== 2 || (traffic.reverse[i] as number) < 0) continue;
    return i;
  }
  throw new Error('no street lane');
}

function pose(sim: SimWorld, lane: number, s: number): { x: number; z: number; yaw: number } {
  const p = { x: 0, z: 0, yaw: 0 };
  (sim.traffic as Traffic).lanes.positionAt(lane, s, 0, p);
  return p;
}

/** The player 60 m behind the lane's start, stopped: inside the despawn radius, out of the scene. */
function parkBehind(sim: SimWorld, lane: number): void {
  const p = pose(sim, lane, 0);
  const x = p.x - Math.sin(p.yaw) * 60, z = p.z - Math.cos(p.yaw) * 60;
  sim.city?.sync(x, z, true);
  sim.vehicle.teleport({ x, y: 0.8, z }, p.yaw);
  sim.vehicle.setVelocity(0, 0, 0);
}

describe('the police as a different animal', () => {
  it('4.1 a unit on a chase goes round a slower van on the oncoming side; a patrol on the beat stays behind it', async () => {
    for (const chasing of [true, false]) {
      const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
      try {
        const traffic = sim.traffic as Traffic;
        const lane = streetLane(sim);
        const at = pose(sim, lane, 90);
        parkBehind(sim, lane);
        // a van only slows for a unit (it does not pull to the kerb): the unit has to go round it
        const van = traffic.spawnAt(lane, 90, 'heavy');
        traffic.pace[van] = 0.85;
        traffic.bad[van] = 0;
        const unit = traffic.spawnAt(lane, 60, 'police');
        traffic.police[unit] = 1;
        const plan = (): void => { if (chasing) traffic.setPolicePlan(unit, -1, 17); };
        plan();
        const fx = Math.sin(at.yaw), fz = Math.cos(at.yaw);
        const along = (i: number): number => ((traffic.x[i] as number) - at.x) * fx + ((traffic.z[i] as number) - at.z) * fz;
        run(sim, 8, plan);
        if (chasing) expect(along(unit), 'the chasing unit is still behind the van').toBeGreaterThan(along(van) + 3);
        else expect(along(unit), 'the patrol passed the van').toBeLessThan(along(van));
      } finally { sim.dispose(); }
    }
  }, 60_000);

  it('4.2 pressure: within ram reach the class; close, the player\'s speed and four more (at least 12, at most the class); far and unseen, the catch-up; far in view, the class', () => {
    expect(pressureSpeed(P, 40, true, 10, P.chaseSpeed)).toBeCloseTo(14, 6);
    // close enough to ram: the class's speed
    expect(pressureSpeed(P, P.pressure.attack - 1, true, 10, P.chaseSpeed)).toBeCloseTo(P.chaseSpeed, 6);
    expect(pressureSpeed(P, 40, false, 2, P.chaseSpeed)).toBeCloseTo(P.pressure.min, 6);
    expect(pressureSpeed(P, 40, true, 40, P.chaseSpeed)).toBeCloseTo(P.chaseSpeed, 6);
    expect(pressureSpeed(P, 150, false, 10, P.chaseSpeed)).toBeCloseTo(P.catchUpSpeed, 6);
    expect(pressureSpeed(P, 150, true, 10, P.chaseSpeed)).toBeCloseTo(P.chaseSpeed, 6);
    expect(pressureSpeed(P, 150, true, 10, P.interceptorSpeed)).toBeCloseTo(P.interceptorSpeed, 6);
  });

  it('4.2b in a chase a unit 40 m behind the player asks for the player\'s speed and four more', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 40 });
    try {
      const traffic = sim.traffic as Traffic;
      const police = sim.police!;
      police.dispatching = false;
      const lane = streetLane(sim);
      const p = pose(sim, lane, 110);
      sim.city?.sync(p.x, p.z, true);
      sim.vehicle.teleport({ x: p.x, y: 0.8, z: p.z }, p.yaw);
      const v = 10;
      const push = (_t: number, _c: unknown, s: SimWorld): void => s.vehicle.setVelocity(Math.sin(p.yaw) * v, s.vehicle.telemetry.vy, Math.cos(p.yaw) * v);
      run(sim, 0.3, push);
      const unit = traffic.spawnAt(lane, 70, 'police');
      traffic.police[unit] = 1;
      police.enlist(unit);
      sim.pursuit.force(5);
      run(sim, 0.2, push);
      const gap = Math.hypot((traffic.x[unit] as number) - sim.probe.x, (traffic.z[unit] as number) - sim.probe.z);
      expect(gap).toBeLessThan(P.pressure.within);
      expect(traffic.planSpeed(unit)).toBeCloseTo(sim.probe.speed + P.pressure.over, 0);
    } finally { sim.dispose(); }
  }, 60_000);

  it('4.3 a unit written off is replaced on the level\'s cadence, and the radio says so', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 40 });
    try {
      const traffic = sim.traffic as Traffic;
      const police = sim.police!;
      sim.spawnAt('highway');
      expect(runUntil(sim, 30, () => police.count === (P.budget[2] as number))).toBeGreaterThan(0);
      const victim = police.units.find((u) => u >= 0) as number;
      const seq = sim.events.sequence;
      traffic.wreck(victim);
      run(sim, 0.1);
      let down = 0;
      sim.events.readFrom(seq, (e) => { if (e.kind === 'dispatch' && e.value === DISPATCH.unitDown) down++; });
      expect(down).toBe(1);
      expect(police.count).toBe((P.budget[2] as number) - 1);
      const refill = P.refillSeconds[2] as number;
      run(sim, refill - 1);
      expect(police.count).toBe((P.budget[2] as number) - 1);
      expect(runUntil(sim, 3, () => police.count === (P.budget[2] as number))).toBeGreaterThan(0);
    } finally { sim.dispose(); }
  }, 60_000);

  it('4.4 the roadside ambush: a unit pulls out of a side street 60-100 m ahead of the player, in view, toward the player\'s road', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 40 });
    try {
      const traffic = sim.traffic as Traffic;
      const police = sim.police!;
      police.dispatching = false;
      const lane = streetLane(sim);
      const len = traffic.lanes.length[lane] as number;
      const p = pose(sim, lane, len - 60);
      sim.city?.sync(p.x, p.z, true);
      sim.vehicle.teleport({ x: p.x, y: 0.8, z: p.z }, p.yaw);
      run(sim, 0.2);
      const cosHalf = Math.cos(P.viewHalfAngleDeg * Math.PI / 180);
      const unit = police.spawnAhead(sim.probe, cosHalf, 'police');
      expect(unit).toBeGreaterThanOrEqual(0);
      const fx = Math.sin(sim.probe.yaw), fz = Math.cos(sim.probe.yaw);
      const dx = (traffic.x[unit] as number) - sim.probe.x, dz = (traffic.z[unit] as number) - sim.probe.z;
      const ahead = dx * fx + dz * fz;
      expect(ahead).toBeGreaterThanOrEqual(P.arriveInView.ahead[0]);
      expect(ahead).toBeLessThanOrEqual(P.arriveInView.ahead[1]);
      expect(traffic.outOfView(traffic.x[unit] as number, traffic.z[unit] as number, 2.5, sim.probe, P.viewNear, cosHalf)).toBe(false);
      expect(Math.abs(Math.sin(traffic.yaw[unit] as number) * fx + Math.cos(traffic.yaw[unit] as number) * fz)).toBeLessThan(0.5);
      expect(traffic.police[unit]).toBe(1);
      expect(traffic.state[unit]).toBe(AgentState.Kinematic);
    } finally { sim.dispose(); }
  }, 60_000);

  it('4.5 the search: the escape runs 0 to 1 over the cooldown and the disc grows from 60 to 150 m', () => {
    const events = new EventLog();
    const pursuit = new Pursuit(events);
    pursuit.step(1 / 60, 2, true, 0, 0);
    pursuit.step(1 / 60, 2, true, 0, 0);
    expect(pursuit.state).toBe('active');
    expect(pursuit.escapeProgress).toBe(0);
    pursuit.step(1 / 60, 2, false, 0, 0);
    expect(pursuit.state).toBe('lost');
    const total = P.escapeSeconds[2] as number;
    for (let i = 0; i < Math.round(total * 60 / 2) - 1; i++) pursuit.step(1 / 60, 2, false, 0, 0);
    expect(pursuit.escapeProgress).toBeCloseTo(0.5, 1);
    expect(pursuit.searchRadius).toBeCloseTo((P.search.discMin + P.search.discMax) / 2, -1);
    for (let i = 0; i < total * 60; i++) pursuit.step(1 / 60, 2, false, 0, 0);
    expect(pursuit.state).toBe('idle');
    expect(pursuit.escapeProgress).toBe(0);
  });

  it('4.6 the radio: a roadblock raised, a chase started (with the car), a swap seen', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 60 });
    try {
      sim.police!.dispatching = false;
      const seq = sim.events.sequence;
      const site = sim.cover!.chokepoints[0]!;
      (sim.traffic as Traffic).clearAround(site.x, site.z, 80);
      sim.roadblocks!.raise(site);
      sim.step();
      sim.pursuit.onSwap(true, 'compact', 0xb6f542);
      sim.pursuit.force(3);
      sim.pursuit.onSwap(true, 'compact', 0xb6f542);
      sim.step();
      const lines: number[] = [];
      const targets: number[] = [];
      sim.events.readFrom(seq, (e) => { if (e.kind === 'dispatch') { lines.push(e.value); targets.push(e.target); } });
      expect(lines).toContain(DISPATCH.roadblock);
      expect(lines).toContain(DISPATCH.suspect);
      // the idle swap says nothing; the swap seen in a chase names the car
      expect(lines.filter((v) => v === DISPATCH.suspect).length).toBe(1);
      expect(targets[lines.indexOf(DISPATCH.suspect)]! & 0xffffff).toBe(0xb6f542);
    } finally { sim.dispose(); }
  }, 60_000);

  it('4.7 an active chase pays 100 × the level into the bag every 10 s', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 40 });
    try {
      sim.police!.dispatching = false;
      const bag = sim.run.bag;
      sim.pursuit.force(30);
      run(sim, 10.1, (_t, _c, s) => { if (s.pursuit.state !== 'active') s.pursuit.force(30); });
      expect(sim.run.bag - bag).toBe(BALANCE.bag.pursuitPer10s * sim.heat.level);
    } finally { sim.dispose(); }
  }, 60_000);
});
