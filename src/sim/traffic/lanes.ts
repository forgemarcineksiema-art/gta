/**
 * Lane length tables and cached junction curves for traffic.
 * Built once from the road graph. Connection samples are cached on first use.
 */
import type { Lane, RoadGraph, RoadPoint } from '../city/roads';
import type { TrafficTuning } from './tuning';

const SAMPLES = 24;
const TURN_RAD = 15 * Math.PI / 180;

export interface LanePose {
  x: number;
  z: number;
  yaw: number;
}

export interface LaneProjection extends LanePose {
  s: number;
  lateral: number;
}

interface Connection {
  /** x, z pairs, SAMPLES + 1 points from the lane end to the next lane start. */
  pts: Float32Array;
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
  readonly toNode: Int16Array;
  readonly midX: Float32Array;
  readonly midZ: Float32Array;
  private readonly uturnOf: Int16Array;
  private readonly connections = new Map<number, Connection>();
  private readonly scratch: LanePose = { x: 0, z: 0, yaw: 0 };

  constructor(graph: RoadGraph, tuning: TrafficTuning) {
    this.graph = graph;
    this.laneCount = graph.lanes.length;
    this.pointCount = new Int16Array(this.laneCount);
    this.length = new Float32Array(this.laneCount);
    this.limit = new Float32Array(this.laneCount);
    this.toNode = new Int16Array(this.laneCount);
    this.midX = new Float32Array(this.laneCount);
    this.midZ = new Float32Array(this.laneCount);
    this.uturnOf = new Int16Array(this.laneCount);
    this.cumStart = new Int32Array(this.laneCount);
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
      this.limit[i] = limitFor(lane, graph, tuning);
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

  connectionLength(lane: number, next: number): number {
    return this.connection(lane, next).length;
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
    const conn = this.connection(lane, next);
    const cs = s - len;
    if (cs >= conn.length) {
      const over = cs - conn.length;
      const nlen = this.length[next] as number;
      this.sample(next, Math.max(0, Math.min(over, nlen)), offset, out);
      return;
    }
    this.sampleConnection(conn, cs, offset, out);
  }

  /** Closest point on the lane polyline. `lateral` is signed metres to the right of the polyline. */
  project(lane: number, x: number, z: number, out: LaneProjection): void {
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
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const ex = x - px;
      const ez = z - pz;
      const dist = ex * ex + ez * ez;
      if (dist < best) {
        best = dist;
        const seg = Math.sqrt(len2);
        bestS = (this.cum[base + i] as number) + seg * t;
        bestX = px;
        bestZ = pz;
        bestYaw = Math.atan2(dx, dz);
        // right is (-cos yaw, sin yaw); lateral is the projection onto it
        bestLat = ex * -Math.cos(bestYaw) + ez * Math.sin(bestYaw);
      }
    }
    out.x = bestX;
    out.z = bestZ;
    out.yaw = bestYaw;
    out.s = bestS;
    out.lateral = bestLat;
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
  }

  private sampleConnection(conn: Connection, s: number, offset: number, out: LanePose): void {
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
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    applyOffset(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, yaw, offset, out);
  }

  private connection(lane: number, next: number): Connection {
    const key = lane * 1024 + next;
    const cached = this.connections.get(key);
    if (cached) return cached;
    const a = this.graph.lanes[lane] as Lane;
    const b = this.graph.lanes[next] as Lane;
    const cx0 = a.x1 + Math.sin(a.yaw) * 24;
    const cz0 = a.z1 + Math.cos(a.yaw) * 24;
    const cx1 = b.x0 - Math.sin(b.yaw0) * 24;
    const cz1 = b.z0 - Math.cos(b.yaw0) * 24;
    const pts = new Float32Array((SAMPLES + 1) * 2);
    const cum = new Float32Array(SAMPLES + 1);
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const u = 1 - t;
      pts[i * 2] = u * u * u * a.x1 + 3 * u * u * t * cx0 + 3 * u * t * t * cx1 + t * t * t * b.x0;
      pts[i * 2 + 1] = u * u * u * a.z1 + 3 * u * u * t * cz0 + 3 * u * t * t * cz1 + t * t * t * b.z0;
      if (i > 0) {
        const dx = (pts[i * 2] as number) - (pts[(i - 1) * 2] as number);
        const dz = (pts[i * 2 + 1] as number) - (pts[(i - 1) * 2 + 1] as number);
        cum[i] = (cum[i - 1] as number) + Math.hypot(dx, dz);
      }
    }
    const conn: Connection = { pts, cum, length: cum[SAMPLES] as number };
    this.connections.set(key, conn);
    return conn;
  }
}

/** Right of the heading: facing +Z, +offset moves toward -X. Same rule as the graph's lane offset. */
function applyOffset(x: number, z: number, yaw: number, offset: number, out: LanePose): void {
  out.x = x - Math.cos(yaw) * offset;
  out.z = z + Math.sin(yaw) * offset;
  out.yaw = yaw;
}

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
