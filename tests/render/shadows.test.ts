import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { SHADOW_HALF, SUN_OFFSET, inShadowBox, stableShadowTarget } from '../../src/render/shadows';

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

describe('the island\'s casters by the shadow map\'s box (M8.10)', () => {
  // on the ground the map reaches ±140 m across the sun's bearing and ±265 m along it: a distance from the car (the old
  // 198 m) left the long shadows toward the low sun to pop in and cast behind the map's side for nothing
  const sun = new THREE.Vector3(SUN_OFFSET.x, 0, SUN_OFFSET.z).normalize(), across = new THREE.Vector3(-sun.z, 0, sun.x);
  const box = (at: THREE.Vector3, half: number, height: number): boolean => inShadowBox(at.x - half, 0, at.z - half, at.x + half, height, at.z + half, 0, 0, 0);
  test('M8.10 18.11 a building 240 m toward the sun casts, one 180 m across its bearing does not, nor one 320 m off', () => {
    expect(box(new THREE.Vector3(), 10, 20)).toBe(true);
    expect(box(sun.clone().multiplyScalar(240), 8, 20)).toBe(true);
    expect(box(sun.clone().multiplyScalar(-240), 8, 20)).toBe(true);
    expect(box(across.clone().multiplyScalar(180), 8, 20)).toBe(false);
    expect(box(sun.clone().multiplyScalar(320), 8, 20)).toBe(false);
  });
});
