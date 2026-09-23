/**
 * Where the jobs are (docs/M5_PLAN.md D4, D5): placed by the generator from
 * the seed, never authored. Markers stand on the corner aprons of the grid
 * junctions, `ROAD_HALF + 6` m out along both arms (off the carriageway,
 * past the pavement), where nothing a car would hit stands between the kerb
 * corner and the ring (the billboard placer's clearance query against the
 * chunk's statics), clear of the drop-off doors, the ramps and the camera
 * poles, and at least `markerMinGap` apart.
 *
 * The four escapes take a corner where a street meets the highway, one per
 * side of the island (the on-ramps); the six deliveries and six orders are
 * spread over the rest by farthest-point sampling from a seeded start, so
 * every district gets some. A delivery goes to the nearest drop-off at least
 * `minPath` m away by lane path, an order to the nearest fence (the scrapyard,
 * the hotel, the Palm Gardens lot) the same way. Limits and payouts come from
 * that path at the lanes' speed limits.
 *
 * Runs once per world; it allocates and generates only the chunks it asks
 * about (a candidate's clearance is checked when it is about to be picked).
 */
import { BALANCE } from '../balance';
import type { City } from '../city/City';
import { CAR_TOP, tallFootprint } from '../city/collectibles';
import { coverSites, nearDoor, type DropOff } from '../city/cover';
import { alongLane, laneChain } from '../city/route';
import { BLOCK, HIGHWAY_HALF, ROAD_HALF, distanceToPolyline, type Lane } from '../city/roads';
import { mulberry32 } from '../random';
import type { LaneTables } from '../traffic/lanes';
import { ORDER_KINDS, orderPaints, packDescriptor, type JobDef, type JobKind } from './catalog';

/** Metres past the carriageway edge a corner marker stands, along both arms. */
const CORNER_OUT = 6;
/** Metres of clear ground past the ring's centre (the box also reaches back to the kerb corner). */
const CLEAR_PAST = 3;
/** Kept from a drop-off's opening, a ramp and a camera pole (m). */
const DOOR_CLEAR = 20;
const RAMP_CLEAR = 25;
const POLE_CLEAR = 15;
const RING = 3 * BLOCK;

interface Candidate {
  x: number;
  z: number;
  yaw: number;
  /** The kerb corner the ring is reached from. */
  kx: number;
  kz: number;
  /** 'n' | 'e' | 's' | 'w' for a street's corner at the highway, '' inside. */
  side: string;
  /** 1 clear, 0 blocked, -1 not checked yet. */
  clear: number;
}

/** A place a job ends: a drop-off (its door) or the Palm Gardens fence (a point). */
export interface JobTarget {
  x: number;
  z: number;
  /** The lane the drive ends on and the distance along it. */
  lane: number;
  s: number;
}

/** Every corner apron inside the highway ring, the kerb corner it is reached from, and its side of the island when it is a street's corner at the highway. */
function corners(city: City): Candidate[] {
  const out: Candidate[] = [];
  for (const n of city.graph.nodes) {
    const gx = Math.round(n.x / BLOCK), gz = Math.round(n.z / BLOCK);
    const vx = Math.abs(gx) === 3 ? HIGHWAY_HALF : ROAD_HALF, vz = Math.abs(gz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
    const edge = Math.abs(gx) === 3 || Math.abs(gz) === 3;
    const islandCorner = Math.abs(gx) === 3 && Math.abs(gz) === 3;
    if (islandCorner) continue;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = n.x + sx * (vx + CORNER_OUT), z = n.z + sz * (vz + CORNER_OUT);
        if (Math.abs(x) > RING || Math.abs(z) > RING) continue;
        const side = !edge ? '' : gz === 3 ? 'n' : gx === -3 ? 'e' : gz === -3 ? 's' : 'w';
        out.push({ x, z, yaw: Math.atan2(n.x - x, n.z - z), kx: n.x + sx * vx, kz: n.z + sz * vz, side, clear: -1 });
      }
    }
  }
  return out;
}

/** The ring and the way in from the kerb corner hold nothing a car would hit; off every carriageway; clear of doors, ramps and poles. */
function isClear(city: City, c: Candidate): boolean {
  const r = BALANCE.jobs.markerRadius;
  for (const road of city.graph.special) if (distanceToPolyline(road.centre, c.x, c.z) - road.halfWidth < r + 1) return false;
  if (nearDoor(c.x, c.z, DOOR_CLEAR)) return false;
  for (const j of city.jumps) if (Math.hypot(j.x - c.x, j.z - c.z) < RAMP_CLEAR) return false;
  for (const cam of city.cameras) if (Math.hypot(cam.poleX - c.x, cam.poleZ - c.z) < POLE_CLEAR) return false;
  const sx = Math.sign(c.x - c.kx), sz = Math.sign(c.z - c.kz);
  const box = {
    minX: Math.min(c.kx, c.x + sx * CLEAR_PAST), maxX: Math.max(c.kx, c.x + sx * CLEAR_PAST),
    minZ: Math.min(c.kz, c.z + sz * CLEAR_PAST), maxZ: Math.max(c.kz, c.z + sz * CLEAR_PAST),
  };
  const chunk = city.chunk(Math.round(c.x / BLOCK), Math.round(c.z / BLOCK));
  for (const st of chunk.statics) {
    const f = tallFootprint(st, CAR_TOP);
    if (f && f.minX < box.maxX && f.maxX > box.minX && f.minZ < box.maxZ && f.maxZ > box.minZ) return false;
  }
  return true;
}

