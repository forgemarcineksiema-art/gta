/**
 * The shared low-poly palette (docs/STYLE.md). Every mesh colour comes from here,
 * so the renderer can use vertex colours / one material and the game reads as one style.
 */
export const PALETTE = {
  /** A notch bluer since M8.9 (R8): the warm light and the cars stand off it. */
  asphalt: 0x3c3f52,
  asphaltLight: 0x4a4a58, asphaltBay: 0x5a5969,
  laneMark: 0xf2e9d8,
  roadWhite: 0xd4d0bf, roadYellow: 0xe6bb63,
  /** Worn patches of the same paint (M7 slice 11): each a third of the way to the asphalt. */
  roadWhiteWorn: 0x9e9b94, roadYellowWorn: 0xaa8d59,
  kerb: 0xc9c3b3,
  concrete: 0x9a938a,
  sand: 0xd9b57a,
  /** The ice-cream truck's scoop and cone (M5.5 slice 16). */
  iceCream: 0xf4a6c4, wafer: 0xd49a55,
  grass: 0x819b68,
  water: 0x3fa7c9,
  glass: 0x9fd8ff,
  ramp: 0xe5533d,
  cone: 0xff8a2b,
  barrier: 0xf7f3ea,
  /** The coin on the road and its glyph on the HUD: the one palette colour the HUD's accent shares. */
  coin: 0xffd23f,

  carRed: 0xff3b5c,
  carLime: 0xb6f542,
  carBlue: 0x2bd1ff,
  carOrange: 0xff9f1c,
  carMagenta: 0xf45bff,
  carWhite: 0xf7f3ea,
  carBlack: 0x1c1b22,
  /** The wanted board's gold (M6): the Mayor's Nephew's limo, the Chief's trim, the frame round #1. */
  carGold: 0xe2b33c,

  // blacks and greys (trim, rubber, metal)
  ink: 0x0c0c10,
  rubber: 0x15151a,
  charcoal: 0x25252c,
  graphite: 0x35353e,
  slate: 0x4a4a55,
  steel: 0x6d6d78,
  silver: 0x9d9da8,
  lightGrey: 0xc4c4cd,
  chrome: 0xe4e4ea,
  tyre: 0x15151a,
  rim: 0xc4c4cd,
  glassDark: 0x4f6672,

  policeWhite: 0xf7f3ea,
  policeBlue: 0x1d4ed8,

  /**
   * The golden hour (M8.9 R8): the sky hot peach at the horizon, rose a few degrees up, deep violet from 15° up; the
   * sun warm gold; the fog the horizon's colour, so the far city dissolves into the sky.
   */
  skyTop: 0x3d3a7a,
  skyMid: 0xd9849a,
  skyHorizon: 0xffb487,
  sun: 0xffcf8f,
  fog: 0xffb487,
} as const;

export type PaletteKey = keyof typeof PALETTE;

/**
 * The pedestrians' clothes by district (M5.5 slice 20, docs/DESIGN.md §13.11): a place reads in its crowd.
 * Crown Heights dresses dark and formal, the Works in hi-vis and denim, the Gardens in pale greens and
 * sand, the Quay in coral, turquoise and white. Keyed by the district ids of city/City.ts.
 */
