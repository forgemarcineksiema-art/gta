/**
 * The rivals' twists (M6 slice 3, docs/DESIGN.md §14.3): each rival turns one
 * of the game's verbs on the player. Pete drives like the bad driver; the
 * twins swap into cars ahead of the player out of sight; Fake Frank wears a
 * badge (a hit on him is a hit on a unit); the party bus overtakes; Neon Niko
 * pulls the scaffold towers down; the Nephew's escort comes at once; the
 * helicopter hangs over Pip's race from the start; the Ghost is off the maps.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { BREAKERS, BreakerState } from '../../src/sim/city/breakers';
import { CHAIN_ALL, type JobDef, type SimWorld } from '../../src/sim';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { bodySpec } from '../../src/sim/traffic/bodies';
import { createWorld, run } from './helpers';

/** A world with rival `i` next and ready, the player pulled up at their bay: the duel running. */
async function duel(i: number, traffic = 0): Promise<{ sim: SimWorld; d: JobDef }> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic, peds: 0, record: false });
  sim.police!.dispatching = false;
  sim.run.chain = CHAIN_ALL;
  sim.board.beaten = (1 << i) - 1;
  sim.board.force = true;
  const d = sim.jobs.defs.find((k) => k.kind === 'duel' && k.level === i)!;
  const lx = Math.cos(d.yaw), lz = -Math.sin(d.yaw);
  sim.city?.sync(d.x - lx * 3, d.z - lz * 3, true);
  sim.vehicle.teleport({ x: d.x - lx * 3, y: 0.8, z: d.z - lz * 3 }, d.yaw);
  sim.vehicle.setVelocity(0, 0, 0);
  run(sim, 0.3);
  expect(sim.jobs.state).toBe('active');
  expect(sim.jobs.active).toBe(d.id);
  return { sim, d };
}