function clear(city: City, c: Candidate): boolean {
  if (c.clear < 0) c.clear = isClear(city, c) ? 1 : 0;
  return c.clear === 1;
}

/** The Palm Gardens fence: a lot on the Garden Parkway, 2 m past its pavement, the first clear one from the middle of the arc out. */
export function palmFence(city: City): { x: number; z: number } {
  const road = city.graph.special.find((r) => r.kind === 'parkway');
  const fallback = { x: -400, z: 400 };
  if (!road) return fallback;
  const r = BALANCE.jobs.markerRadius;
  for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) {
    const i = Math.min(road.centre.length - 2, Math.round(t * (road.centre.length - 1)));
    const a = road.centre[i] as { x: number; z: number }, b = road.centre[i + 1] as { x: number; z: number };
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
    for (const side of [1, -1]) {
      const out = road.halfWidth + 6.5;
      const c: Candidate = { x: a.x + nx * side * out, z: a.z + nz * side * out, yaw: 0, kx: a.x + nx * side * road.halfWidth, kz: a.z + nz * side * road.halfWidth, side: '', clear: -1 };
      if (distanceToPolyline(road.centre, c.x, c.z) - road.halfWidth < r + 1) continue;
      if (clear(city, c)) return { x: c.x, z: c.z };
    }
  }
  return fallback;
}

/** A drop-off as a job's end: 4 m inside its door (any car through the opening passes within the ring), on its approach lane. */
export function dropOffTarget(city: City, site: DropOff): JobTarget {
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
  const approach = city.graph.lanes[site.approachLane] as Lane;
  return {
    x: site.door.x + fx * BALANCE.jobs.markerRadius,
    z: site.door.z + fz * BALANCE.jobs.markerRadius,
    lane: site.approachLane,
    s: alongLane(approach, site.door.x, site.door.z).s,
  };
}

/** A point's nearest lane as a job's end. */
export function pointTarget(city: City, x: number, z: number): JobTarget {
  const lane = city.nearestLane(x, z);
  return { x, z, lane, s: alongLane(city.graph.lanes[lane] as Lane, x, z).s };
}

/**
 * The drive from a point to a target along the lanes: the shortest chain from
 * the point's nearest lane (U-turns included), its length in metres with the
 * junction curves, and its time at the lanes' limits (a curve at the slower of
 * its two lanes').
 */
export function lanePathTo(city: City, lanes: LaneTables, x: number, z: number, target: JobTarget): { length: number; time: number } {
  const start = city.nearestLane(x, z);
  const s0 = alongLane(city.graph.lanes[start] as Lane, x, z).s;
  const chain = start === target.lane && target.s >= s0 ? [start] : laneChain(city.graph, start, target.lane);
  if (chain.length === 0) return { length: Infinity, time: Infinity };
  let length = 0, time = 0;
  for (let i = 0; i < chain.length; i++) {
    const lane = chain[i] as number;
    const len = lanes.length[lane] as number;
    const from = i === 0 ? s0 : 0;
    const to = i === chain.length - 1 ? target.s : len;
    const d = Math.max(0, to - from);
    length += d;
    time += d / (lanes.limit[lane] as number);
    const next = chain[i + 1];
    if (next !== undefined) {
      const c = lanes.connectionLength(lane, next);
      length += c;
      time += c / Math.min(lanes.limit[lane] as number, lanes.limit[next] as number);
    }
  }
  return { length, time };
}

/** The nearest of `targets` at least `minPath` m away by path (the farthest when none is). */
function pick(city: City, lanes: LaneTables, x: number, z: number, targets: readonly JobTarget[]): { target: JobTarget; length: number; time: number } {
  let best: { target: JobTarget; length: number; time: number } | null = null;
  let far: { target: JobTarget; length: number; time: number } | null = null;
  for (const t of targets) {
    const p = lanePathTo(city, lanes, x, z, t);
    if (!far || p.length > far.length) far = { target: t, ...p };
    if (p.length >= BALANCE.jobs.delivery.minPath && (!best || p.length < best.length)) best = { target: t, ...p };
  }
  return (best ?? far) as { target: JobTarget; length: number; time: number };
}

