/**
 * Sunset Works' places (M8.10 slice 9, docs/M8.10_PLAN.md): the port (three cranes on the basin's quay, the containers
 * stacked into a solid maze in both yards, the viaduct and the quays' bollards being the highway's and the coast's), the
 * dry canal's bridges (a deck under each road that crosses it, the road's own surface on top, railings along it; the
 * channel is the ground's, `shapes/works.ts`), the railway (the line, the yard's sidings, the two goods sheds, the four
 * level crossings with their barriers) and the freight train (kinematic, shuttling between the sheds, a pass every 90 s,
 * the barriers down 8 s ahead of it; a hit is a wall), the Waterworks and the scrapyard (the grid's, moved).
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { Architecture, CITY_COLORS } from '../../city/architecture';
import { DISTRICTS } from '../../city/City';
import { DROP_OFF_LOTS, GARAGE, hideoutStatics, type DropOff } from '../../city/cover';
import { GROUPS_SOLID } from '../../collision';
import { ACCENTS, ISLAND_COLORS, PALETTE } from '../../palette';
import { IDENTITY_QUAT, type Quat, type StaticDesc } from '../../scene';
import type { P2 } from '../geom';
import { HALF_WIDTH, type GradedRoad, type Ground } from '../ground';
import { PLACES, highwayLoop } from '../plan';
import { SCRAPYARD, WATERWORKS_PLAZA, canalBed } from '../shapes/works';
import { KERB, PAVEMENT } from '../surfaces';
import type { Place, PlaceContext } from './place';
import { portCrane, waterworks } from './worksKit';

/** A bridge's deck (m): its depth under the road, the railings' height, how far past the road's edge its slab reaches. */
export const BRIDGE = { depth: 0.8, railing: 1.1, margin: 0.3 } as const;
/**
 * The freight train (m, s): the line's height of ride over the ground, each unit's half width; its timetable's period (a
 * pass every half of it, each way in turn), top speed and acceleration; the barriers down `lead` s before it reaches a
 * crossing, `move` s to swing, up `after` s once it has cleared.
 */
export const TRAIN = { ride: 0.3, half: 1.55, period: 180, speed: 18, accel: 1.2, lead: 8, move: 3, after: 1 } as const;
/** The train's units from its west end: two locomotives and the flats between, each with a container. */
const CONSIST: ReadonlyArray<{ kind: 'loco' | 'flat'; length: number; height: number; colour: number }> = [
  { kind: 'loco', length: 13, height: 4.2, colour: ACCENTS.foundry },
  { kind: 'flat', length: 12, height: 3.9, colour: PALETTE.carOrange },
  { kind: 'flat', length: 12, height: 3.9, colour: PALETTE.carBlue },
  { kind: 'flat', length: 12, height: 3.9, colour: CITY_COLORS.brick },
  { kind: 'loco', length: 13, height: 4.2, colour: ACCENTS.foundry },
];
const COUPLING = 1;
/** A goods shed (m): its length along the line, its half width, its walls' height; the train stands inside. */
const SHED = { length: 76, half: 6, height: 7.5, door: 3.2 } as const;
/** The yard's sidings (world z) and their ends east of the crossing inside it (world x). */
const SIDINGS = { z: [489, 502], x0: -432, x1: -300 } as const;
/** A level crossing's barriers stand this far each way along the road from the outermost track (m). */
const BARRIER_OUT = 4.5;
/** The container maze (m): a cell's side (a container's length and a gap a car cannot take), the aisles between. */
const MAZE = { cell: 13.2, clear: 8, braid: 0.22 } as const;
const CONTAINER_COLOURS = [PALETTE.carOrange, PALETTE.carBlue, CITY_COLORS.brick, ACCENTS.foundry, PALETTE.carWhite, 0x8e5bb5, 0x3d9970] as const;

/** A pass's times a period either way (the barriers lower for the next period's first pass, rise from the last one's). */
const SHIFTS = [-TRAIN.period, 0, TRAIN.period] as const;

/** A unit of the train: its kind, size, place along the train (its middle from the train's), colour and body. */
export interface TrainUnit { kind: 'loco' | 'flat'; length: number; height: number; offset: number; colour: number; body: RAPIER.RigidBody }

