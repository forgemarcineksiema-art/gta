/**
 * The places' shapes in the ground (M8.10 slices 8–12, docs/M8.10_PLAN.md): each district's module lowers or raises
 * the plan's hills where its set piece needs it (the quarry's pit, the canal's channel, the golf's dunes, the islet's
 * landing) before the roads are graded into them. Each takes the height so far and gives it back, changed or not.
 * A shape module reads the plan only (`../plan`, `../geom`): the ground reads the shapes.
 */
import { airfieldShape } from './airfield';
import { crownShape } from './crown';
import { gardensShape } from './gardens';
import { quayShape } from './quay';
import { worksShape } from './works';

/** The hills' height at (x, z) with every place's shape. */
export function shaped(x: number, z: number, h: number): number {
  return airfieldShape(x, z, quayShape(x, z, gardensShape(x, z, worksShape(x, z, crownShape(x, z, h)))));
}
