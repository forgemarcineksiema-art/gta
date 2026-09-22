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

for (const heat of [1, 3, 5]) {
  test(`6.12 heat ${heat} for 120 s with the road bot: the level's events, no errors, the budgets hold`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`/?heat=${heat}&bot=1&duration=120&quality=low`);
    await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 60_000 });
    await page.waitForFunction(() => window.__perfDone === true, null, { timeout: 200_000 });
    const result = await page.evaluate(() => {
      const sim = window.__game!.sim;
      const perf = window.__perf as { drawCalls: { max: number }; triangles: { max: number }; heapMb: { max: number }; stepMs: { p95: number }; fpsMean: number };
      return {
        roadblocks: sim.roadblocks?.placed ?? 0, flashes: sim.cameras?.flashes ?? 0, escapes: sim.pursuit.escapes,
        runs: sim.run.runs, level: sim.heat.level, units: sim.police?.count ?? 0, perf,
      };
    });
    console.log(`[heat ${heat}] ${result.escapes} escapes, ${result.runs} runs ended, ${result.roadblocks} roadblocks, ${result.flashes} camera flashes, level ${result.level} at the end; ${result.perf.fpsMean.toFixed(1)} fps, draws ${result.perf.drawCalls.max}, tris ${(result.perf.triangles.max / 1000).toFixed(0)}k, heap ${result.perf.heapMb.max.toFixed(0)} MB, step p95 ${result.perf.stepMs.p95.toFixed(2)} ms`);
    // level 1 has no roadblocks: the chase itself (escapes, a busted card) or a camera flash; 3 and 5 put up blocks
    if (heat >= 3) expect(result.roadblocks + result.flashes).toBeGreaterThanOrEqual(1);
    else expect(result.escapes + result.runs + result.flashes).toBeGreaterThanOrEqual(1);
    expect(result.perf.drawCalls.max).toBeLessThanOrEqual(300);
    expect(result.perf.triangles.max).toBeLessThanOrEqual(600_000);
    if (result.perf.heapMb.max > 0) expect(result.perf.heapMb.max).toBeLessThanOrEqual(250);
    expect(result.perf.stepMs.p95).toBeLessThan(12);
    expect(errors).toEqual([]);
  });
}

/** Put the car inside the hideout, stopped, and step until the door is shut (the wall is up). */
const SHUT_DOOR = `
  const sim = window.__game.sim;
  const site = sim.run.dropOffs[0];
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
  // out on the street first so the entry box re-arms after a previous door
  sim.city.sync(site.x - fx * 40, site.z - fz * 40, true);
  sim.vehicle.teleport({ x: site.x - fx * 40, y: 0.9, z: site.z - fz * 40 }, site.yaw);
  window.advanceTime(100);
  sim.vehicle.teleport({ x: site.x - fx * 2, y: 0.9, z: site.z - fz * 2 }, site.yaw);
  window.advanceTime(3600);
`;

async function gain(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => window.__game?.audio.output?.gain.value ?? -1);
}

test('8.1 an ad at the second door: one request, silence and no input while it runs, the door opens after', async ({ page }) => {
  await page.goto('/?manual=1&quality=low&spawn=crown&adDuration=1.5');
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
  // a key wakes the audio (a user gesture)
  await page.keyboard.press('KeyW');
  await page.evaluate(() => window.advanceTime?.(200));
  // the first door of the session ends the cold open: no ad
  await page.evaluate(SHUT_DOOR);
  expect(await page.evaluate(() => window.__game?.sim.run.state)).toBe('door');
  expect(await page.evaluate(() => (window.__game?.platformCalls as Calls).adRequests)).toBe(0);
  await page.evaluate(() => window.__game?.sim.run.openDoor());
  // the second door: the request, the silence, the block
  await page.evaluate(SHUT_DOOR);
  expect(await page.evaluate(() => window.__game?.sim.run.state)).toBe('door');
  expect(await page.evaluate(() => (window.__game?.platformCalls as Calls).adRequests)).toBe(1);
  expect(await page.evaluate(() => window.__game?.adShowing)).toBe(true);
  await page.waitForTimeout(300);
  expect(await gain(page)).toBeLessThan(0.01);
  await page.keyboard.press('KeyW');
  await page.evaluate(() => window.advanceTime?.(1000));
  expect(await page.evaluate(() => window.__game?.sim.run.state)).toBe('door');
  await page.waitForFunction(() => window.__game?.adShowing === false, null, { timeout: 5_000 });
  await page.waitForTimeout(200);
  expect(await gain(page)).toBeGreaterThan(0.01);
  await page.evaluate(() => window.advanceTime?.(700));
  await page.keyboard.press('KeyW');
  await page.evaluate(() => window.advanceTime?.(100));
  expect(await page.evaluate(() => window.__game?.sim.run.state)).toBe('running');
});

