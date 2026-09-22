/** Slice-one patrols only. Higher heat changes escape time, not the unit roster yet. */
export interface PoliceTuning {
  patrols: number;
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
}

export const POLICE: PoliceTuning = {
  patrols: 2,
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
};
