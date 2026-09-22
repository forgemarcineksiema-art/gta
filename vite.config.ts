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
    exclude: [...configDefaults.exclude, ...(process.env.LONG === '1' ? [] : ['tests/**/*.long.test.ts'])],
    environment: 'node',
    testTimeout: 60000,
  },
});
