#!/usr/bin/env node
/**
 * `npm run bake` (M8.10 slice 18): the island built once, as the game would build it, and its bake written to
 * `public/island.bin` (gzipped) for the game to load instead of building it (`src/app/islandBake.ts`). Skipped when
 * `output/island.key` says the bake is of these very sources. About 15 s when it runs; `npm run build` runs it first.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { islandKey } from './islandKey.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const key = islandKey(root);
const keyFile = join(root, 'output', 'island.key');
if (existsSync(join(root, 'public', 'island.bin')) && existsSync(keyFile) && readFileSync(keyFile, 'utf-8').trim() === key) {
  console.log(`bake: public/island.bin is of these sources (${key})`);
  process.exit(0);
}
const run = spawnSync('npx', ['vitest', 'run', 'tests/bake', '--reporter=dot'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, BAKE: '1', BAKE_KEY: key } });
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(`bake: public/island.bin (${key})`);
