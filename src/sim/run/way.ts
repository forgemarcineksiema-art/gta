/**
 * The way (docs/M8.7_PLAN.md D1–D2; DESIGN.md §20.3 rules 2–3): the goal the line names, and the route to it.
 *
 * - The goal is `goalFor`'s, with this as its chooser: where it picks a ring or a door, the pick holds. It is read
 *   again every `repick` s against the road distances of a forward pass from the car's lane, and let go only when
 *   it closes, when the goal changes kind, or when another is under `switchShare` of its distance and `switchGain`
 *   m nearer (D1).
 * - The route is the road's (D2): a reverse pass from the goal's lanes gives every lane its metres from its start
 *   to the goal and the lane to take next (the field), so from any lane the way on is read, not searched. It is
 *   laid when the goal changes, and again when a goal that moves has moved `moveReplan` m and `movingReplan` s
 *   have passed.
 * - The route's points (the car, the lanes' points along the field at least `pointGap` m apart, the goal) and its
 *   length are rebuilt every `routeEvery` s. `serial` bumps when the goal changes or the car leaves the route, for
 *   the radar's draw-in.
 *
 * Both passes are the plain O(n²) Dijkstra over the directed lanes (a few hundred; the U-turn links included) into
 * arrays made once. No allocation per step.
 */
import { BALANCE } from '../balance';
import type { JobDef, JobKind } from '../jobs/catalog';
import type { RoadGraph, RoadPoint } from '../city/roads';
import type { SimWorld } from '../SimWorld';
import type { LanePose, LaneProjection, LaneTables } from '../traffic/lanes';
import { copyGoal, goalFor, newGoal, type Goal, type GoalChooser } from './goal';

/** Lanes a ring, a door or a point is reached from, at most. */
const REACH_LANES = 8;
/** The route's points, at most. */
const MAX_POINTS = 512;
/** The route's lanes kept for "the car left it", at most. */
const MAX_ROUTE_LANES = 96;
/** Metres over or under the car a lane may run and still be its lane (the highway's overpasses). */
const LANE_HEIGHT = 5;
/** Metres the lane the car was on may be farther than the nearest and stay its lane (where lanes meet at a junction). */
const LANE_KEEP = 2;
/** Metres the nearest lane running the car's way may be farther than the nearest of all and still be its lane. */
const FACING_SLACK = 8;

/** The lanes a place is reached from: the lane, the metres along it, and the metres from there to the place. */
export interface Reach { lanes: Int32Array; s: Float64Array; leg: Float64Array; count: number }

function newReach(): Reach {
  return { lanes: new Int32Array(REACH_LANES), s: new Float64Array(REACH_LANES), leg: new Float64Array(REACH_LANES), count: 0 };
}

export class Way implements GoalChooser {
  /** What the line names and the route leads to. Read-only outside. */
  readonly goal: Goal = newGoal();
  /** The route's points, x and z interleaved, from the car to the goal; the first `count` of them. */
  readonly points = new Float32Array(MAX_POINTS * 2);
  count = 0;
  /** Metres by road from the car to the goal; NaN without a route. */
  length = NaN;
  /** Bumps when the goal changes or the car leaves the route (the radar draws the line in again). */
  serial = 0;
  /** The car's lane (-1 with no road near) and the metres along it. */
  carLane = -1;
  carS = 0;
  /** The field (read-only outside): metres from each lane's start to the goal, and the lane to take next (-1: none). */
  readonly fieldDistance: Float64Array;
  readonly fieldNext: Int32Array;
  /** Where the field was last laid (the goal's point then). */
  laidX = 0;
  laidZ = 0;

