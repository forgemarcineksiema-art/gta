/**
 * The island's fifty billboards (M8.10 slice 15, docs/M8.10_PLAN.md §1.4): sixteen on the highway's verges, eight on
 * the big jumps' landings, twenty-six on the streets. The grid's panel (`collectibles.ts`), smashed by driving through
 * it: a verge's stands ten metres off the carriageway facing it, as the grid's roadside ones; a street's is a gate across
 * its pavement, its face along the street, the frontage kept clear of lots for its run-out (the grid's footway gates); a
 * landing's stands across the jump's line where the car comes down at its design speed (one on Crown Avenue's way down
 * in its kerbside strip, as the first minute's). Where each stands is worked out before the lots (they keep off its
 * run-out), its height once the places stand (a roof, a boardwalk, the ground or the pavement's top).
 */
import { BILLBOARD_BOTTOM, BILLBOARD_HEIGHT, BILLBOARD_WIDTH, ROADSIDE_WIDTH, RUN_OUT_REACH, type BillboardDesc } from '../city/collectibles';
import { CITY_COLORS, PALETTE } from '../palette';
import type { P2 } from './geom';
import { HALF_WIDTH, type Ground } from './ground';
import { FIRST_MINUTE_STEPS, GARAGES, JUMPS, SERVICES, STASH, highwayLoop } from './plan';
import { reserved } from './fill';
import { pointAt, stationOf, type Kicker } from './jumps';
import { PAVEMENT, type RoadSurfaces } from './surfaces';
import { inKeep, type Keep } from './keep';

/** Where a billboard stands before its height is known: its panel's middle, the way its face looks, its width, what it is on. */
export interface BillboardSite {
  x: number;
  z: number;
  yaw: number;
  width: number;
  kind: 'verge' | 'street' | 'landing';
  /** A landing's jump (an index into `JUMPS`), -1 for the rest. */
  jump: number;
}

/** The counts (the plan's §1.4). */
export const BILLBOARDS = { verge: 16, landing: 8, street: 26 } as const;
const PAINTS = [PALETTE.carLime, PALETTE.carMagenta, PALETTE.carOrange, PALETTE.carBlue, CITY_COLORS.chalk];
/** A verge's panel stands this far past the carriageway's edge (m, the grid's). */
const VERGE = 10;
/** A gate's panel starts this far in from its kerb (m): its near post a hand off it. */
const GATE_IN = 0.3;
/** A street gate keeps this far from another billboard, a jump's way, a breaker, a drive-through or a garage (m). */
const APART = 90;
const CLEAR = 18;
/**
 * How far past each big jump's lip its landing's billboard stands (m, at the jump's design speed the car is coming down
 * through it), by the plan's index; and on Crown Avenue its kerbside strip's middle (the kicker's line).
 */
const LANDING: Readonly<Record<number, number>> = { 0: 28, 7: 42, 9: 27, 11: 22, 15: 34, 16: 185, 18: 20, 19: 20 };

/** A turned rectangle round a billboard's panel and its run-out both ways along its face (the lots and props keep off). */
export function billboardKeep(b: BillboardSite): Keep {
  return { x: b.x, z: b.z, yaw: b.yaw, hx: b.width / 2 + 0.5, hz: RUN_OUT_REACH };
}

/** A landing's billboard: across the jump's line `LANDING` m past its lip (a gap's: past its middle). */
function landingSite(jump: number, lip: { x: number; z: number; yaw: number }): BillboardSite {
  const d = LANDING[jump] ?? 25, fx = Math.sin(lip.yaw), fz = Math.cos(lip.yaw);
  return { x: lip.x + fx * d, z: lip.z + fz * d, yaw: lip.yaw, width: BILLBOARD_WIDTH, kind: 'landing', jump };
}

/**
 * The first minute's billboard (FIRST_MINUTE_STEPS): a gate across Crown Avenue's kerbside strip on the way down, where
 * the plan puts it, in the kickers' line; and the kerbside landings' (Crown Avenue's first kicker). Worked out before the
 * roads' surfaces, which paint no bay under them.
 */
export function kerbsideGates(ground: Ground, kickers: readonly Kicker[]): BillboardSite[] {
  const out: BillboardSite[] = [];
  const avenue = ground.roads.find((r) => r.id === 'crown-avenue-up'), first = kickers.find((k) => k.jump === 0);
  const step = FIRST_MINUTE_STEPS.find((s) => s.step === 'billboard');
  if (avenue && first && step) {
    // the kicker's line down the avenue, at the plan's point
    const s = stationOf(avenue, step.at[0], step.at[1]), p = pointAt(avenue, s), fx = -p.tx, fz = -p.tz;
    const off = (first.x - p.x) * -fz + (first.z - p.z) * fx;
    out.push({ x: p.x - fz * off, z: p.z + fx * off, yaw: Math.atan2(fx, fz), width: BILLBOARD_WIDTH, kind: 'street', jump: -1 });
  }
  if (first) out.push(landingSite(0, first));
  return out;
}

