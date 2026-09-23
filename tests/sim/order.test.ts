/**
 * Steal-to-order (docs/M5_PLAN.md slice 2): the traffic's guarantee of the
 * wanted car, a repaint before a spawn, the hunt, the swap that starts the
 * clock, the payout by damage stage, the retarget after a wreck, and the
 * car left behind. City, seed 42.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { AgentState, PLAYER_PAINT, type Traffic } from '../../src/sim/traffic/Traffic';
import { ORDER_KINDS, orderPaints, unpackDescriptor } from '../../src/sim/jobs/catalog';
import { DAMAGE } from '../../src/sim/economy';
import { POLICE } from '../../src/sim/police/tuning';
import type { JobDef, SimWorld } from '../../src/sim';
import { createWorld, run, runUntil } from './helpers';

const COS_HALF = Math.cos(POLICE.viewHalfAngleDeg * Math.PI / 180);

function drop(sim: SimWorld, x: number, z: number, yaw = 0): void {
  sim.city?.sync(x, z, true);
  sim.vehicle.teleport({ x, y: 0.8, z }, yaw);
  sim.vehicle.setVelocity(0, 0, 0);
  sim.step();
}

function firstOrder(sim: SimWorld): JobDef {
  return sim.jobs.defs.find((d) => d.kind === 'order')!;
}

/** Into the order's ring; hunting until the wanted car exists. */
function hunt(sim: SimWorld, d: JobDef): number {
  drop(sim, d.x, d.z, d.yaw);
  expect(sim.jobs.state).toBe('hunting');
  expect(runUntil(sim, 5, (s) => s.jobs.wantedAgent >= 0)).toBeGreaterThanOrEqual(0);
  return sim.jobs.wantedAgent;
}

/** The player beside a car held at a crawl, stopped, 3 m to its right: a swap candidate. */
function alongside(sim: SimWorld, agent: number): void {
  const traffic = sim.traffic as Traffic;
  // the guide holds only on the lane it was set on: renewed every step, as the cold open holds its candidate
  expect(runUntil(sim, 10, () => (traffic.speed[agent] as number) < 0.5, () => traffic.setGuidePlan(agent, 0.1))).toBeGreaterThan(0);
  const yaw = traffic.yaw[agent] as number;
  const x = (traffic.x[agent] as number) - Math.cos(yaw) * 3, z = (traffic.z[agent] as number) + Math.sin(yaw) * 3;
  sim.city?.sync(x, z, true);
  sim.vehicle.teleport({ x, y: 0.8, z }, yaw);
  sim.vehicle.setVelocity(0, 0, 0);
  // settle on the wheels so the telemetry the candidate rule reads is this pose's
  run(sim, 0.5);
  expect(sim.life.state.swapCandidate).toBe(agent);
}

