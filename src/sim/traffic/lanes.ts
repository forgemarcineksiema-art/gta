/**
 * Lane length tables and cached junction curves for traffic.
 * Built once from the road graph. Connection samples are cached on first use.
 */
import type { Lane, RoadGraph, RoadPoint } from '../city/roads';
import type { RoadKind } from './bodies';
import type { TrafficTuning } from './tuning';

const SAMPLES = 24;
/** Bezier handle length as a fraction of the endpoint gap (0.55 of the radius approximates a circular arc), capped. */
const HANDLE_RATIO = 0.42;
const HANDLE_MAX = 24;
const TURN_RAD = 15 * Math.PI / 180;

export interface LanePose {
  x: number;
  z: number;
  yaw: number;
  /** The road's height there (the highway's overpasses; M5.5 slice 8) and its rise per metre along: 0 on the flat. */
  y?: number;
  grade?: number;
}

export interface LaneProjection extends LanePose {
  s: number;
  lateral: number;
  /** Distance from the point to the polyline, m. */
  dist: number;
}

/** Projection onto a lane and its chosen connection; `switched` means the point is already on `next`. */
export interface PathProjection extends LaneProjection {
  switched: boolean;
}

/** A lane's road heights on the island are read every this far along it or less (m): the drawn surface's give. */
const Y_STEP = 2;
/** Two junction movements conflict when their curves come within this distance, m. */
const CONFLICT_DISTANCE = 5;

interface Connection {
  /** x, z pairs, SAMPLES + 1 points from the lane end to the next lane start. */
  pts: Float32Array;
  /** The road's height at the lane's end and at the next one's start (the grid's 0; the island's hills). */
  y0: number;
  y1: number;
  /** The road's surface under each of its points (the island's, `roadAt`, worked out when first read), or null (the grid's: from `y0` to `y1`). */
  ys: Float32Array | null;
  cum: Float32Array;
  length: number;
}

