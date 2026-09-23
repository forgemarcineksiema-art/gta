/**
 * Job kinds and their definitions (docs/M5_PLAN.md §3.3): what the generator
 * places, what a marker starts, and the steal-to-order descriptor packed in
 * one number (class index in the top byte, paint below), so a def stays
 * plain data the card can name.
 */
import { CITY_COLORS, PALETTE } from '../palette';
import { PLAYER_PAINT } from '../traffic/Traffic';
import { CAR_IDS, type CarId } from '../vehicle/presets';

export type JobKind = 'delivery' | 'order' | 'escape';

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
  /** An escape's heat level (2..4); 0 otherwise. */
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
  [PALETTE.carRed, 'RED'],
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
  return (CAR_IDS.indexOf(kind) << 24) | (paint & 0xffffff);
}

export function unpackDescriptor(d: number): { kind: CarId; paint: number } {
  return { kind: CAR_IDS[(d >>> 24) & 0xff] ?? 'muscle', paint: d & 0xffffff };
}

export function paintName(paint: number): string {
  for (const [p, name] of PAINT_NAMES) if (p === paint) return name;
  return 'ODD';
}

/** What the card calls a class. */
export const CAR_WORDS: Record<CarId, string> = { muscle: 'MUSCLE CAR', compact: 'COMPACT', heavy: 'VAN', sports: 'SPORTS CAR', police: 'POLICE CAR' };
