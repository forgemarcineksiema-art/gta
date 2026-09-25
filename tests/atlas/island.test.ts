/**
 * The atlas's dump (M8.10 slice 1): the island as the sim knows it, written to `output/atlas/island.js` for
 * `tools/atlas.html` to draw. Run by `npm run atlas` (ATLAS=1), never by the quick set. Each slice adds its layer.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { GLYPHS, KIND_GLYPH } from '../../src/sim/glyphs';
import { catmullRom, circle, ellipse } from '../../src/sim/island/geom';
import { DECKS, REEF } from '../../src/sim/island/shapes/quay';
import { districtStreets } from '../../src/sim/island/streets';
import {
  BEACH_JUMP, BOARDWALK, BUNKERS, CREST, DUNE_JUMP, FAIRWAYS, GLASSHOUSE, GREENS, POND, TEES, boardwalkRuns, gardenDunes, gardenPaths, gardenTrees,
} from '../../src/sim/island/shapes/gardens';
import {
  BAY, BASIN, BOUNDS, BREAKERS, BUOYS, CAMERAS, COAST_PARTS, COVERS, FIRST_MINUTE, FIRST_MINUTE_STEPS, GARAGES, HIGHWAY, JOBS, JUMPS,
  PLACES, PLACE_RINGS, PLACE_ROADS, RINGS, RIVAL_RINGS, ROADBLOCK_SITES, ROADS, SERVICES, SLIPWAYS, STASH, causeway, coastline, districtOf,
  islet, landArea, naturalHeight, onLand, COAST,
} from '../../src/sim/island/plan';

const r1 = (v: number): number => Math.round(v * 10) / 10;
const pts = (p: ReadonlyArray<readonly [number, number]>): number[][] => p.map(([x, z]) => [r1(x), r1(z)]);

it('dumps the island for the atlas', () => {
  // the ground's height every 8 m, the district every 25 m (-1 in the sea)
  const cell = 8, nx = Math.floor((BOUNDS.x1 - BOUNDS.x0) / cell) + 1, nz = Math.floor((BOUNDS.z1 - BOUNDS.z0) / cell) + 1;
  const heights: number[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = BOUNDS.x0 + i * cell, z = BOUNDS.z0 + j * cell;
    heights.push(onLand(x, z) ? r1(naturalHeight(x, z)) : -1);
  }
  const dcell = 25, dx = Math.floor((BOUNDS.x1 - BOUNDS.x0) / dcell) + 1, dz = Math.floor((BOUNDS.z1 - BOUNDS.z0) / dcell) + 1;
  const ids = ['crown', 'foundry', 'gardens', 'marina'] as const;
  const districts: number[] = [];
  for (let j = 0; j < dz; j++) for (let i = 0; i < dx; i++) {
    const x = BOUNDS.x0 + i * dcell, z = BOUNDS.z0 + j * dcell;
    districts.push(onLand(x, z) ? ids.indexOf(districtOf(x, z)) : -1);
  }
  // the coast's parts along its samples (each sample knows its control span)
  const spanOf: number[] = [];
  const n = COAST.length;
  for (let i = 0; i < n; i++) {
    const a = COAST[i], b = COAST[(i + 1) % n];
    if (!a || !b) continue;
    const steps = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6));
    for (let k = 0; k < steps; k++) spanOf.push(i);
  }
  const roads = [...HIGHWAY, ...ROADS, ...PLACE_ROADS].map((r) => ({ id: r.id, cls: r.cls, span: r.span, pts: pts(r.smooth ? catmullRom(r.points, false, 6) : r.points) }));
  for (const ring of [...RINGS, ...PLACE_RINGS]) {
    const loop = ring.rz === undefined ? circle(ring.x, ring.z, ring.r, 64) : ellipse(ring.x, ring.z, ring.r, ring.rz, 64);
    roads.push({ id: ring.id, cls: ring.cls, span: 'ground', pts: pts([...loop, loop[0] as [number, number]]) });
  }
  // the districts' streets (slice 5), drawn under the main roads
  for (const s of districtStreets().roads) roads.push({ id: s.id, cls: s.cls, span: 'ground', pts: pts(s.points) });
  const data = {
    bounds: BOUNDS, area: landArea(),
    coast: pts(coastline()), coastSpan: spanOf, coastParts: COAST_PARTS, causeway: pts(causeway()), islet: pts(islet()), bay: pts(catmullRom(BAY, true, 6)), basin: BASIN,
    heights: { cell, nx, nz, values: heights }, districts: { cell: dcell, nx: dx, nz: dz, ids, values: districts },
    roads, places: PLACES,
    // the Quay's decks and reef (slice 11)
    quay: { decks: DECKS.map((d) => ({ a: [r1(d.ax), r1(d.az)], b: [r1(d.bx), r1(d.bz)], half: d.half })), reef: REEF },
    placed: {
      jobs: JOBS, rivals: RIVAL_RINGS, garages: GARAGES, jumps: JUMPS, cameras: CAMERAS, covers: COVERS, breakers: BREAKERS,
      roadblocks: ROADBLOCK_SITES, services: SERVICES, stash: STASH, slipways: SLIPWAYS, buoys: pts(catmullRom(BUOYS, false, 30)),
      firstMinute: FIRST_MINUTE, firstMinuteSteps: FIRST_MINUTE_STEPS,
    },
    glyphs: GLYPHS, kindGlyph: KIND_GLYPH,
    // Palm Gardens (slice 10): the garden's paths, terrace and trees; the golf; the dunes; the jumps; the boardwalk
    gardens: {
      paths: gardenPaths().map((p) => ({ id: p.id, closed: p.closed, pts: pts(p.pts) })),
      terrace: { x: GLASSHOUSE.x, z: GLASSHOUSE.z, r: GLASSHOUSE.paved },
      trees: gardenTrees().map((t) => ({ x: r1(t.x), z: r1(t.z), palm: t.palm })),
      fairways: FAIRWAYS, greens: GREENS, tees: TEES, bunkers: BUNKERS, pond: { x: POND.x, z: POND.z, rx: POND.rx, rz: POND.rz },
      dunes: gardenDunes().dunes.map((d) => ({ x: r1(d.x), z: r1(d.z), r: r1(d.r) })), duneLine: pts(gardenDunes().line), band: gardenDunes().band,
      jumps: [CREST, DUNE_JUMP, BEACH_JUMP],
      boardwalk: boardwalkRuns().map((r) => pts(r)), boardwalkHalf: BOARDWALK.half,
    },
  };
  const json = JSON.stringify(data);
  expect(json.includes('null')).toBe(false);
  expect(json.includes('NaN')).toBe(false);
  mkdirSync('output/atlas', { recursive: true });
  writeFileSync('output/atlas/island.js', `window.ATLAS = ${json};`);
});
