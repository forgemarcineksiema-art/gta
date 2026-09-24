import { describe, expect, it } from 'vitest';
import { CAR_IDS, CAR_PRESETS } from '../../src/sim';
import { CAR_PROFILES } from '../../src/render/cars/carProfiles';
import { buildTrafficGeometry } from '../../src/render/cars/trafficMesh';

describe.each(CAR_IDS)('%s traffic mesh', (id) => {
  it('stays under 400 triangles with finite geometry', () => {
    const geometry = buildTrafficGeometry(CAR_PROFILES[id], CAR_PRESETS[id]);
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    const triangles = position.count / 3;
    expect(triangles).toBeGreaterThan(40);
    expect(triangles).toBeLessThanOrEqual(400);
    expect(color.count).toBe(position.count);
    expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
    expect(Array.from(color.array).every((v) => v >= 0 && v <= 1)).toBe(true);
    geometry.dispose();
  });
});
