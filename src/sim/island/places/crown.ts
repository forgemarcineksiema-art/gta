/**
 * Crown Heights' places (M8.10 slice 8, docs/M8.10_PLAN.md): the Crown Tower on the summit's plaza and the plaza's ring of
 * trees; the multi-storey car park (four decks, a ramp between each two round its core, the roof's kicker over the z 140
 * street onto the office block across it); the police headquarters (the building, its yard and the bays where the units
 * park); the hideout (the grid's garage, on its pad by the x 470 street); the glazed arcade over the x 290 street; the
 * quarry's kicker at its rim; the rocks at the cliffs' foot. The serpentine's banked hairpins are the ground's
 * (`ground.ts`), the quarry's pit and the pads the shapes' (`../shapes/crown.ts`). All of it stands still: statics in the
 * island's chunks at their absolute heights, drawn in the grid's kit, their colliders by tag (a deck or a ramp is `kerb`,
 * the wheels' ground, drawn apart so it casts its shadow; a wall is `building`).
 */
import { Architecture, buildingHeight } from '../../city/architecture';
import { GARAGE, hideoutStatics, type DropOff } from '../../city/cover';
import { SEA } from '../../city/sea';
import { ACCENTS, CITY_COLORS, ISLAND_COLORS, PALETTE } from '../../palette';
import { mulberry32 } from '../../random';
import { IDENTITY_QUAT, type Quat, type StaticDesc } from '../../scene';
import type { P2 } from '../geom';
import { PLACES } from '../plan';
import { ARCADE, CAR_PARK, HIDEOUT, HQ, KICKER, LANDING, QUARRY_KICKER, TOWER, type Box } from '../shapes/crown';
import type { Place, PlaceContext } from './place';

interface V3 { x: number; y: number; z: number }

/** A jump the ground does not make: its lip (the launch point, its height), its heading, its length and height, half its width. */
export interface IslandJump { x: number; y: number; z: number; yaw: number; length: number; height: number; half: number }

/** A turn by `yaw` about +Y after a climb by `pitch` (nose up) about +X: the colliders' and the render's rotation. */
export function turn(yaw: number, pitch: number): Quat {
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
  return { x: -cy * sp, y: sy * cp, z: sy * sp, w: cy * cp };
}

/** An axis-aligned box from its extents. */
function box(list: StaticDesc[], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number, tag: string, rotation: Quat = IDENTITY_QUAT): StaticDesc {
  const st: StaticDesc = { shape: { kind: 'box', hx: (x1 - x0) / 2, hy: (y1 - y0) / 2, hz: (z1 - z0) / 2 }, position: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }, rotation, color, tag };
  list.push(st);
  return st;
}

/**
 * A slab whose top runs from `a` to `b` along its middle, `half` wide each side, `thick` deep under its top: pitched
 * along its run. `ground` makes it the wheels' ground: drawn as decor (so it casts its shadow) with a `kerb` twin for
 * the physics.
 */
function slab(list: StaticDesc[], a: V3, b: V3, half: number, thick: number, color: number, tag: string, ground = false): void {
  const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y, run = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, run), length = Math.hypot(run, dy);
  // the top's middle, less half the thickness along the slab's up
  const ux = -Math.sin(pitch) * Math.sin(yaw), uy = Math.cos(pitch), uz = -Math.sin(pitch) * Math.cos(yaw);
  const c = { x: (a.x + b.x) / 2 - ux * thick / 2, y: (a.y + b.y) / 2 - uy * thick / 2, z: (a.z + b.z) / 2 - uz * thick / 2 };
  const rotation = turn(yaw, pitch);
  const shape = { kind: 'box' as const, hx: half, hy: thick / 2, hz: length / 2 };
  list.push({ shape, position: c, rotation, color, tag: ground ? 'decor' : tag });
  if (ground) list.push({ shape: { ...shape }, position: { ...c }, rotation, color, tag: 'kerb', collisionOnly: true });
}

