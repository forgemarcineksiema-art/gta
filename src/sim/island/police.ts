/**
 * The police's places on the island (M8.10 slice 15a, docs/M8.10_PLAN.md §1.4), each at its road's height: a deck's, the
 * tunnel's floor, a pavement's top or the ground's (the grid's stand on its flat 0).
 *
 * - The roadblock sites, where they cannot be driven round: 30 m inside each of the tunnel's mouths and 30 m onto each end
 *   of the bay bridge and onto the viaduct's (walls or railings either side: on the island a block stands on the road the
 *   plan puts it on, deck or not), and 60 m short of the centre's roundabout on each of its avenues (the grid's tower
 *   junction's rule); a site on every lane that passes, each way.
 * - The parked patrols' kerbs: one at every junction of the town's avenues and streets 300 m or more from the hideout, on
 *   an arriving lane 8 m short of its stop line, its side a hand off the kerb, clear of the bays (the kerbside ones and
 *   the donut shop's), the garages' doors and the drive-throughs.
 * - The ten speed cameras on the roads the plan names, their lines across the road at its height: a pole on the verge (a
 *   highway's; a taxiway's past the runway's paving), on a pavement's kerb line (a lamp's), or inside a deck's railing.
 * - The thirteen covers the helicopter cannot see into: the places' own registered (the tunnel, the viaduct, five canal
 *   bridges, the stadium's stands, the car park, the arcade, the cranes) and two built here over their roads (the
 *   Gardens' pergola, the Quay's warehouse passage).
 * - The donut shop by the centre's roundabout: its kiosk behind the pavement of the street through the plan's plot, its
 *   two bays at the kerb in front, the lane past it the units that stand down head for.
 *
 * `policeSites` is pure, from the ground and the network, and runs before the fill (which keeps its lots and palms off
 * the poles, the kiosk and the built covers); `buildPoliceSites` lays their statics; `islandCovers` reads the places once
 * they are built; `islandChokepoints` and `islandParkedJunctions` the network. No Three.js.
 */
import { cameraStatics, placeCameras } from '../city/cameras';
import type { CameraSite, Chokepoint, DropOff, ParkedJunction } from '../city/cover';
import { PARKING, type ParkingBay } from '../city/markings';
import { HIGHWAY_LANE_OFFSETS, type Lane, type RoadPoint } from '../city/roads';
import { laneAt, laneLength } from '../city/route';
import { SEA } from '../city/sea';
import { ASPHALT } from '../city/surface';
import { ACCENTS, CITY_COLORS, ISLAND_COLORS, PALETTE } from '../palette';
import type { DonutSite } from '../police/Donuts';
import { POLICE } from '../police/tuning';
import { quatFromYaw, type StaticDesc } from '../scene';
import { TRAFFIC } from '../traffic/tuning';
import { CAR_PRESETS } from '../vehicle/presets';
import { inLot, reserved, type Rect } from './fill';
import type { P2 } from './geom';
import { HALF_WIDTH, type GradedRoad, type Ground } from './ground';
import type { Island } from './Island';
import type { IslandNetwork } from './network';
import { turn } from './places/crown';
import { SEATS } from './places/quay';
import { BRIDGE, type WorksPlace } from './places/works';
import { CAMERAS, COVERS, PLACES, RINGS, ROADBLOCK_SITES, type CoverKind, type RoadClass } from './plan';
import { ARCADE, CAR_PARK } from './shapes/crown';
import { OVAL, STADIUM_LEVEL, STANDS } from './shapes/quay';
import { DECK, type Piece } from './structures';
import { PAVEMENT } from './surfaces';

/** A box a car hides in: its middle, the way its +Z runs (quatFromYaw's), its half sizes, the heights a car's middle hides between. */
export interface CoverBox { x: number; z: number; yaw: number; hx: number; hz: number; y0: number; y1: number }
/** One of the plan's covers: its kind, its plan point, how far its boxes reach from it, its boxes, a spot a car hides in. */
export interface IslandCover { kind: CoverKind; x: number; z: number; r: number; boxes: CoverBox[]; spot: { x: number; y: number; z: number } }
/**
 * A cover built here over a road: its kind, its road (a graded road's id), the half width inside its posts or walls, its
 * pieces along the road (each's middle on the road's surface, its heading and climb, its length), its footprint.
 */
export interface Shelter { kind: 'pergola' | 'warehouse'; road: string; half: number; clear: number; pieces: Piece[]; rect: Rect }
/** The police's places that stand, worked out before the fill: the cameras, the pergola and the passage, the donut shop. */
export interface PoliceSites {
  cameras: CameraSite[];
  shelters: Shelter[];
  donut: DonutSite;
  /** The kiosk's footprint and its floor's foot (the lowest ground under it). */
  kiosk: Rect & { foot: number };
  /** What the fill keeps its lots and palms off. */
  keep: Rect[];
}

/** A roadblock stands this far inside a tunnel's mouth or onto a deck from its end (m). */
const INTO = 30;
/** On the roundabout's avenues it stands this far short of the ring (m: the grid's tower junction's 60). */
const APPROACH = 60;
/**
 * A parked patrol (m): short of its lane's end (the stop line) by this, its side off the kerb by this; the hideout this
 * far off (the grid's); a bay (the traffic's, the donut shop's) this far off; a garage's door or a drive-through this far.
 */
