/**
 * Where the island's hidden cars and the fleet's finds wait (M8.10 slice 15, docs/M8.10_PLAN.md §1.4): the ice-cream
 * truck by the pleasure pier, the roadster in the middle hangar, the sweeper at the stadium, the hot-dog van under the
 * tower, the steamroller in the port, the monster truck on the golf course, each on the ground nearest the plan's spot
 * that is clear for it (on land, off every road and its pavement, off the lots, clear of every wall, container and
 * trunk, level enough), facing its nearest road (the roadster its hangar's door); the rocket trolley in a bay on the car
 * park's roof, facing the lane to the roof's jump; the hovercraft at the marina's slipway behind the sea trial's ring,
 * its bow to the water. Worked out once, when the stash is made; no Three.js.
 */
import { BALANCE } from '../balance';
import type { HiddenCar } from '../city/stash';
import type { StaticDesc } from '../scene';
import { bodySpec } from '../traffic/bodies';
import { inLot } from './fill';
import { CHUNKS_X, CHUNKS_Z, Island } from './Island';
import type { CrownPlace } from './places/crown';
import { STASH } from './plan';
import { CAR_PARK } from './shapes/crown';
import { trialRing } from './slipways';
import { PAVEMENT } from './surfaces';

/** A hidden car's place: where it stands, its heading, and its floor's height where that is not the ground's (a roof). */
export interface StashSpot { x: number; z: number; yaw: number; y?: number }

/**
 * The search for clear ground round a plan's spot (m): rings `step` apart out to `reach`; a car keeps `room` round its
 * footprint and `road` past a carriageway's pavement; its ground rises no more than `level` along its length (and a
 * hand); anything built in its way from `under` below its ground to `over` above it; and `ahead` m of the way it faces
 * clear to drive off (onto a road or not).
 */
const SEARCH = { step: 2, reach: 40, room: 0.8, road: 0.5, level: 0.12, under: 0.1, over: 2.6, ahead: 8 } as const;
/** The ones that face a set way rather than their road: the roadster its hangar's door (the runway's side, −X). */
const FACING: Partial<Record<HiddenCar, number>> = { roadster: -Math.PI / 2 };
/** The trolley's bay on the roof: the bays' lines from the ramps' north end, `pitch` apart, and the one it takes. */
const ROOF_BAY = { first: 1, pitch: 2.6, index: 4 } as const;

export function islandStash(island: Island): Record<HiddenCar, StashSpot> {
  const out = {} as Record<HiddenCar, StashSpot>;
  for (const id of Object.keys(STASH) as HiddenCar[]) {
    const [x, z] = STASH[id];
    out[id] = id === 'trolley' ? roofBay(island) : id === 'hover' ? slipwayTop(island, x, z) : clearSpot(island, id, x, z);
  }
  return out;
}

/** The trolley in a bay on the car park's roof over its core, facing the west lane (+X) where the roof's kicker is. */
function roofBay(island: Island): StashSpot {
  const crown = island.places.find((p) => p.id === 'crown') as CrownPlace | undefined;
  const P = CAR_PARK, top = crown?.carParkRoof ?? P.floor + P.decks * P.rise;
  const z = P.ramps.z0 + ROOF_BAY.first + (ROOF_BAY.index + 0.5) * ROOF_BAY.pitch;
  return { x: (P.core.x0 + P.core.x1) / 2, z, yaw: Math.PI / 2, y: top };
}

/**
 * The hovercraft on the marina's slipway's axis, behind the sea trial's ring (clear of it by its own length), its bow to
 * the water: found, it rolls through the ring and down the ramp.
 */
function slipwayTop(island: Island, x: number, z: number): StashSpot {
  const s = island.slipways[0];
  if (!s) return { x, z, yaw: 0 };
  const ring = trialRing(s), back = BALANCE.jobs.markerRadius + bodySpec('hover').halfLength + 1;
  return { x: ring.x - s.nx * back, z: ring.z - s.nz * back, yaw: Math.atan2(s.nx, s.nz) };
}

/**
 * The ground nearest (x, z) clear for the car and for driving off it, facing its nearest road's way (else across it, else
 * away from it; or its set heading); (x, z) with none.
 */
