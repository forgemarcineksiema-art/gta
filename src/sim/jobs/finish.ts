/** Where a job's finish is reached (the M8.10 bug hunt): the island's roads cross one over another. */
import type { SimWorld } from '../SimWorld';

/** The height a finish's road may be off its ground there (m): a 12 m reach on the steepest street, and more. */
const FINISH_LEVEL = 5;

/**
 * A finish is reached on its own road (the island's ground there, give or take its slope within the reach), not from
 * another under it: Neon Niko's duel ends on the hill 17.7 m over the highway's tunnel, and driving the tunnel won it.
 * `road` is the height of the road the car is on.
 */
export function atFinish(sim: SimWorld, x: number, z: number, road: number): boolean {
  return !sim.island || Math.abs(road - sim.island.ground.surfaceHeight(x, z)) < FINISH_LEVEL;
}
