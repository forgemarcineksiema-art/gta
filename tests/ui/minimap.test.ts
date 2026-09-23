/**
 * Heading-up minimap model: road layers from the graph, the projection that
 * turns the direction of travel to screen-up, heading/zoom easing and the rim
 * clamp for markers out of range. Pure math in Node, no canvas.
 */
import { describe, expect, test } from 'vitest';
import { buildRoadGraph } from '../../src/sim/city/roads';
import { MINIMAP, advance, buildRoadLayers, clampToRim, project, wrapAngle, type MinimapState, type Vec2 } from '../../src/ui/minimapModel';

describe('minimap model', () => {
  test('road layers: every undirected grid road once, junction to junction, authored roads at real width', () => {
    const layers = buildRoadLayers(buildRoadGraph());
    // the four overpasses (M5.5 slice 8) are one highway road over two blocks each
    expect(layers.grid.length + layers.highway.length).toBe(80);
    expect(layers.highway.length).toBe(20);
    expect(layers.special.length).toBe(5);
    expect(layers.highwayWidth).toBe(38);
    expect(layers.gridWidth).toBe(24);
    expect(layers.special.map((r) => r.width).sort((a, b) => a - b)).toEqual([16, 20, 24, 24, 24]);
    for (const seg of [...layers.grid, ...layers.highway]) {
      expect([225, 450]).toContain(Math.abs(seg.x1 - seg.x0) + Math.abs(seg.z1 - seg.z0));
      for (const v of [seg.x0, seg.z0, seg.x1, seg.z1]) expect(Math.abs(v % 225)).toBe(0);
    }
  });

  test('projection: the direction of travel points up, the car left is screen-left', () => {
    const out: Vec2 = { x: 0, y: 0 };
    for (const h of [0, Math.PI / 2, -Math.PI / 2, 2.5, -3]) {
      project(out, 100 * Math.sin(h), 100 * Math.cos(h), 0, 0, h, 0.5, 80, 100);
      expect(Math.abs(out.x - 80)).toBeLessThan(1e-9);
      expect(out.y).toBeCloseTo(50, 9);
      project(out, 100 * Math.cos(h), -100 * Math.sin(h), 0, 0, h, 0.5, 80, 100);
      expect(out.x).toBeCloseTo(30, 9);
      expect(Math.abs(out.y - 100)).toBeLessThan(1e-9);
    }
  });

  test('easing: heading takes the short way round, reversing follows the nose, zoom stays in range', () => {
    const state: MinimapState = { heading: 3.0, radiusM: MINIMAP.radiusMinM };
    advance(state, 0.05, -3.0, 0, 0, 0);
    expect(state.heading).toBeGreaterThan(3.0);
    for (let i = 0; i < 200; i++) advance(state, 0.05, -3.0, 0, 0, 0);
    expect(Math.abs(wrapAngle(state.heading + 3.0))).toBeLessThan(1e-3);

    advance(state, 0, 0, 0, -10, -10, true);
    expect(state.heading).toBe(0);
    advance(state, 0, 0.5, 0, 20, 17.5, true);
    expect(state.heading).toBe(0);

    for (const [speed, radius] of [[0, MINIMAP.radiusMinM], [200, MINIMAP.radiusMaxM]] as const) {
      advance(state, 0, 0, 0, speed, speed, true);
      expect(state.radiusM).toBe(radius);
    }
    advance(state, 0, 0, 0, 0, 0, true);
    let last = state.radiusM;
    for (let i = 0; i < 20; i++) {
      advance(state, 0.5, 0, 0, 40, 40);
      expect(Number.isFinite(state.radiusM)).toBe(true);
      expect(state.radiusM).toBeGreaterThanOrEqual(last);
      expect(state.radiusM).toBeLessThanOrEqual(MINIMAP.radiusMaxM);
      last = state.radiusM;
    }
    expect(state.radiusM).toBeGreaterThan(MINIMAP.radiusMinM);
  });

  test('rim clamp: an out-of-range marker lands on the circle along the ray from the player', () => {
    const out: Vec2 = { x: 0, y: 0 };
    expect(clampToRim(out, 50, 61, 300, -100, 50, 50, 40)).toBe(true);
    expect(Math.hypot(out.x - 50, out.y - 50)).toBeCloseTo(40, 9);
    const rx = out.x - 50, ry = out.y - 61, mx = 300 - 50, my = -100 - 61;
    expect(Math.abs(rx * my - ry * mx)).toBeLessThan(1e-6);
    expect(rx * mx + ry * my).toBeGreaterThan(0);
    expect(clampToRim(out, 50, 61, 60, 55, 50, 50, 40)).toBe(false);
    expect(out).toEqual({ x: 60, y: 55 });
  });
});
