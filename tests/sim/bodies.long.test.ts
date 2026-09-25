/**
 * Every body measured (M8.8 slice 4): at its own mass, each force scaled with it, a body keeps its class's pace; the
 * table of what each drives like goes to `perf/bodies.json` for the gate report. Long: every body on the straight;
 * `npm run verify:gate` runs it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BODY_IDS, bodySpec, isShell } from '../../src/sim/traffic/bodies';
import { measureBody, type BodyRow } from './bodyMeasure';

describe('every body measured', () => {
  it('M8.8 4.2 every body\'s 0-100 lies within ±10 % of its class\'s; 4.4 the table', async () => {
    const rows: BodyRow[] = [];
    for (const body of BODY_IDS) rows.push(await measureBody(body));
    mkdirSync(new URL('../../perf/', import.meta.url), { recursive: true });
    writeFileSync(new URL('../../perf/bodies.json', import.meta.url), JSON.stringify(rows, null, 1));
    const of = new Map(rows.map((r) => [r.body, r]));
    for (const r of rows) {
      if (isShell(r.body)) continue;
      const cls = of.get(bodySpec(r.body).car) as BodyRow;
      expect(r.to100, r.body).toBeGreaterThan(cls.to100 * 0.9);
      expect(r.to100, r.body).toBeLessThan(cls.to100 * 1.1);
    }
  }, 600_000);
});
