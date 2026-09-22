/**
 * M4 in the browser (docs/M4_PLAN.md §6.2), against the preview build. Slice
 * 3a: the road bot drives to the hideout (`?bot=door`), the door shuts and the
 * wall is a game-made break (`gameplayStop`), and opening it hands the game
 * back (`gameplayStart`). Slice 4: the cold open's first caption and the
 * session flag. The heat runs, the busted flow and the ad paths join in slices
 * 6 and 8.
 */
import { expect, test } from '@playwright/test';

type Calls = { gameplayStart: number; gameplayStop: number; adRequests: number };

test('3.14 the bot drives into the hideout: the door is a break, opening it resumes play', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?spawn=crown&bot=door&quality=low');
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 60_000 });
  const before = await page.evaluate(() => window.__game?.platformCalls as Calls);
  expect(before.gameplayStart).toBe(1);
  expect(before.gameplayStop).toBe(0);
  await page.waitForFunction(() => window.__game?.sim.run.state === 'door', null, { timeout: 90_000, polling: 100 });
  // the wall is up and the car is behind a shut door
  await page.waitForSelector('.run__wall.is-visible', { timeout: 5_000 });
  const shut = await page.evaluate(() => ({ calls: window.__game?.platformCalls as Calls, doorShut: window.__game?.sim.run.doorShut, runs: window.__game?.sim.run.runs }));
  expect(shut.calls.gameplayStop).toBe(1);
  expect(shut.calls.gameplayStart).toBe(1);
  expect(shut.doorShut).toBe(true);
  await page.evaluate(() => window.__game?.sim.run.openDoor());
  await page.waitForFunction(() => (window.__game?.platformCalls as Calls).gameplayStart === 2, null, { timeout: 5_000 });
  const open = await page.evaluate(() => ({ state: window.__game?.sim.run.state, doorShut: window.__game?.sim.run.doorShut, runs: window.__game?.sim.run.runs }));
  expect(open).toEqual({ state: 'running', doorShut: false, runs: 1 });
  await expect(page.locator('.run__wall')).not.toHaveClass(/is-visible/);
  expect(errors).toEqual([]);
});

test('4.9 the cold open: the steer keycaps within 3 s of control, and never again after a reload in the same session', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?coldopen=1&quality=low');
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 60_000 });
  const caption = page.locator('.cold__caption--steer');
  await expect(caption).toHaveClass(/is-visible/, { timeout: 3_000 });
  await expect(caption.locator('kbd')).toHaveCount(4);
  await expect(caption).toContainText('DRIVE');
  expect(await page.evaluate(() => window.__game?.sim.coldOpen.active)).toBe(true);
  // a plain reload in the same tab: the session has seen it
  await page.goto('/?quality=low');
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 60_000 });
  await page.waitForTimeout(1_500);
  expect(await page.evaluate(() => window.__game?.sim.coldOpen.active)).toBe(false);
  await expect(page.locator('.cold')).not.toHaveClass(/is-active/);
  expect(await page.locator('.cold__caption.is-visible').count()).toBe(0);
  expect(errors).toEqual([]);
});
