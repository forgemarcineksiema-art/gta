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
  /**
   * A hurt car (M8.8 slice 7), by stage 0–4: the engine's share of its torque, and the sideways push at the rear axle
   * toward the side of the hit that raised the stage, in m/s² of the car's own mass (so every class drifts alike).
   */
  handling: { torque: readonly number[]; pull: readonly number[] };
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
  // stage 3: the 0–100 at most 14 % slower in any class (the heavy's; 0.85 made it 19 %), and about a metre off a 100 m
  // line at 80 km/h with no steering (the plan's half of the spike's 900 N made it 3.7 m in the muscle car)
  handling: { torque: [1, 1, 0.95, 0.9, 0.9], pull: [0, 0, 0.045, 0.09, 0.09] },
};

export const SWAP: SwapRules = {
  range: 6,
  lateral: 4,
  maxRelativeSpeed: 20,
  airborneAllowed: false,
  whipSeconds: 0.35,
};
