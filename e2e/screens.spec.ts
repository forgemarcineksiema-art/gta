/**
 * Screenshot review: captures the HUD, the pause screen and the life state
 * (popup, damage bar, swap prompt, billboard counter) at every viewport size
 * CrazyGames requires legibility at (docs/CRAZYGAMES.md), at DPR 1, plus the
 * wrecked overlay at 1280x720. Output: screens/<state>-<w>x<h>.png. Look at them.
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
    // the life frame is a driving frame: unpause first
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => window.__game?.paused === false);
    // The life frame is polled, not set-and-shot: Life recomputes its state every step,
    // and a parked car beside a bot at 90 km/h is no swap candidate, so the companion drives the lane.
    const needles = ['ONCOMING', 'DAMAGE', '12/50', 'SWAP'];
    let lifeText = '';
    await page.waitForFunction((want: string[]) => {
      const sim = window.__game?.sim;
      const traffic = sim?.traffic;
      if (!sim || !traffic) return false;
      sim.life.state.oncoming = true;
      sim.life.state.damage = 0.6;
      sim.life.state.stage = 2;
      if (sim.collectibles) sim.collectibles.smashedCount = 12;
      if (sim.events.entries[(sim.events.sequence - 1) % sim.events.capacity]?.kind !== 'nearMissOncoming') {
        sim.events.push('nearMissOncoming', 0.2, 0, 1, 0, -1);
      }
      if (sim.life.state.swapCandidate < 0) {
        const p = sim.vehicle.body.translation();
        const out = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
        const best = { lane: -1, s: 0, dist: Infinity };
        for (let lane = 0; lane < traffic.lanes.laneCount; lane++) {
          traffic.lanes.project(lane, p.x, p.z, out);
          if (out.dist < best.dist) { best.lane = lane; best.s = out.s; best.dist = out.dist; }
        }
        if (best.lane >= 0 && best.dist < 14) traffic.spawnAt(best.lane, best.s, 'compact', 1, 3);
      }
      const text = document.querySelector('.hud')?.textContent ?? '';
      return want.every((n) => text.includes(n));
    }, needles, { timeout: 30_000, polling: 100 }).catch(async () => {
      lifeText = await page.evaluate(() => document.querySelector('.hud')?.textContent ?? '');
      throw new Error(`life hud missing one of ${needles.join(', ')}: ${lifeText.slice(0, 300)}`);
    });
    await page.screenshot({ path: `screens/life-${w}x${h}.png` });
    if (w === 1280 && h === 720) {
      const wreckedText = await page.evaluate(() => new Promise<string>((resolve) => {
        const sim = window.__game?.sim;
        if (!sim) { resolve('no sim'); return; }
        (sim.life as unknown as { wreck(): void }).wreck();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(document.querySelector('.hud')?.textContent ?? '')));
      }));
      if (!wreckedText.includes('WRECKED')) throw new Error(`wrecked overlay missing: ${wreckedText.slice(0, 300)}`);
      await page.screenshot({ path: `screens/wrecked-${w}x${h}.png` });
    }
  });
}
