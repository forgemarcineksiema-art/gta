/** Every traffic and pedestrian number. Live-editable from the dev panel. */
export interface TrafficTuning {
  agents: number;
  physicsBodies: number;
  spawnMin: number;
  spawnMax: number;
  despawn: number;
  physicsRadius: number;
  physicsRelease: number;
  speedStreet: number;
  speedHighway: number;
  speedAvenue: number;
  speedParkway: number;
  speedQuay: number;
  speedService: number;
  speedJunction: number;
  accel: number;
  brake: number;
  gapMin: number;
  gapTime: number;
  playerGap: number;
  playerLateral: number;
  junctionWait: number;
  junctionClear: number;
  highwayGap: number;
  disturbedImpact: number;
  disturbedTime: number;
  reattachDistance: number;
  reattachBlend: number;
  wreckImpact: number;
  wreckLinger: number;
  honkCooldown: number;
  wobbleTime: number;
  subLaneOffsets: { highway: readonly number[]; street: readonly number[] };
  kindWeights: { compact: number; muscle: number; heavy: number };
  mass: { compact: number; muscle: number; heavy: number };
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
}

export interface PedTuning {
  count: number;
  spawnMin: number;
  spawnMax: number;
  despawn: number;
  walkSpeed: readonly [number, number];
  lookAhead: number;
  corridorHalfWidth: number;
  diveSpeed: number;
  diveTime: number;
  getUpTime: number;
  fistTime: number;
  guaranteeDistance: number;
  hopDistance: number;
}

export const TRAFFIC: TrafficTuning = {
  agents: 48,
  physicsBodies: 16,
  spawnMin: 150,
  spawnMax: 300,
  despawn: 320,
  physicsRadius: 40,
  physicsRelease: 60,
  speedStreet: 14,
  speedHighway: 22,
  speedAvenue: 16,
  speedParkway: 16,
  speedQuay: 14,
  speedService: 11,
  speedJunction: 8,
  accel: 3,
  brake: 6,
  gapMin: 6,
  gapTime: 1.2,
  playerGap: 25,
  playerLateral: 2.6,
  junctionWait: 6,
  junctionClear: 26,
  highwayGap: 25,
  disturbedImpact: 1.5,
  disturbedTime: 2.0,
  reattachDistance: 4,
  reattachBlend: 1.5,
  wreckImpact: 7,
  wreckLinger: 10,
  honkCooldown: 3,
  wobbleTime: 1,
  subLaneOffsets: { highway: [-2, 6], street: [0] },
  kindWeights: { compact: 0.5, muscle: 0.3, heavy: 0.2 },
  mass: { compact: 1050, muscle: 1300, heavy: 2400 },
  friction: 0.6,
  restitution: 0.3,
  linearDamping: 0.6,
  angularDamping: 1.5,
};

export const PEDS: PedTuning = {
  count: 40,
  spawnMin: 90,
  spawnMax: 180,
  despawn: 220,
  walkSpeed: [1.1, 1.6],
  lookAhead: 0.7,
  corridorHalfWidth: 2.6,
  diveSpeed: 6,
  diveTime: 0.5,
  getUpTime: 0.8,
  fistTime: 4,
  guaranteeDistance: 1.3,
  hopDistance: 3,
};
