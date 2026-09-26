/**
 * The island's bake (M8.10 slice 18): its builders' work done once at the build (`npm run bake`), fetched beside the
 * physics' start, unzipped and unpacked here; null without it (the island is then built from its plan, slower).
 */
import type { IslandBake } from '../sim/island/Island';
import { unpack } from '../sim/pack';

/** The bake's file next to the page (relative: the game runs in an iframe). */
export const ISLAND_BAKE_URL = './island.bin';

/** The bake, if it is there and of this build's sources (`key`); else null. */
export async function loadIslandBake(key: string, url = ISLAND_BAKE_URL): Promise<IslandBake | null> {
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) return null;
    const bytes = new Uint8Array(await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    const bake = unpack(bytes) as IslandBake;
    if (bake.key === key) return bake;
    console.warn(`island: the bake is of other sources (${bake.key ?? 'none'}, the build's ${key}): built from its plan instead`);
    return null;
  } catch {
    return null;
  }
}
