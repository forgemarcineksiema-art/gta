/**
 * Screenshot review: captures the HUD, the pause screen and the life state
 * (popup, damage bar, swap prompt, billboard counter) at every viewport size
 * CrazyGames requires legibility at (docs/CRAZYGAMES.md), at DPR 1, plus the
 * wrecked overlay at 1280x720; and the run (M4): the bag and the busted bar
 * filling, the busted card, and the wall behind the hideout's shut door; M5:
 * a delivery's line and card, and the garage's CARS and DAILIES pages on the wall; M5.5: the goal line, a chain
 * step's card, the skill chain and the full-screen map; M6: the wall's BOARD and STYLE pages and a rival's race.
 * M7 slice 1: in every driving state no two HUD boxes intersect.
 * M8.5 (DESIGN.md §17): a calm drive shows exactly its seven things, nothing of
 * the drive shows over the busted card or the wall, two pops at most, the
 * wall's four pages (TOTALS without scrolling at every size).
 * Output: screens/<state>-<w>x<h>.png. Look at them.
 */
import { expect, test, type Page } from '@playwright/test';
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

/**
 * No two visible HUD boxes intersect (M7 slice 1): the top column (the job line and its card, the intro's caption,
 * the key hints, the news), the stars, the bag, the coins, the pops, the speed, the radar, the skill chain, the lap,
 * the swap prompt, the busted pad, the drift readout, the toast.
 */
async function expectNoOverlap(page: Page, state: string): Promise<void> {
  const hits = await page.evaluate(() => {
    const selectors = ['.hud__top', '.hud__heat', '.run__bag', '.run__coins', '.hud__popup', '.hud__speedo', '.minimap', '.hud__skill', '.hud__lap', '.hud__swap', '.run__busted', '.hud__toast'];
    const boxes: Array<{ name: string; r: DOMRect }> = [];
    for (const selector of selectors) {
      for (const e of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
        const r = e.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        boxes.push({ name: selector, r });
      }
    }
    const out: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!.r, b = boxes[j]!.r;
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`${boxes[i]!.name} x ${boxes[j]!.name}`);
      }
    }
    return out;
  });
  expect(hits, state).toEqual([]);
}

/** Nothing at the top of the screen lies over the wall behind a shut door (the M7 gate: the news over STYLE's tabs, the stars over its corner). */
async function expectClearOfWall(page: Page, state: string): Promise<void> {
  const hits = await page.evaluate(() => {
    const wall = document.querySelector<HTMLElement>('.run__wall.is-visible');
    if (!wall) return ['no wall'];
    const w = wall.getBoundingClientRect();
    const out: string[] = [];
    for (const e of Array.from(document.querySelectorAll<HTMLElement>('.hud__top > *, .hud__heat, .run__bag, .run__coins'))) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.left < w.right - 1 && w.left < r.right - 1 && r.top < w.bottom - 1 && w.top < r.bottom - 1) out.push(e.className);
    }
    return out;
  });
  expect(hits, state).toEqual([]);
}

/**
 * The driving screen's things that show (DESIGN.md §17.2): each a box with a size, not hidden, not faded out; the
 * radar's district name counts apart from its circle, the top column's items apart from each other.
 */
const DRIVING = ['.jobs__line', '.jobs__card', '.hud__hints', '.hud__ticker', '.hud__heat', '.run__bag', '.run__coins', '.minimap__canvas', '.minimap__district', '.hud__speedo', '.hud__damage', '.hud__skill', '.hud__popup', '.hud__swap', '.run__busted', '.hud__lap', '.hud__toast'];

async function drivingShown(page: Page): Promise<string[]> {
  return page.evaluate((selectors: string[]) => {
    const out: string[] = [];
    for (const selector of selectors) {
      for (const e of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
        // an ancestor hidden or faded hides it too (the top column, the radar's quiet names)
        let hidden = false;
        for (let p = e.parentElement; p; p = p.parentElement) {
          const ps = getComputedStyle(p);
          if (ps.display === 'none' || ps.visibility === 'hidden' || Number(ps.opacity) < 0.05) { hidden = true; break; }
        }
        const r = e.getBoundingClientRect();
        if (hidden || r.width < 1 || r.height < 1) continue;
        out.push(selector);
        break;
      }
    }
    return out;
  }, DRIVING);
}

