/**
 * The garage's things (M5.5 slice 5, docs/DESIGN.md §13.6): one merged mesh
 * under a thousand triangles, inside the walls, clear of the floor the car
 * needs (the entry box) and of the door's opening.
 */
import { describe, expect, it } from 'vitest';
import { propsGeometry } from '../../src/render/run/HideoutView';
import { GARAGE } from '../../src/sim';

describe('the garage dressed', () => {
  it('5.1 the props: under 1,000 triangles, inside the walls, clear of the car\'s floor and the doorway', () => {
    const g = propsGeometry();
    const pos = g.getAttribute('position');
    const tris = (g.index ? g.index.count : pos.count) / 3;
    expect(tris).toBeLessThan(1000);
    const innerAcross = GARAGE.width / 2 - GARAGE.wall;
    const innerAlong = GARAGE.depth / 2 - GARAGE.wall;
    for (let i = 0; i < pos.count; i++) {
      const across = -pos.getX(i), y = pos.getY(i), along = pos.getZ(i);
      expect(Math.abs(across)).toBeLessThanOrEqual(innerAcross + 1e-6);
      expect(Math.abs(along)).toBeLessThanOrEqual(innerAlong + 1e-6);
      expect(y).toBeGreaterThanOrEqual(-1e-6);
      expect(y).toBeLessThanOrEqual(GARAGE.height);
      // the car's floor (the entry box) is free below head height, except the poster on the back wall
      if (along < innerAlong - 0.1 && y < 2.6) expect(Math.abs(across)).toBeGreaterThan(GARAGE.entryAcross + 1.3);
    }
    g.dispose();
  });
});
