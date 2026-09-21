import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { SHADOW_HALF, SUN_OFFSET, stableShadowTarget } from '../../src/render/shadows';

describe('stable city shadows', () => {
  test('light-space grid does not drift under sub-texel car motion on either quality tier', () => {
    const direction = SUN_OFFSET.clone().normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
    const up = direction.clone().cross(right).normalize();
    for (const resolution of [1024, 2048]) {
      const texel = SHADOW_HALF * 2 / resolution;
      for (const sign of [-1, 1]) {
        const centre = right.clone().multiplyScalar(sign * texel * 200).addScaledVector(up, -texel * 53);
        const before = new THREE.Vector3(), after = new THREE.Vector3();
        stableShadowTarget(centre, resolution, before);
        const moved = centre.clone().addScaledVector(right, texel * 0.4).addScaledVector(up, texel * 0.4);
        stableShadowTarget(moved, resolution, after);
        expect(after.clone().sub(before).dot(right)).toBeCloseTo(0, 8);
        expect(after.clone().sub(before).dot(up)).toBeCloseTo(0, 8);
        stableShadowTarget(centre.clone().addScaledVector(right, texel * 0.6), resolution, after);
        expect(after.clone().sub(before).dot(right)).toBeCloseTo(texel, 8);
      }
    }
  });
});
