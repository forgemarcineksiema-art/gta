/** Unit rosters, sight and ramming. Heat picks the row; everything else is per unit. */
export interface PoliceTuning {
  /** Units at once by heat level (index 0 = heat 0). */
  budget: number[];
  /** How many of that roster are interceptors, by level. */
  interceptors: number[];
  escapeSeconds: number[];
  sightRange: number;
  sightEveryTicks: number;
  sightHeight: number;
  viewHalfAngleDeg: number;
  viewNear: number;
  spawnMin: number;
  spawnMax: number;
  spawnBehind: number;
  spawnSample: number;
  spawnEndInset: number;
  spawnClearance: number;
  spawnRetrySeconds: number;
  reinforceSeconds: number;
  spawnHeadingWeight: number;
  withdrawRange: number;
  projectSeconds: number;
  routeSeconds: number;
  targetHeadingWeight: number;
  chaseSpeed: number;
  ramRange: number;
  ramLeadSeconds: number;
  ramClosingSpeed: number;
  ramAcceleration: number;
  ramContactDv: number;
  ramCooldown: number;
  /** Beyond this gap a unit runs at `catchUpSpeed`: a patrol must be able to arrive, not only to be outrun. */
  catchUpRange: number;
  catchUpSpeed: number;
  /** While nobody is being chased, a unit further than this is sent home and another comes on duty nearby, m. */
  patrolRecycle: number;
  /** Interceptors chase faster and PIT the rear quarter instead of shoving the flank. */
  interceptorSpeed: number;
  pitRange: number;
  pitAcceleration: number;
  pitSideOffset: number;
  /** Boxed in: `units` live police cars within `range` m while the player is under `speed` m/s fills the bar in `seconds`; moving drains it. */
  busted: { units: number; range: number; speed: number; seconds: number; drainPerSecond: number };
  /**
   * A swap nobody saw: the units drive to the abandoned car and box it for `seconds` counted while two of
   * them (or all there are) are within `range` m (the fifth and later hold `range` m back), `maxSeconds` at
   * most in all; a unit
   * drives the lanes until it is within `approach` m, then straight into its slot, round the empty car at
   * `detourSpeed` m/s. The slots fill rear, the sides, then the front: nobody has to get past it.
   */
  box: { seconds: number; range: number; approach: number; maxSeconds: number; detourSpeed: number };
  /** The disguise: the dispatcher notices the missing unit `seconds` after the player takes a police car, and the cover is blown. */
  disguise: { seconds: number };
  /**
   * The arrest: under `playerSpeed` m/s (released above `releaseSpeed`) units within `range` m take the slots
   * `rear` / `front` m along and `side` m across the player, braking at `decel` to arrive within `arrive` m;
   * the rest stand by `standby` m behind. `accel` caps the body's velocity change; `keep` m of hysteresis on a slot.
   */
  arrest: { playerSpeed: number; releaseSpeed: number; range: number; rear: number; front: number; side: number; standby: number; decel: number; arrive: number; accel: number; keep: number; clear: number; detourSpeed: number };
  /** Sight lost: units drive to the last fix and fan out once within `reach` m of it. */
  search: { reach: number };
  /** From `fromLevel` every second saloon routes to the player's position `seconds` ahead, until within `breakRange` m. */
  cutoff: { fromLevel: number; seconds: number; breakRange: number };
  /** A police car the player hits at this dv while nobody chases notices (and heat rises); once per `assaultCooldown` s per car. */
  assaultDv: number;
  assaultCooldown: number;
}

export const POLICE: PoliceTuning = {
  budget: [0, 2, 4, 5, 6, 8],
  interceptors: [0, 0, 1, 2, 2, 3],
  escapeSeconds: [0, 6, 8, 10, 12, 15],
  sightRange: 90,
  sightEveryTicks: 6,
  sightHeight: 1.2,
  viewHalfAngleDeg: 55,
  viewNear: 40,
  spawnMin: 45,
  spawnMax: 180,
  spawnBehind: 65,
  spawnSample: 10,
  spawnEndInset: 6,
  spawnClearance: 14,
  spawnRetrySeconds: 0.25,
  reinforceSeconds: 8,
  spawnHeadingWeight: 30,
  withdrawRange: 120,
  projectSeconds: 1.2,
  routeSeconds: 0.5,
  targetHeadingWeight: 12,
  chaseSpeed: 30,
  ramRange: 14,
  ramLeadSeconds: 0.15,
  ramClosingSpeed: 6,
  ramAcceleration: 14,
  ramContactDv: 0.8,
  ramCooldown: 1,
  interceptorSpeed: 38,
  pitRange: 11,
  catchUpRange: 55,
  catchUpSpeed: 48,
  pitAcceleration: 22,
  pitSideOffset: 1.1,
  patrolRecycle: 260,
  busted: { units: 2, range: 7, speed: 1.39, seconds: 3, drainPerSecond: 0.7 },
  box: { seconds: 5, range: 8, approach: 20, maxSeconds: 15, detourSpeed: 10 },
  disguise: { seconds: 30 },
  // clear: a unit passes the player's car no closer than this (m), at detourSpeed (m/s)
  arrest: { playerSpeed: 6, releaseSpeed: 9, range: 60, rear: 5.6, front: 5.6, side: 3.2, standby: 12, decel: 6, arrive: 1.2, accel: 12, keep: 5, clear: 4, detourSpeed: 5 },
  search: { reach: 30 },
  cutoff: { fromLevel: 2, seconds: 4, breakRange: 40 },
  assaultDv: 1.5,
  assaultCooldown: 3,
};
