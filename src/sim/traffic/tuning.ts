/** Every traffic and pedestrian number. Live-editable from the dev panel. */
import type { CarId } from '../vehicle/presets';
import type { BodyWeights } from './bodies';

export interface TrafficTuning {
  agents: number;
  physicsBodies: number;
  spawnMin: number;
  spawnMax: number;
  despawn: number;
  physicsRadius: number;
  physicsRelease: number;
  /** A pursuit unit is lent a body this much further out than a civilian, m. */
  policeBodyReach: number;
  /** Bodies a pursuit may hold at once; the rest of the pool stays with the traffic around the player. */
  policeBodies: number;
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
  /**
   * Traffic lights at the downtown crossings (M5.5 slice 17, city/signals.ts picks them): each pair of arms gets
   * `green` s, `amber` s and `allRed` s, then the other pair; each crossing's cycle is offset `offset` s per block
   * along the diagonal. A chasing unit or a racing rival runs the red.
   */
  signals: { green: number; amber: number; allRed: number; offset: number };
  /**
   * Parked cars in the kerbside bays (M5.5 slice 17): `share` of the bays hold one (the same bays and cars every
   * time, a hash of the bay and the seed), placed `near`–`far` m from the player, at most `max` at once (times the
   * density), apart from the moving traffic's count; swap candidates like any stopped car.
   */
  parked: { share: number; near: number; far: number; max: number };
  /**
   * The player's horn (M6 slice 7): a civilian ahead in the player's lane (within `cone` m across, heading the
   * same way) within `reach` m moves `shift` m toward its kerb for `seconds`, once per `cooldown` s per car.
   */
  horn: { reach: number; cone: number; shift: number; seconds: number; cooldown: number };
  highwayGap: number;
  /** Chance a highway car takes the same lane out of a junction instead of choosing among every exit. */
  highwayKeepLane: number;
  /** A contact above this dv (m/s) takes the car out of lane control for `disturbedTime` s. */
  disturbedImpact: number;
  disturbedTime: number;
  /** After the disturbance an upright car within this distance of its path drives back onto it; further off it is a wreck, m. */
  reattachDistance: number;
  reattachBlend: number;
  /** Still spinning faster than this (rad/s) after `disturbedTime`: wait before reattaching. */
  settleSpin: number;
  /**
   * Back on its wheels (M8.6 D2): a shaken car drives again only level within `reattachLevel` degrees, rocking slower
   * than `reattachSpin` rad/s about its long and cross axes, its body within `reattachHeight` m of its road; one at rest
   * leaning further (on a bumper, a kerb's edge) is rocked toward level at `rockSpin` rad/s every `rockEvery` s.
   */
  reattachLevel: number;
  reattachSpin: number;
  reattachHeight: number;
  rockSpin: number;
  rockEvery: number;
  /** Disturbed this long without settling (on its side, spinning, stuck), a car is a wreck, s. */
  disturbedMax: number;
  /** A single contact of this dv wrecks outright, m/s. */
  wreckImpact: number;
  /** Damage: every contact dents by (dv - threshold) x perDv; at 1 the car is a wreck. */
  damageThreshold: number;
  damagePerDv: number;
  /** Police cars are built for contact: their thresholds are multiplied and their damage divided by this. */
  policeArmour: number;
  wreckLinger: number;
  /** A wreck this old is towed away the moment the player is not looking at it: its agent slot (and its body) go back to the pool, s. */
  wreckTow: number;
  /** A wreck closer than this counts as seen whatever the heading, m. */
  wreckTowNear: number;
  /** Half angle of the forward cone that counts as the player's view, deg. */
  wreckTowConeDeg: number;
  /**
   * A stopped car at rest on a side or an end for `tipAfter` s is given `tipSpin` rad/s about the axis that lays it on
   * its wheels (M8.6 D3): a box rests on any face, a car does not stand on its nose.
   */
  tipAfter: number;
  tipSpin: number;
  honkCooldown: number;
  wobbleTime: number;
  /** Lent bodies: heading rate per radian of error (1/s) and its cap (rad/s). Stable while yawGain × dt < 1. */
  yawGain: number;
  yawRateMax: number;
  /**
   * Held up (M8.6 D6): a lent car moving at under a third of its command for `holdAfter` s while it touches something
   * stops pushing and holds for `holdFor` s. A ram at a moving player is the one shove by design.
   */
  holdAfter: number;
  holdFor: number;
  subLaneOffsets: { highway: readonly number[]; street: readonly number[] };
  /**
   * The civilian bodies' spawn shares and the place's factors (docs/DESIGN.md §13.11): buses on the streets and
   * three times as many on the Crown avenues, never on the highway or the chicane; trucks and pickups in the
   * Works, taxis round the tower. The player's shells never spawn ambient.
   */
  bodies: BodyWeights;
  /** Each driver's share of the lane's limit, drawn at spawn (docs/DESIGN.md §13.8); the weights sum to 1. */
  pace: { values: readonly number[]; weights: readonly number[] };
  /** The class's share on top: a van a little slower, a sports car a little faster. */
  classPace: Record<CarId, number>;
  /**
   * Each driver's time gap to what is ahead (s, drawn between the two); `badShare` of the drivers are bad: a
   * `badGap` s gap, a `badDrift` m weave in the lane, a junction jumped after `badClaimAfter` s.
   */
  temper: { gapTime: readonly [number, number]; badShare: number; badGap: number; badDrift: number; badClaimAfter: number };
  /**
   * Two lanes a direction (the highway): a car whose leader within `look` m is `slowerBy` m/s slower than it
   * wants moves over when the other lane is clear `clear` s ahead and behind, and back when its own is; never
   * within `endClear` m of the junction; `cooldown` s between changes.
   */
  overtake: { slowerBy: number; clear: number; look: number; endClear: number; cooldown: number };
  /** The player coming head-on in a car's lane inside `seconds`: it brakes at `brake` m/s², pulls `offset` m to its kerb and honks, for `hold` s. */
  flinch: { seconds: number; offset: number; brake: number; hold: number };
  /** A driver the player bumps loses it one time in `1 / share`: for `seconds` it drives at `pace` of the limit after the player, honking every `honkEvery` s. */
  angry: { share: number; seconds: number; pace: number; honkEvery: number };
  /** A lit police car within `behind` m on a car's lane: it pulls `offset` m to its kerb and slows to `speed` m/s until the unit is past and `hold` s more (a van only slows). */
  pullOver: { behind: number; offset: number; speed: number; hold: number };
  /** Stopped `wait` s behind a dead car (a wreck, an abandoned car), a car goes round it on the oncoming side when that is clear `clearAhead` m. */
  gawk: { wait: number; clearAhead: number };
  /**
   * The standoff (M5.5 gate): a civilian held up nose to nose by the player, who is not moving on (under
   * `playerSpeed` m/s), for `wait` s goes round them on the side away from them (M7: to its kerb, or out on the
   * oncoming side when the player stands at its kerb) at `creep` m/s: neither would ever give way.
   */
  standoff: { wait: number; playerSpeed: number; creep: number };
  /** Metres a second a car's place across its lane moves toward where it wants to be. */
  shiftRate: number;
  /** Traffic by heat level 0..5: the streets thin as the chase grows. */
  densityByLevel: readonly number[];
  /** A class and paint are not spawned within this of the same class and paint (m). */
  cloneDistance: number;
  mass: Record<CarId, number>;
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
  /** A diver the player passes inside this distance scores a near miss, m. */
  scoreDistance: number;
  /**
   * The four silhouettes' shares by district (M5.5 slice 20): a man in a long coat, a woman with a bag, a
   * worker in a hard hat, an old man with a stick; coats in Crown Heights, workers in the Works, the old
   * men in the Gardens, bags on the Quay.
   */
  looks: Readonly<Record<string, readonly [number, number, number, number]>>;
}

