/**
 * The districts' own streets (M8.10 slice 5, docs/M8.10_PLAN.md), each district by its rule, all joined to the roads:
 * Crown Heights a grid over the hill (90 m), round the summit's plaza, cut by Crown Avenue, stopped where the hill runs
 * too steep; Sunset Works yards of 180 × 150 m on the level crossings' lines, the quay's road along the basin's end;
 * Palm Gardens crescents round the botanic garden linked by radial streets; Coral Quay a 120 m grid by the bay, the
 * stadium's block left whole. A candidate line is kept where its district, the land and the places allow it, runs on to
 * the road it meets (a T), and loses any tail that meets nothing: no street ends in a field. Plan-time: it allocates,
 * built once.
 */
import { NearIndex, catmullRom, circle, inPolygon, resample, type P2 } from './geom';
import { BASIN, BAY, GARDEN, PLACES, RINGS, ROADS, SUMMIT, coastline, districtOf, highwayLoop, naturalHeight, onLand, type DistrictId, type PlanRoad, type RoadClass } from './plan';

/** Candidates are sampled this often (m); a kept run shorter than `MIN_RUN` goes; an end runs on up to `REACH` to meet a road. */
const SAMPLE = 6;
const MIN_RUN = 40;
const REACH = 45;
/** A street keeps this far off a main road's centre (its half width plus this), off the coast, off the highway (m). */
const ROAD_GAP = 20;
const COAST_GAP = 28;
const HIGHWAY_GAP = 36;
/** Crown's streets stop where the hill runs steeper than this (rise over run, on the natural ground). */
const STEEPEST = 0.2;
/** The streets' classes: Crown's steep and narrow, the rest side streets held to 8 %. */
const CLASS: Readonly<Record<DistrictId, RoadClass>> = { crown: 'street', foundry: 'side', gardens: 'side', marina: 'side' };
/** The main roads' half widths as the plan's classes give them (ground.ts's, without importing it). */
const HALF: Readonly<Record<RoadClass, number>> = { highway: 19, avenue: 12, street: 9, serpentine: 7, dirt: 5, taxiway: 12, ramp: 7, side: 8 };

const W = (pts: ReadonlyArray<readonly [number, number]>): P2[] => pts.map(([x, z]) => [-x, -z] as P2);

export interface Streets { roads: PlanRoad[]; junctions: P2[] }

/** Each district's length of street (km), as the rules above lay them: the pins hold them within a fifth. */
export const STREET_KM: Readonly<Record<DistrictId, number>> = { crown: 5.1, foundry: 3.4, gardens: 3.6, marina: 2.2 };

let cache: Streets | null = null;
/** The districts' streets and every point where one meets a road or another street. */
export function districtStreets(): Streets {
  return (cache ??= build());
}

/** Each district's candidate lines, in world axes (drawn in the sketch's, north up). */
function candidates(): Array<{ district: DistrictId; pts: P2[] }> {
  const out: Array<{ district: DistrictId; pts: P2[] }> = [];
  const line = (district: DistrictId, a: readonly [number, number], b: readonly [number, number]): void => { out.push({ district, pts: resample(W([a, b]), SAMPLE) }); };
  for (const x of [-110, -200, -290, -380, -470, -560, -650, -740]) line('crown', [x, -40], [x, -800]);
  for (const z of [-140, -230, -320, -410, -500, -590, -680]) line('crown', [-40, z], [-900, z]);
  // (slice 9: none along the dry canal nor across it at the airfield's dip, the quay's road clear of the basin's cranes;
  // the streets run on across the railway, its level crossings)
  for (const x of [100, 280, 460, 640]) line('foundry', [x, -40], [x, -760]);
  for (const z of [-120, -210, -420, -540]) line('foundry', [40, z], [900, z]);
  for (const x of [100, 220, 340, 460, 580, 700]) line('marina', [x, 0], [x, 760]);
  for (const z of [60, 180, 300, 420]) line('marina', [60, z], [880, z]);
  // the Gardens: two crescents round the botanic garden, radials out from its parkway
  for (const r of [255, 340]) out.push({ district: 'gardens', pts: [...circle(GARDEN.x, GARDEN.z, r, Math.round((2 * Math.PI * r) / SAMPLE)), circle(GARDEN.x, GARDEN.z, r, 4)[0] as P2] });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * 2 * Math.PI + 0.2;
    out.push({ district: 'gardens', pts: resample([[GARDEN.x + Math.cos(a) * 175, GARDEN.z + Math.sin(a) * 175], [GARDEN.x + Math.cos(a) * 430, GARDEN.z + Math.sin(a) * 430]], SAMPLE) });
  }
  return out;
}

/** The main roads' centrelines (the highway's apart: no street meets it) with their half widths. */
function mainLines(): { roads: Array<{ pts: P2[]; half: number }>; highway: P2[] } {
  const roads: Array<{ pts: P2[]; half: number }> = ROADS.map((r) => ({ pts: r.smooth ? catmullRom(r.points, false, SAMPLE) : resample(r.points, SAMPLE), half: HALF[r.cls] }));
  for (const g of RINGS) roads.push({ pts: [...circle(g.x, g.z, g.r, 64), circle(g.x, g.z, g.r, 4)[0] as P2], half: HALF[g.cls] });
  const loop = highwayLoop(SAMPLE).pts;
  return { roads, highway: [...loop, loop[0] as P2] };
}