/** A deck: a flat slab over `b`, its top at `y`, the wheels' ground (drawn apart, so it casts its shadow). */
function deck(list: StaticDesc[], b: Box, y: number, color: number): void {
  box(list, b.x0, b.x1, y - 0.3, y, b.z0, b.z1, color, 'decor');
  box(list, b.x0, b.x1, y - 0.3, y, b.z0, b.z1, color, 'kerb').collisionOnly = true;
}

/** A kicker along `yaw` whose lip is at (x, y, z): three slabs easing up (the grid's `rampProfile`), drawn solid. */
function kicker(list: StaticDesc[], k: IslandJump): void {
  const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw), tan = k.height / k.length, seg = k.length / 3;
  const at = (along: number, y: number): V3 => ({ x: k.x + fx * along, y, z: k.z + fz * along });
  const foot = k.y - k.height;
  let y = foot;
  for (let i = 0; i < 3; i++) {
    const y1 = y + (tan * (i + 1) / 2) * seg;
    const a = at(-k.length + seg * i, y), b = at(-k.length + seg * (i + 1), y1);
    // drawn thick, so its body reaches the ground under its lip; its collider the slab's top
    slab(list, a, b, k.half, 0.3 + (y1 - foot), PALETTE.ramp, 'decor');
    slab(list, a, b, k.half, 0.15, PALETTE.ramp, 'kerb');
    (list[list.length - 1] as StaticDesc).collisionOnly = true;
    y = y1;
  }
  // the white lip across its top (the last slab climbs at one and a half times the mean slope)
  slab(list, at(-0.35, k.y - 0.35 * 1.5 * tan), at(0, k.y), k.half + 0.02, 0.06, PALETTE.barrier, 'decor');
}

/** The Crown Tower: a stone lobby, the shaft with its glass, a setback, the gold crown and its mast; the plaza's trees. */
function tower(ctx: PlaceContext): void {
  const { x, z } = PLACES.towerTop, b = ctx.ground.surfaceHeight(x, z), list = ctx.statics(x, z);
  const c = CITY_COLORS, gold = ACCENTS.crown;
  const block = (h: number, y0: number, y1: number, color: number, tag = 'decor'): StaticDesc => box(list, x - h, x + h, b + y0, b + y1, z - h, z + h, color, tag);
  block(15, -1.5, 10, c.stone, 'building');
  block(15.4, 9.4, 10.6, c.trim);
  // the lobby's glass between its corner piers
  for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const px = x + ax * 15.05, pz = z + az * 15.05;
    box(list, px - (ax === 0 ? 11 : 0.06), px + (ax === 0 ? 11 : 0.06), b + 0.5, b + 8.6, pz - (az === 0 ? 11 : 0.06), pz + (az === 0 ? 11 : 0.06), PALETTE.glassDark, 'decor');
  }
  block(12, 10, 82, c.stone, 'building');
  // the shaft's glass: four strips a face, and a band every twelve metres
  for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    for (const u of [-7.5, -2.5, 2.5, 7.5]) {
      const px = x + ax * 12.06 + (ax === 0 ? u : 0), pz = z + az * 12.06 + (az === 0 ? u : 0);
      box(list, px - (ax === 0 ? 1.1 : 0.06), px + (ax === 0 ? 1.1 : 0.06), b + 11, b + 81, pz - (az === 0 ? 1.1 : 0.06), pz + (az === 0 ? 1.1 : 0.06), PALETTE.glassDark, 'decor');
    }
  }
  for (let y = 22; y < 82; y += 12) block(12.2, y, y + 0.6, c.trim);
  block(9, 82, 92, c.stone);
  block(9.3, 88, 89, gold);
  block(10, 92, 93.6, gold);
  for (const [ax, az] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const px = x + ax * 9, pz = z + az * 9, tall = ax !== 0 && az !== 0 ? 101 : 98.5;
    box(list, px - 0.9, px + 0.9, b + 93.6, b + tall, pz - 0.9, pz + 0.9, gold, 'decor');
  }
  list.push({ shape: { kind: 'cylinder', radius: 5, halfHeight: 2.5, sides: 6 }, position: { x, y: b + 96.1, z }, rotation: IDENTITY_QUAT, color: gold, tag: 'decor' });
  box(list, x - 0.35, x + 0.35, b + 98, b + TOWER.top - 1, z - 0.35, z + 0.35, PALETTE.steel, 'decor');
  box(list, x - 0.5, x + 0.5, b + TOWER.top - 1, b + TOWER.top, z - 0.5, z + 0.5, PALETTE.carRed, 'decor');
  // twelve trees round the plaza (the sketch's ring), inside its ring road
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + Math.PI / 12, tx = x + Math.cos(a) * 50, tz = z + Math.sin(a) * 50;
    const trees = ctx.statics(tx, tz), kit = new Architecture(trees), start = trees.length;
    kit.tree(0, 0);
    kit.rotateFrom(start, tx, tz, 0);
    const y = ctx.ground.surfaceHeight(tx, tz);
    for (let i = start; i < trees.length; i++) (trees[i] as StaticDesc).position.y += y;
  }
}

