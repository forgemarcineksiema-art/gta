/**
 * The city lit at dusk, with depth (docs/M8.9_PLAN.md R9, slice 3): a quarter of the upper windows lit, the same city
 * the same windows; the facades darker at their foot; no new geometry and no new draw (the glow is a vertex attribute
 * in the city's one material).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cityGeometry } from '../../src/render/city/CityView';
import { DEPTH, GLOW, facadeShade, windowGlow, windowHash } from '../../src/render/city/glow';
import { propStatics } from '../../src/render/props/propMesh';
import { Architecture } from '../../src/sim/city/architecture';
import { PALETTE } from '../../src/sim/palette';
import type { SimWorld, StaticDesc } from '../../src/sim';
import { createWorld } from '../sim/helpers';

describe('the city lit at dusk (M8.9 slice 3)', () => {
  let sim: SimWorld;
  beforeAll(async () => { sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false }); });
  afterAll(() => sim.dispose());

  it('M8.9 3.1 a district lights a quarter of its upper windows and six in ten of its shop windows', () => {
    const city = sim.city!;
    let upper = 0, upperLit = 0, shops = 0, shopsLit = 0;
    for (let cz = -3; cz <= -1; cz++) for (let cx = -3; cx <= -1; cx++) {
      for (const st of city.chunk(cx, cz).statics) {
        if (st.tag !== 'glazing') continue;
        const lit = windowGlow(st.position.x, st.position.y, st.position.z) > 0;
        if (st.position.y < GLOW.shopTop) { shops++; if (lit) shopsLit++; } else { upper++; if (lit) upperLit++; }
      }
    }
    expect(upper).toBeGreaterThan(400);
    expect(upperLit / upper).toBeGreaterThanOrEqual(0.22);
    expect(upperLit / upper).toBeLessThanOrEqual(0.28);
    if (shops > 50) {
      expect(shopsLit / shops).toBeGreaterThanOrEqual(0.52);
      expect(shopsLit / shops).toBeLessThanOrEqual(0.68);
    }
  });

  it('M8.9 3.2 the same city lights the same windows: the draw is the window\'s place', () => {
    for (const [x, y, z] of [[12.34, 7.1, -88.2], [-640.5, 22.3, 311.9], [0, 1.9, 0]] as const) {
      expect(windowHash(x, y, z)).toBe(windowHash(x, y, z));
      expect(windowHash(x, y, z)).toBeGreaterThanOrEqual(0);
      expect(windowHash(x, y, z)).toBeLessThan(1);
    }
    const a = cityGeometry(sim.city!.chunk(-2, -2).statics), b = cityGeometry(sim.city!.chunk(-2, -2).statics);
    try {
      expect(Array.from(a.getAttribute('cityLook').array as Uint8Array)).toEqual(Array.from(b.getAttribute('cityLook').array as Uint8Array));
    } finally { a.dispose(); b.dispose(); }
  });

  it('M8.9 3.3 a facade is 0.8 at its foot to 1 from 12 m, times a contact band of 0.7 in its lowest 0.4 m', () => {
    expect(facadeShade(0)).toBeCloseTo(DEPTH.foot * DEPTH.band, 6);
    expect(facadeShade(DEPTH.bandTop)).toBeCloseTo(DEPTH.foot + (1 - DEPTH.foot) * DEPTH.bandTop / DEPTH.full, 6);
    expect(facadeShade(DEPTH.full)).toBeCloseTo(1, 6);
    expect(facadeShade(40)).toBeCloseTo(1, 6);
    for (let y = 0; y < 14; y += 0.1) expect(facadeShade(y + 0.1)).toBeGreaterThanOrEqual(facadeShade(y) - 1e-9);
  });

  it('M8.9 3.4 the glow is an attribute on the same geometry: walls flagged, a lamp\'s head lit, no vertex added', () => {
    const statics: StaticDesc[] = [], a = new Architecture(statics);
    const wall = a.box(0, 5, 0, 4, 5, 0.2, PALETTE.concrete, 'wall');
    const road = a.box(0, 0.01, 6, 4, 0.01, 2, PALETTE.asphalt, 'road');
    expect(wall.tag).toBe('wall');
    expect(road.tag).toBe('road');
    propStatics({ id: 1, kind: 'lamp', x: 10, z: 10, yaw: 0 } as never, statics);
    const geometry = cityGeometry(statics);
    try {
      const look = geometry.getAttribute('cityLook');
      expect(look.count).toBe(geometry.getAttribute('position').count);
      let facades = 0, lit = 0;
      for (let i = 0; i < look.count; i++) {
        if (look.getY(i) > 0.99) facades++;
        if (look.getX(i) > 0.5) lit++;
      }
      // the wall's box (36 vertices) is a facade; the road is not; the lamp's head glows and nothing else of it
      expect(facades).toBe(36);
      expect(lit).toBe(36);
    } finally { geometry.dispose(); }
  });
});
