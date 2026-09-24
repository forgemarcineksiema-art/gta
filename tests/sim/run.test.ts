/**
 * The run (docs/M4_PLAN.md slice 3a): the bag from the event ring, `maxHeat`
 * by the pursuit, the three garages, the door race, busted and the fine.
 * Police dispatch is off in every world here: the boxes are parked cars, so
 * the timings are exact.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { GARAGE, toDropOff, type DropOff } from '../../src/sim/city/cover';
import { POLICE } from '../../src/sim/police/tuning';
import type { SimWorld } from '../../src/sim';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

async function cityWorld(heat = 0): Promise<SimWorld> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat });
  (sim.police as NonNullable<SimWorld['police']>).dispatching = false;
  return sim;
}

/** World point at `along` (inward) and `across` (right) in a drop-off's frame. */
function at(site: DropOff, along: number, across: number): { x: number; z: number } {
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
  return { x: site.x + fx * along - fz * across, z: site.z + fz * along + fx * across };
}

/** The car on the floor at a point of the drop-off frame, nose inward, chunks loaded. */
function placeCar(sim: SimWorld, site: DropOff, along: number, across = 0): void {
  const p = at(site, along, across);
  sim.city?.sync(p.x, p.z, true);
  sim.vehicle.teleport({ x: p.x, y: 0.9, z: p.z }, site.yaw);
}

function parkPolice(sim: SimWorld, site: DropOff, along: number, across: number): number {
  const p = at(site, along, across);
  return (sim.traffic as Traffic).spawnParkedPolice(p.x, p.z, site.yaw, 'police');
}

function count(sim: SimWorld, kind: string, from: number): number {
  let n = 0;
  sim.events.readFrom(from, (e) => { if (e.kind === kind) n++; });
  return n;
}