/**
 * The multi-storey car park (`CAR_PARK`): the ground floor on its pad; four decks, each open over the ramp that comes up
 * to it; the ramps up the east lane northward and the west lane southward in turn, so the way up is a spiral round the
 * core; parapets round every deck, railings along the ramps, columns on the facades, barriers at the holes' far ends;
 * the door in the south face of the east lane; the roof's kicker at the south end of its west lane. Returns the kicker.
 */
function carPark(ctx: PlaceContext): IslandJump {
  const P = CAR_PARK, list = ctx.statics((P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2);
  const [laneA, laneB] = P.lanes, level = (k: number): number => P.floor + k * P.rise;
  const concrete = PALETTE.concrete, deckColour = PALETTE.asphaltLight, stripe = PALETTE.roadYellow;
  const bandA: Box = { x0: P.x0, x1: P.core.x0, z0: P.ramps.z0, z1: P.ramps.z1 }, bandB: Box = { x0: P.core.x1, x1: P.x1, z0: P.ramps.z0, z1: P.ramps.z1 };
  const south: Box = { x0: P.x0, x1: P.x1, z0: P.z0, z1: P.ramps.z0 }, north: Box = { x0: P.x0, x1: P.x1, z0: P.ramps.z1, z1: P.z1 };
  const top = level(P.decks);
  // the core between the lanes, ground to roof
  box(list, P.core.x0, P.core.x1, P.floor - 0.5, top - 0.3, P.ramps.z0, P.ramps.z1, CITY_COLORS.stone, 'building');
  for (let k = 1; k <= P.decks; k++) box(list, P.core.x0 - 0.02, P.core.x1 + 0.02, level(k) - 1.3, level(k) - 1, P.ramps.z0 - 0.02, P.ramps.z1 + 0.02, stripe, 'decor');
  // the decks: each open over the ramp coming up to it (from below in the west lane on odd decks, the east on even)
  for (let k = 1; k <= P.decks; k++) {
    const y = level(k);
    for (const b of [south, north, k % 2 === 1 ? bandA : bandB]) deck(list, b, y, deckColour);
    // the roof runs on over the core
    if (k === P.decks) deck(list, { x0: P.core.x0, x1: P.core.x1, z0: P.ramps.z0, z1: P.ramps.z1 }, y, deckColour);
    // the barrier across the hole's far end (over the ramp's foot below)
    if (k % 2 === 1) box(list, P.core.x1, P.x1, y, y + 1, P.ramps.z1, P.ramps.z1 + 0.3, concrete, 'building');
    else box(list, P.x0, P.core.x0, y, y + 1, P.ramps.z0 - 0.3, P.ramps.z0, concrete, 'building');
  }
  // the ramps: from deck k to k + 1, southward in the west lane from even decks, northward in the east lane from odd
  for (let k = 0; k < P.decks; k++) {
    const west = k % 2 === 0, lx = west ? laneB : laneA, edge = west ? P.x1 : P.x0;
    const from = west ? P.ramps.z1 : P.ramps.z0, to = west ? P.ramps.z0 : P.ramps.z1, dir = Math.sign(to - from);
    const cx = (west ? P.core.x1 + P.x1 : P.x0 + P.core.x0) / 2, half = (west ? P.x1 - P.core.x1 : P.core.x0 - P.x0) / 2;
    slab(list, { x: cx, y: level(k), z: from - dir * 0.3 }, { x: cx, y: level(k + 1), z: to + dir * 0.3 }, half, 0.3, deckColour, 'kerb', true);
    // its railing along the facade, a metre over it
    slab(list, { x: edge - Math.sign(edge - lx) * 0.15, y: level(k) + 1, z: from }, { x: edge - Math.sign(edge - lx) * 0.15, y: level(k + 1) + 1, z: to }, 0.15, 1, concrete, 'building');
    // its lane's arrows: a yellow stripe up its middle
    slab(list, { x: lx, y: level(k) + 0.02, z: from + dir * 2 }, { x: lx, y: level(k + 1) + 0.02, z: to - dir * 2 }, 0.1, 0.02, stripe, 'decor');
  }
  // the parapets round every level (the ground's too, but for the door in the east lane's south face; the roof's but
  // for the kicker's gap in the west lane's), and the facades' columns
  for (let k = 0; k <= P.decks; k++) {
    const y = level(k), h = k === P.decks ? 1.1 : 1;
    box(list, P.x0 - 0.3, P.x0, y, y + h, P.z0, P.z1, concrete, 'building');
    box(list, P.x1, P.x1 + 0.3, y, y + h, P.z0, P.z1, concrete, 'building');
    box(list, P.x0 - 0.3, P.x1 + 0.3, y, y + h, P.z1, P.z1 + 0.3, concrete, 'building');
    if (k === 0) box(list, P.core.x0, P.x1 + 0.3, y, y + h, P.z0 - 0.3, P.z0, concrete, 'building');
    else if (k === P.decks) box(list, P.x0 - 0.3, P.core.x1, y, y + h, P.z0 - 0.3, P.z0, concrete, 'building');
    else box(list, P.x0 - 0.3, P.x1 + 0.3, y, y + h, P.z0 - 0.3, P.z0, concrete, 'building');
    // the parapets' yellow coping, the car park's colour from afar
    if (k > 0) for (const [x0, x1, z0, z1] of [[P.x0 - 0.35, P.x0 + 0.05, P.z0, P.z1], [P.x1 - 0.05, P.x1 + 0.35, P.z0, P.z1]] as const) box(list, x0, x1, y + h, y + h + 0.12, z0, z1, stripe, 'decor');
  }
  for (const x of [P.x0 - 0.65, P.x1 + 0.65]) for (let z = P.z0; z <= P.z1 + 0.01; z += (P.z1 - P.z0) / 6) {
    box(list, x - 0.35, x + 0.35, P.floor - 0.5, top + 1.1, z - 0.35, z + 0.35, CITY_COLORS.stone, 'building');
  }
  // the roof's kicker, its lip on the south edge in the west lane, over the z 140 street
  const k: IslandJump = { x: laneB, y: top + KICKER.height, z: P.z0, yaw: Math.PI, length: KICKER.length, height: KICKER.height, half: KICKER.half };
  kicker(list, k);
  // the roof's bays on the core, and a sign in Crown's gold on its north end
  for (let z = P.ramps.z0 + 1; z + 2.6 <= P.ramps.z1 - 1; z += 2.6) box(list, P.core.x0 + 0.3, P.core.x1 - 0.3, top + 0.005, top + 0.02, z, z + 0.12, PALETTE.roadWhite, 'decor');
  box(list, P.core.x0 + 1, P.core.x1 - 1, top + 1.1, top + 3.3, P.z1 - 0.2, P.z1 + 0.1, ACCENTS.crown, 'decor');
  box(list, P.core.x0 + 2.8, P.core.x1 - 2.8, top + 1.5, top + 2.9, P.z1 + 0.1, P.z1 + 0.14, PALETTE.barrier, 'decor');
  return k;
}

/** The office block across the z 140 street whose flat roof takes the car park's jump: its roof a deck over the kit's. */
function landing(ctx: PlaceContext): number {
  const L = LANDING, cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2, hx = (L.x1 - L.x0) / 2, hz = (L.z1 - L.z0) / 2;
  const list = ctx.statics(cx, cz), kit = new Architecture(list), start = list.length;
  const hs: number[] = [];
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) hs.push(ctx.ground.surfaceHeight(cx + a * hx, cz + b * hz));
  const base = Math.max(...hs), foot = Math.min(...hs);
  // its street face toward the street (+Z): turned half round
  kit.building(0, 0, hx, hz, 'crown', 1, 1, L.floors, 0, ACCENTS.crown, false, true);
  kit.box(0, (foot - base - 0.4) / 2, 0, hx + 0.05, (base - foot + 0.4) / 2, hz + 0.05, CITY_COLORS.stone, 'building');
  kit.rotateFrom(start, cx, cz, Math.PI);
  for (let i = start; i < list.length; i++) (list[i] as StaticDesc).position.y += base;
  // the roof a deck over the kit's cornice and plant room, the wheels' ground
  const height = base + buildingHeight('crown', L.floors), roof = height + 1.5;
  box(list, L.x0 - 0.3, L.x1 + 0.3, height + 0.1, roof, L.z0 - 0.3, L.z1 + 0.3, PALETTE.concrete, 'decor');
  box(list, L.x0 - 0.3, L.x1 + 0.3, roof - 0.3, roof, L.z0 - 0.3, L.z1 + 0.3, PALETTE.concrete, 'kerb').collisionOnly = true;
  // the landing's chevrons, pointing the way the cars come
  for (let i = 0; i < 4; i++) {
    const z = L.z1 - 8 - i * 7;
    for (const side of [-1, 1]) slab(list, { x: cx, y: roof + 0.02, z }, { x: cx + side * 5, y: roof + 0.02, z: z + 3.5 }, 0.5, 0.02, i % 2 === 0 ? PALETTE.ramp : PALETTE.barrier, 'decor');
  }
  return roof;
}

