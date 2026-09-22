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
import { PALETTE } from '../palette';
import { quatFromYaw, type StaticDesc } from '../scene';
import type { City } from './City';
import { BLOCK, HIGHWAY_HALF, ROAD_HALF } from './roads';

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
  /** Garage floor centre. */
  x: number;
  z: number;
  /** Inward: from the door toward the back wall. */
  yaw: number;
  door: DoorPose;
  /** Entry box half extents in the drop-off frame, around the centre. */
  entry: { across: number; along: number };
  /** The carriageway lane that runs past the door with the door on its kerb side; -1 before `coverSites`. */
  approachLane: number;
  lot: DropOffLot;
}

export interface CoverSites {
  hideout: DropOff;
  /** All three, the hideout first: every one banks and holds the same wall. */
  dropOffs: DropOff[];
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
    z: czw,
    yaw,
    door: { x: cxw - ix * half, z: czw - iz * half, yaw, width: GARAGE.doorWidth, height: GARAGE.doorHeight },
    entry: { across: GARAGE.entryAcross, along: GARAGE.entryAlong },
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
  return { hideout: dropOffs[0] as DropOff, dropOffs };
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
