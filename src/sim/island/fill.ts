/**
 * The island's fill (M8.10 slice 7a, docs/M8.10_PLAN.md): the lots along every town road, each district's by its rule
 * (Crown's offices of 20–30 m rising toward the summit, the Works' sheds of 30–60 m, the Gardens' houses of 12–16 m
 * with a palm and a hedge in front, the Quay's pastel blocks of 20–25 m), each lot behind its road's pavement and off
 * every other road, lot, the sea and the plan's reserved places; on each a building of the grid's kit on a plinth down
 * to the lowest ground under it. The palms: Palm Avenue's, the Gardens' front gardens', the beach road's and the
 * Quay's front. Worked out once, as statics a chunk; no Three.js.
 */
import { Architecture } from '../city/architecture';
import { GRASS } from '../city/surface';
import type { StaticDesc } from '../scene';
import { ACCENTS, CITY_COLORS } from '../palette';
import { inPolygon, type P2 } from './geom';
import type { Ground } from './ground';
import { PLACES, districtOf, type DistrictId } from './plan';
import { PAVEMENT, onStrip, type RoadSurfaces, type Strip } from './surfaces';

/** A lot and its building: its middle, the way its street face looks back at the road, its half sizes. */
export interface Lot {
  x: number; z: number; yaw: number; hx: number; hz: number;
  district: DistrictId; floors: number; variant: number;
  /** Its floor's height (the highest ground under it) and its plinth's foot (the lowest). */
  base: number; foot: number;
}
export interface IslandFill {
  lots: Lot[];
  palms: Array<{ x: number; z: number }>;
  /** The buildings', plinths' and trees' statics by chunk. */
  chunks: Map<number, StaticDesc[]>;
}

/** Each district's rule (m): a lot's frontage and depth (half, least and most), its setback, the gap between lots. */
const RULE: Readonly<Record<DistrictId, { hx: readonly [number, number]; hz: readonly [number, number]; setback: number; gap: number }>> = {
  crown: { hx: [10, 15], hz: [10, 15], setback: 1.3, gap: 2 },
  foundry: { hx: [15, 30], hz: [12, 20], setback: 7, gap: 8 },
  gardens: { hx: [6, 8], hz: [7, 9], setback: 6, gap: 4 },
  marina: { hx: [10, 12.5], hz: [10, 14], setback: 1.3, gap: 3 },
};
/** A lot on ground steeper than this across it (its highest less its lowest) is left empty (m): more on Crown's hill. */
const STEEPEST: Readonly<Record<DistrictId, number>> = { crown: 10, foundry: 6, gardens: 6, marina: 6 };
/** How far past a road's pavement a lot keeps (m). */
const CLEAR = 1;
/** Palms along the roads that have them, one every this far (m), this far past the pavement. */
const PALM_EVERY = 12;
const PALM_OUT = 1.5;
/** The roads lined with palms: Palm Avenue, the beach road, the Quay's front. */
const PALM_ROADS = /^(palm-avenue|beach-road|quay-sweep)$/;

/** A small seeded stream (mulberry32). */
function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Whether (x, z) is one of the plan's places kept for its set piece (slices 8–12). */
export function reserved(x: number, z: number): boolean {
  const near = (p: { x: number; z: number }, r: number): boolean => Math.hypot(x - p.x, z - p.z) < r;
  const inRect = (r: { x0: number; z0: number; x1: number; z1: number }, pad = 0): boolean => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
  const toLine = (pts: readonly P2[]): number => {
    let best = Infinity;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i] as P2, b = pts[i + 1] as P2, dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
    }
    return best;
  };
  const P = PLACES;
  if (near(P.summitPlaza, P.summitPlaza.r + 6) || near(P.botanicGarden, P.botanicGarden.r) || near(P.circusIsland, 60)) return true;
  if (((x - P.stadium.x) / (P.stadium.rx + 10)) ** 2 + ((z - P.stadium.z) / (P.stadium.rz + 10)) ** 2 < 1) return true;
  if (inPolygon(x, z, P.quarry) || inPolygon(x, z, P.golf)) return true;
  if (inRect(P.carPark, 6) || inRect(P.headquarters, 6) || inRect(P.donutShop, 4) || inRect(P.railYard, 6) || inRect(P.runway, 20) || inRect(P.pleasurePier, 10)) return true;
  if (P.containerYards.some((r) => inRect(r, 6)) || P.hangars.some((r) => inRect(r, 6))) return true;
  if (Math.abs(x - P.hotel.x) < P.hotel.hx + 8 && Math.abs(z - P.hotel.z) < P.hotel.hz + 8) return true;
  if (near(P.waterworks, 45) || near(P.lighthouse, 25) || near(P.controlTower, 20) || near(P.megaRamp, 50) || near(P.ferrisWheel, 30)) return true;
  if (P.cranes.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 35)) return true;
  if (toLine(P.canal) < P.canalWidth / 2 + 8 || toLine(P.railway) < 12) return true;
  return false;
}

