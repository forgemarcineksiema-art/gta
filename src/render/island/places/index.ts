/**
 * The views of the island's places that move (M8.10 slices 8–12): each district's module draws what its sim place
 * moves (a train, a barrier, a wheel), reading the place's pose each frame. What stands still is drawn with the
 * island's statics (`IslandView`). Reads the sim, never writes it.
 */
import type * as THREE from 'three';
import type { Island } from '../../../sim/island/Island';
import { airfieldViews } from './airfield';
import { crownViews } from './crown';
import { gardensViews } from './gardens';
import { quayViews } from './quay';
import { worksViews } from './works';

/** A moving place's view: updated each frame (`alpha` the step's fraction, `dt` the frame's seconds). */
export interface PlaceView {
  update?(alpha: number, dt: number): void;
  dispose?(): void;
}

export function placeViews(group: THREE.Group, island: Island): PlaceView[] {
  return [...crownViews(group, island), ...worksViews(group, island), ...gardensViews(group, island), ...quayViews(group, island), ...airfieldViews(group, island)];
}
