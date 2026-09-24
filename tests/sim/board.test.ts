/**
 * The wanted board (M6 slice 1, docs/DESIGN.md §14.2–14.3): the requirements
 * read the career and the world, one rival's ring is live at a time (and the
 * beaten ones for a rematch), a rival waits parked at a kerbside bay and a
 * slow pull-up starts the race, the player first wins the place, the purse and
 * the car, the rival first or the clock loses it, and the goal line follows
 * the board once the chain is done.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { CHAIN_ALL, CHIEF, RIVALS, goalFor, newGoal, type JobDef, type SimWorld } from '../../src/sim';
import { apply, collect, defaultSave } from '../../src/sim/save/format';
import { AgentState, impactDamage, type Traffic } from '../../src/sim/traffic/Traffic';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { BODY_INDEX } from '../../src/sim/traffic/bodies';
import { createWorld, run } from './helpers';

function world(): Promise<SimWorld> {
  return createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
}

function ring(sim: SimWorld, i: number): JobDef {
  return sim.jobs.defs.find((d) => d.kind === 'duel' && d.level === i)!;
}

/** Stopped beside the rival's bay, 3 m off its kerb side, facing its way. */
function pullUp(sim: SimWorld, d: JobDef): void {
  const lx = Math.cos(d.yaw), lz = -Math.sin(d.yaw);
  const x = d.x - lx * 3, z = d.z - lz * 3;
  sim.city?.sync(x, z, true);
  sim.vehicle.teleport({ x, y: 0.8, z }, d.yaw);
  sim.vehicle.setVelocity(0, 0, 0);
}

function trialIds(sim: SimWorld): number[] {
  return sim.jobs.defs.filter((d) => d.kind === 'trial').map((d) => d.id);
}

