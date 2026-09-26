/**
 * Where the run ends: the hideout and the two other drop-offs (docs/DESIGN.md
 * §6.3). Each is the same one-room drive-in garage, built by the city
 * generator on an ordinary building lot instead of that lot's building, so it
 * clears its neighbours by construction and the lot's random draws are
 * unchanged. Everything here is a pure function of constants: the generator
 * asks `dropOffAt` per lot, the run and the renderer ask `coverSites`.
 *
 * Frame of a drop-off: `yaw` points inward, from the door to the back wall;
 * `along` is metres inward from the garage centre, `across` metres to the
 * right of that axis. The door line is `along = -GARAGE.depth / 2`.
 */
import { BALANCE } from '../balance';
import { PALETTE } from '../palette';
import { mulberry32 } from '../random';
import { POLICE } from '../police/tuning';
import { quatFromYaw, type StaticDesc } from '../scene';
import type { City } from './City';
import { laneAt, laneLength } from './route';
import { BLOCK, HIGHWAY_HALF, HIGHWAY_LANE_OFFSETS, ROAD_HALF, type RoadGraph } from './roads';

export type DropOffName = 'hideout' | 'scrapyard' | 'hotel';

/** A generator lot: chunk, quadrant, lot offsets as in `City.generate`, and that district's building setback. */
export interface DropOffLot {
  name: DropOffName;
  cx: number;
  cz: number;
  sx: 1 | -1;
  sz: 1 | -1;
  ox: 40 | 85;
  oz: 40 | 85;
  /** Must match the district's setback in `City.generate` (gardens 6, foundry 7, else 1.3). */
  setback: number;
}

/**
 * The hideout beside the Crown Tower (Crown Heights, on the street west of
 * the tower block), the scrapyard beside the Waterworks (Sunset Works), and the
 * Coral Hotel garage (Coral Quay, on the street north of the hotel). A lot with
 * `ox` 40 fronts the street along z, one with `oz` 40 the street along x.
 */
export const DROP_OFF_LOTS: readonly DropOffLot[] = [
  { name: 'hideout', cx: -2, cz: -2, sx: 1, sz: 1, ox: 40, oz: 85, setback: 1.3 },
  { name: 'scrapyard', cx: 2, cz: -2, sx: 1, sz: 1, ox: 40, oz: 85, setback: 7 },
  { name: 'hotel', cx: 2, cz: 2, sx: 1, sz: 1, ox: 85, oz: 40, setback: 1.3 },
];

/** The garage: outer size, walls, the roller door, the entry box that starts it. Metres. */
export const GARAGE = {
  width: 14,
  depth: 20,
  height: 6,
  wall: 0.3,
  doorWidth: 8,
  doorHeight: 4.2,
  /** The roller door's collider thickness. */
  doorThickness: 0.2,
  /** Entry box half extents around the garage centre: 2 m inside the door to 2 m short of the back wall. */
  entryAcross: 4.5,
  entryAlong: 8,
  /** Floor top: above the lot apron (0.14) by more than the 12 mm decal rule. */
  floorTop: 0.16,
};

export interface DoorPose {
  /** Centre of the opening at ground level. */
  x: number;
  z: number;
  /** The drop-off's inward yaw. */
  yaw: number;
  width: number;
  height: number;
}

export interface DropOff {
  name: DropOffName;
  /** Garage floor centre, and the ground its floor stands on (the grid's 0; the island's, its street's height). */
  x: number;
  y: number;
  z: number;
  /** Inward: from the door toward the back wall. */
  yaw: number;
  door: DoorPose;
  /** Entry box half extents in the drop-off frame, around the centre. */
  entry: { across: number; along: number };
  /** From the door out to its street's kerb (m): the setback and the pavement. */
  toKerb: number;
  /** The carriageway lane that runs past the door with the door on its kerb side; -1 before `coverSites`. */
  approachLane: number;
  /** The grid's lot it stands on (its generator's); none on the island. */
  lot?: DropOffLot;
}

/**
 * Where a roadblock can stand (slice 6): a point on a lane's centre, the lane and
 * the distance along it, and the spike strip's centre `spikeBefore` m before it
 * across the open side (the other highway lane, or the oncoming lane of a street);
 * the road's surface at both (the grid's flat 0; the island's deck, tunnel floor
 * or ground, M8.10 slice 15a).
 */
