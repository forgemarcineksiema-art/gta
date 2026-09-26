/**
 * The island as the radar and the full map draw it (M8.10 slice 17, docs/M8.10_PLAN.md): its land (the coast, the
 * causeway, the islet) less the port's basin, the golf's pond, the parks (the botanic garden, the golf), the lots'
 * blocks, the districts' tints and where their names sit, its streets, its main roads, the highway's loop and the decks
 * it lifts over the crossings, the four landmarks, and how far the map reaches. Plain data from the sim's island, worked
 * out once (the canvases make their paths of it; the pins read it without a DOM).
 */
import type { P2 } from '../../sim/island/geom';
import { HALF_WIDTH } from '../../sim/island/ground';
import type { Island } from '../../sim/island/Island';
import { BASIN, PLACES, causeway, coastline, districtOf, islet, onLand, type DistrictId } from '../../sim/island/plan';
import { POND } from '../../sim/island/shapes/gardens';
import { DECK } from '../../sim/island/structures';

/** A turned rectangle: its middle, the way its length runs, its half width and half length. */
export interface MapRect { x: number; z: number; yaw: number; hx: number; hz: number }
/** A line drawn at a width (m). */
export interface MapLine { pts: P2[]; width: number; closed: boolean }

export interface IslandMapShape {
  land: P2[][];
  /** The water inside the land's line: the port's basin. */
  water: P2[][];
  /** The golf's pond. */
  shallows: P2[][];
  parks: P2[][];
  blocks: MapRect[];
  /** Each district's ground as row runs of `CELL` m (x0, z0, x1, z1), and a point inside it for its name. */
  districts: Array<{ id: DistrictId; runs: Array<[number, number, number, number]>; anchor: P2 }>;
  streets: MapLine[];
  roads: MapLine[];
  highway: MapLine;
  /** The decks the highway lifts over the crossings and the tunnel's roof: cover from the helicopter. */
  decks: MapRect[];
  landmarks: Array<{ kind: 'tower' | 'tank' | 'glasshouse' | 'hotel'; x: number; z: number }>;
  /** The map's half extent (m): every point of the land inside it, and a margin of sea. */
  half: number;
}

/** The districts' tints are read this coarse (m). */
const CELL = 20;
/** Sea round the land on the full map (m). */
const MARGIN = 40;

/** A circle or an ellipse as a polygon of `n` points. */
function ellipse(x: number, z: number, rx: number, rz: number, n = 48): P2[] {
  return Array.from({ length: n }, (_, k): P2 => [x + Math.cos((k / n) * Math.PI * 2) * rx, z + Math.sin((k / n) * Math.PI * 2) * rz]);
}

const shapes = new WeakMap<Island, IslandMapShape>();
/** The island's map, worked out once for an island. */
export function islandMapShapeOf(island: Island): IslandMapShape {
  let shape = shapes.get(island);
  if (!shape) { shape = islandMapShape(island); shapes.set(island, shape); }
  return shape;
}

