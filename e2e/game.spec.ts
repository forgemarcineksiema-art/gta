/**
 * M5 in the browser (docs/M5_PLAN.md §5.2), against the preview build: the
 * garage on the wall by keys and by clicks, the door's offer on every ad
 * path (off, an error, a finished video), the save across a reload, a
 * delivery and an order by the bot, the cold open once and not twice.
 * Every case ends with no page errors.
 */
import { expect, test, type Page } from '@playwright/test';

type Calls = { gameplayStart: number; gameplayStop: number; adRequests: number; happyTime: number };

function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

async function boot(page: Page, query: string): Promise<void> {
  await page.goto(`/?manual=1&quality=low&spawn=crown&fresh=1${query}`);
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
}

/**
 * The car inside the hideout, stopped, and the door shut (the wall is up), with a bag and a level; then the
 * wall's key guard. The first door of a session makes no ad and no offer, so `second` shuts one first.
 */
async function shutDoor(page: Page, bag: number, second = true): Promise<void> {
  await page.evaluate(({ bag, second }) => {
    const sim = window.__game!.sim;
    const site = sim.run.dropOffs[0]!;
    const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
    const shut = (b: number): void => {
      sim.city!.sync(site.x - fx * 40, site.z - fz * 40, true);
      sim.vehicle.teleport({ x: site.x - fx * 40, y: 0.9, z: site.z - fz * 40 }, site.yaw);
      window.advanceTime!(100);
      sim.run.bag = b;
      sim.run.maxHeat = 2;
      sim.vehicle.teleport({ x: site.x - fx * 2, y: 0.9, z: site.z - fz * 2 }, site.yaw);
      window.advanceTime!(3600);
    };
    if (second) {
      shut(0);
      sim.run.openDoor();
      window.advanceTime!(100);
    }
    shut(bag);
  }, { bag, second });
  expect(await page.evaluate(() => window.__game?.sim.run.state)).toBe('door');
  await page.evaluate(() => window.advanceTime?.(700));
}

/** A key by code, then a frame so the wall reads it. */
async function key(page: Page, code: string): Promise<void> {
  await page.keyboard.press(code);
  await page.evaluate(() => window.advanceTime?.(34));
}

async function gain(page: Page): Promise<number> {
  return page.evaluate(() => window.__game?.audio.output?.gain.value ?? -1);
}