/** A pass of the train over a crossing, in the timetable's period (s): its front reaching the road, its back clearing it. */
export interface Pass { from: number; to: number }
/**
 * A level crossing: where the road's centreline meets the line, the road's way across it and its half width (the
 * carriageway's), the barriers' distance each way from the line along the road, the train's passes; its barriers' state
 * (0 up, 1 down), and whether it is shut (lowering, down or rising: the traffic stops, slice 13).
 */
export interface LevelCrossing { road: string; x: number; z: number; ux: number; uz: number; half: number; out: number; y: number; passes: Pass[]; down: number; closed: boolean }

/** A bridge over the canal: its road, its deck's pieces (the road's top), the middle's deck and the canal's floor under it. */
export interface Bridge { road: string; x: number; z: number; top: number; underside: number; floor: number }

/** The freight line and its train: the timetable's clock, where its middle is now and a step ago, its speed. */
export class FreightTrain {
  readonly units: TrainUnit[] = [];
  /** The line: its height along x every metre from `x0`, the two sheds' parking places (the train's middle), its z. */
  readonly z: number;
  readonly x0: number;
  readonly heights: Float32Array;
  readonly west: number;
  readonly east: number;
  readonly length: number;
  /** The run between the sheds (m, s): its distance, the time to speed, the time at speed, the whole run. */
  readonly run: { d: number; ta: number; sa: number; tc: number; t: number };
  /** Seconds into the timetable (settable: the pins start it where they want it). */
  time = 0;
  x: number;
  prevX: number;
  speed = 0;
  private readonly at = { x: 0, y: 0, z: 0 };

  constructor(world: RAPIER.World, ground: Ground, line: readonly P2[], west: number, east: number) {
    this.z = (line[0] as P2)[1];
    const xs = line.map((p) => p[0]);
    this.x0 = Math.min(...xs) - 10;
    const n = Math.ceil(Math.max(...xs) + 10 - this.x0) + 1;
    this.heights = new Float32Array(n);
    for (let i = 0; i < n; i++) this.heights[i] = ground.surfaceHeight(this.x0 + i, this.z);
    this.west = west;
    this.east = east;
    this.length = CONSIST.reduce((s, u) => s + u.length, 0) + COUPLING * (CONSIST.length - 1);
    const d = Math.abs(west - east), ta = TRAIN.speed / TRAIN.accel, sa = (TRAIN.speed * ta) / 2, tc = (d - 2 * sa) / TRAIN.speed;
    this.run = { d, ta, sa, tc, t: 2 * ta + tc };
    // the units from the west end (the world's +X) eastward
    let along = this.length / 2;
    for (const u of CONSIST) {
      const offset = along - u.length / 2;
      along -= u.length + COUPLING;
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(west + offset, this.railAt(west + offset) + TRAIN.ride + u.height / 2, this.z));
      world.createCollider(RAPIER.ColliderDesc.cuboid(u.length / 2, u.height / 2, TRAIN.half).setCollisionGroups(GROUPS_SOLID).setFriction(0.8).setRestitution(0.2), body);
      this.units.push({ kind: u.kind, length: u.length, height: u.height, offset, colour: u.colour, body });
    }
    this.x = this.prevX = west;
  }

  /** The line's height (the ground's under its middle) at x. */
  railAt(x: number): number {
    const f = Math.max(0, Math.min(this.heights.length - 1.001, x - this.x0)), i = Math.floor(f);
    return (this.heights[i] as number) + ((this.heights[i + 1] as number) - (this.heights[i] as number)) * (f - i);
  }

  /** Distance covered `t` s into a run (m). */
  private covered(t: number): number {
    const r = this.run;
    if (t <= 0) return 0;
    if (t < r.ta) return 0.5 * TRAIN.accel * t * t;
    if (t < r.ta + r.tc) return r.sa + TRAIN.speed * (t - r.ta);
    if (t < r.t) return r.d - 0.5 * TRAIN.accel * (r.t - t) * (r.t - t);
    return r.d;
  }

  /** Where the train's middle is at `t` s into the timetable: out east, standing east, back west, standing west. */
  middleAt(t: number): number {
    const half = TRAIN.period / 2, phase = ((t % TRAIN.period) + TRAIN.period) % TRAIN.period, dir = Math.sign(this.east - this.west);
    return phase < half ? this.west + dir * this.covered(phase) : this.east - dir * this.covered(phase - half);
  }

  /** Advance the timetable a step and set the units' bodies where they go (no allocation). */
  step(dt: number): void {
    this.time += dt;
    this.prevX = this.x;
    this.x = this.middleAt(this.time);
    this.speed = dt > 0 ? Math.abs(this.x - this.prevX) / dt : 0;
    for (const u of this.units) {
      const ux = this.x + u.offset, at = this.at;
      at.x = ux;
      at.y = this.railAt(ux) + TRAIN.ride + u.height / 2;
      at.z = this.z;
      u.body.setNextKinematicTranslation(at);
    }
  }
}

