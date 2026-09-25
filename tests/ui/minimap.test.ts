/**
 * Heading-up minimap model: road layers from the graph, the projection that
 * turns the direction of travel to screen-up, heading/zoom easing and the rim
 * clamp for markers out of range. Pure math in Node, no canvas. The radar and
 * the full map (M8.9 slice 10, docs/M8.9_PLAN.md R6): what the radar draws,
 * the route the brightest line, the sizes in the scale, the garage with the
 * money, the key of what is there, the names clear of the icons.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { SIGNALS } from '../../src/sim/palette';
import type { JobKind } from '../../src/sim';
import { hudScale, rootFontPx } from '../../src/ui/scale';
import { setLang } from '../../src/ui/lang';
import { GRID, HIGHWAY, LOOP, ROUTE } from '../../src/ui/map/minimap';
import { legendItems, mapIcons, namePlaces, nameFontPx, type LegendState } from '../../src/ui/map/bigmap';
import {
  RADAR, RADAR_REM, boxesMeet, garageShown, radarMarks, radarNames, radarScale, type RadarState,
} from '../../src/ui/map/minimapModel';
import { createWorld } from '../sim/helpers';
import { buildRoadGraph } from '../../src/sim/city/roads';
import { MINIMAP, advance, bigMapProject, bigMapScale, buildRoadLayers, clampToRim, drawInShare, project, routeStop, wrapAngle, type MinimapState, type Vec2 } from '../../src/ui/map/minimapModel';
import { CITY_HALF } from '../../src/sim/city/roads';

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

  test('the full-screen map: north up, west to the left, the whole island inside the square', () => {
    const size = 600, s = bigMapScale(size, CITY_HALF);
    const out: Vec2 = { x: 0, y: 0 };
    bigMapProject(out, 0, 0, size, s);
    expect(out).toEqual({ x: 300, y: 300 });
    // north (+Z) is up, west (+X) is left, as on the radar's compass
    bigMapProject(out, 0, 100, size, s);
    expect(out.y).toBeLessThan(300);
    bigMapProject(out, 100, 0, size, s);
    expect(out.x).toBeLessThan(300);
    for (const [x, z] of [[CITY_HALF, CITY_HALF], [-CITY_HALF, -CITY_HALF], [CITY_HALF, -CITY_HALF]] as const) {
      bigMapProject(out, x, z, size, s);
      expect(out.x).toBeGreaterThan(0);
      expect(out.x).toBeLessThan(size);
      expect(out.y).toBeGreaterThan(0);
      expect(out.y).toBeLessThan(size);
    }
  });

  test('M8.7 1.2 the route draws in from the car over drawInMs, eased out, and stops where its share of the length says', () => {
    expect(drawInShare(0)).toBe(0);
    expect(drawInShare(-50)).toBe(0);
    expect(drawInShare(MINIMAP.drawInMs / 2)).toBeCloseTo(0.75, 6);
    expect(drawInShare(MINIMAP.drawInMs)).toBe(1);
    expect(drawInShare(MINIMAP.drawInMs * 3)).toBe(1);
    // an L of 30 m then 10 m: 40 m in all
    const pts = new Float32Array([0, 0, 30, 0, 30, 10]);
    const out = { count: 0, x: 0, z: 0 };
    routeStop(pts, 3, 0, out);
    expect(out).toEqual({ count: 1, x: 0, z: 0 });
    routeStop(pts, 3, 0.5, out);
    expect(out).toEqual({ count: 1, x: 20, z: 0 });
    routeStop(pts, 3, 0.875, out);
    expect(out.count).toBe(2);
    expect(out.x).toBeCloseTo(30, 6);
    expect(out.z).toBeCloseTo(5, 6);
    routeStop(pts, 3, 1, out);
    expect(out.count).toBe(2);
    expect([out.x, out.z]).toEqual([30, 10]);
  });
});

/** A colour string (`#rrggbb` or `rgba(r, g, b, a)`) over the radar's dark ground, as sRGB 0..255. */
function over(color: string): [number, number, number] {
  const ground = [(SIGNALS.outline >> 16) & 255, (SIGNALS.outline >> 8) & 255, SIGNALS.outline & 255];
  const m = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(color);
  const [r, g, b, a] = m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16), 1];
  return [r * a + (ground[0] as number) * (1 - a), g * a + (ground[1] as number) * (1 - a), b * a + (ground[2] as number) * (1 - a)];
}

/** Relative luminance of an sRGB triple. */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number): number => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const CALM: RadarState = {
  route: true, goal: true, rings: 3, zone: false, units: 0, search: false, heli: false, rivals: 0, bag: 0, goalKind: 'take', goalAtGarage: false, cachesNear: 0,
};