export class LaneTables {
  readonly laneCount: number;
  private readonly graph: RoadGraph;
  private readonly cumStart: Int32Array;
  private readonly cum: Float32Array;
  private readonly pointCount: Int16Array;
  readonly length: Float32Array;
  readonly limit: Float32Array;
  /** Metres right of the road centreline the lane was built at (`Lane.offset`). */
  readonly offset: Float32Array;
  readonly toNode: Int16Array;
  readonly midX: Float32Array;
  readonly midZ: Float32Array;
  private readonly uturnOf: Int16Array;
  private readonly connections = new Map<number, Connection>();
  private readonly conflictCache = new Map<number, boolean>();
  private readonly scratch: LanePose = { x: 0, z: 0, yaw: 0 };
  /**
   * Each lane's road heights on its line every `Y_STEP` m or less (the island's drawn surface, `roadAt`, worked out when
   * the lane is first read), or null: the grid's lanes and the highway's (its decks and tunnel off the ground) keep their
   * points' heights.
   */
  private readonly ys: Array<Float32Array | null>;
  private readonly scratchProj: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };

  /**
   * `kindOf`: a lane's road's kind by the map (the island's classes), else the graph's own rule (the grid's roads).
   * `roadAt`: the road's surface across a junction (the island's hills), else straight from the one lane's height to
   * the other's (the grid's 0).
   */
  constructor(graph: RoadGraph, tuning: TrafficTuning, kindOf: (lane: Lane) => RoadKind | null = () => null, private readonly roadAt: ((x: number, z: number) => number) | null = null) {
    this.graph = graph;
    this.laneCount = graph.lanes.length;
    this.pointCount = new Int16Array(this.laneCount);
    this.length = new Float32Array(this.laneCount);
    this.limit = new Float32Array(this.laneCount);
    this.offset = new Float32Array(this.laneCount);
    this.toNode = new Int16Array(this.laneCount);
    this.midX = new Float32Array(this.laneCount);
    this.midZ = new Float32Array(this.laneCount);
    this.uturnOf = new Int16Array(this.laneCount);
    this.cumStart = new Int32Array(this.laneCount);
    this.ys = new Array<Float32Array | null>(this.laneCount).fill(null);
    let points = 0;
    for (let i = 0; i < this.laneCount; i++) points += (graph.lanes[i] as Lane).points.length;
    this.cum = new Float32Array(points);
    let cursor = 0;
    for (let i = 0; i < this.laneCount; i++) {
      const lane = graph.lanes[i] as Lane;
      this.cumStart[i] = cursor;
      this.pointCount[i] = lane.points.length;
      const base = cursor;
      this.cum[base] = 0;
      for (let p = 1; p < lane.points.length; p++) {
        const a = lane.points[p - 1] as RoadPoint;
        const b = lane.points[p] as RoadPoint;
        this.cum[base + p] = (this.cum[base + p - 1] as number) + Math.hypot(b.x - a.x, b.z - a.z);
      }
      this.length[i] = this.cum[base + lane.points.length - 1] as number;
      const kind = kindOf(lane);
      this.limit[i] = kind ? KIND_LIMIT[kind](tuning) : limitFor(lane, graph, tuning);
      this.offset[i] = lane.offset;
      this.toNode[i] = lane.to;
      this.sample(i, (this.length[i] as number) * 0.5, 0, this.scratch);
      this.midX[i] = this.scratch.x;
      this.midZ[i] = this.scratch.z;
      this.uturnOf[i] = findUturn(lane, graph);
      cursor += lane.points.length;
    }
  }

  uturn(lane: number): number {
    return this.uturnOf[lane] as number;
  }

  outs(lane: number): readonly number[] {
    return (this.graph.lanes[lane] as Lane).next;
  }

  /** Absolute heading change from this lane's end to the next lane's start, radians. */
  headingChange(lane: number, next: number): number {
    const a = this.graph.lanes[lane] as Lane;
    const b = this.graph.lanes[next] as Lane;
    const d = b.yaw0 - a.yaw;
    return Math.atan2(Math.sin(d), Math.cos(d));
  }

  straightThrough(lane: number, next: number): boolean {
    return Math.abs(this.headingChange(lane, next)) < TURN_RAD;
  }

  /** Length of the junction curve for an agent driving `offset` metres right of the lane (inside turns are shorter). */
  connectionLength(lane: number, next: number, offset = 0): number {
    return this.connection(lane, next, offset).length;
  }

  /**
   * Pose at distance `s` along the lane, then along the connection to `next`
   * once `s` passes the lane length. `offset` is metres to the right of the
   * graph lane (the lane polyline is already offset from the centreline).
   */
  positionAt(lane: number, s: number, offset: number, out: LanePose, next = -1): void {
    const len = this.length[lane] as number;
    if (next < 0 || s <= len) {
      this.sample(lane, Math.max(0, Math.min(s, len)), offset, out);
      return;
    }
    const conn = this.connection(lane, next, offset);
    const cs = s - len;
    if (cs >= conn.length) {
      const over = cs - conn.length;
      const nlen = this.length[next] as number;
      this.sample(next, Math.max(0, Math.min(over, nlen)), offset, out);
      return;
    }
    this.sampleConnection(conn, cs, out);
  }

  /**
   * Closest point on the lane polyline shifted `offset` metres to its right (the
   * path an agent with that lane offset actually drives). `lateral` is signed
   * metres to the right of that shifted path.
   */
  project(lane: number, x: number, z: number, out: LaneProjection, offset = 0): void {
    const lanePts = (this.graph.lanes[lane] as Lane).points;
    const base = this.cumStart[lane] as number;
    let best = Infinity;
    let bestS = 0;
    let bestX = 0;
    let bestZ = 0;
    let bestYaw = 0;
    let bestLat = 0;
    const n = this.pointCount[lane] as number;
    for (let i = 0; i + 1 < n; i++) {
      const a = lanePts[i] as RoadPoint;
      const b = lanePts[i + 1] as RoadPoint;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz || 1;
      const yaw = Math.atan2(dx, dz);
      // right is (-cos yaw, sin yaw)
      const ox = -Math.cos(yaw) * offset;
      const oz = Math.sin(yaw) * offset;
      const ax = a.x + ox;
      const az = a.z + oz;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      const px = ax + dx * t;
      const pz = az + dz * t;
      const ex = x - px;
      const ez = z - pz;
      const dist = ex * ex + ez * ez;
      if (dist < best) {
        best = dist;
        const seg = Math.sqrt(len2);
        bestS = (this.cum[base + i] as number) + seg * t;
        bestX = px;
        bestZ = pz;
        bestYaw = yaw;
        bestLat = ex * -Math.cos(yaw) + ez * Math.sin(yaw);
      }
    }
    out.x = bestX;
    out.z = bestZ;
    out.yaw = bestYaw;
    out.s = bestS;
    out.lateral = bestLat;
    out.dist = Math.sqrt(best);
  }

  /**
   * Project onto the lane and, when `next` is chosen, onto the connection curve
   * (then `s` runs past the lane length). Once the point has passed the end of
   * the connection onto `next`, `switched` is set and `s` is along `next`.
   */
  projectPath(lane: number, next: number, x: number, z: number, out: PathProjection, offset = 0): void {
    this.project(lane, x, z, out, offset);
    out.switched = false;
    if (next < 0) return;
    const conn = this.connection(lane, next, offset);
    let best = out.dist * out.dist;
    let bestS = -1;
    let bestX = 0;
    let bestZ = 0;
    let bestYaw = 0;
    let bestLat = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const ax = conn.pts[i * 2] as number;
      const az = conn.pts[i * 2 + 1] as number;
      const dx = (conn.pts[(i + 1) * 2] as number) - ax;
      const dz = (conn.pts[(i + 1) * 2 + 1] as number) - az;
      const len2 = dx * dx + dz * dz || 1;
      const yaw = Math.atan2(dx, dz);
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      const px = ax + dx * t;
      const pz = az + dz * t;
      const ex = x - px;
      const ez = z - pz;
      const d = ex * ex + ez * ez;
      if (d < best) {
        best = d;
        bestS = (conn.cum[i] as number) + Math.sqrt(len2) * t;
        bestX = px;
        bestZ = pz;
        bestYaw = yaw;
        bestLat = ex * -Math.cos(yaw) + ez * Math.sin(yaw);
      }
    }
    if (bestS < 0) return;
    out.s = (this.length[lane] as number) + bestS;
    out.x = bestX;
    out.z = bestZ;
    out.yaw = bestYaw;
    out.lateral = bestLat;
    out.dist = Math.sqrt(best);
    if (bestS < conn.length - 0.5) return;
    // At the end of the connection: the next lane starts here. Once the point
    // has progressed onto it, report the switch.
    const p = this.scratchProj;
    this.project(next, x, z, p, offset);
    if (p.s > 0.3 && p.dist <= out.dist + 0.1) {
      out.switched = true;
      out.s = p.s;
      out.x = p.x;
      out.z = p.z;
      out.yaw = p.yaw;
      out.lateral = p.lateral;
      out.dist = p.dist;
    }
  }

  /**
   * True when two junction movements can collide: their connection curves come
   * within CONFLICT_DISTANCE of each other. Movements from the same approach
   * lane never conflict: the follower stays behind its leader through the box
   * (the leader gap does that), so it need not wait for the box to clear.
   * Cached per pair.
   */
  conflicts(laneA: number, nextA: number, laneB: number, nextB: number): boolean {
    if (laneA === laneB) return false;
    const ka = laneA * 1024 + nextA;
    const kb = laneB * 1024 + nextB;
    const key = ka < kb ? ka * 262144 + kb : kb * 262144 + ka;
    const cached = this.conflictCache.get(key);
    if (cached !== undefined) return cached;
    const a = this.connection(laneA, nextA);
    const b = this.connection(laneB, nextB);
    const limit = CONFLICT_DISTANCE * CONFLICT_DISTANCE;
    let hit = false;
    for (let i = 0; i <= SAMPLES && !hit; i++) {
      const ax = a.pts[i * 2] as number;
      const az = a.pts[i * 2 + 1] as number;
      for (let j = 0; j <= SAMPLES; j++) {
        const dx = (b.pts[j * 2] as number) - ax;
        const dz = (b.pts[j * 2 + 1] as number) - az;
        if (dx * dx + dz * dz < limit) { hit = true; break; }
      }
    }
    this.conflictCache.set(key, hit);
    return hit;
  }

  private sample(lane: number, s: number, offset: number, out: LanePose): void {
    const lanePts = (this.graph.lanes[lane] as Lane).points;
    const base = this.cumStart[lane] as number;
    const n = this.pointCount[lane] as number;
    let seg = 0;
    for (let i = 0; i + 1 < n; i++) {
      if ((this.cum[base + i + 1] as number) >= s || i + 2 === n) { seg = i; break; }
    }
    const a = lanePts[seg] as RoadPoint;
    const b = lanePts[seg + 1] as RoadPoint;
    const c0 = this.cum[base + seg] as number;
    const c1 = this.cum[base + seg + 1] as number;
    const span = c1 - c0 || 1;
    const t = Math.max(0, Math.min(1, (s - c0) / span));
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    applyOffset(x, z, yaw, offset, out);
    const ys = this.roadAt && !(this.graph.lanes[lane] as Lane).highway ? this.heights(lane) : null;
    if (ys) {
      // on the island's drawn road: between its heights on the lane's line
      const step = (this.length[lane] as number) / (ys.length - 1) || 1;
      const u = Math.max(0, Math.min(ys.length - 1, s / step)), k = Math.min(ys.length - 2, Math.floor(u));
      const y0 = ys[k] as number, y1 = ys[k + 1] as number;
      out.y = y0 + (y1 - y0) * (u - k);
      out.grade = (y1 - y0) / step;
      return;
    }
    const ya = a.y ?? 0, yb = b.y ?? 0;
    out.y = ya + (yb - ya) * t;
    out.grade = (yb - ya) / span;
  }

  /** A lane's road heights on its line (`ys`), worked out the first time it is read. */
  private heights(lane: number): Float32Array {
    const known = this.ys[lane];
    if (known) return known;
    const lanePts = (this.graph.lanes[lane] as Lane).points, base = this.cumStart[lane] as number, count = this.pointCount[lane] as number;
    const len = this.length[lane] as number, n = Math.max(2, Math.ceil(len / Y_STEP) + 1), ys = new Float32Array(n);
    const roadAt = this.roadAt as (x: number, z: number) => number;
    let seg = 0;
    for (let k = 0; k < n; k++) {
      const s = (len * k) / (n - 1);
      while (seg + 2 < count && (this.cum[base + seg + 1] as number) < s) seg++;
      const a = lanePts[seg] as RoadPoint, b = lanePts[seg + 1] as RoadPoint;
      const c0 = this.cum[base + seg] as number, c1 = this.cum[base + seg + 1] as number;
      const t = Math.max(0, Math.min(1, (s - c0) / (c1 - c0 || 1)));
      ys[k] = roadAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    }
    this.ys[lane] = ys;
    return ys;
  }

  /** The road's height `s` m along a lane (its end's past its ends, on the junction curves: the grid's 0). */
  heightAt(lane: number, s: number): number {
    const len = this.length[lane] as number;
    this.sample(lane, Math.max(0, Math.min(len, s)), 0, this.scratch);
    return this.scratch.y ?? 0;
  }

  private sampleConnection(conn: Connection, s: number, out: LanePose): void {
    let seg = 0;
    for (let i = 0; i < SAMPLES; i++) {
      if ((conn.cum[i + 1] as number) >= s || i + 1 === SAMPLES) { seg = i; break; }
    }
    const c0 = conn.cum[seg] as number;
    const c1 = conn.cum[seg + 1] as number;
    const t = Math.max(0, Math.min(1, (s - c0) / (c1 - c0 || 1)));
    const x0 = conn.pts[seg * 2] as number;
    const z0 = conn.pts[seg * 2 + 1] as number;
    const x1 = conn.pts[(seg + 1) * 2] as number;
    const z1 = conn.pts[(seg + 1) * 2 + 1] as number;
    out.x = x0 + (x1 - x0) * t;
    out.z = z0 + (z1 - z0) * t;
    out.yaw = Math.atan2(x1 - x0, z1 - z0);
    // across the junction on its road's surface (the island's, under its points), else from the one lane's height to
    // the other's (the grid's flat at 0)
    const ys = this.roadAt ? this.connectionHeights(conn) : null;
    if (ys) {
      const y0 = ys[seg] as number, y1 = ys[seg + 1] as number;
      out.y = y0 + (y1 - y0) * t;
      out.grade = (y1 - y0) / (c1 - c0 || 1);
      return;
    }
    const f = conn.length > 0 ? Math.max(0, Math.min(1, s / conn.length)) : 0;
    out.y = conn.y0 + (conn.y1 - conn.y0) * f;
    out.grade = conn.length > 0 ? (conn.y1 - conn.y0) / conn.length : 0;
  }

  /**
   * The junction curve between the end of `lane` and the start of `next`, for a
   * path `offset` metres to the right of both. It is a fresh Bezier between the
   * offset endpoints (with the same tangents), never an offset of the centre
   * curve, so an inside offset on a tight corner cannot fold back on itself.
   */
  private connection(lane: number, next: number, offset = 0): Connection {
    const key = (lane * 1024 + next) * 1024 + 512 + Math.round(offset * 10);
    const cached = this.connections.get(key);
    if (cached) return cached;
    const a = this.graph.lanes[lane] as Lane;
    const b = this.graph.lanes[next] as Lane;
    const ax = a.x1 - Math.cos(a.yaw) * offset;
    const az = a.z1 + Math.sin(a.yaw) * offset;
    const bx = b.x0 - Math.cos(b.yaw0) * offset;
    const bz = b.z0 + Math.sin(b.yaw0) * offset;
    // Handles scale with the gap between the endpoints: fixed 24 m handles fold into a cusp on a corner whose
    // offset endpoints are 25 m apart (and loop outright on the inside of a tight turn).
    const handle = Math.min(HANDLE_MAX, HANDLE_RATIO * Math.hypot(bx - ax, bz - az));
    const cx0 = ax + Math.sin(a.yaw) * handle;
    const cz0 = az + Math.cos(a.yaw) * handle;
    const cx1 = bx - Math.sin(b.yaw0) * handle;
    const cz1 = bz - Math.cos(b.yaw0) * handle;
    const pts = new Float32Array((SAMPLES + 1) * 2);
    const cum = new Float32Array(SAMPLES + 1);
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const u = 1 - t;
      pts[i * 2] = u * u * u * ax + 3 * u * u * t * cx0 + 3 * u * t * t * cx1 + t * t * t * bx;
      pts[i * 2 + 1] = u * u * u * az + 3 * u * u * t * cz0 + 3 * u * t * t * cz1 + t * t * t * bz;
      if (i > 0) {
        const dx = (pts[i * 2] as number) - (pts[(i - 1) * 2] as number);
        const dz = (pts[i * 2 + 1] as number) - (pts[(i - 1) * 2 + 1] as number);
        cum[i] = (cum[i - 1] as number) + Math.hypot(dx, dz);
      }
    }
    // (the road's heights under it are read the first time a car is placed on it: a length alone needs none)
    const conn: Connection = { pts, cum, length: cum[SAMPLES] as number, y0: a.points[a.points.length - 1]?.y ?? 0, y1: b.points[0]?.y ?? 0, ys: null };
    this.connections.set(key, conn);
    return conn;
  }

  /** A junction curve's road heights under its points (the island's, `roadAt`), worked out the first time they are read. */
  private connectionHeights(conn: Connection): Float32Array {
    if (conn.ys) return conn.ys;
    const ys = new Float32Array(SAMPLES + 1), roadAt = this.roadAt as (x: number, z: number) => number;
    for (let i = 0; i <= SAMPLES; i++) ys[i] = roadAt(conn.pts[i * 2] as number, conn.pts[i * 2 + 1] as number);
    conn.ys = ys;
    return ys;
  }
}

