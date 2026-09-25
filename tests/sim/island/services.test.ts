/** M8.10 slice 16: the drive-throughs: fuel, repair, paint (docs/M8.10_PLAN.md). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearControls, type SimWorld } from '../../../src/sim';
import { inLot, reserved } from '../../../src/sim/island/fill';
import type { Island } from '../../../src/sim/island/Island';
import { FUEL_AGAIN, REPAIR_TIME, type ServiceSite } from '../../../src/sim/island/services';
import { PAVEMENT } from '../../../src/sim/island/surfaces';
import type { Traffic } from '../../../src/sim/traffic/Traffic';
import { createWorld } from '../helpers';

describe('M8.10 slice 16: the drive-throughs', () => {
  let sim: SimWorld, island: Island;
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => { sim = await createWorld({ map: 'island', seed: 42, traffic: 0, peds: 0, record: false }); island = sim.island as Island; }, 60_000);
  afterAll(() => sim.dispose());

  /** The car put at `along` m on a site's bay's axis (its entrance −half), facing along it, then `steps` steps. */
  const put = (site: ServiceSite, along: number, steps = 1): void => {
    const x = site.x + Math.sin(site.yaw) * along, z = site.z + Math.cos(site.yaw) * along;
    island.sync(x, z, true);
    sim.vehicle.teleport({ x, y: site.y + 0.8, z }, site.yaw);
    for (let i = 0; i < steps; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
  };
  const site = (kind: ServiceSite['kind']): ServiceSite => island.services.find((s) => s.kind === kind) as ServiceSite;

  it('16.0 three fuel stations, two repair shops, two paint shops, each beside its road, clear of every road, lot and place', () => {
    const count = (k: string): number => island.services.filter((s) => s.kind === k).length;
    expect([count('fuel'), count('repair'), count('paint')]).toEqual([3, 2, 2]);
    const near = { x: 0, y: 0, z: 0, yaw: 0 };
    for (const s of island.services) {
      const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), rx = -fz, rz = fx;
      // its floor, the bay and its sides, on land, off every road's pavement, every lot and the places
      for (const a of [-1, -0.5, 0, 0.5, 1]) for (const b of [-1, 0, 1]) {
        const x = s.x + fx * a * s.half + rx * b * (s.bay + 2), z = s.z + fz * a * s.half + rz * b * (s.bay + 2);
        const at = `a ${s.kind}'s floor at ${x.toFixed(0)}, ${z.toFixed(0)}`;
        expect(island.ground.onLand(x, z), at).toBe(true);
        expect(island.ground.nearOtherRoad(x, z, -1, PAVEMENT), at).toBe(false);
        expect(island.fill.lots.some((l) => inLot(l, x, z, 1)), at).toBe(false);
        expect(reserved(x, z), at).toBe(false);
      }
      // beside its road: the nearest road within 40 m, along the bay, at its floor's height give or take a kerb
      const d = island.ground.nearestRoad(s.x, s.z, near);
      expect(d, `a ${s.kind} at ${s.x.toFixed(0)}, ${s.z.toFixed(0)}`).toBeLessThan(40);
      expect(Math.abs(Math.cos(near.yaw - s.yaw))).toBeGreaterThan(0.9);
      expect(Math.abs(near.y - s.y)).toBeLessThan(1.5);
    }
  });

  it('16.1 the boost is full after a pass, and not again within the minute', () => {
    const fuel = site('fuel');
    sim.vehicle.boostMeter = 0.2;
    put(fuel, 0, 2);
    expect(sim.vehicle.boostMeter).toBeGreaterThan(0.99);
    put(fuel, -fuel.half - 30, 5);
    sim.vehicle.boostMeter = 0.2;
    put(fuel, 0, 2);
    expect(sim.vehicle.boostMeter).toBeLessThan(0.3);
    // after the minute, again
    put(fuel, -fuel.half - 30, 60 * FUEL_AGAIN + 5);
    sim.vehicle.boostMeter = 0.2;
    put(fuel, 0, 2);
    expect(sim.vehicle.boostMeter).toBeGreaterThan(0.99);
  });

  it('16.2 the damage is none after a repair', () => {
    const repair = site('repair');
    sim.life.state.damage = 0.6;
    put(repair, 0, Math.ceil(60 * (REPAIR_TIME + 0.3)));
    expect(sim.life.state.damage).toBe(0);
  });

  it('16.3 a paint shop out of every unit\'s sight ends the pursuit; in sight it does not', () => {
    const paint = site('paint'), police = sim.police;
    expect(police).not.toBeNull();
    if (!police) return;
    police.dispatching = false;
    // wanted: at heat 0 no chase lasts a step
    sim.heat.set(20);
    expect(sim.heat.level).toBeGreaterThan(0);
    // out of sight: a chase on, no unit near; the paint shop loses it, an escape by a swap
    put(paint, -paint.half - 30, 5);
    sim.pursuit.force();
    const before = sim.carPaint, escapes = sim.pursuit.swapEscapes;
    put(paint, -paint.half + 1, 1);
    expect(sim.carPaint).not.toBe(before);
    expect(sim.pursuit.state).toBe('idle');
    expect(sim.pursuit.swapEscapes).toBe(escapes + 1);
    // in sight: a unit on the road behind, watching the car go in through the bay's open end
    const traffic = sim.traffic as Traffic, lanes = traffic.lanes;
    const ex = paint.x - Math.sin(paint.yaw) * (paint.half + 2), ez = paint.z - Math.cos(paint.yaw) * (paint.half + 2);
    let lane = -1, s = 0, best = Infinity;
    const proj = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
    for (let l = 0; l < lanes.laneCount; l++) {
      lanes.project(l, ex, ez, proj);
      const along = Math.cos(proj.yaw - paint.yaw);
      if (proj.dist < best && along > 0.9) { best = proj.dist; lane = l; s = proj.s; }
    }
    expect(lane).toBeGreaterThanOrEqual(0);
    put(paint, -paint.half - 8, 3);
    // far enough back that the car is well inside its view ahead
    const unit = traffic.spawnPoliceAt(lane, Math.max(2, s - 45), 'police', sim.probe, 0, -1, 4, -1, true);
    police.enlist(unit);
    sim.pursuit.force();
    for (let i = 0; i < 20; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.pursuit.force(); sim.step(); }
    expect(unit).toBeGreaterThanOrEqual(0);
    expect(police.crimeSeen()).toBe(true);
    put(paint, -paint.half + 1, 1);
    expect(sim.pursuit.state).not.toBe('idle');
    expect(sim.pursuit.swapEscapes).toBe(escapes + 1);
  });
});
