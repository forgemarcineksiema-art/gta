/**
 * The boot, again and again (M7 slice 7, DESIGN.md §15.1: it loads every
 * time): 200 fresh boots of the preview build, each to control in under 6 s,
 * none stuck at LOADING. At the M6 gate one page in 51 stayed at LOADING for
 * 30 s; the loading screen now names a slow phase, which this reports.
 */
import { expect, test } from '@playwright/test';

const BOOTS = 200;

test('M7 7.2e 200 fresh boots each reach control in under 6 s', async ({ page }) => {
  test.setTimeout(BOOTS * 12_000);
  const times: number[] = [];
  const stuck: string[] = [];
  for (let k = 0; k < BOOTS; k++) {
    const t0 = Date.now();
    await page.goto('/?fresh=1&quality=low&manual=1&coldopen=0');
    try {
      await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 10_000, polling: 50 });
      times.push((Date.now() - t0) / 1000);
    } catch {
      stuck.push(`boot ${k}: ${await page.locator('#loading').textContent()}`);
    }
  }
  times.sort((a, b) => a - b);
  console.info(`boots: ${times.length} of ${BOOTS} started; p50 ${times[Math.floor(times.length / 2)]?.toFixed(2)} s, p95 ${times[Math.floor(times.length * 0.95)]?.toFixed(2)} s, max ${times[times.length - 1]?.toFixed(2)} s${stuck.length ? `; stuck: ${stuck.join(' / ')}` : ''}`);
  expect(stuck).toEqual([]);
  expect(times[times.length - 1] ?? 99).toBeLessThan(6);
});
