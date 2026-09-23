/**
 * The car's kit (M6 slice 8, docs/DESIGN.md §14.4): wheels, a spoiler and a
 * stance, bought once and fitted to any car in the garage, one car at a time;
 * the big ones take no spoiler; a car taken on the road shows stock; nothing
 * of it touches the handling; the save keeps each car's fitting; the wheels'
 * styles draw and keep their size.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { KIT, KIT_INDEX, slotItem, slotOption, type CarSlot, type SimWorld } from '../../src/sim';
import { wheelGeometry } from '../../src/render/carMesh';
import { spoilerGeometry } from '../../src/render/kitMesh';
import { CAR_PRESETS } from '../../src/sim/vehicle/presets';
import { apply, collect, defaultSave } from '../../src/sim/save/format';
import { createWorld } from './helpers';

function world(): Promise<SimWorld> {
  return createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
}

describe('the car\'s kit', () => {
  it('M6 8.1 bought once, fitted per car; the vans and buses take no spoiler; a road car shows stock; the handling untouched', async () => {
    const sim = await world();
    try {
      const kit = sim.kit, g = sim.garage;
      const dish = KIT_INDEX['wheelDish'] as number, giant = KIT_INDEX['spoilerGiant'] as number, low = KIT_INDEX['stanceLow'] as number;
      sim.run.bank = 1e6;
      const before = JSON.stringify(sim.vehicle.tuning);
      expect(kit.buy(dish)).toBe('ok');
      expect(kit.buy(giant)).toBe('ok');
      expect(kit.buy(low)).toBe('ok');
      // fitted to the garage car on buying, and worn while it is driven
      expect(kit.fitted('muscle', 'wheels')).toBe(dish);
      g.applyToVehicle();
      expect(kit.worn('wheels')).toBe(dish);
      expect(kit.worn('spoiler')).toBe(giant);
      expect(kit.worn('stance')).toBe(low);
      expect(JSON.stringify(sim.vehicle.tuning)).toBe(before);
      // another car: stock until fitted, and the parts are had already
      g.own('taxi');
      g.select('taxi');
      g.applyToVehicle();
      expect(kit.worn('wheels')).toBe(-1);
      expect(kit.wear(dish)).toBe(true);
      expect(kit.worn('wheels')).toBe(dish);
      // the same part again comes off
      expect(kit.wear(dish)).toBe(true);
      expect(kit.worn('wheels')).toBe(-1);
      // a van or a bus takes no spoiler
      g.own('bus');
      g.select('bus');
      g.applyToVehicle();
      expect(kit.fits(giant, 'bus')).toBe(false);
      expect(kit.wear(giant)).toBe(false);
      expect(kit.fits(giant, 'heavy')).toBe(false);
      // a car taken on the road: stock
      g.select('muscle');
      g.applyToVehicle();
      sim.garageDriven = false;
      expect(kit.worn('wheels')).toBe(-1);
      expect(kit.worn('spoiler')).toBe(-1);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M6 8.2 the save keeps each car\'s fitting; the option numbers round-trip', async () => {
    const sim = await world();
    try {
      for (const id of ['wheelStar', 'wheelWire', 'spoilerLip', 'stanceHigh']) {
        const i = KIT_INDEX[id] as number;
        expect(slotItem(KIT[i]?.slot as CarSlot, slotOption(i)), id).toBe(i);
      }
      sim.run.bank = 1e6;
      sim.kit.buy(KIT_INDEX['wheelWire'] as number);
      sim.kit.buy(KIT_INDEX['stanceHigh'] as number);
      const doc = defaultSave();
      collect(sim, doc);
      expect(doc.carKit.muscle).toEqual([slotOption(KIT_INDEX['wheelWire'] as number), 0, 0, slotOption(KIT_INDEX['stanceHigh'] as number)]);
      sim.garage.carKit.clear();
      apply(sim, doc);
      expect(sim.kit.fitted('muscle', 'wheels')).toBe(KIT_INDEX['wheelWire']);
      expect(sim.kit.fitted('muscle', 'stance')).toBe(KIT_INDEX['stanceHigh']);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M6 8.3 every wheel style draws at the wheel\'s own size; every spoiler builds', () => {
    const t = CAR_PRESETS.muscle;
    for (const style of ['muscle', 'heavy', 'compact', 'star', 'dish', 'wire', 'disc']) {
      const g = wheelGeometry(t, style);
      g.computeBoundingBox();
      const box = g.boundingBox as THREE.Box3;
      expect(box.max.y, style).toBeCloseTo(t.wheelRadius, 2);
      expect(g.getAttribute('position').count / 3, style).toBeLessThan(1500);
      g.dispose();
    }
    for (const kind of ['lip', 'wing', 'giant'] as const) {
      const g = spoilerGeometry(kind, 1.6);
      expect(g.getAttribute('position').count, kind).toBeGreaterThan(0);
      g.dispose();
    }
  });
});
