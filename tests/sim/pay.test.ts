/**
 * The pay (M8 slice 6, docs/history/M8_PLAN.md D9): a smash is a skill-chain trick with the thing's points and name, the
 * smashes within half a second of their group's first count as one trick toward the multiplier, an anchored thing
 * that holds loses the chain, every smash is a crime by the thing's heat (doubled in a unit's sight), and the bill
 * sums into the run's CITY DAMAGE, never into the bag or the bank.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { PROP_TYPES, type PropDesc, type PropKind } from '../../src/sim/city/props';
import { PropState } from '../../src/sim/props/Props';
import { Trick } from '../../src/sim/run/Skill';
import type { SimWorld } from '../../src/sim';
import { createWorld, run } from './helpers';

const KMH = 1 / 3.6;

async function world(): Promise<SimWorld> {
  return createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
}

/** Every standing prop in the loaded chunks. */
function all(sim: SimWorld): PropDesc[] {
  const out: PropDesc[] = [];
  for (const entry of sim.city!.active.values()) out.push(...sim.city!.props(entry.chunk.x, entry.chunk.z));
  return out;
}

function lonely(sim: SimWorld, kind: PropKind, clear = 6): PropDesc {
  const props = all(sim);
  const p = props.find((q) => q.kind === kind && !props.some((o) => o !== q && Math.hypot(o.x - q.x, o.z - q.z) < clear));
  if (!p) throw new Error(`no lonely ${kind}`);
  return p;
}

/** A player's knock head on at `kmh`, from the road side. */
function knock(sim: SimWorld, p: PropDesc, kmh = 40): void {
  sim.props!.knock(p.id, 1400, kmh * KMH, -Math.sin(p.yaw), -Math.cos(p.yaw), 0, 0);
}

function kinds(sim: SimWorld, from: number): string[] {
  const out: string[] = [];
  sim.events.readFrom(from, (e) => { out.push(e.kind); });
  return out;
}

