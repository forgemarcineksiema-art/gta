/**
 * The garage (docs/M5_PLAN.md slice 4): buying from the bank, the police
 * car's lock, tier 0 equal to the preset and tier 3's multipliers, the
 * drive-out's retune in place, the respray on the descriptor, and the prep
 * items at the run's end.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { CAR_PRESETS, PALETTE, type SimWorld } from '../../src/sim';
import type { Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, fullThrottle, kmh, run, runUntil } from './helpers';

function count(sim: SimWorld, from: number, kind: string): number {
  let n = 0;
  sim.events.readFrom(from, (e) => { if (e.kind === kind) n++; });
  return n;
}

/** 0–100 km/h from a standstill on the playground straight, as cars.test.ts measures it. */
async function to100(tiers: [number, number, number]): Promise<number> {
  const sim = await createWorld({ spawn: 'straight', car: 'compact' });
  try {
    sim.garage.owned.add('compact');
    sim.garage.select('compact');
    sim.garage.tiers.compact[0] = tiers[0];
    sim.garage.tiers.compact[1] = tiers[1];
    sim.garage.tiers.compact[2] = tiers[2];
    sim.garage.applyToVehicle();
    run(sim, 1);
    return runUntil(sim, 25, (s) => kmh(s) >= 100, fullThrottle);
  } finally { sim.dispose(); }
}

