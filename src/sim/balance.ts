/** Run economy. Heat is a ratchet; only ending a run resets it. Every money number lives here. */
export const BALANCE = {
  heatThresholds: [20, 40, 60, 80, 100],
  heat: {
    trafficTakedown: 4,
    policeTakedown: 10,
    billboard: 2,
    camera: 5,
    roadblock: 6,
    /** Hitting a police car nobody was chasing you in. */
    policeHit: 4,
  },
  /** Paid into the bag per event (docs/DESIGN.md §3.3). Coins never go here; the bag is at risk until a door. */
  bag: {
    billboard: 500,
    camera: 300,
    cameraPerKmh: 20,
    trafficTakedown: 800,
    policeTakedown: 1500,
    roadblock: 1000,
    escapePerLevel: 500,
    jump: 400,
    jumpPerSecond: 200,
  },
  /** The door's multiplier by the highest level at which the pursuit went active (index = level; 0 and 1 both x1). */
  multiplier: [1, 1, 1.25, 1.6, 2.2, 3],
  /** Busted banks this share of the bag, with no multiplier. */
  fine: 0.5,
  /** Pulling into a drop-off under `enterSpeed` (m/s) starts the door; it takes `closeSeconds` to shut, busted live. */
  door: { closeSeconds: 3, enterSpeed: 8 },
  /**
   * Coins on the road (docs/DESIGN.md §3.5): a coin, the cap a line ends on, the pitch along a line (m) and a
   * line's length; the layout's `trails` random walks of `trailLength` lanes, the share of the roads left that
   * get a `filler`, the share of figures that `weave` onto the next lane; the pickup `reach` past the bumpers,
   * the doors and about the bonnet (m); the launch a ramp's `arc` is laid for (m/s, m/s² with the car's gravity).
   */
  coin: {
    value: 10, cap: 50, pitch: 4.5, runMin: 8, runMax: 12,
    trails: 10, trailLength: 8, filler: 0.55, weave: 0.45,
    reach: { side: 1.2, ahead: 1.0, up: 1.5 },
    arc: { speed: 27, gravity: 13.3 },
  },
  /** A wreck spills `share` of the bag as `coins` coins from `startAhead` m at `pitch` along the lane, for `seconds`. */
  spill: { share: 0.3, coins: 12, seconds: 10, startAhead: 10, pitch: 4 },
  /**
   * Stunt jumps (slice 6): `count` ramps, each `length` m up to `height` m and as far down again; a launch
   * off one that stays up `minAirSeconds` pays the bag (`bag.jump` + `bag.jumpPerSecond` × airtime); `runOut`
   * m of clear ground beyond the landing at 90 km/h.
   */
  jumps: { count: 20, minAirSeconds: 0.5, length: 9, height: 1.6, runOut: 25 },
  /**
   * Jobs (docs/M5_PLAN.md slices 1–3): a `markerRadius` m ring starts one, arriving within the same radius of
   * its target pays payout × (1 + timeBonus × remaining / limit) for a timed delivery; done and failed show for
   * `holdSeconds`, the card for `cardSeconds`. The generator places `counts` of each kind at least
   * `markerMinGap` m apart. A delivery's limit is `limitFactor` × its lane-path time at the lanes' limits,
   * floored at `limitMin` s, its payout `payoutPerKm` of that path clamped; its drop-off is the nearest at least
   * `minPath` m away by path. An order pays by class less `stagePenalty` per damage stage, `limitSeconds` from
   * the swap; the traffic guarantees the car `ensureMin`–`ensureMax` m away, re-checked every `ensureSeconds`,
   * cruising at `cruise` of its lanes' limits so a hunter can close on it, and its ring shows within `ringRange`
   * m. An escape pays `bounty` × level on the escape.
   */
  jobs: {
    markerRadius: 4, beaconHeight: 3, timeBonus: 0.5, holdSeconds: 2, cardSeconds: 1.5, markerMinGap: 60,
    counts: { delivery: 6, order: 6, escape: 4 },
    delivery: { payoutPerKm: 4000, payoutMin: 5000, payoutMax: 12000, limitFactor: 1.3, limitMin: 45, heat: 6, minPath: 400 },
    order: {
      payout: { compact: 4000, heavy: 5000, muscle: 6000, sports: 8000 }, stagePenalty: 0.1, limitSeconds: 240, heat: 4,
      ensureMin: 300, ensureMax: 600, ensureSeconds: 5, ringRange: 150, cruise: 0.5,
    },
    escape: { bounty: 1500, levels: [2, 2, 3, 4] },
  },
  /** The garage's catalogue (docs/M5_PLAN.md D13): cash only; the muscle car is owned from the start. */
  prices: { compact: 10000, heavy: 30000, sports: 60000, police: 120000 },
  /** Each upgrade tier's price, tier 1 to 3, the same for every stat and car. */
  tierPrices: [2000, 5000, 12000],
  /** Multipliers on the preset per tier 0..3 (D8): power × torqueMax, grip × muFront and muRear, boost × boostDrain. */
  tiers: {
    power: [1, 1.06, 1.12, 1.2],
    grip: [1, 1.04, 1.08, 1.12],
    boost: [1, 0.9, 0.8, 0.7],
  },
  /** One-shot prep items for the next run (DESIGN.md §3.4): the lawyer keeps `lawyerKeep` of the bag when busted, the fence adds `fenceBonus` to the multiplier. */
  prep: { lawyer: 5000, lawyerKeep: 0.75, fence: 8000, fenceBonus: 0.5 },
  /** The door's rewarded offer: above `doorThreshold` in the bag the video doubles it (`doorMultiplier`); the idle arrow turns to the doors above it too. */
  offer: { doorThreshold: 8000, doorMultiplier: 2 },
  /** Daily challenge rewards by template weight, and the streak's cash for day 1..7 (day 7 on repeats). */
  dailies: { rewards: [3000, 5000, 10000], streak: [500, 1000, 1500, 2000, 3000, 4000, 5000] },
  /** The save: one key, written at most once per `debounceSeconds`; everything filled must stay under `maxBytes`. */
  save: { key: 'save', debounceSeconds: 1, maxBytes: 32768 },
  /**
   * The M4 gate's measurements (docs/M4_REPORT.md, PROGRESS 2026-09-23, commit 74c827e and the coin lines of
   * 3ae1f72; seeds 42 / 7 / 123): bag a minute from heat 0 with the novice bot (336–476, midpoint), coins a
   * minute with the coin lines (32–40, worth 426–564), run length (no run ended in 10 min from heat 0: the
   * bot takes no door and nothing arrests it at heat 0–1, so 600 is a floor), busted a minute by level 0..5
   * with a 10 s re-arm after each card, novice (level 3 is the median; the mean was 1.47) and skilled. The
   * balance script (slice 7) measures its own rates by stepping the sim; these are the reference.
   */
  measured: {
    bagPerMinute: 406, coinsPerMinute: 36, runSeconds: 600,
    bustedPerMinute: [0, 0.33, 0.67, 1.0, 1.0, 1.07], bustedPerMinuteSkilled: [0, 0.2, 0.33, 0.2, 0.73, 0.27],
  },
  /**
   * The cold open (docs/DESIGN.md §6.6): the car, the candidate held alongside, the route's marker and coin
   * line, and when each caption cues and times out (s, m, m/s).
   */
  coldOpen: {
    heat: 20, damage: 0.6, startSpeed: 12,
    candidateAhead: 40, candidateOffset: 3.2, candidateHold: 15, candidateGain: 0.5, candidateSpread: 6,
    markerAt: 600, payout: 5000, limitSeconds: 150, coinPitch: 4.5,
    gateRamp: 45, gatePlateau: 12,
    steerSeconds: 2, boostSeconds: 1, boostTimeout: 12, smashCue: 150, smashPass: 20,
    takedownRange: 20, takedownTimeout: 20, deliverCue: 200,
  },
};
