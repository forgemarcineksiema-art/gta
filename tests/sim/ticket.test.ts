/**
 * Police extras (M5.5 slice 18): the ticket book. While the busted bar fills
 * an officer walks from the nearest cruiser to the driver's door, paced to
 * arrive as it fills; through the card they write the ticket at the window;
 * once the card closes they walk back and are gone.
 */
import { describe, expect, it } from 'vitest';
import { GARAGE, type DropOff } from '../../src/sim/city/cover';
import { POLICE } from '../../src/sim/police/tuning';
import type { SimWorld } from '../../src/sim';
import { PedLook, PedPose, type Pedestrians } from '../../src/sim/traffic/Pedestrians';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { DONUT_SHOP } from '../../src/sim/police/Donuts';
import { createWorld, run, runUntil } from './helpers';

/** World point at `along` (inward) and `across` (right) in a drop-off's frame. */
function at(site: DropOff, along: number, across: number): { x: number; z: number } {
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
  return { x: site.x + fx * along - fz * across, z: site.z + fz * along + fx * across };
}

describe('the ticket book', () => {
  it('18.1 an officer walks from the nearest cruiser to the driver\'s door as the bar fills, writes through the card, and leaves', async () => {
    const sim: SimWorld = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 20 });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic, peds = sim.peds as Pedestrians;
      const site = sim.run.dropOffs[1] as DropOff;
      const p = at(site, -GARAGE.depth / 2 - 16, 0);
      sim.city?.sync(p.x, p.z, true);
      sim.vehicle.teleport({ x: p.x, y: 0.9, z: p.z }, site.yaw);
      const cruisers: number[] = [];
      for (const across of [3.5, -3.5]) {
        const q = at(site, -GARAGE.depth / 2 - 16, across);
        cruisers.push(traffic.spawnParkedPolice(q.x, q.z, site.yaw, 'police'));
      }
      // the bar starts: the officer gets out of a cruiser, at its flank
      runUntil(sim, 0.5, (s) => s.ticket.ped >= 0);
      expect(sim.run.bustedProgress).toBeGreaterThan(0);
      const o = sim.ticket.ped;
      expect(o).toBeGreaterThanOrEqual(0);
      expect(peds.look[o]).toBe(PedLook.Officer);
      expect(peds.pose[o]).toBe(PedPose.Approach);
      const fromCar = Math.min(...cruisers.map((c) => Math.hypot((peds.x[o] as number) - (traffic.x[c] as number), (peds.z[o] as number) - (traffic.z[c] as number))));
      expect(fromCar).toBeLessThan(traffic.halfWidthOf(cruisers[0] as number) + 0.8);
      // the driver's door: the car's left flank
      const doorX = () => sim.probe.x + Math.cos(sim.probe.yaw) * (sim.probe.halfWidth + 0.55);
      const doorZ = () => sim.probe.z - Math.sin(sim.probe.yaw) * (sim.probe.halfWidth + 0.55);
      let gapAtBust = -1;
      run(sim, POLICE.busted.seconds, (_t, _c, s) => {
        if (gapAtBust < 0 && s.run.state === 'busted') gapAtBust = Math.hypot((peds.x[o] as number) - doorX(), (peds.z[o] as number) - doorZ());
      });
      expect(sim.run.state).toBe('busted');
      expect(gapAtBust).toBeGreaterThanOrEqual(0);
      expect(gapAtBust).toBeLessThan(0.8);
      run(sim, 0.5);
      expect(peds.pose[o]).toBe(PedPose.Ticket);
      expect(Math.hypot((peds.x[o] as number) - doorX(), (peds.z[o] as number) - doorZ())).toBeLessThan(0.1);
      // the card closes: back to the car and gone
      sim.run.closeCard();
      run(sim, 7);
      expect(sim.ticket.ped).toBe(-1);
      expect(peds.active[o]).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);
});

describe('the donut shop', () => {
  it('18.4 two cruisers stand in the shop\'s bays while the player is near, lights off, borrowable; no civilian parks there; gone once the player is far', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic, shop = sim.donuts!;
      const [b0, b1] = shop.bays;
      expect(Math.hypot(b0!.x - DONUT_SHOP.x, b0!.z - DONUT_SHOP.z)).toBeLessThan(12);
      // on the street by the shop
      sim.city?.sync(DONUT_SHOP.laneX, DONUT_SHOP.laneZ, true);
      sim.vehicle.teleport({ x: DONUT_SHOP.laneX + 30, y: 1, z: DONUT_SHOP.laneZ }, -Math.PI / 2);
      run(sim, 2);
      for (const [k, bay] of [[0, b0!], [1, b1!]] as const) {
        const a = shop.cruisers[k] as number;
        expect(a).toBeGreaterThanOrEqual(0);
        expect(traffic.state[a]).toBe(AgentState.Parked);
        expect(traffic.police[a]).toBe(1);
        expect(traffic.lights[a]).toBe(0);
        expect(Math.hypot((traffic.x[a] as number) - bay.x, (traffic.z[a] as number) - bay.z)).toBeLessThan(0.5);
      }
      // no civilian stands in the shop's bays
      for (let i = 0; i < traffic.capacity; i++) {
        if (traffic.parkedCiv[i] !== 1) continue;
        expect(Math.hypot((traffic.x[i] as number) - DONUT_SHOP.x, (traffic.z[i] as number) - DONUT_SHOP.z)).toBeGreaterThan(12);
      }
      // far away: back to the pool
      sim.city?.sync(-450, 450, true);
      sim.vehicle.teleport({ x: -450, y: 1, z: 450 }, 0);
      run(sim, 0.5);
      expect(shop.cruisers[0]).toBe(-1);
      expect(shop.cruisers[1]).toBe(-1);
    } finally { sim.dispose(); }
  }, 60_000);
});
