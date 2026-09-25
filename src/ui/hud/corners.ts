/**
 * The driving screen (docs/DESIGN.md §17.2, M8.5 slice 1): each corner
 * answers one question. Top right, how hot and how much: the stars, the bag
 * with its ×, the bank. Bottom left, where: the radar. Bottom right, the car:
 * the speed, the boost, the damage. Top left, the combo while one runs. The
 * goal line (top centre) decides its own words in `jobs.ts`; where is the
 * radar's route (`map/minimap.ts`, DESIGN.md §20: no arrow).
 *
 * A calm drive shows six things: the line, the stars, the bank, the radar,
 * the gauge's speed and boost. The rest comes on its moment and goes: the
 * bag with its first money, its × from the first level that multiplies, the
 * district's name for a few seconds, the damage's arc for a few seconds after
 * a hit and standing from the third stage (docs/M8.9_PLAN.md R4), the combo
 * while it runs, its × from ×2. Behind a shut door and on the busted card none
 * of it shows: the wall or the card has the screen.
 *
 * Pure: the HUD modules read `drive()` every frame and write the DOM only when
 * a bit changes. No allocation per frame (`readDrive` fills the caller's
 * object).
 */
import type { RunState, SimWorld } from '../../sim';
import { num, t } from '../lang';

/** The driving screen's elements this module decides, a bit each. */
export const DRIVE = {
  stars: 1 << 0,
  bank: 1 << 1,
  bag: 1 << 2,
  mult: 1 << 3,
  radar: 1 << 4,
  place: 1 << 5,
  speed: 1 << 6,
  boost: 1 << 7,
  damage: 1 << 8,
  combo: 1 << 9,
} as const;

export type DriveElement = keyof typeof DRIVE;

/** What the corners read. */
export interface DriveState {
  /** A city world: the test track has no run, no police and no radar. */
  city: boolean;
  run: RunState;
  bag: number;
  /** What the door would pay the bag at now. */
  multiplier: number;
  /** The car's damage, 0..1, and its stage (0..4; 4 is the wreck). */
  damage: number;
  stage: number;
  /** Seconds since the damage last rose (a hit); Infinity before the first. */
  hitAge: number;
  /** A combo is running (its points above 0). */
  combo: boolean;
  /** Seconds since the district's name changed, or since a new run started. */
  placeAge: number;
  /** The intro's caption is up: it speaks alone, and the district's name waits for a quiet moment (M8.9 R5). */
  caption: boolean;
}

/** Seconds the district's name shows after a change or a new run (GTA's rule: the radar answers where, the name is news). */
export const PLACE_SECONDS = 4;

/** Seconds the damage's arc shows after a hit (M8.9 R4); from `DAMAGE_STANDS` it stays. */
export const HIT_SECONDS = 3;
export const DAMAGE_STANDS = 3;

/** Behind a shut door the wall has the screen, on the busted card the card: nothing of the drive shows or speaks. */
export function screenTaken(run: RunState): boolean {
  return run === 'door' || run === 'busted';
}

/** The elements that show, as a mask of `DRIVE` bits. */
export function drive(s: DriveState): number {
  if (screenTaken(s.run)) return 0;
  let m = DRIVE.speed | DRIVE.boost;
  // a hit shows the damage for a moment; only a car near its wreck keeps it on the screen
  if (s.damage > 0 && (s.hitAge < HIT_SECONDS || s.stage >= DAMAGE_STANDS)) m |= DRIVE.damage;
  if (s.combo) m |= DRIVE.combo;
  if (!s.city) return m;
  m |= DRIVE.stars | DRIVE.bank | DRIVE.radar;
  // a bag of 0 says nothing; ×1 multiplies nothing (the × arrives with the second star's pursuit)
  if (s.bag > 0) {
    m |= DRIVE.bag;
    if (s.multiplier > 1) m |= DRIVE.mult;
  }
  if (s.placeAge < PLACE_SECONDS && !s.caption) m |= DRIVE.place;
  return m;
}

/** The district name's clock: the district last seen, the run's state last seen, and seconds since either said "new". */
export interface PlaceClock {
  place: unknown;
  run: RunState;
  age: number;
}

export function newPlaceClock(): PlaceClock {
  return { place: null, run: 'running', age: 0 };
}

/**
 * One frame: back to 0 in a new district or at a new run (the drive-out, the busted card closed), else older by `dt`;
 * held at 0 while `hold` (the intro's caption speaks: the name comes after it).
 */
export function tickPlace(c: PlaceClock, place: unknown, run: RunState, dt: number, hold = false): number {
  const fresh = run !== c.run && run === 'running' && (c.run === 'door' || c.run === 'busted');
  c.run = run;
  if (fresh || hold || place !== c.place) {
    c.place = place;
    c.age = 0;
  } else {
    c.age += dt;
  }
  return c.age;
}

/** The hit's clock: the damage last read (-1 before the first read) and seconds since it last rose. */
export interface HitClock {
  damage: number;
  age: number;
}

