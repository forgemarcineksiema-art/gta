/**
 * Job kinds and their definitions (docs/M5_PLAN.md §3.3): what the generator
 * places, what a marker starts, and the steal-to-order descriptor packed in
 * one number (class index in the top byte, paint below), so a def stays
 * plain data the card can name.
 */
import { BALANCE } from '../balance';
import { CITY_COLORS, PALETTE } from '../palette';
import { PLAYER_PAINT } from '../traffic/Traffic';
import type { CarId } from '../vehicle/presets';
import { BODIES, BODY_IDS, BODY_INDEX, type BodyId } from '../traffic/bodies';

export type JobKind = 'delivery' | 'order' | 'escape' | 'trial' | 'race' | 'rage' | 'mayhem' | 'fare' | 'duel';

export interface JobDef {
  id: number;
  kind: JobKind;
  /** The marker ring's centre and facing. */
  x: number;
  z: number;
  yaw: number;
  /** The delivery's drop-off or the order's fence (a point inside the ring's radius wins); unused for an escape. */
  targetX: number;
  targetZ: number;
  /** An escape's heat level (2..4); a zone job's quota (takedowns, or dollars of damage); a duel's rival (M6: `RIVALS`' index); 0 otherwise. */
  level: number;
  /** An order's wanted car, `packDescriptor`; -1 otherwise. */
  descriptor: number;
  /** A delivery's payout before the time bonus, an order's at stage 0, an escape's bounty. */
  payout: number;
  /** A delivery's or an order's clock (s); 0 for an escape, which has none. */
  limitSeconds: number;
  /** Heat added once at the start (an escape sets its level instead). */
  heat: number;
}

/** The classes an order can ask for: the civilian bodies (a cruiser is update 2's job). */
export const ORDER_KINDS: readonly CarId[] = ['compact', 'heavy', 'muscle', 'sports'];

/** Traffic's paints with the names the card uses. */
export const PAINT_NAMES: ReadonlyArray<readonly [number, string]> = [
  [PALETTE.carLime, 'LIME'], [PALETTE.carBlue, 'CYAN'], [PALETTE.carOrange, 'ORANGE'], [PALETTE.carMagenta, 'MAGENTA'],
  [PALETTE.carWhite, 'WHITE'], [PALETTE.carBlack, 'BLACK'], [CITY_COLORS.mint, 'MINT'], [CITY_COLORS.peach, 'PEACH'],
  [PALETTE.carRed, 'RED'], [PALETTE.coin, 'YELLOW'],
];

/** Six paints an order may ask for in a class: traffic's, never the player's own for the class. */
export function orderPaints(kind: CarId): number[] {
  const out: number[] = [];
  for (const [paint] of PAINT_NAMES) {
    if (paint === PALETTE.carRed || paint === PLAYER_PAINT[kind]) continue;
    out.push(paint);
    if (out.length === 6) break;
  }
  return out;
}

export function packDescriptor(kind: CarId, paint: number): number {
  // the class's shell's body index (a class added since M8.8 slice 10 has its shell after the civilians)
  return (BODY_INDEX[kind] << 24) | (paint & 0xffffff);
}

/** An order's or a suspect's car: the body index over the paint (a class's index is its own shell's). */
export function unpackDescriptor(d: number): { kind: CarId; body: BodyId; paint: number } {
  const body = BODY_IDS[(d >>> 24) & 0xff] ?? 'muscle';
  return { kind: (BODIES[BODY_IDS.indexOf(body)] as (typeof BODIES)[number]).car, body, paint: d & 0xffffff };
}

export function paintName(paint: number): string {
  for (const [p, name] of PAINT_NAMES) if (p === paint) return name;
  return 'ODD';
}

/** What the card calls a class. */
export const CAR_WORDS: Record<CarId, string> = { muscle: 'MUSCLE CAR', compact: 'COMPACT', heavy: 'VAN', sports: 'SPORTS CAR', police: 'POLICE CAR', offroad: '4×4', moto: 'MOTORBIKE' };