/** Sunset Works' running part: the train and the crossings' barriers; the bridges and the scrapyard for the pins and slice 14. */
export interface WorksPlace extends Place {
  readonly id: 'works';
  readonly train: FreightTrain;
  readonly crossings: readonly LevelCrossing[];
  readonly bridges: readonly Bridge[];
  /** The scrapyard's garage (the grid's drop-off, moved): its door for slice 14's garages. */
  readonly scrapyard: DropOff;
}

/** Whether a place is the Works'. */
export function isWorks(p: Place): p is WorksPlace {
  return p.id === 'works';
}

export function worksPlaces(ctx: PlaceContext): Place[] {
  const { ground } = ctx;
  let seed = 0x9e3779b1;
  const rnd = (): number => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Statics built about the origin by `build`, then turned by `yaw`, set at (x, z) and raised onto `y`. */
  const put = (x: number, z: number, yaw: number, y: number, build: (kit: Architecture) => void): void => {
    const list = ctx.statics(x, z), kit = new Architecture(list), start = list.length;
    build(kit);
    kit.rotateFrom(start, x, z, yaw);
    for (let i = start; i < list.length; i++) (list[i] as StaticDesc).position.y += y;
  };
  /** A box pitched along a run from `a` to `b` (its top at their heights), `o` m to the right of it and `lift` over it. */
  const along = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, hx: number, hy: number, o: number, lift: number, colour: number, tag: string, extra = 0): void => {
    const dx = b.x - a.x, dz = b.z - a.z, run = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, dz), pitch = Math.atan2(b.y - a.y, run);
    // right of the way: (−dz, dx) / run; the box's local +Z along the run, +Y up through the pitch
    const rx = -dz / run, rz = dx / run, cy = Math.cos(pitch), sy = Math.sin(pitch);
    const mx = (a.x + b.x) / 2 + rx * o, mz = (a.z + b.z) / 2 + rz * o, my = (a.y + b.y) / 2;
    // the box's middle `lift − hy` over the run's line, along its up (tilted by the pitch)
    const up = lift - hy, fx = dx / run, fz = dz / run;
    const q = pitchedYaw(yaw, pitch);
    ctx.statics(mx, mz).push({ shape: { kind: 'box', hx, hy, hz: Math.hypot(run, b.y - a.y) / 2 + extra }, position: { x: mx - fx * sy * up, y: my + cy * up, z: mz - fz * sy * up }, rotation: q, color: colour, tag });
  };

  // ---------------------------------------------------------------- the dry canal's bridges
  const bridges: Bridge[] = [];
  for (const road of ground.roads) bridgeOver(road);
  function bridgeOver(road: GradedRoad): void {
    const hw = HALF_WIDTH[road.cls], paved = road.cls === 'avenue' || road.cls === 'street' || road.cls === 'side';
    const width = road.cls === 'highway' ? hw + 1 : paved ? hw + PAVEMENT + BRIDGE.margin : hw + 1;
    const n = road.pts.length, last = road.closed ? n : n - 1;
    const over = (i: number): boolean => {
      const p = road.pts[i % n] as P2, q = road.pts[(i + 1) % n] ?? p, dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1;
      for (const f of [-1, 0, 1]) {
        const x = p[0] - (dz / l) * width * f, z = p[1] + (dx / l) * width * f;
        if (canalBed(x, z) < (road.h[i % n] as number) - 1) return true;
      }
      return false;
    };
    for (let i = 0; i < last; i++) {
      if (!over(i) || (i > 0 && over(i - 1))) continue;
      let j = i;
      while (j + 1 < last && over(j + 1)) j++;
      // the deck from the point before the channel to the one after it, onto both banks
      const from = Math.max(0, i - 1), to = Math.min(road.closed ? n : n - 1, j + 2);
      const pt = (k: number): { x: number; y: number; z: number } => ({ x: (road.pts[k % n] as P2)[0], y: road.h[k % n] as number, z: (road.pts[k % n] as P2)[1] });
      for (let k = from; k < to; k++) {
        const a = pt(k), b = pt(k + 1);
        along(a, b, width, BRIDGE.depth / 2, 0, 0, PALETTE.concrete, 'kerb', 0.05);
        // the fascia in the Works' colour along each side, the railings on the pavement's (or the deck's) edge
        for (const side of [-1, 1]) {
          along(a, b, 0.06, 0.3, side * (width + 0.02), -0.25, ACCENTS.foundry, 'decor');
          along(a, b, 0.15, BRIDGE.railing / 2, side * (width - 0.15), (paved ? KERB + 0.04 : 0) + BRIDGE.railing, PALETTE.charcoal, 'building');
        }
      }
      const mid = Math.floor((i + j + 1) / 2), m = pt(mid);
      const floor = canalBed(m.x, m.z);
      bridges.push({ road: road.id, x: m.x, z: m.z, top: m.y, underside: m.y - BRIDGE.depth, floor });
    }
  }

  // ---------------------------------------------------------------- the port: the cranes and the container maze
  for (const [cx, cz] of PLACES.cranes) {
    const y = ground.surfaceHeight(cx, cz);
    // the boom out over the basin (the world's +Z), the legs astride the quay's edge
    put(cx, cz, -Math.PI / 2, y, (kit) => portCrane(kit, 0, 0));
    for (const sx of [-7, 7]) for (const sz of [-7.5, 7.5]) {
      ctx.statics(cx + sx, cz + sz).push({ shape: { kind: 'box', hx: 0.7, hy: 11, hz: 0.7 }, position: { x: cx + sx, y: y + 11, z: cz + sz }, rotation: IDENTITY_QUAT, color: PALETTE.carOrange, tag: 'building', collisionOnly: true });
    }
  }
  // the cranes' rails along the quay
  {
    const xs = PLACES.cranes.map((c) => c[0]), cz = (PLACES.cranes[0] as P2)[1];
    const xa = Math.max(...xs) + 40, xb = Math.min(...xs) - 40;
    for (const sz of [-7.5, 7.5]) for (let x = xb; x < xa; x += 20) {
      const a = { x, y: ground.surfaceHeight(x, cz + sz) + 0.05, z: cz + sz }, b = { x: Math.min(xa, x + 20), y: ground.surfaceHeight(Math.min(xa, x + 20), cz + sz) + 0.05, z: cz + sz };
      along(a, b, 0.12, 0.03, 0, 0.06, PALETTE.steel, 'decor');
    }
  }
  const loop = highwayLoop(6).pts;
  const nearHighway = (x: number, z: number, m: number): boolean => loop.some((p) => Math.hypot(p[0] - x, p[1] - z) < HALF_WIDTH.highway + m);
  for (const yard of PLACES.containerYards) containerMaze(yard);
  function containerMaze(yard: { x0: number; z0: number; x1: number; z1: number }): void {
    const c = MAZE.cell, nx = Math.floor((yard.x1 - yard.x0) / c), nz = Math.floor((yard.z1 - yard.z0) / c);
    const ox = (yard.x0 + yard.x1 - nx * c) / 2, oz = (yard.z0 + yard.z1 - nz * c) / 2;
    // a cell is the maze's where it and its edges are clear of the roads, the highway (and its viaduct), the sea
    const clear = (x: number, z: number): boolean => ground.onLand(x, z) && !ground.nearOtherRoad(x, z, -1, MAZE.clear) && !nearHighway(x, z, MAZE.clear);
    const free: boolean[] = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = ox + (i + 0.5) * c, z = oz + (j + 0.5) * c, h = c / 2 + 1.5;
      free.push([[0, 0], [-h, -h], [h, -h], [-h, h], [h, h]].every(([a, b]) => clear(x + (a as number), z + (b as number))));
    }
    const cell = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < nx && j < nz && free[j * nx + i] === true;
    // the maze: a spanning tree of each part's cells (walls where two cells are not joined), a few walls taken out
    const open = new Set<string>(), seen = new Uint8Array(nx * nz);
    for (let s = 0; s < nx * nz; s++) {
      if (!free[s] || seen[s]) continue;
      const stack = [s];
      seen[s] = 1;
      while (stack.length) {
        const k = stack[stack.length - 1] as number, i = k % nx, j = Math.floor(k / nx);
        const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [i + (a as number), j + (b as number)] as const).filter(([a, b]) => cell(a, b) && !seen[b * nx + a]);
        if (!next.length) { stack.pop(); continue; }
        const [a, b] = next[Math.floor(rnd() * next.length)] as readonly [number, number];
        open.add(edgeKey(i, j, a, b));
        seen[b * nx + a] = 1;
        stack.push(b * nx + a);
      }
    }
    const wall = (x: number, z: number, yaw: number): void => {
      const tiers = rnd() < 0.2 ? 1 : rnd() < 0.7 ? 2 : 3, y = ground.surfaceHeight(x, z);
      put(x, z, yaw, y, (kit) => { for (let t = 0; t < tiers; t++) kit.container(0, 0, 0, CONTAINER_COLOURS[Math.floor(rnd() * CONTAINER_COLOURS.length)] as number, t); });
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (!cell(i, j)) continue;
      // each cell's east (+x) and north (+z) edges, and its west and south where the maze ends there
      for (const [a, b] of [[i + 1, j], [i, j + 1], [i - 1, j], [i, j - 1]] as const) {
        const inside = cell(a, b);
        if (inside && (a < i || b < j)) continue;
        if (inside && open.has(edgeKey(i, j, a, b))) continue;
        // the outer wall has its gates; the inner walls a few taken out, for loops
        if (rnd() < (inside ? MAZE.braid : 0.3)) continue;
        // a wall between two columns runs along z (the container turned a quarter), between two rows along x
        if (a !== i) wall(ox + Math.max(i, a) * c, oz + (j + 0.5) * c, -Math.PI / 2);
        else wall(ox + (i + 0.5) * c, oz + Math.max(j, b) * c, 0);
      }
    }
  }
  function edgeKey(i: number, j: number, a: number, b: number): string {
    return i < a || (i === a && j < b) ? `${i},${j},${a},${b}` : `${a},${b},${i},${j}`;
  }

  // ---------------------------------------------------------------- the railway: the line, the sheds, the crossings
  const line = PLACES.railway as readonly P2[];
  const lz = (line[0] as P2)[1], lineEnds = [Math.min(...line.map((p) => p[0])), Math.max(...line.map((p) => p[0]))] as const;
  const eastEnd = lineEnds[0], westEnd = lineEnds[1];
  const west = westEnd - SHED.length / 2, east = eastEnd + SHED.length / 2;
  const train = new FreightTrain(ctx.world, ground, line, west, east);
  track(eastEnd, westEnd, lz, true);
  for (const z of SIDINGS.z) track(SIDINGS.x0, SIDINGS.x1, z, false);
  /** A track from x0 to x1 along z: its ballast (the wheels' ground), sleepers and rails, flush across the roads. */
  function track(x0: number, x1: number, z: number, main: boolean): void {
    const g = (x: number): number => (main ? train.railAt(x) : ground.surfaceHeight(x, z));
    const road = (x: number): boolean => ground.nearOtherRoad(x, z, -1, PAVEMENT + 0.5);
    const step = 6;
    for (let x = x0; x < x1 - 0.01; x += step) {
      const xb = Math.min(x1, x + step), a = { x, y: g(x), z }, b = { x: xb, y: g(xb), z };
      if (road(x) || road(xb) || road((x + xb) / 2)) {
        // across a road the rails lie in it, their tops at its surface
        for (const side of [-0.72, 0.72]) along(a, b, 0.05, 0.02, side, 0.05, PALETTE.steel, 'decor');
        continue;
      }
      along(a, b, 1.6, 0.08, 0, 0.12, ISLAND_COLORS.rock, 'kerb');
      for (const side of [-0.72, 0.72]) along(a, b, 0.05, 0.05, side, 0.24, PALETTE.steel, 'decor');
      for (let s = x + 0.75; s < xb; s += 1.5) ctx.statics(s, z).push({ shape: { kind: 'box', hx: 0.13, hy: 0.02, hz: 1.25 }, position: { x: s, y: g(s) + 0.15, z }, rotation: IDENTITY_QUAT, color: CITY_COLORS.roof, tag: 'decor', face: 'top' });
    }
    // buffer stops at both ends
    for (const [x, dir] of [[x0, 1], [x1, -1]] as const) put(x + dir * 0.6, z, 0, g(x), (kit) => {
      kit.box(0, 0.7, 0, 0.3, 0.7, 1.4, PALETTE.carRed, 'building');
      kit.box(0, 1.2, 0, 0.35, 0.25, 1.5, PALETTE.barrier);
    });
  }
  // the goods sheds the train stands in, each open toward the other
  for (const [mid, dir] of [[west, -1], [east, 1]] as const) shed(mid, dir);
  function shed(mid: number, dir: -1 | 1): void {
    const y = train.railAt(mid), h = SHED.height, half = SHED.length / 2, w = SHED.half;
    put(mid, lz, 0, y, (kit) => {
      for (const side of [-1, 1]) kit.box(0, h / 2, side * w, half, h / 2, 0.25, CITY_COLORS.brick, 'building');
      // the back wall, and the door's frame toward the line (`dir`: the way out)
      kit.box(-dir * half, h / 2, 0, 0.25, h / 2, w, CITY_COLORS.brick, 'building');
      for (const side of [-1, 1]) kit.box(dir * half, h / 2, side * (w + SHED.door) / 2, 0.25, h / 2, (w - SHED.door) / 2, CITY_COLORS.brick, 'building');
      kit.box(dir * half, h - 0.9, 0, 0.25, 0.9, SHED.door, CITY_COLORS.brick, 'building');
      kit.box(dir * (half + 0.28), h - 0.9, 0, 0.03, 0.45, SHED.door + 0.4, ACCENTS.foundry, 'decor', dir > 0 ? 'x+' : 'x-');
      kit.statics.push({ shape: { kind: 'gable', hx: half + 0.4, hy: 1.8, hz: w + 0.6 }, position: { x: 0, y: h + 1.8, z: 0 }, rotation: IDENTITY_QUAT, color: CITY_COLORS.roof, tag: 'decor' });
      kit.box(0, 0.08, 0, half - 0.3, 0.08, w - 0.3, PALETTE.concrete, 'kerb');
    });
  }
  // a few flats standing on the sidings, their containers on them
  for (const [x, z] of [[SIDINGS.x0 + 20, SIDINGS.z[0]], [SIDINGS.x0 + 34, SIDINGS.z[0]], [SIDINGS.x1 - 30, SIDINGS.z[1]]] as const) {
    put(x, z, 0, ground.surfaceHeight(x, z), (kit) => {
      kit.box(0, 1.0, 0, 6, 0.3, 1.4, PALETTE.graphite, 'building');
      kit.box(0, 2.6, 0, 5.9, 1.3, 1.2, CONTAINER_COLOURS[Math.floor(rnd() * CONTAINER_COLOURS.length)] as number, 'building');
    });
  }
  // the level crossings: where a road's centreline meets the line, the plan's four
  const crossings: LevelCrossing[] = [];
  for (const [px] of PLACES.crossings) {
    let best: LevelCrossing | null = null, bd = 12;
    for (const road of ground.roads) for (let i = 0; i + 1 < road.pts.length; i++) {
      const a = road.pts[i] as P2, b = road.pts[i + 1] as P2;
      if ((a[1] - lz) * (b[1] - lz) > 0 || a[1] === b[1]) continue;
      const t = (lz - a[1]) / (b[1] - a[1]), x = a[0] + (b[0] - a[0]) * t;
      if (Math.abs(x - px) >= bd) continue;
      bd = Math.abs(x - px);
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      best = { road: road.id, x, z: lz, ux: (b[0] - a[0]) / l, uz: (b[1] - a[1]) / l, half: HALF_WIDTH[road.cls], out: 0, y: ground.surfaceHeight(x, lz), passes: [], down: 0, closed: false };
    }
    if (!best) continue;
    // the barriers clear of every track the road crosses (the yard's sidings too) and of the train
    const tracks = [lz, ...(Math.abs(best.x - (SIDINGS.x0 + SIDINGS.x1) / 2) < (SIDINGS.x1 - SIDINGS.x0) / 2 ? SIDINGS.z : [])];
    best.out = (Math.max(...tracks.map((t) => Math.abs(t - lz))) + TRAIN.half + BARRIER_OUT) / Math.max(0.3, Math.abs(best.uz));
    best.passes = passesOver(best);
    crossings.push(best);
    barrierPosts(best);
  }
  /** The train's two passes a period over a crossing: from its front reaching the road's edge to its back clearing it. */
  function passesOver(c: LevelCrossing): Pass[] {
    // the road's band (its pavements too) along the line, widened by the train's own width where the road runs aslant
    const reach = (c.half + PAVEMENT + TRAIN.half * Math.abs(c.ux)) / Math.max(0.3, Math.abs(c.uz)), out: Pass[] = [];
    let inside = false, from = 0;
    for (let t = 0; t <= TRAIN.period; t += 0.02) {
      const on = Math.abs(train.middleAt(t) - c.x) < train.length / 2 + reach;
      if (on && !inside) from = t;
      if (!on && inside) out.push({ from, to: t });
      inside = on;
    }
    if (inside) out.push({ from, to: TRAIN.period });
    return out;
  }
  /** Each barrier's post on the road's edge, its lamp housing and the crossing's sign. */
  function barrierPosts(c: LevelCrossing): void {
    const at = { x: 0, z: 0 };
    for (const along of [-1, 1]) for (const side of [-1, 1]) {
      const { x, z } = barrierPost(c, along, side, at), y = ground.surfaceHeight(x, z);
      const list = ctx.statics(x, z);
      list.push({ shape: { kind: 'cylinder', radius: 0.14, halfHeight: 1.4, sides: 6 }, position: { x, y: y + 1.4, z }, rotation: IDENTITY_QUAT, color: PALETTE.barrier, tag: 'trunk' });
      list.push({ shape: { kind: 'box', hx: 0.35, hy: 0.45, hz: 0.35 }, position: { x, y: y + 0.45, z }, rotation: IDENTITY_QUAT, color: PALETTE.graphite, tag: 'decor' });
      list.push({ shape: { kind: 'box', hx: 0.5, hy: 0.14, hz: 0.12 }, position: { x, y: y + 2.9, z }, rotation: quatYaw(Math.atan2(c.ux, c.uz) + Math.PI / 2), color: PALETTE.charcoal, tag: 'decor' });
    }
  }

  // ---------------------------------------------------------------- the Waterworks and the scrapyard
  {
    const w = PLACES.waterworks, y = ground.surfaceHeight(w.x, w.z), foundry = DISTRICTS.find((d) => d.id === 'foundry');
    put(w.x, w.z, 0, y, (kit) => {
      kit.box(0, 0.02, 0, WATERWORKS_PLAZA, 0.02, WATERWORKS_PLAZA, PALETTE.kerb, 'decor', 'top');
      waterworks(kit, 0, 0, ACCENTS.foundry, foundry?.color ?? 0xd98768);
    });
  }
  const scrapyard = scrapyardGarage();
  function scrapyardGarage(): DropOff {
    const [dx, dz] = SCRAPYARD.door, yaw = 0, y = ground.surfaceHeight(dx, dz + GARAGE.depth / 2);
    const site: DropOff = {
      name: 'scrapyard', x: dx, z: dz + GARAGE.depth / 2, yaw,
      door: { x: dx, z: dz, yaw, width: GARAGE.doorWidth, height: GARAGE.doorHeight },
      entry: { across: GARAGE.entryAcross, along: GARAGE.entryAlong }, approachLane: -1,
      lot: DROP_OFF_LOTS.find((l) => l.name === 'scrapyard') ?? (DROP_OFF_LOTS[0] as (typeof DROP_OFF_LOTS)[number]),
    };
    const list = ctx.statics(site.x, site.z), start = list.length;
    list.push(...hideoutStatics(site));
    for (let i = start; i < list.length; i++) (list[i] as StaticDesc).position.y += y;
    // the yard's fence, a gate before the door; the wrecks piled in it, a gantry over one pile, tyres
    const fence = (x0: number, z0: number, x1: number, z1: number): void => {
      const l = Math.hypot(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      put(mx, mz, Math.atan2(z0 - z1, x1 - x0), ground.surfaceHeight(mx, mz), (kit) => kit.fence(0, 0, 0, l));
    };
    const { x0, x1, z0, z1 } = SCRAPYARD, gate = GARAGE.doorWidth / 2 + 3;
    fence(x0 + 1, z1 - 1, x1 - 1, z1 - 1);
    fence(x0 + 1, z0 + 1, x0 + 1, z1 - 1);
    fence(x1 - 1, z0 + 1, x1 - 1, z1 - 1);
    fence(x0 + 1, z0 + 1, dx - gate, z0 + 1);
    fence(dx + gate, z0 + 1, x1 - 1, z0 + 1);
    const wrecks = [PALETTE.carRed, PALETTE.carBlue, PALETTE.carOrange, PALETTE.carWhite, PALETTE.steel, CITY_COLORS.brick];
    for (const [px, pz] of [[-28, 12], [-30, 34], [-14, 46], [16, 44], [30, 30], [28, 10], [2, 50]] as const) {
      const x = dx + px, z = dz + pz, py = ground.surfaceHeight(x, z), tall = 2 + Math.floor(rnd() * 4);
      put(x, z, rnd() * Math.PI, py, (kit) => {
        for (let k = 0; k < tall; k++) kit.box((rnd() - 0.5) * 0.6, 0.3 + k * 0.62, (rnd() - 0.5) * 0.6, 2.1, 0.28, 0.9, wrecks[Math.floor(rnd() * wrecks.length)] as number);
        kit.statics.push({ shape: { kind: 'box', hx: 2.5, hy: tall * 0.31 + 0.1, hz: 1.3 }, position: { x: 0, y: tall * 0.31 + 0.1, z: 0 }, rotation: IDENTITY_QUAT, color: PALETTE.graphite, tag: 'building', collisionOnly: true });
      });
    }
    put(dx - 22, dz + 28, 0, ground.surfaceHeight(dx - 22, dz + 28), (kit) => kit.gantry(0, 0, 0, 18, ACCENTS.foundry));
    for (const [px, pz] of [[36, 50], [38, 46], [-38, 48]] as const) {
      const x = dx + px, z = dz + pz, py = ground.surfaceHeight(x, z);
      put(x, z, 0, py, (kit) => { for (let k = 0; k < 4; k++) kit.cylinder(0, 0.2 + k * 0.4, 0, 0.55, 0.18, PALETTE.charcoal, 8, k === 0 ? 'building' : 'decor'); });
    }
    return site;
  }

  const place: WorksPlace = {
    id: 'works', train, crossings, bridges, scrapyard,
    step(dt: number): void {
      train.step(dt);
      const phase = ((train.time % TRAIN.period) + TRAIN.period) % TRAIN.period;
      for (const c of crossings) {
        let down = 0;
        for (const p of c.passes) for (const shift of SHIFTS) {
          // lowering to be down `lead` s before the train, down while it passes, rising once it has cleared
          const t = phase - shift, lower = p.from - TRAIN.lead - TRAIN.move;
          if (t < lower || t > p.to + TRAIN.after + TRAIN.move) continue;
          down = Math.max(down, t < p.from - TRAIN.lead ? (t - lower) / TRAIN.move : t <= p.to + TRAIN.after ? 1 : 1 - (t - p.to - TRAIN.after) / TRAIN.move);
        }
        c.down = down;
        c.closed = down > 0;
      }
    },
  };
  // the barriers as they stand at the start
  place.step?.(0);
  return [place];
}

/** How far past the road's carriageway a barrier's post stands (m), on its pavement. */
export const BARRIER_POST = 0.9;
/**
 * A barrier's post (into `out`): `along` the side of the line (−1, 1, along the road's way), `side` the road's edge (−1
 * its left, 1 its right); its arm swings across that half of the road.
 */
export function barrierPost(c: LevelCrossing, along: number, side: number, out: { x: number; z: number }): { x: number; z: number } {
  // the road's right facing its way (+X is a car's left facing +Z)
  const rx = -c.uz, rz = c.ux;
  out.x = c.x + c.ux * along * c.out + rx * side * (c.half + BARRIER_POST);
  out.z = c.z + c.uz * along * c.out + rz * side * (c.half + BARRIER_POST);
  return out;
}

/** A turn about +Y, then a climb about the turned +X (the physics' and the render's rotation of a pitched box). */
function pitchedYaw(yaw: number, pitch: number): Quat {
  const a = -pitch, cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(a / 2), sp = Math.sin(a / 2);
  return { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp };
}
function quatYaw(yaw: number): Quat {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}
