/**
 * The sweeper's brushes (M7 slice 13): the two brushes under its nose and
 * their hubs are the car mesh's turning parts, still at a standstill and
 * turning, the pair against each other, while it moves. Render only: the
 * mesh's own state, nothing of the sim's.
 */
import { describe, expect, it } from 'vitest';
import { BODY_PROFILES } from '../../src/render/bodyProfiles';
import { SPIN, buildCarMesh } from '../../src/render/carMesh';
import { bodyTuning } from '../../src/sim';

describe('the sweeper\'s brushes', () => {
  it('M7 13.2 the brushes turn with the speed, the pair each its own way, and stand still with the car', () => {
    const mesh = buildCarMesh(bodyTuning('sweeper'), BODY_PROFILES.sweeper);
    expect(mesh.spinners).toHaveLength(4);
    const angles = (): number[] => mesh.spinners.map((s) => s.rotation.y);
    mesh.spin(1, 0);
    mesh.spin(1, SPIN.minSpeed * 0.9);
    expect(angles()).toEqual([0, 0, 0, 0]);
    mesh.spin(0.1, 4);
    const slow = angles();
    for (const a of slow) expect(Math.abs(a)).toBeCloseTo((SPIN.base + 4 * SPIN.perSpeed) * 0.1, 6);
    // the mirrored brush turns the other way: toward the middle, sweeping the gutter in
    expect(Math.sign(slow[0] as number)).toBe(-Math.sign(slow[1] as number));
    // faster, faster, up to the cap
    const before = Math.abs(mesh.spinners[0]!.rotation.y);
    mesh.spin(0.1, 30);
    expect(Math.abs(mesh.spinners[0]!.rotation.y) - before).toBeCloseTo(SPIN.max * 0.1, 6);
    // a car with no turning parts has none
    expect(buildCarMesh(bodyTuning('sedan'), BODY_PROFILES.sedan).spinners).toHaveLength(0);
  });
});