/** Right of the heading: facing +Z, +offset moves toward -X. Same rule as the graph's lane offset. */
function applyOffset(x: number, z: number, yaw: number, offset: number, out: LanePose): void {
  out.x = x - Math.cos(yaw) * offset;
  out.z = z + Math.sin(yaw) * offset;
  out.yaw = yaw;
}

/** Each road kind's limit from the tuning. */
const KIND_LIMIT: Readonly<Record<RoadKind, (t: TrafficTuning) => number>> = {
  highway: (t) => t.speedHighway, avenue: (t) => t.speedAvenue, parkway: (t) => t.speedParkway,
  quay: (t) => t.speedQuay, service: (t) => t.speedService, street: (t) => t.speedStreet,
};

function limitFor(lane: Lane, graph: RoadGraph, tuning: TrafficTuning): number {
  if (lane.highway) return tuning.speedHighway;
  if (lane.special) {
    for (let i = 0; i < graph.special.length; i++) {
      const road = graph.special[i];
      if (road?.name !== lane.special) continue;
      if (road.kind === 'avenue') return tuning.speedAvenue;
      if (road.kind === 'parkway') return tuning.speedParkway;
      if (road.kind === 'quay') return tuning.speedQuay;
      if (road.kind === 'service') return tuning.speedService;
    }
  }
  return tuning.speedStreet;
}

function findUturn(lane: Lane, graph: RoadGraph): number {
  for (let i = 0; i < lane.next.length; i++) {
    const id = lane.next[i] as number;
    const next = graph.lanes[id];
    if (next && next.to === lane.from) return id;
  }
  return -1;
}
