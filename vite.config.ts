import { readFileSync } from 'node:fs';
import { configDefaults, defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

export default defineConfig({
  // CrazyGames serves the build from an arbitrary path inside an iframe: relative URLs only.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
