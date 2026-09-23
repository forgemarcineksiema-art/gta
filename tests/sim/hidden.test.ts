/**
 * Hidden cars and the toys (M5.5 slice 16, DESIGN.md §8): the ice-cream truck
 * stands at its stash only while the player is near and unfound; a swap into
 * it finds it for good, the garage then drives it out (its class stretched to
 * its body, its own paint) and the save carries both; the giant ball rests in
 * the Works yard and a car sends it rolling.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { GIANT_BALL, HIDDEN_CARS, STASH_SPOTS } from '../../src/sim/city/stash';
import { districtAt } from '../../src/sim/city/City';
import { apply, collect, defaultSave } from '../../src/sim/save/format';
import type { SimWorld } from '../../src/sim';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

function count(sim: SimWorld, kind: string, from: number): number {
  let n = 0;
  sim.events.readFrom(from, (e) => { if (e.kind === kind) n++; });
  return n;
}

describe('hidden cars', () => {
  it('16.1 the truck stands at its stash when the player is near; a swap into it finds it for good', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic;
      const spot = STASH_SPOTS.icecream;
      run(sim, 0.2);
      // the spawn is far from the south edge park: nothing stands there yet
      expect(Math.hypot(sim.probe.x - spot.x, sim.probe.z - spot.z)).toBeGreaterThan(BALANCE.stash.range);
      expect(sim.stash.standing).toBe(false);
      // alongside it, 3.5 m off its left flank, parked the same way
      const lx = Math.cos(spot.yaw), lz = -Math.sin(spot.yaw);
      sim.city?.sync(spot.x, spot.z, true);
      sim.vehicle.teleport({ x: spot.x + lx * 3.5, y: 1, z: spot.z + lz * 3.5 }, spot.yaw);
      run(sim, 1);
      expect(sim.stash.standing).toBe(true);
      const a = sim.stash.agent;
      expect(traffic.bodyOf(a)).toBe('icecream');
      expect(traffic.state[a]).toBe(AgentState.Abandoned);
      expect(Math.hypot((traffic.x[a] as number) - spot.x, (traffic.z[a] as number) - spot.z)).toBeLessThan(0.5);
      expect(sim.life.state.swapCandidate).toBe(a);
      const seq = sim.events.sequence;
      sim.controls.swap = true;
      sim.step();
      run(sim, 2 / 60);
      expect(sim.carBody).toBe('icecream');
      expect(sim.carId).toBe('heavy');
      expect(sim.stash.found.has('icecream')).toBe(true);
      expect(sim.garage.owned.has('icecream')).toBe(true);
      expect(count(sim, 'hiddenCar', seq)).toBe(1);
      expect(sim.pursuit.descriptor.body).toBe('icecream');
      // found for good: away and back, the stash stays empty
      sim.city?.sync(0, 0, true);
      sim.vehicle.teleport({ x: 0, y: 1, z: 0 }, 0);
      run(sim, 0.5);
      sim.city?.sync(spot.x, spot.z, true);
      sim.vehicle.teleport({ x: spot.x + lx * 3.5, y: 1, z: spot.z + lz * 3.5 }, spot.yaw);
      run(sim, 0.5);
      expect(sim.stash.standing).toBe(false);
    } finally { sim.dispose(); }
  }, 60_000);

  it('16.2 once found the garage owns it and drives it out, a class clears it, and the save carries both (M6: an owned body)', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const g = sim.garage;
      expect(g.select('icecream')).toBe(false);
      g.own('icecream');
      expect(g.select('icecream')).toBe(true);
      g.applyToVehicle();
      expect(sim.carBody).toBe('icecream');
      expect(sim.carId).toBe('heavy');
      expect(sim.vehicle.tuning.mass).toBe(2800);
      const doc = defaultSave();
      collect(sim, doc);
      expect(doc.owned).toContain('icecream');
      expect(doc.car).toBe('icecream');
      g.owned.delete('icecream');
      g.car = 'muscle';
      apply(sim, doc);
      expect(g.owned.has('icecream')).toBe(true);
      // owned is found: its stash stays empty
      expect(sim.stash.found.has('icecream')).toBe(true);
      expect(sim.carBody).toBe('icecream');
      // a class on the wall clears it
      expect(g.select('muscle')).toBe(true);
      g.applyToVehicle();
      expect(sim.carBody).toBe('muscle');
    } finally { sim.dispose(); }
  }, 60_000);
});

describe('hidden cars (M6 slice 9)', () => {
  it('M6 9.1 the roadster, the sweeper and the hot-dog van each stand in a quiet bay of their district, away from every job; a swap finds each for good', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic;
      const district = { roadster: 'crown', sweeper: 'foundry', hotdog: 'marina' } as const;
      for (const id of ['roadster', 'sweeper', 'hotdog'] as const) {
        const k = HIDDEN_CARS.indexOf(id);
        const spot = sim.stash.spots[id];
        expect(districtAt(spot.x, spot.z).id, id).toBe(district[id]);
        for (const d of sim.jobs.defs) expect(Math.hypot(d.x - spot.x, d.z - spot.z), `${id} by job ${d.id}`).toBeGreaterThanOrEqual(60);
        // alongside it on whichever side the swap reaches
        let found = false;
        for (const side of [1, -1]) {
          const lx = Math.cos(spot.yaw) * side, lz = -Math.sin(spot.yaw) * side;
          sim.city?.sync(spot.x, spot.z, true);
          sim.vehicle.teleport({ x: spot.x + lx * 3.2, y: 1, z: spot.z + lz * 3.2 }, spot.yaw);
          sim.vehicle.setVelocity(0, 0, 0);
          run(sim, 1);
          const a = sim.stash.agents[k] as number;
          expect(a, id).toBeGreaterThanOrEqual(0);
          expect(traffic.bodyOf(a)).toBe(id);
          expect(Math.hypot((traffic.x[a] as number) - spot.x, (traffic.z[a] as number) - spot.z)).toBeLessThan(0.5);
          if (sim.life.state.swapCandidate !== a) continue;
          sim.controls.swap = true;
          sim.step();
          run(sim, 2 / 60);
          found = true;
          break;
        }
        expect(found, id).toBe(true);
        expect(sim.carBody).toBe(id);
        expect(sim.stash.found.has(id)).toBe(true);
        expect(sim.garage.owned.has(id)).toBe(true);
        // found for good: back to the garage car, away and back, its spot stays empty
        sim.garage.select('muscle');
        sim.garage.applyToVehicle();
        sim.city?.sync(0, 0, true);
        sim.vehicle.teleport({ x: 0, y: 1, z: 0 }, 0);
        run(sim, 0.5);
        sim.city?.sync(spot.x, spot.z, true);
        sim.vehicle.teleport({ x: spot.x + 6, y: 1, z: spot.z }, spot.yaw);
        run(sim, 0.5);
        expect(sim.stash.agents[k]).toBe(-1);
      }
    } finally { sim.dispose(); }
  }, 90_000);
});

describe('toys', () => {
  it('16.3 the giant ball rests in the Works yard and a car at 40 km/h sends it rolling', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const ball = sim.dynamics.find((d) => d.shape.kind === 'ball');
      expect(ball).toBeDefined();
      const slot = ball!.slot;
      const at = (): { x: number; y: number; z: number } => {
        const p = sim.transforms.currPos;
        return { x: p[slot * 3] as number, y: p[slot * 3 + 1] as number, z: p[slot * 3 + 2] as number };
      };
      // 30 m west of it (+X is west), heading at it
      sim.city?.sync(GIANT_BALL.x, GIANT_BALL.z, true);
      sim.vehicle.teleport({ x: GIANT_BALL.x - 30, y: 1, z: GIANT_BALL.z }, Math.PI / 2);
      run(sim, 1, (_t, c) => { c.brake = 1; });
      const rest = at();
      expect(Math.hypot(rest.x - GIANT_BALL.x, rest.z - GIANT_BALL.z)).toBeLessThan(0.5);
      expect(Math.abs(rest.y - GIANT_BALL.radius)).toBeLessThan(0.2);
      let hit = false;
      run(sim, 3, (_t, _c, s) => {
        if (!hit) s.vehicle.setVelocity(40 / 3.6, s.vehicle.telemetry.vy, 0);
        const b = at();
        if (Math.hypot(b.x - rest.x, b.z - rest.z) > 0.3) hit = true;
      });
      const moved = at();
      expect(hit).toBe(true);
      expect(Math.hypot(moved.x - rest.x, moved.z - rest.z)).toBeGreaterThan(3);
    } finally { sim.dispose(); }
  }, 60_000);
});
