/**
 * The island's buildings far off (M8.10 slice 18, `blocks.ts`): a building of the grid's kit at its far-off level is its
 * envelope's four faces, its core and its glass brought out onto the faces with each panel's middle unmoved (so lit as
 * near); nothing else inside the envelope is drawn and what stands outside it is as it was; every piece of it stands on
 * its footprint (the view keeps a building in one quarter, at one level); and it costs under half the far level.
 */
import { describe, expect, it } from 'vitest';
import type { StaticDesc } from '../../src/sim';
import { Architecture } from '../../src/sim/city/architecture';
import { GeometryBuild } from '../../src/render/city/CityView';
import { blockStatics, isEnvelope, ofBuilding } from '../../src/render/island/blocks';

const X = 140, Z = -60, YAW = 0.7, BASE = 23;

/** A lot's building as the island's fill makes it: the kit's building and its plinth, turned and set on the ground. */
function lot(district: string, floors: number, variant: number): StaticDesc[] {
  const list: StaticDesc[] = [], kit = new Architecture(list);
  kit.building(0, 0, 12, 10, district, 1, 1, floors, variant, 0x3a6ea5, false, true);
  kit.box(0, -0.4, 0, 12.05, 0.6, 10.05, 0x999999, 'building');
  kit.rotateFrom(0, X, Z, YAW);
  for (const st of list) st.position.y += BASE;
  return list;
}

/** A point in the building's frame (the kit's turn undone). */
function local(p: { x: number; z: number }): { x: number; z: number } {
  const dx = p.x - X, dz = p.z - Z, c = Math.cos(YAW), s = Math.sin(YAW);
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}

const vertices = (statics: StaticDesc[]): number => new GeometryBuild(statics, false).finish().getAttribute('position').count;

describe('the island\'s buildings far off', () => {
  for (const [district, floors, variant] of [['crown', 7, 0], ['marina', 5, 0], ['marina', 4, 1], ['gardens', 2, 2], ['foundry', 2, 1]] as const) {
    it(`18.3 a ${district} building (${floors} floors, variant ${variant}): its envelope, its core and its glass on the faces`, () => {
      const list = lot(district, floors, variant), blocks = blockStatics(list);
      const envs = list.filter(isEnvelope), env = envs[0] as StaticDesc;
      expect(envs).toHaveLength(1);
      if (env.shape.kind !== 'box') throw new Error('an envelope is a box');
      const { hx, hy, hz } = env.shape;
      // every piece on its footprint: one quarter, one level
      expect(list.filter((st) => !ofBuilding(env, st, 3))).toEqual([]);
      // the envelope drawn as a facade: its four faces, where it stands
      const faces = blocks.filter((st) => st.tag === 'wall');
      expect(faces).toHaveLength(1);
      expect(faces[0]?.collisionOnly).toBe(false);
      expect(faces[0]?.faces).toEqual(['x+', 'x-', 'z+', 'z-']);
      expect(faces[0]?.position).toEqual(env.position);
      // each window's glass: its middle unmoved (the same window lit), its face just past the envelope's
      const glass = list.filter((st) => st.tag === 'glazing');
      expect(glass.length).toBeGreaterThan(8);
      for (const st of glass) {
        const out = blocks.find((b) => b.tag === 'glazing' && b.position === st.position);
        expect(out).toBeDefined();
        if (!out || out.shape.kind !== 'box') continue;
        const l = local(out.position), face = out.face;
        const reach = face === 'x+' ? l.x + out.shape.hx - hx : face === 'x-' ? -l.x + out.shape.hx - hx : face === 'z+' ? l.z + out.shape.hz - hz : -l.z + out.shape.hz - hz;
        expect(reach).toBeCloseTo(0.05, 3);
      }
      // inside the envelope only the solids stay (the core, for the shadow); outside everything as it was
      const inside = (st: StaticDesc): boolean => {
        if (st.shape.kind !== 'box') return false;
        const l = local(st.position), y = st.position.y - env.position.y;
        return Math.abs(l.x) + st.shape.hx <= hx + 0.01 && Math.abs(y) + st.shape.hy <= hy + 0.01 && Math.abs(l.z) + st.shape.hz <= hz + 0.01;
      };
      const kept = blocks.filter((st) => st.tag !== 'glazing' && st.tag !== 'wall' && inside(st));
      expect(kept.every((st) => st.face === undefined && st.faces === undefined)).toBe(true);
      expect(kept.some((st) => st.shape.kind === 'box' && st.shape.hy === hy)).toBe(true);
      for (const st of list) if (!isEnvelope(st) && !inside(st)) expect(blocks).toContain(st);
      // under half the far level's triangles
      expect(vertices(blocks)).toBeLessThan(vertices(list) * 0.5);
    });
  }
});