/** Where segment a–b crosses c–d, as the fraction along a–b, or null. */
function crossing(a: P2, b: P2, c: P2, d: P2): number | null {
  const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1], den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

function build(): Streets {
  const main = mainLines(), coast = coastline();
  const quarry = PLACES.quarry, golf = PLACES.golf;
  const inRect = (x: number, z: number, r: { x0: number; z0: number; x1: number; z1: number }, m: number): boolean => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
  // what a street keeps clear of, by its distance: the coast, the highway, the main roads, the quarry's and the bay's
  // edges (listed by cell: a candidate's every point asks)
  const clear = new NearIndex([
    { pts: coast, reach: COAST_GAP }, { pts: main.highway, reach: HIGHWAY_GAP },
    ...main.roads.map((r) => ({ pts: r.pts, reach: r.half + ROAD_GAP })),
    { pts: [...quarry, quarry[0] as P2], reach: 15 }, { pts: [...BAY, BAY[0] as P2], reach: 25 },
  ], 64);
  const keep = (district: DistrictId, x: number, z: number): boolean => {
    if (districtOf(x, z) !== district || !onLand(x, z)) return false;
    if (clear.near(x, z)) return false;
    if (Math.hypot(x - SUMMIT.x, z - SUMMIT.z) < 100 || Math.hypot(x - GARDEN.x, z - GARDEN.z) < 190) return false;
    if (inPolygon(x, z, quarry)) return false;
    if (inPolygon(x, z, golf) || inPolygon(x, z, BAY)) return false;
    if (inRect(x, z, BASIN, 12) || PLACES.containerYards.some((r) => inRect(x, z, r, 8))) return false;
    if (inRect(x, z, { x0: PLACES.hotel.x - PLACES.hotel.hx, x1: PLACES.hotel.x + PLACES.hotel.hx, z0: PLACES.hotel.z - PLACES.hotel.hz, z1: PLACES.hotel.z + PLACES.hotel.hz }, 6)) return false;
    const st = PLACES.stadium;
    if (((x - st.x) / (st.rx + 18)) ** 2 + ((z - st.z) / (st.rz + 18)) ** 2 < 1) return false;
    if (Math.hypot(x - PLACES.waterworks.x, z - PLACES.waterworks.z) < 45) return false;
    if (district === 'crown') {
      const gx = (naturalHeight(x + 3, z) - naturalHeight(x - 3, z)) / 6, gz = (naturalHeight(x, z + 3) - naturalHeight(x, z - 3)) / 6;
      if (Math.hypot(gx, gz) > STEEPEST) return false;
    }
    return true;
  };
  // the kept runs of each candidate, and the candidate each came from (its line runs on past a run's ends)
  interface Run { district: DistrictId; pts: P2[]; line: P2[]; from: number; to: number }
  const runs: Run[] = [];
  for (const c of candidates()) {
    let start = -1;
    for (let i = 0; i <= c.pts.length; i++) {
      const p = c.pts[i];
      const ok = p !== undefined && keep(c.district, p[0], p[1]);
      if (ok && start < 0) start = i;
      if (!ok && start >= 0) {
        if ((i - start) * SAMPLE >= MIN_RUN) runs.push({ district: c.district, pts: c.pts.slice(start, i), line: c.pts, from: start, to: i - 1 });
        start = -1;
      }
    }
  }
  // each run's ends run on along its line to the first road or run they meet, within reach: a T there (a main road's
  // T anchors the street to the network)
  const anchors: P2[] = [];
  const meets = (a: P2, b: P2, self: Run): { p: P2; main: boolean } | null => {
    let best: { t: number; p: P2; main: boolean } | null = null;
    const test = (pts: readonly P2[], main: boolean): void => {
      for (let k = 0; k + 1 < pts.length; k++) {
        const t = crossing(a, b, pts[k] as P2, pts[k + 1] as P2);
        if (t !== null && (!best || t < best.t)) best = { t, p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], main };
      }
    };
    for (const r of main.roads) test(r.pts, true);
    for (const r of runs) if (r !== self) test(r.pts, false);
    return best;
  };
  const extend = (r: Run, atStart: boolean): void => {
    const end = atStart ? (r.pts[0] as P2) : (r.pts[r.pts.length - 1] as P2);
    const ahead = r.line[Math.max(0, Math.min(r.line.length - 1, atStart ? r.from - 1 : r.to + 1))] as P2;
    const dx = ahead[0] - end[0], dz = ahead[1] - end[1], l = Math.hypot(dx, dz);
    if (l < 1e-6) return;
    const hit = meets(end, [end[0] + (dx / l) * REACH, end[1] + (dz / l) * REACH], r);
    if (!hit) return;
    if (atStart) r.pts.unshift(hit.p); else r.pts.push(hit.p);
    if (hit.main) anchors.push(hit.p);
  };
  for (const r of runs) { extend(r, true); extend(r, false); }
  // the street graph: nodes where runs cross or end, edges the runs between them
  const nodes: P2[] = [];
  const node = (p: P2): number => {
    const k = nodes.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1);
    if (k >= 0) return k;
    nodes.push(p);
    return nodes.length - 1;
  };
  const marks = runs.map((r) => [{ f: 0, n: node(r.pts[0] as P2) }, { f: r.pts.length - 1, n: node(r.pts[r.pts.length - 1] as P2) }]);
  const EPS = 1e-6;
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
    const A = runs[i] as Run, B = runs[j] as Run;
    for (let p = 0; p + 1 < A.pts.length; p++) for (let q = 0; q + 1 < B.pts.length; q++) {
      const a = A.pts[p] as P2, b = A.pts[p + 1] as P2, c = B.pts[q] as P2, d = B.pts[q + 1] as P2;
      const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1], den = rx * sz - rz * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
      if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) continue;
      const n = node([a[0] + rx * t, a[1] + rz * t]);
      (marks[i] as Array<{ f: number; n: number }>).push({ f: p + Math.max(0, Math.min(1, t)), n });
      (marks[j] as Array<{ f: number; n: number }>).push({ f: q + Math.max(0, Math.min(1, u)), n });
    }
  }
  const anchored = new Set(anchors.map(node));
  interface Edge { run: number; f0: number; f1: number; a: number; b: number; alive: boolean }
  const edges: Edge[] = [];
  marks.forEach((m, run) => {
    const sorted = m.sort((p, q) => p.f - q.f).filter((p, k, all) => k === 0 || p.n !== (all[k - 1] as { n: number }).n);
    for (let k = 0; k + 1 < sorted.length; k++) {
      const p = sorted[k] as { f: number; n: number }, q = sorted[k + 1] as { f: number; n: number };
      if (q.f - p.f > 1e-3) edges.push({ run, f0: p.f, f1: q.f, a: p.n, b: q.n, alive: true });
    }
  });
  // a block the hill makes too steep for its class (its crossings' flats taken off its length) goes
  for (const e of edges) {
    const r = runs[e.run] as Run, a = nodes[e.a] as P2, b = nodes[e.b] as P2;
    let length = 0;
    for (let f = Math.floor(e.f0); f < Math.ceil(e.f1) && f + 1 < r.pts.length; f++) length += Math.hypot((r.pts[f + 1] as P2)[0] - (r.pts[f] as P2)[0], (r.pts[f + 1] as P2)[1] - (r.pts[f] as P2)[1]);
    const flats = (anchored.has(e.a) ? 0 : 12) + (anchored.has(e.b) ? 0 : 12);
    const grade = r.district === 'crown' ? 0.16 : 0.08;
    if (Math.abs(naturalHeight(a[0], a[1]) - naturalHeight(b[0], b[1])) > 0.9 * grade * Math.max(length - flats, 0.3 * length)) e.alive = false;
  }
  // a street's loose end goes, and whatever that leaves loose, until every end meets a road or another street
  for (let changed = true; changed;) {
    changed = false;
    const degree = new Map<number, number>();
    for (const e of edges) if (e.alive) { degree.set(e.a, (degree.get(e.a) ?? 0) + 1); degree.set(e.b, (degree.get(e.b) ?? 0) + 1); }
    for (const e of edges) {
      if (!e.alive) continue;
      if ((degree.get(e.a) === 1 && !anchored.has(e.a)) || (degree.get(e.b) === 1 && !anchored.has(e.b))) { e.alive = false; changed = true; }
    }
  }
  // each run's kept edges joined back into streets; the kept nodes are the junctions
  const junctions: P2[] = [];
  const kept = new Set<number>();
  const roads: PlanRoad[] = [];
  runs.forEach((r, run) => {
    const mine = edges.filter((e) => e.run === run && e.alive).sort((p, q) => p.f0 - q.f0);
    const at = (f: number): P2 => {
      const i = Math.min(r.pts.length - 2, Math.floor(f)), t = f - i, a = r.pts[i] as P2, b = r.pts[i + 1] as P2;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    let chain: Edge[] = [];
    const flush = (): void => {
      if (chain.length === 0) return;
      const f0 = (chain[0] as Edge).f0, f1 = (chain[chain.length - 1] as Edge).f1;
      const pts: P2[] = [at(f0), ...r.pts.slice(Math.floor(f0) + 1, Math.ceil(f1)), at(f1)];
      for (const e of chain) { kept.add(e.a); kept.add(e.b); }
      roads.push({ id: `${r.district}-street-${roads.length}`, cls: CLASS[r.district], points: pts, smooth: false, span: 'ground' });
      chain = [];
    };
    for (const e of mine) {
      if (chain.length > 0 && (chain[chain.length - 1] as Edge).b !== e.a) flush();
      chain.push(e);
    }
    flush();
  });
  for (const k of kept) junctions.push(nodes[k] as P2);
  return { roads, junctions };
}
