/**
 * M8.10 slice 18: the switch to the island. A save made on the grid (v6) loads on the island: its bank, its garage and
 * its board carried over, the grid's hunts (its billboards, ramps, caches and trials' medals) started over; the world
 * made with it starts at the hideout.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE, SAVE_VERSION, defaultSave, migrate, serialize } from '../../../src/sim';
import type { Island } from '../../../src/sim/island/Island';
import { createWorld } from '../helpers';

describe('M8.10 slice 18: a grid save on the island', () => {
  it('18.2 a grid save loads at the hideout with its bank, garage and board; the grid\'s hunts start over', async () => {
    const grid: Record<string, unknown> = {
      ...(JSON.parse(serialize(defaultSave())) as Record<string, unknown>), v: 6, seen: true, bank: 123_456, car: 'sports', owned: ['muscle', 'sports', 'taxi'],
      board: { beaten: 0b111 }, smashed: 'AQID', jumps: 'Aw==', medals: '321', caches: { date: '2026-09-25', found: 'Bw==' },
    };
    const save = migrate(grid);
    expect(save.v).toBe(SAVE_VERSION);
    expect(save.bank).toBe(123_456);
    expect(save.car).toBe('sports');
    expect(save.owned).toEqual(['muscle', 'sports', 'taxi']);
    expect(save.board).toEqual({ beaten: 0b111 });
    expect(save.seen).toBe(true);
    expect([save.smashed, save.jumps, save.medals, save.caches.found]).toEqual(['', '', '', '']);
    // the world on the island with it, at the hideout (a profile back on the island starts there): 3 m out of its door,
    // facing the street, on the ground; the bank, the car and the board its own
    const sim = await createWorld({ map: 'island', save, spawn: 'hideout', traffic: 0, peds: 0, record: false });
    try {
      const island = sim.island as Island, hideout = island.garages[0], p = sim.vehicle.body.translation();
      expect(hideout?.name).toBe('hideout');
      if (!hideout) return;
      expect(Math.hypot(p.x - hideout.door.x, p.z - hideout.door.z)).toBeLessThan(4);
      expect(Math.abs(p.y - island.standAt(p.x, p.z))).toBeLessThan(1.5);
      expect(sim.run.bank).toBe(123_456);
      expect(sim.carBody).toBe('sports');
      expect(sim.board.beaten).toBe(0b111);
      // it drives off the apron onto its street
      for (let i = 0; i < 120; i++) { sim.controls.throttle = 1; sim.step(); }
      const q = sim.vehicle.body.translation();
      expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeGreaterThan(5);
      expect(sim.life.state.wrecked).toBe(false);
      expect(BALANCE.save.maxBytes).toBeGreaterThan(serialize(save).length);
    } finally { sim.dispose(); }
  }, 120_000);
});
