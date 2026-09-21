/**
 * M3 gates (docs/M3_PLAN.md §5.2), against the preview build: a bot run with
 * traffic and pedestrians on inside the perf budgets, a keyboard swap, the
 * takedown slow motion on the loop, and wrecked to respawn.
 */
import { expect, test } from '@playwright/test';
import type { PerfResult } from '../src/app/perf';

/** AgentState values (src/sim/traffic/Traffic.ts); the page has no enum at hand. */
const PHYSICAL = 2;
const ABANDONED = 5;
/** TRAFFIC.physicsBodies (src/sim/traffic/tuning.ts). */
const PHYSICS_BODIES = 16;
/** The island's east boundary wall face. */
const WALL_FACE = 786.5;

type LifeCounts = Record<string, number>;
type LifeWindow = Window & { __lifeCounts?: LifeCounts; __lifeSeq?: number };

test('bot drives 60 s with traffic and pedestrians on, meets them, holds the budgets', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP throttling needs Chromium');
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/?bot=1&seed=42&duration=60&quality=low');
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 60_000 });
  // count every event kind over the whole run (the ring only keeps the last 64)
  await page.evaluate(() => {
    const w = window as LifeWindow;
    w.__lifeCounts = {};
    w.__lifeSeq = 0;
    setInterval(() => {
      const sim = window.__game?.sim;
      if (!sim) return;
      w.__lifeSeq = sim.events.readFrom(w.__lifeSeq ?? 0, (e) => { const c = w.__lifeCounts as LifeCounts; c[e.kind] = (c[e.kind] ?? 0) + 1; });
    }, 200);
  });
  await page.waitForFunction(() => window.__perfDone === true, null, { timeout: 150_000 });
  const perf = (await page.evaluate(() => window.__perf)) as PerfResult;
  const state = await page.evaluate((physical) => {
    const w = window as LifeWindow;
    const sim = window.__game?.sim;
    if (!sim || !sim.traffic || !sim.peds) return null;
    return {
      counts: w.__lifeCounts ?? {},
      physical: sim.traffic.count(physical),
      guardHops: sim.traffic.guardHops,
      pedHops: sim.peds.guaranteeHops,
      kinematic: sim.traffic.count(1),
      peds: sim.peds.count(),
    };
  }, PHYSICAL);
  expect(state).not.toBeNull();
  if (!state) return;
  console.log(`[life] fps ${perf.fpsMean.toFixed(1)}  frame p95 ${perf.frameMs.p95.toFixed(1)} ms  step p95 ${perf.stepMs.p95.toFixed(1)} ms  draws ${perf.drawCalls.max}  tris ${perf.triangles.max}  heap ${perf.heapMb.max.toFixed(0)} MB  resets ${perf.botResets}`);
  console.log(`[life] events ${JSON.stringify(state.counts)}  agents kinematic ${state.kinematic} physical ${state.physical}  peds ${state.peds}  guard hops ${state.guardHops}  ped hops ${state.pedHops}`);
  expect(perf.frameMs.p95).toBeLessThan(33.4);
  expect(perf.drawCalls.max).toBeLessThanOrEqual(300);
  expect(perf.triangles.max).toBeLessThanOrEqual(600_000);
  expect(perf.heapMb.max).toBeLessThanOrEqual(250);
  const met = (state.counts['hit'] ?? 0) + (state.counts['nearMiss'] ?? 0) + (state.counts['nearMissOncoming'] ?? 0);
  expect(met, 'the bot met traffic').toBeGreaterThan(0);
  expect(state.physical).toBeLessThanOrEqual(PHYSICS_BODIES);
  expect(state.guardHops).toBe(0);
  expect(state.pedHops).toBeLessThanOrEqual(3);
  expect(errors).toEqual([]);
});

