/**
 * M8.10 slice 18: the island's bake (its builders' work done at the build, `npm run bake`): an island made from it is the
 * island built: the same bake again, every chunk's statics and surfaces, the same jobs, the same ground under the
 * wheels; and a world on it drives.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearControls, type SimWorld } from '../../../src/sim';
import { CHUNKS_X, CHUNKS_Z, PLUMB_TILT, type Island, type IslandBake } from '../../../src/sim/island/Island';
import { pack, unpack } from '../../../src/sim/pack';
import { createWorld } from '../helpers';

describe('M8.10 slice 18: the island\'s bake', () => {
  let built: SimWorld, baked: SimWorld, bytes: Uint8Array;
  beforeAll(async () => {
    built = await createWorld({ map: 'island', seed: 42, traffic: 0, peds: 0, record: false });
    bytes = pack((built.island as Island).toBake());
    baked = await createWorld({ map: 'island', islandBake: unpack(bytes) as IslandBake, seed: 42, traffic: 0, peds: 0, record: false });
  }, 180_000);
  afterAll(() => { built.dispose(); baked.dispose(); });

  it('18.0 an island made from its bake is the island built: its bake the same bytes, its chunks\' statics and surfaces, its jobs', () => {
    const a = built.island as Island, b = baked.island as Island;
    const again = pack(b.toBake());
    expect(again.length).toBe(bytes.length);
    let differ = -1;
    for (let i = 0; i < bytes.length && differ < 0; i++) if (again[i] !== bytes[i]) differ = i;
    expect(differ).toBe(-1);
    // the fill's buildings made from the lots, the surfaces' triangles from their data: as the built island's
    for (let k = 0; k < CHUNKS_X * CHUNKS_Z; k++) expect(JSON.stringify(b.statics(k)), `chunk ${k}`).toBe(JSON.stringify(a.statics(k)));
    const ma = a.surfaceMeshes(), mb = b.surfaceMeshes();
    expect([...mb.keys()].sort()).toEqual([...ma.keys()].sort());
    for (const [k, c] of ma) {
      expect(mb.get(k)?.positions, `chunk ${k}`).toEqual(c.positions);
      expect(mb.get(k)?.colors, `chunk ${k}`).toEqual(c.colors);
    }
    expect(JSON.stringify(baked.jobs.defs)).toBe(JSON.stringify(built.jobs.defs));
    expect(JSON.stringify(baked.cover)).toBe(JSON.stringify(built.cover));
  });

  it('18.0 the ground under the wheels the same, and a car drives on it', () => {
    const a = built.island as Island, b = baked.island as Island;
    // down onto the height fields round the start, in both worlds
    for (const [x, z] of [[400, 347], [380, 300], [330, 260], [440, 380]] as const) {
      const ya = cast(built, a, x, z), yb = cast(baked, b, x, z);
      expect(ya, `${x}, ${z}`).not.toBeNull();
      expect(yb, `${x}, ${z}`).toBeCloseTo(ya as number, 6);
    }
    // three seconds of full throttle from the spawn in both: the car goes, and goes where the built world's goes
    const p0 = { ...baked.vehicle.body.translation() };
    for (const sim of [built, baked]) for (let i = 0; i < 180; i++) { clearControls(sim.controls); sim.controls.throttle = 1; sim.step(); }
    const pa = built.vehicle.body.translation(), pb = baked.vehicle.body.translation();
    expect(Math.hypot(pb.x - p0.x, pb.z - p0.z)).toBeGreaterThan(10);
    expect(Math.hypot(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z)).toBeLessThan(0.01);
    expect(baked.hasNaN()).toBe(false);
  });
});

/** Where a ray straight down (the plumb's lean) meets the ground's height field at (x, z), the chunks round it loaded. */
function cast(sim: SimWorld, island: Island, x: number, z: number): number | null {
  island.sync(x, z, true);
  sim.world.step();
  const hit = sim.world.castRay(new RAPIER.Ray({ x, y: 400, z }, { x: PLUMB_TILT, y: -1, z: PLUMB_TILT }), 800, true, undefined, undefined, undefined, sim.vehicle.body);
  return hit ? 400 - hit.timeOfImpact : null;
}
