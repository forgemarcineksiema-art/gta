/**
 * The wall in four (M8.5 slice 3, docs/DESIGN.md §17.5): TOTALS, CARS, STYLE,
 * GOALS in that order with every action the seven pages offered on one of
 * them; TOTALS' one line of sums and the busted card's; NEW BEST only when a
 * run beats every run before it.
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { BALANCE } from '../../src/sim/balance';
import { cardLines, countsLine, doorLines } from '../../src/ui/totals';
import { PAGE_TITLES, WALL_ACTIONS, WALL_PAGES, pageOf } from '../../src/ui/wallPages';
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
      .toBe(`BAG 65,000 DOUBLED ×3.1 (FENCE +${BALANCE.prep.fenceBonus})`);
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
