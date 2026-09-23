/**
 * The save format (docs/M5_PLAN.md slice 0): the round trip and its stable
 * string, parsing that never throws, the v0 migration, the size guard with
 * everything filled, and collect / apply against a world.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { CAR_IDS, CAR_PRESETS, PALETTE } from '../../src/sim';
import { DEFAULT_SAVE, apply, collect, defaultSave, encodeBits, migrate, parse, serialize, type SaveV1 } from '../../src/sim/save/format';
import { createWorld } from './helpers';

/** Every field off its default: five cars, tiers, paints, prep, a streak, billboards. */
function filled(smashedIds: number[]): SaveV1 {
  const smashed = new Uint8Array(49 * 4);
  for (const id of smashedIds) smashed[id] = 1;
  const found = new Uint8Array(30);
  for (const k of [0, 3, 29]) found[k] = 1;
  const ramps = new Uint8Array(20);
  for (const k of [1, 7, 19]) ramps[k] = 1;
  return {
    v: 2,
    seen: true,
    bank: 123456,
    coins: 7890,
    car: 'sports',
    owned: ['muscle', 'compact', 'heavy', 'sports', 'police'],
    paint: { muscle: PALETTE.carLime, compact: PALETTE.carBlack, sports: PALETTE.carMagenta },
    tiers: { muscle: [3, 3, 3], compact: [1, 0, 2], heavy: [0, 3, 0], sports: [2, 2, 2], police: [1, 1, 1] },
    prep: { lawyer: true, fence: true },
    policeUnlocked: true,
    bestRun: 45678,
    smashed: encodeBits(smashed),
    dailies: { date: '2026-09-23', ids: [3, 7, 11], progress: [12000, 1, 0], done: [false, true, false] },
    streak: { count: 42, last: '2026-09-23', topper: true },
    runs: 318,
    playSeconds: 98765.5,
    caches: { date: '2026-09-23', found: encodeBits(found) },
    chain: 4,
    borrowHints: 2,
    medals: '3102',
    jumps: encodeBits(ramps),
    hidden: 'icecream',
    // the class drives out (0.5 pins the sports car); 16.2 pins a hidden car as the drive-out
    drive: '',
  };
}

describe('save format', () => {
  it('0.1 serialize → parse is a deep-equal round trip and the string is stable', () => {
    const save = filled([0, 5, 17, 100, 195]);
    const text = serialize(save);
    expect(parse(text)).toEqual(save);
    expect(serialize(parse(text))).toBe(text);
    expect(serialize(save)).toBe(text);
    expect(parse(serialize(defaultSave()))).toEqual(DEFAULT_SAVE);
  });

  it('0.2 null, broken JSON, a non-object and a newer version give the defaults without throwing', () => {
    for (const text of [null, '{', '42', '{"v":99}', '[]', '"save"', 'null']) {
      expect(() => parse(text)).not.toThrow();
      expect(parse(text)).toEqual(DEFAULT_SAVE);
    }
    // a copy, not the frozen defaults
    const a = parse(null);
    a.owned.push('compact');
    expect(DEFAULT_SAVE.owned).toEqual(['muscle']);
  });

  it('0.3 a v0 shape (no v) migrates to the current version with the muscle car owned', () => {
    const v0 = { bank: 5000, coins: 120, seen: true, owned: ['compact'], car: 'compact' };
    const save = migrate(v0);
    expect(save.v).toBe(2);
    expect(save.owned).toEqual(['muscle', 'compact']);
    expect(save.car).toBe('compact');
    expect(save.bank).toBe(5000);
    expect(save.seen).toBe(true);
    expect(parse(JSON.stringify({ bank: 10 })).owned).toEqual(['muscle']);
    // garbage fields fall back one by one
    const bad = parse(JSON.stringify({ v: 1, bank: -5, car: 'tank', owned: 'all', tiers: { muscle: [9, -1, 'x'] }, paint: { muscle: 0x1000000 } }));
    expect(bad.bank).toBe(0);
    expect(bad.car).toBe('muscle');
    expect(bad.owned).toEqual(['muscle']);
    expect(bad.tiers.muscle).toEqual([3, 0, 0]);
    expect(bad.paint.muscle).toBeUndefined();
  });

  it('0.4 everything filled serializes under the size guard', () => {
    const all: number[] = [];
    for (let i = 0; i < 49 * 4; i++) all.push(i);
    const text = serialize(filled(all));
    expect(text.length).toBeLessThan(BALANCE.save.maxBytes);
    expect(text.length).toBeLessThan(2000);
  });

  it('0.5 / 0.6 apply on a city world sets the car, its mass, the billboards and the bank; collect reproduces the input', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const smashed = [4, 8, 12, 16, 20, 24, 100];
      const save = filled(smashed);
      apply(sim, save);
      expect(sim.carId).toBe('sports');
      expect(sim.vehicle.tuning.mass).toBe(CAR_PRESETS.sports.mass);
      expect(sim.collectibles!.smashedCount).toBe(smashed.length);
      for (const id of smashed) expect(sim.collectibles!.smashed[id]).toBe(1);
      expect(sim.run.bank).toBe(123456);
      expect(sim.run.coins).toBe(7890);
      expect(sim.coldOpen.seen).toBe(true);
      expect(sim.pursuit.descriptor.kind).toBe('sports');
      expect(sim.pursuit.descriptor.paint).toBe(PALETTE.carMagenta);
      // tier 2 power on the sports car: the preset times the multiplier
      expect(sim.vehicle.tuning.torqueMax).toBeCloseTo(CAR_PRESETS.sports.torqueMax * (BALANCE.tiers.power[2] as number), 9);
      const out = defaultSave();
      collect(sim, out);
      expect(out).toEqual(save);
      expect(serialize(out)).toBe(serialize(save));
      for (const id of CAR_IDS) expect(sim.garage.owned.has(id)).toBe(true);
    } finally { sim.dispose(); }
  });

  it('0.11 an M5 document (v1) migrates to v2 with no caches found, the chain at 0 and the hint counter at 0; a v2 field out of range falls back alone', () => {
    const v1 = { v: 1, bank: 777, coins: 12, seen: true, owned: ['muscle', 'compact'], car: 'compact', smashed: '' };
    const save = migrate(v1);
    expect(save.v).toBe(2);
    expect(save.bank).toBe(777);
    expect(save.caches).toEqual({ date: '', found: '' });
    expect(save.chain).toBe(0);
    expect(save.borrowHints).toBe(0);
    const bad = parse(JSON.stringify({ ...filled([]), caches: { date: 'yesterday', found: '***' }, chain: 99, borrowHints: -1 }));
    expect(bad.caches).toEqual({ date: '', found: '' });
    expect(bad.chain).toBe(0);
    expect(bad.borrowHints).toBe(0);
    expect(bad.bank).toBe(123456);
  });
});
