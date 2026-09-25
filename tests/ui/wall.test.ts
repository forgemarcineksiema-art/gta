/**
 * The wall in four (M8.5 slice 3, docs/DESIGN.md §17.5): TOTALS, CARS, STYLE,
 * GOALS in that order with every action the seven pages offered on one of
 * them; TOTALS' one line of sums and the busted card's; NEW BEST only when a
 * run beats every run before it.
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { KIT_INDEX, RIVALS, type SimWorld } from '../../src/sim';
import { GLYPHS } from '../../src/sim/glyphs';
import { carLook, newLook, newPreview } from '../../src/sim/garage/look';
import { PlayerCar } from '../../src/render/cars/PlayerCar';
import { ThumbQueue } from '../../src/render/cars/thumbs';
import { goalsModel } from '../../src/ui/wall/goals';
import { BALANCE } from '../../src/sim/balance';
import { BEST_AT, ROLE_WORDS, cardLine } from '../../src/sim/jobs/catalog';
import { CAR_IDS } from '../../src/sim/vehicle/presets';
import { carLine, setLang } from '../../src/ui/lang';
import { PL, PL_BEST } from '../../src/ui/pl';
import { cardLines, countsLine, doorLines } from '../../src/ui/hud/totals';
import { PAGE_TITLES, WALL_ACTIONS, WALL_PAGES, pageOf } from '../../src/ui/wall/wallPages';
import { createWorld, run, runUntil } from '../sim/helpers';

/** Into the hideout with `bag` at heat 0: the door shuts and banks it. */
function bankThrough(sim: SimWorld, bag: number): void {
  const site = sim.run.dropOffs[0]!;
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
  sim.run.bag = bag;
  sim.run.maxHeat = 0;
  sim.city?.sync(site.x - fx * 40, site.z - fz * 40, true);
  sim.vehicle.teleport({ x: site.x - fx * 40, y: 0.9, z: site.z - fz * 40 }, site.yaw);
  run(sim, 0.1);
  sim.vehicle.teleport({ x: site.x - fx * 2, y: 0.9, z: site.z - fz * 2 }, site.yaw);
  expect(runUntil(sim, 5, (s) => s.run.state === 'door')).toBeGreaterThan(0);
}