const PARKED = { back: 8, kerb: 0.35, hideout: 300, bay: 7, door: 25 } as const;
/** A camera keeps this far along its road from a junction's middle (m). */
const CAMERA_CLEAR = 30;
/** A camera's pole (m): out on a verge past the carriageway (the grid's highway's), on a pavement's kerb line (a lamp's), inside a deck's edge. */
const POLE = { verge: 2, kerb: 0.7, deck: 0.5 } as const;
/**
 * The roads the plan's cameras watch, in its order (§1.4: the tunnel's exit, the viaduct, the east straight, the bay
 * bridge, the south and west highway, the foot of Crown Avenue, the runway, the beach road, the harbour road): where a
 * point lies on two roads (the east straight's over the taxiway), the plan's is this one.
 */
const CAMERA_ROADS: readonly string[] = ['highway', 'highway', 'highway', 'highway', 'highway', 'highway', 'crown-avenue-up', 'runway-link', 'beach-road', 'harbour-road'];
/** Each road class's limit, the traffic's own (`streetMap.ts`'s kinds): the grid's highway 22 and avenue 16 m/s. */
const LIMIT: Readonly<Record<RoadClass, number>> = {
  highway: TRAFFIC.speedHighway, avenue: TRAFFIC.speedAvenue, ramp: TRAFFIC.speedAvenue, street: TRAFFIC.speedStreet, side: TRAFFIC.speedStreet,
  serpentine: TRAFFIC.speedParkway, dirt: TRAFFIC.speedService, taxiway: TRAFFIC.speedService,
};
/** The classes with a pavement both sides. */
const PAVED: ReadonlySet<RoadClass> = new Set<RoadClass>(['avenue', 'street', 'side']);
/** The pergola and the warehouse passage (m): the covered length, a piece's, the clear height under the roof over the road. */
const SHELTER = { pergola: { length: 42, piece: 6, clear: 5.2 }, warehouse: { length: 48, piece: 8, clear: 6.4 } } as const;
/** The donut shop's kiosk (m, the grid's mesh): its half sizes and height, how far behind the pavement it stands. */
const KIOSK = { hx: 2.1, hz: 1.5, height: 2.8, setback: 0.6 } as const;

// ---------------------------------------------------------------- the roads' geometry

/** A graded road's stations: the length along it at each point (a closed one's last is the whole loop). */
function stations(r: GradedRoad): number[] {
  const out = [0], n = r.pts.length, last = r.closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = r.pts[i] as P2, b = r.pts[(i + 1) % n] as P2;
    out.push((out[i] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return out;
}

/** The point `s` along a graded road (clamped, wrapped on a closed one) and its heading. */
function roadPoint(r: GradedRoad, st: readonly number[], s: number): { x: number; z: number; yaw: number } {
  const total = st[st.length - 1] as number, n = r.pts.length;
  const d = r.closed ? ((s % total) + total) % total : Math.max(0, Math.min(total, s));
  let i = 0;
  while (i + 2 < st.length && (st[i + 1] as number) < d) i++;
  const a = r.pts[i % n] as P2, b = r.pts[(i + 1) % n] as P2, len = (st[i + 1] as number) - (st[i] as number), t = len > 0 ? (d - (st[i] as number)) / len : 0;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

/** The nearest point to (x, z) on a graded road of one of `classes`: the road's index, the station there, its distance. */
function nearestGraded(ground: Ground, x: number, z: number, classes: ReadonlySet<RoadClass>): { road: number; s: number; d: number } {
  let best = { road: -1, s: 0, d: Infinity };
  ground.roads.forEach((r, k) => {
    if (!classes.has(r.cls)) return;
    const n = r.pts.length, last = r.closed ? n : n - 1;
    let acc = 0;
    for (let i = 0; i < last; i++) {
      const a = r.pts[i] as P2, b = r.pts[(i + 1) % n] as P2, dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (len * len || 1)));
      const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
      if (d < best.d) best = { road: k, s: acc + t * len, d };
      acc += len;
    }
  });
  return best;
}

type Line = IslandNetwork['lines'][number];

/** A network line's point `s` along it (clamped, wrapped on a closed one): where, its height (a deck's or the ground's), its heading. */
function linePoint(line: Line, s: number): { x: number; y: number; z: number; yaw: number } {
  const total = line.s[line.s.length - 1] as number, n = line.pts.length;
  const d = line.closed ? ((s % total) + total) % total : Math.max(0, Math.min(total, s));
  let i = 0;
  while (i + 2 < line.s.length && (line.s[i + 1] as number) < d) i++;
  const a = line.pts[i % n] as RoadPoint, b = line.pts[(i + 1) % n] as RoadPoint;
  const len = (line.s[i + 1] as number) - (line.s[i] as number), t = len > 0 ? (d - (line.s[i] as number)) / len : 0;
  return { x: a.x + (b.x - a.x) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
}

/** The station of (x, z) on a network line (its nearest point). */
function lineStation(line: Line, x: number, z: number): number {
  let best = Infinity, at = 0;
  const n = line.pts.length, last = line.closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = line.pts[i] as RoadPoint, b = line.pts[(i + 1) % n] as RoadPoint, dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2)), d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best) { best = d; at = (line.s[i] as number) + t * Math.sqrt(len2); }
  }
  return at;
}

/** A lane's station nearest (x, z): with the road's height `y` given, a lane over or under counts its gap (4× as the lane index does). */
function laneStation(lane: Lane, x: number, z: number, y: number): { s: number; d: number; y: number } {
  let best = { s: 0, d: Infinity, y: 0 }, acc = 0;
  for (let i = 0; i + 1 < lane.points.length; i++) {
    const a = lane.points[i] as RoadPoint, b = lane.points[i + 1] as RoadPoint, dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (len * len || 1)));
    const py = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t, 2 * (y - py));
    if (d < best.d) best = { s: acc + t * len, d, y: py };
    acc += len;
  }
  return best;
}

