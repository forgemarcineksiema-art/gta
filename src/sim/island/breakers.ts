/**
 * The island's eight pursuit breakers (M8.10 slice 15, docs/M8.10_PLAN.md §1.4): the grid's rule (a tall thing at the
 * kerb that, driven through at speed, falls across its side of the road behind the car and lies there as a barrier for
 * the chasers, `city/breakers.ts`) with what each place has to hand: the building sites' scaffolds on Crown's streets,
 * stacked containers on the highway's verge by both container yards, the quarry's rock stack by its floor's track, a
 * flatcar's lashed load at the rail yard's kerb, the garden centre's pallets, a lifeguard's hut by the beach. Each on the
 * pavement (a verge where the road has none) of the nearest road of its kind to the plan's point, mid-block, falling
 * toward the road's middle; its height once the pavements stand.
 */
import { BREAKER, type BreakerDesc, type BreakerKind } from '../city/breakers';
import type { P2 } from './geom';
import { HALF_WIDTH, type GradedRoad, type Ground } from './ground';
import { inKeep, type Keep } from './keep';
import { BREAKERS, highwayLoop, type RoadClass } from './plan';
import { PAVEMENT, type RoadSurfaces } from './surfaces';

/** Where a breaker stands before its height is known: its foot, its fall's way, what it is. */
export interface BreakerSite { x: number; z: number; nx: number; nz: number; kind: BreakerKind; paved: boolean }

/** The roads each kind stands by: the classes, and whether it stands on a pavement (else on the verge, this far out). */
const BY: Readonly<Record<BreakerKind, { classes: readonly RoadClass[]; paved: boolean }>> = {
  scaffold: { classes: ['street'], paved: true },
  containers: { classes: ['highway'], paved: false },
  rocks: { classes: ['dirt'], paved: false },
  flatcar: { classes: ['side'], paved: true },
  pallets: { classes: ['side'], paved: true },
  huts: { classes: ['avenue', 'side'], paved: true },
};
/** A verge's breaker stands this far past its carriageway's edge (m). */
const VERGE_OUT = 1.6;
/** Mid-block: this far from any junction's middle (m), and searched this far along the road either way of the plan's point. */
const FROM_JUNCTION = 30;
const SEARCH = 80;
/** A breaker's foot keeps this far off any other road's carriageway (m): no deck over it, no junction's mouth by it. */
const CLEAR_OF_ROADS = 15;

/** A road's point `s` m along it, its way there, and each point's station (worked out per call: plan time only). */
function along(road: GradedRoad, s: number): { x: number; z: number; tx: number; tz: number } {
  let run = 0;
  const n = road.pts.length, last = road.closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = road.pts[i] as P2, b = road.pts[(i + 1) % n] as P2, l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (run + l >= s || i === last - 1) {
      const t = Math.max(0, Math.min(1, (s - run) / (l || 1)));
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / (l || 1), tz: (b[1] - a[1]) / (l || 1) };
    }
    run += l;
  }
  return { x: (road.pts[0] as P2)[0], z: (road.pts[0] as P2)[1], tx: 1, tz: 0 };
}

/** A road's nearest point to (x, z): its distance, its station, the road's length. */
function nearest(road: GradedRoad, x: number, z: number): { d: number; s: number; length: number } {
  let bd = Infinity, bs = 0, run = 0;
  const n = road.pts.length, last = road.closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = road.pts[i] as P2, b = road.pts[(i + 1) % n] as P2, dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (l * l || 1)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < bd) { bd = d; bs = run + t * l; }
    run += l;
  }
  return { d: bd, s: bs, length: run };
}

/**
 * The eight sites, before the lots: each the pavement's (or the verge's) spot nearest the plan's point on the nearest road
 * of its kind, on the point's side of the road, mid-block (the highway's where it runs on the ground), clear of the
 * jumps' ways (`keep`).
 */
export function breakerSites(ground: Ground, surfaces: RoadSurfaces, keep: readonly Keep[]): BreakerSite[] {
  const loop = highwayLoop(6);
  const onDeck = (x: number, z: number): boolean => {
    let bi = 0, bd = Infinity;
    loop.pts.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; bi = i; } });
    return loop.span[bi] !== 'ground';
  };
  return BREAKERS.map((b) => {
    const rule = BY[b.kind], [px, pz] = b.at;
    // the nearest road of its kind (the highway's stretches on the ground among them)
    let best: { road: GradedRoad; d: number; s: number; length: number } | null = null;
    for (const road of ground.roads) {
      if (!rule.classes.includes(road.cls)) continue;
      const hit = nearest(road, px, pz);
      if (!best || hit.d < best.d) best = { road, ...hit };
    }
    if (!best) throw new Error(`breakers: no ${rule.classes.join('/')} road near ${b.kind}`);
    const road = best.road, hw = HALF_WIDTH[road.cls], out = rule.paved ? hw + PAVEMENT / 2 : hw + VERGE_OUT + BREAKER.halfDepth;
    const p0 = along(road, best.s), side = (px - p0.x) * -p0.tz + (pz - p0.z) * p0.tx >= 0 ? 1 : -1;
    // the station nearest the plan's point that is mid-block, on the ground and clear of the jumps' ways
    for (let k = 0; k <= 2 * SEARCH; k++) {
      const s = best.s + (k % 2 === 0 ? k / 2 : -(k + 1) / 2);
      if (s < 0 || s > best.length) continue;
      const p = along(road, s), rx = -p.tz * side, rz = p.tx * side, x = p.x + rx * out, z = p.z + rz * out;
      if (surfaces.junctions.some((j) => Math.hypot(j.x - p.x, j.z - p.z) < FROM_JUNCTION)) continue;
      if (road.cls === 'highway' && onDeck(p.x, p.z)) continue;
      // no other road near: a junction's mouth, or a deck passing over (the tower stands 11 m tall; the highway's decks
      // are not the ground's roads, so its loop is read whole)
      if (!ground.onLand(x, z) || ground.nearOtherRoad(x, z, ground.roads.indexOf(road), CLEAR_OF_ROADS)) continue;
      if (road.cls !== 'highway' && loop.pts.some((q) => Math.hypot(q[0] - x, q[1] - z) < HALF_WIDTH.highway + CLEAR_OF_ROADS)) continue;
      if (keep.some((q) => inKeep(q, x, z, 4))) continue;
      return { x, z, nx: -rx, nz: -rz, kind: b.kind, paved: rule.paved };
    }
    throw new Error(`breakers: no spot for ${b.kind} by ${road.id}`);
  });
}

/** A breaker and where it falls (m), for the lots and the props to keep off: its footprint, then its height along its fall. */
export function breakerKeep(b: BreakerSite): Keep {
  const reach = BREAKER.halfDepth + BREAKER.height, mid = reach / 2 - BREAKER.halfDepth;
  return { x: b.x + b.nx * mid, z: b.z + b.nz * mid, yaw: Math.atan2(b.nx, b.nz), hx: BREAKER.fallen.halfWidth + BREAKER.clear, hz: reach / 2 + BREAKER.clear };
}

/** The eight as the breakers read them, each at its height (`heightAt`: the pavement's top or the verge's ground). */
export function breakerDescs(sites: readonly BreakerSite[], heightAt: (site: BreakerSite) => number): BreakerDesc[] {
  return sites.map((b, id) => ({ id, x: b.x, z: b.z, nx: b.nx, nz: b.nz, y: heightAt(b), kind: b.kind }));
}
