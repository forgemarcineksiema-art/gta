/**
 * Pure model for the heading-up radar minimap: the tuning numbers, road layers
 * from the road graph, heading and zoom smoothing, world-to-screen projection
 * and the rim clamp for markers out of range. No DOM and no physics import, so
 * it runs in Node tests. The painter (`minimap.ts`) draws what this computes.
 */
import { HIGHWAY_HALF, ROAD_HALF, type RoadGraph, type RoadPoint } from '../../sim/city/roads';
import type { GoalKind } from '../../sim/run/goal';

export const MINIMAP = {
  /** Visible world radius in metres at rest and at `zoomTopKmh`. */
  radiusMinM: 210,
  radiusMaxM: 420,
  zoomTopKmh: 160,
  /** First-order smoothing rates, 1/s: `k = 1 - exp(-rate * dt)`. */
  zoomRate: 1.5,
  headingRate: 6,
  /** Cap on how fast the map may turn, rad/s, so a spin-out does not whip it. */
  headingMaxRate: Math.PI,
  /** Below this ground speed (m/s) the map follows the car's yaw, not its velocity. */
  forwardMinSpeed: 3,
  /** Player position below the circle centre, as a fraction of the radius: more road ahead. */
  playerOffset: 0.22,
  /** Minimum time between repaints, ms (30 Hz). Nothing repaints while nothing moved. */
  repaintMs: 33,
  /** Roads never draw thinner than this on screen, px. */
  minRoadPx: 3,
  /** Dark outline on each side of a road, px. */
  casingPx: 2,
  /** Clamped markers sit this far inside the rim, px. */
  rimInset: 16,
  /** A position jump above this (m) snaps heading and zoom instead of easing (teleports, resets). */
  snapJumpM: 80,
  /** The sizes below are at 720p (docs/M8.9_PLAN.md R6) and scale with the disc (`radarScale`). The garage's house, px. */
  glyphPx: 8,
  /** The player's arrow: its half-length, px (the arrow is 1.66 of it: 14 px). */
  arrowPx: 8.5,
  /**
   * The way's route (docs/history/M8.7_PLAN.md D3; M8.9 R6): its line, px, on a dark edge `routeEdgePx` wider on each side,
   * the brightest line of the disc; drawn in from the car over `drawInMs` when the goal or the route changes. The
   * goal's badge, px (radius: 20 across); an open or closed ring is a dot of `ringPx` radius (6 across).
   */
  routePx: 6,
  routeEdgePx: 2,
  drawInMs: 500,
  goalPx: 10,
  ringPx: 3,
  /** A unit's dot and a race rival's arrow, px (radius, half-length). */
  unitPx: 3.5,
  rivalPx: 5,
  /** A cache shows on the radar only this near (m); beyond it, on the full map. */
  cacheNearM: 80,
} as const;

/** The disc's size in rem (`--minimap-size`, the HUD's scale, M8.9 R3): 165.6 px at 720p. */
export const RADAR_REM = 10.35;
export const RADAR_BASE_PX = RADAR_REM * 16;

/** The radar's sizes' factor for a disc of `discPx` CSS px: 1 at 720p, 0.85 at 800×450. */
export function radarScale(discPx: number): number {
  return discPx > 0 ? discPx / RADAR_BASE_PX : 1;
}

/**
 * What the radar draws (docs/M8.9_PLAN.md R6), a bit each; it answers three questions: where to go (the route, the
 * goal, the rings, a zone), where the police are (the units, the search, the helicopter, a race's rivals), where to
 * bank (the nearest garage). The landmarks, the other garages, the caches beyond `cacheNearM`, the cameras, the
 * cover and the breakers are the full map's.
 */
export const RADAR = {
  route: 1 << 0, goal: 1 << 1, rings: 1 << 2, zone: 1 << 3, units: 1 << 4, search: 1 << 5, heli: 1 << 6, rivals: 1 << 7,
  garage: 1 << 8, cache: 1 << 9, player: 1 << 10, north: 1 << 11,
} as const;
export type RadarMark = keyof typeof RADAR;

