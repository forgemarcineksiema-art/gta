/**
 * The day's caches (M5.5 slice 1, docs/DESIGN.md §13.5): thirty a day from
 * the date seed, distinct and apart, deterministic, different tomorrow; the
 * counter and the bonuses; the save keeps the day's finds.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { cacheSpots, cachesFor } from '../../src/sim/city/caches';
import { EXTRA_RANGES } from '../../src/sim/city/coins';
import { collect, defaultSave, apply, parse, serialize } from '../../src/sim/save/format';
import { createWorld, run } from './helpers';

const C = BALANCE.coin.cache;

/** The cap's id of today's slot k when nothing before it was found: the k-th run's last coin. */
function capId(sim: Awaited<ReturnType<typeof createWorld>>, k: number): number {
  return sim.coins!.extraId('caches', k * (C.run + 1) + C.run);
}

describe('caches', () => {
  it('1.2 thirty a day: distinct spots at least minGap apart, deterministic per date, and at least 10 of 30 differ tomorrow; no date, the first thirty by order', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const spots = cacheSpots(sim.city!);
      expect(spots.length).toBeGreaterThanOrEqual(60);
      expect(spots.length).toBeLessThanOrEqual(C.candidates);
      for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
        expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z)).toBeGreaterThanOrEqual(C.minGap - 1e-6);
      }
      const today = cachesFor(spots, '2026-09-23', C.perDay);
      expect(today.length).toBe(C.perDay);
      expect(new Set(today).size).toBe(C.perDay);
      expect(cachesFor(spots, '2026-09-23', C.perDay)).toEqual(today);
      const tomorrow = cachesFor(spots, '2026-09-24', C.perDay);
      // thirty drawn from about sixty roads: on average half of tomorrow's are new
      const fresh = tomorrow.filter((i) => !today.includes(i)).length;
      console.info(`[caches] ${spots.length} candidate spots; ${fresh} of ${C.perDay} differ between 2026-09-23 and 2026-09-24`);
      expect(fresh).toBeGreaterThanOrEqual(10);
      expect(cachesFor(spots, '', C.perDay)).toEqual([...Array(C.perDay).keys()]);
      // laid on the first step: perDay runs of `run` coins and a cap, in the caches' own pool
      sim.step();
      const caches = sim.caches!;
      expect(caches.today).toEqual([...Array(C.perDay).keys()]);
      const laid = sim.coins!.extra.filter((c) => c.lane === -4);
      expect(laid.length).toBe(C.perDay * (C.run + 1));
      expect(laid.filter((c) => c.value === BALANCE.coin.cacheCap).length).toBe(C.perDay);
      for (const c of laid) {
        const slot = c.id - 49 * 256;
        expect(slot).toBeGreaterThanOrEqual(EXTRA_RANGES.caches[0]);
        expect(slot).toBeLessThan(EXTRA_RANGES.caches[1]);
      }
      // a date: today's thirty, laid afresh
      sim.dailies.setDate('2026-09-23');
      expect(caches.today).toEqual(today);
      expect(sim.coins!.extra.filter((c) => c.lane === -4).length).toBe(C.perDay * (C.run + 1));
    } finally { sim.dispose(); }
  }, 60_000);

  it('1.6 the cap finds the cache, the counter climbs, and the tenth, twentieth and thirtieth pay their bonus into the bank', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.step();
      const caches = sim.caches!;
      const coins = sim.coins!;
      const bank = sim.run.bank;
      const seq = sim.events.sequence;
      for (let k = 0; k < 9; k++) coins.take(capId(sim, k), sim.events);
      run(sim, 0.1);
      expect(caches.count).toBe(9);
      expect(sim.run.bank).toBe(bank);
      coins.take(capId(sim, 9), sim.events);
      run(sim, 0.1);
      expect(caches.count).toBe(10);
      expect(sim.run.bank).toBe(bank + (C.bonus[0] as number));
      for (let k = 10; k < 30; k++) coins.take(capId(sim, k), sim.events);
      run(sim, 0.1);
      expect(caches.count).toBe(30);
      expect(sim.run.bank).toBe(bank + (C.bonus[0] as number) + (C.bonus[1] as number) + (C.bonus[2] as number));
      let events = 0, bonuses = 0;
      sim.events.readFrom(seq, (e) => { if (e.kind === 'cache') { events++; if (e.value > 0) bonuses++; } });
      expect(events).toBe(30);
      expect(bonuses).toBe(3);
      // the cap once: a second take is nothing
      coins.take(capId(sim, 0), sim.events);
      run(sim, 0.1);
      expect(caches.count).toBe(30);
    } finally { sim.dispose(); }
  }, 60_000);

  it('1.7 the save keeps the day\'s finds: the same date restores them and lays only the rest; a new date starts over', async () => {
    const a = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    let text = '';
    try {
      a.dailies.setDate('2026-09-23');
      a.step();
      for (let k = 0; k < 4; k++) a.coins!.take(capId(a, k), a.events);
      run(a, 0.1);
      expect(a.caches!.count).toBe(4);
      const doc = defaultSave();
      collect(a, doc);
      expect(doc.caches.date).toBe('2026-09-23');
      expect(doc.caches.found).not.toBe('');
      text = serialize(doc);
    } finally { a.dispose(); }
    const b = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      apply(b, parse(text));
      b.dailies.setDate('2026-09-23');
      b.step();
      expect(b.caches!.count).toBe(4);
      expect(b.caches!.found.slice(0, 4)).toEqual(new Uint8Array([1, 1, 1, 1]));
      expect(b.coins!.extra.filter((c) => c.lane === -4).length).toBe((C.perDay - 4) * (C.run + 1));
      b.dailies.setDate('2026-09-24');
      b.step();
      expect(b.caches!.count).toBe(0);
      expect(b.coins!.extra.filter((c) => c.lane === -4).length).toBe(C.perDay * (C.run + 1));
    } finally { b.dispose(); }
  }, 60_000);
});
