/**
 * The look (docs/M8.9_PLAN.md §1.2, slice 1): the review's states and the four districts, shot and measured. The world's
 * numbers are read from the WebGL canvas alone (drawn into a 2D canvas in the frame's own task, so the HUD is not in
 * them): the mean saturation, the share of strongly saturated pixels, the facades' band, the luminance behind the HUD
 * (the frame's top 15 %) and the share of clipped pixels. The HUD's are read from the DOM: the visible texts under 13 px,
 * and what shows at the top centre besides the line.
 *
 * `npm run look` shoots every state at 1280×720 into `screens/look/<LOOK_SET>/` (default `now`), with the numbers in
 * `numbers.json` and one line a state on the console: a slice's stills (`-g stills`, `LOOK_STATES=calm,sign` to pick).
 * `LOOK_GATE=1` shoots at 800×450, 1280×720 and 1920×1080 and asserts §1.2's targets: the gate's run, on Marcin's word
 * that the other session is idle (CLAUDE.md, Two milestones at once, rule 6). Slice 1 shot the before set once
 * (`LOOK_SET=before LOOK_SIZES=all`), kept for the gate's board.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const SET = process.env['LOOK_SET'] ?? 'now';
const GATE = process.env['LOOK_GATE'] === '1';
const ONLY = (process.env['LOOK_STATES'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const SIZES: Array<[number, number]> = GATE || process.env['LOOK_SIZES'] === 'all' ? [[800, 450], [1280, 720], [1920, 1080]] : [[1280, 720]];
const OUT = `screens/look/${SET}`;
const DATE = 'date=2026-09-23';

/** The world's targets (§1.2), asserted on the calm drives with `LOOK_GATE=1`. */
const WORLD = { meanS: 0.3, strong: 0.1, band: 0.25, topLum: 0.18, clip: 0.005 } as const;
/** The calm frames the world's targets read. */
const CALM = new Set(['calm', 'district-crown', 'district-foundry', 'district-gardens', 'district-marina']);

test.use({ deviceScaleFactor: 1 });

interface WorldNumbers { meanS: number; strong: number; band: number; topLum: number; clip: number }
interface HudNumbers { small: string[]; top: string[] }

/** In the page: the world's numbers from the canvas, the HUD's from the DOM. Installed before the game's script. */
const INSTALL = (): void => {
  const lin = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    lin[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  const look = {
    world(): WorldNumbers {
      const src = document.getElementById('game') as HTMLCanvasElement;
      const w = src.width, h = src.height;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      ctx.drawImage(src, 0, 0);
      const d = ctx.getImageData(0, 0, w, h).data;
      let n = 0, sumS = 0, strong = 0, clip = 0, bandN = 0, bandS = 0, topN = 0, topL = 0;
      for (let y = 0; y < h; y += 2) {
        const fy = y / h;
        for (let x = 0; x < w; x += 2) {
          const i = (y * w + x) * 4;
          const r = d[i] as number, g = d[i + 1] as number, b = d[i + 2] as number;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const s = max === 0 ? 0 : (max - min) / max;
          n++;
          sumS += s;
          if (s > 0.5) strong++;
          if (max >= 250) clip++;
          const fx = x / w;
          // the facades' band, outside the player's car (centre, lower half)
          if (fy >= 0.3 && fy < 0.55 && !(fx > 0.38 && fx < 0.62 && fy > 0.45)) { bandN++; bandS += s; }
          if (fy < 0.15) { topN++; topL += 0.2126 * (lin[r] as number) + 0.7152 * (lin[g] as number) + 0.0722 * (lin[b] as number); }
        }
      }
      return { meanS: sumS / n, strong: strong / n, band: bandN ? bandS / bandN : 0, topLum: topN ? topL / topN : 0, clip: clip / n };
    },
    hud(): HudNumbers {
      const small: string[] = [];
      const shown = (e: Element): boolean => {
        for (let p: Element | null = e; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
        }
        const r = e.getBoundingClientRect();
        return r.width >= 1 && r.height >= 1;
      };
      const ui = document.getElementById('ui');
      if (ui) {
        for (const e of Array.from(ui.querySelectorAll<HTMLElement>('*'))) {
          if (e.closest('.devpanel, .hud__debug, .fake-ad')) continue;
          const own = Array.from(e.childNodes).some((c) => c.nodeType === Node.TEXT_NODE && (c.textContent ?? '').trim() !== '');
          if (!own || !shown(e)) continue;
          const px = parseFloat(getComputedStyle(e).fontSize);
          if (px < 13) small.push(`${e.className || e.tagName} ${px.toFixed(1)}px "${(e.textContent ?? '').trim().slice(0, 24)}"`);
        }
      }
      const top: string[] = [];
      const items: Array<[string, string]> = [
        ['card', '.jobs__card.is-visible'], ['caption', '.cold.is-active .cold__caption.is-visible'],
        ['hints', '.hud__hints:not(.is-hidden)'], ['news', '.hud__ticker.is-on'],
      ];
      for (const [name, sel] of items) {
        const e = document.querySelector(sel);
        if (e && shown(e)) top.push(name);
      }
      return { small, top };
    },
  };
  (window as unknown as { __look: typeof look }).__look = look;
};

async function boot(page: Page, query: string, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.addInitScript(INSTALL);
  await page.goto(`/?lang=pl&${query}`);
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 60_000 });
}