for (const [w, h] of SIZES) {
  test(`hud and pause at ${w}x${h}`, async ({ page }) => {
    mkdirSync('screens', { recursive: true });
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?lang=en&bot=1&seed=7');
    await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
    // the screen's typeface in before anything is measured (M8.9 R2: font-display swap)
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    // let the bot get some speed so the HUD shows numbers
    await page.waitForFunction(() => Math.abs(window.__game?.sim.vehicle.telemetry.speedKmh ?? 0) > 40, null, { timeout: 20_000 });
    await page.screenshot({ path: `screens/hud-${w}x${h}.png` });
    await expectNoOverlap(page, `hud ${w}x${h}`);
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => window.__game?.paused === true);
    await page.screenshot({ path: `screens/pause-${w}x${h}.png` });
    // the life frame is a driving frame: unpause first
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => window.__game?.paused === false);
    // The life frame is polled, not set-and-shot: Life recomputes its state every step,
    // and a parked car beside a bot at 90 km/h is no swap candidate, so the companion drives the lane.
    // Visibility, not presence: every label is always in the DOM.
    const shown = ['.hud__damage.is-visible', '.hud__swap.is-visible'];
    await page.waitForFunction((want: string[]) => {
      const sim = window.__game?.sim;
      const traffic = sim?.traffic;
      if (!sim || !traffic) return false;
      // the third stage: the damage's arc stands (M8.9 R4; below it, it shows only for a moment after a hit)
      sim.life.state.damage = 0.9;
      sim.life.state.stage = 3;
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
      return want.every((sel) => document.querySelector(sel) !== null);
    }, shown, { timeout: 30_000, polling: 100 }).catch(async () => {
      const state = await page.evaluate((want: string[]) => want.map((sel) => `${sel}: ${document.querySelector(sel) ? 'on' : 'off'}`).join(', '), shown);
      throw new Error(`life hud incomplete: ${state}`);
    });
    await page.screenshot({ path: `screens/life-${w}x${h}.png` });
    await expectNoOverlap(page, `life ${w}x${h}`);
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
    await page.goto('/?lang=en&manual=1&quality=low&spawn=crown&ad=off&fresh=1&date=2026-09-23');
    await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
    // the screen's typeface in before anything is measured (M8.9 R2: font-display swap)
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    // a delivery just taken: its line at the top and its card
    await page.evaluate(() => {
      const sim = window.__game!.sim;
      const d = sim.jobs.defs.find((k) => k.kind === 'delivery')!;
      sim.city!.sync(d.x, d.z, true);
      sim.vehicle.teleport({ x: d.x, y: 0.9, z: d.z }, d.yaw + Math.PI);
      window.advanceTime!(400);
    });
    await page.waitForSelector('.jobs__card.is-visible', { timeout: 10_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screens/job-${w}x${h}.png` });
    await expectNoOverlap(page, `job ${w}x${h}`);
    await page.evaluate(() => { window.__game!.sim.jobs.abandon(); window.__game!.sim.heat.reset(); window.advanceTime!(50); });
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
    await expectNoOverlap(page, `bar ${w}x${h}`);
    await page.evaluate(() => window.advanceTime?.(1800));
    await page.waitForSelector('.run__card.is-visible', { timeout: 10_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screens/busted-${w}x${h}.png` });
    // the card has the screen: nothing of the drive shows or speaks over it (M8.5)
    expect(await drivingShown(page), `busted ${w}x${h}`).toEqual([]);
    // the card goes, the hideout: the car stopped inside, three seconds, the wall
    // after a card the entry boxes re-arm once the car is outside them: one step on the street first
    await page.evaluate(() => { window.__game?.sim.run.closeCard(); window.advanceTime?.(50); });
    await page.evaluate(`${RUN_STATES}
      sim.run.bag = 32500;
      sim.run.maxHeat = 4;
      Object.assign(sim.run.counts, { takedowns: 3, escapes: 2, billboards: 5, coins: 84, smashes: 46, damage: 18400 });
      place(-2);
      window.advanceTime(3400);
    `);
    await page.waitForSelector('.run__wall.is-visible', { timeout: 10_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screens/door-${w}x${h}.png` });
    await expectClearOfWall(page, `door ${w}x${h}`);
    expect(await drivingShown(page), `door ${w}x${h}`).toEqual([]);
    // TOTALS fits the wall without scrolling at every size (M8.5); four tabs
    const totals = await page.evaluate(() => {
      const p = document.querySelector<HTMLElement>('.run__wall-page')!;
      return { scroll: p.scrollHeight, client: p.clientHeight, tabs: Array.from(document.querySelectorAll('.wall__tab')).map((t) => t.textContent) };
    });
    expect(totals.scroll, `TOTALS scrolls at ${w}x${h}`).toBeLessThanOrEqual(totals.client + 1);
    expect(totals.tabs).toEqual(['TOTALS', 'CARS', 'STYLE', 'GOALS']);
    // the run's bill (M8): on the counts' line, which stays inside the wall's page
    expect(await page.locator('.run__counts').textContent()).toContain('CITY DAMAGE 18,400');
    const fits = await page.evaluate(() => {
      const c = document.querySelector('.run__counts')!.getBoundingClientRect(), p = document.querySelector('.run__wall-page')!.getBoundingClientRect();
      return c.left >= p.left - 1 && c.right <= p.right + 1 && c.bottom <= p.bottom + 1;
    });
    expect(fits, `the counts inside the page at ${w}x${h}`).toBe(true);
    // the garage: the CARS page with the compact in reach and the rest not
    await page.evaluate(() => { window.__game!.sim.run.bank = 25000; window.advanceTime!(700); });
    for (const code of ['KeyD', 'KeyW']) {
      await page.keyboard.press(code);
      await page.evaluate(() => window.advanceTime?.(34));
    }
    await page.waitForSelector('.wall__card.is-focus', { timeout: 10_000 });
    await page.screenshot({ path: `screens/garage-${w}x${h}.png` });
    await expectClearOfWall(page, `garage ${w}x${h}`);
    // down CARS (M8.5): the upgrades, then the next run's boosters, the focus brought into view
    for (let k = 0; k < 4; k++) {
      await page.keyboard.press('KeyW');
      await page.evaluate(() => window.advanceTime?.(34));
    }
    await page.waitForSelector('.wall__page--cars.is-current .wall__btn--cash.is-focus', { timeout: 10_000 });
    await page.screenshot({ path: `screens/boosters-${w}x${h}.png` });
    await expectClearOfWall(page, `boosters ${w}x${h}`);
    // GOALS (M8.5): the next goal, the day's three, the wanted board, the hunts
    await page.locator('.wall__tab', { hasText: 'GOALS' }).click();
    await page.waitForSelector('.wall__page--goals.is-current .wall__daily', { timeout: 10_000 });
    await page.waitForSelector('.wall__page--goals.is-current .wall__chip', { timeout: 10_000 });
    await page.screenshot({ path: `screens/goals-${w}x${h}.png` });
    await expectClearOfWall(page, `goals ${w}x${h}`);
    // STYLE (M6): the paint, the car's kit and the driver's
    await page.locator('.wall__tab', { hasText: 'STYLE' }).click();
    await page.waitForSelector('.wall__page--paint.is-current .wall__kit', { timeout: 10_000 });
    await page.screenshot({ path: `screens/style-${w}x${h}.png` });
    await expectClearOfWall(page, `style ${w}x${h}`);
  });
}

for (const [w, h] of SIZES) {
  test(`M6 states at ${w}x${h}`, async ({ page }) => {
    mkdirSync('screens', { recursive: true });
    await page.setViewportSize({ width: w, height: h });
    // the first rival ready, the player pulled up at her bay: the race's card, then its line
    await page.goto('/?lang=en&manual=1&quality=low&ad=off&fresh=1&board=10&job=duel');
    await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
    // the screen's typeface in before anything is measured (M8.9 R2: font-display swap)
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.evaluate(() => window.advanceTime?.(400));
    await page.waitForSelector('.jobs__card.is-visible', { timeout: 10_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screens/duel-${w}x${h}.png` });
    await expectNoOverlap(page, `duel ${w}x${h}`);
    await page.evaluate(() => window.advanceTime?.(2000));
    await page.screenshot({ path: `screens/duel-line-${w}x${h}.png` });
    await expectNoOverlap(page, `duel-line ${w}x${h}`);
  });
}