export interface Chokepoint { id: number; x: number; z: number; yaw: number; lane: number; s: number; spikeX: number; spikeZ: number; y: number; spikeY: number }

/** A parked patrol's place: on an approach lane to a grid junction, at the kerb, facing the crossing. */
export interface ParkedJunction { node: number; lane: number; s: number; offset: number; x: number; z: number; yaw: number }

/**
 * A speed camera's line across a road (both directions), its pole beside it, and the road's limit (m/s); the road's
 * surface at the line and the pole's foot (the grid's flat 0; the island's deck, pavement or verge, M8.10 slice 15a).
 */
export interface CameraSite { x: number; z: number; yaw: number; halfWidth: number; poleX: number; poleZ: number; limitMs: number; y: number; poleY: number }

/**
 * Today's police (docs/history/M5_PLAN.md slice 6, DESIGN.md §8): the date seeds an
 * order over each fixed site list and the first share of it is manned today.
 * Nothing new is placed; before a date is set every site is manned.
 */
export interface DailyCover {
  seed: number;
  order: { chokepoints: Int16Array; parked: Int16Array; cameras: Int16Array };
  /** 1 where the site is manned today, by the site's index. */
  chokepoints: Uint8Array;
  parked: Uint8Array;
  cameras: Uint8Array;
}

export interface CoverSites {
  hideout: DropOff;
  /** All three, the hideout first: every one banks and holds the same wall. */
  dropOffs: DropOff[];
  chokepoints: Chokepoint[];
  parkedJunctions: ParkedJunction[];
  cameraSites: CameraSite[];
  daily: DailyCover;
}

function identity(n: number): Int16Array {
  const a = new Int16Array(n);
  for (let i = 0; i < n; i++) a[i] = i;
  return a;
}

/** A seed's order over each list (Fisher–Yates on mulberry32) and today's manned share, in place. */
export function setDailyOrder(cover: CoverSites, seed: number): void {
  const d = cover.daily;
  d.seed = seed;
  const rng = mulberry32(seed ^ 0x5eed);
  const shuffle = (order: Int16Array, active: Uint8Array, share: number): void => {
    for (let i = 0; i < order.length; i++) order[i] = i;
    for (let i = order.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = order[i] as number; order[i] = order[j] as number; order[j] = t;
    }
    active.fill(0);
    const n = Math.ceil(order.length * share);
    for (let i = 0; i < n; i++) active[order[i] as number] = 1;
  };
  const share = BALANCE.dailies.police;
  shuffle(d.order.chokepoints, d.chokepoints, share.chokepoints);
  shuffle(d.order.parked, d.parked, share.parked);
  shuffle(d.order.cameras, d.cameras, share.cameras);
}

/** The drop-off built on this lot, or null. Called by the generator for every lot. */
export function dropOffAt(cx: number, cz: number, sx: number, sz: number, ox: number, oz: number): DropOff | null {
  for (const lot of DROP_OFF_LOTS) {
    if (lot.cx === cx && lot.cz === cz && lot.sx === sx && lot.sz === sz && lot.ox === ox && lot.oz === oz) return dropOffFor(lot);
  }
  return null;
}

/** Geometry of a lot's garage: it stands where the lot's building front would be, reaching `depth` inward. */
export function dropOffFor(lot: DropOffLot): DropOff {
  const x = lot.cx * BLOCK, z = lot.cz * BLOCK;
  const vx = Math.abs(lot.cx) === 3 ? HIGHWAY_HALF : ROAD_HALF;
  const vz = Math.abs(lot.cz) === 3 ? HIGHWAY_HALF : ROAD_HALF;
  const half = GARAGE.depth / 2;
  let cxw: number, czw: number, ix: number, iz: number;
  if (lot.ox === 40) {
    // fronting the street along z: the door faces -sx across the pavement
    const front = x + lot.sx * (vx + 4.5 + lot.setback);
    ix = lot.sx; iz = 0;
    cxw = front + ix * half;
    czw = z + lot.sz * 82;
  } else {
    const front = z + lot.sz * (vz + 4.5 + lot.setback);
    ix = 0; iz = lot.sz;
    cxw = x + lot.sx * 82;
    czw = front + iz * half;
  }
  const yaw = Math.atan2(ix, iz);
  return {
    name: lot.name,
    x: cxw,
    y: 0,
    z: czw,
    yaw,
    door: { x: cxw - ix * half, z: czw - iz * half, yaw, width: GARAGE.doorWidth, height: GARAGE.doorHeight },
    entry: { across: GARAGE.entryAcross, along: GARAGE.entryAlong },
    toKerb: lot.setback + 4.5,
    approachLane: -1,
    lot,
  };
}

