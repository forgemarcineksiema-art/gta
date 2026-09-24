/**
 * The wanted board's rivals (M6, docs/DESIGN.md §14.3): ten named drivers and
 * the Chief, each a poster on the hideout's wall with two requirements, a duel
 * (a race to a finish, or a hunt: wreck their car before it gets home) with a
 * twist that is one of the game's own verbs turned on the player, and a car
 * and an item to win. Plain data: `Board` reads the requirements, `Jobs` runs
 * the duel, the views name everything. Indexed #10 first: `RIVALS[0]` is the
 * first rival met, `RIVALS[CHIEF]` the last.
 */
import { CITY_COLORS, PALETTE } from '../palette';
import { english, type Say } from '../say';
import type { RivalBody } from '../traffic/bodies';

export type DuelFormat = 'race' | 'hunt' | 'chief';
export type Twist = 'none' | 'bad' | 'heavy' | 'twins' | 'disguise' | 'bus' | 'breakers' | 'escort' | 'heli' | 'ghost';
/** A rival's district (city/City.ts DISTRICTS ids and the highway), where the ring stands. */
export type Turf = 'crown' | 'foundry' | 'gardens' | 'marina' | 'highway';
export type ReqKind = 'chain' | 'raceWins' | 'medal' | 'escape' | 'takedowns' | 'zoneWins' | 'fares' | 'orders'
  | 'carsOwned' | 'jumps' | 'bestRun' | 'billboards' | 'hotFares' | 'caches' | 'board' | 'smashed';
/** A requirement: `count` of a kind; `level` is a medal's (1 bronze .. 3 gold) or an escape's stars, 0 otherwise. */
export interface Req { kind: ReqKind; count: number; level: number }
/**
 * Where a duel ends: a lane point by path ('lane'), the Glasshouse, the scrapyard, the donut shop, the Crown
 * Tower, a lane point far across the island ('far'); the Chief's has none (his is an escape).
 */
export type DuelTarget = 'lane' | 'glasshouse' | 'scrapyard' | 'donuts' | 'tower' | 'far' | 'none';

export interface RivalDef {
  name: string;
  /** The poster's one-liner. */
  line: string;
  /** What the ticker says when the rival is ready for the player, after the name. */
  call: string;
  turf: Turf;
  /** Their car: won into the garage. */
  body: RivalBody;
  /** One, or two for the twins (a rival each). */
  paints: readonly number[];
  format: DuelFormat;
  /** The heat level the duel runs at (the ratchet never lowers). */
  heat: number;
  twist: Twist;
  /** Their item (the driver's kit, M6 slices 6–7). */
  item: string;
  /** Into the bag on the first win; a rematch pays `BALANCE.board.rematchShare` of it. */
  purse: number;
  reqs: readonly Req[];
  target: DuelTarget;
  /** The way to the finish or the door, m by lane path, for the placement. */
  path: readonly [number, number];
}

function req(kind: ReqKind, count: number, level = 0): Req {
  return { kind, count, level };
}

/** The Chief's index: the last poster, after the ten. */
export const CHIEF = 10;

