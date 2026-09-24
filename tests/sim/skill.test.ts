/**
 * The skill chain and the hunts (M5.5 slice 14, DESIGN.md §7): near misses,
 * the oncoming lane, drifts and airtime build a chain whose multiplier grows
 * every few tricks; a clean end banks the points × the multiplier into the
 * bag, a wall hit or a wreck loses them, and a door banks the chain before
 * the bag. The last of the twenty ramps and the last of the fifty billboards
 * pay their set's reward into the bank; the save carries the ramps found.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { type BillboardDesc } from '../../src/sim/city/collectibles';
import { type DropOff } from '../../src/sim/city/cover';
import { Trick } from '../../src/sim/run/Skill';
import { apply, collect, defaultSave } from '../../src/sim/save/format';
import type { SimWorld } from '../../src/sim';
import { createWorld, run, runUntil } from './helpers';

/** The events of one kind since `from`: their values. */
function values(sim: SimWorld, kind: string, from: number): number[] {
  const out: number[] = [];
  sim.events.readFrom(from, (e) => { if (e.kind === kind) out.push(e.value); });
  return out;
}

/** The road coins picked since `from`: in the bank with the rest since M8.5 (a spilled coin is the bag's). */
function roadCoins(sim: SimWorld, from: number): number {
  let n = 0;
  sim.events.readFrom(from, (e) => { if (e.kind === 'coin' && e.target !== -2) n += e.value; });
  return n;
}

function nearMisses(sim: SimWorld, n: number): void {
  for (let k = 0; k < n; k++) sim.events.push('nearMiss', 0, sim.probe.x, 0, sim.probe.z, -1);
  run(sim, 1 / 60);
}

describe('skill chain', () => {
  it('14.1 near misses build the chain, one more × every few tricks to ×5; a clean end banks it into the bag', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    try {
      run(sim, 1, (_t, c) => { c.brake = 1; });
      const s = BALANCE.skill;
      nearMisses(sim, 7);
      expect(sim.skill.tricks).toBe(7);
      expect(sim.skill.multiplier).toBe(1 + Math.floor(7 / s.multEvery));
      expect(sim.skill.points).toBe(7 * s.nearMiss);
      expect(sim.skill.last).toBe(Trick.NearMiss);
      const pay = sim.skill.value;
      expect(pay).toBe(7 * s.nearMiss * 3);
      const bag = sim.run.bag, seq = sim.events.sequence;
      // held open for the window after the last trick, then banked
      run(sim, s.window - 0.2);
      expect(sim.skill.points).toBeGreaterThan(0);
      run(sim, 0.4);
      expect(values(sim, 'skill', seq)).toEqual([pay]);
      expect(sim.run.bag - bag).toBe(pay);
      expect(sim.skill.points).toBe(0);
      // the multiplier stops at the cap
      nearMisses(sim, 5 * s.multEvery);
      expect(sim.skill.multiplier).toBe(s.maxMult);
    } finally { sim.dispose(); }
  });

  it('14.2 a wall hit loses the chain, and so does a wreck: nothing reaches the bag', async () => {
    const sim = await createWorld({ spawn: 'walls' });
    try {
      run(sim, 1);
      // 8 m off the wall face at x = 257, heading into it at 50 km/h
      sim.vehicle.teleport({ x: 249, y: 0.6, z: 20 }, Math.PI / 2);
      run(sim, 0.5);
      nearMisses(sim, 4);
      const lost = sim.skill.value;
      expect(lost).toBeGreaterThan(0);
      const bag = sim.run.bag;
      let seq = sim.events.sequence;
      sim.vehicle.body.setLinvel({ x: 50 / 3.6, y: 0, z: 0 }, true);
      run(sim, 1.5);
      expect(values(sim, 'skillLost', seq)).toEqual([lost]);
      expect(values(sim, 'skill', seq)).toEqual([]);
      expect(sim.skill.points).toBe(0);
      nearMisses(sim, 2);
      seq = sim.events.sequence;
      sim.events.push('wrecked', 1, sim.probe.x, 0, sim.probe.z, -1);
      run(sim, BALANCE.skill.window + 0.5);
      expect(values(sim, 'skillLost', seq).length).toBe(1);
      expect(values(sim, 'skill', seq)).toEqual([]);
      expect(sim.run.bag).toBe(bag);
    } finally { sim.dispose(); }
  });

  it('14.3 a flight is a trick: points by the second in the air, the window held until the landing', async () => {
    const sim = await createWorld({ spawn: 'straight' });
    try {
      run(sim, 1, (_t, c) => { c.brake = 1; });
      sim.vehicle.teleport({ x: 0, y: 6, z: 100 }, 0);
      sim.vehicle.setVelocity(0, 0, 15);
      let heldInAir = true;
      const t = runUntil(sim, 3, (s) => {
        if (s.vehicle.telemetry.groundedWheels === 0 && s.skill.points > 0 && s.skill.left < BALANCE.skill.window) heldInAir = false;
        return s.skill.tricks > 0;
      });
      expect(t).toBeGreaterThan(BALANCE.skill.airTrick);
      expect(sim.skill.last).toBe(Trick.Air);
      expect(heldInAir).toBe(true);
      expect(sim.skill.points).toBeGreaterThan(BALANCE.skill.airPerSecond * 0.3);
      expect(sim.skill.points).toBeLessThanOrEqual(BALANCE.skill.perTrickCap);
    } finally { sim.dispose(); }
  });

  it('14.4 pulling into a door banks the chain first: the door multiplies it with the bag', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const site = sim.run.dropOffs[0] as DropOff;
      sim.run.maxHeat = 3;
      nearMisses(sim, 4);
      const chain = sim.skill.value;
      // on the garage floor, stopped: the door starts closing with the chain's window still open
      const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
      sim.city?.sync(site.x, site.z, true);
      sim.vehicle.teleport({ x: site.x - fx, y: 0.9, z: site.z - fz }, site.yaw);
      // no brake: a brake held at a standstill engages reverse
      expect(runUntil(sim, BALANCE.door.closeSeconds + 1, (s) => s.run.state === 'door')).toBeGreaterThan(0);
      expect(sim.run.lastBag).toBe(chain);
      expect(sim.run.lastBanked).toBe(Math.round(chain * BALANCE.multiplier[3]!));
      expect(sim.skill.points).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);
});

