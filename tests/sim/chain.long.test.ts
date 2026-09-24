/**
 * The goal line and the first quarter hour's chain (M5.5 slice 2, docs/DESIGN.md
 * §13.4): the chain ticks from the ring in any order and never inside the
 * intro; the goal's precedence; the BORROW hint counted once per appearance;
 * a ring near every door.
 * Long (M7 slice 0): moved out of the quick verify's minute; `npm run verify:gate` runs it.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { CHAIN_ALL, STEP, chainStep, goalFor, newGoal } from '../../src/sim/run/goal';
import type { SimWorld } from '../../src/sim';
import type { Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

const bit = (s: number): number => 1 << s;

function nearestDoor(sim: SimWorld): { x: number; z: number } {
  const p = sim.probe;
  return [...sim.run.dropOffs].sort((u, v) => Math.hypot(u.door.x - p.x, u.door.z - p.z) - Math.hypot(v.door.x - p.x, v.door.z - p.z))[0]!.door;
}

function nearestRing(sim: SimWorld, kind = ''): { x: number; z: number } {
  const p = sim.probe;
  return [...sim.jobs.defs].filter((d) => sim.jobs.live(d) && (kind === '' || d.kind === kind))
    .sort((u, v) => Math.hypot(u.x - p.x, u.z - p.z) - Math.hypot(v.x - p.x, v.z - p.z))[0]!;
}

describe('the chain and the goal line', () => {
  it('2.1 the chain ticks from the ring in any order, one card per step, never twice and never from the intro', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const r = sim.run;
      run(sim, 0.1);
      expect(r.chain).toBe(0);
      const push = (kind: Parameters<SimWorld['events']['push']>[0], value: number, target = -1): void => {
        sim.events.push(kind, value, 0, 0, 0, target);
        sim.step();
      };
      push('jobStart', 5000, 3);
      expect(r.chain).toBe(bit(STEP.take));
      expect(r.chainLast).toBe(STEP.take);
      const serial = r.chainSerial;
      push('jobStart', 5000, 4);
      expect(r.chainSerial).toBe(serial);
      // out of order: an escape from level 2 before the first car
      push('escape', 1);
      expect(r.chain & bit(STEP.escape)).toBe(0);
      push('escape', 2);
      expect(r.chain & bit(STEP.escape)).not.toBe(0);
      expect(chainStep(r.chain)).toBe(STEP.bank);
      push('banked', 3000);
      expect(r.chain & bit(STEP.bank)).not.toBe(0);
      expect(r.chain & bit(STEP.big)).toBe(0);
      // a tier bought is not a car: the step waits for a second car in the garage
      push('purchase', 12000, 0);
      expect(r.chain & bit(STEP.car)).toBe(0);
      sim.garage.owned.add('compact');
      push('purchase', 10000, 1);
      expect(r.chain & bit(STEP.car)).not.toBe(0);
      const delivery = sim.jobs.defs.find((d) => d.kind === 'delivery')!;
      const order = sim.jobs.defs.find((d) => d.kind === 'order')!;
      push('jobDone', 5000, delivery.id);
      expect(r.chain & bit(STEP.order)).toBe(0);
      push('jobDone', 5000, order.id);
      expect(r.chain & bit(STEP.order)).not.toBe(0);
      push('banked', BALANCE.chain.bankGoal);
      expect(r.chain).toBe(CHAIN_ALL);
      expect(chainStep(r.chain)).toBe(-1);
      expect(r.chainSerial).toBe(serial + 5);
    } finally { sim.dispose(); }

    // the intro's own events are not the chain's: its job, its door; after a skip the chain starts
    const co = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    try {
      co.coldOpen.start();
      run(co, 0.1);
      co.events.push('jobStart', 5000, 0, 0, 0, 0);
      co.step();
      expect(co.run.chain).toBe(0);
      co.coldOpen.skip();
      co.events.push('banked', 7800, 0, 0, 0, 0);
      co.step();
      expect(co.run.chain).toBe(0);
      co.events.push('jobStart', 5000, 0, 0, 0, 3);
      co.step();
      expect(co.run.chain).toBe(bit(STEP.take));
    } finally { co.dispose(); }
  }, 60_000);

  it('2.3 the goal: the running job, the police on you, the chain\'s step when it says more, the door with a bag, the nearest ring', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      run(sim, 0.1);
      const r = sim.run;
      const g = newGoal();
      const at = (p: { x: number; z: number }): void => { expect([g.x, g.z]).toEqual([p.x, p.z]); };
      goalFor(sim, g);
      expect(g.kind).toBe('take');
      at(nearestRing(sim));
      r.bag = BALANCE.offer.doorThreshold + 1;
      goalFor(sim, g);
      expect(g.kind).toBe('bank');
      at(nearestDoor(sim));
      // step 2 (bank the bag): any bag
      r.chain = bit(STEP.take);
      r.bag = 100;
      goalFor(sim, g);
      expect(g.kind).toBe('bank');
      r.bag = 0;
      goalFor(sim, g);
      expect(g.kind).toBe('take');
      // step 3 (the first car): a door when it is affordable, the cash to go from 60 %
      r.chain = bit(STEP.take) | bit(STEP.bank);
      r.bank = BALANCE.prices.compact * 0.7;
      goalFor(sim, g);
      expect(g.kind).toBe('buy');
      expect(g.amount).toBeCloseTo(BALANCE.prices.compact * 0.3, 6);
      at(nearestRing(sim));
      r.bank = BALANCE.prices.compact;
      goalFor(sim, g);
      expect(g.kind).toBe('buy');
      expect(g.amount).toBe(0);
      at(nearestDoor(sim));
      r.bank = 1000;
      goalFor(sim, g);
      expect(g.kind).toBe('take');
      // step 4 and 5: the blue ring, the magenta ring
      r.chain = bit(STEP.take) | bit(STEP.bank) | bit(STEP.car);
      goalFor(sim, g);
      expect(g.kind).toBe('escape');
      expect(g.ring).toBe('escape');
      at(nearestRing(sim, 'escape'));
      r.chain |= bit(STEP.escape);
      goalFor(sim, g);
      expect(g.kind).toBe('order');
      at(nearestRing(sim, 'order'));
      // step 6: fill the bag to 20,000, then bank it
      r.chain |= bit(STEP.order);
      r.bag = 9000;
      goalFor(sim, g);
      expect(g.kind).toBe('fill');
      expect(g.amount).toBe(9000);
      r.bag = BALANCE.chain.bankGoal;
      goalFor(sim, g);
      expect(g.kind).toBe('bank');
      // the chain done: the wanted board's first rival (M6, DESIGN.md §14.2), and with the board done the defaults again
      r.chain = CHAIN_ALL;
      r.bag = 0;
      goalFor(sim, g);
      expect(g.kind).toBe('rival');
      sim.board.beaten = (1 << 11) - 1;
      goalFor(sim, g);
      expect(g.kind).toBe('take');
      sim.board.beaten = 0;
      // the police on you: LOSE THEM, the door only with something in the bag
      sim.pursuit.force();
      goalFor(sim, g);
      expect(g.kind).toBe('lose');
      expect(g.hasTarget).toBe(false);
      r.bag = 500;
      goalFor(sim, g);
      expect(g.hasTarget).toBe(true);
      at(nearestDoor(sim));
      sim.pursuit.reset();
      // a running job has the line and its own target
      const d = sim.jobs.defs.find((j) => j.kind === 'delivery')!;
      sim.city?.sync(d.x, d.z, true);
      sim.vehicle.teleport({ x: d.x, y: 0.8, z: d.z }, d.yaw);
      sim.step();
      goalFor(sim, g);
      expect(g.kind).toBe('job');
      expect([g.x, g.z]).toEqual([d.targetX, d.targetZ]);
      // and the arrow follows the way's goal between jobs (M8.7 D1: an escape ring, held, nearest by road)
      sim.jobs.abandon();
      r.chain = bit(STEP.take) | bit(STEP.bank) | bit(STEP.car);
      // out of the delivery's ring first, or the step starts it again
      const spawn = sim.spawns[0]!;
      sim.city?.sync(spawn.position.x, spawn.position.z, true);
      sim.vehicle.teleport(spawn.position, spawn.yaw);
      sim.step();
      const t = { x: 0, z: 0, idle: false };
      expect(sim.jobs.arrowTarget(t)).toBe(true);
      expect(t.idle).toBe(true);
      expect(sim.way!.goal.kind).toBe('escape');
      expect(sim.way!.goal.ring).toBe('escape');
      expect([t.x, t.z]).toEqual([sim.way!.goal.x, sim.way!.goal.z]);
    } finally { sim.dispose(); }
  }, 60_000);

  it('2.5 the BORROW prompt is counted once per appearance', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      run(sim, 0.2);
      const p = sim.vehicle.body.translation();
      const yaw = sim.probe.yaw;
      const cop = traffic.spawnParkedPolice(p.x - Math.cos(yaw) * 3.5, p.z + Math.sin(yaw) * 3.5, yaw, 'police');
      expect(cop).toBeGreaterThanOrEqual(0);
      run(sim, 0.3);
      expect(sim.life.state.swapCandidate).toBe(cop);
      expect(sim.run.borrowHints).toBe(1);
      run(sim, 0.5);
      expect(sim.run.borrowHints).toBe(1);
      // away and back: a second appearance
      sim.vehicle.teleport({ x: p.x + Math.sin(yaw) * 60, y: p.y, z: p.z + Math.cos(yaw) * 60 }, yaw);
      // gone for over a second: the next one is a new appearance (a flicker for a step is not)
      run(sim, 1.2);
      expect(sim.life.state.swapCandidate).toBe(-1);
      sim.vehicle.teleport({ x: p.x, y: p.y, z: p.z }, yaw);
      run(sim, 0.3);
      expect(sim.run.borrowHints).toBe(2);
    } finally { sim.dispose(); }
  }, 60_000);

  it('2.4 a delivery ring within nearDoor of every door at seeds 42, 7 and 123', async () => {
    for (const seed of [42, 7, 123]) {
      const sim = await createWorld({ map: 'city', seed, traffic: 0, peds: 0, record: false });
      try {
        for (const site of sim.run.dropOffs) {
          const near = sim.jobs.defs.filter((d) => d.kind === 'delivery' && Math.hypot(d.x - site.door.x, d.z - site.door.z) < BALANCE.jobs.nearDoor);
          expect(near.length, `seed ${seed}: no delivery ring within ${BALANCE.jobs.nearDoor} m of ${site.name}`).toBeGreaterThan(0);
        }
      } finally { sim.dispose(); }
    }
  }, 60_000);
});