describe('the wall in four', () => {
  it('M8.5 3.1 four pages in order, and every action the seven pages offered stands on one of them', () => {
    expect(WALL_PAGES).toEqual(['wall', 'cars', 'paint', 'goals']);
    expect(WALL_PAGES.map((p) => PAGE_TITLES[p])).toEqual(['TOTALS', 'CARS', 'STYLE', 'GOALS']);
    // GarageActions: buy, keep, select, respray, kit, upgrade, buyPrep (cash), offer (the prep's video, the double), driveOut
    expect([...WALL_ACTIONS].sort()).toEqual(['buy', 'double', 'driveOut', 'keep', 'kit', 'prep', 'prepVideo', 'respray', 'select', 'upgrade']);
    for (const a of WALL_ACTIONS) expect(WALL_PAGES).toContain(pageOf(a));
    // TUNE and PREP went under the cars; TOTALS keeps the door's offer and DRIVE OUT, nothing else
    expect([pageOf('upgrade'), pageOf('prep'), pageOf('prepVideo')]).toEqual(['cars', 'cars', 'cars']);
    expect(WALL_ACTIONS.filter((a) => pageOf(a) === 'wall').sort()).toEqual(['double', 'driveOut']);
  });

  it('M8.5 3.2 the sums: the bag × the stars = banked, the double and the fence named in it; busted keeps half, three quarters with the lawyer; NEW BEST only when a run beats the best', async () => {
    expect(doorLines({ lastBag: 32_500, lastMultiplier: 2.6, lastBanked: 84_500, lastDoubled: false, lastFence: false }))
      .toEqual([{ label: 'BAG 32,500 ×2.6', value: '+84,500', strong: true }]);
    expect(doorLines({ lastBag: 65_000, lastMultiplier: 3.1, lastBanked: 201_500, lastDoubled: true, lastFence: true })[0]!.label)
      .toBe(`BAG 65,000 DOUBLED ×3.1 (BAG BONUS +${BALANCE.prep.fenceBonus})`);
    // an empty bag says nothing (the title says GARAGE)
    expect(doorLines({ lastBag: 0, lastMultiplier: 1, lastBanked: 0, lastDoubled: false, lastFence: false })).toEqual([]);
    expect(cardLines({ lastBag: 48_750, lastFine: 24_375, lastLawyer: false, bank: 24_875 })).toEqual([
      { label: 'BAG 48,750 · YOU KEEP HALF', value: '+24,375', strong: true },
      { label: 'BANK', value: '24,875', strong: false },
    ]);
    expect(cardLines({ lastBag: 40_000, lastFine: 30_000, lastLawyer: true, bank: 30_000 })[0]!.label).toBe('BAG 40,000 · THE LAWYER KEEPS 3/4');
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    (sim.police as NonNullable<SimWorld['police']>).dispatching = false;
    try {
      const best: boolean[] = [];
      for (const bag of [10_000, 5_000, 20_000]) {
        bankThrough(sim, bag);
        best.push(sim.run.lastBest);
        sim.run.openDoor();
        run(sim, 0.2);
      }
      expect(best).toEqual([true, false, true]);
      expect(sim.run.bestRun).toBe(20_000);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.5 3.3 TOTALS says one line of sums and the counts, never BANK, MULTIPLIER or BEST RUN (the footer, the × and GOALS say those)', () => {
    const lines = doorLines({ lastBag: 12_000, lastMultiplier: 1.3, lastBanked: 15_600, lastDoubled: false, lastFence: false });
    expect(lines.length).toBe(1);
    for (const l of lines) expect(`${l.label} ${l.value}`).not.toMatch(/\bBANK\b|BANKED|MULTIPLIER|BEST RUN/);
    const counts = countsLine({ takedowns: 3, escapes: 1, billboards: 5, coins: 84, smashes: 12, damage: 12_300 });
    expect(counts.split(String.fromCharCode(0xa0)).join(' ')).toBe('3 TAKEDOWNS · 1 ESCAPE · 5 BILLBOARDS · 84 COINS · CITY DAMAGE 12,300');
  });
});

describe('M8.8 slice 3: what a car is for', () => {
  it('M8.8 3.1 every class has one role word, and each has its Polish', () => {
    expect(Object.keys(ROLE_WORDS).sort()).toEqual([...CAR_IDS].sort());
    for (const word of Object.values(ROLE_WORDS)) expect(PL[word]).toBeTruthy();
  });

  it('M8.8 3.2 a body\'s card says its class\'s job: a kept taxi DRIFT, a hatchback CITY, a bus RAM', () => {
    expect(cardLine('taxi')).toBe('DRIFT');
    expect(cardLine('hatch')).toBe('CITY');
    expect(cardLine('bus')).toBe('RAM');
    expect(cardLine('police')).toBe('DISGUISE');
  });

  it('M8.8 5.3 a trophy\'s card says what it is the best at, in Polish agreeing with the car', () => {
    try {
      setLang('en');
      expect(carLine('wagon')).toBe('BEST AT: DRIFTS');
      expect(carLine('phantom')).toBe('BEST AT: TOP SPEED');
      expect(carLine('taxi')).toBe('DRIFT');
      setLang('pl');
      expect(carLine('wagon')).toBe('NAJLEPSZY W DRIFCIE');
      expect(carLine('wrecker')).toBe('NAJTWARDSZA');
      expect(carLine('lowrider')).toBe('NAJDŁUŻSZE NITRO');
      expect(carLine('bubble')).toBe('NAJSZYBCIEJ PRZYSPIESZA');
      expect(carLine('bus')).toBe('TARAN');
      // every trophy has its Polish in all three forms
      for (const thing of Object.values(BEST_AT)) expect(PL_BEST[thing]?.length, thing).toBe(3);
    } finally { setLang('en'); }
  });

  it('M8.8 6.2 the three with connections say theirs; busted in the limo, the card names the Mayor', () => {
    try {
      setLang('en');
      expect(carLine('fakecop')).toBe('BEST AT: CLEARING THE ROAD');
      expect(carLine('limo')).toBe('BEST AT: GETTING BUSTED');
      expect(carLine('chiefcar')).toBe('BEST AT: DISGUISE');
      expect(cardLines({ lastBag: 40_000, lastFine: 30_000, lastLawyer: false, lastUncle: true, bank: 30_000 })[0]!.label)
        .toBe('BAG 40,000 · THE MAYOR KEEPS 3/4');
      setLang('pl');
      expect(carLine('limo')).toBe('NAJLEPSZA NA WPADKĘ');
      expect(carLine('fakecop')).toBe('NAJLEPIEJ TORUJE DROGĘ');
    } finally { setLang('en'); }
  });

  it('M8.8 11.5 a crazy car\'s card says the one thing only it does, the Polish pronoun the car\'s', () => {
    try {
      setLang('en');
      expect(carLine('roller')).toBe('ONLY IT: FLATTENS CARS');
      expect(carLine('monster')).toBe('ONLY IT: DRIVES OVER CARS');
      expect(carLine('trolley')).toBe('ONLY IT: RIDES A ROCKET');
      setLang('pl');
      expect(carLine('roller')).toBe('TYLKO ON: ROZJEŻDŻA AUTA');
      expect(carLine('monster')).toBe('TYLKO ON: JEŹDZI PO AUTACH');
      expect(carLine('trolley')).toBe('TYLKO ON: JEŹDZI NA RAKIECIE');
    } finally { setLang('en'); }
  });
});

describe('the preview and GOALS in pictures (M8.9 slice 15)', () => {
  it('M8.9 15.1 a preview, then a leave, restores the car exactly: its look and its drawn paint', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const before = carLook(sim, null, newLook());
      const p = newPreview();
      // a topper and a paint looked at: on the car while focused
      p.item = KIT_INDEX['crown'] as number;
      expect(carLook(sim, p, newLook()).items.topper).toBe(p.item);
      p.item = -1;
      p.paint = 0x123456;
      expect(carLook(sim, p, newLook()).paint).toBe(0x123456);
      // left: what it wears, exactly
      p.paint = -1;
      expect(carLook(sim, p, newLook())).toEqual(before);
      // drawn: the car's mesh takes the look and gives it back
      const car = new PlayerCar(new THREE.Scene(), sim);
      car.sync();
      const paint = car.mesh.paint;
      const look = carLook(sim, null, newLook());
      look.paint = 0x123456;
      car.setLook(look);
      car.sync();
      expect(car.mesh.paint).toBe(0x123456);
      car.setLook(null);
      car.sync();
      expect(car.mesh.paint).toBe(paint);
      // a car part that does not fit the car is not shown on it
      expect(sim.kit.worn('topper')).toBe(before.items.topper);
    } finally { sim.dispose(); }
  });

  it('M8.9 15.2 a buy after a preview keeps it: what the car shows is what it now wears', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const item = KIT_INDEX['duck'] as number;
      const p = newPreview();
      p.item = item;
      expect(carLook(sim, p, newLook()).items.topper).toBe(item);
      sim.run.bank = 100_000;
      expect(sim.kit.buy(item)).toBe('ok');
      // the focus leaves: the duck stays on the roof
      expect(carLook(sim, null, newLook()).items.topper).toBe(item);
      expect(carLook(sim, p, newLook())).toEqual(carLook(sim, null, newLook()));
    } finally { sim.dispose(); }
  });

  it('M8.9 15.3 GOALS\u2019 rows are the pictures\u2019 model: the rivals as their cars, the day with its bars, the hunts with their glyphs', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.board.beaten = 0b11;
      const m = goalsModel(sim);
      const cells = new ThumbQueue();
      expect(m.board.length).toBe(RIVALS.length);
      for (const r of m.board) expect(cells.cellOf(r.picture), r.picture).toBeGreaterThanOrEqual(0);
      expect(m.board.slice(0, 3).map((r) => r.state)).toEqual(['beaten', 'beaten', 'next']);
      expect(m.board[m.board.length - 1]?.label).toBe('\u2605');
      for (const d of m.dailies) {
        expect(d.share).toBeGreaterThanOrEqual(0);
        expect(d.share).toBeLessThanOrEqual(1);
      }
      expect(m.hunts.map((h) => h.glyph)).toEqual(['board', 'ramp', 'coin']);
      for (const h of m.hunts) expect(GLYPHS[h.glyph].length).toBeGreaterThan(0);
      // the page draws from the model
      const garage = readFileSync(new URL('../../src/ui/wall/garage.ts', import.meta.url), 'utf8');
      expect((garage.match(/goalsModel\(sim\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    } finally { sim.dispose(); }
  });
});
