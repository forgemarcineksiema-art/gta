/** Boost paid for risk, damage stages, and the car-swap window. */
export interface Economy {
  nearMissGap: number;
  nearMissSpeed: number;
  nearMissBoost: number;
  nearMissOncomingBoost: number;
  nearMissCooldown: number;
  oncomingSpeed: number;
  oncomingLaneDistance: number;
  oncomingBoostPerSecond: number;
  oncomingHysteresis: number;
  pedDodgeBoost: number;
  pedDodgeDistance: number;
  takedownBoost: number;
  takedownTrafficBoost: number;
  takedownWindow: number;
  takedownClosingSpeed: number;
  takedownDeltaV: number;
  billboardBoost: number;
  billboardMinSpeed: number;
  billboardSpeedLoss: number;
  slowMoSeconds: number;
  slowMoScale: number;
}

export interface DamageRules {
  threshold: number;
  perMetrePerSecond: number;
  stages: readonly [number, number, number, number];
  trafficFactor: number;
  wreckRespawn: number;
  respawnSpeed: number;
  respawnClear: number;
}

export interface SwapRules {
  range: number;
  lateral: number;
  maxRelativeSpeed: number;
  airborneAllowed: boolean;
  whipSeconds: number;
}

export const ECONOMY: Economy = {
  nearMissGap: 1.5,
  nearMissSpeed: 12,
  nearMissBoost: 0.12,
  nearMissOncomingBoost: 0.2,
  nearMissCooldown: 2,
  oncomingSpeed: 16,
  oncomingLaneDistance: 4,
  oncomingBoostPerSecond: 0.1,
  oncomingHysteresis: 0.3,
  pedDodgeBoost: 0.04,
  pedDodgeDistance: 3,
  takedownBoost: 0.5,
  takedownTrafficBoost: 0.6,
  takedownWindow: 2.5,
  takedownClosingSpeed: 14,
  takedownDeltaV: 7,
  billboardBoost: 0.25,
  billboardMinSpeed: 5.5,
  billboardSpeedLoss: 0.05,
  slowMoSeconds: 1.2,
  slowMoScale: 0.35,
};

export const DAMAGE: DamageRules = {
  threshold: 8,
  perMetrePerSecond: 0.04,
  stages: [0.3, 0.6, 0.85, 1.0],
  trafficFactor: 0.7,
  wreckRespawn: 3,
  respawnSpeed: 8,
  respawnClear: 15,
};

export const SWAP: SwapRules = {
  range: 6,
  lateral: 4,
  maxRelativeSpeed: 20,
  airborneAllowed: false,
  whipSeconds: 0.35,
};