export const RIVALS: readonly RivalDef[] = [
  {
    name: 'GRANNY GEARS', line: 'SPEEDING SINCE 1962', call: 'WANTS A RACE', turf: 'gardens', body: 'wagon',
    paints: [CITY_COLORS.lavender], format: 'race', heat: 0, twist: 'none', item: 'flowerpots', purse: 4000,
    reqs: [req('chain', 6)], target: 'glasshouse', path: [1200, 2200],
  },
  {
    name: 'PEPPERONI PETE', line: 'THIRTY MINUTES OR IT IS FREE', call: 'WANTS A RACE', turf: 'marina', body: 'pizza',
    paints: [PALETTE.carRed], format: 'race', heat: 1, twist: 'bad', item: 'pizza', purse: 6000,
    reqs: [req('raceWins', 1), req('medal', 1, 1)], target: 'lane', path: [1300, 2200],
  },
  {
    name: 'TOW TRUCK TINA', line: 'EVERY CAR IN THE WORKS IS HERS SOONER OR LATER', call: 'IS OUT WITH A BAG', turf: 'foundry', body: 'wrecker',
    paints: [PALETTE.carOrange], format: 'hunt', heat: 1, twist: 'heavy', item: 'beacon', purse: 8000,
    reqs: [req('escape', 1, 3), req('takedowns', 10)], target: 'scrapyard', path: [1000, 2000],
  },
  {
    name: 'THE TWINS', line: 'THEY NEVER DRIVE THE SAME CAR TWICE', call: 'WANT A RACE', turf: 'marina', body: 'twin',
    paints: [CITY_COLORS.mint, CITY_COLORS.peach], format: 'race', heat: 1, twist: 'twins', item: 'twoTone', purse: 10000,
    reqs: [req('zoneWins', 1), req('fares', 3)], target: 'lane', path: [1500, 2400],
  },
  {
    name: 'FAKE FRANK', line: 'NOT A POLICEMAN. NEVER WAS', call: 'IS OUT WITH A BAG', turf: 'foundry', body: 'fakecop',
    paints: [PALETTE.policeWhite], format: 'hunt', heat: 1, twist: 'disguise', item: 'discoBar', purse: 12000,
    reqs: [req('orders', 3), req('carsOwned', 3)], target: 'donuts', path: [1000, 2000],
  },
  {
    name: 'BIG BERNIE', line: 'NEXT STOP: THE FINISH LINE', call: 'WANTS A RACE', turf: 'crown', body: 'partybus',
    paints: [PALETTE.carMagenta], format: 'race', heat: 2, twist: 'bus', item: 'airHorn', purse: 15000,
    reqs: [req('medal', 2, 2), req('smashed', 300)], target: 'lane', path: [1400, 2400],
  },
  {
    name: 'NEON NIKO', line: 'LOW, SLOW, THEN SUDDENLY NOT', call: 'WANTS A RACE', turf: 'marina', body: 'lowrider',
    paints: [PALETTE.carBlue], format: 'race', heat: 3, twist: 'breakers', item: 'pinkNeon', purse: 18000,
    reqs: [req('bestRun', 40000), req('billboards', 25)], target: 'lane', path: [1500, 2500],
  },
  {
    name: "THE MAYOR'S NEPHEW", line: 'HIS UNCLE PAYS THE POLICE', call: 'IS OUT WITH A BAG', turf: 'crown', body: 'limo',
    paints: [PALETTE.carGold], format: 'hunt', heat: 2, twist: 'escort', item: 'flags', purse: 22000,
    reqs: [req('escape', 1, 4), req('hotFares', 1)], target: 'tower', path: [1200, 2200],
  },
  {
    name: 'PROFESSOR PIP', line: 'BUILT IT IN A SHED', call: 'WANTS A RACE', turf: 'gardens', body: 'bubble',
    paints: [PALETTE.carLime], format: 'race', heat: 4, twist: 'heli', item: 'propeller', purse: 30000,
    reqs: [req('raceWins', 3), req('caches', 40)], target: 'lane', path: [1600, 2600],
  },
  {
    name: 'THE GHOST', line: 'NOBODY HAS SEEN THE FACE', call: 'WANTS A RACE', turf: 'highway', body: 'phantom',
    paints: [PALETTE.carBlack], format: 'race', heat: 4, twist: 'ghost', item: 'ghostSmoke', purse: 50000,
    reqs: [req('escape', 1, 5), req('medal', 1, 3)], target: 'far', path: [2400, 3600],
  },
  {
    name: 'THE CHIEF', line: 'HE WANTS HIS BOARD BACK', call: 'WANTS HIS BOARD BACK', turf: 'foundry', body: 'chiefcar',
    paints: [PALETTE.policeWhite], format: 'chief', heat: 5, twist: 'none', item: 'goldStar', purse: 100000,
    reqs: [req('board', 10)], target: 'none', path: [0, 0],
  },
];

/** The poster's number: #10 for the first rival, #1 for the Ghost; the Chief has none (0). */
export function posterNumber(i: number): number {
  return i >= CHIEF ? 0 : 10 - i;
}

const MEDALS = ['', 'BRONZE', 'SILVER', 'GOLD'];

/** A requirement as the poster and the goal line say it (in the player's language through `say`, docs/DESIGN.md §19). */
export function reqText(r: Req, say: Say = english): string {
  const n = r.count;
  switch (r.kind) {
    case 'chain': return say('FINISH THE FIRST SIX STEPS');
    case 'raceWins': return n === 1 ? say('WIN A STREET RACE') : say('WIN {n} STREET RACES', { n });
    case 'medal': {
      const medal = say(MEDALS[r.level] ?? '');
      return n === 1 ? say('{medal} ON A TIME TRIAL', { medal }) : say('{medal} ON {n} TIME TRIALS', { medal, n });
    }
    case 'escape': return say('ESCAPE AT {stars}', { stars: '★'.repeat(r.level) });
    case 'takedowns': return say('{n} TAKEDOWNS', { n });
    case 'zoneWins': return n === 1 ? say('WIN A RAGE OR MAYHEM ZONE') : say('WIN {n} RAGE OR MAYHEM ZONES', { n });
    case 'fares': return say('DELIVER {n} TAXI FARES', { n });
    case 'orders': return say('DELIVER {n} CARS TO ORDER', { n });
    case 'carsOwned': return say('OWN {n} CARS', { n });
    case 'jumps': return say('{n} STUNT JUMPS', { n });
    case 'bestRun': return say('BANK {n} IN ONE RUN', { n });
    case 'billboards': return say('{n} BILLBOARDS', { n });
    case 'hotFares': return n === 1 ? say('A HOT FARE') : say('{n} HOT FARES', { n });
    case 'caches': return say('{n} CACHES', { n });
    case 'board': return say('BEAT THE TEN');
    case 'smashed': return say('SMASH {n} THINGS', { n });
  }
}