/** A turned rectangle round a run of pieces: its middle, the chord's heading, its half sizes grown by `pad` and its bow. */
function runRect(pieces: readonly Piece[], half: number, pad: number): Rect {
  const a = pieces[0] as Piece, b = pieces[pieces.length - 1] as Piece;
  const ax = a.x - Math.sin(a.yaw) * a.length / 2, az = a.z - Math.cos(a.yaw) * a.length / 2;
  const bx = b.x + Math.sin(b.yaw) * b.length / 2, bz = b.z + Math.cos(b.yaw) * b.length / 2;
  const yaw = Math.atan2(bx - ax, bz - az), fx = Math.sin(yaw), fz = Math.cos(yaw), mx = (ax + bx) / 2, mz = (az + bz) / 2;
  // the run's bow off its chord
  let bow = 0;
  for (const p of pieces) bow = Math.max(bow, Math.abs(-(p.x - mx) * fz + (p.z - mz) * fx));
  return { x: mx, z: mz, yaw, hx: half + pad + bow, hz: Math.hypot(bx - ax, bz - az) / 2 + pad };
}

// ---------------------------------------------------------------- the places that stand, before the fill

/** The cameras, the pergola and the passage, the donut shop: pure, from the ground and the network; `stand` is a pavement's top or the ground. */
export function policeSites(ground: Ground, net: IslandNetwork, stand: (x: number, z: number) => number): PoliceSites {
  const cameras = CAMERAS.map((at, i) => cameraSite(ground, net, stand, at, CAMERA_ROADS[i] ?? 'highway'));
  const shelters: Shelter[] = [];
  for (const c of COVERS) if (c.kind === 'pergola' || c.kind === 'warehouse') shelters.push(shelter(ground, c.kind, c.at));
  const { site: donut, kiosk } = donutSite(ground);
  const keep: Rect[] = [...cameras.map((c): Rect => ({ x: c.poleX, z: c.poleZ, yaw: 0, hx: 0.5, hz: 0.5 })), ...shelters.map((s) => s.rect), kiosk];
  return { cameras, shelters, donut, kiosk, keep };
}

/**
 * A camera on its road near the plan's point, clear of the junctions along it: its line across the road at the road's
 * height (a deck's where it rides one), its pole on the verge, the kerb line or the deck's edge (a highway's on the side
 * away from the island's middle, as the grid's; another road's on its right first), standing on what is there.
 */
function cameraSite(ground: Ground, net: IslandNetwork, stand: (x: number, z: number) => number, at: P2, roadId: string): CameraSite {
  const line = net.lines.find((l) => l.id === roadId) as Line;
  const nodes = net.graph.nodes, s0 = lineStation(line, at[0], at[1]);
  let p = linePoint(line, s0);
  for (let k = 0; k <= 30; k++) {
    const q = linePoint(line, s0 + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 5);
    if (nodes.every((n) => Math.hypot(n.x - q.x, n.z - q.z) >= CAMERA_CLEAR)) { p = q; break; }
  }
  const hw = HALF_WIDTH[line.cls], paved = PAVED.has(line.cls);
  // on a deck: over the sea, or high over the ground under it (the physics' ground: the canal and the passages dug)
  const deck = !ground.onLand(p.x, p.z) || p.y - ground.height(p.x, p.z) > 1.5;
  const deckHalf = line.cls === 'highway' ? DECK.half : paved ? hw + PAVEMENT + BRIDGE.margin : hw + 1;
  const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
  const first = line.cls === 'highway' && rx * p.x + rz * p.z < 0 ? -1 : 1;
  for (const side of [first, -first]) {
    let off = deck ? deckHalf - POLE.deck : paved ? hw + POLE.kerb : hw + POLE.verge;
    let px = p.x + rx * side * off, pz = p.z + rz * side * off;
    // a taxiway's pole past the paving it runs on (the runway's)
    for (let k = 0; line.cls === 'taxiway' && !deck && k < 10 && ground.surface(px, pz) === ASPHALT; k++) {
      off += 2;
      px = p.x + rx * side * off;
      pz = p.z + rz * side * off;
    }
    const py = deck ? p.y : stand(px, pz);
    if (deck || (ground.onLand(px, pz) && Math.abs(py - p.y) < 2 && !ground.nearOtherRoad(px, pz, -1, 0.3))) {
      return { x: p.x, z: p.z, yaw: p.yaw, halfWidth: hw, poleX: px, poleZ: pz, limitMs: LIMIT[line.cls], y: p.y, poleY: py };
    }
  }
  // (never on the plan's roads: the pole at the carriageway's edge)
  return { x: p.x, z: p.z, yaw: p.yaw, halfWidth: hw, poleX: p.x + rx * (hw + 0.5), poleZ: p.z + rz * (hw + 0.5), limitMs: LIMIT[line.cls], y: p.y, poleY: p.y };
}

/**
 * The pergola or the warehouse passage over the paved road nearest the plan's point: the stretch nearest it whose middle
 * and walls are off every other road (no junction under it), on land and off the plan's places; its pieces on the road.
 */
