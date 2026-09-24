/**
 * The driving screen (docs/DESIGN.md §17.2, M8.5 slice 1): each corner
 * answers one question. Top right, how hot and how much: the stars, the bag
 * with its ×, the bank. Bottom left, where: the radar. Bottom right, the car:
 * the speed, the boost, the damage. Top left, the combo while one runs. The
 * goal line and the arrow (top centre) decide their own words and targets in
 * `jobs.ts` and `render/Arrow.ts`.
 *
 * A calm drive shows seven things: the line, the arrow, the stars, the bank,
 * the radar, the speed, the boost. The rest comes on its moment and goes: the
 * bag with its first money, its × from the first level that multiplies, the
 * district's name for a few seconds, the damage once dented, the combo while
 * it runs. Behind a shut door and on the busted card none of it shows: the
 * wall or the card has the screen.
 *
 * Pure: the HUD modules read `drive()` every frame and write the DOM only when
 * a bit changes. No allocation per frame (`readDrive` fills the caller's
 * object).
 */
import type { RunState, SimWorld } from '../sim';
import { t } from './lang';

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
  /** The car's damage, 0..1. */
  damage: number;
  /** A combo is running (its points above 0). */
  combo: boolean;
  /** Seconds since the district's name changed, or since a new run started. */
  placeAge: number;
}

/** Seconds the district's name shows after a change or a new run (GTA's rule: the radar answers where, the name is news). */
export const PLACE_SECONDS = 4;

/** Behind a shut door the wall has the screen, on the busted card the card: nothing of the drive shows or speaks. */
export function screenTaken(run: RunState): boolean {
  return run === 'door' || run === 'busted';
}

/** The elements that show, as a mask of `DRIVE` bits. */
export function drive(s: DriveState): number {
  if (screenTaken(s.run)) return 0;
  let m = DRIVE.speed | DRIVE.boost;
  if (s.damage > 0) m |= DRIVE.damage;
  if (s.combo) m |= DRIVE.combo;
  if (!s.city) return m;
  m |= DRIVE.stars | DRIVE.bank | DRIVE.radar;
  // a bag of 0 says nothing; ×1 multiplies nothing (the × arrives with the second star's pursuit)
  if (s.bag > 0) {
    m |= DRIVE.bag;
    if (s.multiplier > 1) m |= DRIVE.mult;
  }
  if (s.placeAge < PLACE_SECONDS) m |= DRIVE.place;
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

/** One frame: back to 0 in a new district or at a new run (the drive-out, the busted card closed), else older by `dt`. */
export function tickPlace(c: PlaceClock, place: unknown, run: RunState, dt: number): number {
  const fresh = run !== c.run && run === 'running' && (c.run === 'door' || c.run === 'busted');
  c.run = run;
  if (fresh || place !== c.place) {
    c.place = place;
    c.age = 0;
  } else {
    c.age += dt;
  }
  return c.age;
}

/** The names of a mask's elements, in `DRIVE`'s order (the pins and the screens read them). */
export function driveNames(mask: number): DriveElement[] {
  return (Object.keys(DRIVE) as DriveElement[]).filter((k) => (mask & DRIVE[k]) !== 0);
}

/** A fresh state: a new run on the test track. */
export function newDriveState(): DriveState {
  return { city: false, run: 'running', bag: 0, multiplier: 1, damage: 0, combo: false, placeAge: 0 };
}

/** The world into `out` (the district's age is the caller's: it keeps the clock). */
export function readDrive(sim: SimWorld, placeAge: number, out: DriveState): DriveState {
  out.city = sim.city !== null;
  out.run = sim.run.state;
  out.bag = sim.run.bag;
  out.multiplier = sim.run.multiplier;
  out.damage = sim.life.state.damage;
  out.combo = sim.skill.points > 0;
  out.placeAge = placeAge;
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
}

/** The key hints' rows: the keys and the word (the player's language); the tuning row only when the panel is on (D9). */
export function hintRows(k: KeyHints): Array<{ keys: string[]; label: string }> {
  const rows = [
    { keys: [k.throttle, k.steerLeft, k.brake, k.steerRight], label: t('drive') },
    { keys: [k.handbrake], label: t('drift (or brake + turn)') },
    { keys: [k.boost], label: t('boost') },
    { keys: [k.reset], label: t('reset') },
    { keys: [k.camera], label: t('camera') },
    { keys: [k.map], label: t('map (hold)') },
    { keys: [k.horn], label: t('horn') },
    { keys: [k.pause], label: t('pause') },
  ];
  if (k.debug !== '') rows.push({ keys: [k.debug], label: t('tuning') });
  return rows;
}

/** The developer's panel and its key: only with `?dev=1` (a children's build never ships a tuning panel on a key). */
export function devTools(params: { get(name: string): string | null }): boolean {
  return params.get('dev') === '1';
}