/** The island's map, from the sim's island. */
export function islandMapShape(island: Island): IslandMapShape {
  const land = [coastline(), causeway(), islet()].map((p) => [...p] as P2[]);
  let half = 0;
  for (const poly of land) for (const [x, z] of poly) half = Math.max(half, Math.abs(x), Math.abs(z));
  // the districts, cell by cell over the land, each row's runs joined
  const byId = new Map<DistrictId, { runs: Array<[number, number, number, number]>; sx: number; sz: number; n: number }>();
  for (let z = -half; z < half; z += CELL) {
    let run: { id: DistrictId; x0: number } | null = null;
    const close = (x1: number): void => {
      if (!run) return;
      const d = byId.get(run.id) ?? { runs: [], sx: 0, sz: 0, n: 0 };
      d.runs.push([run.x0, z, x1, z + CELL]);
      byId.set(run.id, d);
      run = null;
    };
    for (let x = -half; x < half; x += CELL) {
      const cx = x + CELL / 2, cz = z + CELL / 2;
      const id = onLand(cx, cz) ? districtOf(cx, cz) : null;
      if (id) {
        const d = byId.get(id) ?? { runs: [], sx: 0, sz: 0, n: 0 };
        d.sx += cx; d.sz += cz; d.n++;
        byId.set(id, d);
      }
      if (run && run.id !== id) close(x);
      if (id && !run) run = { id, x0: x };
    }
    close(half);
  }
  const districts = [...byId.entries()].map(([id, d]) => ({ id, runs: d.runs, anchor: anchorOf(id, d.sx / d.n, d.sz / d.n) }));
  // the roads: the districts' streets narrow and grey, the rest of the town's roads wide and pale, the highway its loop
  const streets: MapLine[] = [], roads: MapLine[] = [];
  for (const r of island.ground.roads) {
    if (r.cls === 'highway') continue;
    const line = { pts: r.pts.map((p): P2 => [p[0], p[1]]), width: HALF_WIDTH[r.cls] * 2, closed: r.closed };
    (r.cls === 'street' || r.cls === 'side' ? streets : roads).push(line);
  }
  const loop = (island.network.lines[0] as { pts: Array<{ x: number; z: number }> }).pts;
  const highway: MapLine = { pts: loop.map((p): P2 => [p.x, p.z]), width: HALF_WIDTH.highway * 2, closed: true };
  const decks: MapRect[] = [];
  for (const s of island.structures) {
    if (s.kind !== 'overpass' && s.kind !== 'tunnel') continue;
    for (const p of s.pieces) decks.push({ x: p.x, z: p.z, yaw: p.yaw, hx: DECK.half, hz: p.length / 2 });
  }
  const B = BASIN, pond = POND as { x: number; z: number; rx: number; rz: number };
  return {
    land,
    water: [[[B.x0, B.z0], [B.x1, B.z0], [B.x1, B.z1], [B.x0, B.z1]]],
    shallows: [ellipse(pond.x, pond.z, pond.rx, pond.rz, 24)],
    parks: [ellipse(PLACES.botanicGarden.x, PLACES.botanicGarden.z, PLACES.botanicGarden.r, PLACES.botanicGarden.r), [...PLACES.golf] as P2[]],
    blocks: island.fill.lots.map((l) => ({ x: l.x, z: l.z, yaw: l.yaw, hx: l.hx, hz: l.hz })),
    districts,
    streets,
    roads,
    highway,
    decks,
    landmarks: [
      { kind: 'tower', x: PLACES.towerTop.x, z: PLACES.towerTop.z },
      { kind: 'tank', x: PLACES.waterworks.x, z: PLACES.waterworks.z },
      { kind: 'glasshouse', x: PLACES.glasshouse.x, z: PLACES.glasshouse.z },
      { kind: 'hotel', x: PLACES.hotel.x, z: PLACES.hotel.z },
    ],
    half: half + MARGIN,
  };
}

/** A district's name's point: its cells' middle, or (a middle off its land) the nearest of its own cells to it. */
function anchorOf(id: DistrictId, x: number, z: number): P2 {
  if (onLand(x, z) && districtOf(x, z) === id) return [x, z];
  let best: P2 = [x, z], bd = Infinity;
  for (let r = CELL; r < 600; r += CELL) {
    for (let k = 0; k < 24; k++) {
      const px = x + Math.cos((k / 24) * Math.PI * 2) * r, pz = z + Math.sin((k / 24) * Math.PI * 2) * r;
      if (onLand(px, pz) && districtOf(px, pz) === id && r < bd) { bd = r; best = [px, pz]; }
    }
    if (bd < Infinity) break;
  }
  return best;
}

/** The corners of a turned rectangle (for a path). */
export function rectCorners(r: MapRect): P2[] {
  const s = Math.sin(r.yaw), c = Math.cos(r.yaw);
  // along (sin, cos) its length, across (cos, −sin) its width
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]): P2 => [r.x + s * r.hz * (a as number) + c * r.hx * (b as number), r.z + c * r.hz * (a as number) - s * r.hx * (b as number)]);
}
