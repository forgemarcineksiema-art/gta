/**
 * M8.10 slice 18: the island's bake (its builders' work done at the build, `npm run bake`): an island made from it is the
 * island built: the same bake again, every chunk's statics and surfaces, the same jobs, the same ground under the
 * wheels; and a world on it drives.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearControls, type SimWorld } from '../../../src/sim';
import { CHUNKS_X, CHUNKS_Z, Island, PLUMB_TILT, bakeSections, joinBake, type IslandBake } from '../../../src/sim/island/Island';
import { SectionReader, pack, packSections, unpack } from '../../../src/sim/pack';
import { fillSolids } from '../../../src/sim/island/fill';
import type { StaticDesc } from '../../../src/sim';
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

  it('18.6 the bake in its sections, read piece by piece as it comes, is the bake; no two sections share an object', () => {
    const sections = bakeSections((built.island as Island).toBake()), bytes = packSections(sections);
    const seen = new Set<object>();
    for (const section of sections) {
      const mine = objects(section, new Set());
      // (the section's own wrapper aside)
      for (const o of mine) if (o !== section) expect(seen.has(o)).toBe(false);
      for (const o of mine) seen.add(o);
    }
    // fed in pieces of odd sizes, as a stream brings them
    const reader = new SectionReader(), read: unknown[] = [];
    for (let at = 0, n = 1; at < bytes.length; at += n, n = ((n * 7 + 13) % 65521) + 1) read.push(...reader.feed(bytes.subarray(at, Math.min(bytes.length, at + n))));
    expect(reader.done).toBe(true);
    expect(read.length).toBe(sections.length);
    const again = packSections(bakeSections(joinBake(read)));
    expect(again.length).toBe(bytes.length);
    let differ = -1;
    for (let i = 0; i < bytes.length && differ < 0; i++) if (again[i] !== bytes[i]) differ = i;
    expect(differ).toBe(-1);
  });

  it("18.7 a chunk's solids (the physics', no facades made) are what its statics make colliders of, in their order", () => {
    const island = built.island as Island, chunkOf = (x: number, z: number): number => Island.chunkIndex(...Island.chunkOf(x, z));
    const colliders = (list: readonly StaticDesc[]): string => JSON.stringify(list
      .filter((st) => (st.tag === 'trunk' && st.shape.kind === 'cylinder') || st.tag === 'building' || st.tag === 'kerb')
      .map((st) => [st.shape, st.position, st.rotation, st.tag]));
    let solids = 0;
    for (let k = 0; k < CHUNKS_X * CHUNKS_Z; k++) {
      const alone = [...fillSolids(island.fill, k, chunkOf), ...(island.fill.chunks.get(k) ?? [])];
      solids += alone.length;
      expect(colliders(alone), `chunk ${k}`).toBe(colliders(island.statics(k)));
    }
    expect(solids).toBeGreaterThan(1000);
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

/** Every object (arrays, maps, sets, typed arrays and plain objects) reachable from `v`, into `out`. */
function objects(v: unknown, out: Set<object>): Set<object> {
  if (v === null || typeof v !== 'object' || out.has(v)) return out;
  out.add(v);
  if (ArrayBuffer.isView(v)) return out;
  if (Array.isArray(v)) { for (const x of v) objects(x, out); return out; }
  if (v instanceof Map) { for (const [k, x] of v) { objects(k, out); objects(x, out); } return out; }
  if (v instanceof Set) { for (const x of v) objects(x, out); return out; }
  for (const x of Object.values(v)) objects(x, out);
  return out;
}

/** Where a ray straight down (the plumb's lean) meets the ground's height field at (x, z), the chunks round it loaded. */
function cast(sim: SimWorld, island: Island, x: number, z: number): number | null {
  island.sync(x, z, true);
  sim.world.step();
  const hit = sim.world.castRay(new RAPIER.Ray({ x, y: 400, z }, { x: PLUMB_TILT, y: -1, z: PLUMB_TILT }), 800, true, undefined, undefined, undefined, sim.vehicle.body);
  return hit ? 400 - hit.timeOfImpact : null;
}
