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
  busted: { units: 2, range: 6, speed: 1.39, seconds: 3, drainPerSecond: 0.7 },
};