test('4.7 with ads off the video buttons are absent and the cash buttons are there; no offer at the door', async ({ page }) => {
  const errors = watch(page);
  await boot(page, '&ad=off');
  await shutDoor(page, 20_000);
  expect(await page.locator('.wall__offer.is-open').count()).toBe(0);
  expect(await page.evaluate(() => (window.__game?.platformCalls as Calls).adRequests)).toBe(0);
  await page.locator('.wall__tab', { hasText: 'PREP' }).click();
  expect(await page.locator('.wall__page--prep .wall__btn--cash:visible').count()).toBe(2);
  expect(await page.locator('.wall__page--prep .wall__btn--video:visible').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('4.8 an ad that errors at the offer pays nothing: the bag and bank unchanged, input back, the sound back', async ({ page }) => {
  const errors = watch(page);
  await boot(page, '&ad=error&adError=other');
  await key(page, 'KeyW');
  await shutDoor(page, 20_000);
  expect(await page.locator('.wall__offer.is-open').count()).toBe(1);
  const before = await page.evaluate(() => ({ bank: window.__game!.sim.run.bank, bag: window.__game!.sim.run.lastBag }));
  await key(page, 'KeyA');
  await key(page, 'KeyW');
  await page.waitForFunction(() => window.__game?.adShowing === false, null, { timeout: 5_000 });
  await page.evaluate(() => window.advanceTime?.(50));
  const after = await page.evaluate(() => ({ bank: window.__game!.sim.run.bank, bag: window.__game!.sim.run.lastBag, calls: window.__game!.platformCalls as Calls }));
  expect(after.bank).toBe(before.bank);
  expect(after.bag).toBe(before.bag);
  expect(after.calls.adRequests).toBe(1);
  expect(await page.locator('.wall__offer.is-open').count()).toBe(0);
  expect(await gain(page)).toBeGreaterThan(0.01);
  // the keys work again: W drives out
  await page.evaluate(() => window.advanceTime?.(700));
  await key(page, 'KeyW');
  expect(await page.evaluate(() => window.__game?.sim.run.state)).toBe('running');
  expect(errors).toEqual([]);
});

test('4.9 a finished video doubles the bag once, one request for that door, silence only while it runs', async ({ page }) => {
  const errors = watch(page);
  await boot(page, '&adDuration=1');
  await key(page, 'KeyW');
  await shutDoor(page, 20_000);
  const before = await page.evaluate(() => ({ bank: window.__game!.sim.run.bank, banked: window.__game!.sim.run.lastBanked, ads: (window.__game!.platformCalls as Calls).adRequests }));
  expect(before.ads).toBe(0);
  await key(page, 'KeyA');
  await key(page, 'KeyW');
  expect(await page.evaluate(() => window.__game?.adShowing)).toBe(true);
  await page.waitForTimeout(300);
  expect(await gain(page)).toBeLessThan(0.01);
  await page.waitForFunction(() => window.__game?.adShowing === false, null, { timeout: 5_000 });
  await page.evaluate(() => window.advanceTime?.(50));
  const after = await page.evaluate(() => ({ bank: window.__game!.sim.run.bank, banked: window.__game!.sim.run.lastBanked, ads: (window.__game!.platformCalls as Calls).adRequests }));
  expect(after.ads).toBe(1);
  expect(after.bank - before.bank).toBe(before.banked);
  expect(after.banked).toBe(before.banked * 2);
  expect(await page.locator('.wall__offer.is-open').count()).toBe(0);
  await page.waitForTimeout(200);
  expect(await gain(page)).toBeGreaterThan(0.01);
  // a second try is not offered: the offer is gone and W drives out
  await page.evaluate(() => window.advanceTime?.(700));
  await key(page, 'KeyW');
  expect(await page.evaluate(() => (window.__game?.platformCalls as Calls).adRequests)).toBe(1);
  expect(await page.evaluate(() => window.__game?.sim.run.state)).toBe('running');
  expect(errors).toEqual([]);
});

test('4.10 the garage by keys alone: buy the compact and drive out in it in under eight presses; gameplayStart once more', async ({ page }) => {
  const errors = watch(page);
  await boot(page, '&ad=off');
  await page.evaluate(() => { window.__game!.sim.run.bank = 12_000; });
  await shutDoor(page, 0);
  const starts = await page.evaluate(() => (window.__game?.platformCalls as Calls).gameplayStart);
  let presses = 0;
  const press = async (code: string): Promise<void> => { presses++; await key(page, code); };
  // D to the cars, W into them (the compact is focused: the first car the bank can buy), W buys it
  await press('KeyD');
  await press('KeyW');
  await press('KeyW');
  // back to the pages, back to the totals, W drives out
  await press('KeyS');
  await press('KeyS');
  await press('KeyW');
  const out = await page.evaluate(() => ({ state: window.__game!.sim.run.state, car: window.__game!.sim.carId, owned: [...window.__game!.sim.garage.owned], bank: window.__game!.sim.run.bank, calls: window.__game!.platformCalls as Calls }));
  expect(out.state).toBe('running');
  expect(out.car).toBe('compact');
  expect(out.owned).toContain('compact');
  expect(out.bank).toBe(2_000);
  expect(out.calls.gameplayStart).toBe(starts + 1);
  expect(out.calls.happyTime).toBe(1);
  expect(presses).toBeLessThan(8);
  console.info(`door to driving out in a new car: ${presses} key presses`);
  expect(errors).toEqual([]);
});

test('5.4 a fresh profile gets the cold open, its first caption inside 3 s of control; a reload does not repeat it', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/?fresh=1&quality=low');
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 60_000 });
  await expect(page.locator('.cold__caption--steer')).toHaveClass(/is-visible/, { timeout: 3_000 });
  expect(await page.evaluate(() => window.__game?.sim.coldOpen.active)).toBe(true);
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('save') ?? '{}') as { seen?: boolean }).seen)).toBe(true);
  await page.goto('/?quality=low');
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 60_000 });
  await page.waitForTimeout(1_000);
  expect(await page.evaluate(() => window.__game?.sim.coldOpen.active)).toBe(false);
  expect(await page.locator('.cold__caption.is-visible').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('5.5 the cold open\'s door makes no ad request and offers nothing; its wall names the first new car', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/?coldopen=1&manual=1&quality=low&fresh=1');
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__game?.sim.coldOpen.active)).toBe(true);
  await page.evaluate(() => { window.__game!.sim.run.bag = 20_000; });
  await shutDoor(page, 20_000, false);
  expect(await page.evaluate(() => window.__game?.sim.coldOpen.active)).toBe(false);
  expect(await page.evaluate(() => (window.__game?.platformCalls as Calls).adRequests)).toBe(0);
  expect(await page.locator('.wall__offer.is-open').count()).toBe(0);
  await expect(page.locator('.run__first')).toContainText('FIRST NEW CAR: 10,000');
  expect(errors).toEqual([]);
});
