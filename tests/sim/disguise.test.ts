/**
 * Every police car is a disguise (M8.8 slice 1; DESIGN.md §2.5, "a police-liveried car"): a borrowed interceptor or
 * police van hides the player as the patrol car does, until the dispatcher's clock, and keeps its colours; the police's
 * own bodies disguise at the drive-out, the Fake Cruiser does not (the units know Frank's car).
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { POLICE } from '../../src/sim/police/tuning';
import type { Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run, runUntil } from './helpers';

/** A parked unit of the class 3.5 m to the right, taken; returns the paint it had. */
function borrow(sim: SimWorld, kind: 'police' | 'sports' | 'heavy'): number {
  const traffic = sim.traffic as Traffic;
  const p = sim.vehicle.body.translation();
  const yaw = sim.probe.yaw || 0;
  const agent = traffic.spawnParkedPolice(p.x - Math.cos(yaw) * 3.5, p.z + Math.sin(yaw) * 3.5, yaw, kind);
  run(sim, 0.3);
  expect(sim.life.state.swapCandidate).toBe(agent);
  const paint = traffic.paint[agent] as number;
  run(sim, 1 / 60, (_t, c) => { c.swap = true; });
  expect(sim.carId).toBe(kind);
  return paint;
}

describe('M8.8 slice 1: every police car is a disguise', () => {
  for (const [pin, kind, name] of [['1.1', 'sports', 'interceptor'], ['1.2', 'heavy', 'police van']] as const) {
    it(`M8.8 ${pin} a borrowed ${name} is disguised until the dispatcher's clock, in its own colours (1.3)`, async () => {
      const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
      try {
        sim.police!.dispatching = false;
        run(sim, 0.6);
        const paint = borrow(sim, kind);
        expect(sim.pursuit.disguised).toBe(true);
        expect(sim.carPaint).toBe(paint);
        expect(sim.pursuit.descriptor.paint).toBe(paint);
        // the dispatcher notices a missing unit, whatever its class
        expect(runUntil(sim, POLICE.disguise.seconds + 1, (s) => s.pursuit.blown)).toBeGreaterThan(POLICE.disguise.seconds - 1);
        expect(sim.pursuit.disguised).toBe(false);
      } finally { sim.dispose(); }
    }, 60_000);
  }

  it('M8.8 1.4 a drive-out in the police car or the Chief\'s Cruiser is disguised, in the Fake Cruiser it is not', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      for (const [body, disguised] of [['police', true], ['chiefcar', true], ['fakecop', false]] as const) {
        sim.garage.own(body);
        sim.garage.select(body);
        sim.garage.applyToVehicle();
        expect(sim.carBody).toBe(body);
        expect(sim.pursuit.disguised).toBe(disguised);
      }
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 6.3 nobody reports the Chief\'s Cruiser missing: its disguise holds past the dispatcher\'s clock and blows on a seen crime', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      sim.garage.own('chiefcar');
      sim.garage.select('chiefcar');
      sim.garage.applyToVehicle();
      run(sim, POLICE.disguise.seconds + 5);
      expect(sim.pursuit.blown).toBe(false);
      expect(sim.pursuit.disguised).toBe(true);
      // what the police do with a crime a unit saw (identity 5.4 pins the sight)
      sim.pursuit.markBlown(sim.probe.x, sim.probe.z);
      expect(sim.pursuit.disguised).toBe(false);
    } finally { sim.dispose(); }
  }, 60_000);
});