function shelter(ground: Ground, kind: 'pergola' | 'warehouse', at: P2): Shelter {
  const cfg = SHELTER[kind], hit = nearestGraded(ground, at[0], at[1], PAVED);
  const road = ground.roads[hit.road] as GradedRoad, st = stations(road), total = st[st.length - 1] as number;
  const half = HALF_WIDTH[road.cls] + PAVEMENT + 0.3, L = cfg.length;
  const clear = (sc: number): boolean => {
    if (!road.closed && (sc - L / 2 < 0 || sc + L / 2 > total)) return false;
    for (let u = -L / 2 - 2; u <= L / 2 + 2; u += 3) {
      const q = roadPoint(road, st, sc + u), rx = -Math.cos(q.yaw), rz = Math.sin(q.yaw);
      if (ground.nearOtherRoad(q.x, q.z, hit.road, 2)) return false;
      for (const side of [-1, 1]) {
        const wx = q.x + rx * side * (half + 0.6), wz = q.z + rz * side * (half + 0.6);
        if (!ground.onLand(wx, wz) || ground.nearOtherRoad(wx, wz, hit.road, 1) || reserved(wx, wz)) return false;
      }
    }
    return true;
  };
  let sc = hit.s;
  for (let k = 0; k <= 80; k++) {
    const cand = hit.s + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 3;
    if (clear(cand)) { sc = cand; break; }
  }
  const n = Math.round(L / cfg.piece), len = L / n, pieces: Piece[] = [];
  for (let i = 0; i < n; i++) {
    const a = roadPoint(road, st, sc - L / 2 + i * len), b = roadPoint(road, st, sc - L / 2 + (i + 1) * len);
    const ya = ground.surfaceHeight(a.x, a.z), yb = ground.surfaceHeight(b.x, b.z), run = Math.hypot(b.x - a.x, b.z - a.z);
    pieces.push({ x: (a.x + b.x) / 2, y: (ya + yb) / 2, z: (a.z + b.z) / 2, yaw: Math.atan2(b.x - a.x, b.z - a.z), pitch: Math.atan2(yb - ya, run), length: Math.hypot(run, yb - ya) });
  }
  return { kind, road: road.id, half, clear: cfg.clear, pieces, rect: runRect(pieces, half, 1) };
}

/**
 * The donut shop: its kiosk behind the pavement of the paved road nearest the plan's plot, facing it; the two bays at
 * that kerb in front of it (the traffic's kerbside bays' size and kerb gap), the cars facing the way that side's lane
 * runs; that lane's point before it, where the units that stand down head.
 */
function donutSite(ground: Ground): { site: DonutSite; kiosk: Rect & { foot: number } } {
  const plot = PLACES.donutShop, cx = (plot.x0 + plot.x1) / 2, cz = (plot.z0 + plot.z1) / 2;
  const hit = nearestGraded(ground, cx, cz, PAVED), road = ground.roads[hit.road] as GradedRoad, st = stations(road);
  const q = roadPoint(road, st, hit.s), hw = HALF_WIDTH[road.cls];
  const fx = Math.sin(q.yaw), fz = Math.cos(q.yaw), rx = -fz, rz = fx;
  // toward the plot, square to the road
  const side = (cx - q.x) * rx + (cz - q.z) * rz >= 0 ? 1 : -1, nx = rx * side, nz = rz * side;
  const out = hw + PAVEMENT + KIOSK.setback + KIOSK.hz, kx = q.x + nx * out, kz = q.z + nz * out, yaw = Math.atan2(-nx, -nz);
  // its floor on the highest ground under it, its plinth down to the lowest
  let top = -Infinity, foot = Infinity;
  for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 0]] as const) {
    const h = ground.surfaceHeight(kx + fx * KIOSK.hx * a + nx * KIOSK.hz * b, kz + fz * KIOSK.hx * a + nz * KIOSK.hz * b);
    top = Math.max(top, h);
    foot = Math.min(foot, h);
  }
  // the bays: the kerbside bays' rule (their middle `hw − 0.2 − width / 2` off the road's middle), end to end before it
  const along = side > 0 ? q.yaw : q.yaw + Math.PI, o = hw - 0.2 - PARKING.width / 2;
  const bays: ParkingBay[] = [-1, 1].map((k) => ({
    road: road.id, x: q.x + nx * o + fx * k * PARKING.length / 2, z: q.z + nz * o + fz * k * PARKING.length / 2, yaw: along, width: PARKING.width, length: PARKING.length,
  }));
  // the lane on the shop's side of the road (the network's offset: `Math.min(4.5, hw − 3.5)`)
  const lane = Math.min(4.5, hw - 3.5);
  const site: DonutSite = { x: kx, y: top, z: kz, yaw, laneX: q.x + nx * lane, laneZ: q.z + nz * lane, laneYaw: along, range: 260, away: 420, bays };
  return { site, kiosk: { x: kx, z: kz, yaw, hx: KIOSK.hx + 0.3, hz: KIOSK.hz + 0.9, foot } };
}

/** A prop's footprint (its middle, its reach `r`) on a camera's pole, the kiosk or under a built cover: the props keep off them. */
export function propKept(sites: PoliceSites, x: number, z: number, r: number): boolean {
  for (const c of sites.cameras) if (Math.hypot(c.poleX - x, c.poleZ - z) < 0.6 + r) return true;
  if (inLot(sites.kiosk, x, z, 1 + r)) return true;
  for (const s of sites.shelters) if (inLot(s.rect, x, z, r)) return true;
  return false;
}

// ---------------------------------------------------------------- their statics

