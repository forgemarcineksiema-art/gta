/**
 * The island's cover (M8.10 slice 14, docs/M8.10_PLAN.md §1.4): the three garages the run banks at, the hideout under
 * the tower first, the scrapyard's in the Works and the Coral Hotel's on the Quay, each its floor flush with the
 * pavement before its door, the ground under it dug to it, its kerb and the lane that runs past its door; the roadblock
 * sites, the parked patrols' places and the cameras (their own slices' lists). The same `CoverSites` the grid's
 * `coverSites` gives the run, the police and the dailies.
 */
import { GARAGE, hideoutStatics, type CoverSites, type DailyCover, type DropOff } from '../city/cover';
import { Architecture, CITY_COLORS } from '../city/architecture';
import type { StaticDesc } from '../scene';
import type { P2 } from './geom';
import { HALF_WIDTH, type Ground } from './ground';
import type { Island } from './Island';
import { GARAGES } from './plan';
import { hideoutSite } from './places/crown';
import type { WorksPlace } from './places/works';
import { PAVEMENT } from './surfaces';

/** A garage's front stands this far back from its pavement (m: the grid's Crown and Quay setback). */
const SETBACK = 1.3;
/** The kerb-side lane is read this far into the carriageway past the kerb (m). */
const INTO_LANE = 2.5;
/** The ground is dug to a garage's floor from this far out before its door (m): no lip at the threshold. */
const APRON = 1.5;

/** The nearest road to (x, z): its centreline's nearest point, its heading there, how far off its carriageway's edge. */
function nearestEdge(ground: Ground, x: number, z: number): { x: number; z: number; yaw: number; edge: number } {
  const out = { x, z, yaw: 0, edge: Infinity };
  for (const road of ground.roads) {
    const n = road.pts.length, last = road.closed ? n : n - 1, hw = HALF_WIDTH[road.cls];
    for (let i = 0; i < last; i++) {
      const a = road.pts[i] as P2, b = road.pts[(i + 1) % n] as P2, dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      const qx = a[0] + dx * t, qz = a[1] + dz * t, edge = Math.hypot(x - qx, z - qz) - hw;
      if (edge < out.edge) { out.x = qx; out.z = qz; out.yaw = Math.atan2(dx, dz); out.edge = edge; }
    }
  }
  return out;
}

/**
 * The Coral Hotel's garage (the plan's third door): on the nearest road's building line, `SETBACK` behind its pavement,
 * facing it. Pure, from the ground: the fill keeps its lots off it; its floor's height `islandGarages` sets.
 */
export function hotelGarageSite(ground: Ground): DropOff {
  const [px, pz] = (GARAGES.find((g) => g.name === 'hotel') as { at: P2 }).at;
  const road = nearestEdge(ground, px, pz);
  // inward: from the road toward the plan's point, square to the road
  const rx = -Math.cos(road.yaw), rz = Math.sin(road.yaw), side = (px - road.x) * rx + (pz - road.z) * rz >= 0 ? 1 : -1;
  const ix = rx * side, iz = rz * side, hw = Math.hypot(px - road.x, pz - road.z) - road.edge;
  const toDoor = hw + PAVEMENT + SETBACK, half = GARAGE.depth / 2;
  const dx = road.x + ix * toDoor, dz = road.z + iz * toDoor, x = dx + ix * half, z = dz + iz * half, yaw = Math.atan2(ix, iz);
  return {
    name: 'hotel', x, y: ground.surfaceHeight(x, z), z, yaw,
    door: { x: dx, z: dz, yaw, width: GARAGE.doorWidth, height: GARAGE.doorHeight },
    entry: { across: GARAGE.entryAcross, along: GARAGE.entryAlong },
    toKerb: PAVEMENT + SETBACK,
    approachLane: -1,
  };
}

