/**
 * The driver's kit (M6 slice 6, docs/DESIGN.md §14.4): bought, won from a
 * rival or the streak, worn per slot and taken off; worn into every car the
 * player drives; the day's pick at half price, the same all day, never one
 * already had; the save keeps it, a slot taken off included.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BALANCE } from '../../src/sim/balance';
import { BARE, KIT, KIT_INDEX, KIT_SLOTS, RIVAL_BODIES, type SimWorld } from '../../src/sim';
import { apply, collect, defaultSave, parse, serialize } from '../../src/sim/save/format';
import { TOPPER_IDS, topperGeometry } from '../../src/render/cars/kitMesh';
import { createWorld } from './helpers';

function world(): Promise<SimWorld> {
  return createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
}

describe('the driver\'s kit', () => {
  it('M6 6.1 bought, worn, taken off; won from a rival or the streak; worn into every car driven', async () => {
    const sim = await world();
    try {
      const kit = sim.kit, duck = KIT_INDEX['duck'] as number, pots = KIT_INDEX['flowerpots'] as number, cone = KIT_INDEX['cone'] as number;
      expect(kit.worn('topper')).toBe(-1);
      // short of cash, then bought: worn at once
      sim.run.bank = 100;
      expect(kit.buy(duck)).toBe('cash');
      sim.run.bank = 10000;
      expect(kit.buy(duck)).toBe('ok');
      expect(sim.run.bank).toBe(10000 - (KIT[duck]?.price as number));
      expect(kit.worn('topper')).toBe(duck);
      expect(kit.buy(duck)).toBe('owned');
      // won only: locked until the rival is beaten, then had for nothing
      expect(kit.buy(pots)).toBe('locked');
      expect(kit.wear(pots)).toBe(false);
      sim.board.win(0);
      expect(kit.has(pots)).toBe(true);
      expect(kit.wear(pots)).toBe(true);
      expect(kit.worn('topper')).toBe(pots);
      // the same item again takes it off
      expect(kit.wear(pots)).toBe(true);
      expect(kit.worn('topper')).toBe(-1);
      // the streak's cone: worn by a slot never chosen, not by one taken off
      sim.dailies.streak.topper = true;
      expect(kit.has(cone)).toBe(true);
      expect(kit.worn('topper')).toBe(-1);
      kit.on[0] = -1;
      expect(kit.worn('topper')).toBe(cone);
      // worn into every car the player drives: the kit is the player's, not the car's
      kit.wear(duck);
      for (const body of ['taxi', 'bus', ...RIVAL_BODIES] as const) {
        sim.garage.own(body);
        sim.garage.select(body);
        sim.garage.applyToVehicle();
        expect(kit.worn('topper'), body).toBe(duck);
      }
    } finally { sim.dispose(); }
  }, 60_000);

  it('M6 6.2 the day\'s pick: one item for sale not had, the same all day, at half price; another day may differ; none without a date', async () => {
    const sim = await world();
    try {
      const kit = sim.kit;
      expect(kit.pick('')).toBe(-1);
      const a = kit.pick('2026-09-23');
      expect(a).toBeGreaterThanOrEqual(0);
      expect(KIT[a]?.price).toBeGreaterThan(0);
      expect(kit.pick('2026-09-23')).toBe(a);
      const days = new Set<number>();
      for (let d = 1; d <= 28; d++) days.add(kit.pick(`2026-10-${String(d).padStart(2, '0')}`));
      expect(days.size).toBeGreaterThan(5);
      sim.dailies.date = '2026-09-23';
      expect(kit.priceOf(a)).toBe(Math.round((KIT[a]?.price as number) * BALANCE.kit.pickShare));
      // bought, the pick moves on to another the player does not have
      sim.run.bank = 1e6;
      expect(kit.buy(a)).toBe('ok');
      const b = kit.pick('2026-09-23');
      expect(b).not.toBe(a);
      expect(kit.has(b)).toBe(false);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M6 6.3 the save keeps the bought and the worn, a slot taken off included', async () => {
    const sim = await world();
    try {
      const kit = sim.kit;
      sim.run.bank = 1e6;
      kit.buy(KIT_INDEX['crown'] as number);
      kit.buy(KIT_INDEX['neonCyan'] as number);
      kit.wear(KIT_INDEX['neonCyan'] as number);
      expect(kit.on[KIT_SLOTS.indexOf('neon')]).toBe(BARE);
      const doc = defaultSave();
      collect(sim, doc);
      const back = parse(serialize(doc));
      expect(back.kit).toEqual(doc.kit);
      kit.owned.fill(0);
      kit.on.fill(-1);
      apply(sim, back);
      expect(kit.has(KIT_INDEX['crown'] as number)).toBe(true);
      expect(kit.worn('topper')).toBe(KIT_INDEX['crown']);
      expect(kit.on[KIT_SLOTS.indexOf('neon')]).toBe(BARE);
      expect(kit.worn('neon')).toBe(-1);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M6 6.4 every topper in the kit is drawn, on the roof, under 300 triangles', () => {
    for (const k of KIT.filter((i) => i.slot === 'topper')) {
      expect(TOPPER_IDS, k.id).toContain(k.id);
      const g = topperGeometry(k.id);
      const tris = g.getAttribute('position').count / 3;
      expect(tris, k.id).toBeLessThan(300);
      g.computeBoundingBox();
      const box = g.boundingBox as THREE.Box3;
      expect(box.min.y, k.id).toBeGreaterThan(-0.02);
      expect(box.max.y, k.id).toBeLessThan(1.1);
      g.dispose();
    }
  });
});