async function adv(page: Page, ms: number): Promise<void> {
  await page.evaluate((m) => window.advanceTime!(m), ms);
}

/** One state: a frame rendered, its world's numbers read in the same task, the HUD's, a screenshot. */
async function snap(page: Page, state: string): Promise<void> {
  if (ONLY.length && !ONLY.includes(state)) return;
  const vp = page.viewportSize()!;
  const size = `${vp.width}x${vp.height}`;
  // the DOM's fades are real-time (the cards' 0.25 s, the names' 0.5 s)
  await page.waitForTimeout(350);
  const world = await page.evaluate(() => {
    window.advanceTime!(16);
    return (window as unknown as { __look: { world(): WorldNumbers } }).__look.world();
  });
  const hud = await page.evaluate(() => (window as unknown as { __look: { hud(): HudNumbers } }).__look.hud());
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${state}-${size}.png` });
  const file = `${OUT}/numbers.json`;
  const all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> : {};
  all[`${state}@${size}`] = { world, hud };
  writeFileSync(file, JSON.stringify(all, null, 1));
  const f = (v: number): string => v.toFixed(3);
  console.log(`[look ${SET}] ${state} ${size}: S ${f(world.meanS)} strong ${f(world.strong)} band ${f(world.band)} top ${f(world.topLum)} clip ${f(world.clip)}; small ${hud.small.length}; top [${hud.top.join(',')}]`);
  if (GATE) {
    if (CALM.has(state)) {
      expect(world.meanS, `${state} mean saturation`).toBeGreaterThanOrEqual(WORLD.meanS);
      expect(world.strong, `${state} saturated share`).toBeGreaterThanOrEqual(WORLD.strong);
      expect(world.band, `${state} facades' band`).toBeGreaterThanOrEqual(WORLD.band);
      expect(world.topLum, `${state} behind the HUD`).toBeLessThanOrEqual(WORLD.topLum);
      expect(world.clip, `${state} clipped`).toBeLessThan(WORLD.clip);
    }
    expect(hud.small, `${state} ${size}: texts under 13 px`).toEqual([]);
    expect(hud.top.length, `${state} ${size}: the top centre [${hud.top.join(',')}]`).toBeLessThanOrEqual(1);
  }
}

/** The car on the way's route, `back` metres before its goal, facing along it, at `speed` m/s (the review's approach). */
async function onRoute(page: Page, back: number, speed: number): Promise<void> {
  await page.evaluate(({ back, speed }) => {
    const sim = window.__game!.sim;
    const way = sim.way!;
    const p = way.points, n = way.count;
    if (n < 2) return;
    let left = back, i = n - 1;
    let x = p[i * 2] as number, z = p[i * 2 + 1] as number, yaw = 0;
    while (i > 0) {
      const ax = p[(i - 1) * 2] as number, az = p[(i - 1) * 2 + 1] as number;
      const seg = Math.hypot(x - ax, z - az);
      yaw = Math.atan2(x - ax, z - az);
      if (seg >= left) {
        x -= Math.sin(yaw) * left;
        z -= Math.cos(yaw) * left;
        left = 0;
        break;
      }
      left -= seg;
      x = ax;
      z = az;
      i--;
    }
    sim.city!.sync(x, z, true);
    sim.vehicle.teleport({ x, y: 0.9, z }, yaw);
    sim.vehicle.setVelocity(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed);
  }, { back, speed });
}

/** A drop-off's frame (along inward, across to the right), as the screens suite places the car. */
const RUN_STATES = `
  const sim = window.__game.sim;
  const site = sim.run.dropOffs[0];
  const at = (along, across) => ({ x: site.x + Math.sin(site.yaw) * along - Math.cos(site.yaw) * across, z: site.z + Math.cos(site.yaw) * along + Math.sin(site.yaw) * across });
  const place = (along) => { const p = at(along, 0); sim.city.sync(p.x, p.z, true); sim.vehicle.teleport({ x: p.x, y: 0.9, z: p.z }, site.yaw); };
`;

