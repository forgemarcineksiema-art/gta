/**
 * The island's bake's key (M8.10 slice 18): a hash of every source file of the sim (the island's builders and all they
 * read) and of the bake's own driver (this tool and the test that makes it), so a bake made from other sources is never used. `tools/bake.mjs` writes it into the bake; the build gives it to
 * the game (`__ISLAND_KEY__`), which uses a bake only when the two agree.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function islandKey(root) {
  const hash = createHash('sha256');
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.ts')) {
        hash.update(name);
        hash.update(readFileSync(path));
      }
    }
  };
  walk(join(root, 'src', 'sim'));
  // by their names in the repo (the root comes with a trailing separator from vite's config, without from the bake)
  for (const name of ['tools/bake.mjs', 'tests/bake/island.test.ts']) {
    hash.update(name);
    hash.update(readFileSync(join(root, name)));
  }
  return hash.digest('hex').slice(0, 16);
}
