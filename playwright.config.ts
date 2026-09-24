import { defineConfig } from '@playwright/test';
import { MAIN_PORT, e2ePort } from './e2e/port';

// All e2e specs run against the production build served by `vite preview`,
// so they measure what CrazyGames would actually serve. The port is this checkout's
// own (`e2e/port.ts`): 4173 in the main folder, where `npm start` may already serve
// the same build; a worktree's own elsewhere, never reused, so a busy port fails the
// run instead of testing someone else's build.
const port = e2ePort();
const url = `http://localhost:${port}`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: url,
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    // ask headless Chromium for the real GPU where the OS allows it (falls back to SwiftShader)
    launchOptions: { args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=default'] },
  },
  webServer: {
    command: `npx vite preview --port ${port} --strictPort`,
    url,
    reuseExistingServer: port === MAIN_PORT,
    timeout: 30_000,
  },
});