/** The three drop-offs with their approach lanes, the hideout first. */
export function coverSites(city: City): CoverSites {
  const dropOffs = DROP_OFF_LOTS.map((lot) => {
    const site = dropOffFor(lot);
    // 10 m out from the door is the kerb-side carriageway lane of the street it faces
    const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
    site.approachLane = city.nearestLane(site.door.x - fx * 10, site.door.z - fz * 10);
    return site;
  });
  const chokes = chokepoints(city.graph), parked = parkedJunctions(city.graph, dropOffs[0] as DropOff), cameras = cameraSites(city.graph);
  const daily: DailyCover = {
    seed: 0,
    order: { chokepoints: identity(chokes.length), parked: identity(parked.length), cameras: identity(cameras.length) },
    chokepoints: new Uint8Array(chokes.length).fill(1),
    parked: new Uint8Array(parked.length).fill(1),
    cameras: new Uint8Array(cameras.length).fill(1),
  };
  return { hideout: dropOffs[0] as DropOff, dropOffs, chokepoints: chokes, parkedJunctions: parked, cameraSites: cameras, daily };
}

/** Metres between roadblock sites along a highway lane, and kept clear of the junction boxes at its ends. */
const CHOKE_PITCH = 75;
const CHOKE_END = 40;
/** The tower junction: roadblocks on its approaches, 60 m short of the stop line (docs/DESIGN.md §6.4). */
const TOWER: readonly [number, number] = [-2, -2];
const TOWER_APPROACH = 60;
/** A parked patrol stands this far before the stop line, this far to the lane's right (kerb side). */
const PARKED_BACK = 14;
const PARKED_KERB = 3;
/** Parked patrols keep this far from the hideout (docs/history/M4_PLAN.md slice 3a). */
const PARKED_CLEAR_OF_HIDEOUT = 300;
/** The laps' limits the cameras enforce: the traffic tuning's highway and avenue speeds (m/s). */
const LIMIT_HIGHWAY = 22;
const LIMIT_AVENUE = 16;

function node(gx: number, gz: number): number {
  return (gz + 3) * 7 + (gx + 3);
}

/** Every highway lane every 75 m, and the tower junction's approaches: the roadblock sites. */
function chokepoints(graph: RoadGraph): Chokepoint[] {
  const out: Chokepoint[] = [];
  const tower = node(TOWER[0], TOWER[1]);
  const [inner, outer] = HIGHWAY_LANE_OFFSETS;
  for (const lane of graph.lanes) {
    const len = laneLength(lane);
    // the open side: the other highway lane, or across the centreline to the oncoming lane
    const spikeRight = lane.highway ? (lane.offset === inner ? outer - inner : inner - outer) : -2 * lane.offset;
    const at = (s: number): void => {
      const p = laneAt(lane, s);
      const q = laneAt(lane, Math.max(0, s - POLICE.roadblock.spikeBefore), spikeRight);
      out.push({ id: out.length, x: p.x, z: p.z, yaw: p.yaw, lane: lane.id, s, spikeX: q.x, spikeZ: q.z, y: 0, spikeY: 0 });
    };
    // not on an overpass's ramp or deck (M5.5 slice 8): a roadblock stands on the ground
    if (lane.highway) for (let s = CHOKE_END; s <= len - CHOKE_END; s += CHOKE_PITCH) if (laneAt(lane, s).y < 0.05) at(s);
    else if (lane.to === tower && len > TOWER_APPROACH + CHOKE_END) at(len - TOWER_APPROACH);
  }
  return out;
}

