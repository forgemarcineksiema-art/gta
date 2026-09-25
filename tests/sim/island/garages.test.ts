/** M8.10 slice 14: the island's three garages, where the run banks (docs/M8.10_PLAN.md). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BALANCE, clearControls, type SimWorld } from '../../../src/sim';
import { GARAGE, toDropOff, type DropOff } from '../../../src/sim/city/cover';
import { inLot } from '../../../src/sim/island/fill';
import type { Island } from '../../../src/sim/island/Island';
import { KERB, ROAD_LIFT } from '../../../src/sim/island/surfaces';
import { createWorld } from '../helpers';

describe('M8.10 slice 14: the garages', () => {
  let sim: SimWorld, island: Island;
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => { sim = await createWorld({ map: 'island', seed: 42, traffic: 0, peds: 0, record: false }); island = sim.island as Island; }, 60_000);
  afterAll(() => sim.dispose());

  it('14.0 the hideout, the scrapyard and the hotel\'s garage: each floor at its street\'s kerb, its lane past its door on the kerb side, no lot in it', () => {
    const sites = sim.run.dropOffs;
    expect(sites.map((s) => s.name)).toEqual(['hideout', 'scrapyard', 'hotel']);
    for (const site of sites) {
      const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
      // the floor's top within a hand of the pavement's in front of the door
      const kx = site.door.x - fx * (site.toKerb - 0.5), kz = site.door.z - fz * (site.toKerb - 0.5);
      const pavement = island.ground.surfaceHeight(kx, kz) + ROAD_LIFT + KERB;
      expect(Math.abs(site.y + GARAGE.floorTop - pavement), `the ${site.name}'s floor`).toBeLessThan(0.1);
      expect(site.toKerb, site.name).toBeGreaterThan(1);
      expect(site.toKerb, site.name).toBeLessThan(12);
      // the lane past the door, the door on its right (the kerb side), and near it
      const lane = sim.traffic?.streets.graph.lanes[site.approachLane];
      expect(lane, site.name).toBeDefined();
      if (!lane) continue;
      let best = Infinity, side = 0;
      for (let k = 0; k + 1 < lane.points.length; k++) {
        const a = lane.points[k] as { x: number; z: number }, b = lane.points[k + 1] as { x: number; z: number };
        const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((site.door.x - a.x) * dx + (site.door.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
        const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(site.door.x - px, site.door.z - pz);
        if (d < best) { best = d; side = (site.door.x - px) * -dz + (site.door.z - pz) * dx; }
      }
      expect(best, `the ${site.name}'s lane`).toBeLessThan(site.toKerb + 12);
      expect(side, `the ${site.name}'s door on its lane's right`).toBeGreaterThan(0);
      // no building on the garage or its apron
      for (const [a, b] of [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
        const x = site.x + fx * (GARAGE.depth / 2) * a - fz * (GARAGE.width / 2) * b, z = site.z + fz * (GARAGE.depth / 2) * a + fx * (GARAGE.width / 2) * b;
        expect(island.fill.lots.some((l) => inLot(l, x, z, 0)), `a lot on the ${site.name}`).toBe(false);
      }
    }
  });

  it('14.0 rolling in off the street at 25 km/h shuts each door and banks the bag', () => {
    for (const site of sim.run.dropOffs) {
      sim.run.maxHeat = 3;
      sim.run.bag = 10_000;
      const bank = sim.run.bank;
      put(site, -GARAGE.depth / 2 - 10);
      const v = 25 / 3.6, local = { along: 0, across: 0 };
      sim.vehicle.setVelocity(Math.sin(site.yaw) * v, 0, Math.cos(site.yaw) * v);
      for (let i = 0; i < 12 * 60 && sim.run.state !== 'door'; i++) {
        toDropOff(site, sim.probe.x, sim.probe.z, local);
        clearControls(sim.controls);
        if (local.along > -6 && sim.vehicle.telemetry.speed > 0.2) sim.controls.brake = 1;
        sim.step();
      }
      expect(sim.run.state, `the ${site.name}'s door`).toBe('door');
      expect(sim.run.bank - bank, `the ${site.name}'s bank`).toBe(Math.round(10_000 * (BALANCE.multiplier[3] as number)));
      sim.run.openDoor();
    }
  });

  /** The car on a garage's axis `along` m from its middle (the door at −depth/2), facing in, stopped. */
  function put(site: DropOff, along: number): void {
    const x = site.x + Math.sin(site.yaw) * along, z = site.z + Math.cos(site.yaw) * along;
    island.sync(x, z, true);
    sim.vehicle.teleport({ x, y: island.ground.surfaceHeight(x, z) + 0.9, z }, site.yaw);
    for (let i = 0; i < 30; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
  }
});
