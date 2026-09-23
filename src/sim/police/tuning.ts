import type { CarId } from '../vehicle/presets';
/** Unit rosters, sight and ramming. Heat picks the row; everything else is per unit. */
export interface PoliceTuning {
  /** Units at once by heat level (index 0 = heat 0: the patrols on the beat, no chase). */
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
   * Roadblocks (level `fromLevel`+, the pursuit active): at a chokepoint `minAhead`..`maxAhead` m ahead on the
   * player's road, out of view and never nearer than `minDistance`, every `retryAfter` s while none stands.
   * Two cars `gap` m apart across the lane with a `sawhorseWidth` m sawhorse between (passing it costs
   * `sawhorseLoss` of the speed); a spike strip `spikeBefore` m before it across the open side, `spikeLength`
   * m across and `spikeDepth` m along. A `breachClass` car at `breachSpeed` m/s shoves a roadblock car aside
   * taking `breachDamageFactor` of the damage; anything else hits a braced car and takes `carDamageFactor`
   * (a wall is 1, traffic 0.7). Cleared `clearPast` m past it or when the chase ends.
   */
  roadblock: {
    fromLevel: number; minAhead: number; maxAhead: number; minDistance: number; cars: number; gap: number;
    sawhorseLoss: number; sawhorseWidth: number; spikeBefore: number; spikeLength: number; spikeDepth: number;
    breachSpeed: number; breachClass: CarId; breachDamageFactor: number; carDamageFactor: number; retryAfter: number; clearPast: number;
  };
  /** A crossed spike strip: every tyre's grip × `grip` and a `pull` N sideways at the rear axle until a swap, the door or a fresh car. */
  spike: { grip: number; pull: number };
  /**
   * Parked patrols (level `fromLevel`+): `count` cars, one per parked junction, at the junctions within
   * `radius` m of the player; the light bar on within `lightsRange` m. One that sees the player joins the chase.
   */
  parked: { fromLevel: number; count: number; radius: number; lightsRange: number };
  /** Speed cameras: a flash when the car crosses the line more than `overKmh` over the road's limit; `cooldown` s per camera. */
  cameras: { count: number; overKmh: number; cooldown: number };
  /** Heavy vans: from `fromLevel`, `share` of the roster, shoving the rear corner `aimSide` m off the centre line at `ramAcceleration` (m/s²). */
  heavy: { fromLevel: number; share: number; ramAcceleration: number; aimSide: number };
  /**
   * The Chief (level `level`): an interceptor in ink at `speed` m/s whose PIT (from `pitRange` m, at
   * `pitAcceleration`) leads the player's turn; replaced `reinforceFactor` × `reinforceSeconds` after a wreck.
   */
  chief: { level: number; speed: number; pitAcceleration: number; pitRange: number; reinforceFactor: number };
  /**
   * The arrest: under `playerSpeed` m/s (released above `releaseSpeed`) units within `range` m take the slots
   * `rear` / `front` m along and `side` m across the player, braking at `decel` to arrive within `arrive` m;
   * the rest stand by `standby` m behind. `accel` caps the body's velocity change; `keep` m of hysteresis on a slot.
   */
  arrest: { playerSpeed: number; releaseSpeed: number; range: number; rear: number; front: number; side: number; standby: number; decel: number; arrive: number; accel: number; keep: number; clear: number; detourSpeed: number };
  /** Sight lost: units drive to the last fix and fan out once within `reach` m of it; the radar's disc there grows from `discMin` to `discMax` m over the cooldown. */
  search: { reach: number; discMin: number; discMax: number };
  /**
   * Pressure (docs/DESIGN.md §13.9): within `within` m a chasing unit drives at the player's speed plus `over`
   * (never under `min`), up to its class's speed; within `attack` m it closes at its class's speed for the ram
   * or the PIT; the catch-up only where the player cannot see the unit.
   */
  pressure: { within: number; attack: number; over: number; min: number };
  /** Seconds before a lost unit is replaced, by heat level 0..5: the cadence tightens as the chase grows. */
  refillSeconds: number[];
  /** From `fromLevel` one arrival in `every` pulls out of a side street `ahead` m in front of the player, in view. */
  arriveInView: { fromLevel: number; every: number; ahead: readonly [number, number] };
  /** The police driving mode: brakes and pulls away at `accelFactor` of traffic's; goes round a car `slowerBy` m/s slower within `look` m. */
  mode: { accelFactor: number; slowerBy: number; look: number };
  /** From `fromLevel` every second saloon routes to the player's position `seconds` ahead, until within `breakRange` m. */
  cutoff: { fromLevel: number; seconds: number; breakRange: number };
  /** A police car the player hits at this dv while nobody chases notices (and heat rises); once per `assaultCooldown` s per car. */
  assaultDv: number;
  assaultCooldown: number;
}

export const POLICE: PoliceTuning = {
  // two on the beat at heat 0 (M5.5): the city's eyes, lane drivers with the lights off
  budget: [2, 2, 4, 5, 6, 8],
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
  roadblock: {
    fromLevel: 3, minAhead: 150, maxAhead: 300, minDistance: 100, cars: 2, gap: 5,
    sawhorseLoss: 0.05, sawhorseWidth: 3, spikeBefore: 25, spikeLength: 4, spikeDepth: 0.8,
    breachSpeed: 22.2, breachClass: 'heavy', breachDamageFactor: 0.3, carDamageFactor: 3.5, retryAfter: 20, clearPast: 150,
  },
  spike: { grip: 0.6, pull: 900 },
  parked: { fromLevel: 3, count: 4, radius: 450, lightsRange: 200 },
  cameras: { count: 10, overKmh: 20, cooldown: 30 },
  heavy: { fromLevel: 4, share: 0.5, ramAcceleration: 20, aimSide: 1.3 },
  chief: { level: 5, speed: 45, pitAcceleration: 30, pitRange: 14, reinforceFactor: 2 },
  // clear: a unit passes the player's car no closer than this (m), at detourSpeed (m/s)
  arrest: { playerSpeed: 6, releaseSpeed: 9, range: 60, rear: 5.6, front: 5.6, side: 3.2, standby: 12, decel: 6, arrive: 1.2, accel: 12, keep: 5, clear: 4, detourSpeed: 5 },
  search: { reach: 30, discMin: 60, discMax: 150 },
  pressure: { within: 60, attack: 25, over: 4, min: 12 },
  refillSeconds: [8, 10, 8, 7, 6, 5],
  arriveInView: { fromLevel: 2, every: 3, ahead: [60, 100] },
  mode: { accelFactor: 1.5, slowerBy: 3, look: 25 },
  cutoff: { fromLevel: 2, seconds: 4, breakRange: 40 },
  assaultDv: 1.5,
  assaultCooldown: 3,
};
