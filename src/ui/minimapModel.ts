/**
 * Pure model for the heading-up radar minimap: the tuning numbers, road layers
 * from the road graph, heading and zoom smoothing, world-to-screen projection
 * and the rim clamp for markers out of range. No DOM and no physics import, so
 * it runs in Node tests. The painter (`minimap.ts`) draws what this computes.
 */
import { HIGHWAY_HALF, ROAD_HALF, type RoadGraph, type RoadPoint } from '../sim/city/roads';

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
  glyphPx: 8,
  arrowPx: 11,
} as const;

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
export function bigMapScale(size: number, half: number, margin = 25): number {
  return size / 2 / (half + margin);
}

/** A world point on the full-screen map: north (+Z) up, west (+X) to the left, the island's centre in the middle. */
export function bigMapProject(out: Vec2, x: number, z: number, size: number, scale: number): Vec2 {
  out.x = size / 2 - x * scale;
  out.y = size / 2 - z * scale;
  return out;
}