/** The order fences: the scrapyard, the hotel garage (the drop-offs other than the hideout), and the Palm Gardens lot. */
export function fenceTargets(city: City): JobTarget[] {
  const sites = coverSites(city).dropOffs;
  const out = sites.filter((s) => s.name !== 'hideout').map((s) => dropOffTarget(city, s));
  const palm = palmFence(city);
  out.push(pointTarget(city, palm.x, palm.z));
  return out;
}

/** Deterministic per seed: `BALANCE.jobs.counts` of each kind, ids from 1 (0 is the cold open's). */
export function placeJobs(city: City, seed: number, lanes: LaneTables): JobDef[] {
  const cfg = BALANCE.jobs;
  const rng = mulberry32(seed ^ 0x0b5);
  const all = corners(city);
  const picked: Candidate[] = [];
  const gapOk = (c: Candidate): boolean => picked.every((p) => Math.hypot(p.x - c.x, p.z - c.z) >= cfg.markerMinGap);
  const defs: JobDef[] = [];

  // the escapes: one street corner at the highway per side, in the order the levels are listed
  const sides = ['n', 'e', 's', 'w'];
  for (let k = 0; k < cfg.counts.escape; k++) {
    const side = sides[k % sides.length] as string;
    const pool = all.filter((c) => c.side === side);
    const start = (rng() * pool.length) | 0;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[(start + i) % pool.length] as Candidate;
      if (!gapOk(c) || !clear(city, c)) continue;
      picked.push(c);
      const level = cfg.escape.levels[k] ?? 2;
      defs.push({ id: defs.length + 1, kind: 'escape', x: c.x, z: c.z, yaw: c.yaw, targetX: 0, targetZ: 0, level, descriptor: -1, payout: cfg.escape.bounty * level, limitSeconds: 0, heat: 0 });
      break;
    }
  }

  // deliveries and orders: spread by farthest-point sampling from a seeded clear start
  const n = cfg.counts.delivery + cfg.counts.order;
  const kinds: JobKind[] = [];
  for (let i = 0; i < cfg.counts.delivery; i++) kinds.push('delivery');
  for (let i = 0; i < cfg.counts.order; i++) kinds.push('order');
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = kinds[i] as JobKind; kinds[i] = kinds[j] as JobKind; kinds[j] = t;
  }
  const inner = all.filter((c) => c.side === '' || !picked.includes(c));
  const spread: Candidate[] = [];
  for (let tries = 0; tries < inner.length && spread.length === 0; tries++) {
    const c = inner[(rng() * inner.length) | 0] as Candidate;
    if (gapOk(c) && clear(city, c)) { spread.push(c); picked.push(c); }
  }
  while (spread.length < n) {
    let best: Candidate | null = null, bestD = -1;
    for (const c of inner) {
      if (c.clear === 0 || picked.includes(c) || !gapOk(c)) continue;
      let d = Infinity;
      for (const p of picked) d = Math.min(d, Math.hypot(p.x - c.x, p.z - c.z));
      if (d > bestD) { bestD = d; best = c; }
    }
    if (!best) break;
    if (!clear(city, best)) continue;
    spread.push(best);
    picked.push(best);
  }

  const drops = coverSites(city).dropOffs.map((s) => dropOffTarget(city, s));
  const fences = fenceTargets(city);
  const d = cfg.delivery, o = cfg.order;
  for (let i = 0; i < spread.length; i++) {
    const c = spread[i] as Candidate;
    const kind = kinds[i] ?? 'delivery';
    if (kind === 'delivery') {
      const p = pick(city, lanes, c.x, c.z, drops);
      const payout = Math.max(d.payoutMin, Math.min(d.payoutMax, Math.round(d.payoutPerKm * p.length / 1000 / 100) * 100));
      const limit = Math.max(d.limitMin, Math.round(d.limitFactor * p.time));
      defs.push({ id: defs.length + 1, kind, x: c.x, z: c.z, yaw: c.yaw, targetX: p.target.x, targetZ: p.target.z, level: 0, descriptor: -1, payout, limitSeconds: limit, heat: d.heat });
    } else {
      const p = pick(city, lanes, c.x, c.z, fences);
      const carKind = ORDER_KINDS[(rng() * ORDER_KINDS.length) | 0] ?? 'compact';
      const paints = orderPaints(carKind);
      const paint = paints[(rng() * paints.length) | 0] as number;
      defs.push({
        id: defs.length + 1, kind, x: c.x, z: c.z, yaw: c.yaw, targetX: p.target.x, targetZ: p.target.z, level: 0,
        descriptor: packDescriptor(carKind, paint), payout: o.payout[carKind as keyof typeof o.payout], limitSeconds: o.limitSeconds, heat: o.heat,
      });
    }
  }
  return defs;
}