/** The police headquarters (`HQ`): the building facing its yard, a sign and a helipad, the yard's walls and gate, the bays. */
function headquarters(ctx: PlaceContext): void {
  const B = HQ.building, Y = HQ.yard, g = ctx.ground;
  const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, hx = (B.z1 - B.z0) / 2, hz = (B.x1 - B.x0) / 2;
  const list = ctx.statics(cx, cz), kit = new Architecture(list), start = list.length;
  const hs: number[] = [];
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) hs.push(g.surfaceHeight(cx + a * hz, cz + b * hx));
  const base = Math.max(...hs), foot = Math.min(...hs), height = buildingHeight('crown', B.floors);
  // its face (local −Z) toward the yard (−X): turned a quarter
  kit.building(0, 0, hx, hz, 'crown', 1, 1, B.floors, 0, PALETTE.policeBlue, false, true, { body: PALETTE.policeWhite });
  kit.box(0, (foot - base - 0.4) / 2, 0, hx + 0.05, (base - foot + 0.4) / 2, hz + 0.05, CITY_COLORS.stone, 'building');
  // a blue band under the cornice all round
  kit.box(0, height - 0.6, 0, hx + 0.08, 0.5, hz + 0.08, PALETTE.policeBlue);
  // the sign over the door: a blue board with a white chequer
  kit.box(0, height - 2.6, -hz - 0.25, 7, 1.1, 0.12, PALETTE.policeBlue);
  for (let i = -3; i <= 3; i++) kit.box(i * 1.6, height - 2.6 + (i % 2 === 0 ? 0.35 : -0.35), -hz - 0.39, 0.4, 0.35, 0.03, PALETTE.policeWhite);
  kit.rotateFrom(start, cx, cz, Math.PI / 2);
  for (let i = start; i < list.length; i++) (list[i] as StaticDesc).position.y += base;
  // the helipad on the roof's south end
  const pad = base + height + 0.7, hpz = B.z1 - 7;
  box(list, cx - 5.5, cx + 5.5, pad - 0.1, pad, hpz - 5.5, hpz + 5.5, PALETTE.charcoal, 'decor');
  for (const dx of [-2, 2]) box(list, cx + dx - 0.35, cx + dx + 0.35, pad, pad + 0.02, hpz - 2.8, hpz + 2.8, PALETTE.barrier, 'decor');
  box(list, cx - 2, cx + 2, pad, pad + 0.02, hpz - 0.35, hpz + 0.35, PALETTE.barrier, 'decor');
  // the flags in front, toward the west avenue
  for (const [i, colour] of [PALETTE.policeBlue, PALETTE.barrier, ACCENTS.crown].entries()) {
    const fx = B.x0 + 6 + i * 7, fz = B.z0 - 2.5, fy = g.surfaceHeight(fx, fz);
    box(list, fx - 0.1, fx + 0.1, fy, fy + 10, fz - 0.1, fz + 0.1, PALETTE.steel, 'decor');
    box(list, fx + 0.1, fx + 2.6, fy + 8.2, fy + 9.8, fz - 0.03, fz + 0.03, colour, 'decor');
  }
  // the yard's walls, a piece every eight metres on the ground under it, the gate's gap on the avenue's side
  const wall = (x0: number, z0: number, x1: number, z1: number): void => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 8));
    for (let i = 0; i < n; i++) {
      const ax = x0 + ((x1 - x0) * i) / n, az = z0 + ((z1 - z0) * i) / n, bx = x0 + ((x1 - x0) * (i + 1)) / n, bz = z0 + ((z1 - z0) * (i + 1)) / n;
      const y = Math.min(g.surfaceHeight(ax, az), g.surfaceHeight(bx, bz));
      const pieces = ctx.statics((ax + bx) / 2, (az + bz) / 2);
      box(pieces, Math.min(ax, bx) - 0.2, Math.max(ax, bx) + 0.2, y - 0.4, y + 1.6, Math.min(az, bz) - 0.2, Math.max(az, bz) + 0.2, CITY_COLORS.stone, 'building');
      box(pieces, Math.min(ax, bx) - 0.25, Math.max(ax, bx) + 0.25, y + 1.6, y + 1.8, Math.min(az, bz) - 0.25, Math.max(az, bz) + 0.25, PALETTE.policeBlue, 'decor');
    }
  };
  wall(Y.x0, Y.z1, Y.x1, Y.z1);
  wall(Y.x0, Y.z0, Y.x0, Y.z1);
  wall(Y.x0, Y.z0, HQ.gate.x0, Y.z0);
  wall(HQ.gate.x1, Y.z0, Y.x1, Y.z0);
  wall(Y.x1, Y.z0, Y.x1, B.z0);
  wall(Y.x1, B.z1, Y.x1, Y.z1);
  // the gate's posts and its raised arm
  for (const gx of [HQ.gate.x0, HQ.gate.x1]) {
    const y = g.surfaceHeight(gx, Y.z0);
    box(list, gx - 0.4, gx + 0.4, y, y + 2.4, Y.z0 - 0.4, Y.z0 + 0.4, PALETTE.policeBlue, 'building');
  }
  const ay = g.surfaceHeight(HQ.gate.x0, Y.z0) + 2.2;
  slab(list, { x: HQ.gate.x0 + 0.5, y: ay, z: Y.z0 }, { x: HQ.gate.x0 + 4.5, y: ay + 5.5, z: Y.z0 }, 0.08, 0.16, PALETTE.ramp, 'decor');
  // the bays' lines, the units' places
  for (const bay of hqBays()) {
    const fx = Math.sin(bay.yaw), y = g.surfaceHeight(bay.x, bay.z) + 0.05;
    for (const side of [-1, 1]) {
      const z = bay.z + side * HQ.bays.width / 2;
      box(list, bay.x - HQ.bays.depth / 2, bay.x + HQ.bays.depth / 2, y, y + 0.015, z - 0.06, z + 0.06, PALETTE.roadWhite, 'decor');
    }
    box(list, bay.x - fx * (HQ.bays.depth / 2 + 0.3) - 0.06, bay.x - fx * (HQ.bays.depth / 2 + 0.3) + 0.06, y, y + 0.015, bay.z - HQ.bays.width / 2, bay.z + HQ.bays.width / 2, PALETTE.policeBlue, 'decor');
  }
}