/** A class's job in one word (M8.8 R1): the drift, the city, the ram, the speed, the disguise, off the road, the jams. */
export const ROLE_WORDS: Record<CarId, string> = { muscle: 'DRIFT', compact: 'CITY', heavy: 'RAM', sports: 'SPEED', police: 'DISGUISE', offroad: 'OFF-ROAD', moto: 'JAMS' };

/** A trophy's one thing, the best in the game at it (M8.8 R2, slice 5): its card's BEST AT line. */
export const BEST_AT: Partial<Record<BodyId, string>> = {
  wagon: 'DRIFTS', pizza: 'AGILITY', wrecker: 'TOUGHNESS', twin: 'GRIP', partybus: 'RAMMING', lowrider: 'BOOST', bubble: 'ACCELERATION', phantom: 'TOP SPEED',
  // the three with connections (slice 6): the disco bar, the uncle, the car nobody reports
  fakecop: 'CLEARING THE ROAD', limo: 'GETTING BUSTED', chiefcar: 'DISGUISE',
};

/** A crazy car's one trick, no other car's (M8.8 phase F): its card's ONLY IT line. */
export const ONLY_IT: Partial<Record<BodyId, string>> = { roller: 'FLATTENS CARS', monster: 'DRIVES OVER CARS', trolley: 'RIDES A ROCKET' };

/** The line under a car's name on the wall (M8.8 slices 3, 5, 11): a crazy car's ONLY IT, a trophy's BEST AT, else what its class is for. */
export function cardLine(body: BodyId): string {
  const only = ONLY_IT[body], best = BEST_AT[body];
  return only ? `ONLY IT: ${only}` : best ? `BEST AT: ${best}` : ROLE_WORDS[(BODIES[BODY_IDS.indexOf(body)] as (typeof BODIES)[number]).car];
}
/** What the radio calls a body. */
export const BODY_WORDS: Record<BodyId, string> = {
  ...CAR_WORDS, sedan: 'SEDAN', hatch: 'HATCHBACK', estate: 'ESTATE', suv: 'SUV', pickup: 'PICKUP', taxi: 'TAXI', truck: 'BOX TRUCK', bus: 'BUS', icecream: 'ICE-CREAM TRUCK',
  wagon: 'WAGON', pizza: 'PIZZA HATCH', wrecker: 'WRECKER', twin: 'TWIN', fakecop: 'FAKE CRUISER', partybus: 'PARTY BUS',
  lowrider: 'LOWRIDER', limo: 'GOLD LIMO', bubble: 'BUBBLE', phantom: 'PHANTOM', chiefcar: "CHIEF'S CRUISER",
  roadster: 'ROADSTER', sweeper: 'STREET SWEEPER', hotdog: 'HOT-DOG VAN',
  roller: 'STEAMROLLER', monster: 'MONSTER TRUCK', trolley: 'ROCKET TROLLEY',
};

/** A trial's medal times from its bronze limit (M5.5 slice 10): gold, silver, bronze, seconds. */
export function trialTimes(limitSeconds: number): [number, number, number] {
  const sp = BALANCE.jobs.trial.speeds;
  const b = sp[0] as number, s = sp[1] as number, g = sp[2] as number;
  return [limitSeconds * b / g, limitSeconds * b / s, limitSeconds];
}

/** The medal a trial's time wins: 3 gold, 2 silver, 1 bronze, 0 none. */
export function trialMedal(limitSeconds: number, elapsed: number): number {
  const [g, s, b] = trialTimes(limitSeconds);
  return elapsed <= g + 1e-9 ? 3 : elapsed <= s + 1e-9 ? 2 : elapsed <= b + 1e-9 ? 1 : 0;
}

export const MEDAL_WORDS = ['', 'BRONZE', 'SILVER', 'GOLD'] as const;

export const PLACE_WORDS = ['', '1ST', '2ND', '3RD', '4TH'] as const;