describe('steal to order', () => {
  it('2.1 the guarantee: every class and paint an order can ask for turns up 300–600 m away, out of view, never the player\'s own paint', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    try {
      run(sim, 2, (_t, c) => { c.throttle = 0.5; });
      let combos = 0;
      for (const kind of ORDER_KINDS) {
        const paints = orderPaints(kind);
        expect(paints.length).toBe(6);
        expect(paints).not.toContain(PLAYER_PAINT[kind]);
        for (const paint of paints) {
          let agent = -1;
          const t = runUntil(sim, 5, (s) => {
            agent = (s.traffic as Traffic).ensure(kind, paint, s.probe, POLICE.viewNear, COS_HALF);
            return agent >= 0;
          });
          expect(t).toBeGreaterThan(0);
          const p = sim.probe;
          const d = Math.hypot((traffic.x[agent] as number) - p.x, (traffic.z[agent] as number) - p.z);
          expect(d).toBeGreaterThanOrEqual(BALANCE.jobs.order.ensureMin);
          expect(d).toBeLessThanOrEqual(BALANCE.jobs.order.ensureMax);
          expect(traffic.outOfView(traffic.x[agent] as number, traffic.z[agent] as number, 2, p, POLICE.viewNear, COS_HALF)).toBe(true);
          expect(traffic.kindOf(agent)).toBe(kind);
          expect(traffic.paintOf(agent)).toBe(paint);
          combos++;
        }
      }
      expect(combos).toBe(24);
      for (const d of sim.jobs.defs.filter((k) => k.kind === 'order')) {
        const w = unpackDescriptor(d.descriptor);
        expect(ORDER_KINDS).toContain(w.kind);
        expect(w.paint).not.toBe(PLAYER_PAINT[w.kind]);
      }
    } finally { sim.dispose(); }
  });

  it('2.2 an unseen civilian of the class is repainted rather than a car spawned', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    try {
      run(sim, 0.1);
      const p = sim.probe;
      // a heavy on a lane 400 m behind the player
      let lane = -1, s = 0;
      for (let i = 0; i < traffic.lanes.laneCount && lane < 0; i++) {
        for (let k = 0; k < 10; k++) {
          const at = (traffic.lanes.length[i] as number) * k / 10;
          const pose = { x: 0, z: 0, yaw: 0 };
          traffic.lanes.positionAt(i, at, 0, pose);
          const d = Math.hypot(pose.x - p.x, pose.z - p.z);
          const ahead = (pose.x - p.x) * Math.sin(p.yaw) + (pose.z - p.z) * Math.cos(p.yaw);
          if (d > 380 && d < 450 && ahead < 0) { lane = i; s = at; break; }
        }
      }
      expect(lane).toBeGreaterThanOrEqual(0);
      const agent = traffic.spawnAt(lane, s, 'heavy');
      traffic.paint[agent] = PLAYER_PAINT.muscle;
      const before = traffic.aliveCount;
      const paint = orderPaints('heavy')[3] as number;
      expect(traffic.ensure('heavy', paint, p, POLICE.viewNear, COS_HALF)).toBe(agent);
      expect(traffic.aliveCount).toBe(before);
      expect(traffic.paintOf(agent)).toBe(paint);
    } finally { sim.dispose(); }
  });

  it('2.3 / 2.6 the ring goes hunting; a swap into another car keeps hunting; the swap into the wanted car starts the clock and the heat once; the car left behind keeps the player\'s paint', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    try {
      const d = firstOrder(sim);
      const wanted = hunt(sim, d);
      expect(Number.isNaN(sim.jobs.remaining)).toBe(true);
      const heat = sim.heat.points;
      // another car first: a compact on the lane nearest the player (a car far out would be despawned)
      const near = sim.city!.nearestLane(sim.probe.x, sim.probe.z);
      const other = traffic.spawnAt(near, (traffic.lanes.length[near] as number) / 2, 'compact');
      alongside(sim, other);
      run(sim, 1 / 60, (_t, c) => { c.swap = true; });
      expect(sim.carId).toBe('compact');
      expect(sim.jobs.state).toBe('hunting');
      expect(sim.jobs.wantedAgent).toBe(wanted);
      // the wanted car
      const kind = unpackDescriptor(d.descriptor).kind;
      alongside(sim, wanted);
      run(sim, 1 / 60, (_t, c) => { c.swap = true; });
      expect(sim.carId).toBe(kind);
      expect(sim.jobs.state).toBe('active');
      expect(sim.jobs.remaining).toBeCloseTo(BALANCE.jobs.order.limitSeconds, 1);
      expect(sim.heat.points).toBe(heat + BALANCE.jobs.order.heat);
      run(sim, 1);
      expect(sim.heat.points).toBe(heat + BALANCE.jobs.order.heat);
      // 2.6: the record swapped into is the compact left behind, abandoned in the player's compact paint
      expect(traffic.state[wanted]).toBe(AgentState.Abandoned);
      expect(traffic.kindOf(wanted)).toBe('compact');
      expect(traffic.paintOf(wanted)).toBe(sim.garage.paintOf('compact'));
    } finally { sim.dispose(); }
  });

  it('2.4 the fence pays the class payout at stage 0, 80 % at stage 2, and a wreck does not arrive', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const d = firstOrder(sim);
      const kind = unpackDescriptor(d.descriptor).kind;
      const full = BALANCE.jobs.order.payout[kind as keyof typeof BALANCE.jobs.order.payout];
      expect(d.payout).toBe(full);
      for (const [stage, damage, paid] of [[0, 0, full], [2, DAMAGE.stages[1] + 0.01, Math.round(full * 0.8)], [4, 1, -1]] as const) {
        sim.jobs.abandon();
        drop(sim, 0, 0);
        const wanted = hunt(sim, d);
        sim.jobs.onSwap(wanted);
        sim.setCar(kind);
        expect(sim.jobs.state).toBe('active');
        sim.life.setDamage(damage);
        if (stage === 4) sim.life.state.stage = 4;
        expect(sim.life.state.stage).toBe(stage);
        const bag = sim.run.bag;
        drop(sim, d.targetX, d.targetZ);
        if (paid < 0) {
          expect(sim.jobs.state).toBe('active');
          expect(sim.run.bag).toBe(bag);
        } else {
          expect(sim.jobs.state).toBe('done');
          expect(sim.run.bag - bag).toBe(paid);
        }
        sim.life.setDamage(0);
        run(sim, BALANCE.jobs.holdSeconds + 0.1);
      }
    } finally { sim.dispose(); }
  });

  it('2.5 wrecking the wanted car before the swap finds another of the same class and paint within 5 s', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    try {
      const d = firstOrder(sim);
      const w = unpackDescriptor(d.descriptor);
      const first = hunt(sim, d);
      traffic.wreck(first);
      const t = runUntil(sim, 5, (s) => s.jobs.wantedAgent >= 0 && s.jobs.wantedAgent !== first);
      expect(t).toBeGreaterThan(0);
      const next = sim.jobs.wantedAgent;
      expect(traffic.kindOf(next)).toBe(w.kind);
      expect(traffic.paintOf(next)).toBe(w.paint);
      expect(sim.jobs.state).toBe('hunting');
    } finally { sim.dispose(); }
  });
});