describe('hunts', () => {
  it('14.5 the last billboard and the last ramp pay their sets into the bank; the save carries the ramps', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const city = sim.city!, c = sim.collectibles!, jumps = sim.jumps!;
      // forty-nine smashed: all but the one the car stands nearest
      const p = sim.vehicle.body.translation();
      const boards: BillboardDesc[] = [];
      for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) boards.push(...city.generate(cx, cz).billboards);
      expect(boards.length).toBe(c.total);
      let last = boards[0] as BillboardDesc;
      for (const b of boards) if (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(last.x - p.x, last.z - p.z)) last = b;
      for (const b of boards) if (b !== last) c.smashed[b.id] = 1;
      c.smashedCount = c.total - 1;
      const nx = Math.sin(last.yaw), nz = Math.cos(last.yaw), yaw = Math.atan2(-nx, -nz);
      city.sync(last.x, last.z, true);
      sim.vehicle.teleport({ x: last.x + nx * 15, y: 1, z: last.z + nz * 15 }, yaw);
      run(sim, 0.5);
      let bank = sim.run.bank, seq = sim.events.sequence;
      runUntil(sim, 3, (s) => s.collectibles!.smashedCount === s.collectibles!.total, (_t, _c, s) => {
        s.vehicle.setVelocity(Math.sin(yaw) * 17, s.vehicle.telemetry.vy, Math.cos(yaw) * 17);
      });
      run(sim, 2 / 60);
      expect(c.smashedCount).toBe(c.total);
      expect(values(sim, 'hunt', seq)).toEqual([BALANCE.hunts.billboards]);
      expect(sim.run.bank - bank - roadCoins(sim, seq)).toBe(BALANCE.hunts.billboards);

      // nineteen ramps found: the jump off the first one (the 6.14 launch) completes the set
      for (let i = 1; i < jumps.descs.length; i++) jumps.found[i] = 1;
      jumps.foundCount = jumps.descs.length - 1;
      const jd = jumps.descs[0]!;
      const fx = Math.sin(jd.yaw), fz = Math.cos(jd.yaw);
      city.sync(jd.x - fx * 70, jd.z - fz * 70, true);
      sim.vehicle.teleport({ x: jd.x - fx * 70, y: 0.8, z: jd.z - fz * 70 }, jd.yaw);
      run(sim, 0.4, (_t, ctl) => { ctl.brake = 1; });
      bank = sim.run.bank;
      seq = sim.events.sequence;
      let flew = false;
      run(sim, 6.5, (_t, _c, s) => {
        const along = (s.probe.x - jd.x) * fx + (s.probe.z - jd.z) * fz;
        if (along < -jd.length - 1 && !flew) s.vehicle.setVelocity(fx * 25, s.vehicle.telemetry.vy, fz * 25);
        if (s.jumps!.flying >= 0) flew = true;
      });
      expect(values(sim, 'hunt', seq)).toEqual([BALANCE.hunts.jumps]);
      expect(jumps.foundCount).toBe(jumps.descs.length);
      expect(sim.run.bank - bank - roadCoins(sim, seq)).toBe(BALANCE.hunts.jumps);

      // the save: the ramps found come back
      const doc = defaultSave();
      collect(sim, doc);
      jumps.found.fill(0);
      jumps.foundCount = 0;
      apply(sim, doc);
      expect(jumps.foundCount).toBe(jumps.descs.length);
      expect(Array.from(jumps.found).every((f) => f === 1)).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);
});
