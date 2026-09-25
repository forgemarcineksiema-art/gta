/**
 * The places' frame (M8.10 slices 8–12, docs/M8.10_PLAN.md): each district's set pieces are built by its own module
 * when the island is. What stands still is statics pushed into the island's chunks (`statics`): drawn in the grid's
 * kit with the buildings, their colliders made with the physics' chunk by their tags (`building`: a wall; `kerb`: ground
 * the wheels ride, a ramp's deck or a kerb; `trunk`: a tree's trunk, in the props' group). What moves (a train, a
 * barrier, a wheel) is the place's own: its bodies made in `world`, its `step` run each fixed step, its pose read by the
 * render's view of it (`src/render/island/places/`).
 */
import type RAPIER from '@dimforge/rapier3d-compat';
import type { StaticDesc } from '../../scene';
import type { IslandFill } from '../fill';
import type { Ground } from '../ground';
import type { IslandNetwork } from '../network';
import type { RoadSurfaces } from '../surfaces';

export interface PlaceContext {
  readonly ground: Ground;
  readonly network: IslandNetwork;
  readonly surfaces: RoadSurfaces;
  readonly fill: IslandFill;
  readonly world: RAPIER.World;
  /** The statics of the chunk holding (x, z): push a thing's there, at its absolute heights. */
  statics(x: number, z: number): StaticDesc[];
}

/** A place's running part: its step (the sim's fixed step), and whatever its view reads off it. */
export interface Place {
  readonly id: string;
  step?(dt: number): void;
}
