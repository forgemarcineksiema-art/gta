/** Run economy. Heat is a ratchet; only ending a run resets it. Every money number lives here. */
export const BALANCE = {
  heatThresholds: [20, 40, 60, 80, 100],
  /**
   * Points per crime (docs/DESIGN.md §13.3). A crime in a unit's sight pays `seenFactor` times as much and
   * never leaves the player below level 1; `hit` is a civilian rammed off its lane (once per car per
   * `hitCooldown` s); `speedingSeen` a patrol watching the player `speedingOverKmh` over the road's limit
   * (once per `speedingCooldown` s); `chasePerSecond` drips while the pursuit is active.
   */
  heat: {
    trafficTakedown: 5,
    policeTakedown: 12,
    billboard: 3,
    camera: 6,
    roadblock: 8,
    /** Hitting a police car nobody was chasing you in: the car itself is the witness. */
    policeHit: 6,
    hit: 2,
    hitCooldown: 3,
    /** Speeding past a patrol makes the player wanted and pays this flat (not doubled: the sighting is the crime), once per `speedingCooldown` s. */
    speedingSeen: 3,
    speedingOverKmh: 30,
    speedingCooldown: 20,
    chasePerSecond: 0.1,
    seenFactor: 2,
    /** A contact is the player's crime only when the other car was not more than this much faster (m/s): the faster car is at fault, so a patrol driving into a stopped player is the patrol's. */
    faultMargin: 1,
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
    /** Every 10 s the pursuit is active, this × the heat level into the bag (NFS's bounty, DESIGN.md §13.9). */
    pursuitPer10s: 100,
  },
  /** The door's multiplier by the highest level at which the pursuit went active (index = level; 0 and 1 both x1). */
  multiplier: [1, 1, 1.25, 1.6, 2.2, 3],
  /** Busted banks this share of the bag, with no multiplier. */
  fine: 0.5,
  /** Pulling into a drop-off under `enterSpeed` (m/s) starts the door; it takes `closeSeconds` to shut, busted live. */
  door: { closeSeconds: 3, enterSpeed: 8 },
  /**
   * Coins (docs/DESIGN.md §13.5): a coin is attached to a goal or it does not exist. `value` a coin, `cap` the
   * bigger coin a line ends on, `cacheCap` a cache's; `pitch` along a line (m). Static coins: `gateCoins` before
   * the cap on a billboard, `arcCoins` in the air over a ramp. A job's `route`: a run of `turn` coins into and
   * out of every turn, a run of `straight` every `straightEvery` m of straight, the cap on the target; every
   * coin of a route taken pays `tip` of the payout. The day's `cache`: `perDay` runs of `run` coins and a cap,
   * drawn by the date seed from `candidates` spots at least `minGap` m apart; the tenth, twentieth and thirtieth
   * pay `bonus` into the bank. The pickup `reach` past the bumpers, the doors and about the bonnet (m); the
   * launch a ramp's `arc` is laid for (m/s, m/s² with the car's gravity).
   */
  coin: {
    value: 20, cap: 100, cacheCap: 250, pitch: 4.5,
    gateCoins: 4, arcCoins: 3,
    route: { turn: 5, straight: 6, straightEvery: 80, tip: 0.1 },
    cache: { perDay: 30, run: 8, minGap: 150, candidates: 120, bonus: [500, 1000, 2000] },
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
   * m. An escape pays `bounty` × level on the escape; for its first `radioSeconds` the police know where the
   * player is, so the units close in before the escape timer can start.
   */
  jobs: {
    // nearDoor: the placement's first picks are a ring within this of every door (the first goal after a door, DESIGN §13.4)
    markerRadius: 4, beaconHeight: 3, timeBonus: 0.5, holdSeconds: 2, cardSeconds: 1.5, markerMinGap: 60, nearDoor: 250,
    counts: { delivery: 6, order: 6, escape: 4, trial: 4 },
    // payoutPerKm 9,000 (balance script, 2026-09-23; the plan's 4,000 paid every placed delivery the 5,000 floor on
    // their 0.55–1.27 km paths): now 5,000–11,400, DESIGN.md §3.3's 5–12k
    delivery: { payoutPerKm: 9000, payoutMin: 5000, payoutMax: 12000, limitFactor: 1.3, limitMin: 45, heat: 10, minPath: 400 },
    order: {
      payout: { compact: 4000, heavy: 5000, muscle: 6000, sports: 8000 }, stagePenalty: 0.1, limitSeconds: 240, heat: 8,
      ensureMin: 300, ensureMax: 600, ensureSeconds: 5, ringRange: 150, cruise: 0.5,
    },
    escape: { bounty: 1500, levels: [2, 2, 3, 4], radioSeconds: 8 },
    /**
     * The time trial on a coin line (M5.5 slice 10, DESIGN.md §4): one per district, a finish 1.1–1.9 km away by
     * lane path; the medals by the average speed over that path (m/s: bronze, silver, gold) and their pay into the
     * bag (DESIGN.md §3.3); slower than bronze fails it; the finish reaches `finishRadius` m across the road.
     */
    trial: { speeds: [16.5, 20, 24], pay: [3000, 5000, 8000], minPath: 1100, maxPath: 1900, finishRadius: 12 },
  },
  /**
   * The garage's catalogue (docs/M5_PLAN.md D13): cash only; the muscle car is owned from the start. The van at
   * 20,000, not 30,000 (balance script, 2026-09-23): at a novice's 2.5k a minute 30,000 is a 12-minute save and
   * breaks the first hour's something-new-every-3-to-10-minutes; the sports car stays the second hour's goal.
   */
  prices: { compact: 10000, heavy: 20000, sports: 60000, police: 120000 },
  /** Bring it home, pay to keep it (DESIGN.md §13.7): a car driven through a door, not owned yet, is kept for this share of its price (the police car for `police`). */
  keep: { share: 0.3, police: 0.6 },
  /**
   * Each upgrade tier's price, tier 1 to 3, the same for every stat and car: 12,000 / 16,000 / 22,000 (balance
   * script, M5.5 slice 1; M5's 8,000 / 14,000 / 22,000 fell tier 1 to the first car's door once the beat's
   * police income arrived): the tiers are the first hour's cadence between the cars.
   */
  tierPrices: [12000, 16000, 22000],
  /** Multipliers on the preset per tier 0..3 (D8): power × torqueMax, grip × muFront and muRear, boost × boostDrain. */
  tiers: {
    power: [1, 1.06, 1.12, 1.2],
    grip: [1, 1.04, 1.08, 1.12],
    boost: [1, 0.9, 0.8, 0.7],
  },
  /** One-shot prep items for the next run (DESIGN.md §3.4): the lawyer keeps `lawyerKeep` of the bag when busted, the fence adds `fenceBonus` to the multiplier. */
  prep: { lawyer: 5000, lawyerKeep: 0.75, fence: 8000, fenceBonus: 0.5 },
  /**
   * The first quarter hour's chain (docs/DESIGN.md §13.4): step 6 banks `bankGoal` in one run, step 4 escapes from
   * `escapeLevel`; the goal line names the first car once the funds reach `buyShare` of its price; the BORROW
   * prompt's second line shows the first `hintTimes` times.
   */
  chain: { bankGoal: 20000, escapeLevel: 2, buyShare: 0.6, hintTimes: 3 },
  /** The door's rewarded offer: above `doorThreshold` in the bag the video doubles it (`doorMultiplier`); the idle arrow turns to the doors above it too. */
  offer: { doorThreshold: 8000, doorMultiplier: 2 },
  /**
   * Daily challenge rewards by template weight, and the streak's cash for day 1..7 (day 7 on repeats); `police` is
   * the share of each fixed site list the date mans (roadblock chokepoints, parked-patrol junctions, cameras).
   */
  dailies: {
    rewards: [3000, 5000, 10000], streak: [500, 1000, 1500, 2000, 3000, 4000, 5000],
    police: { chokepoints: 0.6, parked: 0.6, cameras: 0.8 },
  },
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