/** The cameras' poles and heads, the pergola and the passage, the kiosk's collider and plinth, into the island's chunks. */
export function buildPoliceSites(island: Island, statics: (x: number, z: number) => StaticDesc[]): void {
  const sites = island.policeSites;
  for (const cam of placeCameras(sites.cameras, sites.cameras.length)) statics(cam.poleX, cam.poleZ).push(...cameraStatics(cam));
  for (const s of sites.shelters) (s.kind === 'pergola' ? pergola : passage)(island, s, statics);
  // the kiosk (drawn apart, `buildDonutShop`): its collider, and a plinth where the ground falls away under it
  const d = sites.donut, k = sites.kiosk, list = statics(d.x, d.z), q = quatFromYaw(d.yaw);
  list.push({ shape: { kind: 'box', hx: KIOSK.hx, hy: KIOSK.height / 2, hz: KIOSK.hz }, position: { x: d.x, y: d.y + KIOSK.height / 2, z: d.z }, rotation: q, color: PALETTE.iceCream, tag: 'building', collisionOnly: true });
  if (d.y - k.foot > 0.02) {
    const h = d.y - k.foot + 0.3;
    list.push({ shape: { kind: 'box', hx: KIOSK.hx + 0.15, hy: h / 2, hz: KIOSK.hz + 0.15 }, position: { x: d.x, y: d.y - h / 2, z: d.z }, rotation: q, color: CITY_COLORS.stone, tag: 'building' });
  }
}

/** The points a run of pieces starts and ends at, in order (each piece's start, then the last's end), on the road. */
function ends(pieces: readonly Piece[]): Array<{ x: number; y: number; z: number; yaw: number }> {
  const out = pieces.map((p) => ({ x: p.x - Math.sin(p.yaw) * Math.cos(p.pitch) * p.length / 2, y: p.y - Math.sin(p.pitch) * p.length / 2, z: p.z - Math.cos(p.yaw) * Math.cos(p.pitch) * p.length / 2, yaw: p.yaw }));
  const b = pieces[pieces.length - 1] as Piece;
  out.push({ x: b.x + Math.sin(b.yaw) * Math.cos(b.pitch) * b.length / 2, y: b.y + Math.sin(b.pitch) * b.length / 2, z: b.z + Math.cos(b.yaw) * Math.cos(b.pitch) * b.length / 2, yaw: b.yaw });
  return out;
}

/**
 * The Gardens' pergola over its street: timber posts past both pavements (solid), beams across, rails along the eaves, a
 * roof of vines (solid, as the grid's tree canopy: the police's sight, the helicopter and the camera's boom meet it) with
 * the Gardens' pink in flower on it, following the street's fall.
 */
function pergola(island: Island, s: Shelter, statics: (x: number, z: number) => StaticDesc[]): void {
  const W = s.half, timber = ISLAND_COLORS.timber;
  const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw: number, pitch: number, color: number, tag: string): void => {
    statics(x, z).push({ shape: { kind: 'box', hx, hy, hz }, position: { x, y, z }, rotation: turn(yaw, pitch), color, tag });
  };
  for (const e of ends(s.pieces)) {
    const rx = -Math.cos(e.yaw), rz = Math.sin(e.yaw), top = e.y + s.clear + 0.45;
    for (const side of [-1, 1]) {
      const px = e.x + rx * side * W, pz = e.z + rz * side * W, foot = island.standAt(px, pz) - 0.1;
      box(px, (top + foot) / 2, pz, 0.16, (top - foot) / 2, 0.16, e.yaw, 0, timber, 'building');
    }
    box(e.x, e.y + s.clear + 0.3, e.z, W + 0.5, 0.15, 0.12, e.yaw, 0, timber, 'decor');
  }
  s.pieces.forEach((p, i) => {
    const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw), fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    box(p.x, p.y + s.clear + 0.62, p.z, W + 0.7, 0.17, p.length / 2 + 0.05, p.yaw, p.pitch, CITY_COLORS.leaves, 'building');
    for (const side of [-1, 1]) box(p.x + rx * side * W, p.y + s.clear + 0.45, p.z + rz * side * W, 0.1, 0.12, p.length / 2 + 0.1, p.yaw, p.pitch, timber, 'decor');
    // the vines' lumps and the flowers on them
    for (let k = 0; k < 3; k++) {
      const u = ((i * 7 + k * 5) % 11) / 11 * 2 - 1, v = (((i * 3 + k * 7) % 9) / 9 - 0.5) * 0.8;
      const x = p.x + rx * u * (W - 1) + fx * v * p.length, z = p.z + rz * u * (W - 1) + fz * v * p.length;
      box(x, p.y + s.clear + 0.9 + Math.tan(p.pitch) * v * p.length, z, 1.3, 0.25, 1.1, p.yaw + k, 0, k === 1 ? ACCENTS.gardens : CITY_COLORS.hedge, 'decor');
    }
  });
}

/**
 * The Quay's warehouse passage over its road (the grid's covered street, turned and sloped): brick walls past both
 * pavements with high windows, a flat roof and its ridge following the road's fall (solid), brick lintels over both
 * open ends with the Quay's band, a lamp under each piece.
 */
