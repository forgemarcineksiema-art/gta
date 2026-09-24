/**
 * Optional per-phase timing hook for a sim step.
 *
 * The sim marks the boundary at the end of each phase and nothing else: it has
 * no `lib.dom` and no Node types (`tsconfig.sim.json`), so it cannot read a
 * clock. Whoever installs the hook owns the clock and the arithmetic; with no
 * hook installed a step costs a few null checks. A phase marked twice in a step (the props, before and after the
 * physics) adds both.
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
  /** The street furniture (M8): the contacts and knocks before the physics, the flying bodies read back after it. */
  Props = 5,
}

/** Phase names in `SimPhase` order, for readouts. */
export const SIM_PHASES = ['vehicle', 'traffic', 'peds', 'physics', 'post', 'props'] as const;

/** Called at the end of each phase of a step. */
export type PhaseMark = (phase: SimPhase) => void;