describe('the run', () => {

  it('3.1 each bag event adds its value once; a camera pays by the km/h over', async () => {
    const sim = await cityWorld();
    const traffic = sim.traffic as Traffic;
    try {
      const b = BALANCE.bag;
      const cop = traffic.spawnParkedPolice(0, 700, 0, 'police');
      const civilian = traffic.spawnAtPoint(10, 700, 0, 'compact', AgentState.Abandoned);
      const cases: Array<[Parameters<typeof sim.events.push>[0], number, number, number]> = [
        ['billboard', 0.25, -1, b.billboard],
        ['camera', 30, -1, b.camera + 30 * b.cameraPerKmh],
        ['takedownTraffic', 0.6, civilian, b.trafficTakedown],
        ['takedown', 0.5, cop, b.policeTakedown],
        ['roadblock', 0, -1, b.roadblock],
        ['escape', 3, -1, 3 * b.escapePerLevel],
        ['jump', 1.5, -1, b.jump + 1.5 * b.jumpPerSecond],
      ];
      for (const [kind, value, target, pays] of cases) {
        const before = sim.run.bag;
        sim.events.push(kind, value, 0, 0, 0, target);
        run(sim, 1 / 60);
        expect(sim.run.bag - before, kind).toBe(pays);
      }
      expect(sim.run.counts).toMatchObject({ takedowns: 2, escapes: 1, billboards: 1 });
    } finally { sim.dispose(); }
  });

  it('3.2 maxHeat follows the highest level at which the pursuit was active, not the stars', async () => {
    const sim = await cityWorld();
    const traffic = sim.traffic as Traffic;
    try {
      const cop = traffic.spawnParkedPolice(0, 700, 0, 'police');
      // heat 60 from unseen crimes: six police takedowns, the pursuit idle
      for (let i = 0; i < 6; i++) sim.events.push('takedown', 0.5, 0, 0, 0, cop);
      sim.heat.step();
      expect(sim.heat.level).toBe(3);
      sim.pursuit.state = 'idle';
      sim.run.step(sim.probe, 1 / 60);
      expect(sim.run.maxHeat).toBe(0);
      expect(sim.run.multiplier).toBe(1);
      sim.pursuit.state = 'active';
      sim.run.step(sim.probe, 1 / 60);
      expect(sim.run.maxHeat).toBe(3);
      expect(sim.run.multiplier).toBe(BALANCE.multiplier[3]);
      // it never falls before the door
      sim.pursuit.state = 'lost';
      sim.run.step(sim.probe, 1 / 60);
      expect(sim.run.maxHeat).toBe(3);
    } finally { sim.dispose(); }
  });

  it('3.3 the door: rolling in under 8 m/s starts it, and 3 s later the bag banks at the multiplier', async () => {
    for (const kmh of [25, 50]) {
      const sim = await cityWorld();
      try {
        const site = sim.run.dropOffs[0]!;
        sim.run.maxHeat = 3;
        sim.run.bag = 10_000;
        placeCar(sim, site, -GARAGE.depth / 2 - 12);
        run(sim, 0.6, (_t, c) => { c.brake = 1; });
        const v = kmh / 3.6;
        sim.vehicle.setVelocity(Math.sin(site.yaw) * v, 0, Math.cos(site.yaw) * v);
        const local = { along: 0, across: 0 };
        let entered = -1, closing = -1, shut = -1;
        const seq = sim.events.sequence;
        for (let i = 0; i < 12 * 60 && shut < 0; i++) {
          toDropOff(site, sim.probe.x, sim.probe.z, local);
          // brake to a stop inside; a brake held at a standstill would engage reverse
          run(sim, 1 / 60, (_t, c, s) => { if (local.along > -6 && s.vehicle.telemetry.speed > 0.2) c.brake = 1; });
          toDropOff(site, sim.probe.x, sim.probe.z, local);
          if (Math.abs(local.along) < site.entry.along && entered < 0) entered = sim.tick;
          if (sim.run.state === 'closing' && closing < 0) {
            closing = sim.tick;
            // never while at or above the entry speed
            expect(sim.probe.speed).toBeLessThan(BALANCE.door.enterSpeed);
          }
          if (sim.run.state === 'door') shut = sim.tick;
        }
        expect(entered).toBeGreaterThan(0);
        if (kmh === 25) expect(closing).toBe(entered);
        else expect(closing).toBeGreaterThan(entered);
        expect(shut).toBeGreaterThan(0);
        expect(Math.abs((shut - closing + 1) / 60 - BALANCE.door.closeSeconds)).toBeLessThan(0.05);
        // the bag at level 3's multiplier (×1.6 until M7 slice 10 fitted ×1.65)
        const banked = Math.round(10_000 * (BALANCE.multiplier[3] as number));
        expect(sim.run.bank).toBe(banked);
        expect(sim.run.lastBanked).toBe(banked);
        expect(sim.run.bag).toBe(0);
        expect(sim.heat.points).toBe(0);
        expect(sim.pursuit.state).toBe('idle');
        expect(count(sim, 'door', seq)).toBe(1);
        expect(count(sim, 'banked', seq)).toBe(1);
      } finally { sim.dispose(); }
    }
  }, 60_000);

  it('3.4 the door race: a tie goes to the police, a clear street to the door, and backing out cancels it', async () => {
    // two units parked beside the car inside the garage: bar and door both reach 1 on step 180
    let sim = await cityWorld(20);
    try {
      const site = sim.run.dropOffs[0]!;
      sim.run.bag = 10_000;
      placeCar(sim, site, 0);
      parkPolice(sim, site, 0, 3.8);
      parkPolice(sim, site, 0, -3.8);
      let steps = 0;
      run(sim, 1 / 60);
      expect(sim.run.state).toBe('closing');
      steps = 1;
      while (sim.run.state === 'closing' && steps < 400) { run(sim, 1 / 60); steps++; }
      expect(sim.run.state).toBe('busted');
      expect(steps).toBe(Math.round(POLICE.busted.seconds * 60));
      expect(sim.run.bank).toBe(5_000);
      expect(sim.run.doorProgress).toBe(0);
      expect(sim.run.doorShut).toBe(false);
    } finally { sim.dispose(); }

    // the same with the units 20 m away in the street: the door wins
    sim = await cityWorld(20);
    try {
      const site = sim.run.dropOffs[0]!;
      placeCar(sim, site, 0);
      parkPolice(sim, site, -20, 3);
      parkPolice(sim, site, -20, -3);
      run(sim, BALANCE.door.closeSeconds + 0.1);
      expect(sim.run.state).toBe('door');
      expect(sim.run.bustedProgress).toBe(0);
    } finally { sim.dispose(); }

    // reversing out over the door line after 1.5 s of closing: the door goes back up, the bag untouched
    sim = await cityWorld();
    try {
      const site = sim.run.dropOffs[0]!;
      sim.run.bag = 7_000;
      placeCar(sim, site, -7.5);
      run(sim, 1.5);
      expect(sim.run.state).toBe('closing');
      run(sim, 4, (_t, c) => { if (sim.run.state === 'closing') c.brake = 1; });
      const local = toDropOff(site, sim.probe.x, sim.probe.z, { along: 0, across: 0 });
      expect(local.along).toBeLessThan(-GARAGE.depth / 2);
      expect(sim.run.state).toBe('running');
      expect(sim.run.doorProgress).toBe(0);
      expect(sim.run.bag).toBe(7_000);
    } finally { sim.dispose(); }
  }, 60_000);

  it('3.5 busted banks half the bag with no multiplier', async () => {
    const sim = await cityWorld(20);
    try {
      const site = sim.run.dropOffs[1]!;
      sim.run.maxHeat = 3;
      sim.run.bag = 10_000;
      // on the street outside the scrapyard, boxed by two cruisers
      placeCar(sim, site, -GARAGE.depth / 2 - 16);
      parkPolice(sim, site, -GARAGE.depth / 2 - 16, 3.5);
      parkPolice(sim, site, -GARAGE.depth / 2 - 16, -3.5);
      const seq = sim.events.sequence;
      run(sim, POLICE.busted.seconds + 0.2);
      expect(sim.run.state).toBe('busted');
      expect(sim.run.lastFine).toBe(5_000);
      expect(sim.run.bank).toBe(5_000);
      expect(sim.run.lastMultiplier).toBe(1);
      expect(sim.run.bag).toBe(0);
      expect(sim.heat.points).toBe(0);
      expect(count(sim, 'busted', seq)).toBe(1);
      // the card closes into a new run where the player stands
      sim.run.closeCard();
      expect(sim.run.state).toBe('running');
      expect(sim.run.maxHeat).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);

  it('3.6 the busted bar: two units and a stopped car fill it in 3 s, driving on drains it, one unit or heat 0 never fills it', async () => {
    const setup = async (heat: number, units: number) => {
      const sim = await cityWorld(heat);
      const site = sim.run.dropOffs[1]!;
      placeCar(sim, site, -GARAGE.depth / 2 - 16);
      for (let u = 0; u < units; u++) parkPolice(sim, site, -GARAGE.depth / 2 - 16, u === 0 ? 3.5 : -3.5);
      return { sim, site };
    };
    let { sim } = await setup(20, 2);
    try {
      let steps = 0;
      while (sim.run.state === 'running' && steps < 400) { run(sim, 1 / 60); steps++; }
      expect(sim.run.state).toBe('busted');
      expect(Math.abs(steps / 60 - POLICE.busted.seconds)).toBeLessThan(0.05);
    } finally { sim.dispose(); }

    ({ sim } = await setup(20, 2));
    try {
      run(sim, 1.5);
      expect(sim.run.bustedProgress).toBeCloseTo(0.5, 2);
      // moving off at 8 km/h (2.2 m/s, over the 1.39 m/s line), nose first between the two
      const heading = sim.run.dropOffs[1]!.yaw;
      run(sim, 0.5, (_t, _c, s) => s.vehicle.setVelocity(Math.sin(heading) * 8 / 3.6, 0, Math.cos(heading) * 8 / 3.6));
      expect(sim.run.bustedProgress).toBeCloseTo(0.5 - 0.5 * POLICE.busted.drainPerSecond, 1);
    } finally { sim.dispose(); }

    for (const [heat, units] of [[20, 1], [0, 2]] as const) {
      ({ sim } = await setup(heat, units));
      try {
        run(sim, 5);
        expect(sim.run.state).toBe('running');
        expect(sim.run.bustedProgress).toBe(0);
      } finally { sim.dispose(); }
    }
  }, 60_000);

  it('3.7 the shut door is solid, and openDoor gives the car back facing the street', async () => {
    const sim = await cityWorld();
    try {
      const site = sim.run.dropOffs[0]!;
      placeCar(sim, site, 0);
      run(sim, BALANCE.door.closeSeconds + 0.1);
      expect(sim.run.state).toBe('door');
      // a ray from inside, beside the car, out through the opening
      const from = at(site, 0, 3.5);
      const dir = { x: -Math.sin(site.yaw), y: 0, z: -Math.cos(site.yaw) };
      const ray = new RAPIER.Ray({ x: from.x, y: 1.5, z: from.z }, dir);
      const hit = sim.world.castRay(ray, 12, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
      expect(hit).not.toBeNull();
      expect(hit!.timeOfImpact).toBeCloseTo(GARAGE.depth / 2 - GARAGE.doorThickness / 2, 1);
      sim.run.openDoor();
      expect(sim.run.state).toBe('running');
      expect(sim.run.runs).toBe(1);
      expect(sim.run.firstDoor).toBe(false);
      run(sim, 1 / 60);
      expect(sim.world.castRay(ray, 12, true, RAPIER.QueryFilterFlags.ONLY_FIXED)).toBeNull();
      const before = at(site, 2, 0);
      run(sim, 1, (_t, c) => { c.throttle = 1; });
      const local = toDropOff(site, sim.probe.x, sim.probe.z, { along: 0, across: 0 });
      // nose to the street: a second of throttle takes it toward the door
      expect(Math.hypot(sim.probe.x - before.x, sim.probe.z - before.z)).toBeGreaterThan(1);
      expect(local.along).toBeLessThan(2);
      expect(sim.run.state).toBe('running');
    } finally { sim.dispose(); }
  }, 60_000);
});
