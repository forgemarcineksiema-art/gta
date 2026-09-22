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
  /** Coins on the road: value, and the runs along the lanes (m); `billboardLine` coins through each billboard. */
  coin: { value: 10, pitch: 6, runMin: 8, runMax: 12, gapMin: 40, gapMax: 90, billboardLine: 8 },
  /** A wreck spills `share` of the bag as `coins` coins from `startAhead` m at `pitch` along the lane, for `seconds`. */
  spill: { share: 0.3, coins: 12, seconds: 10, startAhead: 10, pitch: 4 },
  /**
   * Jobs (the slice-4 skeleton; M5 adds kinds and placement): a `markerRadius` m ring starts one, arriving
   * within the same radius of its target pays payout × (1 + timeBonus × remaining / limit); done and failed
   * show for `holdSeconds`.
   */
  jobs: { markerRadius: 4, beaconHeight: 3, timeBonus: 0.5, holdSeconds: 2 },
  /**
   * The cold open (docs/DESIGN.md §6.6): the car, the candidate held alongside, the route's marker and coin
   * line, and when each caption cues and times out (s, m, m/s).
   */
  coldOpen: {
    heat: 20, damage: 0.6, startSpeed: 12,
    candidateAhead: 40, candidateOffset: 3.2, candidateHold: 15, candidateGain: 0.5, candidateSpread: 6,
    markerAt: 600, payout: 5000, limitSeconds: 150, coinPitch: 8,
    gateRamp: 45, gatePlateau: 12,
    steerSeconds: 2, boostSeconds: 1, boostTimeout: 12, smashCue: 150, smashPass: 20,
    takedownRange: 20, takedownTimeout: 20, deliverCue: 200,
  },
};