/** Whether a bay would stand under a kerbside gate (its footprint and a few metres round it). */
export function gateBlocked(gates: readonly BillboardSite[], x: number, z: number): boolean {
  return gates.some((g) => inKeep(billboardKeep(g), x, z, 1));
}

/**
 * Every billboard's site, before the lots: the verges' round the highway, the landings' of the big jumps (their lips from
 * `lips`, the places' and the kickers'), the streets' across their pavements; `keep` the jumps' ways they keep off.
 */
export function billboardSites(ground: Ground, surfaces: RoadSurfaces, kerbside: readonly BillboardSite[], lips: ReadonlyMap<number, { x: number; z: number; yaw: number }>, keep: readonly Keep[]): BillboardSite[] {
  const landings: BillboardSite[] = [];
  JUMPS.forEach((j, id) => {
    if (!j.billboard) return;
    const pre = kerbside.find((b) => b.jump === id);
    if (pre) { landings.push(pre); return; }
    const lip = lips.get(id);
    if (lip) landings.push(landingSite(id, lip));
  });
  const verges = vergeSites(ground, keep);
  const taken = [...landings, ...verges];
  const streets = streetSites(ground, surfaces, kerbside.filter((b) => b.kind === 'street'), taken, keep);
  return [...verges, ...streets, ...landings];
}

/** Away from the plan's own things a panel must not stand in: the drive-throughs, the garages, the hidden cars' spots. */
function clearOfPlaces(x: number, z: number): boolean {
  if (SERVICES.some((s) => Math.hypot(s.at[0] - x, s.at[1] - z) < CLEAR + 10)) return false;
  if (GARAGES.some((g) => Math.hypot(g.at[0] - x, g.at[1] - z) < CLEAR + 10)) return false;
  return !Object.values(STASH).some((p: P2) => Math.hypot(p[0] - x, p[1] - z) < CLEAR);
}

/**
 * The verges' sixteen: round the highway's loop where it runs on the ground (the tunnel, the viaduct and the bridge left
 * out), one a sixteenth of that length apart, each the nearest spot to its place where the verge is ground (no deck or
 * overpass near), land to past its run-out, level with the road, clear of every other road, the places and the jumps'
 * ways; the panel on whichever side is clear, facing the carriageway.
 */
function vergeSites(ground: Ground, keep: readonly Keep[]): BillboardSite[] {
  const loop = highwayLoop(6), pts = loop.pts, n = pts.length, hw = HALF_WIDTH.highway, off = hw + VERGE;
  // each sample's station along the loop's ground alone (-1 off it)
  const onGround = (i: number): boolean => { for (let k = -3; k <= 3; k++) if (loop.span[(i + k + n) % n] !== 'ground') return false; return true; };
  const s: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    s.push(onGround(i) ? total : -1);
    if (onGround(i)) total += Math.hypot((pts[(i + 1) % n] as P2)[0] - (pts[i] as P2)[0], (pts[(i + 1) % n] as P2)[1] - (pts[i] as P2)[1]);
  }
  const spacing = total / BILLBOARDS.verge;
  const DS = [hw + 2, off - 1, off, off + 1, off + RUN_OUT_REACH, off + RUN_OUT_REACH + 4] as const;
  const ALONG = [-ROADSIDE_WIDTH / 2 - 0.5, 0, ROADSIDE_WIDTH / 2 + 0.5] as const;
  const ok = (i: number, side: 1 | -1): BillboardSite | null => {
    const a = pts[(i - 1 + n) % n] as P2, b = pts[(i + 1) % n] as P2, l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const fx = (b[0] - a[0]) / l, fz = (b[1] - a[1]) / l, p = pts[i] as P2;
    // the side's way out from the road: its right (−fz, fx) or left
    const ox = -fz * side, oz = fx * side, x = p[0] + ox * off, z = p[1] + oz * off;
    const each = (test: (qx: number, qz: number, d: number) => boolean): boolean => {
      for (const d of DS) for (const along of ALONG) if (!test(p[0] + ox * d + fx * along, p[1] + oz * d + fz * along, d)) return false;
      return true;
    };
    // the cheap tests first: land, the jumps' ways, the places, the drive-throughs; then the other roads and the level
    if (!each((qx, qz) => ground.onLand(qx, qz) && !keep.some((k) => inKeep(k, qx, qz, 2)))) return null;
    if (!clearOfPlaces(x, z) || !each((qx, qz) => !reserved(qx, qz))) return null;
    if (!each((qx, qz, d) => d <= hw + 1 || !ground.nearOtherRoad(qx, qz, -1, 1.5))) return null;
    const road = ground.surfaceHeight(p[0] + ox * hw, p[1] + oz * hw);
    if (!each((qx, qz) => Math.abs(ground.surfaceHeight(qx, qz) - road) <= 1.8)) return null;
    // facing the carriageway: the face's way is back toward the road
    return { x, z, yaw: Math.atan2(-ox, -oz), width: ROADSIDE_WIDTH, kind: 'verge', jump: -1 };
  };
  const gap = (a: number, b: number): number => Math.min(Math.abs(a - b), total - Math.abs(a - b));
  // the samples on the ground, nearest a station first, within `reach` of it
  const nearestFirst = (target: number, reach: number): number[] => {
    const list: number[] = [];
    for (let i = 0; i < n; i++) if ((s[i] as number) >= 0 && gap(s[i] as number, target) <= reach) list.push(i);
    return list.sort((p, q) => gap(s[p] as number, target) - gap(s[q] as number, target));
  };
  const spotAt = (i: number): BillboardSite | null => ok(i, 1) ?? ok(i, -1);
  const out: Array<{ s: number; site: BillboardSite }> = [];
  const missing: number[] = [];
  for (let k = 0; k < BILLBOARDS.verge; k++) {
    const target = (k + 0.5) * spacing;
    let found = false;
    for (const i of nearestFirst(target, spacing / 2)) {
      const site = spotAt(i);
      if (site) { out.push({ s: s[i] as number, site }); found = true; break; }
    }
    if (!found) missing.push(target);
  }
  // where a stretch allows none, the nearest spot further off its place that keeps a quarter of the spacing from the rest
  for (const target of missing) {
    for (const i of nearestFirst(target, spacing * 1.5)) {
      if (out.some((q) => gap(q.s, s[i] as number) < spacing / 4)) continue;
      const site = spotAt(i);
      if (site) { out.push({ s: s[i] as number, site }); break; }
    }
  }
  return out.sort((a, b) => a.s - b.s).map((p) => p.site);
}