function clearSpot(island: Island, id: HiddenCar, x: number, z: number): StashSpot {
  const road = { x: 0, y: 0, z: 0, yaw: 0 };
  island.ground.nearestRoad(x, z, road);
  const toRoad = Math.atan2(road.x - x, road.z - z), fixed = FACING[id];
  const yaws = fixed !== undefined ? [fixed] : [toRoad, toRoad + Math.PI / 2, toRoad - Math.PI / 2, toRoad + Math.PI];
  const spec = bodySpec(id), hw = spec.halfWidth + SEARCH.room, hl = spec.halfLength + SEARCH.room;
  const solids = nearSolids(island, x, z);
  for (let r = 0; r <= SEARCH.reach; r += SEARCH.step) {
    const n = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / SEARCH.step);
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      for (const yaw of yaws) {
        if (!clear(island, solids, px, pz, yaw, hw, hl, spec.halfLength, true)) continue;
        // the way it faces open to drive off: its footprint moved ahead a few metres at a time, onto a road or not
        let open = true;
        for (let d = SEARCH.step; d <= SEARCH.ahead && open; d += SEARCH.step) open = clear(island, solids, px + Math.sin(yaw) * d, pz + Math.cos(yaw) * d, yaw, hw, hl, spec.halfLength, false);
        if (open) return { x: px, z: pz, yaw };
      }
    }
  }
  return { x, z, yaw: yaws[0] as number };
}

/** The statics a car could stand in near (x, z): what the physics has that is not the ground (walls, containers, trunks, decks). */
function nearSolids(island: Island, x: number, z: number): StaticDesc[] {
  const [ci, cj] = Island.chunkOf(x, z), out: StaticDesc[] = [];
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= CHUNKS_X || j >= CHUNKS_Z) continue;
    for (const st of island.statics(Island.chunkIndex(i, j))) if (st.tag === 'building' || st.tag === 'kerb' || st.tag === 'trunk') out.push(st);
  }
  return out;
}

/**
 * A car's footprint (half width and length with its room, heading `yaw`) at (x, z) is clear for it: on land, off the
 * lots, level enough, nothing built in the way; to stand in (`stand`), off every road and its pavement too.
 */
function clear(island: Island, solids: readonly StaticDesc[], x: number, z: number, yaw: number, hw: number, hl: number, length: number, stand: boolean): boolean {
  const g = island.ground, fx = Math.sin(yaw), fz = Math.cos(yaw);
  let lo = Infinity, hi = -Infinity;
  for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
    const px = x + fz * hw * a + fx * hl * b, pz = z - fx * hw * a + fz * hl * b;
    if (!g.onLand(px, pz) || (stand && g.nearOtherRoad(px, pz, -1, PAVEMENT + SEARCH.road))) return false;
    if (island.fill.lots.some((l) => Math.abs(l.x - px) < l.hx + l.hz && Math.abs(l.z - pz) < l.hx + l.hz && inLot(l, px, pz, 1))) return false;
    const h = g.surfaceHeight(px, pz);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  if (hi - lo > SEARCH.level * 2 * length + 0.1) return false;
  // anything built in the way, by its footprint's bounds (a turned box's, a cylinder's, a prism's) against the car's
  const ex = Math.abs(fz) * hw + Math.abs(fx) * hl, ez = Math.abs(fx) * hw + Math.abs(fz) * hl;
  for (const st of solids) {
    const b = bounds(st);
    if (b.y0 > hi + SEARCH.over || b.y1 < lo + SEARCH.under) continue;
    if (b.x0 < x + ex && b.x1 > x - ex && b.z0 < z + ez && b.z1 > z - ez) return false;
  }
  return true;
}

/** A static's bounds: its footprint's (x0..x1, z0..z1) and its height's (y0..y1), however it is turned. */
function bounds(st: StaticDesc): { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number } {
  const s = st.shape, p = st.position;
  if (s.kind === 'prism') {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of s.points) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    return { x0, x1, z0, z1, y0: s.y0, y1: s.y1 };
  }
  const [hx, hy, hz] = s.kind === 'cylinder' ? [s.radius, s.halfHeight, s.radius] : s.kind === 'box' || s.kind === 'gable' ? [s.hx, s.hy, s.hz] : [0, 0, 0];
  // the turned box's half axes' reach along the world's x, y and z (the rotation's matrix rows, by magnitude)
  const { x: qx, y: qy, z: qz, w: qw } = st.rotation;
  const r = [
    [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
    [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
    [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)],
  ] as const;
  const reach = (row: readonly [number, number, number]): number => Math.abs(row[0]) * hx + Math.abs(row[1]) * hy + Math.abs(row[2]) * hz;
  const rx = reach(r[0]), ry = reach(r[1]), rz = reach(r[2]);
  return { x0: p.x - rx, x1: p.x + rx, z0: p.z - rz, z1: p.z + rz, y0: p.y - ry, y1: p.y + ry };
}