/** What a paint of the radar reads. */
export interface RadarState {
  route: boolean;
  goal: boolean;
  rings: number;
  zone: boolean;
  units: number;
  search: boolean;
  heli: boolean;
  rivals: number;
  bag: number;
  goalKind: GoalKind;
  /** The goal is a garage's door already (its badge, the house, says it). */
  goalAtGarage: boolean;
  /** Unfound caches within `cacheNearM`. */
  cachesNear: number;
}

/** The nearest garage's house: while the bag holds money, or the line says BANK IT or BUY. */
export function garageShown(bag: number, goalKind: GoalKind): boolean {
  return bag > 0 || goalKind === 'bank' || goalKind === 'buy';
}

/** The marks a paint draws, as `RADAR` bits (the painter records them: the pins read what it drew). */
export function radarMarks(s: RadarState): number {
  let m = RADAR.player | RADAR.north;
  if (s.route) m |= RADAR.route;
  if (s.goal) m |= RADAR.goal;
  if (s.rings > 0) m |= RADAR.rings;
  if (s.zone) m |= RADAR.zone;
  if (s.units > 0) m |= RADAR.units;
  if (s.search) m |= RADAR.search;
  if (s.heli) m |= RADAR.heli;
  if (s.rivals > 0) m |= RADAR.rivals;
  if (garageShown(s.bag, s.goalKind) && !s.goalAtGarage) m |= RADAR.garage;
  if (s.cachesNear > 0) m |= RADAR.cache;
  return m;
}

/** The names of a mask's marks, in `RADAR`'s order. */
export function radarNames(mask: number): RadarMark[] {
  return (Object.keys(RADAR) as RadarMark[]).filter((k) => (mask & RADAR[k]) !== 0);
}

/** The index of the nearest of `doors` to (x, z), -1 for none. */
export function nearestDoor(doors: ReadonlyArray<{ x: number; z: number }>, x: number, z: number): number {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i] as { x: number; z: number };
    const dd = (d.x - x) ** 2 + (d.z - z) ** 2;
    if (dd < bestD) { bestD = dd; best = i; }
  }
  return best;
}

export interface Segment { x0: number; z0: number; x1: number; z1: number }
export interface Polyline { points: RoadPoint[]; width: number }
export interface RoadLayers {
  /** Grid streets and the perimeter highway, junction to junction (straight). */
  grid: Segment[];
  highway: Segment[];
  /** Authored roads on their real centrelines, with their real widths. */
  special: Polyline[];
  gridWidth: number;
  highwayWidth: number;
}

/**
 * Roads for drawing. Grid lanes are drawn node to node: `lane.points` are the
 * right-hand carriageway paths inset from the junctions, which drawn as roads sit
 * off-centre and kink at every junction. Authored roads use their centrelines.
 */
export function buildRoadLayers(graph: RoadGraph): RoadLayers {
  const grid: Segment[] = [];
  const highway: Segment[] = [];
  const drawn = new Set<number>();
  for (const lane of graph.lanes) {
    if (lane.from > lane.to || lane.special) continue;
    // The highway has two lanes per direction; one segment per edge is one road on the map.
    const edge = lane.from * 64 + lane.to;
    if (drawn.has(edge)) continue;
    drawn.add(edge);
    const a = graph.nodes[lane.from];
    const b = graph.nodes[lane.to];
    if (!a || !b) continue;
    (lane.highway ? highway : grid).push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z });
  }
  const special = graph.special.map((road) => ({ points: road.centre, width: road.halfWidth * 2 }));
  return { grid, highway, special, gridWidth: ROAD_HALF * 2, highwayWidth: HIGHWAY_HALF * 2 };
}

