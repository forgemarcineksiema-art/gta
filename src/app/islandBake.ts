/**
 * The island's bake (M8.10 slice 18): its builders' work done once at the build (`npm run bake`), fetched beside the
 * physics' start, unzipped and unpacked here; null without it (the island is then built from its plan, slower).
 */
import { BAKE_SECTIONS, joinBake, type IslandBake } from '../sim/island/Island';
import { SectionReader } from '../sim/pack';

/** The bake's file next to the page (relative: the game runs in an iframe), asked for by this build's key (a cached one of
 * the last build's is not what it gets: vite.config.ts writes the same into the page's early fetch). */
export const ISLAND_BAKE_URL = `./island.bin?k=${__ISLAND_KEY__}`;

/** The page's own fetch of the bake (index.html starts it once the scripts are in), or this one's. */
declare global {
  interface Window {
    __islandBin?: Promise<Response>;
    /** The page's retry click (index.html), taken back by the game's boot. */
    __retryClick?: () => void;
  }
}

/** A download with no bytes this long has stalled (s): the island is built from its plan instead of a boot that hangs. */
const STALL = 20;

/** The next chunk of a download, or null when none came in `STALL` s. */
function readOrStall(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<ReadableStreamReadResult<Uint8Array> | null> {
  let timer = 0;
  const stall = new Promise<null>((resolve) => { timer = window.setTimeout(() => resolve(null), STALL * 1000); });
  return Promise.race([reader.read(), stall]).finally(() => window.clearTimeout(timer));
}

/** The bake's response: the page's early fetch, or a second try when that one failed (a network blip). */
async function fetchBake(url: string): Promise<Response | null> {
  try {
    const res = await (url === ISLAND_BAKE_URL ? (window.__islandBin ??= fetch(url)) : fetch(url));
    if (res.ok && res.body) return res;
  } catch { /* the second try */ }
  try {
    const res = await fetch(url);
    return res.ok && res.body ? res : null;
  } catch {
    return null;
  }
}

/** The bake, if it is there and of this build's sources (`key`); else null (a missing, cut, stalled or other bake). */
export async function loadIslandBake(key: string, url = ISLAND_BAKE_URL): Promise<IslandBake | null> {
  try {
    const res = await fetchBake(url);
    if (!res?.body) return null;
    // each section read as soon as it is in (M8.10 slice 18): the reading done while the rest comes
    const stream = res.body.pipeThrough(new DecompressionStream('gzip')).getReader(), reader = new SectionReader(), sections: unknown[] = [];
    for (;;) {
      const next = await readOrStall(stream);
      if (!next) {
        console.warn(`island: the bake stalled ${STALL} s: built from its plan instead`);
        void stream.cancel();
        return null;
      }
      const { done, value } = next;
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
    // every section read (an empty or a cut file builds the island from its plan)
    return reader.done && sections.length === BAKE_SECTIONS ? joinBake(sections) : null;
  } catch {
    return null;
  }
}
