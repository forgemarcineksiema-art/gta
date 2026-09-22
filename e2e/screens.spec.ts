/**
 * Screenshot review: captures the HUD, the pause screen and the life state
 * (popup, damage bar, swap prompt, billboard counter) at every viewport size
 * CrazyGames requires legibility at (docs/CRAZYGAMES.md), at DPR 1, plus the
 * wrecked overlay at 1280x720; and the run (M4): the bag and the busted bar
 * filling, the busted card, and the wall behind the hideout's shut door.
 * Output: screens/<state>-<w>x<h>.png. Look at them.
 */
import { expect, test } from '@playwright/test';
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
    // Visibility, not presence: every label is always in the DOM.
    const shown = ['.hud__oncoming.is-on', '.hud__damage.is-visible', '.hud__swap.is-visible'];
    await page.waitForFunction((want: string[]) => {
      const sim = window.__game?.sim;
      const traffic = sim?.traffic;
      if (!sim || !traffic) return false;
      // Life recomputes the flag every step, before the HUD reads it: hold it on for the frame
      (sim.life as unknown as { oncomingLane(): void }).oncomingLane = () => { sim.life.state.oncoming = true; };
      sim.life.state.oncoming = true;
      sim.life.state.damage = 0.6;
      sim.life.state.stage = 2;
      if (sim.collectibles) sim.collectibles.smashedCount = 12;
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
      const text = document.querySelector('.hud__collect')?.textContent ?? '';
      return text.includes('12/50') && want.every((sel) => document.querySelector(sel) !== null);
    }, shown, { timeout: 30_000, polling: 100 }).catch(async () => {
      const state = await page.evaluate((want: string[]) => want.map((sel) => `${sel}: ${document.querySelector(sel) ? 'on' : 'off'}`).join(', '), shown);
      throw new Error(`life hud incomplete: ${state}`);
    });
    await page.screenshot({ path: `screens/life-${w}x${h}.png` });
    if (w === 1280 && h === 720) {
      await page.evaluate(() => (window.__game?.sim.life as unknown as { wreck(): void }).wreck());
      await page.waitForSelector('.hud__wrecked.is-visible', { timeout: 10_000 });
      await page.waitForTimeout(400); // the overlay fades in
      await page.screenshot({ path: `screens/wrecked-${w}x${h}.png` });
    }
  });
}

/** A point in a drop-off's frame (along inward, across to the right); the page has no helpers at hand. */
const RUN_STATES = `
  const sim = window.__game.sim;
  const site = sim.run.dropOffs[0];
  const at = (along, across) => ({ x: site.x + Math.sin(site.yaw) * along - Math.cos(site.yaw) * across, z: site.z + Math.cos(site.yaw) * along + Math.sin(site.yaw) * across });
  const place = (along) => { const p = at(along, 0); sim.city.sync(p.x, p.z, true); sim.vehicle.teleport({ x: p.x, y: 0.9, z: p.z }, site.yaw); };
`;

for (const [w, h] of SIZES) {
  test(`run states at ${w}x${h}`, async ({ page }) => {
    mkdirSync('screens', { recursive: true });
    await page.setViewportSize({ width: w, height: h });
    // ads off: these frames are the card and the wall, not the ad that follows them
    await page.goto('/?manual=1&quality=low&spawn=crown&ad=off');
    await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
    // boxed on the street outside the hideout at heat 3, the bag full: the busted bar half way
    await page.evaluate(`${RUN_STATES}
      sim.police.dispatching = false;
      sim.heat.add(60);
      sim.run.bag = 48750;
      sim.run.maxHeat = 3;
      place(-26);
      for (const across of [3.6, -3.6]) { const p = at(-26, across); sim.traffic.spawnParkedPolice(p.x, p.z, site.yaw, 'police'); }
      window.advanceTime(1500);
    `);
    await page.waitForSelector('.run__busted.is-visible', { timeout: 10_000 });
    await page.screenshot({ path: `screens/bar-${w}x${h}.png` });
    await page.evaluate(() => window.advanceTime?.(1800));
    await page.waitForSelector('.run__card.is-visible', { timeout: 10_000 });
    await page.screenshot({ path: `screens/busted-${w}x${h}.png` });
    // the card goes, the hideout: the car stopped inside, three seconds, the wall
    // after a card the entry boxes re-arm once the car is outside them: one step on the street first
    await page.evaluate(() => { window.__game?.sim.run.closeCard(); window.advanceTime?.(50); });
    await page.evaluate(`${RUN_STATES}
      sim.run.bag = 32500;
      sim.run.maxHeat = 4;
      Object.assign(sim.run.counts, { takedowns: 3, escapes: 2, billboards: 5, coins: 84 });
      place(-2);
      window.advanceTime(3400);
    `);
    await page.waitForSelector('.run__wall.is-visible', { timeout: 10_000 });
    await page.screenshot({ path: `screens/door-${w}x${h}.png` });
  });
}

for (const [w, h] of SIZES) {
  test(`cold open at ${w}x${h}`, async ({ page }) => {
    mkdirSync('screens', { recursive: true });
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?coldopen=1&manual=1&quality=low');
    await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
    await page.evaluate(() => window.advanceTime?.(800));
    await page.waitForSelector('.cold__caption--steer.is-visible', { timeout: 10_000 });
    // past the caption's 0.25 s entrance
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screens/cold-${w}x${h}.png` });
  });
}

test('5.9 a police car alongside: the swap prompt says BORROW at 1280x720', async ({ page }) => {
  mkdirSync('screens', { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?manual=1&quality=low&spawn=crown');
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
  await page.evaluate(() => {
    window.advanceTime?.(600);
    const sim = window.__game!.sim;
    const p = sim.vehicle.body.translation();
    const yaw = sim.probe.yaw;
    sim.traffic!.spawnParkedPolice(p.x - Math.cos(yaw) * 3.4, p.z + Math.sin(yaw) * 3.4, yaw, 'police');
    window.advanceTime?.(100);
  });
  await expect(page.locator('.hud__swap')).toHaveClass(/is-visible/, { timeout: 5_000 });
  await expect(page.locator('.hud__swap-label')).toHaveText('BORROW');
  await page.screenshot({ path: 'screens/borrow-1280x720.png' });
});