/** The headquarters' bays where the police units park, noses to the yard's wall or to the building (slice 13's). */
export function hqBays(): Array<{ x: number; z: number; yaw: number }> {
  const out: Array<{ x: number; z: number; yaw: number }> = [];
  HQ.bays.rows.forEach((x, row) => {
    for (let i = 0; i < HQ.bays.count; i++) out.push({ x, z: HQ.bays.z0 + i * HQ.bays.pitch, yaw: row === 0 ? -Math.PI / 2 : Math.PI / 2 });
  });
  return out;
}

/** The hideout as a drop-off (slice 14 wires the run's door to it): the grid's garage, its door on the x 470 street. */
export function hideoutSite(): DropOff {
  const fx = Math.sin(HIDEOUT.yaw), fz = Math.cos(HIDEOUT.yaw), half = GARAGE.depth / 2;
  return {
    name: 'hideout', x: HIDEOUT.x, z: HIDEOUT.z, yaw: HIDEOUT.yaw,
    door: { x: HIDEOUT.x - fx * half, z: HIDEOUT.z - fz * half, yaw: HIDEOUT.yaw, width: GARAGE.doorWidth, height: GARAGE.doorHeight },
    entry: { across: GARAGE.entryAcross, along: GARAGE.entryAlong },
    approachLane: -1,
    lot: { name: 'hideout', cx: 0, cz: 0, sx: 1, sz: 1, ox: 40, oz: 40, setback: 1.3 },
  };
}

