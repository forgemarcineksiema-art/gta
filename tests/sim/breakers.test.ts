/**
 * Pursuit breakers (M5.5 slice 18, DESIGN.md §8): eight scaffold towers on the
 * pavements, clear of anything tall and of the billboards; driven through at
 * speed one comes down behind the car across its lane, crushing what stands
 * where it lands (a police car there is the player's takedown, paid into the
 * bag), stands as a barrier for its time, and is gone after; the next run puts
 * it back up.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { BREAKER, BREAKERS, BreakerState, Breakers } from '../../src/sim/city/breakers';
import { tallFootprint } from '../../src/sim/city/collectibles';
import { ROAD_HALF } from '../../src/sim/city/roads';
import type { StaticDesc } from '../../src/sim/scene';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run, runUntil } from './helpers';

describe('pursuit breakers', () => {
  it('18.2 eight towers on the pavements, two a district, clear of anything tall and of the billboards', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const city = sim.city!;
      const statics: StaticDesc[] = [];
      const boards: Array<{ x: number; z: number }> = [];
      for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
        const ch = city.generate(cx, cz);
        statics.push(...ch.statics);
        boards.push(...ch.billboards);
      }
      const districts = new Map<string, number>();
      for (const d of BREAKERS) {
        const key = `${d.x < 0 ? 'w' : 'e'}${d.z < 0 ? 's' : 'n'}`;
        districts.set(key, (districts.get(key) ?? 0) + 1);
        // on the pavement: past the kerb, short of the frontage
        const across = d.nx !== 0 ? Math.abs(d.x - Math.round(d.x / 225) * 225) : Math.abs(d.z - Math.round(d.z / 225) * 225);
        expect(across).toBeGreaterThan(ROAD_HALF + 1);
        expect(across).toBeLessThan(ROAD_HALF + 4.5);
        for (const st of statics) {
          const fp = tallFootprint(st, BREAKER.height);
          if (!fp) continue;
          const gap = Math.max(fp.minX - d.x, d.x - fp.maxX, fp.minZ - d.z, d.z - fp.maxZ);
          expect(gap, `breaker ${d.id}`).toBeGreaterThan(1.5);
        }
        expect(Math.min(...boards.map((b) => Math.hypot(b.x - d.x, b.z - d.z)))).toBeGreaterThan(30);
      }
      expect([...districts.values()]).toEqual([2, 2, 2, 2]);
    } finally { sim.dispose(); }
  }, 60_000);

  it('18.3 driven through at speed one comes down behind the car, crushes a cruiser in its lane for a takedown, and clears after its time', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic, breakers = sim.breakers as Breakers;
      const d = BREAKERS[0]!;
      // along the pavement toward the tower (an x street: heading +X), between the street trees
      sim.city?.sync(d.x, d.z, true);
      sim.vehicle.teleport({ x: d.x - 6, y: 1, z: d.z }, Math.PI / 2);
      run(sim, 0.3, (_t, c) => { c.brake = 1; });
      const seq = sim.events.sequence;
      const t = runUntil(sim, 2, (s) => s.breakers!.state[0] !== BreakerState.Standing, (_t, _c, s) => s.vehicle.setVelocity(14, s.vehicle.telemetry.vy, 0));
      expect(t).toBeGreaterThan(0);
      let fell = 0;
      sim.events.readFrom(seq, (e) => { if (e.kind === 'breaker' && e.target === 0) fell++; });
      expect(fell).toBe(1);
      // a cruiser parked where it will land
      const box = Breakers.barrier(d, { x: 0, z: 0, hx: 0, hz: 0 });
      const cruiser = traffic.spawnParkedPolice(box.x, box.z, 0, 'police');
      const bag = sim.run.bag;
      let takedowns = 0;
      const s2 = sim.events.sequence;
      // the car drives on; the tower lands once it is clear
      expect(runUntil(sim, 3, (s) => s.breakers!.state[0] === BreakerState.Down, (_t, _c, s) => s.vehicle.setVelocity(14, s.vehicle.telemetry.vy, 0))).toBeGreaterThan(0);
      run(sim, 2 / 60);
      sim.events.readFrom(s2, (e) => { if (e.kind === 'takedown' && e.target === cruiser) takedowns++; });
      expect(traffic.state[cruiser]).toBe(AgentState.Wrecked);
      expect(takedowns).toBe(1);
      expect(sim.run.bag - bag).toBe(BALANCE.bag.policeTakedown);
      // a barrier across the lane: a ray along the street through it hits
      const y = BREAKER.fallen.height / 2;
      expect(sim.clearFraction(box.x - 10, y, box.z, box.x + 10, y, box.z)).toBeLessThan(0.6);
      // gone after its time
      run(sim, BREAKER.seconds + 0.2);
      expect(breakers.state[0]).toBe(BreakerState.Cleared);
      expect(sim.clearFraction(box.x - 10, y, box.z, box.x + 10, y, box.z)).toBe(1);
    } finally { sim.dispose(); }
  }, 60_000);
});
