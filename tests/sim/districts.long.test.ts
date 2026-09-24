/**
 * Each district's things over the whole island (M8 slice 4): only in their districts, 40–70 on a plain block's
 * streets. Long: it places every chunk's props.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { districtAt, cityFootprints } from '../../src/sim/city/City';
import type { PropDesc, PropKind } from '../../src/sim/city/props';
import { BLOCK, HIGHWAY_HALF, ROAD_HALF } from '../../src/sim/city/roads';
import { slice8Place } from './clearances';
import { createWorld } from './helpers';

const HOME: Partial<Record<PropKind, readonly string[]>> = {
  table: ['crown'], chair: ['crown'], shelter: ['crown'], kiosk: ['crown'], meter: ['crown', 'foundry'], newsbox: ['crown', 'marina'],
  pallet: ['foundry'], barrel: ['foundry'], crate: ['foundry', 'marina'], cone: ['foundry'], barrier: ['foundry'], tyres: ['foundry'],
  fruitStand: ['gardens'], flamingo: ['gardens'], gnome: ['gardens'], fence: ['gardens'], letterbox: ['gardens'],
  deckchair: ['marina'], parasol: ['marina'], fishStall: ['marina'], lobsterPot: ['marina'],
  sapling: ['crown', 'gardens', 'marina'],
};
/** A yard's and a front garden's things: the lots', not the street's. */
const YARD: readonly PropKind[] = ['pallet', 'barrel', 'crate', 'tyres', 'fence', 'flamingo', 'gnome', 'letterbox'];

describe('the districts\' things over the island (M8 slice 4, long)', () => {
  let sim: SimWorld;
  beforeAll(async () => { sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false }); });
  afterAll(() => sim.dispose());

  it('M8 4.1 each district\'s things only in their district; 40–70 on a plain block\'s streets (yards, gardens and parks hold more)', () => {
    const city = sim.city!;
    const props: PropDesc[] = [];
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) props.push(...city.props(cx, cz));
    const seen = new Set<string>();
    // a mayhem zone's market and the cold open's things are their places', in any district (slice 8's pins)
    const place = slice8Place(sim);
    for (const p of props) {
      if (place(p)) continue;
      seen.add(p.kind);
      const home = HOME[p.kind];
      if (home) expect(home, `${p.kind} ${p.id} at ${p.x.toFixed(0)},${p.z.toFixed(0)}`).toContain(districtAt(p.x, p.z).id);
    }
    for (const k of Object.keys(HOME)) expect(seen.has(k), k).toBe(true);
    // a block: between its four streets' carriageways; its park lots' and yards' things counted apart
    const parks = cityFootprints(city).parks;
    let plain = 0;
    for (let bz = -3; bz < 3; bz++) for (let bx = -3; bx < 3; bx++) {
      const x0 = bx * BLOCK + (bx === -3 ? HIGHWAY_HALF : ROAD_HALF), x1 = (bx + 1) * BLOCK - (bx + 1 === 3 ? HIGHWAY_HALF : ROAD_HALF);
      const z0 = bz * BLOCK + (bz === -3 ? HIGHWAY_HALF : ROAD_HALF), z1 = (bz + 1) * BLOCK - (bz + 1 === 3 ? HIGHWAY_HALF : ROAD_HALF);
      const inside = props.filter((p) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1);
      const extra = inside.filter((p) => YARD.includes(p.kind) || place(p) !== null || parks.some((r) => Math.abs(p.x - r.x) <= r.hx && Math.abs(p.z - r.z) <= r.hz));
      const street = inside.length - extra.length;
      const at = `block ${bx},${bz} ${districtAt((x0 + x1) / 2, (z0 + z1) / 2).id}: ${street} (+${extra.length})`;
      // a highway side holds none (the highway is out of M8), an authored road through the block adds its two sides
      const sides = 4 - (bx === -3 ? 1 : 0) - (bx === 2 ? 1 : 0) - (bz === -3 ? 1 : 0) - (bz === 2 ? 1 : 0);
      const crossed = city.graph.special.some((r) => r.centre.some((c) => c.x > x0 && c.x < x1 && c.z > z0 && c.z < z1));
      if (sides === 4 && !crossed) {
        expect(street, at).toBeGreaterThanOrEqual(40);
        expect(street, at).toBeLessThanOrEqual(70);
        plain++;
      } else {
        expect(street, at).toBeGreaterThanOrEqual(10 * sides);
        expect(street, at).toBeLessThanOrEqual(crossed ? 110 : 70);
      }
    }
    expect(plain).toBeGreaterThanOrEqual(8);
  });
});