/** One kerb-side spot on an approach to every interior grid junction at least 300 m from the hideout. */
function parkedJunctions(graph: RoadGraph, hideout: DropOff): ParkedJunction[] {
  const out: ParkedJunction[] = [];
  for (const n of graph.nodes) {
    if (Math.abs(n.x) > 2 * BLOCK || Math.abs(n.z) > 2 * BLOCK) continue;
    if (Math.hypot(n.x - hideout.x, n.z - hideout.z) < PARKED_CLEAR_OF_HIDEOUT) continue;
    // the lowest-numbered grid lane into it: deterministic, and never an authored road's bend
    const lane = graph.lanes.find((l) => l.to === n.id && !l.special && !l.highway);
    if (!lane) continue;
    const s = laneLength(lane) - PARKED_BACK;
    const p = laneAt(lane, s, PARKED_KERB);
    out.push({ node: n.id, lane: lane.id, s, offset: PARKED_KERB, x: p.x, z: p.z, yaw: p.yaw });
  }
  return out;
}

/**
 * Ten cameras: seven mid-segment on the highway's four sides, three along the Crown avenue's straight line
 * (the two diagonals, 636 m end to end, hold three 200 m apart clear of the tower junction; the plan's four
 * does not fit).
 */
export function cameraSites(graph: RoadGraph): CameraSite[] {
  const out: CameraSite[] = [];
  const ring = 3 * BLOCK;
  // mid-segment points of the ring (a node every 225 m): x or z at ±112.5, ±337.5, ±562.5
  const highway: Array<readonly [number, number, number]> = [
    [-ring, -562.5, 0], [-ring, 337.5, 0], [ring, -337.5, Math.PI], [ring, 337.5, Math.PI],
    // not on an overpass's ramps (M5.5 slice 8): the north one moved from -112.5 to 562.5, the south one from 112.5 to 337.5
    [562.5, -ring, Math.PI / 2], [337.5, -ring, Math.PI / 2], [337.5, ring, -Math.PI / 2],
  ];
  for (const [x, z, yaw] of highway) {
    const side = HIGHWAY_HALF + 2;
    // the pole on the outer verge: away from the city centre
    const ox = Math.abs(x) === ring ? Math.sign(x) * side : 0, oz = Math.abs(z) === ring ? Math.sign(z) * side : 0;
    out.push({ x, z, yaw, halfWidth: HIGHWAY_HALF, poleX: x + ox, poleZ: z + oz, limitMs: LIMIT_HIGHWAY, y: 0, poleY: 0 });
  }
  // the two Crown diagonals are one straight line from the highway to the highway through the tower junction
  const avenue = graph.special.filter((r) => r.kind === 'avenue');
  const a = avenue[0], b = avenue[avenue.length - 1];
  if (a && b) {
    const start = a.centre[0] as { x: number; z: number }, end = b.centre[b.centre.length - 1] as { x: number; z: number };
    const len = Math.hypot(end.x - start.x, end.z - start.z);
    const dx = (end.x - start.x) / len, dz = (end.z - start.z) / len;
    const yaw = Math.atan2(dx, dz);
    // clear of the tower junction halfway along, and 200 m apart
    for (const d of [len * 0.12, len * 0.44, len * 0.76]) {
      const x = start.x + dx * d, z = start.z + dz * d;
      // the pole on the right-hand verge (right of the heading is (-dz, dx)), clear of the carriageway
      const side = a.halfWidth + 2;
      out.push({ x, z, yaw, halfWidth: a.halfWidth, poleX: x - dz * side, poleZ: z + dx * side, limitMs: LIMIT_AVENUE, y: 0, poleY: 0 });
    }
  }
  return out;
}

/**
 * A drop-off's lit sign (M7 slice 11, DESIGN.md §6.5): a pole on the pavement `kerb` m in from the kerb, `beside`
 * m across from the door's centre (negative: to the left as one drives in; the billboards at the three doors stand
 * to the right), and on it at `height` a panel `width` × `panel` m whose faces look up and down the street, so a
 * driver on the highway sees it at the street's mouth. Drawn by the renderer (HideoutView): no collider, and the
 * chunk's statics (the billboards' clear ground) are not touched.
 */