function wanted(...states: string[]): boolean {
  return !ONLY.length || states.some((s) => ONLY.includes(s));
}

for (const [w, h] of SIZES) {
  test(`stills: the intro at ${w}x${h}`, async ({ page }) => {
    test.skip(!wanted('intro'));
    await boot(page, 'coldopen=1&manual=1', w, h);
    await adv(page, 600);
    await snap(page, 'intro');
  });

  test(`stills: a drive, the map, a sign, a card, a step at ${w}x${h}`, async ({ page }) => {
    test.skip(!wanted('calm', 'map', 'sign', 'card', 'step'));
    await boot(page, `manual=1&spawn=crown&ad=off&fresh=1&${DATE}`, w, h);
    await adv(page, 13_000);
    await snap(page, 'calm');
    if (wanted('map')) {
      await page.keyboard.down('Tab');
      await adv(page, 400);
      await snap(page, 'map');
      await page.keyboard.up('Tab');
      await adv(page, 100);
    }
    if (!wanted('sign', 'card', 'step')) return;
    await onRoute(page, 50, 0);
    // the chase camera settles behind the car
    await adv(page, 1500);
    await snap(page, 'sign');
    // rolled into the ring under 20 km/h: the job's card; then the chain's step
    await onRoute(page, 9, 3);
    for (let k = 0; k < 40 && await page.evaluate(() => window.__game!.sim.jobs.state === 'idle'); k++) await adv(page, 50);
    await adv(page, 200);
    await snap(page, 'card');
    await adv(page, 2600);
    await snap(page, 'step');
  });

  test(`stills: a chase at three stars at ${w}x${h}`, async ({ page }) => {
    test.skip(!wanted('chase3'));
    await boot(page, `manual=1&spawn=gardens&heat=3&ad=off&fresh=1&${DATE}`, w, h);
    await adv(page, 13_000);
    await page.evaluate(() => {
      const sim = window.__game!.sim;
      sim.pursuit.force();
    });
    await adv(page, 1200);
    await snap(page, 'chase3');
  });

  test(`stills: five stars and the helicopter at ${w}x${h}`, async ({ page }) => {
    test.skip(!wanted('heli5'));
    await boot(page, `manual=1&bot=skilled&heat=5&seed=7&ad=off&fresh=1&${DATE}`, w, h);
    for (let k = 0; k < 150; k++) {
      await adv(page, 200);
      const lit = await page.evaluate(() => {
        const heli = window.__game!.sim.police?.heli;
        return !!heli && heli.active && heli.sees;
      });
      if (lit) break;
    }
    await adv(page, 400);
    await snap(page, 'heli5');
  });

  test(`stills: busted, the door, CARS, STYLE at ${w}x${h}`, async ({ page }) => {
    test.skip(!wanted('busted', 'totals', 'cars', 'style'));
    await boot(page, `manual=1&spawn=crown&ad=off&fresh=1&${DATE}`, w, h);
    await page.evaluate(`${RUN_STATES}
      sim.police.dispatching = false;
      sim.heat.add(60);
      sim.run.bag = 48750;
      sim.run.maxHeat = 3;
      place(-26);
      for (const across of [3.6, -3.6]) { const p = at(-26, across); sim.traffic.spawnParkedPolice(p.x, p.z, site.yaw, 'police'); }
      window.advanceTime(1500);
    `);
    await snap(page, 'busted');
    await adv(page, 1800);
    await page.evaluate(() => { window.__game!.sim.run.closeCard(); window.advanceTime!(50); });
    await page.evaluate(`${RUN_STATES}
      sim.run.bag = 32500;
      sim.run.maxHeat = 4;
      Object.assign(sim.run.counts, { takedowns: 3, escapes: 2, billboards: 5, coins: 84, smashes: 46, damage: 18400 });
      place(-2);
      window.advanceTime(3400);
    `);
    await adv(page, 400);
    await snap(page, 'totals');
    await page.evaluate(() => { window.__game!.sim.run.bank = 25000; window.advanceTime!(700); });
    await page.locator('.wall__tab').nth(1).click();
    await adv(page, 200);
    await snap(page, 'cars');
    await page.locator('.wall__tab').nth(2).click();
    await adv(page, 200);
    await snap(page, 'style');
  });

  if (w === 1280 || GATE) {
    for (const district of ['crown', 'foundry', 'gardens', 'marina']) {
      test(`stills: the district ${district} at ${w}x${h}`, async ({ page }) => {
        test.skip(!wanted(`district-${district}`));
        await boot(page, `manual=1&spawn=${district}&ad=off&fresh=1&${DATE}`, w, h);
        await adv(page, 13_000);
        await snap(page, `district-${district}`);
      });
    }
  }
}