/** Two lots' footprints overlap (with `gap` between them): the separating axes of two turned rectangles. */
function overlap(a: Lot, b: Lot, gap: number): boolean {
  if (Math.hypot(a.x - b.x, a.z - b.z) > Math.hypot(a.hx, a.hz) + Math.hypot(b.hx, b.hz) + gap) return false;
  for (const r of [a, b]) for (const [ax, az] of [[Math.cos(r.yaw), -Math.sin(r.yaw)], [Math.sin(r.yaw), Math.cos(r.yaw)]] as const) {
    const extent = (q: Lot): number => {
      const ux = Math.cos(q.yaw), uz = -Math.sin(q.yaw), vx = Math.sin(q.yaw), vz = Math.cos(q.yaw);
      return q.hx * Math.abs(ux * ax + uz * az) + q.hz * Math.abs(vx * ax + vz * az);
    };
    const d = Math.abs((b.x - a.x) * ax + (b.z - a.z) * az);
    if (d > extent(a) + extent(b) + gap) return false;
  }
  return true;
}

/** Whether (x, z) lies within a lot's footprint grown by `margin`. */
export function inLot(l: Pick<Lot, 'x' | 'z' | 'yaw' | 'hx' | 'hz'>, x: number, z: number, margin = 0): boolean {
  const dx = x - l.x, dz = z - l.z, u = dx * Math.cos(l.yaw) - dz * Math.sin(l.yaw), v = dx * Math.sin(l.yaw) + dz * Math.cos(l.yaw);
  return Math.abs(u) < l.hx + margin && Math.abs(v) < l.hz + margin;
}

/** A lot's footprint's points: its corners, its edges' middles and its middle. */
export function footprint(l: Pick<Lot, 'x' | 'z' | 'yaw' | 'hx' | 'hz'>): P2[] {
  const ux = Math.cos(l.yaw), uz = -Math.sin(l.yaw), vx = Math.sin(l.yaw), vz = Math.cos(l.yaw), out: P2[] = [];
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) out.push([l.x + ux * l.hx * a + vx * l.hz * b, l.z + uz * l.hx * a + vz * l.hz * b]);
  return out;
}