function passage(island: Island, s: Shelter, statics: (x: number, z: number) => StaticDesc[]): void {
  const W = s.half, g = island.ground;
  const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw: number, pitch: number, color: number, tag: string): void => {
    statics(x, z).push({ shape: { kind: 'box', hx, hy, hz }, position: { x, y, z }, rotation: turn(yaw, pitch), color, tag });
  };
  for (const p of s.pieces) {
    const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw), fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rise = Math.abs(Math.sin(p.pitch)) * p.length / 2;
    for (const side of [-1, 1]) {
      const wx = p.x + rx * side * (W + 0.3), wz = p.z + rz * side * (W + 0.3);
      let foot = Infinity;
      for (const a of [-1, 0, 1]) foot = Math.min(foot, g.surfaceHeight(wx + fx * a * p.length / 2, wz + fz * a * p.length / 2));
      const top = p.y + rise + s.clear + 1.2, bottom = foot - 0.4;
      box(wx, (top + bottom) / 2, wz, 0.3, (top - bottom) / 2, p.length / 2 + 0.05, p.yaw, 0, CITY_COLORS.brick, 'building');
      box(p.x + rx * side * (W - 0.02), p.y + s.clear - 0.7, p.z + rz * side * (W - 0.02), 0.02, 0.45, p.length / 2 - 1, p.yaw, p.pitch, CITY_COLORS.windowLight, 'decor');
    }
    box(p.x, p.y + s.clear + 1, p.z, W + 0.9, 0.2, p.length / 2 + 0.05, p.yaw, p.pitch, CITY_COLORS.roof, 'building');
    box(p.x, p.y + s.clear + 1.55, p.z, 2.2, 0.35, p.length / 2 + 0.05, p.yaw, p.pitch, CITY_COLORS.roof, 'decor');
    box(p.x, p.y + s.clear + 0.75, p.z, 0.5, 0.05, 0.5, p.yaw, p.pitch, PALETTE.laneMark, 'decor');
  }
  const e = ends(s.pieces);
  for (const [q, out] of [[e[0], -1], [e[e.length - 1], 1]] as const) {
    if (!q) continue;
    const fx = Math.sin(q.yaw), fz = Math.cos(q.yaw);
    box(q.x, q.y + s.clear + 0.55, q.z, W + 0.6, 0.65, 0.35, q.yaw, 0, CITY_COLORS.brick, 'building');
    box(q.x + fx * out * 0.37, q.y + s.clear + 0.55, q.z + fz * out * 0.37, W - 1, 0.18, 0.02, q.yaw, 0, ACCENTS.marina, 'decor');
  }
}

// ---------------------------------------------------------------- the covers

/**
 * The plan's thirteen covers as the helicopter reads them: the boxes a car hides in under each (the tunnel's pieces, the
 * viaduct's deck where it stands over the ground or the water, each canal bridge's deck over the channel, the stands'
 * concourse, the car park's floors under its roof, the arcade's glass, the cranes' portals, the pergola's vines, the
 * passage's roof), and a spot on the ground under each. Reads the places once built.
 */