/** The hideout's garage (the grid's walls, roof and floor) on its pad. */
function hideout(ctx: PlaceContext): void {
  const list = ctx.statics(HIDEOUT.x, HIDEOUT.z);
  for (const st of hideoutStatics(hideoutSite())) {
    st.position.y += HIDEOUT.floor;
    list.push(st);
  }
}

/** The arcade over the x 290 street: steel columns on both pavements, a glazed roof following the street's fall. */
function arcade(ctx: PlaceContext): void {
  const A = ARCADE, g = ctx.ground, list = ctx.statics(A.x, (A.z0 + A.z1) / 2);
  const road = (z: number): number => g.surfaceHeight(A.x, z);
  const n = A.bays, step = (A.z1 - A.z0) / n;
  for (let i = 0; i <= n; i++) {
    const z = A.z0 + i * step, y = road(z) + A.clear;
    for (const side of [-1, 1]) {
      const x = A.x + side * A.column, foot = g.surfaceHeight(x, z) + 0.1;
      box(list, x - 0.22, x + 0.22, foot, y, z - 0.22, z + 0.22, PALETTE.steel, 'building');
    }
    // a cross beam over each pair
    box(list, A.x - A.half, A.x + A.half, y, y + 0.45, z - 0.18, z + 0.18, PALETTE.graphite, 'decor');
  }
  for (let i = 0; i < n; i++) {
    const za = A.z0 + i * step, zb = za + step, ya = road(za) + A.clear, yb = road(zb) + A.clear;
    // the glass on the beams, the eaves' beams along both sides in Crown's gold, a ridge down the middle
    slab(list, { x: A.x, y: ya + 0.5, z: za }, { x: A.x, y: yb + 0.5, z: zb }, A.half, 0.08, PALETTE.glass, 'decor');
    for (const side of [-1, 1]) slab(list, { x: A.x + side * A.half, y: ya + 0.6, z: za }, { x: A.x + side * A.half, y: yb + 0.6, z: zb }, 0.2, 0.6, ACCENTS.crown, 'decor');
    slab(list, { x: A.x, y: ya + 0.75, z: za }, { x: A.x, y: yb + 0.75, z: zb }, 0.25, 0.3, PALETTE.graphite, 'decor');
  }
}