describe('the wanted board', () => {
  it('M6 1.1 each requirement reads its counter, and a rival is ready when both are met', async () => {
    const sim = await world();
    try {
      const b = sim.board, c = sim.career;
      // #9 Pepperoni Pete: a street race won and bronze on a trial
      expect(b.ready(1)).toBe(false);
      c.races = 1;
      expect(b.firstOpen(1)).toBe(1);
      sim.jobs.medals.set(trialIds(sim)[0] as number, 1);
      expect(b.ready(1)).toBe(true);
      // #8 Tow Truck Tina: an escape from three stars or more, ten takedowns
      c.escapes[1] = 4;
      expect(b.have({ kind: 'escape', count: 1, level: 3 })).toBe(0);
      c.escapes[3] = 1;
      expect(b.have({ kind: 'escape', count: 1, level: 3 })).toBe(1);
      c.takedowns = 10;
      expect(b.ready(2)).toBe(true);
      // the world's own counters: the chain, the cars, the best run, a silver counts for bronze
      sim.run.chain = 0b101;
      expect(b.have({ kind: 'chain', count: 6, level: 0 })).toBe(2);
      sim.garage.own('taxi');
      expect(b.have({ kind: 'carsOwned', count: 3, level: 0 })).toBe(2);
      sim.run.bestRun = 41000;
      expect(b.have({ kind: 'bestRun', count: 40000, level: 0 })).toBe(41000);
      sim.jobs.medals.set(trialIds(sim)[1] as number, 2);
      expect(b.have({ kind: 'medal', count: 2, level: 1 })).toBe(2);
      expect(b.have({ kind: 'medal', count: 1, level: 2 })).toBe(1);
      // the Chief wants the ten
      expect(b.ready(CHIEF)).toBe(false);
      b.beaten = (1 << CHIEF) - 1;
      expect(b.ready(CHIEF)).toBe(true);
      expect(b.rank).toBe(1);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M6 1.2 only the next ready rival\'s ring is live and the beaten stay for a rematch; the rival\'s car waits at the bay, never a swap', async () => {
    const sim = await world();
    try {
      const b = sim.board, jobs = sim.jobs;
      sim.police!.dispatching = false;
      expect(b.next()).toBe(0);
      expect(jobs.shown(ring(sim, 0))).toBe(false);
      // the board follows the chain: its six steps open Granny Gears
      sim.run.chain = CHAIN_ALL;
      expect(jobs.shown(ring(sim, 0))).toBe(true);
      expect(jobs.shown(ring(sim, 1))).toBe(false);
      // near her bay, her car stands parked in it
      const d = ring(sim, 0);
      pullUp(sim, d);
      sim.vehicle.setVelocity(Math.sin(d.yaw) * 30, 0, Math.cos(d.yaw) * 30);
      run(sim, 2 / 60);
      const traffic = sim.traffic as Traffic;
      const car = b.car[0] as number;
      expect(car).toBeGreaterThanOrEqual(0);
      expect(traffic.state[car]).toBe(AgentState.Parked);
      expect(traffic.body[car]).toBe(BODY_INDEX[RIVALS[0]!.body]);
      expect(Math.hypot((traffic.x[car] as number) - d.x, (traffic.z[car] as number) - d.z)).toBeLessThan(0.5);
      expect(sim.life.state.swapCandidate).not.toBe(car);
      // driving past at speed starts nothing
      expect(jobs.state).toBe('idle');
      b.win(0);
      expect(b.next()).toBe(1);
      expect(jobs.shown(ring(sim, 0))).toBe(true);
      expect(jobs.shown(ring(sim, 1))).toBe(false);
      sim.career.races = 1;
      sim.jobs.medals.set(trialIds(sim)[0] as number, 3);
      expect(jobs.shown(ring(sim, 1))).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M6 1.3 a race: a slow pull-up starts it, the rival pulls out in their car and paint; the player first wins the place, the purse and the car; the save keeps them', async () => {
    const sim = await world();
    try {
      sim.police!.dispatching = false;
      sim.run.chain = CHAIN_ALL;
      const d = ring(sim, 0);
      pullUp(sim, d);
      run(sim, 0.3);
      expect(sim.jobs.state).toBe('active');
      expect(sim.jobs.active).toBe(d.id);
      expect(sim.board.car[0]).toBe(-1);
      const traffic = sim.traffic as Traffic;
      expect(sim.jobs.race.count).toBe(1);
      const rival = sim.jobs.race.rivals[0] as number;
      expect(traffic.isRacer(rival)).toBe(true);
      expect(traffic.rival[rival]).toBe(1);
      expect(traffic.bodyOf(rival)).toBe('wagon');
      expect(traffic.paintOf(rival)).toBe(RIVALS[0]!.paints[0]);
      // over the line first
      const bag = sim.run.bag;
      sim.city?.sync(d.targetX, d.targetZ, true);
      sim.vehicle.teleport({ x: d.targetX, y: 0.8, z: d.targetZ }, 0);
      sim.vehicle.setVelocity(0, 0, 0);
      run(sim, 2 / 60);
      expect(sim.jobs.state).toBe('done');
      expect(sim.run.bag - bag).toBe(RIVALS[0]!.purse);
      expect(sim.board.isBeaten(0)).toBe(true);
      expect(sim.board.rank).toBe(10);
      expect(sim.garage.owned.has('wagon')).toBe(true);
      expect(sim.garage.paintOf('wagon')).toBe(RIVALS[0]!.paints[0]);
      const doc = defaultSave();
      collect(sim, doc);
      expect(doc.board.beaten).toBe(1);
      expect(doc.owned).toContain('wagon');
      // a rematch pays a quarter and changes nothing else
      expect(sim.board.purse(0)).toBe(Math.round(RIVALS[0]!.purse * BALANCE.board.rematchShare));
      // a save without the car (an older build's) owns it again from the board
      sim.garage.owned.delete('wagon');
      doc.owned = doc.owned.filter((id) => id !== 'wagon');
      apply(sim, doc);
      expect(sim.garage.owned.has('wagon')).toBe(true);
      expect(sim.board.beaten).toBe(1);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M6 1.4 a rival over the line first, or the clock, loses the race: no purse, the board unchanged, the ring still there', async () => {
    const sim = await world();
    try {
      sim.police!.dispatching = false;
      sim.run.chain = CHAIN_ALL;
      const d = ring(sim, 0);
      for (const lose of ['rival', 'clock'] as const) {
        pullUp(sim, d);
        run(sim, 0.3);
        expect(sim.jobs.state).toBe('active');
        const bag = sim.run.bag;
        if (lose === 'rival') sim.jobs.race.finished = 1;
        else sim.jobs.remaining = 0.01;
        run(sim, 2 / 60);
        expect(sim.jobs.state).toBe('failed');
        expect(sim.jobs.lastPlace).toBe(lose === 'rival' ? 2 : 0);
        expect(sim.run.bag).toBe(bag);
        expect(sim.board.beaten).toBe(0);
        run(sim, BALANCE.jobs.holdSeconds + 0.1);
        expect(sim.jobs.state).toBe('idle');
        expect(sim.jobs.shown(d)).toBe(true);
        // away and back: the ring re-arms once the car has left it
        const x = d.x + 40 * Math.sin(d.yaw), z = d.z + 40 * Math.cos(d.yaw);
        sim.vehicle.teleport({ x, y: 0.8, z }, d.yaw);
        run(sim, 0.1);
      }
    } finally { sim.dispose(); }
  }, 60_000);

  it('M6 1.5 the goal line follows the board after the chain: the ready rival\'s bay, else the first open requirement and the nearest ring where it is met', async () => {
    const sim = await world();
    try {
      sim.police!.dispatching = false;
      const g = newGoal();
      sim.run.chain = CHAIN_ALL & ~1;
      goalFor(sim, g);
      expect(g.kind === 'rival' || g.kind === 'needs').toBe(false);
      sim.run.chain = CHAIN_ALL;
      goalFor(sim, g);
      expect(g.kind).toBe('rival');
      expect(g.rival).toBe(0);
      expect(g.hasTarget).toBe(true);
      expect(g.x).toBe(ring(sim, 0).x);
      sim.board.win(0);
      goalFor(sim, g);
      expect(g.kind).toBe('needs');
      expect(g.rival).toBe(1);
      expect(g.req).toBe(0);
      expect(g.ring).toBe('race');
      expect(g.hasTarget).toBe(true);
      // a bag worth banking still comes first
      sim.run.bag = BALANCE.offer.doorThreshold + 1;
      goalFor(sim, g);
      expect(g.kind).toBe('bank');
    } finally { sim.dispose(); }
  }, 60_000);

  it('M6 1.6 the career counts from the events: a race won, a zone, an order, a fare and a hot one, takedowns, escapes by level, caches', async () => {
    const sim = await world();
    try {
      const c = sim.career, ev = sim.events, jobs = sim.jobs;
      const race = jobs.defs.find((d) => d.kind === 'race')!;
      const zone = jobs.defs.find((d) => d.kind === 'rage')!;
      const order = jobs.defs.find((d) => d.kind === 'order')!;
      jobs.lastPlace = 1;
      ev.push('jobDone', 6000, 0, 0, 0, race.id);
      c.step();
      jobs.lastPlace = 2;
      ev.push('jobDone', 2500, 0, 0, 0, race.id);
      ev.push('jobDone', 10000, 0, 0, 0, zone.id);
      ev.push('jobDone', 5000, 0, 0, 0, order.id);
      const fare = jobs.add({ kind: 'fare', x: 0, z: 0, yaw: 0, targetX: 0, targetZ: 0, payout: 900, limitSeconds: 60, heat: 0 });
      sim.fares.lastHot = true;
      ev.push('jobDone', 900, 0, 0, 0, fare);
      ev.push('takedown', 0, 0, 0, 0, -1);
      ev.push('takedownTraffic', 0, 0, 0, 0, -1);
      ev.push('escape', 3, 0, 0, 0);
      ev.push('escape', 5, 0, 0, 0, 1);
      ev.push('cache', 0, 0, 0, 0, 1);
      c.step();
      expect(c.races).toBe(1);
      expect(c.zones).toBe(1);
      expect(c.orders).toBe(1);
      expect(c.fares).toBe(1);
      expect(c.hotFares).toBe(1);
      expect(c.takedowns).toBe(2);
      expect(c.escapes).toEqual([0, 0, 1, 0, 1]);
      expect(c.escapesFrom(3)).toBe(2);
      expect(c.escapesFrom(4)).toBe(1);
      expect(c.caches).toBe(1);
    } finally { sim.dispose(); }
  }, 60_000);

  it("M6 2.1 a hunted rival's armour: a hit that wrecks a civilian dents Tow Truck Tina's wrecker, and its damage grows by a share", () => {
    const t = TRAFFIC;
    const armour = (BALANCE.board.hunt.armour[2] as number) * BALANCE.board.hunt.heavy;
    expect(armour).toBeGreaterThan(2);
    const dv = t.wreckImpact;
    // a civilian: wrecked by the impact alone
    expect(dv >= t.wreckImpact * 1).toBe(true);
    // the rival: under the armoured wreck line, and the damage only a share of the civilian's
    expect(dv >= t.wreckImpact * armour).toBe(false);
    const civ = impactDamage(0, dv, 1, t), riv = impactDamage(0, dv, armour, t);
    expect(civ).toBeLessThan(1);
    expect(riv).toBeCloseTo(civ / armour, 9);
    expect(riv).toBeLessThan(civ);
    expect(impactDamage(0.2, t.damageThreshold * 0.5, armour, t)).toBe(0.2);
  });

  it('M6 2.2 a hunt: Tina pulls out 40 m ahead in her armoured wrecker, the arrow is on her; wrecked she pays and her bag bursts; home first she wins', async () => {
    for (const end of ['wreck', 'home'] as const) {
      const sim = await world();
      try {
        sim.police!.dispatching = false;
        sim.run.chain = CHAIN_ALL;
        sim.board.beaten = 0b11;
        sim.board.force = true;
        expect(sim.board.next()).toBe(2);
        const d = ring(sim, 2);
        pullUp(sim, d);
        run(sim, 0.3);
        expect(sim.jobs.state).toBe('active');
        const traffic = sim.traffic as Traffic;
        const a = sim.jobs.race.rivals[0] as number;
        expect(traffic.bodyOf(a)).toBe('wrecker');
        expect(traffic.armour[a]).toBeCloseTo((BALANCE.board.hunt.armour[2] as number) * BALANCE.board.hunt.heavy, 5);
        expect(sim.jobs.remaining).toBeGreaterThan(BALANCE.board.hunt.seconds - 1);
        const ahead = Math.hypot((traffic.x[a] as number) - sim.probe.x, (traffic.z[a] as number) - sim.probe.z);
        expect(ahead).toBeGreaterThan(BALANCE.board.hunt.lead - 12);
        const out = { x: 0, z: 0 };
        expect(sim.jobs.target(out)).toBe(true);
        expect(Math.hypot(out.x - (traffic.x[a] as number), out.z - (traffic.z[a] as number))).toBeLessThan(0.01);
        const bag = sim.run.bag;
        if (end === 'wreck') {
          traffic.wreck(a);
          run(sim, 2 / 60);
          expect(sim.jobs.state).toBe('done');
          expect(sim.run.bag - bag).toBe(RIVALS[2]!.purse);
          expect(sim.board.isBeaten(2)).toBe(true);
          expect(sim.garage.owned.has('wrecker')).toBe(true);
          let burst = 0;
          const coins = sim.coins!;
          for (let k = 0; k < coins.spillTtl.length; k++) if ((coins.spillTtl[k] as number) > 0) burst += coins.spillValue[k] as number;
          expect(burst).toBe(BALANCE.board.hunt.burst);
        } else {
          sim.jobs.race.finished = 1;
          run(sim, 2 / 60);
          expect(sim.jobs.state).toBe('failed');
          expect(sim.jobs.lastPlace).toBe(2);
          expect(sim.board.isBeaten(2)).toBe(false);
          expect(sim.run.bag).toBe(bag);
        }
      } finally { sim.dispose(); }
    }
  }, 90_000);

  it('M6 2.3 the Chief: his bay by the donut shop after the ten; the duel is an escape at five stars with him on the roster within a second; lost, he pays his car', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0.5, peds: 0, record: false });
    try {
      sim.run.chain = CHAIN_ALL;
      sim.board.beaten = (1 << CHIEF) - 1;
      expect(sim.board.next()).toBe(CHIEF);
      expect(sim.board.ready(CHIEF)).toBe(true);
      const d = ring(sim, CHIEF);
      pullUp(sim, d);
      run(sim, 0.2);
      expect(sim.jobs.state).toBe('active');
      expect(sim.jobs.active).toBe(d.id);
      expect(sim.heat.level).toBe(5);
      expect(sim.pursuit.state).not.toBe('idle');
      const out = { x: 0, z: 0 };
      expect(sim.jobs.target(out)).toBe(false);
      run(sim, 1);
      expect(sim.police!.chief).toBeGreaterThanOrEqual(0);
      // lost him: the escape
      sim.pursuit.lose();
      run(sim, 2 / 60);
      expect(sim.jobs.state).toBe('done');
      expect(sim.board.isBeaten(CHIEF)).toBe(true);
      expect(sim.garage.owned.has('chiefcar')).toBe(true);
      expect(sim.board.next()).toBe(-1);
    } finally { sim.dispose(); }
  }, 90_000);
});