export function islandCovers(island: Island): IslandCover[] {
  const g = island.ground, works = island.places.find((p) => p.id === 'works') as WorksPlace | undefined;
  const out: IslandCover[] = [];
  const add = (kind: CoverKind, at: P2, boxes: CoverBox[], spot: { x: number; y: number; z: number }): void => {
    let r = 0;
    for (const b of boxes) r = Math.max(r, Math.hypot(b.x - at[0], b.z - at[1]) + Math.hypot(b.hx, b.hz));
    out.push({ kind, x: at[0], z: at[1], r, boxes, spot });
  };
  const nearest = <T extends { x: number; z: number }>(list: readonly T[], at: P2): T => list.reduce((a, b) => (Math.hypot(b.x - at[0], b.z - at[1]) < Math.hypot(a.x - at[0], a.z - at[1]) ? b : a));
  for (const c of COVERS) {
    const [x, z] = c.at;
    switch (c.kind) {
      case 'tunnel': {
        const tunnel = island.structures.find((s) => s.kind === 'tunnel');
        if (!tunnel) break;
        const p = nearest(tunnel.pieces, c.at);
        add('tunnel', c.at, tunnel.pieces.map((q) => ({ x: q.x, z: q.z, yaw: q.yaw, hx: DECK.half, hz: q.length / 2 + 0.3, y0: q.y - 1.5, y1: q.y + DECK.clear - 0.2 })), { x: p.x, y: p.y + 0.6, z: p.z });
        break;
      }
      case 'viaduct': {
        const viaduct = island.structures.find((s) => s.kind === 'viaduct');
        if (!viaduct) break;
        // anything under its deck; the spot on the land under it with room for a car, nearest the plan's point (else on the water)
        const room = viaduct.pieces.filter((q) => g.onLand(q.x, q.z) && q.y - DECK.depth - g.height(q.x, q.z) > 3);
        const p = room.length > 0 ? nearest(room, c.at) : nearest(viaduct.pieces, c.at);
        const floor = room.length > 0 ? g.height(p.x, p.z) : SEA.level;
        add('viaduct', c.at, viaduct.pieces.map((q) => ({ x: q.x, z: q.z, yaw: q.yaw, hx: DECK.half, hz: q.length / 2 + 0.3, y0: -20, y1: q.y - DECK.depth - 0.1 })), { x: p.x, y: floor + 0.6, z: p.z });
        break;
      }
      case 'bridge': {
        if (!works || works.bridges.length === 0) break;
        // the canal's channel under the bridge's deck, across its road
        const b = nearest(works.bridges, c.at), road = g.roads.find((r) => r.id === b.road);
        let yaw = 0, best = Infinity;
        if (road) for (let i = 0; i + 1 < road.pts.length; i++) {
          const a = road.pts[i] as P2, e = road.pts[i + 1] as P2, d = Math.hypot((a[0] + e[0]) / 2 - b.x, (a[1] + e[1]) / 2 - b.z);
          if (d < best) { best = d; yaw = Math.atan2(e[0] - a[0], e[1] - a[1]); }
        }
        const cls = road?.cls ?? 'street', hw = HALF_WIDTH[cls], half = cls === 'highway' ? hw + 1 : PAVED.has(cls) ? hw + PAVEMENT + BRIDGE.margin : hw + 1;
        add('bridge', c.at, [{ x: b.x, z: b.z, yaw, hx: half, hz: PLACES.canalWidth / 2 + 2, y0: b.floor - 1, y1: b.underside - 0.1 }], { x: b.x, y: b.floor + 0.6, z: b.z });
        break;
      }
      case 'stadium': {
        // the concourse under the stands' seats, a box a segment round the oval
        const o = OVAL, level = STADIUM_LEVEL, S = SEATS.segments;
        const pt = (t: number, d: number): P2 => {
          const ct = Math.cos(t), stt = Math.sin(t), nx = o.rz * ct, nz = o.r * stt, nl = Math.hypot(nx, nz);
          return [o.x + o.r * ct + (nx / nl) * d, o.z + o.rz * stt + (nz / nl) * d];
        };
        const boxes: CoverBox[] = [];
        for (let k = 0; k < S; k++) {
          const t0 = (2 * Math.PI * k) / S, t1 = (2 * Math.PI * (k + 1)) / S, tm = (t0 + t1) / 2;
          const f = pt(tm, STANDS.front), b = pt(tm, STANDS.back), b0 = pt(t0, STANDS.back), b1 = pt(t1, STANDS.back);
          boxes.push({ x: (f[0] + b[0]) / 2, z: (f[1] + b[1]) / 2, yaw: Math.atan2(b[0] - f[0], b[1] - f[1]), hx: Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) / 2 + 0.3, hz: Math.hypot(b[0] - f[0], b[1] - f[1]) / 2, y0: level - 1, y1: level + SEATS.low - 1 });
        }
        const [sx, sz] = pt(Math.atan2((z - o.z) / o.rz, (x - o.x) / o.r), (STANDS.front + STANDS.back) / 2);
        add('stadium', c.at, boxes, { x: sx, y: level + 0.6, z: sz });
        break;
      }
      case 'carpark': {
        const P = CAR_PARK, roof = P.floor + P.decks * P.rise;
        add('carpark', c.at, [{ x: (P.x0 + P.x1) / 2, z: (P.z0 + P.z1) / 2, yaw: 0, hx: (P.x1 - P.x0) / 2, hz: (P.z1 - P.z0) / 2, y0: P.floor - 1, y1: roof - 0.4 }],
          { x: P.lanes[0], y: P.floor + 0.6, z: (P.z0 + P.ramps.z0) / 2 });
        break;
      }
      case 'arcade': {
        const A = ARCADE, step = (A.z1 - A.z0) / A.bays, road = (zz: number): number => g.surfaceHeight(A.x, zz), boxes: CoverBox[] = [];
        for (let i = 0; i < A.bays; i++) {
          const za = A.z0 + i * step, low = Math.min(road(za), road(za + step));
          boxes.push({ x: A.x, z: za + step / 2, yaw: 0, hx: A.half, hz: step / 2, y0: low - 1.5, y1: low + A.clear - 0.2 });
        }
        const mid = (A.z0 + A.z1) / 2;
        add('arcade', c.at, boxes, { x: A.x, y: road(mid) + 0.6, z: mid });
        break;
      }
      case 'cranes': {
        // each crane's portal between its legs (x ± 7, z ± 7.5), up to its sills
        const cranes = PLACES.cranes.map(([cx, cz]) => ({ x: cx, z: cz, y: g.surfaceHeight(cx, cz) }));
        const m = nearest(cranes, c.at);
        add('cranes', c.at, cranes.map((q) => ({ x: q.x, z: q.z, yaw: 0, hx: 7, hz: 7.5, y0: q.y - 1, y1: q.y + 21 })), { x: m.x, y: m.y + 0.6, z: m.z });
        break;
      }
      case 'pergola':
      case 'warehouse': {
        const s = island.policeSites.shelters.find((q) => q.kind === c.kind);
        if (!s) break;
        const p = s.pieces[s.pieces.length >> 1] as Piece;
        add(c.kind, c.at, s.pieces.map((q) => ({ x: q.x, z: q.z, yaw: q.yaw, hx: s.half, hz: q.length / 2 + 0.1, y0: q.y - 2, y1: q.y + s.clear - 0.2 })), { x: p.x, y: p.y + 0.6, z: p.z });
        break;
      }
    }
  }
  return out;
}