/** The island's lots, buildings and palms along its roads' surfaces; `chunkOf` names a point's chunk. */
export function fillIsland(ground: Ground, surfaces: RoadSurfaces, chunkOf: (x: number, z: number) => number, seed = 1): IslandFill {
  const rnd = stream(seed ^ 0x51f1);
  const lots: Lot[] = [], palms: Array<{ x: number; z: number }> = [];
  const chunks = new Map<number, StaticDesc[]>();
  const grid = new Map<string, Lot[]>();
  const CELL = 64;
  const cellKey = (x: number, z: number): string => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const nearLots = (x: number, z: number): Lot[] => {
    const out: Lot[] = [], i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) out.push(...(grid.get(`${a},${b}`) ?? []));
    return out;
  };
  // free ground for a lot: land, grass (no road, paved place, beach or quarry), off every road's pavement and the
  // plan's places
  const free = (x: number, z: number): boolean => ground.onLand(x, z) && ground.surface(x, z) === GRASS && !ground.nearOtherRoad(x, z, -1, PAVEMENT + CLEAR) && !reserved(x, z);
  const p = { x: 0, y: 0, z: 0 };
  const statics = (x: number, z: number): StaticDesc[] => {
    const key = chunkOf(x, z);
    let list = chunks.get(key);
    if (!list) { list = []; chunks.set(key, list); }
    return list;
  };

  for (const st of surfaces.strips) {
    if (st.cls !== 'avenue' && st.cls !== 'street' && st.cls !== 'side') continue;
    const total = st.s[st.s.length - 1] as number;
    for (const side of [-1, 1] as const) {
      let s = 0;
      while (s < total) {
        onStrip(st, s, 0, p);
        const district = districtOf(p.x, p.z), rule = RULE[district];
        const variant = Math.floor(rnd() * 3);
        const hx = rule.hx[0] + rnd() * (rule.hx[1] - rule.hx[0]), hz = rule.hz[0] + rnd() * (rule.hz[1] - rule.hz[0]);
        const at = s + hx;
        if (at + hx > total) break;
        const lot = placeLot(st, at, side, hx, hz, rule.setback, district, variant);
        s += 2 * hx + rule.gap;
        if (!lot) continue;
        const pts = footprint(lot);
        if (!pts.every(([x, z]) => free(x, z))) continue;
        if (nearLots(lot.x, lot.z).some((o) => overlap(o, lot, Math.min(rule.gap, RULE[o.district].gap)))) continue;
        const hs = pts.map(([x, z]) => ground.surfaceHeight(x, z));
        lot.base = Math.max(...hs);
        lot.foot = Math.min(...hs);
        if (lot.base - lot.foot > STEEPEST[district]) continue;
        lots.push(lot);
        const key = cellKey(lot.x, lot.z);
        grid.set(key, [...(grid.get(key) ?? []), lot]);
      }
    }
  }

  // the buildings, each on its plinth, built about the origin, turned and set on its ground
  const accent = (d: DistrictId): number => ACCENTS[d];
  for (const lot of lots) {
    const list = statics(lot.x, lot.z), kit = new Architecture(list), start = list.length;
    kit.building(0, 0, lot.hx, lot.hz, lot.district, 1, 1, lot.floors, lot.variant, accent(lot.district), false, true);
    // the plinth from under the lowest ground up to the floor
    kit.box(0, (lot.foot - lot.base - 0.4) / 2, 0, lot.hx + 0.05, (lot.base - lot.foot + 0.4) / 2, lot.hz + 0.05, CITY_COLORS.stone, 'building');
    kit.rotateFrom(start, lot.x, lot.z, lot.yaw);
    for (let i = start; i < list.length; i++) (list[i] as StaticDesc).position.y += lot.base;
    // a house's front garden: a palm and a hedge
    if (lot.district === 'gardens') {
      const fx = Math.sin(lot.yaw), fz = Math.cos(lot.yaw), ux = Math.cos(lot.yaw), uz = -Math.sin(lot.yaw);
      const px = lot.x - fx * (lot.hz + 3) + ux * lot.hx * 0.5, pz = lot.z - fz * (lot.hz + 3) + uz * lot.hx * 0.5;
      if (free(px, pz)) palm(px, pz);
      const hxp = lot.x - fx * (lot.hz + 1) - ux * lot.hx * 0.4, hzp = lot.z - fz * (lot.hz + 1) - uz * lot.hx * 0.4;
      if (free(hxp, hzp)) {
        const s = statics(hxp, hzp), k = new Architecture(s), from = s.length;
        k.box(0, 0.5, 0, lot.hx * 0.45, 0.5, 0.6, CITY_COLORS.hedge);
        k.rotateFrom(from, hxp, hzp, lot.yaw);
        for (let i = from; i < s.length; i++) (s[i] as StaticDesc).position.y += ground.surfaceHeight(hxp, hzp);
      }
    }
  }
  // a palm, clear of the lots (none on Crown's hill: R2)
  function palm(x: number, z: number): void {
    if (districtOf(x, z) === 'crown' || nearLots(x, z).some((o) => overlap(o, { x, z, yaw: 0, hx: 1.5, hz: 1.5 } as Lot, 0))) return;
    const list = statics(x, z), kit = new Architecture(list), start = list.length;
    kit.tree(0, 0, true);
    kit.rotateFrom(start, x, z, 0);
    const y = ground.surfaceHeight(x, z);
    for (let i = start; i < list.length; i++) (list[i] as StaticDesc).position.y += y;
    palms.push({ x, z });
  }
  // the palms along the roads that have them, on both sides past the pavement
  for (const st of surfaces.strips) {
    if (!PALM_ROADS.test(st.id)) continue;
    const total = st.s[st.s.length - 1] as number;
    for (let s = PALM_EVERY / 2; s < total; s += PALM_EVERY) {
      const k = Math.min(st.drawn.length - 1, Math.max(0, st.s.findIndex((v) => v > s) - 1));
      if (!st.drawn[k]) continue;
      for (const side of [-1, 1]) {
        onStrip(st, s, side * (st.hw + PAVEMENT + PALM_OUT), p);
        if (free(p.x, p.z)) palm(p.x, p.z);
      }
    }
  }
  return { lots, palms, chunks };

  /** A lot `hx` × `hz` at station `at` of a strip, on its `side`, its front `setback` behind the pavement. */
  function placeLot(st: Strip, at: number, side: 1 | -1, hx: number, hz: number, setback: number, district: DistrictId, variant: number): Lot | null {
    const o = side * (st.hw + PAVEMENT + setback + hz);
    onStrip(st, at, o, p);
    const k = Math.min(st.rx.length - 1, Math.max(0, st.s.findIndex((v) => v > at) - 1));
    const rx = st.rx[k] as number, rz = st.rz[k] as number;
    if (!Number.isFinite(p.x)) return null;
    // its street face (local −Z) toward the road: local +Z along the way from the road
    const yaw = Math.atan2(side * rx, side * rz);
    const summit = Math.hypot(p.x - PLACES.towerTop.x, p.z - PLACES.towerTop.z);
    const floors = district === 'crown' ? 3 + variant + Math.round(5 * Math.max(0, 1 - summit / 450))
      : district === 'foundry' ? 1 : district === 'gardens' ? 2 : 3 + variant;
    return { x: p.x, z: p.z, yaw, hx, hz, district, floors, variant, base: 0, foot: 0 };
  }
}