export const PED_TINTS: Readonly<Record<string, readonly number[]>> = {
  crown: [0x3b4a6b, 0x6e4f7e, 0xb1a8ba, 0x35353e, 0xc9a86a, 0x8c2f39],
  foundry: [0xff9f1c, 0xe6bb63, 0x5daeb5, 0x6d6d78, 0x3a5a7a, 0xad7864],
  gardens: [0x879b74, 0xe7bd87, 0xf7f3ea, 0x91aca3, 0xd7ae9c, 0x8bb583],
  marina: [0xeaa7ab, 0x67c9ce, 0xf7f3ea, 0xffd23f, 0x2bd1ff, 0xf45bff],
};
/** Skin, hair, trousers, shoes and the pedestrians' things (render/pedMesh.ts). */
export const PED_COLORS = {
  skin: 0xd7ae9c, skinDark: 0x9c6b52, hair: 0x2a211d, hairAuburn: 0x6b3f2a, hairGrey: 0xb9b4ad,
  trousers: 0x35353e, denim: 0x3a4f6e, skirt: 0x2d2d36, shoes: 0x1c1b22, boots: 0x4a3a2a,
  scarf: 0xd4cbbd, bag: 0x8c5a3a, stick: 0x5a3a28, hardHat: 0xffd23f, sleeve: 0x6d6d78, stripe: 0xe4e4ea,
  // the officer (M5.5 slice 18): a blue shirt, navy trousers and cap, a badge, the ticket book
  uniform: 0x3f6fb6, navy: 0x1f2a44, badge: 0xe6bb63, ticket: 0xf2efe6,
} as const;

/** The facades' colours, a third more saturated since M8.9 (R8: the city was grey at the golden hour); chalk and trim kept. */
export const CITY_COLORS = {
  stone: 0xd4c8b6, chalk: 0xe3d8c4, lavender: 0xaea3ba, brick: 0xad684e,
  peach: 0xd7a28a, mint: 0x89aca0, trim: 0xe2d9c9, roof: 0x5f606c,
  window: 0x476676, windowLight: 0x7a969c, shop: 0x375663,
  soil: 0x889270, yard: 0x9a998e, hedge: 0x5d7f5c, leaves: 0x7d9b63,
} as const;

/**
 * The districts' accents on their canopies, rails, fascias and props (M8.9 R8): a clean, strong colour each, the
 * Crown's gold, the Works' teal, the Gardens' flower pink, the Quay's aqua (they were muted: 0xf5cd75, 0x5daeb5, 0x8bb583,
 * 0x67c9ce). The pedestrians' clothes keep their own tints.
 */
export const ACCENTS = { crown: 0xf2b53a, foundry: 0x1fa9a6, gardens: 0xee6f9a, marina: 0x2cc4c9 } as const;

/**
 * One colour, one meaning (docs/M8.9_PLAN.md R1), on the screen, the maps and the world's marks (the signs, the rings,
 * the route): money is yellow (the bag, a pay, a price, a coin, a cache); the way is cyan (the route, the goal, the
 * swap); trouble is red (bad for you); the police are blue; everything else is ink; closed or off is grey; every
 * outline and panel is the dark violet. The CSS's `:root` repeats them (pinned equal); nothing else on the screen has a
 * hue of its own.
 */
export const SIGNALS = {
  money: 0xffd23f,
  way: 0x2bd1ff,
  trouble: 0xff3b5c,
  police: 0x3b82ff,
  ink: 0xf7f3ea,
  off: 0x8d8a96,
  outline: 0x160e28,
} as const;

/**
 * The island's ground (M8.10 slice 3): the grass by height, from the lowland's green to the hill's dry gold; the golf's
 * fairway; the verges beside the roads; the rock of the steep and the cliffs; the beaches' wet sand at the water; the
 * quays' paving and walls; the sea's floor.
 */
export const ISLAND_COLORS = {
  lowland: 0x7c9f5e, meadow: 0x8aa55b, upland: 0xa0a65a, dryGrass: 0xb5a75e, summit: 0xc3aa68,
  fairway: 0x74b556, verge: 0x93a66a, rock: 0x8a8075, cliff: 0x776c63, wetSand: 0xb99b69, dirt: 0x9a7b55,
  paving: 0xb1aa9e, quayWall: 0x8c867c, seabed: 0x2f6f7f,
  // Palm Gardens (M8.10 slice 10): the fairway's mown stripe, the greens and tees, the botanic garden's lawn, its
  // gravel, the boardwalk
  fairwayStripe: 0x67a84b, green: 0x8fd16a, lawn: 0x78aa53, gravel: 0xc9b996, timber: 0xa77a52,
} as const;
