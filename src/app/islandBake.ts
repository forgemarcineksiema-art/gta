/**
 * The island's bake (M8.10 slice 18): its builders' work done once at the build (`npm run bake`), fetched beside the
 * physics' start, unzipped and unpacked here; null without it (the island is then built from its plan, slower).
 */
import { joinBake, type IslandBake } from '../sim/island/Island';
import { SectionReader } from '../sim/pack';

/** The bake's file next to the page (relative: the game runs in an iframe). */
export const ISLAND_BAKE_URL = './island.bin';

/** The page's own fetch of the bake (index.html starts it once the scripts are in), or this one's. */
declare global {
  interface Window { __islandBin?: Promise<Response> }
}

/** The bake, if it is there and of this build's sources (`key`); else null. */
export async function loadIslandBake(key: string, url = ISLAND_BAKE_URL): Promise<IslandBake | null> {
  try {
    const res = await (url === ISLAND_BAKE_URL ? (window.__islandBin ??= fetch(url)) : fetch(url));
    if (!res.ok || !res.body) return null;
    // each section read as soon as it is in (M8.10 slice 18): the reading done while the rest comes
    const stream = res.body.pipeThrough(new DecompressionStream('gzip')).getReader(), reader = new SectionReader(), sections: unknown[] = [];
    for (;;) {
      const { done, value } = await stream.read();
      if (done) break;
      for (const section of reader.feed(value)) {
        // the key's first: a bake of other sources is let go at once
        if (sections.length === 0 && (section as { key?: string }).key !== key) {
          console.warn(`island: the bake is of other sources (${(section as { key?: string }).key ?? 'none'}, the build's ${key}): built from its plan instead`);
          void stream.cancel();
          return null;
        }
        sections.push(section);
      }
    }
    return reader.done ? joinBake(sections) : null;
  } catch {
    return null;
  }
}
