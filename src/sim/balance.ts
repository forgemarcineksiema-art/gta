/** Run economy. Heat is a ratchet; only ending a run resets it. */
export const BALANCE = {
  heatThresholds: [20, 40, 60, 80, 100],
  heat: {
    trafficTakedown: 4,
    policeTakedown: 10,
    billboard: 2,
    camera: 5,
    roadblock: 6,
  },
};
