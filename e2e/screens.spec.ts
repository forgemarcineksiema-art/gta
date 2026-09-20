/**
 * Screenshot review: captures the HUD (and the pause screen) at every viewport
 * size CrazyGames requires legibility at (docs/CRAZYGAMES.md), at DPR 1.
 * Output: screens/<state>-<w>x<h>.png. Look at them.
 */
import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SIZES: Array<[number, number]> = [
  [821, 462],
  [907, 510],
  [1077, 606],
  [1216, 684],
  [1280, 720],
  [1366, 768],
  [1536, 864],
  [1920, 1080],
  [800, 450],
  [1080, 607],
];

test.use({ deviceScaleFactor: 1 });

for (const [w, h] of SIZES) {
  test(`hud and pause at ${w}x${h}`, async ({ page }) => {
    mkdirSync('screens', { recursive: true });
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?bot=1&seed=7');
    await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
    // let the bot get some speed so the HUD shows numbers
    await page.waitForFunction(() => Math.abs(window.__game?.sim.vehicle.telemetry.speedKmh ?? 0) > 40, null, { timeout: 20_000 });
    await page.screenshot({ path: `screens/hud-${w}x${h}.png` });
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => window.__game?.paused === true);
    await page.screenshot({ path: `screens/pause-${w}x${h}.png` });
  });
}
