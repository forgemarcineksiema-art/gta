import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { configDefaults, defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

/**
 * The build stamp shown on the pause screen and in `window.__game.version`:
 * `<package version>+<short commit>`, `-dirty` when uncommitted changes went in.
 * The version is the milestone (0.4.x = M4); the commit says which build this is.
 */
function buildStamp(): string {
  try {
    const git = (cmd: string) => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = git('git status --porcelain') !== '' ? '-dirty' : '';
    return `${pkg.version}+${git('git rev-parse --short HEAD')}${dirty}`;
  } catch {
    return pkg.version;
  }
}

export default defineConfig({
  // CrazyGames serves the build from an arbitrary path inside an iframe: relative URLs only.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(buildStamp()) },
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'rapier', test: /node_modules[\/]@dimforge[\/]/ },
            { name: 'three', test: /node_modules[\/]three[\/]/ },
          ],
        },
      },
    },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    include: ['tests/**/*.test.ts'],
    // Long bot-driven pins (*.long.test.ts) run in `npm run verify:gate` / `npm run test:long` (LONG=1), not in the quick verify.
    // The balance script steps the sim for minutes: only `npm run balance` (BALANCE=1, or that npm script by name) runs it.
    exclude: [
      ...configDefaults.exclude,
      ...(process.env.LONG === '1' ? [] : ['tests/**/*.long.test.ts']),
      ...(process.env.BALANCE === '1' || process.env.npm_lifecycle_event === 'balance' ? [] : ['tests/sim/balance.test.ts']),
      // The atlas's dump (M8.10) writes the island for `npm run atlas` (ATLAS=1); it pins nothing.
      ...(process.env.ATLAS === '1' ? [] : ['tests/atlas/**']),
    ],
    environment: 'node',
    // Files share their worker's module graph: Rapier's WASM initialises once a worker, not once a file (the quick set
    // 65 → 35 s, M7 slice 0). Every world is its own SimWorld; a test that needs a fresh module is a module-level state bug.
    isolate: false,
    testTimeout: 60000,
  },
});