  private readonly n: number;
  private readonly len: Float32Array;
  private readonly lanePoints: ReadonlyArray<ReadonlyArray<RoadPoint>>;
  /** Per lane, its links out (`outTo`, the junction's metres `outConn`) and in (`inFrom`, `inConn`), by range. */
  private readonly outStart: Int32Array;
  private readonly outTo: Int32Array;
  private readonly outConn: Float32Array;
  private readonly inStart: Int32Array;
  private readonly inFrom: Int32Array;
  private readonly inConn: Float32Array;
  /** Per lane: min x, max x, min z, max z. */
  private readonly bounds: Float32Array;
  /** The forward pass: metres from the car to each lane's end; the car's own lane's start, reached round a loop. */
  private readonly fwd: Float64Array;
  private readonly fwdDone: Uint8Array;
  private carLoop = Infinity;
  private carDist = 0;
  /** The field's work and its goal lanes: the metres along each, and to the goal from its start through it. */
  private readonly revDone: Uint8Array;
  private readonly seedS: Float64Array;
  private readonly seedLeg: Float64Array;
  private readonly seedTotal: Float64Array;
  private fieldReady = false;
  private fieldAge = 0;
  /** Each placed def's reach by id, each door's, and a moving or one-off point's. */
  private readonly ringReach = new Map<number, Reach>();
  private readonly doorReach: Reach[];
  private readonly pointReach = newReach();
  /** The held pick: a def's id or a door's index, and the ring kind it was picked for ('door' for a door). */
  private heldId = -1;
  private heldDoor = -1;
  private heldFor = '';
  /** The road distances were read this step: the pick may move. */
  private fresh = false;
  private repickLeft = 0;
  private routeLeft = 0;
  /** The jobs' state last step: a running job's goal moves when it does (an order's car taken: on to the fence). */
  private phase = '';
  private readonly routeLanes = new Int32Array(MAX_ROUTE_LANES);
  private routeLaneCount = 0;
  private readonly next = newGoal();
  private readonly proj: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
  private readonly pose: LanePose = { x: 0, z: 0, yaw: 0 };