describe('garage', () => {
  it('4.1 buy: ok takes the price and pushes purchase; short of cash changes nothing; the police car is locked; owned is owned', async () => {
    const sim = await createWorld({ map: 'playground' });
    try {
      const g = sim.garage;
      sim.run.bank = 12_000;
      const seq = sim.events.sequence;
      expect(g.buy('compact')).toBe('ok');
      expect(sim.run.bank).toBe(2_000);
      expect(g.owned.has('compact')).toBe(true);
      expect(count(sim, seq, 'purchase')).toBe(1);
      expect(g.buy('heavy')).toBe('cash');
      expect(sim.run.bank).toBe(2_000);
      expect(g.owned.has('heavy')).toBe(false);
      sim.run.bank = 1_000_000;
      expect(g.buy('police')).toBe('locked');
      expect(g.owned.has('police')).toBe(false);
      g.policeUnlocked = true;
      expect(g.buy('police')).toBe('ok');
      expect(sim.run.bank).toBe(1_000_000 - BALANCE.prices.police);
      expect(g.buy('compact')).toBe('owned');
      expect(g.buy('muscle')).toBe('owned');
      expect(count(sim, seq, 'purchase')).toBe(2);
      // select takes owned cars only
      expect(g.select('sports')).toBe(false);
      expect(g.select('police')).toBe(true);
      expect(g.car).toBe('police');
    } finally { sim.dispose(); }
  });

  it('4.2 tuningFor: tier 0 is the preset; tier 3 multiplies torque, grip and the boost drain and nothing else', async () => {
    const sim = await createWorld({ map: 'playground' });
    try {
      const g = sim.garage;
      for (const car of ['muscle', 'compact', 'heavy', 'sports', 'police'] as const) {
        expect(g.tuningFor(car)).toEqual(CAR_PRESETS[car]);
        g.tiers[car][0] = 3; g.tiers[car][1] = 3; g.tiers[car][2] = 3;
        const t = g.tuningFor(car);
        const p = CAR_PRESETS[car];
        expect(t.torqueMax).toBeCloseTo(p.torqueMax * 1.2, 9);
        expect(t.muFront).toBeCloseTo(p.muFront * 1.12, 9);
        expect(t.muRear).toBeCloseTo(p.muRear * 1.12, 9);
        expect(t.boostDrain).toBeCloseTo(p.boostDrain * 0.7, 9);
        expect({ ...t, torqueMax: p.torqueMax, muFront: p.muFront, muRear: p.muRear, boostDrain: p.boostDrain }).toEqual(p);
        g.tiers[car][0] = 0; g.tiers[car][1] = 0; g.tiers[car][2] = 0;
      }
    } finally { sim.dispose(); }
  });

  it('4.3 applyToVehicle: the class, its mass, the pose and the speed kept, no damage', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      run(sim, 1, (_t, c) => { c.throttle = 1; });
      sim.life.setDamage(0.6);
      const p0 = sim.vehicle.body.translation(), v0 = sim.vehicle.body.linvel();
      const before = { x: p0.x, z: p0.z, vx: v0.x, vz: v0.z };
      sim.garage.owned.add('heavy');
      sim.garage.select('heavy');
      sim.garage.applyToVehicle();
      expect(sim.carId).toBe('heavy');
      expect(sim.vehicle.tuning.mass).toBe(CAR_PRESETS.heavy.mass);
      expect(sim.life.state.damage).toBe(0);
      expect(sim.life.state.stage).toBe(0);
      const p1 = sim.vehicle.body.translation(), v1 = sim.vehicle.body.linvel();
      expect(Math.hypot(p1.x - before.x, p1.z - before.z)).toBeLessThan(0.01);
      expect(Math.hypot(v1.x - before.vx, v1.z - before.vz)).toBeLessThan(0.01);
      expect(sim.pursuit.descriptor.kind).toBe('heavy');
    } finally { sim.dispose(); }
  });

  it('4.4 the compact at tier 3 power reaches 100 km/h sooner; at tier 0 it is inside cars.test.ts\'s band', async () => {
    const t0 = await to100([0, 0, 0]);
    const t3 = await to100([3, 0, 0]);
    expect(t0).toBeGreaterThan(8.5);
    expect(t0).toBeLessThan(13);
    expect(t3).toBeGreaterThan(0);
    expect(t3).toBeLessThan(t0);
    console.info(`compact 0-100: tier 0 ${t0.toFixed(2)} s, tier 3 power ${t3.toFixed(2)} s`);
  }, 60_000);

  it('4.5 a respray changes the paint and, driven out, the police\'s descriptor', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const g = sim.garage;
      expect(g.paintOf('muscle')).toBe(PALETTE.carRed);
      g.respray('muscle', PALETTE.carLime);
      expect(g.paint.get('muscle')).toBe(PALETTE.carLime);
      g.applyToVehicle();
      expect(sim.pursuit.descriptor.paint).toBe(PALETTE.carLime);
    } finally { sim.dispose(); }
  });

  it('4.6 the lawyer keeps three quarters of a busted bag; the fence adds half to the door\'s multiplier; both are spent', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 20 });
    try {
      sim.police!.dispatching = false;
      const g = sim.garage;
      // busted with the lawyer
      g.prep.lawyer = true;
      g.prep.fence = true;
      sim.run.bag = 10_000;
      run(sim, 0.1);
      const p = sim.probe;
      const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
      (sim.traffic as Traffic).spawnParkedPolice(p.x + rx * 3.5, p.z + rz * 3.5, p.yaw, 'police');
      (sim.traffic as Traffic).spawnParkedPolice(p.x - rx * 3.5, p.z - rz * 3.5, p.yaw, 'police');
      expect(runUntil(sim, 4, (s) => s.run.state === 'busted')).toBeGreaterThan(0);
      expect(sim.run.lastFine).toBe(7_500);
      expect(g.prep.lawyer).toBe(false);
      expect(g.prep.fence).toBe(false);
      sim.run.closeCard();
      // banked with the fence at heat 2: ×1.25 + 0.5
      const site = sim.run.dropOffs[0]!;
      const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
      g.prep.fence = true;
      sim.run.bag = 10_000;
      sim.run.maxHeat = 2;
      const bank = sim.run.bank;
      sim.city?.sync(site.x - fx * 40, site.z - fz * 40, true);
      sim.vehicle.teleport({ x: site.x - fx * 40, y: 0.9, z: site.z - fz * 40 }, site.yaw);
      run(sim, 0.1);
      sim.vehicle.teleport({ x: site.x - fx * 2, y: 0.9, z: site.z - fz * 2 }, site.yaw);
      expect(runUntil(sim, 5, (s) => s.run.state === 'door')).toBeGreaterThan(0);
      expect(sim.run.lastMultiplier).toBeCloseTo((BALANCE.multiplier[2] as number) + BALANCE.prep.fenceBonus, 9);
      expect(sim.run.bank - bank).toBe(Math.round(10_000 * ((BALANCE.multiplier[2] as number) + BALANCE.prep.fenceBonus)));
      expect(g.prep.fence).toBe(false);
    } finally { sim.dispose(); }
  });
});
