/** The island's places (M8.10 slices 8–12): each district's module builds its own; those that move run each step. */
import type RAPIER from '@dimforge/rapier3d-compat';
import { airfieldPlaces } from './airfield';
import { crownPlaces } from './crown';
import { gardensPlaces } from './gardens';
import type { Place, PlaceContext } from './place';
import { makeQuay, quayPlaces, type QuayData, type QuayPlace } from './quay';
import { makeWorks, worksPlaces, type WorksData, type WorksPlace } from './works';

export type { Place, PlaceContext } from './place';

/** Build every district's places into the island; the ones with a step. */
export function buildPlaces(ctx: PlaceContext): Place[] {
  return [...crownPlaces(ctx), ...worksPlaces(ctx), ...gardensPlaces(ctx), ...quayPlaces(ctx), ...airfieldPlaces(ctx)];
}

/** A place as the island's bake keeps it (M8.10 slice 18): a running one's data, the rest whole (they are data). */
export function placeData(p: Place): unknown {
  return p.id === 'quay' ? (p as QuayPlace).data : p.id === 'works' ? (p as WorksPlace).data : p;
}

/** A place from the island's bake: a running one made again in `world` (the train on its line, the duck in the bay). */
export function placeFrom(world: RAPIER.World, data: unknown): Place {
  const id = (data as Place).id;
  return id === 'quay' ? makeQuay(world, data as QuayData) : id === 'works' ? makeWorks(world, data as WorksData) : (data as Place);
}
