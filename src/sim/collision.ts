/**
 * Rapier interaction groups. The chassis does not collide with terrain (ground,
 * roads, kerbs, ramps): the suspension rays carry the car, so a kink or a kerb
 * never scrapes the body and steals speed. When the car is on its roof or side
 * the terrain group is switched on so it can rest on the ground until it rights
 * itself. Props, walls and buildings collide with everything. The sea (M8.8
 * slice 19) is met by the hovercraft's rays alone, and the slipways' gates in
 * the seawall stop every chassis but the hovercraft's.
 */
export const GROUP_DEFAULT = 0x0001;
export const GROUP_TERRAIN = 0x0002;
export const GROUP_CHASSIS = 0x0004;
/** The street furniture and the trees (M8): an anchored prop's post, a knocked one's body, a thick tree's trunk. */
export const GROUP_PROP = 0x0008;
/** The sea's surface (M8.8 slice 19): nothing collides with it; only the hovercraft's rays meet it. */
export const GROUP_WATER = 0x0010;
/** A slipway's gate in the seawall (M8.8 slice 19): a wall to every chassis but the hovercraft's. */
export const GROUP_GATE = 0x0020;
const ALL = 0xffff;

export function interactionGroups(membership: number, filter: number): number {
  return ((membership & ALL) << 16) | (filter & ALL);
}

export const GROUPS_TERRAIN = interactionGroups(GROUP_TERRAIN, ALL);
export const GROUPS_SOLID = interactionGroups(GROUP_DEFAULT, ALL);
export const GROUPS_CHASSIS_UPRIGHT = interactionGroups(GROUP_CHASSIS, ALL & ~GROUP_TERRAIN);
export const GROUPS_CHASSIS_FLIPPED = interactionGroups(GROUP_CHASSIS, ALL);
/** The hovercraft's chassis: a car's, through the slipways' gates. */
export const GROUPS_HOVER_UPRIGHT = interactionGroups(GROUP_CHASSIS, ALL & ~GROUP_TERRAIN & ~GROUP_GATE);
export const GROUPS_HOVER_FLIPPED = interactionGroups(GROUP_CHASSIS, ALL & ~GROUP_GATE);
export const GROUPS_WATER = interactionGroups(GROUP_WATER, GROUP_WATER);
export const GROUPS_GATE = interactionGroups(GROUP_GATE, ALL);
/** Props collide with everything (M8): a post that holds is a wall, a knocked one a body. */
export const GROUPS_PROP = interactionGroups(GROUP_PROP, ALL);
/**
 * A query that never meets a prop (M8): the wheels' rays (a post is never ground), the police's sight and their
 * boxes' slots, the helicopter's light, the roadblocks' rays. A lamp post hides nobody; the sea is nobody's ground
 * and nobody's cover (M8.8 slice 19).
 */
export const QUERY_NOT_PROP = interactionGroups(ALL, ALL & ~GROUP_PROP & ~GROUP_WATER);
/** The hovercraft's rays (M8.8 slice 19): the ground and the sea, never a prop, nor the gate it passes through. */
export const QUERY_HOVER = interactionGroups(ALL, ALL & ~GROUP_PROP & ~GROUP_GATE);
