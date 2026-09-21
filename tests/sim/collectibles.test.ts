/**
 * Billboards (docs/M3_PLAN.md slice 8): exactly fifty, stable from the seed,
 * clear of everything taller than a metre with ten metres of run-out either
 * side, off the carriageways and near a road; a pass at speed smashes one
 * once, pays boost and costs a little speed.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { initPhysics } from '../../src/sim';
import { City, chunkCoord, type CityChunk } from '../../src/sim/city/City';
import { distanceToPolyline } from '../../src/sim/city/roads';
import { BILLBOARD_TOTAL, CAR_TOP, PANEL_TOP, panelFootprint, runOutFootprint, tallFootprint, type BillboardDesc } from '../../src/sim/city/collectibles';
import { ECONOMY } from '../../src/sim/economy';
import { createWorld, kmh, run } from './helpers';

beforeAll(initPhysics);

function allChunks(city: City): CityChunk[] {
  const out: CityChunk[] = [];
  for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) out.push(city.generate(cx, cz));
  return out;
}

describe('billboards', () => {
  it('are exactly fifty, unique and stable, for three seeds', () => {
    for (const seed of [42, 7, 123]) {
      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      const city = new City(world, seed);
      try {
        const boards = allChunks(city).flatMap((c) => c.billboards);
        expect(boards).toHaveLength(BILLBOARD_TOTAL);
        expect(new Set(boards.map((b) => b.id)).size).toBe(BILLBOARD_TOTAL);
        expect(JSON.stringify(city.generate(-3, -3).billboards)).toBe(JSON.stringify(city.generate(-3, -3).billboards));
      } finally { world.free(); }
    }
  });

  it('stand clear of anything taller than a metre with a run-out either side, off the carriageways and near a road', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const city = new City(world, 42);
    try {
      for (const chunk of allChunks(city)) {
        for (const b of chunk.billboards) {
          // the panel's own footprint clear up to its top; ten metres of run-out either side clear up to car height
          const box = panelFootprint(b);
          const sweep = runOutFootprint(b);
          const overlaps = (a: typeof box, c: typeof box): boolean => a.minX < c.maxX && a.maxX > c.minX && a.minZ < c.maxZ && a.maxZ > c.minZ;
          for (const st of chunk.statics) {
            const where = `billboard ${b.id} in chunk ${chunk.key} meets a ${st.shape.kind} tagged ${st.tag ?? '?'} at ${st.position.x.toFixed(0)},${st.position.z.toFixed(0)}`;
            const tall = tallFootprint(st, PANEL_TOP);
            expect(tall !== null && overlaps(box, tall), where).toBe(false);
            const low = tallFootprint(st, CAR_TOP);
            expect(low !== null && overlaps(sweep, low), `${where} in the run-out`).toBe(false);
          }
          for (const road of city.graph.special) {
            expect(distanceToPolyline(road.centre, b.x, b.z) - road.halfWidth).toBeGreaterThanOrEqual(6.5);
          }
          // off every grid carriageway: streets run along the chunk centre lines at multiples of 225 m
          const offStreetX = Math.abs(b.x - Math.round(b.x / 225) * 225);
          const offStreetZ = Math.abs(b.z - Math.round(b.z / 225) * 225);
          const halfX = Math.abs(Math.round(b.x / 225)) === 3 ? 19 : 12;
          const halfZ = Math.abs(Math.round(b.z / 225)) === 3 ? 19 : 12;
          expect(offStreetX >= halfX + 0.5 || offStreetZ >= halfZ + 0.5).toBe(true);
          const near = city.nearestRoad(b.x, b.z, { name: 'n', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
          expect(Math.hypot(near.position.x - b.x, near.position.z - b.z), `billboard ${b.id} in chunk ${chunk.key} at ${b.x.toFixed(0)},${b.z.toFixed(0)} is far from a lane`).toBeLessThan(25);
        }
      }
    } finally { world.free(); }
  });

  it('smash at speed once, pay boost and cost a little speed; not at a crawl', async () => {
    const drive = async (speedKmh: number) => {
      const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
      const city = sim.city as City;
      const p = sim.vehicle.body.translation();
      const chunk = city.chunk(chunkCoord(p.x), chunkCoord(p.z));
      const board = chunk.billboards[0] as BillboardDesc;
      // approach along the panel's normal, 15 m out
      const nx = Math.sin(board.yaw), nz = Math.cos(board.yaw);
      const yaw = Math.atan2(-nx, -nz);
      sim.vehicle.teleport({ x: board.x + nx * 15, y: 1, z: board.z + nz * 15 }, yaw);
      run(sim, 0.5);
      let paid = 0;
      let smashedAt = -1;
      let speedBefore = 0;
      let speedAfter = 0;
      let events = 0;
      let seq = 0;
      for (let i = 0; i < 3 * 60; i++) {
        const v = speedKmh / 3.6;
        if (smashedAt < 0) sim.vehicle.setVelocity(Math.sin(yaw) * v, sim.vehicle.telemetry.vy, Math.cos(yaw) * v);
        // the body's own velocity: the smash step writes it after the physics, before the telemetry catches up
        const lv = sim.vehicle.body.linvel();
        const sp = Math.hypot(lv.x, lv.z);
        const boostBefore = sim.vehicle.boostMeter;
        sim.step();
        seq = sim.events.readFrom(seq, (e) => { if (e.kind === 'billboard' && e.target === board.id) events++; });
        if (smashedAt < 0 && sim.collectibles?.smashed[board.id]) {
          smashedAt = sim.time;
          paid = sim.vehicle.boostMeter - boostBefore;
          speedBefore = sp;
          const after = sim.vehicle.body.linvel();
          speedAfter = Math.hypot(after.x, after.z);
        }
      }
      return { sim, board, smashedAt, events, paid, speedBefore, speedAfter };
    };
    const fast = await drive(60);
    try {
      expect(fast.smashedAt).toBeGreaterThan(0);
      expect(fast.smashedAt).toBeLessThan(2);
      expect(fast.sim.collectibles?.smashedCount).toBe(1);
      expect(fast.events).toBe(1);
      // the smash step pays its boost (the wrong-way lane may trickle a little on top over the run)
      expect(fast.paid).toBeGreaterThanOrEqual(ECONOMY.billboardBoost - 0.01);
      expect(fast.paid).toBeLessThanOrEqual(ECONOMY.billboardBoost + 0.02);
      const loss = 1 - fast.speedAfter / fast.speedBefore;
      expect(loss).toBeGreaterThan(0.03);
      expect(loss).toBeLessThan(0.08);
      // once: back through it
      const b = fast.board;
      const nx = Math.sin(b.yaw), nz = Math.cos(b.yaw);
      const yaw = Math.atan2(-nx, -nz);
      fast.sim.vehicle.teleport({ x: b.x + nx * 15, y: 1, z: b.z + nz * 15 }, yaw);
      run(fast.sim, 2.5, () => { fast.sim.vehicle.setVelocity(Math.sin(yaw) * 16, fast.sim.vehicle.telemetry.vy, Math.cos(yaw) * 16); });
      expect(fast.sim.collectibles?.smashedCount).toBe(1);
      void kmh;
    } finally { fast.sim.dispose(); }
    const slow = await drive(10);
    try {
      expect(slow.smashedAt).toBe(-1);
      expect(slow.sim.collectibles?.smashedCount).toBe(0);
    } finally { slow.sim.dispose(); }
  }, 60_000);
});
