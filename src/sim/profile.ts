/**
 * Optional per-phase timing hook for a sim step.
 *
 * The sim marks the boundary at the end of each phase and nothing else: it has
 * no `lib.dom` and no Node types (`tsconfig.sim.json`), so it cannot read a
 * clock. Whoever installs the hook owns the clock and the arithmetic; with no
 * hook installed a step costs five null checks.
 */
export enum SimPhase {
  /** Player vehicle: controls, tyres, drift, damage. */
  Vehicle = 0,
  /** Traffic agents: lanes, junctions, bodies, tow-away. */
  Traffic = 1,
  /** Pedestrians. */
  Peds = 2,
  /** `RAPIER.World.step`. */
  Physics = 3,
  /** Transforms, life, recorder, reset projection. */
  Post = 4,
}

/** Phase names in `SimPhase` order, for readouts. */
export const SIM_PHASES = ['vehicle', 'traffic', 'peds', 'physics', 'post'] as const;

/** Called at the end of each phase of a step. */
export type PhaseMark = (phase: SimPhase) => void;