export const TRAFFIC: TrafficTuning = {
  agents: 48,
  physicsBodies: 16,
  spawnMin: 150,
  spawnMax: 300,
  despawn: 320,
  physicsRadius: 40,
  physicsRelease: 60,
  policeBodyReach: 25,
  policeBodies: 10,
  speedStreet: 14,
  speedHighway: 22,
  speedAvenue: 16,
  speedParkway: 16,
  speedQuay: 14,
  speedService: 11,
  speedJunction: 10,
  accel: 4,
  brake: 6,
  gapMin: 6,
  gapTime: 1.2,
  playerGap: 25,
  playerLateral: 2.6,
  junctionWait: 9,
  junctionClear: 4,
  signals: { green: 14, amber: 3, allRed: 1, offset: 6 },
  parked: { share: 0.4, near: 80, far: 220, max: 10 },
  horn: { reach: 25, cone: 2.2, shift: 0.8, seconds: 2, cooldown: 4 },
  highwayGap: 25,
  highwayKeepLane: 0.85,
  disturbedImpact: 1.5,
  disturbedTime: 2.0,
  reattachDistance: 14,
  reattachBlend: 1.5,
  settleSpin: 2,
  reattachLevel: 6,
  reattachSpin: 0.6,
  reattachHeight: 0.15,
  rockSpin: 1.2,
  rockEvery: 0.5,
  disturbedMax: 8,
  wreckImpact: 7,
  damageThreshold: 3,
  damagePerDv: 0.1,
  policeArmour: 1.6,
  wreckLinger: 10,
  wreckTow: 60,
  wreckTowNear: 40,
  wreckTowConeDeg: 55,
  tipAfter: 0.5,
  tipSpin: 2.2,
  honkCooldown: 3,
  wobbleTime: 1,
  yawGain: 3,
  yawRateMax: 1.5,
  holdAfter: 0.6,
  holdFor: 1.5,
  // The highway's two lanes per direction are real graph lanes now, so nothing sits off its lane.
  subLaneOffsets: { highway: [0], street: [0] },
  bodies: {
    base: {
      sedan: 0.24, hatch: 0.2, estate: 0.1, suv: 0.14, pickup: 0.1, taxi: 0.06, truck: 0.06, bus: 0.06, icecream: 0,
      // the wanted board's cars (M6) are never traffic
      wagon: 0, pizza: 0, wrecker: 0, twin: 0, fakecop: 0, partybus: 0, lowrider: 0, limo: 0, bubble: 0, phantom: 0, chiefcar: 0,
      roadster: 0, sweeper: 0, hotdog: 0,
      // the crazy cars (M8.8 phase F) are hidden, never traffic
      roller: 0, monster: 0, trolley: 0, hover: 0,
      // the delivery scooters (M8.8 slice 16): twice as many in Crown Heights and on Coral Quay, never on the highway
      scooter: 0.05,
    },
    places: {
      crown: { taxi: 4, scooter: 2 },
      foundry: { truck: 3, pickup: 2 },
      gardens: { estate: 1.6, suv: 1.5 },
      marina: { hatch: 1.5, sedan: 1.2, scooter: 2 },
      avenue: { bus: 3, taxi: 1.5 },
      highway: { truck: 2, taxi: 0.5, bus: 0, scooter: 0 },
      service: { bus: 0 },
    },
  },
  pace: { values: [0.85, 1.0, 1.1, 1.18], weights: [0.15, 0.55, 0.22, 0.08] },
  classPace: { compact: 1, muscle: 1, heavy: 0.9, sports: 1.1, police: 1, offroad: 1, moto: 1 },
  temper: { gapTime: [0.9, 1.6], badShare: 0.125, badGap: 0.6, badDrift: 0.5, badClaimAfter: 3 },
  overtake: { slowerBy: 2, clear: 1.2, look: 40, endClear: 40, cooldown: 4 },
  flinch: { seconds: 2.5, offset: 1.2, brake: 8, hold: 1.5 },
  angry: { share: 0.1, seconds: 8, pace: 1.3, honkEvery: 2 },
  // offset 3 (M5.5 gate): at 1.5 a car pulling over for a chase still filled the suspect's lane and held it to 4 m/s;
  // 3 m clears a car's width beside it and stops 0.2 m short of the kerbside bays
  pullOver: { behind: 60, offset: 3, speed: 4, hold: 3 },
  gawk: { wait: 2, clearAhead: 40 },
  standoff: { wait: 1, playerSpeed: 3, creep: 1.5 },
  shiftRate: 2.5,
  densityByLevel: [1, 1, 1, 0.9, 0.6, 0.6],
  cloneDistance: 150,
  mass: { compact: 1050, muscle: 1300, heavy: 2400, sports: 1180, police: 1620, offroad: 1950, moto: 290 },
  friction: 0.4,
  restitution: 0.3,
  linearDamping: 0.3,
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
  scoreDistance: 3,
  looks: {
    crown: [0.45, 0.3, 0.1, 0.15],
    foundry: [0.1, 0.15, 0.6, 0.15],
    gardens: [0.15, 0.3, 0.1, 0.45],
    marina: [0.15, 0.5, 0.15, 0.2],
  },
};