  constructor(private readonly sim: SimWorld, graph: RoadGraph, private readonly lanes: LaneTables) {
    const n = (this.n = lanes.laneCount);
    this.len = lanes.length;
    this.lanePoints = graph.lanes.map((lane) => lane.points);
    let links = 0;
    for (const lane of graph.lanes) links += lane.next.length;
    this.outStart = new Int32Array(n + 1);
    this.outTo = new Int32Array(links);
    this.outConn = new Float32Array(links);
    const ins = new Int32Array(n);
    let e = 0;
    for (let u = 0; u < n; u++) {
      this.outStart[u] = e;
      for (const v of graph.lanes[u]?.next ?? []) {
        this.outTo[e] = v;
        this.outConn[e] = lanes.connectionLength(u, v);
        ins[v] = (ins[v] as number) + 1;
        e++;
      }
    }
    this.outStart[n] = e;
    this.inStart = new Int32Array(n + 1);
    for (let v = 0; v < n; v++) this.inStart[v + 1] = (this.inStart[v] as number) + (ins[v] as number);
    this.inFrom = new Int32Array(links);
    this.inConn = new Float32Array(links);
    ins.fill(0);
    for (let u = 0; u < n; u++) {
      for (let k = this.outStart[u] as number; k < (this.outStart[u + 1] as number); k++) {
        const v = this.outTo[k] as number;
        const at = (this.inStart[v] as number) + (ins[v] as number);
        ins[v] = (ins[v] as number) + 1;
        this.inFrom[at] = u;
        this.inConn[at] = this.outConn[k] as number;
      }
    }
    this.bounds = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of this.lanePoints[i] ?? []) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
      }
      this.bounds.set([minX, maxX, minZ, maxZ], i * 4);
    }
    this.fwd = new Float64Array(n);
    this.fwdDone = new Uint8Array(n);
    this.fieldDistance = new Float64Array(n).fill(Infinity);
    this.fieldNext = new Int32Array(n).fill(-1);
    this.revDone = new Uint8Array(n);
    this.seedS = new Float64Array(n);
    this.seedLeg = new Float64Array(n);
    this.seedTotal = new Float64Array(n);
    for (const d of sim.jobs.defs) {
      const r = newReach();
      this.reachOf(d.x, d.z, r);
      this.ringReach.set(d.id, r);
    }
    this.doorReach = sim.run.dropOffs.map((site) => {
      const r = newReach();
      if (site.approachLane >= 0) {
        // the street the door opens on, the way the garage is driven into
        lanes.project(site.approachLane, site.door.x, site.door.z, this.proj);
        r.lanes[0] = site.approachLane;
        r.s[0] = this.proj.s;
        r.leg[0] = this.proj.dist;
        r.count = 1;
      } else {
        this.reachOf(site.door.x, site.door.z, r);
      }
      return r;
    });
  }

  step(dt: number): void {
    const w = BALANCE.way;
    this.routeLeft -= dt;
    this.repickLeft -= dt;
    this.fieldAge += dt;
    let located = false;
    if (this.routeLeft <= 0) {
      this.routeLeft += w.routeEvery;
      this.locateCar();
      located = true;
    }
    this.fresh = false;
    if (this.repickLeft <= 0) {
      this.repickLeft += w.repick;
      if (!located) this.locateCar();
      located = true;
      this.forward();
      this.fresh = true;
    }
    const next = this.next, goal = this.goal;
    goalFor(this.sim, next, this);
    if (next.kind !== goal.kind) {
      // a goal of another kind picks afresh: nothing held from the last one
      this.heldId = -1;
      this.heldDoor = -1;
      this.heldFor = '';
      goalFor(this.sim, next, this);
    }
    const phase = this.sim.jobs.state;
    const changed = next.kind !== goal.kind || next.id !== goal.id || next.door !== goal.door || next.hasTarget !== goal.hasTarget
      || (next.kind === 'job' && phase !== this.phase);
    this.phase = phase;
    copyGoal(next, goal);
    let laid = false;
    if (changed) {
      this.serial++;
      this.routeLaneCount = 0;
      laid = this.layField();
    } else if (goal.hasTarget && this.fieldAge >= w.movingReplan && (goal.x - this.laidX) ** 2 + (goal.z - this.laidZ) ** 2 > w.moveReplan ** 2) {
      laid = this.layField();
    }
    if (located || laid) {
      if (!located) this.locateCar();
      this.build(!changed);
    }
  }

  /** Lets the held pick go: the next step picks afresh by road. */
  release(): void {
    this.heldId = -1;
    this.heldDoor = -1;
    this.heldFor = '';
    this.repickLeft = 0;
  }

  /** The road metres from the car to a placed ring, by the last forward pass (Infinity when no road reaches it). */
  ringDistance(id: number): number {
    const r = this.ringReach.get(id);
    return r ? this.reachDistance(r) : Infinity;
  }

  /** The lanes a placed ring is reached from (read-only), or undefined for a def placed after the way. */
  reachOfRing(id: number): Readonly<Reach> | undefined {
    return this.ringReach.get(id);
  }

  // ---- the chooser (goalFor's ring and door) ----

  ring(sim: SimWorld, kind: JobKind | '', out: Goal): boolean {
    const jobs = sim.jobs, defs = jobs.defs;
    let held = -1;
    if (this.heldId >= 0 && this.heldFor === kind) {
      for (let i = 0; i < defs.length; i++) {
        const d = defs[i] as JobDef;
        if (d.id !== this.heldId) continue;
        if (jobs.live(d) && (kind === '' || d.kind === kind)) held = i;
        break;
      }
    }
    if (held >= 0 && !this.fresh) return writeRing(defs[held] as JobDef, out);
    const p = sim.probe;
    let best = -1, bestD = Infinity, heldD = Infinity, near = -1, nearD = Infinity;
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i] as JobDef;
      if (d.kind === 'fare' || !jobs.live(d) || (kind !== '' && d.kind !== kind)) continue;
      const line = (d.x - p.x) ** 2 + (d.z - p.z) ** 2;
      if (line < nearD) { nearD = line; near = i; }
      const road = this.ringDistance(d.id);
      if (i === held) heldD = road;
      if (road < bestD) { bestD = road; best = i; }
    }
    // no road reaches one (the car far off every road): the straight line
    if (best < 0) best = near;
    if (best < 0) return false;
    const pick = held >= 0 && held !== best && !clearlyNearer(bestD, heldD) ? held : best;
    const d = defs[pick] as JobDef;
    this.heldId = d.id;
    this.heldDoor = -1;
    this.heldFor = kind;
    return writeRing(d, out);
  }

  door(sim: SimWorld, out: Goal): boolean {
    const doors = sim.run.dropOffs;
    if (doors.length === 0) return false;
    const held = this.heldFor === 'door' && this.heldDoor >= 0 && this.heldDoor < doors.length ? this.heldDoor : -1;
    if (held >= 0 && !this.fresh) return writeDoor(sim, held, out);
    const p = sim.probe;
    let best = -1, bestD = Infinity, heldD = Infinity, near = -1, nearD = Infinity;
    for (let i = 0; i < doors.length; i++) {
      const door = doors[i]?.door;
      if (!door) continue;
      const line = (door.x - p.x) ** 2 + (door.z - p.z) ** 2;
      if (line < nearD) { nearD = line; near = i; }
      const reach = this.doorReach[i];
      const road = reach ? this.reachDistance(reach) : Infinity;
      if (i === held) heldD = road;
      if (road < bestD) { bestD = road; best = i; }
    }
    if (best < 0) best = near;
    if (best < 0) return false;
    const pick = held >= 0 && held !== best && !clearlyNearer(bestD, heldD) ? held : best;
    this.heldId = -1;
    this.heldDoor = pick;
    this.heldFor = 'door';
    return writeDoor(sim, pick, out);
  }

  // ---- the car, the passes, the route ----

  /** The car's lane: the nearest running its way (within `FACING_SLACK` of the nearest of all), kept at a junction. */
  private locateCar(): void {
    const p = this.sim.probe;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const prev = this.carLane;
    let facing = -1, facingD = Infinity, facingS = 0;
    let any = -1, anyD = Infinity, anyS = 0;
    let keepD = Infinity, keepS = 0;
    for (let i = 0; i < this.n; i++) {
      if (i !== prev && this.boxDistance(i, p.x, p.z) > facingD) continue;
      this.lanes.project(i, p.x, p.z, this.proj);
      const pr = this.proj;
      if (Math.abs(this.lanes.heightAt(i, pr.s) - p.y) > LANE_HEIGHT) continue;
      const runs = Math.sin(pr.yaw) * fx + Math.cos(pr.yaw) * fz > 0;
      if (i === prev && runs) { keepD = pr.dist; keepS = pr.s; }
      if (pr.dist < anyD) { anyD = pr.dist; any = i; anyS = pr.s; }
      if (runs && pr.dist < facingD) { facingD = pr.dist; facing = i; facingS = pr.s; }
    }
    let lane = any, s = anyS, dist = anyD;
    if (facing >= 0 && facingD <= anyD + FACING_SLACK) { lane = facing; s = facingS; dist = facingD; }
    if (prev >= 0 && prev !== lane && keepD <= dist + LANE_KEEP) { lane = prev; s = keepS; dist = keepD; }
    this.carLane = lane;
    this.carS = s;
    this.carDist = lane >= 0 ? dist : 0;
  }

  /** Metres from the car to each lane's end, along the links. */
  private forward(): void {
    const n = this.n, fwd = this.fwd, done = this.fwdDone;
    fwd.fill(Infinity);
    done.fill(0);
    this.carLoop = Infinity;
    const c = this.carLane;
    if (c < 0) return;
    fwd[c] = (this.len[c] as number) - this.carS;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && (fwd[i] as number) < best) { best = fwd[i] as number; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (let e = this.outStart[u] as number; e < (this.outStart[u + 1] as number); e++) {
        const v = this.outTo[e] as number;
        const d = best + (this.outConn[e] as number) + (this.len[v] as number);
        if (d < (fwd[v] as number)) fwd[v] = d;
      }
    }
    for (let e = this.inStart[c] as number; e < (this.inStart[c + 1] as number); e++) {
      this.carLoop = Math.min(this.carLoop, (fwd[this.inFrom[e] as number] as number) + (this.inConn[e] as number));
    }
  }

  /** Metres by road from the car to `s` along `lane`. */
  private roadTo(lane: number, s: number): number {
    if (lane === this.carLane) return s >= this.carS ? s - this.carS : this.carLoop + s;
    return (this.fwd[lane] as number) - (this.len[lane] as number) + s;
  }

  private reachDistance(r: Reach): number {
    let best = Infinity;
    for (let k = 0; k < r.count; k++) best = Math.min(best, this.roadTo(r.lanes[k] as number, r.s[k] as number) + (r.leg[k] as number));
    return best;
  }

  /** Lays the field to the goal's lanes: a placed ring's, a door's, else the lanes near its point. */
  private layField(): boolean {
    const g = this.goal;
    this.fieldReady = false;
    this.fieldAge = 0;
    this.laidX = g.x;
    this.laidZ = g.z;
    if (!g.hasTarget) return false;
    let r: Reach | undefined;
    if (g.door >= 0) r = this.doorReach[g.door];
    else if (g.id >= 0 && g.kind !== 'job') r = this.ringReach.get(g.id);
    if (!r) {
      this.reachOf(g.x, g.z, this.pointReach);
      r = this.pointReach;
    }
    this.field(r);
    this.fieldReady = r.count > 0;
    return true;
  }

  /** The reverse pass: metres from every lane's start to the goal, and the lane to take next. */
  private field(r: Reach): void {
    const n = this.n, rev = this.fieldDistance, done = this.revDone, nextLane = this.fieldNext;
    rev.fill(Infinity);
    done.fill(0);
    nextLane.fill(-1);
    this.seedS.fill(NaN);
    this.seedLeg.fill(0);
    this.seedTotal.fill(Infinity);
    for (let k = 0; k < r.count; k++) {
      const lane = r.lanes[k] as number, total = (r.s[k] as number) + (r.leg[k] as number);
      if (total >= (this.seedTotal[lane] as number)) continue;
      this.seedTotal[lane] = total;
      this.seedS[lane] = r.s[k] as number;
      this.seedLeg[lane] = r.leg[k] as number;
      rev[lane] = total;
    }
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && (rev[i] as number) < best) { best = rev[i] as number; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (let e = this.inStart[u] as number; e < (this.inStart[u + 1] as number); e++) {
        const from = this.inFrom[e] as number;
        const d = best + (this.len[from] as number) + (this.inConn[e] as number);
        if (d < (rev[from] as number)) { rev[from] = d; nextLane[from] = u; }
      }
    }
  }

  /** The route's points and length from the car along the field; `watch`: count leaving the last route. */
  private build(watch: boolean): void {
    const c = this.carLane;
    if (watch && this.routeLaneCount > 0 && c >= 0) {
      let on = false;
      for (let i = 0; i < this.routeLaneCount; i++) if (this.routeLanes[i] === c) { on = true; break; }
      if (!on) this.serial++;
    }
    this.count = 0;
    this.length = NaN;
    this.routeLaneCount = 0;
    const g = this.goal;
    if (!g.hasTarget || !this.fieldReady || c < 0) return;
    const rev = this.fieldDistance, len = this.len;
    // off the car's lane by the link the field likes best, or straight on to the goal when it is ahead on it
    let v = -1, through = Infinity;
    for (let e = this.outStart[c] as number; e < (this.outStart[c + 1] as number); e++) {
      const to = this.outTo[e] as number, d = (this.outConn[e] as number) + (rev[to] as number);
      if (d < through) { through = d; v = to; }
    }
    through += (len[c] as number) - this.carS;
    const sc = this.seedS[c] as number;
    const ahead = !Number.isNaN(sc) && sc >= this.carS ? sc - this.carS + (this.seedLeg[c] as number) : Infinity;
    if (ahead === Infinity && through === Infinity) return;
    const p = this.sim.probe;
    this.push(p.x, p.z);
    this.routeLanes[this.routeLaneCount++] = c;
    if (ahead <= through) {
      this.pushLane(c, this.carS, sc);
      this.length = this.carDist + ahead;
    } else {
      this.pushLane(c, this.carS, len[c] as number);
      this.length = this.carDist + through;
      let lane = v;
      for (let guard = 0; lane >= 0 && guard < this.n; guard++) {
        if (this.routeLaneCount < MAX_ROUTE_LANES) this.routeLanes[this.routeLaneCount++] = lane;
        const sg = this.seedS[lane] as number;
        if (!Number.isNaN(sg) && (rev[lane] as number) >= (this.seedTotal[lane] as number) - 1e-6) {
          this.pushLane(lane, 0, sg);
          break;
        }
        this.pushLane(lane, 0, len[lane] as number);
        lane = this.fieldNext[lane] as number;
      }
    }
    this.push(g.x, g.z);
  }

  /** A lane's points from `from` to `to` m along it, at least `pointGap` m apart. */
  private pushLane(lane: number, from: number, to: number): void {
    const gap = BALANCE.way.pointGap;
    this.lanes.positionAt(lane, from, 0, this.pose);
    this.push(this.pose.x, this.pose.z);
    const pts = this.lanePoints[lane] ?? [];
    let at = 0, last = from;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1] as RoadPoint, b = pts[k] as RoadPoint;
      at += Math.hypot(b.x - a.x, b.z - a.z);
      if (at >= to - gap) break;
      if (at > from && at - last >= gap) {
        this.push(b.x, b.z);
        last = at;
      }
    }
    this.lanes.positionAt(lane, to, 0, this.pose);
    this.push(this.pose.x, this.pose.z);
  }

  private push(x: number, z: number): void {
    if (this.count >= MAX_POINTS) return;
    this.points[this.count * 2] = x;
    this.points[this.count * 2 + 1] = z;
    this.count++;
  }

  /** The lanes within `reach` m of a point (the eight nearest), else the nearest one. */
  private reachOf(x: number, z: number, out: Reach): void {
    const reach = BALANCE.way.reach;
    out.count = 0;
    let nearest = -1, nearestD = Infinity, nearestS = 0;
    for (let i = 0; i < this.n; i++) {
      const box = this.boxDistance(i, x, z);
      if (box > reach && box > nearestD) continue;
      this.lanes.project(i, x, z, this.proj);
      const d = this.proj.dist;
      if (d < nearestD) { nearestD = d; nearest = i; nearestS = this.proj.s; }
      if (d > reach) continue;
      let slot = out.count;
      if (slot >= REACH_LANES) {
        // full: the farthest kept one goes, if this is nearer
        slot = 0;
        for (let k = 1; k < REACH_LANES; k++) if ((out.leg[k] as number) > (out.leg[slot] as number)) slot = k;
        if (d >= (out.leg[slot] as number)) continue;
      } else {
        out.count++;
      }
      out.lanes[slot] = i;
      out.s[slot] = this.proj.s;
      out.leg[slot] = d;
    }
    if (out.count === 0 && nearest >= 0) {
      out.lanes[0] = nearest;
      out.s[0] = nearestS;
      out.leg[0] = nearestD;
      out.count = 1;
    }
  }

  private boxDistance(i: number, x: number, z: number): number {
    const b = this.bounds, k = i * 4;
    const dx = Math.max((b[k] as number) - x, 0, x - (b[k + 1] as number));
    const dz = Math.max((b[k + 2] as number) - z, 0, z - (b[k + 3] as number));
    return Math.hypot(dx, dz);
  }
}

/** Another candidate is clearly nearer than the held one: under `switchShare` of its road distance and `switchGain` m less. */
function clearlyNearer(candidate: number, held: number): boolean {
  const w = BALANCE.way;
  return candidate < w.switchShare * held && candidate <= held - w.switchGain;
}

function writeRing(d: JobDef, out: Goal): boolean {
  out.x = d.x;
  out.z = d.z;
  out.ring = d.kind;
  out.id = d.id;
  out.door = -1;
  return true;
}

function writeDoor(sim: SimWorld, i: number, out: Goal): boolean {
  const door = sim.run.dropOffs[i]?.door;
  if (!door) return false;
  out.x = door.x;
  out.z = door.z;
  out.ring = '';
  out.id = -1;
  out.door = i;
  return true;
}
