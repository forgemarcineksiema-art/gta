/**
 * The save format (docs/M5_PLAN.md slice 0): the round trip and its stable
 * string, parsing that never throws, the v0 migration, the size guard with
 * everything filled, and collect / apply against a world. Version 3 (M6 slice
 * 0): the garage keeps bodies, the M6 fields are reserved. Version 6 (M8.5
 * slice 0): the road coins' pool folds into the bank.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { BODY_IDS, CAR_IDS, CAR_PRESETS, KIT, PALETTE } from '../../src/sim';
import { DEFAULT_SAVE, SAVE_VERSION, apply, collect, defaultSave, encodeBits, migrate, parse, serialize, type SaveV1 } from '../../src/sim/save/format';
import { createWorld } from './helpers';

/**
 * Every field the world holds off its default: seven cars, tiers, paints, prep, a streak, billboards. The M6
 * fields no system reads yet stay at their defaults here (a world cannot hold them); 0.1b fills them.
 */
function filled(smashedIds: number[]): SaveV1 {
  const smashed = new Uint8Array(49 * 4);
  for (const id of smashedIds) smashed[id] = 1;
  const found = new Uint8Array(30);
  for (const k of [0, 3, 29]) found[k] = 1;
  const ramps = new Uint8Array(20);
  for (const k of [1, 7, 19]) ramps[k] = 1;
  return {
    v: 6,
    seen: true,
    bank: 123456,
    car: 'sports',
    owned: ['muscle', 'compact', 'heavy', 'sports', 'police', 'taxi', 'icecream'],
    paint: { muscle: PALETTE.carLime, compact: PALETTE.carBlack, sports: PALETTE.carMagenta, taxi: PALETTE.coin },
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
    carKit: {},
    kit: { owned: '', on: [-1, -1, -1, -1, -1] },
    board: { beaten: 0 },
    career: { races: 0, zones: 0, fares: 0, hotFares: 0, orders: 0, takedowns: 0, caches: 0, escapes: [0, 0, 0, 0, 0], smashed: 0 },
    settings: { music: 3, effects: 8, quality: 'low', radarNorth: true },
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

  it('0.1b the M6 fields (a car kit, the driver\'s kit, the board, the career) round-trip and fall back one by one', () => {
    const save = filled([1, 2, 3]);
    save.carKit = { muscle: [1, 2, 0, 1], taxi: [4, 0, 2, 2] };
    save.kit = { owned: encodeBits(new Uint8Array([1, 0, 1, 1, 0, 0, 0, 1])), on: [0, 3, -1, 2, -1] };
    save.board = { beaten: 0b111 };
    save.career = { races: 3, zones: 1, fares: 4, hotFares: 1, orders: 2, takedowns: 17, caches: 41, escapes: [2, 3, 1, 0, 0], smashed: 57 };
    const text = serialize(save);
    expect(parse(text)).toEqual(save);
    expect(serialize(parse(text))).toBe(text);
    const bad = parse(JSON.stringify({ ...JSON.parse(text), carKit: { muscle: [99, -3, 'x', 2], tank: [1, 1, 1, 1] }, kit: { owned: '***', on: [7, 999, -5] }, board: { beaten: -1 }, career: { races: -4, escapes: 'many' } }));
    expect(bad.carKit).toEqual({ muscle: [15, 0, 0, 2] });
    expect(bad.kit).toEqual({ owned: '', on: [7, -1, -1, -1, -1] });
    expect(bad.board).toEqual({ beaten: 0 });
    expect(bad.career).toEqual({ races: 0, zones: 0, fares: 0, hotFares: 0, orders: 0, takedowns: 0, caches: 0, escapes: [0, 0, 0, 0, 0], smashed: 0 });
    expect(bad.bank).toBe(123456);
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
    expect(save.v).toBe(SAVE_VERSION);
    expect(save.owned).toEqual(['muscle', 'compact']);
    expect(save.car).toBe('compact');
    // v6 folds the coins into the bank
    expect(save.bank).toBe(5120);
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

  it('0.11 an M5 document (v1) migrates to the current version with no caches found, the chain at 0 and the hint counter at 0; a v2 field out of range falls back alone', () => {
    const v1 = { v: 1, bank: 777, coins: 12, seen: true, owned: ['muscle', 'compact'], car: 'compact', smashed: '' };
    const save = migrate(v1);
    expect(save.v).toBe(SAVE_VERSION);
    // the coins folded in at v6
    expect(save.bank).toBe(789);
    expect(save.caches).toEqual({ date: '', found: '' });
    expect(save.chain).toBe(0);
    expect(save.borrowHints).toBe(0);
    const bad = parse(JSON.stringify({ ...filled([]), caches: { date: 'yesterday', found: '***' }, chain: 99, borrowHints: -1 }));
    expect(bad.caches).toEqual({ date: '', found: '' });
    expect(bad.chain).toBe(0);
    expect(bad.borrowHints).toBe(0);
    expect(bad.bank).toBe(123456);
  });

  it('M6 0.2 an M5.5 document (v2) migrates to v3: the hidden cars found are owned, the one driven out is the car, nothing else is lost', () => {
    const v2 = {
      v: 2, seen: true, bank: 4321, coins: 55, car: 'compact', owned: ['muscle', 'compact', 'sports'],
      paint: { compact: PALETTE.carBlack }, tiers: { compact: [1, 2, 0] }, streak: { count: 7, last: '2026-09-22', topper: true },
      chain: 63, medals: '32', hidden: 'icecream', drive: 'icecream',
    };
    const save = migrate(v2);
    // through v3 to the current version (M7: v4 adds the settings)
    expect(save.v).toBe(SAVE_VERSION);
    expect(save.owned).toEqual(['muscle', 'compact', 'sports', 'icecream']);
    expect(save.car).toBe('icecream');
    expect(save.paint).toEqual({ compact: PALETTE.carBlack });
    expect(save.tiers).toEqual({ compact: [1, 2, 0] });
    expect(save.streak.topper).toBe(true);
    expect(save.chain).toBe(63);
    expect(save.medals).toBe('32');
    // the coins folded in at v6
    expect(save.bank).toBe(4376);
    expect('hidden' in save).toBe(false);
    // a class driven out stays the car; a found car not driven out is owned all the same
    const b = migrate({ ...v2, drive: '' });
    expect(b.car).toBe('compact');
    expect(b.owned).toContain('icecream');
    // the reserved fields start empty
    expect(save.board).toEqual({ beaten: 0 });
    expect(save.kit.on).toEqual([-1, -1, -1, -1, -1]);
  });

  it('M7 3.1 an M6 document (v3) migrates through v4 (the default settings) to the current version; a broken setting falls back alone', () => {
    const v3: Record<string, unknown> = { ...(JSON.parse(serialize(filled([4]))) as Record<string, unknown>), v: 3 };
    delete v3['settings'];
    const save = migrate(v3);
    expect(save.v).toBe(SAVE_VERSION);
    expect(save.settings).toEqual({ music: 7, effects: 10, quality: 'auto', radarNorth: false });
    expect(save.bank).toBe(123456);
    const bad = parse(JSON.stringify({ ...filled([]), settings: { music: 11, effects: 4, quality: 'ultra', radarNorth: 'yes' } }));
    expect(bad.settings).toEqual({ music: 7, effects: 4, quality: 'auto', radarNorth: false });
    const good = parse(serialize(filled([])));
    expect(good.settings).toEqual({ music: 3, effects: 8, quality: 'low', radarNorth: true });
  });

  it('M8.5 0.2 an M8 document (v5) folds its coins into the bank; v6 writes no coins and reads back equal', () => {
    const v5: Record<string, unknown> = { ...(JSON.parse(serialize(filled([4]))) as Record<string, unknown>), v: 5, bank: 1_000, coins: 7_890 };
    const save = migrate(v5);
    expect(save.v).toBe(6);
    expect(save.bank).toBe(8_890);
    expect('coins' in save).toBe(false);
    const text = serialize(save);
    expect(text).not.toContain('"coins"');
    expect(parse(text)).toEqual(save);
    // a broken pool adds nothing; a broken bank keeps the pool
    expect(migrate({ ...v5, coins: -5 }).bank).toBe(1_000);
    expect(migrate({ ...v5, bank: 'lots' }).bank).toBe(7_890);
  });

  it('M6 G.2 everything M6 can hold (every car owned, painted and fitted, the whole kit, the board beaten, a long career) round-trips under the size guard', () => {
    const save = filled([1, 2, 3]);
    save.owned = [...BODY_IDS];
    save.paint = {};
    save.carKit = {};
    for (const id of BODY_IDS) {
      save.paint[id] = PALETTE.carMagenta;
      save.carKit[id] = [3, 0, 2, 1];
    }
    save.kit = { owned: encodeBits(new Uint8Array(KIT.length).fill(1)), on: [16, 20, 25, 30, 35] };
    save.board = { beaten: 0b111_1111_1111 };
    save.career = { races: 9999, zones: 9999, fares: 9999, hotFares: 9999, orders: 9999, takedowns: 99999, caches: 9999, escapes: [999, 999, 999, 999, 999], smashed: 999999 };
    const text = serialize(save);
    expect(parse(text)).toEqual(save);
    expect(text.length).toBeLessThan(BALANCE.save.maxBytes);
    console.info(`the save with everything of M6 filled: ${text.length} bytes of ${BALANCE.save.maxBytes}`);
  });
});
