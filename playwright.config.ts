import { defineConfig } from '@playwright/test';

// All e2e specs run against the production build served by `vite preview`,
// so they measure what CrazyGames would actually serve.
export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    // ask headless Chromium for the real GPU where the OS allows it (falls back to SwiftShader)
    launchOptions: { args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=default'] },
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