/**
 * The streets' twenty-six (the first minute's on Crown Avenue among them): gates across the pavements of the town's
 * roads, on a straight run of footway with room for the run-out both ways, its far post on land and off the plan's
 * places; spread over the island, each the candidate farthest from those already taken, kept `APART` from the other
 * billboards and `CLEAR` of the jumps' ways.
 */
function streetSites(ground: Ground, surfaces: RoadSurfaces, fixed: readonly BillboardSite[], taken: readonly BillboardSite[], keep: readonly Keep[]): BillboardSite[] {
  const candidates: BillboardSite[] = [];
  const width = BILLBOARD_WIDTH, reach = RUN_OUT_REACH + 1;
  for (const run of surfaces.footways) {
    if (run.length < 2 * reach + 6) continue;
    for (let a = reach + 3; a <= run.length - reach - 3; a += 15) {
      // the panel from its kerb across the footway and past it, its face along the street
      const cx = run.x + run.dx * a + run.nx * (GATE_IN + width / 2), cz = run.z + run.dz * a + run.nz * (GATE_IN + width / 2);
      const each = (test: (x: number, z: number) => boolean): boolean => {
        for (const u of [-reach, 0, reach]) for (const v of [GATE_IN, GATE_IN + width, PAVEMENT]) if (!test(run.x + run.dx * (a + u) + run.nx * v, run.z + run.dz * (a + u) + run.nz * v)) return false;
        return true;
      };
      if (!clearOfPlaces(cx, cz) || !each((x, z) => ground.onLand(x, z) && !keep.some((k) => inKeep(k, x, z, CLEAR)))) continue;
      if (!each((x, z) => !reserved(x, z))) continue;
      // the far post off every road's carriageway (a corner, a road running close behind)
      if (ground.nearOtherRoad(run.x + run.dx * a + run.nx * (GATE_IN + width), run.z + run.dz * a + run.nz * (GATE_IN + width), -1, 0.5)) continue;
      // the footway level enough along the run-out for a car at speed
      const rise = ground.surfaceHeight(run.x + run.dx * (a - reach), run.z + run.dz * (a - reach)) - ground.surfaceHeight(run.x + run.dx * (a + reach), run.z + run.dz * (a + reach));
      if (Math.abs(rise) > 0.12 * 2 * reach) continue;
      candidates.push({ x: cx, z: cz, yaw: Math.atan2(run.dx, run.dz), width, kind: 'street', jump: -1 });
    }
  }
  // farthest from those taken first: each candidate's distance to the nearest taken, kept as they are taken
  const out: BillboardSite[] = [...fixed];
  const near = new Float64Array(candidates.length).fill(Infinity);
  const take = (b: BillboardSite): void => { candidates.forEach((c, i) => { near[i] = Math.min(near[i] as number, Math.hypot(b.x - c.x, b.z - c.z)); }); };
  for (const b of [...taken, ...out]) take(b);
  while (out.length < BILLBOARDS.street) {
    let best = -1;
    for (let i = 0; i < candidates.length; i++) if (best < 0 || (near[i] as number) > (near[best] as number)) best = i;
    if (best < 0 || (near[best] as number) < APART / 3) break;
    const b = candidates[best] as BillboardSite;
    out.push(b);
    take(b);
  }
  return out;
}

/** The fifty as the collectibles read them: ids in order, each at its height (`heightAt`), painted in turn. */
export function billboardDescs(sites: readonly BillboardSite[], heightAt: (site: BillboardSite) => number): BillboardDesc[] {
  return sites.map((b, id) => ({
    id, x: b.x, z: b.z, yaw: b.yaw, width: b.width, height: BILLBOARD_HEIGHT, bottom: BILLBOARD_BOTTOM,
    paint: PAINTS[id % PAINTS.length] as number, y: heightAt(b),
  }));
}
