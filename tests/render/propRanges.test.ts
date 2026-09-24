/**
 * Standing props cost no draw call (M8 slice 0, docs/M8_PLAN.md D5): they are built into their chunk's part
 * meshes like the buildings, every prop's pieces one vertex range in one part; the far level holds only the tall
 * kinds, and the tall ones are in the shadow casters' prefix, the small ones after it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GeometryBuild, partitionChunk, type PropRanges } from '../../src/render/CityView';
import { propParts } from '../../src/render/propMesh';
import { PROP_TYPES, type PropDesc, type SimWorld } from '../../src/sim';
import { createWorld } from '../sim/helpers';

describe('standing props in the chunk meshes (M8 slice 0)', () => {
  let sim: SimWorld;
  beforeAll(async () => { sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false }); });
  afterAll(() => sim.dispose());

  it('M8 0.3 a built chunk part holds each of its props\' ranges once, the far level only the tall kinds', () => {
    const city = sim.city!;
    let checked = 0;
    for (const [cx, cz] of [[-2, -1], [1, -2], [-1, 1], [3, 2], [0, 0]] as const) {
      const chunk = city.chunk(cx, cz), props = city.props(cx, cz);
      expect(props.length, `${cx},${cz}`).toBeGreaterThan(10);
      const byId = new Map<number, PropDesc>(props.map((p) => [p.id, p]));
      const groups = partitionChunk(chunk, props);
      for (const detailed of [true, false]) {
        const seen = new Map<number, number>();
        for (const group of groups) {
          const geometry = new GeometryBuild(group, detailed).finish();
          const ranges = geometry.userData['props'] as PropRanges;
          const shadow = geometry.userData['shadowVertices'] as number;
          const pos = geometry.getAttribute('position').array as Float32Array;
          for (let k = 0; k < ranges.ids.length; k++) {
            const id = ranges.ids[k] as number, start = ranges.start[k] as number, count = ranges.count[k] as number;
            const p = byId.get(id);
            expect(p, `prop ${id}`).toBeDefined();
            if (!p) continue;
            seen.set(id, (seen.get(id) ?? 0) + 1);
            // its pieces, all of them, and nothing else: the vertices its parts make, within its reach of where it stands
            const parts = propParts(p.kind);
            const vertices = parts.reduce((n, part) => n + (part.shape === 'box' ? 36 : part.sides === 6 ? 72 : 96), 0);
            expect(count, `${p.kind} ${id}`).toBe(vertices);
            const reach = Math.max(...parts.map((part) => Math.hypot(Math.abs(part.x) + part.hx, Math.abs(part.z) + part.hz))) + 1e-3;
            for (let v = start; v < start + count; v++) {
              expect(Math.hypot((pos[v * 3] as number) - p.x, (pos[v * 3 + 2] as number) - p.z)).toBeLessThanOrEqual(reach);
            }
            // a tall kind in the shadow pass, a small one out of it
            if (PROP_TYPES[p.kind].tall) expect(start + count).toBeLessThanOrEqual(shadow);
            else expect(start).toBeGreaterThanOrEqual(shadow);
            checked++;
          }
          geometry.dispose();
        }
        for (const p of props) {
          const want = detailed || PROP_TYPES[p.kind].tall ? 1 : 0;
          expect(seen.get(p.id) ?? 0, `${p.kind} ${p.id} ${detailed ? 'near' : 'far'}`).toBe(want);
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