/** Whether a car's middle at (x, y, z) is under one of the covers (inside one of its boxes, between its heights). */
export function underCover(covers: readonly IslandCover[], x: number, y: number, z: number): boolean {
  for (const c of covers) {
    if (Math.hypot(x - c.x, z - c.z) > c.r) continue;
    for (const b of c.boxes) {
      if (y < b.y0 || y > b.y1) continue;
      const dx = x - b.x, dz = z - b.z, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
      if (Math.abs(dx * fx + dz * fz) <= b.hz && Math.abs(dz * fx - dx * fz) <= b.hx) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- the roadblock sites and the parked patrols

/** A roadblock site on the island: the grid's chokepoint and which of the plan's sites it is (`ROADBLOCK_SITES`' index). */
export interface IslandChokepoint extends Chokepoint { site: number }

/**
 * The plan's six roadblock sites as chokepoints: at a structure's end (the tunnel's mouths, the bay bridge's ends, the
 * viaduct's), `INTO` m inside it on every highway lane there, each way; at the centre's roundabout, `APPROACH` m short of
 * the ring on every avenue arriving at it. Each on its lane's line at the road's height, its spike strip `spikeBefore` m
 * before it across the open side (the other lane of its way, or the oncoming lane), as the grid's.
 */
export function islandChokepoints(island: Island): IslandChokepoint[] {
  const net = island.network, graph = net.graph, out: IslandChokepoint[] = [];
  const [inner, outer] = HIGHWAY_LANE_OFFSETS;
  const push = (lane: Lane, s: number, site: number): void => {
    const p = laneAt(lane, s), spikeRight = lane.highway ? (lane.offset === inner ? outer - inner : inner - outer) : -2 * lane.offset;
    const q = laneAt(lane, Math.max(0, s - POLICE.roadblock.spikeBefore), spikeRight);
    out.push({ id: out.length, site, x: p.x, z: p.z, yaw: p.yaw, lane: lane.id, s, spikeX: q.x, spikeZ: q.z, y: p.y, spikeY: q.y });
  };
  ROADBLOCK_SITES.forEach(([px, pz], site) => {
    const ring = RINGS.find((r) => Math.hypot(r.x - px, r.z - pz) < r.r);
    if (ring) {
      // the roundabout: `APPROACH` m back along each avenue arriving at the ring, across a street's junction if one is
      // nearer (the harbour road meets one 4 m off the ring); where that falls in a junction's box, just past it
      const onRing = new Set(graph.nodes.filter((n) => Math.abs(Math.hypot(n.x - ring.x, n.z - ring.z) - ring.r) < 4).map((n) => n.id));
      for (const arriving of graph.lanes) {
        const road = net.laneRoad[arriving.id];
        if (!onRing.has(arriving.to) || road === ring.id) continue;
        let lane = arriving, back = APPROACH;
        for (;;) {
          const len = laneLength(lane);
          if (len >= back + 10) { push(lane, len - back, site); break; }
          const from = lane, prev = graph.lanes.find((l) => l.to === from.from && l.from !== from.to && net.laneRoad[l.id] === road);
          const gap = prev ? Math.hypot(from.x0 - prev.x1, from.z0 - prev.z1) : 0;
          if (!prev || back - len - gap < 10) { push(lane, Math.min(10, len / 2), site); break; }
          back -= len + gap;
          lane = prev;
        }
      }
      return;
    }
    // the structure whose end is nearest the plan's point, and `INTO` m in from that end
    let best: { pieces: Piece[]; from: number; d: number } | null = null;
    for (const s of island.structures) {
      if (s.kind === 'overpass') continue;
      const a = s.pieces[0] as Piece, b = s.pieces[s.pieces.length - 1] as Piece;
      for (const [p, from] of [[a, 0], [b, 1]] as const) {
        const d = Math.hypot(p.x - px, p.z - pz);
        if (!best || d < best.d) best = { pieces: s.pieces, from, d };
      }
    }
    if (!best) return;
    const run = best.from === 0 ? best.pieces : [...best.pieces].reverse();
    let walked = 0, at = run[run.length - 1] as Piece;
    for (const p of run) {
      if (walked + p.length >= INTO) { at = p; break; }
      walked += p.length;
    }
    // every highway lane there, each way (the one it falls inside of where two meet end to end)
    for (const lane of graph.lanes) {
      if (!lane.highway) continue;
      const hit = laneStation(lane, at.x, at.z, at.y);
      if (hit.d < outer + 2 && hit.s > 0.5 && hit.s < laneLength(lane) - 0.5) push(lane, hit.s, site);
    }
  });
  return out;
}

/**
 * The parked patrols' places: at every junction of three ways or more whose roads are all the town's (avenues, streets,
 * side roads: no highway, ramp, roundabout, taxiway, track), 300 m or more from the hideout, one kerb-side spot on the
 * lowest-numbered arriving lane long enough whose spot is clear (off every other road, no bay near, no garage's door
 * or drive-through before it): `back` m short of its stop line, its side `kerb` m off the kerb, facing the crossing.
 */
export function islandParkedJunctions(island: Island, hideout: DropOff): ParkedJunction[] {
  const net = island.network, graph = net.graph, g = island.ground, bays = [...island.surfaces.parking, ...(island.policeSites.donut.bays ?? [])];
  const doors = [...island.garages.map((d) => d.door), ...island.services];
  const cls = new Map(net.lines.map((l) => [l.id, l.ring ? null : l.cls]));
  const roadIndex = new Map(g.roads.map((r, k) => [r.id, k]));
  const half = CAR_PRESETS.police.chassisHalfExtents.x + PARKED.kerb;
  const out: ParkedJunction[] = [];
  for (const n of graph.nodes) {
    if (Math.hypot(n.x - hideout.x, n.z - hideout.z) < PARKED.hideout) continue;
    const touching = graph.lanes.filter((l) => l.from === n.id || l.to === n.id);
    if (touching.some((l) => { const c = cls.get(net.laneRoad[l.id] ?? ''); return !c || !PAVED.has(c); })) continue;
    if (new Set(touching.map((l) => (l.from === n.id ? l.to : l.from))).size < 3) continue;
    for (const lane of touching.filter((l) => l.to === n.id).sort((a, b) => a.id - b.id)) {
      const road = net.laneRoad[lane.id] ?? '', c = cls.get(road) as RoadClass, len = laneLength(lane);
      if (len < PARKED.back + 20) continue;
      const s = len - PARKED.back, offset = HALF_WIDTH[c] - lane.offset - half, p = laneAt(lane, s, offset);
      if (!g.onLand(p.x, p.z) || g.nearOtherRoad(p.x, p.z, roadIndex.get(road) ?? -1, 1)) continue;
      if (bays.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < PARKED.bay) || doors.some((d) => Math.hypot(d.x - p.x, d.z - p.z) < PARKED.door)) continue;
      out.push({ node: n.id, lane: lane.id, s, offset, x: p.x, z: p.z, yaw: p.yaw });
      break;
    }
  }
  return out;
}
