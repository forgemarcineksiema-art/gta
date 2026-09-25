import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { GATE_INPUT, pooled, verdict } from './model';

/** One section of DESIGN.md, from its heading to the next of the same depth, its line breaks as spaces. */
function section(heading: string): string {
  const doc = readFileSync(new URL('../../docs/DESIGN.md', import.meta.url), 'utf8');
  const at = doc.indexOf(`\n### ${heading}`);
  const end = doc.indexOf('\n### ', at + 1);
  return at < 0 ? '' : doc.slice(at, end < 0 ? undefined : end).replace(/\s+/g, ' ');
}

const money = (n: number): string => n.toLocaleString('en-US');

describe('the balance model (M7 slice 10)', () => {
  it('M7 10.1 on the M7 gate\'s inputs: the skilled best door above the novice\'s, the compact at minute 5-7, gaps of 3-10, something to see every 8', () => {
    // the pooled rates never fall with the level
    for (const rates of [GATE_INPUT.novice, GATE_INPUT.skilled]) {
      const p = pooled(rates);
      for (let l = 2; l < p.length; l++) expect(p[l]).toBeGreaterThanOrEqual(p[l - 1] as number);
      expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(rates.reduce((a, b) => a + b, 0), 9);
    }
    const v = verdict(GATE_INPUT);
    // (a) the optimum rises with skill, and the skilled bank climbs to it
    expect(v.skilledBest).toBeGreaterThanOrEqual(v.noviceBest + 1);
    expect(v.skilledRising).toBe(true);
    // (b) the first car inside the brief's five to seven minutes
    expect(v.compact).toBeGreaterThanOrEqual(5 - 1e-6);
    expect(v.compact).toBeLessThanOrEqual(7);
    // (c) something new every three to ten minutes
    expect(v.hour.gaps.length).toBeGreaterThan(3);
    expect(Math.max(...v.hour.gaps)).toBeLessThanOrEqual(10);
    expect(Math.min(...v.hour.gaps)).toBeGreaterThanOrEqual(3);
    // (d) something to see bought at least every 8 minutes
    expect(v.hour.seenGaps.length).toBeGreaterThan(3);
    expect(Math.max(...v.hour.seenGaps)).toBeLessThanOrEqual(8);
  });

  it('M7 10.2 the fitted multipliers and prices are BALANCE\'s, and DESIGN.md §2.6 and §3.3 name them', () => {
    expect(BALANCE.multiplier).toEqual([1, 1, 1.3, 1.65, 2.6, 3]);
    // the 4×4 joined at 40,000 (M8.8 slice 10), the motorbike at 36,000 (slice 14)
    expect(BALANCE.prices).toEqual({ compact: 24000, heavy: 30000, moto: 36000, offroad: 40000, sports: 60000, police: 120000 });
    expect(BALANCE.tierPrices).toEqual([24000, 26000, 30000]);
    expect(section('2.6')).toContain(BALANCE.multiplier.slice(1).map((m) => `×${m}`).join(' / '));
    const earnings = section('3.3');
    for (const price of Object.values(BALANCE.prices)) expect(earnings).toContain(money(price));
    expect(earnings).toContain(BALANCE.tierPrices.map(money).join(' / '));
  });
});