test('swap by keyboard: E into the car alongside switches class and mesh', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?manual=1&quality=low');
  await page.waitForFunction(() => window.__game?.started);
  const step = async (ms: number) => { await page.evaluate((value) => window.advanceTime?.(value), ms); };
  await page.locator('#game').click();
  await step(500);
  const before = await page.evaluate((abandoned) => {
    const game = window.__game;
    const traffic = game?.sim.traffic;
    if (!game || !traffic) return null;
    const sim = game.sim;
    const p = sim.vehicle.body.translation();
    const yaw = sim.probe.yaw;
    // a parked compact 3 m to the player's right
    const rx = -Math.cos(yaw), rz = Math.sin(yaw);
    traffic.spawnAtPoint(p.x + rx * 3, p.z + rz * 3, yaw, 'compact', abandoned);
    return { carId: sim.carId, visible: game.renderer.visibleCar };
  }, ABANDONED);
  expect(before).not.toBeNull();
  await step(300);
  expect(await page.evaluate(() => window.__game?.sim.life.state.swapCandidate)).toBeGreaterThanOrEqual(0);
  await page.keyboard.down('KeyE'); await step(17); await page.keyboard.up('KeyE'); await step(200);
  const after = await page.evaluate(() => {
    const game = window.__game;
    if (!game) return null;
    return { carId: game.sim.carId, visible: game.renderer.visibleCar, errors: game.errors };
  });
  expect(after).not.toBeNull();
  expect(after?.carId).toBe('compact');
  expect(after?.carId).not.toBe(before?.carId);
  expect(after?.visible).toBe('compact');
  expect(after?.errors).toEqual([]);
  expect(errors).toEqual([]);
});

test('slow motion is a time scale on the loop: 1 s of wall time is slowMoScale of sim time', async ({ page }) => {
  await page.goto('/?manual=1&quality=low&traffic=0&peds=0');
  await page.waitForFunction(() => window.__game?.started);
  const step = async (ms: number) => { await page.evaluate((value) => window.advanceTime?.(value), ms); };
  await step(500);
  const t0 = await page.evaluate(() => {
    const sim = window.__game?.sim;
    if (!sim) return -1;
    sim.life.state.slowMo = 1.2;
    return sim.tick;
  });
  await step(1000);
  const t1 = await page.evaluate(() => window.__game?.sim.tick ?? -1);
  // slowMoScale 0.35 (src/sim/economy.ts): 60 frames of 1/60 s advance the sim by 0.35 × 60 ticks
  expect(t1 - t0).toBeGreaterThanOrEqual(19);
  expect(t1 - t0).toBeLessThanOrEqual(23);
  expect(await page.evaluate(() => window.__game?.sim.life.state.slowMo ?? -1)).toBeGreaterThan(0);
  // the slow motion ends by itself and the loop runs at full rate again
  await step(1500);
  expect(await page.evaluate(() => window.__game?.sim.life.state.slowMo)).toBe(0);
  const t2 = await page.evaluate(() => window.__game?.sim.tick ?? -1);
  await step(1000);
  expect((await page.evaluate(() => window.__game?.sim.tick ?? -1)) - t2).toBe(60);
});

test('wrecked to respawn: a full-speed wall hit wrecks, the timer rolls a clean car out on a lane', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?manual=1&quality=low&traffic=0&peds=0');
  await page.waitForFunction(() => window.__game?.started);
  const step = async (ms: number) => { await page.evaluate((value) => window.advanceTime?.(value), ms); };
  await page.evaluate((wall) => {
    const sim = window.__game?.sim;
    if (!sim) return;
    sim.vehicle.teleport({ x: wall - 40, y: 1, z: 100 }, Math.PI / 2);
  }, WALL_FACE);
  await step(500);
  let wrecked = false;
  for (let i = 0; i < 40 && !wrecked; i++) {
    wrecked = await page.evaluate(() => {
      const sim = window.__game?.sim;
      if (!sim) return false;
      if (!sim.life.state.wrecked) sim.vehicle.setVelocity(160 / 3.6, sim.vehicle.telemetry.vy, 0);
      window.advanceTime?.(100);
      return sim.life.state.wrecked;
    });
  }
  expect(wrecked, 'a 160 km/h wall hit wrecks the car').toBe(true);
  expect(await page.evaluate(() => window.__game?.sim.vehicle.engineCut)).toBe(true);
  await step(3500);
  const after = await page.evaluate(() => {
    const sim = window.__game?.sim;
    if (!sim || !sim.city) return null;
    const p = sim.vehicle.body.translation();
    const near = sim.city.nearestRoad(p.x, p.z, { name: 'n', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
    return {
      damage: sim.life.state.damage,
      wrecked: sim.life.state.wrecked,
      engineCut: sim.vehicle.engineCut,
      laneDistance: Math.hypot(near.position.x - p.x, near.position.z - p.z),
      speed: sim.vehicle.telemetry.speed,
    };
  });
  expect(after).not.toBeNull();
  expect(after?.damage).toBe(0);
  expect(after?.wrecked).toBe(false);
  expect(after?.engineCut).toBe(false);
  expect(after?.laneDistance).toBeLessThan(1);
  expect(errors).toEqual([]);
});
