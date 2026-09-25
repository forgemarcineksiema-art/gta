/**
 * The golden hour (docs/M8.9_PLAN.md R8, slice 2): the sun low and warm, the sky in three stops dark behind the HUD, the
 * fog and the background the horizon's colour.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../src/sim/palette';
import { SUN_OFFSET } from '../../src/render/shadows';
import { SKY, skyColorAt } from '../../src/render/sky';

/** Relative luminance of a linear colour (three's working space is linear sRGB). */
const luminance = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe('the golden hour (M8.9 slice 2)', () => {
  it('M8.9 2.1 the sun stands 25°–35° over the horizon on its old bearing, warmer and stronger than the fill', () => {
    const horizontal = Math.hypot(SUN_OFFSET.x, SUN_OFFSET.z);
    const elevation = THREE.MathUtils.radToDeg(Math.atan2(SUN_OFFSET.y, horizontal));
    expect(elevation).toBeGreaterThanOrEqual(25);
    expect(elevation).toBeLessThanOrEqual(35);
    // the bearing of M2's sun (-60, 70, -40): the same heading in the ground plane
    expect(Math.atan2(SUN_OFFSET.x, SUN_OFFSET.z)).toBeCloseTo(Math.atan2(-60, -40), 6);
    // a wall turned to the sun takes at least two thirds of its light from the sun (both go through the same Lambert
    // term: the sun's colour × intensity × cos of its elevation, the fill's half-way colour × intensity)
    const sun = new THREE.Color(SKY.sun.color);
    const fill = new THREE.Color(SKY.fill.ground).lerp(new THREE.Color(SKY.fill.sky), 0.5);
    const fromSun = luminance(sun) * SKY.sun.intensity * Math.cos(THREE.MathUtils.degToRad(elevation));
    const fromFill = luminance(fill) * SKY.fill.intensity;
    expect(fromSun / (fromSun + fromFill)).toBeGreaterThanOrEqual(2 / 3);
    // warm: its red twice its blue
    expect(sun.r).toBeGreaterThan(sun.b * 2);
  });

  it('M8.9 2.2 the sky 20° up, behind the HUD, has a luminance of 0.18 or less; the horizon is the brightest', () => {
    const c = new THREE.Color();
    expect(luminance(skyColorAt(20, c))).toBeLessThanOrEqual(0.18);
    expect(luminance(skyColorAt(90, c))).toBeLessThanOrEqual(0.18);
    const horizon = luminance(skyColorAt(0, c));
    for (const e of [5, 10, 15, 30, 60]) expect(luminance(skyColorAt(e, c))).toBeLessThan(horizon);
    expect(skyColorAt(-10, new THREE.Color()).getHex()).toBe(skyColorAt(0, new THREE.Color()).getHex());
  });

  it('M8.9 2.3 the fog and the background are the horizon\'s colour', () => {
    expect(PALETTE.fog).toBe(PALETTE.skyHorizon);
    expect(SKY.stops[0]?.color).toBe(PALETTE.skyHorizon);
    expect(SKY.stops[0]?.at).toBe(0);
  });
});