test('8.2 an ad that fails (adCooldown): the door opens on the next key, the sound untouched', async ({ page }) => {
  await page.goto('/?manual=1&quality=low&spawn=crown&ad=error&adError=adCooldown');
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
  await page.keyboard.press('KeyW');
  await page.evaluate(() => window.advanceTime?.(200));
  await page.evaluate(SHUT_DOOR);
  await page.evaluate(() => window.__game?.sim.run.openDoor());
  await page.evaluate(SHUT_DOOR);
  expect(await page.evaluate(() => (window.__game?.platformCalls as Calls).adRequests)).toBe(1);
  expect(await page.evaluate(() => window.__game?.adShowing)).toBe(false);
  await page.waitForTimeout(200);
  expect(await gain(page)).toBeGreaterThan(0.01);
  await page.evaluate(() => window.advanceTime?.(700));
  await page.keyboard.press('KeyW');
  await page.evaluate(() => window.advanceTime?.(100));
  expect(await page.evaluate(() => window.__game?.sim.run.state)).toBe('running');
});

test('8.3 with ads off no request is made', async ({ page }) => {
  await page.goto('/?manual=1&quality=low&spawn=crown&ad=off');
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
  await page.evaluate(SHUT_DOOR);
  await page.evaluate(() => window.__game?.sim.run.openDoor());
  await page.evaluate(SHUT_DOOR);
  expect(await page.evaluate(() => window.__game?.sim.run.state)).toBe('door');
  expect(await page.evaluate(() => (window.__game?.platformCalls as Calls).adRequests)).toBe(0);
});

test('8.4 the first door after the cold open makes no request', async ({ page }) => {
  await page.goto('/?coldopen=1&manual=1&quality=low');
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
  await page.evaluate(SHUT_DOOR);
  expect(await page.evaluate(() => window.__game?.sim.run.state)).toBe('door');
  expect(await page.evaluate(() => window.__game?.sim.coldOpen.active)).toBe(false);
  expect(await page.evaluate(() => (window.__game?.platformCalls as Calls).adRequests)).toBe(0);
});

test('8.5 the busted card requests one ad', async ({ page }) => {
  await page.goto('/?manual=1&quality=low&spawn=crown&adDuration=1');
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
  await page.evaluate(() => {
    const sim = window.__game!.sim;
    sim.police!.dispatching = false;
    sim.heat.add(40);
    const p = sim.vehicle.body.translation(), yaw = sim.probe.yaw;
    for (const across of [3.6, -3.6]) sim.traffic!.spawnParkedPolice(p.x - Math.cos(yaw) * across, p.z + Math.sin(yaw) * across, yaw, 'police');
    window.advanceTime?.(3600);
  });
  expect(await page.evaluate(() => window.__game?.sim.run.state)).toBe('busted');
  expect(await page.evaluate(() => (window.__game?.platformCalls as Calls).adRequests)).toBe(1);
  await page.waitForFunction(() => window.__game?.adShowing === false, null, { timeout: 5_000 });
  expect(await page.evaluate(() => (window.__game?.platformCalls as Calls).adRequests)).toBe(1);
});