export interface MinimapState {
  /** World yaw that points up on the map (same convention as the car: 0 = +Z, + = left). */
  heading: number;
  /** Visible world radius, metres. */
  radiusM: number;
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Yaw of a body quaternion: the world heading of its local +Z (matches the chase camera). */
export function yawFromQuat(qx: number, qy: number, qz: number, qw: number): number {
  return Math.atan2(2 * (qx * qz + qw * qy), 1 - 2 * (qx * qx + qy * qy));
}

/**
 * Eases the map heading toward the direction of travel and the zoom toward the
 * speed. The map follows the velocity (what the chase camera does, so a drift
 * shows the car sideways) whenever the car moves and is not reversing;
 * otherwise the car's yaw; `northUp` holds it at north. `snap` lands both at once (first frame, teleports).
 */
export function advance(state: MinimapState, dt: number, carYaw: number, vx: number, vz: number, forwardSpeed: number, snap = false, northUp = false): void {
  const speed = Math.hypot(vx, vz);
  const moving = speed > MINIMAP.forwardMinSpeed && forwardSpeed > -MINIMAP.forwardMinSpeed;
  // north up (the settings' RADAR row, M7 slice 3): the map never turns and the arrow does
  const target = northUp ? 0 : moving ? Math.atan2(vx, vz) : carYaw;
  const kmh = speed * 3.6;
  const zoom = Math.min(1, Math.max(0, kmh / MINIMAP.zoomTopKmh));
  const radiusTarget = MINIMAP.radiusMinM + (MINIMAP.radiusMaxM - MINIMAP.radiusMinM) * zoom;
  if (snap) {
    state.heading = wrapAngle(target);
    state.radiusM = radiusTarget;
    return;
  }
  const delta = wrapAngle(target - state.heading);
  let step = delta * (1 - Math.exp(-MINIMAP.headingRate * dt));
  const maxStep = MINIMAP.headingMaxRate * dt;
  if (step > maxStep) step = maxStep;
  else if (step < -maxStep) step = -maxStep;
  state.heading = wrapAngle(state.heading + step);
  state.radiusM += (radiusTarget - state.radiusM) * (1 - Math.exp(-MINIMAP.zoomRate * dt));
}

export interface Vec2 { x: number; y: number }

/**
 * World point to screen pixels (y down). +Z is north and +X is west, so the
 * north-up map is `(-dx, -dz)`; rotating that by `heading` turns the direction
 * of travel to screen-up. `scale` is px per metre, `(px, py)` the player's pixel.
 */
export function project(out: Vec2, x: number, z: number, cx: number, cz: number, heading: number, scale: number, px: number, py: number): Vec2 {
  const nx = -(x - cx);
  const ny = -(z - cz);
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  out.x = px + (nx * c - ny * s) * scale;
  out.y = py + (nx * s + ny * c) * scale;
  return out;
}

/**
 * A screen point outside the circle moves to where the ray from the player
 * leaves the circle, so a clamped marker shows the true bearing from the car.
 * Returns whether it moved; a point inside is copied unchanged.
 */
export function clampToRim(out: Vec2, px: number, py: number, sx: number, sy: number, ccx: number, ccy: number, r: number): boolean {
  const mx = sx - ccx;
  const my = sy - ccy;
  if (mx * mx + my * my <= r * r) {
    out.x = sx;
    out.y = sy;
    return false;
  }
  const dx = sx - px;
  const dy = sy - py;
  const fx = px - ccx;
  const fy = py - ccy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = Math.max(0, b * b - 4 * a * c);
  const t = (-b + Math.sqrt(disc)) / (2 * a);
  out.x = px + dx * t;
  out.y = py + dy * t;
  return true;
}

/** The full-screen map (M5.5 slice 15): pixels a metre when the island (`half` m each way) and `margin` m of water fill a `size` px square. */
/** The share of the route drawn `ms` after it last changed: 0 → 1 over `drawInMs`, eased out. */
export function drawInShare(ms: number): number {
  const t = Math.max(0, Math.min(1, ms / MINIMAP.drawInMs));
  return 1 - (1 - t) * (1 - t);
}

/**
 * Where a route's line stops at `share` of its length: the whole points before the stop (`count`) and the stop
 * (`x`, `z`). `points` is x and z interleaved, `n` points of it. Writes into `out`; no allocation.
 */
export function routeStop(points: ArrayLike<number>, n: number, share: number, out: { count: number; x: number; z: number }): void {
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot((points[i * 2] as number) - (points[i * 2 - 2] as number), (points[i * 2 + 1] as number) - (points[i * 2 - 1] as number));
  let left = total * Math.max(0, Math.min(1, share));
  out.count = n > 0 ? 1 : 0;
  out.x = (points[0] as number) ?? 0;
  out.z = (points[1] as number) ?? 0;
  for (let i = 1; i < n; i++) {
    const ax = points[i * 2 - 2] as number, az = points[i * 2 - 1] as number, bx = points[i * 2] as number, bz = points[i * 2 + 1] as number;
    const len = Math.hypot(bx - ax, bz - az);
    if (len >= left) {
      const t = len > 0 ? left / len : 0;
      out.x = ax + (bx - ax) * t;
      out.z = az + (bz - az) * t;
      return;
    }
    left -= len;
    out.count = i + 1;
    out.x = bx;
    out.z = bz;
  }
}

/**
 * The full map's half extent, m (M8.8 slice 19): the island's `island`, or out to the player at sea (`x`, `z`) with 30 m
 * round them, `sea` m past the island at most (the sea's edge).
 */
export function mapHalf(x: number, z: number, island: number, sea: number): number {
  return Math.min(island + sea, Math.max(island, Math.abs(x) + 30, Math.abs(z) + 30));
}

export function bigMapScale(size: number, half: number, margin = 25): number {
  return size / 2 / (half + margin);
}

/** A world point on the full-screen map: north (+Z) up, west (+X) to the left, the island's centre in the middle. */
export function bigMapProject(out: Vec2, x: number, z: number, size: number, scale: number): Vec2 {
  out.x = size / 2 - x * scale;
  out.y = size / 2 - z * scale;
  return out;
}

/** A box on a map, px: its centre and half extents. */
export interface Box {
  x: number;
  y: number;
  hw: number;
  hh: number;
}

/** The bearings a name tries, degrees from up: the sides first (a name moves along its line before off it). */
const BEARINGS = [90, 270, 60, 120, 300, 240, 30, 150, 330, 210, 0, 180];

/** Whether two boxes overlap. */
export function boxesMeet(a: Box, b: Box): boolean {
  return Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.y - b.y) < a.hh + b.hh;
}

/**
 * A name's place on the full map (docs/M8.9_PLAN.md R6): the first spot round `x`, `y` (rings `step` px apart, twelve
 * bearings each, out to `reach`) where a box `hw` × `hh` half extents meets no icon and stays inside `size`; the spot
 * itself when none is free. Writes `out`.
 */
export function clearSpot(x: number, y: number, hw: number, hh: number, icons: readonly Box[], size: number, step: number, reach: number, out: Box): Box {
  out.hw = hw;
  out.hh = hh;
  for (let r = 0; r <= reach; r += step) {
    const n = r === 0 ? 1 : BEARINGS.length;
    for (let k = 0; k < n; k++) {
      const a = ((BEARINGS[k] as number) * Math.PI) / 180;
      out.x = x + Math.sin(a) * r;
      out.y = y - Math.cos(a) * r * 0.6;
      if (out.x - hw < 0 || out.x + hw > size || out.y - hh < 0 || out.y + hh > size) continue;
      let free = true;
      for (const icon of icons) if (boxesMeet(out, icon)) { free = false; break; }
      if (free) return out;
    }
  }
  out.x = x;
  out.y = y;
  return out;
}
