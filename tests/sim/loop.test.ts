/**
 * Fixed-step guarantees: the sim's result depends only on the sequence of fixed
 * steps and their inputs, never on how the frames that drove them were sized.
 */
import { describe, expect, test } from 'vitest';
import { FixedStepLoop } from '../../src/app/loop';
import { FIXED_DT, SimWorld, type VehicleControls } from '../../src/sim';
import { mulberry32 } from '../../src/app/bot';
import { createWorld, position } from './helpers';

/** Deterministic scripted input as a function of the sim tick only. */
function scriptedInput(tick: number, c: VehicleControls): void {
  c.throttle = 1;
  c.steer = Math.sin(tick / 40) * 0.8;
  c.handbrake = tick % 400 > 360 ? 1 : 0;
  c.boost = tick % 500 > 420 ? 1 : 0;
  c.brake = 0;
}

async function driveAtRate(hz: number, seconds: number): Promise<{ pos: { x: number; y: number; z: number }; ticks: number; rot: number[] }> {
  const sim = await createWorld({ spawn: 'lot' });
  const loop = new FixedStepLoop(FIXED_DT, 5);
  const frameDt = 1 / hz;
  const frames = Math.round(seconds * hz);
  for (let f = 0; f < frames; f++) {
    loop.advance(frameDt, () => {
      scriptedInput(sim.tick, sim.controls);
      sim.step();
    });
  }
  const r = sim.transforms.currRot;
  const i = sim.vehicle.slot * 4;
  return { pos: position(sim), ticks: sim.tick, rot: [r[i] as number, r[i + 1] as number, r[i + 2] as number, r[i + 3] as number] };
}

describe('render-rate independence', () => {
  test('identical results at 30, 60, 144 and 165 Hz', async () => {
    const seconds = 12;
    const reference = await driveAtRate(60, seconds);
    expect(reference.ticks).toBe(seconds * 60);
    for (const hz of [30, 144, 165]) {
      const r = await driveAtRate(hz, seconds);
      // the number of fixed steps may differ by one at the boundary; compare at the same tick count
      expect(Math.abs(r.ticks - reference.ticks)).toBeLessThanOrEqual(1);
    }
    // exact comparison at equal tick counts
    const runs = await Promise.all([30, 144, 165].map((hz) => driveAtRateTicks(hz, reference.ticks)));
    for (const r of runs) {
      expect(r.pos).toEqual(reference.pos);
      expect(r.rot).toEqual(reference.rot);
    }
  }, 120_000);

  test('the accumulator caps substeps and drops time on a hitch', () => {
    const loop = new FixedStepLoop(FIXED_DT, 5);
    let steps = 0;
    loop.advance(1.0, () => steps++);
    expect(steps).toBe(5);
    expect(loop.droppedTime).toBeGreaterThan(0.5);
    steps = 0;
    const alpha = loop.advance(FIXED_DT * 1.5, () => steps++);
    expect(steps).toBe(1);
    expect(alpha).toBeCloseTo(0.5, 5);
  });
});

async function driveAtRateTicks(hz: number, ticks: number): Promise<{ pos: { x: number; y: number; z: number }; rot: number[] }> {
  const sim = await createWorld({ spawn: 'lot' });
  const loop = new FixedStepLoop(FIXED_DT, 5);
  const frameDt = 1 / hz;
  while (sim.tick < ticks) {
    loop.advance(frameDt, () => {
      if (sim.tick < ticks) {
        scriptedInput(sim.tick, sim.controls);
        sim.step();
      }
    });
  }
  const r = sim.transforms.currRot;
  const i = sim.vehicle.slot * 4;
  return { pos: position(sim), rot: [r[i] as number, r[i + 1] as number, r[i + 2] as number, r[i + 3] as number] };
}

describe('soak', () => {
  test('10,000 steps of random input: no NaN, nothing escapes the world', async () => {
    const sim: SimWorld = await createWorld({ spawn: 'lot' });
    const rnd = mulberry32(7);
    let maxY = 0;
    for (let i = 0; i < 10_000; i++) {
      if (i % 30 === 0) {
        const c = sim.controls;
        c.throttle = rnd() < 0.8 ? 1 : 0;
        c.brake = rnd() < 0.15 ? 1 : 0;
        c.steer = (rnd() - 0.5) * 2;
        c.handbrake = rnd() < 0.2 ? 1 : 0;
        c.boost = rnd() < 0.3 ? 1 : 0;
        if (rnd() < 0.02) c.reset = true;
      }
      sim.step();
      const p = position(sim);
      maxY = Math.max(maxY, p.y);
      if (i % 500 === 0) {
        expect(sim.hasNaN()).toBe(false);
        expect(Math.abs(p.x)).toBeLessThan(800);
        expect(Math.abs(p.z)).toBeLessThan(1200);
        expect(p.y).toBeGreaterThan(-30);
      }
    }
    expect(sim.hasNaN()).toBe(false);
    expect(maxY).toBeLessThan(40);
    expect(sim.tick).toBe(10_000);
  }, 120_000);
});
