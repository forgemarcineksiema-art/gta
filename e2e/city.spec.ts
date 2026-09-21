/** M2 gates: real startup, full-graph rendering residency/budgets, controls and player views. */
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

test('city is controllable within 6 s at 20 Mbit and 4x CPU', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 20_000_000 / 8, uploadThroughput: 5_000_000 / 8 });
  const start = Date.now();
  await page.goto('/?quality=low');
  await page.waitForFunction(() => window.__game?.started, null, { polling: 10 });
  const wall = Date.now() - start;
  // Time to control as the platform sees it: navigation start to the first
  // controllable frame. The wall clock above also contains browser process and
  // GPU start-up outside the page, which varied by seconds between runs.
  const timings = await page.evaluate(() => window.__game?.bootTimings ?? {});
  const elapsed = timings['firstFrame'] ?? wall;
  console.log(`[city startup] ${elapsed.toFixed(0)} ms to control (wall ${wall} ms), 20 Mbit / 4x CPU; phases ${JSON.stringify(timings)}`);
  mkdirSync('perf', { recursive: true });
  writeFileSync('perf/city-startup.json', JSON.stringify({ ms: elapsed, wall, timings, cpu: 4, mbit: 20 }));
  expect(elapsed).toBeLessThan(6000);
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => (window.__game?.sim.vehicle.telemetry.speedKmh ?? 0) > 10);
  await page.keyboard.up('ArrowUp');
});

for (const quality of ['low', 'high']) {
  test(`whole map streaming and render budgets on ${quality}`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`/?manual=1&bot=1&quality=${quality}`);
    await page.waitForFunction(() => window.__game?.started);
    const peak = { draws: 0, triangles: 0, heap: 0, meshes: 0, geometry: 0, physics: 0, loaded: 0, unloaded: 0, lanes: 0, simSeconds: 0, resets: 0 };
    // Accelerated fixed-step tour; render every 15 ticks. This measures residency and
    // scene budgets over every lane, not wall-clock FPS (the separate perf run does that).
    for (let batch = 0; batch < 32; batch++) {
      const result = await page.evaluate(() => {
        const game = window.__game;
        if (!game?.roadBot || !game.sim.city) throw new Error('city bot missing');
        const { sim, renderer, roadBot } = game;
        let draws = 0, triangles = 0, meshes = 0, geometry = 0, physics = 0;
        for (let i = 0; i < 6000 && !roadBot.tourComplete; i++) {
          roadBot.drive(sim, sim.controls, 1 / 60); sim.step();
          if (i % 15 === 0) {
            renderer.render(1, 0.25);
            draws = Math.max(draws, renderer.stats.drawCalls); triangles = Math.max(triangles, renderer.stats.triangles);
            meshes = Math.max(meshes, renderer.cityView?.meshes.size ?? 0);
            geometry = Math.max(geometry, renderer.renderer.info.memory.geometries);
            physics = Math.max(physics, sim.city?.active.size ?? 0);
          }
        }
        const memory = performance as unknown as { memory?: { usedJSHeapSize: number } };
        return { draws, triangles, meshes, geometry, physics, heap: (memory.memory?.usedJSHeapSize ?? 0) / 1048576,
          loaded: renderer.cityView?.loaded ?? 0, unloaded: renderer.cityView?.unloaded ?? 0,
          lanes: roadBot.visitedLanes.size, done: roadBot.tourComplete, simSeconds: sim.time, resets: roadBot.resets };
      });
      for (const key of Object.keys(peak) as Array<keyof typeof peak>) peak[key] = Math.max(peak[key], result[key]);
      if (result.done) break;
    }
    console.log(`[city ${quality}] ${JSON.stringify(peak)}`);
    mkdirSync('perf', { recursive: true });
    writeFileSync(`perf/city-${quality}.json`, JSON.stringify(peak, null, 2));
    expect(peak.lanes).toBe(178); expect(peak.resets).toBe(0);
    expect(peak.draws).toBeLessThanOrEqual(quality === 'low' ? 150 : 300);
    expect(peak.triangles).toBeLessThanOrEqual(quality === 'low' ? 250000 : 600000);
    expect(peak.heap).toBeLessThan(250);
    expect(peak.physics).toBeLessThanOrEqual(25);
    expect(peak.unloaded).toBeGreaterThan(49);
    // Leak guard: five parts per resident chunk, each with a near and a far
    // geometry, plus the fixed scene; a leak would scale with `loaded` (hundreds
    // of chunk loads over the tour).
    expect(peak.geometry).toBeLessThan(peak.meshes * 10 + 40);
    expect(errors).toEqual([]);
  });
}

test('player controls, reset, pause and district views', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?manual=1&quality=low');
  await page.waitForFunction(() => window.__game?.started);
  const step = async (ms: number) => { await page.evaluate((value) => window.advanceTime?.(value), ms); };
  await page.locator('#game').click();
  await page.keyboard.down('ArrowUp'); await step(4000); await page.keyboard.up('ArrowUp');
  expect(await page.evaluate(() => window.__game?.sim.vehicle.telemetry.speedKmh)).toBeGreaterThan(45);
  await page.keyboard.down('KeyP'); await step(17); await page.keyboard.up('KeyP'); await step(17);
  const tick = await page.evaluate(() => window.__game?.sim.tick);
  await step(1000); expect(await page.evaluate(() => window.__game?.sim.tick)).toBe(tick);
  await page.keyboard.down('KeyP'); await step(17); await page.keyboard.up('KeyP'); await step(17);
  expect(await page.evaluate(() => window.__game?.paused)).toBe(false);
  await page.keyboard.down('KeyR'); await step(17); await page.keyboard.up('KeyR'); await step(1000);
  expect(await page.evaluate(() => Math.abs(window.__game?.sim.vehicle.telemetry.speedKmh ?? 100))).toBeLessThan(1);
  mkdirSync('screens/m2', { recursive: true });
  for (const district of ['crown', 'foundry', 'gardens', 'marina', 'highway']) {
    await page.evaluate((name) => window.__game?.sim.spawnAt(name), district);
    await step(17);
    const distance = await page.evaluate(() => {
      const game = window.__game;
      if (!game) return Infinity;
      return game.renderer.camera.position.distanceTo(game.sim.vehicle.body.translation());
    });
    expect(distance, 'camera snaps on the first frame even after the fixed step clears respawn').toBeLessThan(40);
    await step(1000);
    await page.screenshot({ path: `screens/m2/${district}.png` });
    expect(await page.locator('.minimap__district').textContent()).not.toBe('');
  }
  expect(errors).toEqual([]);
});

test('automatic quality responds to sustained frame cost without changing the sim', async ({ page }) => {
  await page.goto('/?manual=1');
  await page.waitForFunction(() => window.__game?.started);
  const result = await page.evaluate(() => {
    const game = window.__game;
    if (!game) throw new Error('game missing');
    const tick = game.sim.tick;
    for (let i = 0; i < 450; i++) game.renderer.render(1, 1 / 60);
    const fast = game.renderer.quality;
    for (let i = 0; i < 650; i++) game.renderer.render(1, 0.04);
    return { fast, slow: game.renderer.quality, tick, after: game.sim.tick };
  });
  expect(result.fast).toBe('high'); expect(result.slow).toBe('low');
  expect(result.after).toBe(result.tick);
});
