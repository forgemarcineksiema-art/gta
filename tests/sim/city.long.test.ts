/**
 * Long-running city pin: the whole road graph driven by the bot (about 40 s
 * of wall time). Runs in `npm run verify:gate` and `npm run test:long`, not in
 * the quick `npm run verify` (see CLAUDE.md, working method).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_DT, SimWorld, initPhysics } from '../../src/sim';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';

beforeAll(initPhysics);

describe('M2 city (long)', () => {
  it('drives the whole road graph without resets, seam jumps or escaped bodies', () => {
    const sim = new SimWorld({ map: 'city', record: false, traffic: 0, peds: 0 });
    const bot = new TrackBot('muscle', CITY_BOT_TUNING);
    let maxY = 0, minY = Infinity, maxImpact = 0;
    try {
      for (let i = 0; i < 190_000 && !bot.tourComplete; i++) {
        bot.drive(sim, sim.controls, FIXED_DT); sim.step();
        if (i > 120) { const y = sim.transforms.currPos[sim.vehicle.slot * 3 + 1] as number; maxY = Math.max(maxY, y); minY = Math.min(minY, y); }
        maxImpact = Math.max(maxImpact, sim.vehicle.telemetry.impact);
        if (i % 600 === 0) {
          expect(sim.hasNaN()).toBe(false);
          expect(sim.city?.active.size).toBeLessThanOrEqual(25);
        }
      }
      console.log(`[city tour] lanes ${bot.visitedLanes.size}/${sim.city?.graph.lanes.length} time ${sim.time.toFixed(1)}s resets ${bot.resets} y ${minY.toFixed(3)}..${maxY.toFixed(3)} max impact ${maxImpact.toFixed(2)}`);
      expect(bot.resets).toBe(0);
      expect(bot.tourComplete).toBe(true);
      expect(minY).toBeGreaterThan(0.2);
      expect(maxY).toBeLessThan(1.2);
      expect(maxImpact).toBeLessThan(2);
    } finally { sim.dispose(); }
  }, 120_000);
});