for (const [w, h] of SIZES) {
  test(`M5.5 states at ${w}x${h}`, async ({ page }) => {
    mkdirSync('screens', { recursive: true });
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?lang=en&manual=1&quality=low&spawn=crown&ad=off&fresh=1&date=2026-09-23');
    await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
    // the screen's typeface in before anything is measured (M8.9 R2: font-display swap)
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    // the goal line with no job running: the chain's first step and the way to it
    await page.evaluate(() => window.advanceTime?.(600));
    await page.waitForSelector('.jobs.is-visible', { timeout: 10_000 });
    await page.screenshot({ path: `screens/goal-${w}x${h}.png` });
    await expectNoOverlap(page, `goal ${w}x${h}`);
    // a calm drive (M8.5, DESIGN.md §17.2): once the key hints have taught and the district's name has had its seconds,
    // the line, the stars, the bank, the radar with the way's route, the speed with the boost: the six (no arrow, DESIGN.md §20)
    // the frames' clock is the manual one here: 12.5 s of it and the hints have taught (their 8 s on an empty top,
    // M8.9 R5), the district's name has had its 4 s
    await page.evaluate(() => window.advanceTime?.(12_500));
    await page.waitForSelector('.hud__hints.is-hidden', { state: 'attached', timeout: 5_000 });
    // the names fade over half a second of real time
    await page.waitForTimeout(700);
    await page.screenshot({ path: `screens/calm-${w}x${h}.png` });
    expect(await drivingShown(page), `calm ${w}x${h}`).toEqual(['.jobs__line', '.hud__heat', '.run__coins', '.minimap__canvas', '.hud__speedo']);
    expect(await page.evaluate(() => window.__game!.sim.way!.count), `the route on the radar at ${w}x${h}`).toBeGreaterThan(1);
    // a step of the chain ticked: its card
    await page.evaluate(() => {
      const run = window.__game!.sim.run;
      run.chain |= 1;
      run.chainLast = 0;
      run.chainSerial++;
      window.advanceTime?.(200);
    });
    await page.waitForSelector('.jobs__card.is-visible', { timeout: 10_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screens/chain-${w}x${h}.png` });
    await expectNoOverlap(page, `chain ${w}x${h}`);
    // the skill chain: seven near misses, the multiplier up
    await page.evaluate(() => {
      const sim = window.__game!.sim;
      for (let k = 0; k < 7; k++) sim.events.push('nearMiss', 0, sim.probe.x, 0, sim.probe.z, -1);
      window.advanceTime?.(100);
    });
    await page.waitForSelector('.hud__skill.is-visible', { timeout: 10_000 });
    await page.screenshot({ path: `screens/skill-${w}x${h}.png` });
    await expectNoOverlap(page, `skill ${w}x${h}`);
    // the combo's tricks never pop (M8.5): a burst of five pays pops two at most
    expect(await page.locator('.hud__popup.is-on').count(), `near misses pop at ${w}x${h}`).toBe(0);
    await page.evaluate(() => {
      const sim = window.__game!.sim;
      for (let k = 0; k < 5; k++) sim.events.push('chase', 100 * (k + 1), sim.probe.x, 0, sim.probe.z, -1);
      window.advanceTime?.(50);
    });
    expect(await page.locator('.hud__popup.is-on').count(), `pops at ${w}x${h}`).toBe(2);
    await expectNoOverlap(page, `pops ${w}x${h}`);
    // the full-screen map, held
    await page.keyboard.down('Tab');
    await page.evaluate(() => window.advanceTime?.(200));
    await page.waitForSelector('.bigmap.is-visible', { timeout: 10_000 });
    await page.evaluate(() => window.advanceTime?.(200));
    await page.screenshot({ path: `screens/map-${w}x${h}.png` });
    await page.keyboard.up('Tab');
  });
}

for (const [w, h] of SIZES) {
  test(`cold open at ${w}x${h}`, async ({ page }) => {
    mkdirSync('screens', { recursive: true });
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?lang=en&coldopen=1&manual=1&quality=low');
    await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
    // the screen's typeface in before anything is measured (M8.9 R2: font-display swap)
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.evaluate(() => window.advanceTime?.(800));
    await page.waitForSelector('.cold__caption--steer.is-visible', { timeout: 10_000 });
    // past the caption's 0.25 s entrance
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screens/cold-${w}x${h}.png` });
    await expectNoOverlap(page, `cold ${w}x${h}`);
  });
}

test('5.9 a police car alongside: the swap prompt says BORROW at 1280x720', async ({ page }) => {
  mkdirSync('screens', { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?lang=en&manual=1&quality=low&spawn=crown');
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 30_000 });
  // the screen's typeface in before anything is measured (M8.9 R2: font-display swap)
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
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
