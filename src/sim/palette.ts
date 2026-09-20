/**
 * The shared low-poly palette (docs/STYLE.md). Every mesh colour comes from here,
 * so the renderer can use vertex colours / one material and the game reads as one style.
 */
export const PALETTE = {
  asphalt: 0x3a3a46,
  asphaltLight: 0x4a4a58,
  laneMark: 0xf2e9d8,
  kerb: 0xc9c3b3,
  concrete: 0x9a938a,
  sand: 0xd9b57a,
  grass: 0x7fae5a,
  water: 0x3fa7c9,
  glass: 0x9fd8ff,
  ramp: 0xe5533d,
  cone: 0xff8a2b,
  barrier: 0xf7f3ea,

  carRed: 0xff3b5c,
  carLime: 0xb6f542,
  carBlue: 0x2bd1ff,
  carOrange: 0xff9f1c,
  carMagenta: 0xf45bff,
  carWhite: 0xf7f3ea,
  carBlack: 0x1c1b22,
  tyre: 0x1a1a1f,
  rim: 0xd9d9e0,

  policeWhite: 0xf7f3ea,
  policeBlue: 0x1d4ed8,

  skyTop: 0x2b1b5a,
  skyHorizon: 0xff8a5b,
  sun: 0xffd27a,
  fog: 0xe8a07a,
} as const;

export type PaletteKey = keyof typeof PALETTE;
