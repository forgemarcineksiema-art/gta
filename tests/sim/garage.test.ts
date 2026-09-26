/**
 * The garage (docs/history/M5_PLAN.md slice 4): buying from the bank, the police
 * car's lock, tier 0 equal to the preset and tier 3's multipliers, the
 * drive-out's retune in place, the respray on the descriptor, and the prep
 * items at the run's end.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { CAR_PRESETS, PALETTE, bodyTuning, type SimWorld } from '../../src/sim';
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
      sim.run.bank = BALANCE.prices.compact + 2_000;
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
    expect(t0).toBeGreaterThan(5.6);
    expect(t0).toBeLessThan(6.5);
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

  it('6.1 bring it home, pay to keep it: the car driven in is on the wall as hot, kept for 30 % in its own paint, the police car at 60 % and only after its escape', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    (sim.police as NonNullable<SimWorld['police']>).dispatching = false;
    try {
      const g = sim.garage;
      const site = sim.run.dropOffs[0]!;
      // in a sports car nobody bought, stopped inside the hideout: the door shuts behind it
      sim.setCar('sports');
      sim.pursuit.descriptor.paint = PALETTE.carMagenta;
      sim.city?.sync(site.x, site.z, true);
      sim.vehicle.teleport({ x: site.x, y: 0.9, z: site.z }, site.yaw);
      expect(runUntil(sim, 6, (s) => s.run.state === 'door')).toBeGreaterThan(0);
      expect(sim.run.hot).toBe('sports');
      expect(sim.run.hotPaint).toBe(PALETTE.carMagenta);
      const price = Math.round(BALANCE.prices.sports * BALANCE.keep.share);
      expect(g.keepPrice('sports')).toBe(price);
      sim.run.bank = price - 1;
      expect(g.keep('sports', sim.run.hotPaint)).toBe('cash');
      expect(g.owned.has('sports')).toBe(false);
      sim.run.bank = price + 500;
      expect(g.keep('sports', sim.run.hotPaint)).toBe('ok');
      expect(g.owned.has('sports')).toBe(true);
      expect(g.car).toBe('sports');
      expect(g.paintOf('sports')).toBe(PALETTE.carMagenta);
      expect(sim.run.bank).toBe(500);
      expect(g.keep('sports', sim.run.hotPaint)).toBe('owned');
      // the police car: locked until one escape from heat 5, then 60 %
      expect(g.keep('police', PALETTE.policeWhite)).toBe('locked');
      g.policeUnlocked = true;
      expect(g.keepPrice('police')).toBe(Math.round(BALANCE.prices.police * BALANCE.keep.police));
      // the door opens: nothing is hot any more
      sim.run.openDoor();
      expect(sim.run.hot).toBe(null);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M6 0.1 the garage keeps bodies: a taxi driven home is kept at 30 % of its own price and drives out as the taxi on its class with the class\'s tiers', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    (sim.police as NonNullable<SimWorld['police']>).dispatching = false;
    try {
      const g = sim.garage;
      const site = sim.run.dropOffs[0]!;
      // in a yellow taxi taken from traffic (the swap's state, set by hand), stopped inside the hideout
      sim.carBody = 'taxi';
      sim.carId = 'muscle';
      sim.carPaint = PALETTE.coin;
      sim.pursuit.descriptor.body = 'taxi';
      sim.pursuit.descriptor.kind = 'muscle';
      sim.pursuit.descriptor.paint = PALETTE.coin;
      sim.vehicle.tuning = bodyTuning('taxi');
      sim.vehicle.applyTuning();
      sim.city?.sync(site.x, site.z, true);
      sim.vehicle.teleport({ x: site.x, y: 0.9, z: site.z }, site.yaw);
      expect(runUntil(sim, 6, (s) => s.run.state === 'door')).toBeGreaterThan(0);
      expect(sim.run.hot).toBe('taxi');
      expect(sim.run.hotPaint).toBe(PALETTE.coin);
      expect(g.canBuy('taxi')).toBe('locked');
      const price = Math.round(BALANCE.bodyPrices.taxi * BALANCE.keep.share);
      expect(g.keepPrice('taxi')).toBe(price);
      sim.run.bank = price;
      expect(g.keep('taxi', sim.run.hotPaint)).toBe('ok');
      expect(g.owned.has('taxi')).toBe(true);
      expect(g.car).toBe('taxi');
      expect(g.paintOf('taxi')).toBe(PALETTE.coin);
      // the muscle class's tier 2 power drives the taxi too (the taxi rides on the muscle class)
      g.tiers.muscle[0] = 2;
      g.applyToVehicle();
      expect(sim.carBody).toBe('taxi');
      expect(sim.carId).toBe('muscle');
      expect(sim.carPaint).toBe(PALETTE.coin);
      expect(sim.pursuit.descriptor.body).toBe('taxi');
      const base = bodyTuning('taxi');
      expect(sim.vehicle.tuning.chassisHalfExtents.z).toBe(base.chassisHalfExtents.z);
      expect(sim.vehicle.tuning.torqueMax).toBe(base.torqueMax * (BALANCE.tiers.power[2] as number));
      // a shell at tier 0 is still its preset bitwise
      g.tiers.muscle[0] = 0;
      expect(g.tuningFor('muscle')).toEqual(CAR_PRESETS.muscle);
      // the class's card clears it
      expect(g.select('muscle')).toBe(true);
      g.applyToVehicle();
      expect(sim.carBody).toBe('muscle');
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 16.3 the motorbike is bought at 36,000 and drives out on two wheels', async () => {
    const sim = await createWorld({ map: 'playground' });
    try {
      const g = sim.garage;
      expect(g.price('moto')).toBe(36_000);
      sim.run.bank = 35_999;
      expect(g.buy('moto')).toBe('cash');
      sim.run.bank = 36_000;
      expect(g.buy('moto')).toBe('ok');
      expect(sim.run.bank).toBe(0);
      expect(g.select('moto')).toBe(true);
      g.applyToVehicle();
      expect(sim.carId).toBe('moto');
      expect(sim.vehicle.tuning.twoWheel).toBe(1);
    } finally { sim.dispose(); }
  });
});
