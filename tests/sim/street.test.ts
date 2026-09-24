/**
 * The street furniture's places (M8 slice 0, docs/M8_PLAN.md D7): two lines on every footway and each district's
 * places, clear of the lanes, the walkers, the rings, the doors, the billboards' lines, the ramps, the junctions'
 * corners, the overpasses and the cold open's route, from each chunk's own random stream, so the buildings, the
 * billboards and the coins are those of 0.7.0 and the decoration that stood on the footways left the statics.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import type { City } from '../../src/sim/city/City';
import { PROPS_PER_CHUNK, PROP_TYPES, propFootprint, type PropDesc } from '../../src/sim/city/props';
import { BLOCK, HIGHWAY_HALF, ROAD_HALF, distanceToPolyline } from '../../src/sim/city/roads';
import { Clearances } from './clearances';
import { createWorld } from './helpers';

/** FNV-1a over a string (tests/sim/look.test.ts's fingerprint). */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

function allProps(city: City): PropDesc[] {
  const out: PropDesc[] = [];
  for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) out.push(...city.props(cx, cz));
  return out;
}

/** A prop's footprint as points: its outline and middle, every 0.25 m or closer. */
function footprintPoints(p: PropDesc): Array<{ x: number; z: number }> {
  const f = propFootprint(p.kind), cos = Math.cos(p.yaw), sin = Math.sin(p.yaw);
  const out: Array<{ x: number; z: number }> = [];
  const nx = Math.max(2, Math.ceil(2 * f.hx / 0.25)), nz = Math.max(2, Math.ceil(2 * f.hz / 0.25));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const lx = -f.hx + 2 * f.hx * i / nx, lz = -f.hz + 2 * f.hz * j / nz;
    out.push({ x: p.x + cos * lx + sin * lz, z: p.z - sin * lx + cos * lz });
  }
  return out;
}

describe('the street furniture\'s places (M8 slice 0)', () => {
  let sim: SimWorld, city: City, props: PropDesc[];
  beforeAll(async () => {
    sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    city = sim.city!;
    props = allProps(city);
  });
  afterAll(() => sim.dispose());

  it('M8 0.1 every prop keeps D7\'s clearances and 0.3 m from its neighbours; the list is the same twice, its ids stable', async () => {
    expect(props.length).toBeGreaterThan(1500);
    const kinds = new Set(props.map((p) => p.kind));
    for (const k of ['lamp', 'sapling', 'bin', 'bench'] as const) expect(kinds.has(k), k).toBe(true);
    // ids: the chunk's index × PROPS_PER_CHUNK + its place in the chunk's list
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
      city.props(cx, cz).forEach((p, i) => expect(p.id).toBe(((cz + 3) * 7 + (cx + 3)) * PROPS_PER_CHUNK + i));
    }
    // the same list from another world
    const again = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try { expect(JSON.stringify(allProps(again.city!))).toBe(JSON.stringify(props)); } finally { again.dispose(); }

    const clear = new Clearances(sim);
    expect(clear.routeLength).toBeGreaterThan(300);
    const why: string[] = [];
    for (const p of props) {
      const pts = footprintPoints(p);
      const at = `${p.kind} ${p.id} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`;
      for (const q of pts) clear.point(q, at, why);
      // nothing built above the kerb in its chunk or the ones round it
      if (clear.built(pts, p.x, p.z)) why.push(`${at}: in a static`);
    }
    // 0.3 m between two props' footprints (their bounding circles)
    const r = (p: PropDesc): number => { const f = propFootprint(p.kind); return Math.hypot(f.hx, f.hz); };
    const grid = new Map<string, PropDesc[]>();
    for (const p of props) {
      const key = `${Math.floor(p.x / 8)},${Math.floor(p.z / 8)}`;
      grid.set(key, [...(grid.get(key) ?? []), p]);
    }
    for (const p of props) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const o of grid.get(`${Math.floor(p.x / 8) + i},${Math.floor(p.z / 8) + j}`) ?? []) {
        if (o.id <= p.id) continue;
        if (Math.hypot(o.x - p.x, o.z - p.z) < r(o) + r(p) + 0.3) why.push(`${p.kind} ${p.id} and ${o.kind} ${o.id} closer than 0.3 m`);
      }
    }
    expect(why.slice(0, 12)).toEqual([]);
    // every kind's footprint fits its line: the kerb line's things inside the 1.35 m before the walkers
    for (const k of ['lamp', 'sapling', 'bin'] as const) expect(0.7 + Math.hypot(propFootprint(k).hx, propFootprint(k).hz)).toBeLessThan(1.35);
    expect(PROP_TYPES.lamp.tall && PROP_TYPES.sapling.tall && !PROP_TYPES.bin.tall && !PROP_TYPES.bench.tall).toBe(true);
  }, 120_000);

  it('M8 0.2 the buildings, the billboards and the coins are those of 0.7.0; the footway\'s decoration left the statics', () => {
    const parts: string[] = [];
    const f = (v: number): string => v.toFixed(3);
    let decoration = 0;
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
      const chunk = city.generate(cx, cz);
      for (const st of chunk.statics) {
        const s = st.shape;
        // the old lamp posts (a 0.18 × 8 m pole in the lamps' grey) and street trees (a 0.24 m trunk) on a footway
        const lamp = s.kind === 'box' && s.hx === 0.18 && s.hy === 4 && s.hz === 0.18 && st.color === 0x686678;
        const trunk = s.kind === 'cylinder' && s.radius === 0.24 && s.halfHeight === 2.35;
        if (lamp) decoration++;
        if (trunk) {
          // a thick tree is fine (a park's, a garden's, the promenade's, a plaza's); one within a footway of a street is not
          const gx = Math.round(st.position.x / BLOCK), gz = Math.round(st.position.z / BLOCK);
          const hx = Math.abs(gx) === 3 ? HIGHWAY_HALF : ROAD_HALF, hz = Math.abs(gz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
          // a grid street runs inside the highway's ring (and the two central ones out to their stubs by the sea)
          const ring = 3 * BLOCK + HIGHWAY_HALF + 4.5;
          const onGrid = ((Math.abs(st.position.z) < ring || gx === 0) && Math.abs(st.position.x - gx * BLOCK) < hx + 4.5)
            || ((Math.abs(st.position.x) < ring || gz === 0) && Math.abs(st.position.z - gz * BLOCK) < hz + 4.5);
          const onRoad = city.graph.special.some((r) => distanceToPolyline(r.centre, st.position.x, st.position.z) < r.halfWidth + 4.5);
          if (onGrid || onRoad) decoration++;
        }
        if (st.tag !== 'building' && st.tag !== 'kerb') continue;
        if (s.kind === 'prism') parts.push(`p${s.points.map((pt) => `${f(pt.x)},${f(pt.z)}`).join(';')}`);
        else if (s.kind === 'box') parts.push(`b${f(st.position.x)},${f(st.position.z)},${f(s.hx)},${f(s.hz)},${st.rotation.y.toFixed(5)},${st.rotation.w.toFixed(5)}`);
        else parts.push(`${s.kind}${f(st.position.x)},${f(st.position.z)}`);
      }
      for (const b of chunk.billboards) parts.push(`B${b.id},${f(b.x)},${f(b.z)},${b.yaw.toFixed(4)}`);
      for (const c of chunk.coins) parts.push(`C${f(c.x)},${f(c.z)}`);
    }
    // 0.7.0's layout (M7 pin 11.1): every collider's footprint, billboard and coin where it was
    expect(fnv(parts.join('|'))).toBe(2338173748);
    expect(decoration).toBe(0);
  });
});
