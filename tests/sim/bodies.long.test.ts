/**
 * Every body measured (M8.8 slices 4–5): at its own mass, each force scaled with it, a body keeps its class's pace;
 * each trophy is the best in the game at its one thing, against every other body; the eight drive as cars do (they
 * rest, clip a kerb and land the ramp upright). The table goes to `perf/bodies.json` for the gate report. Long: every
 * body on the playground; `npm run verify:gate` runs it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ONLY_IT } from '../../src/sim/jobs/catalog';
import { BODY_IDS, bodySpec, bodyTuning, isShell, type BodyId } from '../../src/sim/traffic/bodies';
import { driftHeld, grip80, measureBody, pulse60, wallDamage, type BodyRow } from './bodyMeasure';
import { createWorld, fullThrottle, kmh, position, run, runUntil, upness } from './helpers';

interface Row extends BodyRow { drift: number; pulse: number; grip: number; wall: number; mass: number; boost: number }

/** The eight trophies best at a way of driving (slice 5); the three with connections (slice 6) drive as their class. */
const DRIVERS: readonly BodyId[] = ['wagon', 'pizza', 'wrecker', 'twin', 'partybus', 'lowrider', 'bubble', 'phantom'];

/** The body whose value is the largest (or, `least`, the smallest), others left out where `keep` says. */
function best(rows: Row[], value: (r: Row) => number, least = false, keep: (r: Row) => boolean = () => true): BodyId {
  let at: Row | null = null;
  for (const r of rows) {
    if (!keep(r)) continue;
    if (!at || (least ? value(r) < value(at) : value(r) > value(at))) at = r;
  }
  return (at as Row).body;
}

describe('every body measured', () => {
  it('M8.8 4.2 every body\'s 0-100 within ±10 % of its class\'s; 5.1 each trophy the best at its thing; 4.4 the table', async () => {
    const all: Row[] = [];
    for (const body of BODY_IDS) {
      const t = bodyTuning(body);
      all.push({
        ...(await measureBody(body)),
        drift: await driftHeld(body), pulse: await pulse60(body), grip: await grip80(body), wall: await wallDamage(body),
        mass: t.mass, boost: 1 / t.boostDrain,
      });
    }
    mkdirSync(new URL('../../perf/', import.meta.url), { recursive: true });
    writeFileSync(new URL('../../perf/bodies.json', import.meta.url), JSON.stringify(all, null, 1));
    const of = new Map(all.map((r) => [r.body, r]));
    // the crazy cars (M8.8 phase F) do one thing no other car does, not a car's things better: measured, not ranked
    const rows = all.filter((r) => !ONLY_IT[r.body]);
    for (const r of rows) {
      if (isShell(r.body) || DRIVERS.includes(r.body)) continue;
      const cls = of.get(bodySpec(r.body).car) as Row;
      expect(r.to100, r.body).toBeGreaterThan(cls.to100 * 0.9);
      expect(r.to100, r.body).toBeLessThan(cls.to100 * 1.1);
    }
    // 5.1: the car you beat is the car you get
    expect(best(rows, (r) => r.drift)).toBe('wagon');
    expect(of.get('wagon')!.drift).toBeGreaterThanOrEqual(40);
    expect(best(rows, (r) => r.pulse)).toBe('pizza');
    expect(best(rows, (r) => r.wall, true)).toBe('wrecker');
    expect(best(rows, (r) => r.grip)).toBe('twin');
    expect(best(rows, (r) => r.mass * r.top)).toBe('partybus');
    expect(of.get('partybus')!.to100).toBeLessThan(of.get('heavy')!.to100 * 1.1);
    expect(of.get('partybus')!.to100).toBeGreaterThan(of.get('heavy')!.to100 * 0.9);
    expect(best(rows, (r) => r.boost)).toBe('lowrider');
    expect(best(rows, (r) => r.to100, true, (r) => r.to100 > 0)).toBe('bubble');
    expect(of.get('bubble')!.to100).toBeLessThanOrEqual(3.9);
    expect(of.get('bubble')!.top).toBeLessThanOrEqual(185);
    expect(best(rows, (r) => r.top)).toBe('phantom');
    expect(of.get('phantom')!.top).toBeGreaterThanOrEqual(220);
  }, 1_800_000);

  it('M8.8 5.2 the eight trophies drive as cars do: they rest, clip a kerb and land the 16° ramp upright', async () => {
    for (const body of DRIVERS) {
      const lot = await createWorld({ spawn: 'lot', body });
      try {
        run(lot, 1);
        const p0 = position(lot);
        run(lot, 6);
        const p1 = position(lot);
        expect(Math.hypot(p1.x - p0.x, p1.z - p0.z), body).toBeLessThan(0.02);
        expect(upness(lot), body).toBeGreaterThan(0.99);
      } finally { lot.dispose(); }
      const kerbs = await createWorld({ spawn: 'kerbs', body });
      try {
        run(kerbs, 1);
        runUntil(kerbs, 25, (s) => kmh(s) >= 90, fullThrottle);
        let minUp = 1;
        run(kerbs, 4, (_t, c, s) => {
          c.throttle = 1;
          c.steer = position(s).x < 63.4 ? -0.25 : 0.1;
          minUp = Math.min(minUp, upness(s));
        });
        expect(minUp, body).toBeGreaterThan(0.9);
      } finally { kerbs.dispose(); }
      const jump = await createWorld({ spawn: 'ramps', body });
      try {
        run(jump, 1);
        runUntil(jump, 30, (s) => position(s).z > 105, fullThrottle);
        expect(runUntil(jump, 5, (s) => s.vehicle.telemetry.airborne, fullThrottle), body).toBeGreaterThan(0);
        let minUpAir = 1;
        runUntil(jump, 5, (s) => !s.vehicle.telemetry.airborne, (_t, c, s) => {
          c.throttle = 1;
          minUpAir = Math.min(minUpAir, upness(s));
        });
        run(jump, 1, fullThrottle);
        expect(minUpAir, body).toBeGreaterThan(0.85);
        expect(upness(jump), body).toBeGreaterThan(0.97);
      } finally { jump.dispose(); }
    }
  }, 600_000);
});
