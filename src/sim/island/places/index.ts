/** The island's places (M8.10 slices 8–12): each district's module builds its own; those that move run each step. */
import { airfieldPlaces } from './airfield';
import { crownPlaces } from './crown';
import { gardensPlaces } from './gardens';
import type { Place, PlaceContext } from './place';
import { quayPlaces } from './quay';
import { worksPlaces } from './works';

export type { Place, PlaceContext } from './place';

/** Build every district's places into the island; the ones with a step. */
export function buildPlaces(ctx: PlaceContext): Place[] {
  return [...crownPlaces(ctx), ...worksPlaces(ctx), ...gardensPlaces(ctx), ...quayPlaces(ctx), ...airfieldPlaces(ctx)];
}
