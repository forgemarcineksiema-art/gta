/**
 * The wall's pages (docs/DESIGN.md §17.5, M8.5 slice 3): four, not seven.
 * TOTALS says what the run made; CARS is what you take out (the cars, the
 * chosen car's upgrades under them, the next run's boosters under those);
 * STYLE is how it looks; GOALS is what to do next (the next step, the day's
 * three, the board, the hunts). Every button the garage offers stands on one
 * of them: `GarageUi` builds each where `pageOf` says. Pure.
 */
export type WallPage = 'wall' | 'cars' | 'paint' | 'goals';

/** The tabs, left to right. */
export const WALL_PAGES: readonly WallPage[] = ['wall', 'cars', 'paint', 'goals'];

export const PAGE_TITLES: Readonly<Record<WallPage, string>> = { wall: 'TOTALS', cars: 'CARS', paint: 'STYLE', goals: 'GOALS' };

/** Every intent the wall reports (`GarageActions`), by name; the prep items by cash and by video. */
export type WallAction = 'driveOut' | 'double' | 'buy' | 'keep' | 'select' | 'upgrade' | 'prep' | 'prepVideo' | 'respray' | 'kit';

const PAGE_OF: Readonly<Record<WallAction, WallPage>> = {
  // the door's own: DRIVE OUT stands in the footer of every page and has the focus on TOTALS; the double offer is TOTALS'
  driveOut: 'wall',
  double: 'wall',
  buy: 'cars',
  keep: 'cars',
  select: 'cars',
  // under the car they belong to (TUNE until M8.5)
  upgrade: 'cars',
  // the next run's boosters, a row each under the upgrades (PREP until M8.5): W drives out from TOTALS, so TOTALS keeps
  // no buttons of its own but the door's offer
  prep: 'cars',
  prepVideo: 'cars',
  respray: 'paint',
  kit: 'paint',
};

/** The page an action's button stands on. */
export function pageOf(action: WallAction): WallPage {
  return PAGE_OF[action];
}

/** Every action the wall offers. */
export const WALL_ACTIONS: readonly WallAction[] = Object.keys(PAGE_OF) as WallAction[];