describe('the rivals\' twists', () => {
  it('3.1 Pepperoni Pete drives like the bad driver; 3.5 the party bus overtakes; 3.9 the Ghost is off the maps', async () => {
    const pete = await duel(1);
    try {
      const a = pete.sim.jobs.race.rivals[0] as number;
      expect((pete.sim.traffic as Traffic).bad[a]).toBe(1);
      expect(pete.sim.jobs.race.hidden).toBe(false);
    } finally { pete.sim.dispose(); }
    expect(bodySpec('partybus').keepsLane).toBe(false);
    expect(bodySpec('bus').keepsLane).toBe(true);
    const ghost = await duel(9);
    try {
      expect(ghost.sim.jobs.race.hidden).toBe(true);
    } finally { ghost.sim.dispose(); }
  }, 90_000);

  it('3.3 a twin far behind swaps, out of the player\'s sight, into a car ahead of them: the car races on as the twin, its driver on the pavement, the radio names it', async () => {
    const { sim, d } = await duel(3, 1);
    try {
      const traffic = sim.traffic as Traffic;
      const race = sim.jobs.race;
      expect(race.count).toBe(2);
      const before = [race.rivals[0] as number, race.rivals[1] as number];
      // the player well on toward the finish: the twins fall behind
      const mx = d.x + (d.targetX - d.x) * 0.55, mz = d.z + (d.targetZ - d.z) * 0.55;
      const lane = sim.city!.nearestLane(mx, mz);
      const pose = { x: 0, z: 0, yaw: 0 };
      traffic.lanes.positionAt(lane, 5, 0, pose);
      sim.city?.sync(pose.x, pose.z, true);
      sim.vehicle.teleport({ x: pose.x, y: 0.8, z: pose.z }, pose.yaw);
      let seq = sim.events.sequence, swapped = -1, radio = 0;
      for (let t = 0; t < 8 * 60 && swapped < 0; t++) {
        sim.step();
        sim.events.readFrom(seq, (e) => { if (e.kind === 'twinSwap') radio++; });
        seq = sim.events.sequence;
        for (let k = 0; k < 2; k++) {
          const a = race.rivals[k] as number;
          if (a >= 0 && a !== before[k]) swapped = a;
        }
      }
      expect(swapped).toBeGreaterThanOrEqual(0);
      expect(race.swaps).toBeGreaterThanOrEqual(1);
      expect(radio).toBe(race.swaps);
      expect(traffic.isRacer(swapped)).toBe(true);
      expect(traffic.rival[swapped]).toBe(1);
      // a car ahead of the player, out of their sight when it happened
      const cosHalf = Math.cos(sim.police!.tuning.viewHalfAngleDeg * Math.PI / 180);
      expect(traffic.outOfView(traffic.x[swapped] as number, traffic.z[swapped] as number, 3, sim.probe, sim.police!.tuning.viewNear, cosHalf)).toBe(true);
      // the car they left is never taken
      const left = before.find((a) => a !== undefined && !race.rivals.includes(a));
      if (left !== undefined && traffic.state[left] !== AgentState.Free) expect(traffic.rival[left]).toBe(1);
      // one swap a twin at most every `twins.every` seconds
      const swaps = race.swaps;
      run(sim, 1);
      expect(race.swaps - swaps).toBeLessThanOrEqual(1);
    } finally { sim.dispose(); }
  }, 90_000);

  it('3.4 Fake Frank wears a badge: never a unit, and a hit on a car with one is a hit on a police car (seen, wanted)', async () => {
    const frank = await duel(4);
    try {
      const traffic = frank.sim.traffic as Traffic;
      const a = frank.sim.jobs.race.rivals[0] as number;
      expect(traffic.badge[a]).toBe(1);
      expect(traffic.police[a]).toBe(0);
      expect(frank.sim.police!.units.includes(a)).toBe(false);
    } finally { frank.sim.dispose(); }
    // the rule itself on a standing car in a badge, rammed at 30 km/h in open road, against the same car without one
    const gains: number[] = [];
    for (const badge of [1, 0]) {
      const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
      try {
        sim.police!.dispatching = false;
        const traffic = sim.traffic as Traffic;
        const yaw = Math.PI / 2, x0 = 200, z = 0;
        sim.city?.sync(x0, z, true);
        const car = traffic.spawnAtPoint(x0 + 14, z, yaw, 'police', AgentState.Abandoned);
        traffic.badge[car] = badge;
        sim.vehicle.teleport({ x: x0, y: 0.8, z }, yaw);
        run(sim, 0.3);
        const before = sim.heat.points;
        for (let i = 0; i < 90; i++) {
          if (i < 40) sim.vehicle.setVelocity(Math.sin(yaw) * (30 / 3.6), sim.vehicle.telemetry.vy, Math.cos(yaw) * (30 / 3.6));
          sim.step();
        }
        gains.push(sim.heat.points - before);
        if (badge === 1) expect(sim.heat.level).toBeGreaterThanOrEqual(1);
      } finally { sim.dispose(); }
    }
    expect(gains[0]).toBeGreaterThanOrEqual(BALANCE.heat.policeHit);
    expect(gains[1]).toBeLessThan(BALANCE.heat.policeHit);
  }, 90_000);

  it('3.6 Neon Niko pulls a standing tower down near him, once; nothing falls far from one', async () => {
    const { sim } = await duel(6);
    try {
      const breakers = sim.breakers!;
      const d = BREAKERS[0]!;
      expect(breakers.pullAt(d.x + 400, d.z + 400, BALANCE.board.breakers.reach)).toBe(false);
      expect(breakers.state[0]).toBe(BreakerState.Standing);
      expect(breakers.pullAt(d.x + 3, d.z, BALANCE.board.breakers.reach)).toBe(true);
      expect(breakers.state[0]).toBe(BreakerState.Falling);
      expect(breakers.pullAt(d.x + 3, d.z, BALANCE.board.breakers.reach)).toBe(false);
    } finally { sim.dispose(); }
  }, 90_000);

  it('3.7 the Mayor\'s Nephew\'s escort: two units on the roster in the first second, the chase on; 3.8 the helicopter over Pip\'s race at once', async () => {
    const nephew = await duel(7);
    try {
      const sim = nephew.sim;
      const traffic = sim.traffic as Traffic;
      const near = sim.police!.units.filter((a) => a >= 0 && traffic.police[a] === 1
        && Math.hypot((traffic.x[a] as number) - sim.probe.x, (traffic.z[a] as number) - sim.probe.z) < 80);
      expect(near.length).toBeGreaterThanOrEqual(BALANCE.board.escort);
      expect(sim.pursuit.state).not.toBe('idle');
      expect(sim.heat.level).toBeGreaterThanOrEqual(2);
    } finally { nephew.sim.dispose(); }
    const pip = await duel(8);
    try {
      const sim = pip.sim;
      expect(sim.heat.level).toBeGreaterThanOrEqual(4);
      expect(sim.police!.heli.active).toBe(true);
      expect(Math.hypot(sim.police!.heli.x - sim.probe.x, sim.police!.heli.z - sim.probe.z)).toBeLessThan(40);
    } finally { pip.sim.dispose(); }
  }, 90_000);
});