describe('the radar and the full map (M8.9 slice 10)', () => {
  test('M8.9 10.1 the radar draws only R6\'s kinds: where to go, where the police are, where to bank', () => {
    expect(radarNames(radarMarks(CALM))).toEqual(['route', 'goal', 'rings', 'player', 'north']);
    expect(radarNames(radarMarks({ ...CALM, rings: 0, units: 4, search: true, heli: true, rivals: 3 })))
      .toEqual(['route', 'goal', 'units', 'search', 'heli', 'rivals', 'player', 'north']);
    expect(radarNames(radarMarks({ ...CALM, bag: 1200, cachesNear: 1 }))).toEqual(['route', 'goal', 'rings', 'garage', 'cache', 'player', 'north']);
    // twelve kinds and no more: the landmarks, the other garages, the cameras, the cover and the breakers are the full map's
    expect(Object.keys(RADAR)).toEqual(['route', 'goal', 'rings', 'zone', 'units', 'search', 'heli', 'rivals', 'garage', 'cache', 'player', 'north']);
    const painter = readFileSync('src/ui/map/minimap.ts', 'utf8');
    const radar = painter.slice(painter.indexOf('export class Minimap'));
    for (const word of ['LANDMARKS', "'camera'", "'breaker'", 'covers', "'tower'"]) expect(radar.includes(word), word).toBe(false);
  });

  test('M8.9 10.2 the route is the brightest line of the disc', () => {
    const route = luminance(over(ROUTE));
    for (const road of [GRID, HIGHWAY, LOOP]) expect(route, road).toBeGreaterThan(luminance(over(road)) * 1.25);
    // the streets mid-grey, the big roads paler, none yellow
    expect(luminance(over(GRID))).toBeLessThan(luminance(over(HIGHWAY)));
    for (const road of [GRID, HIGHWAY, LOOP]) {
      const [r, g, b] = over(road);
      expect(Math.max(r, g, b) - Math.min(r, g, b), road).toBeLessThan(24);
    }
  });

  test('M8.9 10.3 the goal\'s badge 20 px and the route 6 px at 720p; at least 17 and 5 at 800×450', () => {
    const css = readFileSync('src/ui/styles.css', 'utf8');
    expect(css).toContain(`--minimap-size: ${RADAR_REM}rem;`);
    const at = (h: number): { badge: number; route: number } => {
      const k = radarScale(RADAR_REM * rootFontPx(h));
      return { badge: 20 * k, route: 6 * k };
    };
    expect(at(720)).toEqual({ badge: 20, route: 6 });
    expect(hudScale(450)).toBe(0.85);
    expect(at(450).badge).toBeGreaterThanOrEqual(17);
    expect(at(450).route).toBeGreaterThanOrEqual(5);
    const model = readFileSync('src/ui/map/minimapModel.ts', 'utf8');
    expect(/goalPx: 10,/.test(model) && /routePx: 6,/.test(model)).toBe(true);
  });

  test('M8.9 10.4 the nearest garage on the rim only with money in the bag or a BANK IT or BUY goal, once', () => {
    expect(garageShown(0, 'take')).toBe(false);
    expect(garageShown(0, 'rival')).toBe(false);
    expect(garageShown(1, 'take')).toBe(true);
    expect(garageShown(0, 'bank')).toBe(true);
    expect(garageShown(0, 'buy')).toBe(true);
    expect(radarMarks({ ...CALM, bag: 5000 }) & RADAR.garage).not.toBe(0);
    // the goal at a door says it already: no second house
    expect(radarMarks({ ...CALM, goalKind: 'bank', goalAtGarage: true }) & RADAR.garage).toBe(0);
  });

  test('M8.9 10.5 the full map\'s key lists only the kinds on the map now', () => {
    const none: LegendState = { jobs: new Set<JobKind>(), caches: false, cameras: false, breakers: false, cover: false, cops: false, heli: false };
    expect(legendItems(none)).toEqual(['you', 'garage']);
    expect(legendItems({ ...none, jobs: new Set<JobKind>(['race', 'delivery']), cameras: true, cops: true }))
      .toEqual(['you', 'delivery', 'race', 'garage', 'camera', 'cops']);
    const all: LegendState = { jobs: new Set<JobKind>(['delivery', 'order', 'escape', 'trial', 'race', 'rage', 'mayhem', 'duel']), caches: true, cameras: true, breakers: true, cover: true, cops: true, heli: true };
    expect(legendItems(all).length).toBe(16);
  });

  test('M8.9 10.6 no district name\'s box over an icon\'s, at two map sizes in both languages', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      for (const lang of ['en', 'pl'] as const) {
        setLang(lang);
        for (const size of [420, 700]) {
          const icons = mapIcons(sim, size);
          expect(icons.length).toBeGreaterThan(10);
          // the width of a name as the map's black face sets it, a little generous
          const font = nameFontPx(size);
          const names = namePlaces(sim, size, (name) => name.length * font * 0.68, icons);
          for (const [i, box] of names.entries()) {
            for (const icon of icons) expect(boxesMeet(box, icon), `${lang} ${size} name ${i}`).toBe(false);
          }
        }
      }
    } finally {
      setLang('en');
    }
  });
});
