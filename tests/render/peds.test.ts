/**
 * The crowd's four silhouettes (M5.5 slice 20): each under 600 triangles,
 * standing on the ground at a person's height, with both legs and both arms
 * on their joints and the clothes under the tint.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LIMB, buildPed } from '../../src/render/pedMesh';
import { PED_LOOKS, CROWD_LOOKS } from '../../src/sim';

describe('the crowd, drawn', () => {
  it('20.1 four silhouettes: under 600 triangles, on the ground, 1.5–1.95 m tall, four limbs on their joints, tinted clothes', () => {
    for (let look = 0; look < PED_LOOKS; look++) {
      const g = buildPed(look);
      const pos = g.getAttribute('position');
      expect(pos.count / 3, `look ${look}`).toBeLessThan(600);
      g.computeBoundingBox();
      const box = g.boundingBox as THREE.Box3;
      expect(box.min.y).toBeCloseTo(0, 5);
      expect(box.max.y).toBeGreaterThan(1.5);
      expect(box.max.y).toBeLessThan(1.95);
      const limb = g.getAttribute('limb'), pivot = g.getAttribute('pivot'), mask = g.getAttribute('paintMask');
      const seen = new Set<number>();
      let tinted = 0;
      for (let i = 0; i < limb.count; i++) {
        const l = limb.getX(i);
        seen.add(l);
        tinted += mask.getX(i);
        // legs turn at the hip, arms at the shoulder: the joint sits above everything on the limb
        if (l !== LIMB.body) expect(pivot.getY(i)).toBeGreaterThanOrEqual(pos.getY(i) - 0.2);
      }
      for (const l of [LIMB.body, LIMB.legL, LIMB.legR, LIMB.armL, LIMB.armR]) expect(seen.has(l), `look ${look} limb ${l}`).toBe(true);
      // the crowd's clothes take the district's tint; the officer's uniform (M5.5 slice 18) is fixed
      if (look < CROWD_LOOKS) expect(tinted).toBeGreaterThan(0);
      expect(tinted).toBeLessThan(mask.count);
      g.dispose();
    }
  });
});