export function newHitClock(): HitClock {
  return { damage: -1, age: Infinity };
}

/** One frame: back to 0 when the damage rose (a hit), else older by `dt`; the first reading (the intro's dented van) and a fresh car are no hit. */
export function tickHit(c: HitClock, damage: number, dt: number): number {
  if (c.damage >= 0 && damage > c.damage + 1e-6) c.age = 0;
  else c.age += dt;
  c.damage = damage;
  return c.age;
}

/**
 * Where the swap prompt shows (docs/M8.9_PLAN.md R5): a car alongside while driving puts it at the bottom centre;
 * while the ticket fills it is on the ticket, one block with it (only the ticket speaks); the intro's own caption
 * teaches the swap, so no prompt then.
 */
export function promptPlace(candidate: boolean, ticket: boolean, swapCaption: boolean): 'bottom' | 'ticket' | 'none' {
  if (!candidate || swapCaption) return 'none';
  return ticket ? 'ticket' : 'bottom';
}

/** The combo's ×, from ×2 (M8.9 R4): ×1 multiplies nothing, so it says nothing. */
export function comboMult(multiplier: number): string {
  return multiplier >= 2 ? `×${num(multiplier)}` : '';
}

/** The names of a mask's elements, in `DRIVE`'s order (the pins and the screens read them). */
export function driveNames(mask: number): DriveElement[] {
  return (Object.keys(DRIVE) as DriveElement[]).filter((k) => (mask & DRIVE[k]) !== 0);
}

/** A fresh state: a new run on the test track. */
export function newDriveState(): DriveState {
  return { city: false, run: 'running', bag: 0, multiplier: 1, damage: 0, stage: 0, hitAge: Infinity, combo: false, placeAge: 0, caption: false };
}

/** The world into `out` (the district's and the hit's ages are the caller's: it keeps the clocks). */
export function readDrive(sim: SimWorld, placeAge: number, out: DriveState, hitAge = Infinity): DriveState {
  out.city = sim.city !== null;
  out.run = sim.run.state;
  out.bag = sim.run.bag;
  out.multiplier = sim.run.multiplier;
  out.damage = sim.life.state.damage;
  out.stage = sim.life.state.stage;
  out.hitAge = hitAge;
  out.combo = sim.skill.points > 0;
  out.placeAge = placeAge;
  out.caption = sim.coldOpen.caption !== null;
  return out;
}

/** The keycap labels the key hints name. `debug` is '' unless the developer's panel is on (`?dev=1`). */
export interface KeyHints {
  throttle: string;
  brake: string;
  steerLeft: string;
  steerRight: string;
  handbrake: string;
  boost: string;
  reset: string;
  pause: string;
  camera: string;
  debug: string;
  swap: string;
  map: string;
  horn: string;
  mute: string;
}

/**
 * The key hints on the top (docs/M8.9_PLAN.md R5): four in one row (drive, boost, the map, pause) for `HINT_SECONDS`
 * of an otherwise empty top, in the profile's first `HINT_SESSIONS` sessions; the full list is the pause screen's.
 */
export const HINT_SECONDS = 8;
export const HINT_SESSIONS = 2;

/** Whether this session shows the four hints: its number counts from 1. */
export function hintsWanted(session: number): boolean {
  return session >= 1 && session <= HINT_SESSIONS;
}

/** The four hints, in one row. */
export function hintRow(k: KeyHints): Array<{ keys: string[]; label: string }> {
  return [
    { keys: [k.throttle, k.steerLeft, k.brake, k.steerRight], label: t('drive') },
    { keys: [k.boost], label: t('boost') },
    { keys: [k.map], label: t('map (hold)') },
    { keys: [k.pause], label: t('pause') },
  ];
}

/** The full list of keys, for the pause screen: the keys and the word (the player's language); the tuning row only when the panel is on (D9). */
export function hintRows(k: KeyHints): Array<{ keys: string[]; label: string }> {
  const rows = [
    { keys: [k.throttle, k.steerLeft, k.brake, k.steerRight], label: t('drive') },
    { keys: [k.handbrake], label: t('drift (or brake + turn)') },
    { keys: [k.boost], label: t('boost') },
    { keys: [k.swap], label: t('swap cars') },
    { keys: [k.reset], label: t('reset') },
    { keys: [k.camera], label: t('camera') },
    { keys: [k.map], label: t('map (hold)') },
    { keys: [k.horn], label: t('horn') },
    { keys: [k.mute], label: t('sound') },
    { keys: [k.pause], label: t('pause') },
  ];
  if (k.debug !== '') rows.push({ keys: [k.debug], label: t('tuning') });
  return rows;
}

/** The developer's panel and its key: only with `?dev=1` (a children's build never ships a tuning panel on a key). */
export function devTools(params: { get(name: string): string | null }): boolean {
  return params.get('dev') === '1';
}
