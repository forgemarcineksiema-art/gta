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
};
