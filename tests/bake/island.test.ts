/**
 * The island's bake (M8.10 slice 18): the world made on the island as the game makes it, its island baked (every
 * chunk's heights and props, what the world worked out from it) and written gzipped to `public/island.bin`, its key to
 * `output/island.key`. Run by `npm run bake` (BAKE=1), never by the quick set; it pins nothing (`island/bake.test.ts` does).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { it } from 'vitest';
import { SimWorld, initPhysics } from '../../src/sim';
import { bakeSections, type Island } from '../../src/sim/island/Island';
import { packSections } from '../../src/sim/pack';

it('bakes the island', async () => {
  await initPhysics();
  const sim = new SimWorld({ map: 'island', seed: 42 });
  const bake = { ...(sim.island as Island).toBake(), key: process.env['BAKE_KEY'] ?? '' };
  mkdirSync('public', { recursive: true });
  mkdirSync('output', { recursive: true });
  writeFileSync('public/island.bin', gzipSync(packSections(bakeSections(bake)), { level: 9 }));
  writeFileSync('output/island.key', bake.key);
  sim.dispose();
}, 300_000);
