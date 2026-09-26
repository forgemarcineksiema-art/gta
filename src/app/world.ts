/**
 * Which world a page makes (M8.10 slice 18: the island is the game's). `map=grid` (or `city`, or one of the grid's
 * spawns) makes the grid, kept for the gate's A/B until it goes; `map=playground`, a playground spawn or `bot=track` the
 * handling playground; anything else the island.
 */
export type WorldMap = 'city' | 'playground' | 'island';

/** The grid's spawns (a page asking for one is the grid's). */
export const GRID_SPAWNS: readonly string[] = ['city', 'crown', 'foundry', 'gardens', 'marina', 'highway', 'loop'];
/** The island's spawns (`Island.spawnPoints`, the hideout's after the garages). */
export const ISLAND_SPAWNS: readonly string[] = ['island', 'port', 'beach', 'runway', 'hideout'];

export function worldMap(params: URLSearchParams): WorldMap {
  const map = params.get('map'), spawn = params.get('spawn');
  if (map === 'island') return 'island';
  if (map === 'grid' || map === 'city' || (spawn !== null && GRID_SPAWNS.includes(spawn))) return 'city';
  if (map === 'playground' || params.get('bot') === 'track' || (spawn !== null && !ISLAND_SPAWNS.includes(spawn))) return 'playground';
  return 'island';
}