/** A garage's footprint and its apron to the pavement, a turned rectangle as a lot's: what the fill keeps its lots off. */
export function garageRect(site: DropOff): { x: number; z: number; yaw: number; hx: number; hz: number } {
  return { x: site.x, z: site.z, yaw: site.yaw, hx: GARAGE.width / 2 + 1, hz: GARAGE.depth / 2 + SETBACK + 1 };
}

/**
 * The island's three garages, the hideout first, each completed and built: its kerb and the lane past its door (the
 * kerb-side lane `INTO_LANE` m out past the kerb, on the street's height); its floor's top flush with the pavement before
 * its door, the ground under it and its threshold dug to it; the grid's garage on it, a plinth under it where the
 * ground falls away (its statics into `statics`). The props keep off them.
 */
export function islandGarages(island: Island, statics: (x: number, z: number) => StaticDesc[]): DropOff[] {
  const works = island.places.find((p) => p.id === 'works') as WorksPlace | undefined;
  const bases = [hideoutSite(), works?.scrapyard, island.hotelGarage].filter((s): s is DropOff => s !== undefined);
  const g = island.ground, hx = GARAGE.width / 2 - GARAGE.wall, hz = GARAGE.depth / 2 - GARAGE.wall;
  return bases.map((base) => {
    const fx = Math.sin(base.yaw), fz = Math.cos(base.yaw), toKerb = Math.max(0, nearestEdge(g, base.door.x, base.door.z).edge);
    const px = base.door.x - fx * (toKerb + INTO_LANE), pz = base.door.z - fz * (toKerb + INTO_LANE);
    // the pavement before the door, its middle (or the ground's there, a door on its kerb)
    const out = toKerb > PAVEMENT ? toKerb - PAVEMENT / 2 : toKerb / 2, top = island.standAt(base.door.x - fx * out, base.door.z - fz * out);
    const site: DropOff = { ...base, y: top - GARAGE.floorTop, toKerb, approachLane: island.nearestLane(px, pz, g.surfaceHeight(px, pz)) };
    // the ground under the floor and out over its threshold dug to it
    g.dig(site.x - fx * APRON / 2, site.z - fz * APRON / 2, site.yaw, hx, hz + APRON / 2 + GARAGE.wall, site.y);
    const list = statics(site.x, site.z), start = list.length;
    list.push(...hideoutStatics(site));
    for (let i = start; i < list.length; i++) (list[i] as StaticDesc).position.y += site.y;
    // a plinth down to the lowest ground under its walls
    let foot = site.y;
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
      foot = Math.min(foot, g.surfaceHeight(site.x + fx * (GARAGE.depth / 2) * a - fz * (GARAGE.width / 2) * b, site.z + fz * (GARAGE.depth / 2) * a + fx * (GARAGE.width / 2) * b));
    }
    if (site.y - foot > 0.02) {
      const kit = new Architecture(list), from = list.length;
      kit.box(0, (foot - site.y - 0.4) / 2, 0, GARAGE.width / 2 + 0.05, (site.y - foot + 0.4) / 2, GARAGE.depth / 2 + 0.05, CITY_COLORS.stone, 'building');
      kit.rotateFrom(from, site.x, site.z, site.yaw);
      for (let i = from; i < list.length; i++) (list[i] as StaticDesc).position.y += site.y;
    }
    return site;
  });
}

/** The island's cover: its three garages; the roadblock sites, the parked patrols' places and the cameras their slices'. */
export function islandCover(island: Island): CoverSites {
  const dropOffs = island.garages;
  const daily: DailyCover = {
    seed: 0,
    order: { chokepoints: new Int16Array(0), parked: new Int16Array(0), cameras: new Int16Array(0) },
    chokepoints: new Uint8Array(0),
    parked: new Uint8Array(0),
    cameras: new Uint8Array(0),
  };
  return { hideout: dropOffs[0] as DropOff, dropOffs, chokepoints: [], parkedJunctions: [], cameraSites: [], daily };
}
