/**
 * Instrumentation pins: the recorder reproduces a run exactly, the track's lap
 * timer only counts valid laps, and the track bot laps the circuit in a bounded
 * time (the benchmark for tuning changes).
 */
import { describe, expect, test } from 'vitest';
import { TrackBot } from '../../src/app/trackBot';
import { CONTROL_STRIDE, POSE_STRIDE, Recorder, TELEMETRY_STRIDE, clearControls } from '../../src/sim';
import { createWorld, position, run } from './helpers';

describe('recorder and replay', () => {
  test('replaying the recorded controls reproduces the run bit for bit', async () => {
    const a = await createWorld({ spawn: 'lot' });
    run(a, 12, (t, c) => {
      c.throttle = 1;
      c.steer = Math.sin(t / 25);
      c.handbrake = t % 240 > 200 ? 1 : 0;
      c.boost = t % 300 > 250 ? 1 : 0;
      c.reset = t === 400;
    });
    const rec = a.recorder as Recorder;
    expect(rec.ticks).toBe(a.tick);
    // round trip through JSON, then drive a fresh world with the stream
    const json = JSON.parse(JSON.stringify(rec.toJSON(a.carId, a.spawnName))) as Parameters<typeof Recorder.fromJSON>[0];
    const copy = Recorder.fromJSON(json);
    const b = await createWorld({ spawn: 'lot' });
    for (let i = 0; i < copy.ticks; i++) {
      clearControls(b.controls);
      copy.controlsAt(i, b.controls);
      b.step();
    }
    const pa = position(a);
    const pb = position(b);
    // JSON rounds controls to 3 decimals, so compare the poses to the metre-millimetre, not bitwise
    expect(Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z)).toBeLessThan(0.01);
    expect(copy.controls.length).toBe(copy.ticks * CONTROL_STRIDE);
    expect(copy.poses.length).toBe(copy.ticks * POSE_STRIDE);
    expect(copy.telemetry.length).toBe(copy.ticks * TELEMETRY_STRIDE);
  });

  test('an exact control stream (no JSON rounding) replays bitwise', async () => {
    const a = await createWorld({ spawn: 'skidpad' });
    run(a, 8, (t, c) => {
      c.throttle = 1;
      c.steer = t > 120 ? 1 : 0;
      c.handbrake = t > 120 && t < 150 ? 1 : 0;
    });
    const rec = a.recorder as Recorder;
    const b = await createWorld({ spawn: 'skidpad' });
    for (let i = 0; i < rec.ticks; i++) {
      clearControls(b.controls);
      rec.controlsAt(i, b.controls);
      b.step();
    }
    expect(position(b)).toEqual(position(a));
  });
});

describe('track', () => {
  test('is a closed loop of sensible length with gates spread along it', async () => {
    const sim = await createWorld({ spawn: 'track' });
    const t = sim.track;
    expect(t.length).toBeGreaterThan(900);
    expect(t.length).toBeLessThan(1400);
    expect(t.gates.length).toBe(8);
    const first = t.samples[0];
    const last = t.samples[t.samples.length - 1];
    expect(Math.hypot((first?.x ?? 0) - (last?.x ?? 0), (first?.z ?? 0) - (last?.z ?? 0))).toBeLessThan(8);
    // no corner tighter than a hairpin
    for (const s of t.samples) expect(Math.abs(s.curvature)).toBeLessThan(1 / 12);
  });

  test('the bot laps the circuit, laps are timed and the ghost is captured', async () => {
    const sim = await createWorld({ spawn: 'track' });
    const bot = new TrackBot(sim.carId);
    let laps = 0;
    let firstLap = -1;
    for (let i = 0; i < 60 * 130 && laps < 2; i++) {
      bot.drive(sim, sim.controls, 1 / 60);
      sim.step();
      if (sim.lap.lapCount > laps) {
        laps = sim.lap.lapCount;
        if (firstLap < 0) firstLap = sim.lap.last;
      }
    }
    expect(laps).toBe(2);
    expect(firstLap).toBeGreaterThan(30);
    expect(firstLap).toBeLessThan(70); // the benchmark bound for the muscle car
    expect(sim.lap.best).toBeLessThanOrEqual(firstLap);
    expect(bot.resets).toBe(0);
    expect(sim.bestLapPoses).not.toBeNull();
    expect((sim.bestLapPoses?.length ?? 0) / POSE_STRIDE).toBeGreaterThan(30 * 60);
  });

  test('a lap that skips gates does not count', async () => {
    const sim = await createWorld({ spawn: 'track' });
    // cross the start line, then teleport back before it and cross again without visiting the gates
    run(sim, 4, (_t, c) => (c.throttle = 1));
    expect(sim.lap.lapStartTick).toBeGreaterThanOrEqual(0);
    const st = sim.track.start;
    sim.vehicle.teleport({ x: st.x - Math.sin(st.yaw) * 15, y: 0.6, z: st.z - Math.cos(st.yaw) * 15 }, st.yaw);
    run(sim, 4, (_t, c) => (c.throttle = 1));
    expect(sim.lap.lapCount).toBe(0);
  });
});