export const HIDEOUT_SIGN = { height: 11, width: 6, panel: 3, depth: 0.4, kerb: 1.2, beside: -9, pole: 0.14 } as const;

export interface HideoutSign {
  /** The pole's foot on the pavement. */
  poleX: number;
  poleZ: number;
  /** The panel's centre; `yaw` turns the panel's thin axis along the street (quatFromYaw's convention). */
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export function hideoutSign(site: DropOff): HideoutSign {
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
  // right of the inward axis: the street's direction past the door
  const rx = -fz, rz = fx;
  const along = -GARAGE.depth / 2 - (site.toKerb - HIDEOUT_SIGN.kerb);
  const x = site.x + fx * along + rx * HIDEOUT_SIGN.beside, z = site.z + fz * along + rz * HIDEOUT_SIGN.beside;
  return { poleX: x, poleZ: z, x, y: site.y + HIDEOUT_SIGN.height, z, yaw: Math.atan2(rx, rz) };
}

/** Along (inward) and across coordinates of a world point in a drop-off's frame. */
export function toDropOff(site: DropOff, x: number, z: number, out: { along: number; across: number }): { along: number; across: number } {
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
  const dx = x - site.x, dz = z - site.z;
  out.along = dx * fx + dz * fz;
  // right of the inward axis; +X is left when facing +Z
  out.across = -dx * fz + dz * fx;
  return out;
}

/** True within `radius` of a drop-off's opening: the generator keeps lamps and trees out of the doorway. */
export function nearDoor(x: number, z: number, radius: number): boolean {
  for (const lot of DROP_OFF_LOTS) {
    const door = dropOffFor(lot).door;
    if (Math.hypot(x - door.x, z - door.z) < radius + door.width / 2) return true;
  }
  return false;
}

/**
 * Walls, roof, floor, the lintel stripe and the ceiling light. The roller door
 * is not here: it slides, so the renderer draws it and the run owns its one
 * collider. Walls carry the `building` tag (solid, restitution 1: a wall like
 * any building); the floor is terrain.
 */
export function hideoutStatics(site: DropOff): StaticDesc[] {
  const g = GARAGE;
  const out: StaticDesc[] = [];
  const rot = quatFromYaw(site.yaw);
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
  // right of the inward axis
  const rx = -fz, rz = fx;
  const put = (along: number, across: number, y: number, hAcross: number, hy: number, hAlong: number, color: number, tag: string): void => {
    out.push({
      // box axes: x across (the rotated frame's x is -right, the extent is symmetric), z along
      shape: { kind: 'box', hx: hAcross, hy, hz: hAlong },
      position: { x: site.x + fx * along + rx * across, y, z: site.z + fz * along + rz * across },
      rotation: rot,
      color,
      tag,
    });
  };
  const hw = g.width / 2, hd = g.depth / 2, h = g.height, t = g.wall;
  put(hd - t / 2, 0, h / 2, hw, h / 2, t / 2, PALETTE.concrete, 'building');
  for (const side of [-1, 1]) put(0, side * (hw - t / 2), h / 2, t / 2, h / 2, hd, PALETTE.concrete, 'building');
  // the street face: a pier either side of the opening and the lintel above it
  const pier = (hw - g.doorWidth / 2) / 2;
  for (const side of [-1, 1]) put(-hd + t / 2, side * (g.doorWidth / 2 + pier), h / 2, pier, h / 2, t / 2, PALETTE.concrete, 'building');
  put(-hd + t / 2, 0, g.doorHeight + (h - g.doorHeight) / 2, g.doorWidth / 2, (h - g.doorHeight) / 2, t / 2, PALETTE.concrete, 'building');
  put(0, 0, h + 0.15, hw, 0.15, hd, PALETTE.graphite, 'building');
  put(0, 0, g.floorTop / 2, hw - t, g.floorTop / 2, hd - t, PALETTE.concrete, 'kerb');
  // the orange band over the door and the warm strip light: the only colour a chase has time to read
  put(-hd - 0.02, 0, g.doorHeight + 0.45, g.doorWidth / 2 + 0.4, 0.28, 0.02, PALETTE.carOrange, 'decor');
  put(0, 0, h - 0.08, 1.6, 0.05, 0.25, PALETTE.sun, 'decor');
  return out;
}
