/**
 * The places' shapes in the ground (M8.10 slices 8–12, docs/M8.10_PLAN.md): each district's module lowers or raises
 * the plan's hills where its set piece needs it (the quarry's pit, the canal's channel, the golf's dunes, the islet's
 * landing) before the roads are graded into them. Each takes the height so far and gives it back, changed or not.
 * Under the water the sea's floor takes the places' shapes too (the reef), a place's decks read as a road to the
 * wheels, and the island's wall opens where a deck leaves the shore.
 * A shape module reads the plan only (`../plan`, `../geom`): the ground reads the shapes.
 */
import { airfieldShape } from './airfield';
import { crownShape } from './crown';
import { gardensShape } from './gardens';
import { quayPaved, quaySeabed, quayShape, quayShore } from './quay';
import { worksShape } from './works';

/** The hills' height at (x, z) with every place's shape. */
export function shaped(x: number, z: number, h: number): number {
  return airfieldShape(x, z, quayShape(x, z, gardensShape(x, z, worksShape(x, z, crownShape(x, z, h)))));
}

/** The sea's floor at (x, z) with every place's shape under the water (the Quay's reef). */
export function seabed(x: number, z: number, h: number): number {
  return quaySeabed(x, z, h);
}

/** Whether a place paves (x, z) off the roads (a pier's boards, a stand's concourse): the wheels read a road there. */
export function placePaved(x: number, z: number): boolean {
  return quayPaved(x, z);
}

/** Whether the island's wall opens at (x, z) on a shore: where a place's deck leaves the land. */
export function shoreOpen(x: number, z: number): boolean {
  return quayShore(x, z);
}
