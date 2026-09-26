/**
 * Dailies and the streak (docs/history/M5_PLAN.md slice 6): the date seeds the day's
 * police order and nothing else; the day's three are the same for a date and
 * differ across dates; a car-bound challenge counts only in that car; a
 * banked-run challenge pays into the bank; the streak moves by the calendar
 * and pays once a day; day seven puts the topper on.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { DAILY_TEMPLATES, dayNumber } from '../../src/sim/dailies/Dailies';
import type { SimWorld } from '../../src/sim';
import { createWorld } from './helpers';

function slot(sim: SimWorld, template: number): void {
  sim.dailies.ids[0] = template;
  sim.dailies.progress[0] = 0;
  sim.dailies.done[0] = false;
}

function count(sim: SimWorld, from: number, kind: string): number {
  let n = 0;
  sim.events.readFrom(from, (e) => { if (e.kind === kind) n++; });
  return n;
}

describe('dailies', () => {
  it('6.0 the date seeds today\'s police order and nothing else: jobs, coins and ramps are the same every day', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const cover = sim.cover!;
      const jobs = JSON.stringify(sim.jobs.defs);
      const coins = JSON.stringify(sim.city!.coinLayout);
      const ramps = JSON.stringify(sim.city!.jumps);
      sim.dailies.setDate('2026-09-23');
      const a = Array.from(cover.daily.order.chokepoints), activeA = Array.from(cover.daily.chokepoints);
      const parkedA = Array.from(cover.daily.parked);
      sim.dailies.setDate('2026-09-24');
      const b = Array.from(cover.daily.order.chokepoints);
      expect(b).not.toEqual(a);
      expect(Array.from(cover.daily.parked)).not.toEqual(parkedA);
      // the same date again: the same order
      sim.dailies.date = '';
      sim.dailies.setDate('2026-09-23');
      expect(Array.from(cover.daily.order.chokepoints)).toEqual(a);
      expect(Array.from(cover.daily.chokepoints)).toEqual(activeA);
      const manned = activeA.reduce((n, v) => n + v, 0);
      expect(manned).toBe(Math.ceil(activeA.length * 0.6));
      expect(JSON.stringify(sim.jobs.defs)).toBe(jobs);
      expect(JSON.stringify(sim.city!.coinLayout)).toBe(coins);
      expect(JSON.stringify(sim.city!.jumps)).toBe(ramps);
    } finally { sim.dispose(); }
  });

  it('6.1 a date draws the same three distinct challenges; two dates differ in at least one', async () => {
    const sim = await createWorld({ map: 'playground' });
    try {
      const d = sim.dailies;
      d.setDate('2026-10-01');
      const first = [...d.ids];
      expect(new Set(first).size).toBe(3);
      for (const id of first) expect(DAILY_TEMPLATES[id]).toBeDefined();
      d.date = '';
      d.setDate('2026-10-01');
      expect([...d.ids]).toEqual(first);
      let differs = 0;
      for (const date of ['2026-10-02', '2026-10-03', '2026-10-04']) {
        d.setDate(date);
        expect(new Set(d.ids).size).toBe(3);
        if (d.ids.some((id, i) => id !== first[i])) differs++;
      }
      expect(differs).toBeGreaterThanOrEqual(1);
      expect(DAILY_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    } finally { sim.dispose(); }
  });

  it('6.2 "3 takedowns in a compact" counts only takedowns made in a compact', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const id = DAILY_TEMPLATES.findIndex((t) => t.kind === 'takedown' && t.car === 'compact');
      slot(sim, id);
      const bank = sim.run.bank;
      sim.events.push('takedown', 0, 0, 0, 0, -1);
      sim.step();
      expect(sim.dailies.progress[0]).toBe(0);
      sim.setCar('compact');
      for (let k = 0; k < 3; k++) {
        sim.events.push('takedownTraffic', 0, 0, 0, 0, -1);
        sim.step();
      }
      expect(sim.dailies.done[0]).toBe(true);
      expect(sim.run.bank - bank).toBe(BALANCE.dailies.rewards[DAILY_TEMPLATES[id]!.weight]);
    } finally { sim.dispose(); }
  });

  it('6.3 "bank 10,000 in one run" completes on a banked run of 10,000 and pays into the bank, not the bag', async () => {
    const sim = await createWorld({ map: 'playground' });
    try {
      const id = DAILY_TEMPLATES.findIndex((t) => t.kind === 'banked' && t.target === 10000);
      slot(sim, id);
      const seq = sim.events.sequence;
      sim.dailies.onRunEnd(9_999, 2, false);
      expect(sim.dailies.done[0]).toBe(false);
      sim.dailies.onRunEnd(20_000, 2, true);
      expect(sim.dailies.done[0]).toBe(false);
      const bank = sim.run.bank, bag = sim.run.bag;
      sim.dailies.onRunEnd(10_000, 2, false);
      expect(sim.dailies.done[0]).toBe(true);
      expect(sim.run.bank - bank).toBe(BALANCE.dailies.rewards[0]);
      expect(sim.run.bag).toBe(bag);
      expect(count(sim, seq, 'dailyDone')).toBe(1);
    } finally { sim.dispose(); }
  });

  it('6.4 / 6.5 the streak: yesterday then today counts up, a gap resets, the same day is nothing, day seven is the topper; its cash once a day', async () => {
    const sim = await createWorld({ map: 'playground' });
    try {
      const d = sim.dailies;
      expect(dayNumber('2026-09-24') - dayNumber('2026-09-23')).toBe(1);
      expect(dayNumber('2026-03-01') - dayNumber('2026-02-28')).toBe(1);
      expect(dayNumber('2025-01-01') - dayNumber('2024-12-31')).toBe(1);
      const bank0 = sim.run.bank;
      d.setDate('2026-09-01');
      expect(d.streak.count).toBe(1);
      expect(sim.run.bank - bank0).toBe(BALANCE.dailies.streak[0]);
      // the same day twice: no count, no cash
      const bank1 = sim.run.bank;
      d.setDate('2026-09-01');
      expect(d.streak.count).toBe(1);
      expect(sim.run.bank).toBe(bank1);
      for (let day = 2; day <= 7; day++) d.setDate(`2026-09-0${day}`);
      expect(d.streak.count).toBe(7);
      expect(d.streak.topper).toBe(true);
      let paid = 0;
      for (let k = 0; k < 7; k++) paid += BALANCE.dailies.streak[k] as number;
      expect(sim.run.bank - bank0).toBe(paid);
      // a gap of a day: back to one; the topper is kept
      d.setDate('2026-09-09');
      expect(d.streak.count).toBe(1);
      expect(d.streak.topper).toBe(true);
    } finally { sim.dispose(); }
  });
});
