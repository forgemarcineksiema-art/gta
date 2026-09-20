/**
 * Smoke test against the production build: loads, reaches gameplay-start, the
 * bot drives for 20 s with no console errors. Also records every byte requested
 * before gameplay-start into perf/startup.json for `npm run budget`.
 */
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

interface StartupRequest {
  url: string;
  bytes: number;
  beforeGameplayStart: boolean;
}

test('loads, starts gameplay, bot drives 20 s without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  const requests: StartupRequest[] = [];
  let gameplayStarted = false;
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!url.startsWith('http://localhost')) return;
      const body = await res.body().catch(() => Buffer.alloc(0));
      requests.push({ url, bytes: body.length, beforeGameplayStart: !gameplayStarted });
    } catch {
      /* ignore */
    }
  });

  const t0 = Date.now();
  await page.goto('/?bot=1&seed=42&duration=20');
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
  gameplayStarted = true;
  const startMs = Date.now() - t0;

  const calls = await page.evaluate(() => (window.__game?.platformCalls as { gameplayStart: number; loadingStart: number; loadingStop: number }) ?? null);
  expect(calls).not.toBeNull();
  expect(calls?.gameplayStart).toBe(1);
  expect(calls?.loadingStart).toBe(1);
  expect(calls?.loadingStop).toBe(1);

  // 20 s of simulated driving; wall time may be longer under headless software GL
  await page.waitForFunction(() => (window.__game?.sim.time ?? 0) >= 20, null, { timeout: 120_000 });
  await page.waitForFunction(() => window.__perfDone === true, null, { timeout: 60_000 });
  const perf = await page.evaluate(() => window.__perf);
  expect(perf).toBeTruthy();
  expect(perf?.frames ?? 0).toBeGreaterThan(20);
  console.log(
    `[smoke] gl ${perf?.glRenderer}; gameplay-start at ${startMs} ms, ${perf?.frames} frames, fps(mean) ${perf?.fpsMean.toFixed(1)}, frame p95 ${perf?.frameMs.p95.toFixed(1)} ms, draw calls ${perf?.drawCalls.max}, tris ${perf?.triangles.max}`,
  );

  const gameErrors = await page.evaluate(() => window.__game?.errors ?? []);
  expect([...errors, ...gameErrors]).toEqual([]);

  mkdirSync('perf', { recursive: true });
  writeFileSync(
    'perf/startup.json',
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        timeToGameplayStartMs: startMs,
        requests,
        bytesBeforeGameplayStart: requests.filter((r) => r.beforeGameplayStart).reduce((a, r) => a + r.bytes, 0),
      },
      null,
      2,
    ),
  );
});