/** The quarry's edge's jump: the kicker at its rim, straight on from the serpentine's first hairpin. */
function quarryKicker(ctx: PlaceContext): IslandJump {
  const K = QUARRY_KICKER, fx = Math.sin(K.yaw), fz = Math.cos(K.yaw);
  const foot = ctx.ground.surfaceHeight(K.x - fx * K.length, K.z - fz * K.length);
  const k: IslandJump = { x: K.x, y: foot + K.height, z: K.z, yaw: K.yaw, length: K.length, height: K.height, half: K.half };
  kicker(ctx.statics(K.x, K.z), k);
  return k;
}

/** Boulders at the cliffs' foot, a sea stack now and then off them: turned boxes of rock, the island's colours. */
function cliffRocks(ctx: PlaceContext): void {
  const rnd = mulberry32(0xc1f5);
  const rock = (x: number, y: number, z: number, size: number, tall: number, colour: number): void => {
    const list = ctx.statics(x, z);
    const yaw = rnd() * Math.PI * 2, pitch = (rnd() - 0.5) * 0.5;
    list.push({ shape: { kind: 'box', hx: size * (0.7 + rnd() * 0.3), hy: tall / 2, hz: size * (0.6 + rnd() * 0.3) }, position: { x, y, z }, rotation: turn(yaw, pitch), color: colour, tag: 'decor' });
  };
  let carry = 0, stack = 40;
  for (const line of ctx.ground.coasts) {
    const pts = line.pts, n = pts.length, segs = line.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      if (line.kinds[i] !== 'cliff') continue;
      const a = pts[i] as P2, b = pts[(i + 1) % n] as P2, dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      // toward the land; the rocks lie the other way, past the cliff's face
      const nx = (-dz / len) * line.land, nz = (dx / len) * line.land;
      for (let d = carry; d < len; d += 11) {
        const x = a[0] + (dx / len) * d, z = a[1] + (dz / len) * d;
        for (let k = rnd() < 0.6 ? 1 : 2; k > 0; k--) {
          const out = 3.5 + rnd() * 5, size = 1.4 + rnd() * 2.2;
          rock(x - nx * out + (rnd() - 0.5) * 3, SEA.level - 0.6 + size * 0.35, z - nz * out + (rnd() - 0.5) * 3, size, size * (1 + rnd() * 0.6), rnd() < 0.5 ? ISLAND_COLORS.rock : ISLAND_COLORS.cliff);
        }
        stack -= 11;
        if (stack <= 0) {
          stack = 60 + rnd() * 50;
          const out = 14 + rnd() * 14, sx = x - nx * out, sz = z - nz * out, tall = 7 + rnd() * 7;
          rock(sx, SEA.level + tall / 2 - 1.5, sz, 3.5 + rnd() * 1.5, tall, ISLAND_COLORS.cliff);
          rock(sx + (rnd() - 0.5) * 2, SEA.level + tall - 1, sz + (rnd() - 0.5) * 2, 2.2 + rnd(), 3.5, ISLAND_COLORS.rock);
          rock(sx + (rnd() - 0.5) * 6, SEA.level + 0.8, sz + (rnd() - 0.5) * 6, 2.4, 3, ISLAND_COLORS.rock);
        }
      }
      carry = (11 - ((len - carry) % 11)) % 11;
    }
  }
}

