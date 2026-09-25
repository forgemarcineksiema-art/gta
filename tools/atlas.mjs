#!/usr/bin/env node
/**
 * `npm run atlas` (M8.10 slice 1): the island drawn from above as the sim builds it. The dump
 * (`tests/atlas/island.test.ts`, ATLAS=1) writes `output/atlas/island.js`; `tools/atlas.html` draws it; headless
 * Chromium saves `output/atlas/island.png` (the island and its names) and `output/atlas/placed.png` (what stands where).
 * About 15 s. The picture each slice of the island ends with (docs/M8.10_PLAN.md §0).
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dump = spawnSync('npx', ['vitest', 'run', 'tests/atlas', '--reporter=dot'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ATLAS: '1' } });
if (dump.status !== 0) process.exit(dump.status ?? 1);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('atlas:', e.message));
for (const mode of ['island', 'placed']) {
  await page.goto(`${pathToFileURL(join(root, 'tools', 'atlas.html')).href}?mode=${mode}`);
  await page.waitForFunction(() => window.ATLAS_DONE === true, null, { timeout: 60000 });
  const png = await page.evaluate(() => document.getElementById('atlas').toDataURL('image/png'));
  writeFileSync(join(root, 'output', 'atlas', `${mode}.png`), Buffer.from(png.split(',')[1], 'base64'));
  console.log(`atlas: output/atlas/${mode}.png`);
}
await browser.close();
