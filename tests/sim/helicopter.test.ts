/**
 * The helicopter (M5.5 slice 9, docs/M4_PLAN.md §5 C): from heat level 4 an
 * air unit joins a pursuit and takes one of the level's places; its light is
 * its sight, so in the open it holds the chase with no car in sight of the
 * player, and only a covered street's roof or an overpass's deck hides the
 * car from it: under cover the chase goes to the search and the cooldown
 * runs out into an escape.
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { COVER } from '../../src/sim/city/covers';
import { BLOCK, OVERPASS_NODES } from '../../src/sim/city/roads';
import { DISPATCH_AIR } from '../../src/sim/police/Helicopter';
import { POLICE } from '../../src/sim/police/tuning';
import { createWorld, run, runUntil } from './helpers';

/** The player stopped at a point (at a height), the chunks round it loaded. */
function stand(sim: SimWorld, x: number, z: number, yaw: number, y = 0.8): void {
  sim.city?.sync(x, z, true);
  sim.vehicle.teleport({ x, y, z }, yaw);
  sim.vehicle.setVelocity(0, 0, 0);
  run(sim, 0.3, (_t, c) => { c.brake = 1; });
}

function airCalls(sim: SimWorld): number {
  let n = 0;
  sim.events.readFrom(0, (e) => { if (e.kind === 'dispatch' && e.value === DISPATCH_AIR) n++; });
  return n;
}

describe('the helicopter', () => {
  it('9.1 comes at level 4, not before, once, on the radio, and takes one of the level\'s places', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 60 });
    try {
      sim.police!.dispatching = false;
      const c = sim.city!.covers[0]!;
      stand(sim, c.x + (c.axis === 'x' ? COVER.length : 0), c.z + (c.axis === 'z' ? COVER.length : 0), 0);
      sim.pursuit.force(2);
      run(sim, 1);
      expect(sim.heat.level).toBe(3);
      expect(sim.police!.heli.active).toBe(false);
      sim.heat.set(80);
      sim.pursuit.force(2);
      run(sim, 1);
      expect(sim.heat.level).toBe(4);
      expect(sim.police!.heli.active).toBe(true);
      expect(sim.police!.budget).toBe((POLICE.budget[4] as number) - 1);
      run(sim, 3);
      expect(sim.police!.heli.arrivals).toBe(1);
      expect(airCalls(sim)).toBe(1);
    } finally { sim.dispose(); }
  }, 60_000);

  it('9.2 its light holds the chase in the open with no car near; a covered street\'s roof and an overpass\'s deck hide the car', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 80 });
    try {
      sim.police!.dispatching = false;
      const heli = sim.police!.heli;
      const c = sim.city!.covers[0]!;
      // in the open, 90 m past the covered stretch's end on its street
      const along = COVER.length / 2 + 90;
      const open = c.axis === 'x' ? { x: c.x + along, z: c.z - 4 } : { x: c.x - 4, z: c.z + along };
      stand(sim, open.x, open.z, 0);
      sim.pursuit.force(1);
      const seenAt = runUntil(sim, 25, () => heli.sees);
      expect(seenAt).toBeGreaterThan(0);
      // no ground unit anywhere: the light alone holds it
      run(sim, 5);
      expect(sim.police!.count).toBe(0);
      expect(sim.pursuit.state).toBe('active');
      // under the covered street's roof: lost to it, the search begins
      stand(sim, c.x, c.z, 0);
      run(sim, 1);
      expect(heli.sees).toBe(false);
      expect(sim.pursuit.state).toBe('lost');
      // out again into the open near the fix: found again
      stand(sim, open.x, open.z, 0);
      expect(runUntil(sim, 25, () => heli.sees)).toBeGreaterThan(0);
      // under an overpass's deck, on the street it spans
      const [gx, gz] = OVERPASS_NODES[0] as readonly [number, number];
      stand(sim, gx * BLOCK + 4, gz * BLOCK, 0);
      run(sim, 1);
      expect(heli.sees).toBe(false);
      expect(sim.pursuit.state).not.toBe('active');
    } finally { sim.dispose(); }
  }, 60_000);

  it('9.3 escape takes cover first, then the cooldown: hidden under a roof the search runs out', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 80 });
    try {
      sim.police!.dispatching = false;
      const heli = sim.police!.heli;
      const c = sim.city!.covers[1]!;
      const along = COVER.length / 2 + 90;
      const open = c.axis === 'x' ? { x: c.x + along, z: c.z - 4 } : { x: c.x - 4, z: c.z + along };
      stand(sim, open.x, open.z, 0);
      sim.pursuit.force(1);
      expect(runUntil(sim, 25, () => heli.sees)).toBeGreaterThan(0);
      // under the roof: the level's cooldown runs out while the light searches round the entrance
      stand(sim, c.x, c.z, 0);
      const escapes = sim.pursuit.escapes;
      const t = runUntil(sim, (POLICE.escapeSeconds[4] as number) + 5, () => sim.pursuit.state === 'idle');
      expect(t).toBeGreaterThan(0);
      expect(sim.pursuit.escapes).toBe(escapes + 1);
      // the chase is over: the air unit goes home
      run(sim, 0.2);
      expect(heli.active).toBe(false);
    } finally { sim.dispose(); }
  }, 60_000);
});