describe('the pay (M8 slice 6)', () => {
  it('M8 6.1 ten pieces in 0.8 s: the chain\'s points are their sum, the multiplier counts two tricks, the word the last one\'s name, the boost by weight', async () => {
    const sim = await world();
    try {
      // a café terrace (two tables, four chairs) and the four things nearest to it: over to the first one on the map
      let spot: PropDesc | undefined;
      for (let cz = -3; cz <= 3 && !spot; cz++) for (let cx = -3; cx <= 3 && !spot; cx++) spot = sim.city!.props(cx, cz).find((p) => p.kind === 'table');
      expect(spot).toBeDefined();
      sim.vehicle.teleport({ x: spot!.x + Math.sin(spot!.yaw) * 12, y: 1, z: spot!.z + Math.cos(spot!.yaw) * 12 }, spot!.yaw);
      run(sim, 0.5);
      const props = all(sim);
      const table = props.find((p) => p.kind === 'table' && Math.hypot(p.x - spot!.x, p.z - spot!.z) < 0.1)!;
      expect(table).toBeDefined();
      const ten = [...props].sort((a, b) => Math.hypot(a.x - table.x, a.z - table.z) - Math.hypot(b.x - table.x, b.z - table.z)).slice(0, 10);
      expect(ten.filter((p) => p.kind === 'table' || p.kind === 'chair').length).toBeGreaterThanOrEqual(6);
      sim.vehicle.boostMeter = 0;
      let points = 0, boost = 0;
      for (const p of ten) {
        knock(sim, p);
        expect(sim.props!.state[p.id]).not.toBe(PropState.Standing);
        points += PROP_TYPES[p.kind].points;
        boost += PROP_TYPES[p.kind].boost;
        run(sim, 0.08);
      }
      // the first seven within half a second of the first: one trick; the last three open the second
      expect(sim.skill.points).toBe(points);
      expect(sim.skill.tricks).toBe(2);
      expect(sim.skill.last).toBe(Trick.Smash);
      expect(sim.skill.word).toBe(PROP_TYPES[ten[9]!.kind].name);
      expect(sim.vehicle.boostMeter).toBeCloseTo(boost, 6);
      // the chain banks as any other (the car left alone: a held brake at rest backs it into the shop): the points × the multiplier into the bag
      const bag = sim.run.bag;
      run(sim, BALANCE.skill.window + 0.2);
      expect(sim.skill.points).toBe(0);
      expect(sim.run.bag - bag).toBe(Math.round(points / 10) * 10);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8 6.2 a lamp post that holds loses the chain; one that goes adds to it', async () => {
    const sim = await world();
    try {
      const post = lonely(sim, 'lamp');
      const fx = Math.sin(post.yaw), fz = Math.cos(post.yaw), yaw = Math.atan2(-fx, -fz);
      const at = (kmh: number): void => {
        sim.vehicle.teleport({ x: post.x + fx * 8, y: 1, z: post.z + fz * 8 }, yaw);
        run(sim, 0.4);
        sim.skill.points = 400;
        sim.skill.tricks = 2;
        sim.skill.left = BALANCE.skill.window;
        const v = kmh * KMH, lv = { x: 0, y: 0, z: 0 };
        for (let i = 0; i < 120 && sim.props!.state[post.id] === PropState.Standing && sim.skill.points > 0; i++) {
          sim.vehicle.setVelocity(Math.sin(yaw) * v, sim.vehicle.body.linvel(lv).y, Math.cos(yaw) * v);
          sim.step();
        }
      };
      // below its base's strength (18 km/h) it holds: the chain is gone
      let seq = sim.events.sequence;
      at(12);
      expect(sim.props!.state[post.id]).toBe(PropState.Standing);
      expect(kinds(sim, seq)).toContain('skillLost');
      expect(sim.skill.points).toBe(0);
      // above it the post goes: a trick on the chain, nothing lost
      seq = sim.events.sequence;
      at(35);
      expect(sim.props!.state[post.id]).not.toBe(PropState.Standing);
      run(sim, 1 / 60);
      expect(kinds(sim, seq)).not.toContain('skillLost');
      expect(sim.skill.points).toBe(400 + PROP_TYPES.lamp.points);
      expect(sim.skill.tricks).toBe(3);
      expect(sim.skill.word).toBe('LAMP POST');
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8 6.3 every smash is a crime by the thing\'s heat, times the factor in a unit\'s sight; a chasing unit\'s is not', async () => {
    const sim = await world();
    try {
      run(sim, 0.2);
      const heat = sim.heat;
      const hydrant = lonely(sim, 'hydrant'), meter = lonely(sim, 'meter');
      // unseen: the hydrant's 3
      let before = heat.points;
      knock(sim, hydrant);
      run(sim, 1 / 60);
      expect(heat.points - before).toBeCloseTo(PROP_TYPES.hydrant.heat, 1);
      // seen: the meter's 2 doubled (and wanted, as any witnessed crime)
      heat.seen = () => true;
      before = heat.points;
      knock(sim, meter);
      run(sim, 1 / 60);
      const doubled = PROP_TYPES.meter.heat * BALANCE.heat.seenFactor;
      expect(heat.points - before).toBeCloseTo(Math.max(doubled, (BALANCE.heatThresholds[0] ?? 0) - before), 1);
      // a unit's knock (a traffic record's) pays no heat, no chain, no bill
      const bin = lonely(sim, 'bin');
      before = heat.points;
      const points = sim.skill.points, bill = sim.props!.bill;
      sim.props!.knock(bin.id, 1400, 40 * KMH, -Math.sin(bin.yaw), -Math.cos(bin.yaw), 0, 0, 3);
      run(sim, 1 / 60);
      expect(sim.props!.state[bin.id]).not.toBe(PropState.Standing);
      expect(heat.points).toBeLessThanOrEqual(before);
      expect(sim.skill.points).toBe(points);
      expect(sim.props!.bill).toBe(bill);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8 6.4 the bill sums the stickers into the run\'s CITY DAMAGE, never the bag or the bank; the news at 10,000 in a district', async () => {
    const sim = await world();
    try {
      run(sim, 0.2);
      const r = sim.run, bag = r.bag, bank = r.bank;
      let bill = 0;
      const seq = sim.events.sequence;
      const big = all(sim).filter((p) => p.kind === 'kiosk' || p.kind === 'shelter' || p.kind === 'lamp').slice(0, 12);
      for (const p of big) {
        knock(sim, p, 60);
        bill += PROP_TYPES[p.kind].bill;
        run(sim, 1 / 60);
      }
      expect(r.counts.smashes).toBe(big.length);
      expect(r.counts.damage).toBe(bill);
      expect(sim.props!.bill).toBe(bill);
      // the chain is still open: nothing paid yet, and the bill never will be
      expect(r.bag).toBe(bag);
      expect(r.bank).toBe(bank);
      // the news: each district's damage passing 10,000, once
      const news: number[] = [];
      sim.events.readFrom(seq, (e) => { if (e.kind === 'damageNews') news.push(e.target); });
      const byDistrict = [0, 0, 0, 0];
      for (const p of big) byDistrict[(p.z >= 0 ? 2 : 0) + (p.x >= 0 ? 1 : 0)]! += PROP_TYPES[p.kind].bill;
      expect(news.sort()).toEqual(byDistrict.flatMap((d, i) => (d >= 10_000 ? [i] : [])));
      expect(news.length).toBeGreaterThan(0);
      // the chain banks its points, not the bill
      const chain = sim.skill.value;
      run(sim, BALANCE.skill.window + 0.2);
      expect(r.bag - bag).toBe(chain);
      expect(r.bank).toBe(bank);
    } finally { sim.dispose(); }
  }, 60_000);
});
