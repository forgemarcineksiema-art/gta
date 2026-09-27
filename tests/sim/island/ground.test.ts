/** M8.10 slice 2: the island's ground as a height field (docs/M8.10_PLAN.md). */
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { clearControls, initPhysics } from '../../../src/sim';
import { CHUNK, CHUNK_X0, CHUNK_Z0, FIELD, Island, PLUMB_TILT, PREFETCH_COLUMNS } from '../../../src/sim/island/Island';
import { SUMMIT } from '../../../src/sim/island/plan';
import { createWorld } from '../helpers';

/** The ground under (x, z) by a ray leaning as the wheels' do on the island (a plumb one misses a height field). */
const hitGround = (world: RAPIER.World, island: Island, x: number, z: number): number | null => {
  const handles = new Set([...island.active.values()].map((c) => c.handle));
  const hit = world.castRay(new RAPIER.Ray({ x, y: 120, z }, { x: PLUMB_TILT, y: -1, z: PLUMB_TILT }), 200, true, undefined, undefined, undefined, undefined, (c) => handles.has(c.handle));
  return hit ? 120 - hit.timeOfImpact : null;
};


describe('M8.10 slice 2: the ground', () => {
  beforeAll(async () => { await initPhysics(); });

  it('2.1 the height field is the ground: at its own points, within 1 cm, the right way round', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const island = new Island(world);
    island.sync(SUMMIT.x + 60, SUMMIT.z + 40, true);
    world.step();
    let seed = 3;
    const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const [ci, cj] = Island.chunkOf(SUMMIT.x + 60, SUMMIT.z + 40);
    let checked = 0;
    for (let k = 0; k < 200; k++) {
      const i = ci - 1 + Math.floor(rnd() * 3), j = cj - 1 + Math.floor(rnd() * 3);
      const x = CHUNK_X0 + i * CHUNK + Math.floor(rnd() * (CHUNK / FIELD)) * FIELD, z = CHUNK_Z0 + j * CHUNK + Math.floor(rnd() * (CHUNK / FIELD)) * FIELD;
      const y = hitGround(world, island, x, z);
      expect(y, `${x}, ${z}`).not.toBeNull();
      expect(Math.abs((y ?? 0) - island.heightAt(x, z)), `${x}, ${z}`).toBeLessThan(0.01);
      checked++;
    }
    expect(checked).toBe(200);
    expect(hitGround(world, island, SUMMIT.x, SUMMIT.z) ?? 0).toBeGreaterThan(45);
  });

  it('2.2 a car handbraked on a 12 % slope holds', async () => {
    const sim = await createWorld({ map: 'island', traffic: 0, peds: 0 });
    const island = sim.island as Island;
    // a hillside of 11–13 % off the roads and the lots (slice 7a's buildings): face down its fall line
    let spot: { x: number; z: number; yaw: number } | null = null;
    const p = { name: '', position: { x: 0, y: 0, z: 0 }, yaw: 0 };
    const built = (x: number, z: number): boolean => island.fill.lots.some((l) => Math.hypot(l.x - x, l.z - z) < Math.hypot(l.hx, l.hz) + 15);
    for (let r = 120; r < 320 && !spot; r += 10) for (let a = 0; a < Math.PI * 2 && !spot; a += 0.2) {
      const x = SUMMIT.x + Math.cos(a) * r, z = SUMMIT.z + Math.sin(a) * r;
      const gx = (island.heightAt(x + 1, z) - island.heightAt(x - 1, z)) / 2, gz = (island.heightAt(x, z + 1) - island.heightAt(x, z - 1)) / 2;
      const grade = Math.hypot(gx, gz);
      if (grade > 0.11 && grade < 0.13 && Math.hypot(island.nearestRoad(x, z, p).position.x - x, p.position.z - z) > 30 && !built(x, z)) spot = { x, z, yaw: Math.atan2(-gx, -gz) };
    }
    expect(spot).not.toBeNull();
    if (!spot) return;
    island.sync(spot.x, spot.z, true);
    sim.vehicle.teleport({ x: spot.x, y: island.heightAt(spot.x, spot.z) + 0.9, z: spot.z }, spot.yaw);
    for (let i = 0; i < 60; i++) { clearControls(sim.controls); sim.controls.handbrake = 1; sim.controls.brake = 1; sim.step(); }
    const start = { ...sim.vehicle.body.translation() };
    for (let i = 0; i < 300; i++) { clearControls(sim.controls); sim.controls.handbrake = 1; sim.step(); }
    const end = sim.vehicle.body.translation();
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(0.5);
  });

  it('2.3 up Crown Avenue at full throttle the car climbs the hill upright and on its wheels', async () => {
    const sim = await createWorld({ map: 'island', traffic: 0, peds: 0 });
    const island = sim.island as Island;
    // from the centre's roundabout up the avenue to the summit's ring, 40 m of climb in 470 m (world axes)
    const from = { x: 60, z: 95 }, to = { x: 406, z: 352 };
    island.sync(from.x, from.z, true);
    const yaw = Math.atan2(to.x - from.x, to.z - from.z);
    sim.vehicle.teleport({ x: from.x, y: island.heightAt(from.x, from.z) + 0.6, z: from.z }, yaw);
    for (let i = 0; i < 60; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
    const y0 = sim.vehicle.body.translation().y;
    let steps = 0, grounded = 0, minUp = 1;
    for (let i = 0; i < 60 * 25; i++) {
      const p = sim.vehicle.body.translation();
      const q = sim.vehicle.body.rotation();
      const heading = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
      // hold the avenue's line: aim 30 m ahead on it
      const ux = Math.sin(yaw), uz = Math.cos(yaw), along = (p.x - from.x) * ux + (p.z - from.z) * uz;
      const ax = from.x + ux * (along + 30), az = from.z + uz * (along + 30);
      let err = Math.atan2(ax - p.x, az - p.z) - heading;
      err = Math.atan2(Math.sin(err), Math.cos(err));
      clearControls(sim.controls);
      sim.controls.steer = Math.max(-1, Math.min(1, -err * 2.5));
      sim.controls.throttle = sim.vehicle.telemetry.speedKmh < 100 ? 1 : 0;
      sim.step();
      minUp = Math.min(minUp, 1 - 2 * (q.x * q.x + q.z * q.z));
      steps++;
      if (sim.vehicle.telemetry.groundedWheels >= 2) grounded++;
      if (Math.hypot(p.x - to.x, p.z - to.z) < 25) break;
    }
    const end = sim.vehicle.body.translation();
    expect(Math.hypot(end.x - to.x, end.z - to.z)).toBeLessThan(40);
    expect(end.y - y0).toBeGreaterThan(30);
    expect(minUp).toBeGreaterThan(0.8);
    expect(grounded / steps).toBeGreaterThan(0.95);
  });

  it('2.6 a road bends from one grade to the next on a curve: the highway on the ground never tighter than 100 m; a street\'s crest or sag tighter than 15 m in 30 m of the 5 km at most (a crossing\'s flat met its block in one point: the cars flew off the crests and bottomed in the sags)', () => {
    const g = new Island(new RAPIER.World({ x: 0, y: -9.81, z: 0 })).ground;
    let highway = Infinity, tight = 0, street = 0;
    for (const r of g.roads) {
      if (r.cls !== 'highway' && r.cls !== 'street') continue;
      // the road's surface a metre a step (none over an overpass: its deck carries it)
      const n = r.pts.length, last = r.closed ? n : n - 1, xs: number[] = [], zs: number[] = [];
      for (let i = 0; i < last; i++) {
        const a = r.pts[i] as [number, number], b = r.pts[(i + 1) % n] as [number, number], steps = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])));
        const deck = r.deck?.[i] === true || r.deck?.[(i + 1) % n] === true;
        for (let k = 0; k < steps; k++) { xs.push(deck ? NaN : a[0] + ((b[0] - a[0]) * k) / steps); zs.push(a[1] + ((b[1] - a[1]) * k) / steps); }
      }
      const h = xs.map((x, k) => (Number.isNaN(x) ? NaN : g.surfaceHeight(x, zs[k] as number)));
      for (let k = 2; k + 2 < h.length; k++) {
        const s0 = Math.hypot((xs[k] as number) - (xs[k - 2] as number), (zs[k] as number) - (zs[k - 2] as number)), s1 = Math.hypot((xs[k + 2] as number) - (xs[k] as number), (zs[k + 2] as number) - (zs[k] as number));
        const turn = ((h[k + 2] as number) - (h[k] as number)) / s1 - ((h[k] as number) - (h[k - 2] as number)) / s0;
        if (Number.isNaN(turn)) continue;
        const radius = (s0 + s1) / 2 / Math.max(1e-6, Math.abs(turn));
        if (r.cls === 'highway') highway = Math.min(highway, radius);
        else { street++; if (radius < 15) tight++; }
      }
    }
    expect(highway).toBeGreaterThan(100);
    expect(street).toBeGreaterThan(4000);
    expect(tight).toBeLessThanOrEqual(30);
  });

  it('2.7 round the serpentine\'s hairpins its lanes run on the ground without a step (inside a bend the height stepped 0.1-0.15 m where the nearest segment swapped)', () => {
    const island = new Island(new RAPIER.World({ x: 0, y: -9.81, z: 0 })), g = island.ground;
    let worst = 0, at = '', steps = 0;
    island.network.graph.lanes.forEach((lane, li) => {
      if (island.network.laneRoad[li] !== 'serpentine') return;
      const hs: number[] = [], xs: number[] = [], zs: number[] = [];
      for (let k = 0; k + 1 < lane.points.length; k++) {
        const a = lane.points[k] as { x: number; z: number }, b = lane.points[k + 1] as { x: number; z: number }, n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
        for (let i = 0; i < n; i++) { const x = a.x + ((b.x - a.x) * i) / n, z = a.z + ((b.z - a.z) * i) / n; xs.push(x); zs.push(z); hs.push(g.surfaceHeight(x, z)); }
      }
      // a quarter metre a step: the height's turn from one step to the next (a step shows as its whole height)
      for (let k = 1; k + 1 < hs.length; k++) {
        const turn = Math.abs((hs[k + 1] as number) - 2 * (hs[k] as number) + (hs[k - 1] as number));
        steps++;
        if (turn > worst) { worst = turn; at = `${(xs[k] as number).toFixed(0)}, ${(zs[k] as number).toFixed(0)}`; }
      }
    });
    expect(steps).toBeGreaterThan(3000);
    expect(worst, at).toBeLessThan(0.05);
  });

  // 2.4 (a drive along the highway across four chunk borders) is a long pin: drive.long.test.ts

  it('2.5 at 60 m/s across the island the ground is worked out ahead, a bounded share a step; a height field builds in under 5 ms', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const island = new Island(world);
    const x0 = 700, z0 = -600;
    island.sync(x0, z0, true);
    for (let i = 0; i < 400; i++) island.prefetch(x0, z0);
    const late = island.late;
    // 1 m a step (60 m/s) north-east across the island, 1.6 km over nine chunk borders. The work a step is counted, not
    // timed: under the suite's four workers a step's wall clock reads the machine (25 ms at the 99th percentile against
    // 1.6 ms alone); the frame's time is the gate's perf run
    let most = 0, builds = 0;
    for (let s = 0; s < 1600; s++) {
      const x = x0 - s * 0.8, z = z0 + s * 0.6;
      const worked = island.worked, loaded = island.loaded;
      island.sync(x, z);
      island.prefetch(x, z);
      most = Math.max(most, island.worked - worked);
      expect(island.loaded - loaded).toBeLessThanOrEqual(1);
      builds += island.loaded - loaded;
    }
    expect(island.late - late).toBe(0);
    expect(builds).toBeGreaterThan(20);
    expect(most).toBeLessThanOrEqual(PREFETCH_COLUMNS * (CHUNK / FIELD + 1));
    // a chunk's height field from its heights: the median of 30 builds
    const [ci, cj] = Island.chunkOf(x0, z0);
    const times: number[] = [];
    for (let k = 0; k < 30; k++) {
      const t0 = performance.now();
      const collider = island.buildChunk(ci, cj);
      times.push(performance.now() - t0);
      world.removeCollider(collider, false);
    }
    times.sort((a, b) => a - b);
    expect(times[15] as number).toBeLessThan(5);
  });
});