/**
 * Crown Heights as the island keeps it: nothing of it moves, so no step; what later slices and the pins read: the jumps
 * the ground does not make (the car park's roof, the quarry's edge; slice 15 registers them), the tower's top, the car
 * park's roof and its landing's, the hideout as a drop-off (slice 14), the headquarters' bays (slice 13).
 */
export interface CrownPlace extends Place {
  readonly id: 'crown';
  readonly jumps: { roof: IslandJump; edge: IslandJump };
  readonly towerTop: V3;
  readonly carParkRoof: number;
  readonly landingRoof: number;
  readonly hideout: DropOff;
  readonly bays: Array<{ x: number; z: number; yaw: number }>;
}

export function crownPlaces(ctx: PlaceContext): Place[] {
  const { x, z } = PLACES.towerTop;
  tower(ctx);
  const roof = carPark(ctx);
  const landingRoof = landing(ctx);
  headquarters(ctx);
  hideout(ctx);
  arcade(ctx);
  const edge = quarryKicker(ctx);
  cliffRocks(ctx);
  const place: CrownPlace = {
    id: 'crown', jumps: { roof, edge }, landingRoof, carParkRoof: CAR_PARK.floor + CAR_PARK.decks * CAR_PARK.rise,
    towerTop: { x, y: ctx.ground.surfaceHeight(x, z) + TOWER.top, z }, hideout: hideoutSite(), bays: hqBays(),
  };
  return [place];
}
