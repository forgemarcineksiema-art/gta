/**
 * Skid marks and the spill's burst (M7 slice 4, docs/M7_PLAN.md D4): a wheel
 * marks the ground only past the slip thresholds and above walking pace; a
 * drift on the skidpad lays marks on the ground under the rear tyres, a
 * straight run at speed none; the ring wraps and never grows; a spilled coin
 * flies from the wreck to its place on an arc.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BURST_FLIGHT, BURST_STAGGER, burstPoint } from '../../src/render/run/Coins';
import { SKID, SkidMarks, skidStrength } from '../../src/render/fx/SkidMarks';
import type { SimWorld } from '../../src/sim';
import { COIN_HEIGHT } from '../../src/sim/city/coins';
import { createWorld, fullThrottle, kmh, run, runUntil } from '../sim/helpers';

describe('skid marks', () => {
  it('M7 4.1 a wheel marks only past the slip thresholds and above walking pace, darker the harder it slides', () => {
    expect(skidStrength(0.5, 0, 2)).toBe(0);
    expect(skidStrength(SKID.angle * 0.9, SKID.ratio * 0.9, 20)).toBe(0);
    const a = skidStrength(SKID.angle + 0.05, 0, 20), b = skidStrength(SKID.angle + 0.2, 0, 20);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(skidStrength(0, -0.9, 20)).toBeGreaterThan(0);
    expect(skidStrength(1.5, 3, 40)).toBe(1);
  });

  it('M7 4.2 a drift on the skidpad lays marks on the ground under the rear tyres; a straight run at speed lays none', async () => {
    const sim = await createWorld({ spawn: 'skidpad' });
    try {
      const marks = new SkidMarks(new THREE.Scene());
      let t = 0;
      run(sim, 1);
      runUntil(sim, 10, (s) => { t += 1 / 60; marks.update(s, t); return kmh(s) >= 70; }, fullThrottle);
      expect(marks.laid).toBe(0);
      run(sim, 2.5, (_t, c, s) => {
        c.throttle = 1;
        c.steer = 1;
        c.handbrake = t % 2.5 < 0.5 ? 1 : 0;
        t += 1 / 60;
        marks.update(s, t);
      });
      expect(marks.laid).toBeGreaterThan(10);
      const v = { x: 0, y: 0, z: 0 };
      for (let q = 0; q < marks.laid; q++) {
        marks.vertex(q, v);
        expect(v.y).toBeGreaterThan(-0.01);
        expect(v.y).toBeLessThan(SKID.lift + 0.02);
      }
      marks.dispose();
    } finally { sim.dispose(); }
  }, 60_000);

  it('M7 4.3 the ring wraps: more marks than it holds overwrite the oldest, and nothing grows; no draw without a live mark', () => {
    const marks = new SkidMarks(new THREE.Scene(), 8);
    const wheel = { grounded: true, isFront: false, normal: { x: 0, y: 1, z: 0 }, contact: { x: 0, y: 0, z: 0 }, slipAngle: 0.8, slipRatio: 0 };
    const fake = { vehicle: { wheels: [wheel], telemetry: { speed: 20 } } } as unknown as SimWorld;
    const geometry = marks.mesh.geometry;
    const before = (geometry.getAttribute('position').array as Float32Array).length;
    // the M7 gate's A/B: an empty ring is no draw call, a part-filled one draws its written quads only
    expect(marks.mesh.visible).toBe(false);
    for (let i = 0; i < 4; i++) {
      wheel.contact.x = i * 1.5;
      marks.update(fake, i / 60);
    }
    expect(marks.mesh.visible).toBe(true);
    expect(geometry.drawRange.count).toBe(marks.laid * 6);
    for (let i = 4; i < 40; i++) {
      wheel.contact.x = i * 1.5;
      marks.update(fake, i / 60);
    }
    expect(marks.laid).toBeGreaterThan(8);
    expect(geometry.drawRange.count).toBe(8 * 6);
    expect((geometry.getAttribute('position').array as Float32Array).length).toBe(before);
    // the newest mark sits where the wheel last went
    const v = { x: 0, y: 0, z: 0 };
    marks.vertex(marks.laid - 1, v);
    expect(v.x).toBeGreaterThan(50);
    // the newest mark faded: hidden again
    wheel.slipAngle = 0;
    marks.update(fake, 40 / 60 + SKID.fade + 0.1);
    expect(marks.mesh.visible).toBe(false);
    marks.dispose();
  });

  it('M7 4.4 a spilled coin flies from the wreck to its place on an arc, one after another', () => {
    const out = { x: 0, y: 0, z: 0 };
    burstPoint(10, 20, 30, 50, 3, 0, out);
    expect([out.x, out.y, out.z]).toEqual([10, COIN_HEIGHT, 20]);
    burstPoint(10, 20, 30, 50, 3, 3 * BURST_STAGGER + BURST_FLIGHT / 2, out);
    expect(out.y).toBeGreaterThan(COIN_HEIGHT + 1);
    burstPoint(10, 20, 30, 50, 3, 3 * BURST_STAGGER + BURST_FLIGHT, out);
    expect(out.x).toBeCloseTo(30, 9);
    expect(out.z).toBeCloseTo(50, 9);
    expect(out.y).toBeCloseTo(COIN_HEIGHT, 9);
    // the next coin leaves later
    burstPoint(10, 20, 30, 50, 4, 3 * BURST_STAGGER + 0.01, out);
    expect(out.x).toBe(10);
  });
});
