/** The trees (docs/M8.9_PLAN.md slice 22): the kit's trees drawn as models, a few variants turned by their place. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TREE_COLORS, TREE_MODELS, type StaticDesc, type TreeModel } from '../../src/sim';
import { Architecture } from '../../src/sim/city/architecture';
import { TREE_VARIANTS, treeRaw, treeVariant, treeYaw } from '../../src/render/trees';
import { cityGeometry } from '../../src/render/city/CityView';

const MODELS: TreeModel[] = ['broadleaf', 'palm', 'sapling'];
const TALL: Record<TreeModel, number> = { broadleaf: 6, palm: 7, sapling: 3.5 };

describe('the trees (M8.9 slice 22)', () => {
  it("M8.9 22.1 each model stands on the ground within its reach, its trunk over the collider's; the kit's statics as they were", () => {
    for (const model of MODELS) for (let v = 0; v < TREE_VARIANTS; v++) {
      const { p } = treeRaw(model, v), b = TREE_MODELS[model];
      let low = Infinity, high = -Infinity, far = 0;
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i] as number, y = p[i + 1] as number, z = p[i + 2] as number;
        low = Math.min(low, y);
        high = Math.max(high, y);
        far = Math.max(far, Math.hypot(x, z));
        // the trunk's foot covers the collider's (0.24 m round)
        if (y < 0.6) expect(Math.hypot(x, z), `${model} ${v} foot`).toBeLessThan(0.36);
      }
      expect(low, `${model} ${v}`).toBeCloseTo(0, 6);
      expect(high, `${model} ${v}`).toBeLessThanOrEqual(b.height);
      expect(far, `${model} ${v}`).toBeLessThanOrEqual(b.radius);
      expect(high, `${model} ${v} tall enough`).toBeGreaterThan(TALL[model]);
    }
    // the trunk (the collider) and the crown's pieces (the placements' reach) where they stood, none drawn but the first
    // piece, which carries the model at its crown's height
    for (const palm of [false, true]) {
      const list: StaticDesc[] = [];
      new Architecture(list).tree(3, 4, palm);
      const [trunk, crown, ...rest] = list as [StaticDesc, StaticDesc, ...StaticDesc[]];
      expect(list).toHaveLength(4);
      expect(trunk).toMatchObject({ shape: { kind: 'cylinder', radius: 0.24, halfHeight: 2.35 }, position: { x: 3, y: 2.5, z: 4 }, tag: 'trunk', collisionOnly: true });
      const model: TreeModel = palm ? 'palm' : 'broadleaf';
      expect(crown).toMatchObject({ position: { x: 3, y: TREE_MODELS[model].crown, z: 4 }, tag: 'decor', model });
      expect(crown.collisionOnly).toBeUndefined();
      expect(crown.shape).toEqual(palm ? { kind: 'box', hx: 3.2, hy: 0.15, hz: 0.7 } : { kind: 'cylinder', radius: 2.7, halfHeight: 1.2, sides: 6 });
      for (const st of rest) expect(st.collisionOnly).toBe(true);
    }
  });

  it("M8.9 22.2 a palm's fronds are seen from above and from under them", () => {
    const fronds = [new THREE.Color(TREE_COLORS.frond), new THREE.Color(TREE_COLORS.frondDark)];
    for (let v = 0; v < TREE_VARIANTS; v++) {
      const { n, c } = treeRaw('palm', v);
      let up = 0, down = 0;
      for (let i = 0; i < n.length; i += 9) {
        if (!fronds.some((f) => Math.abs(f.r - (c[i] as number)) < 1e-6 && Math.abs(f.g - (c[i + 1] as number)) < 1e-6)) continue;
        if ((n[i + 1] as number) > 0) up++;
        else down++;
      }
      expect(up).toBeGreaterThan(40);
      expect(down).toBe(up);
    }
  });

  it("M8.9 22.3 a tree's triangles within its budget", () => {
    for (let v = 0; v < TREE_VARIANTS; v++) {
      expect(treeRaw('broadleaf', v).p.length / 9).toBeLessThanOrEqual(110);
      expect(treeRaw('palm', v).p.length / 9).toBeLessThanOrEqual(150);
      expect(treeRaw('sapling', v).p.length / 9).toBeLessThanOrEqual(80);
    }
  });

  it('M8.9 22.4 the variant and the turn the same for a place, different along a row; the builder draws the model there', () => {
    expect(treeVariant(120.5, -33.25)).toBe(treeVariant(120.5, -33.25));
    expect(treeYaw(120.5, -33.25)).toBe(treeYaw(120.5, -33.25));
    const variants = new Set<number>(), yaws = new Set<string>();
    for (let k = 0; k < 12; k++) {
      variants.add(treeVariant(40 + k * 12, 210.5));
      yaws.add(treeYaw(40 + k * 12, 210.5).toFixed(3));
    }
    expect(variants.size).toBeGreaterThanOrEqual(3);
    expect(yaws.size).toBe(12);
    // the city's builder: the trunk not drawn (the model has its own), the model turned and set on its foot, its colours
    const list: StaticDesc[] = [];
    new Architecture(list).tree(0, 0, true);
    for (const st of list) { st.position.x += 50; st.position.z -= 20; st.position.y += 3; }
    const g = cityGeometry(list), raw = treeRaw('palm', treeVariant(50, -20)), yaw = treeYaw(50, -20);
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    expect(pos.count).toBe(raw.p.length / 3);
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (const i of [0, 7, pos.count - 1]) {
      const lx = raw.p[i * 3] as number, ly = raw.p[i * 3 + 1] as number, lz = raw.p[i * 3 + 2] as number;
      expect(pos.getX(i)).toBeCloseTo(50 + cos * lx + sin * lz, 5);
      expect(pos.getY(i)).toBeCloseTo(3 + ly, 5);
      expect(pos.getZ(i)).toBeCloseTo(-20 - sin * lx + cos * lz, 5);
      expect(col.getX(i)).toBeCloseTo(raw.c[i * 3] as number, 6);
    }
  });
});
