/**
 * Rapier interaction groups. The chassis does not collide with terrain (ground,
 * roads, kerbs, ramps): the suspension rays carry the car, so a kink or a kerb
 * never scrapes the body and steals speed. When the car is on its roof or side
 * the terrain group is switched on so it can rest on the ground until it rights
 * itself. Props, walls and buildings collide with everything.
 */
export const GROUP_DEFAULT = 0x0001;
export const GROUP_TERRAIN = 0x0002;
export const GROUP_CHASSIS = 0x0004;
const ALL = 0xffff;

export function interactionGroups(membership: number, filter: number): number {
  return ((membership & ALL) << 16) | (filter & ALL);
}

export const GROUPS_TERRAIN = interactionGroups(GROUP_TERRAIN, ALL);
export const GROUPS_SOLID = interactionGroups(GROUP_DEFAULT, ALL);
export const GROUPS_CHASSIS_UPRIGHT = interactionGroups(GROUP_CHASSIS, ALL & ~GROUP_TERRAIN);
export const GROUPS_CHASSIS_FLIPPED = interactionGroups(GROUP_CHASSIS, ALL);
