/**
 * The drive-throughs (M8.10 slice 16, docs/M8.10_PLAN.md §1.3): three fuel stations (a full boost, each once a
 * minute), two repair shops (the car repaired after 2 s inside), two paint shops (a new paint; if no unit sees the car
 * go in, the pursuit loses it as a swap does, DESIGN §2.5). Each stands at the plan's point beside its road, its long
 * axis along it, open at both ends: a fuel station's canopy over two pump islands with the lane between them, a shop's
 * shed between two walls. The car in its bay is served; the message is the one voice's at the top.
 */
import { Architecture } from '../city/architecture';
import type { StaticDesc } from '../scene';
import { CITY_COLORS, PALETTE } from '../palette';
import { bodySpec, policeLiveried } from '../traffic/bodies';
import type { SimWorld } from '../SimWorld';
import { reserved } from './fill';
import type { P2 } from './geom';
import { HALF_WIDTH, type GradedRoad, type Ground } from './ground';
import { SERVICES } from './plan';
import { PAVEMENT } from './surfaces';

export type ServiceKind = 'fuel' | 'repair' | 'paint';
/** A drive-through: its middle, the way its bay runs, its floor's height, its bay's half length and half width. */
export interface ServiceSite { kind: ServiceKind; x: number; y: number; z: number; yaw: number; half: number; bay: number }

/** The buildings (m): a bay's half length and half width, the walls' and the canopy's height, a pump island's size. */
const SITE = { half: 9, bay: 3.2, wall: 0.3, height: 4.6, pump: { hx: 0.6, hy: 0.7, hz: 2.4 } } as const;
/** A fuel station serves again this long after (s); a repair takes this long inside (s). */
export const FUEL_AGAIN = 60;
export const REPAIR_TIME = 2;
/** Served only this near the floor (m): not flying over the roof. */
const REACH_UP = 3;
/** The event's value by kind: the one voice reads it. */
export const SERVICE_VALUE: Readonly<Record<ServiceKind, number>> = { fuel: 0, repair: 1, paint: 2 };

/**
 * The drive-throughs' sites on the island: at each plan point, beside its nearest road, its long axis along it. The
 * nearest spot to the point that stands clear of every road's carriageway and pavement, on land, off the plan's
 * places, on ground level enough for its floor and near its road's height: the point's side first, sliding along the
 * road and further out as needed. Pure, from the ground: the fill keeps its lots and palms off them (`siteRect`).
 */
export function serviceSpots(ground: Ground): ServiceSite[] {
  return SERVICES.map((s) => spot(ground, s.kind, s.at));
}

/** A site's footprint, a turned rectangle as a lot's: its floor, or a fuel station's canopy, the widest. */
export function siteRect(site: ServiceSite): { x: number; z: number; yaw: number; hx: number; hz: number } {
  return { x: site.x, z: site.z, yaw: site.yaw, hx: across(site.kind), hz: site.half + 0.5 };
}

/** The drive-throughs' statics into `statics(x, z)`: walls and pumps solid, the floor a slab the wheels ride, the roofs drawn only. */
export function buildServices(ground: Ground, sites: readonly ServiceSite[], statics: (x: number, z: number) => StaticDesc[]): void {
  for (const site of sites) {
    const fx = Math.sin(site.yaw) * site.half, fz = Math.cos(site.yaw) * site.half;
    build(site, ground.surfaceHeight(site.x + fx, site.z + fz) - ground.surfaceHeight(site.x - fx, site.z - fz), statics(site.x, site.z));
  }
}

/** A site's half width, its widest part's (a floor 2 m wider than its bay each side; a canopy 3 m). */
const across = (kind: ServiceKind): number => SITE.bay + (kind === 'fuel' ? 3 : 2);
/** Between a site's side and its road's pavement (m); the most its floor may rise along it, tilt across, and stand off its road's height (m). */
const VERGE = 1.5, RISE = 2, TILT = 0.8, STEP_UP = 1.2;

function spot(ground: Ground, kind: ServiceKind, [px, pz]: P2): ServiceSite {
  // the nearest road: which, its segment and where along it
  let best = Infinity, road = ground.roads[0] as GradedRoad, seg = 0, at = 0;
  for (const r of ground.roads) {
    const n = r.pts.length, last = r.closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = r.pts[i] as P2, b = r.pts[(i + 1) % n] as P2, dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
      if (d < best) { best = d; road = r; seg = i; at = t; }
    }
  }
  const n = road.pts.length, last = road.closed ? n : n - 1, S = [0];
  for (let i = 0; i < last; i++) {
    const a = road.pts[i] as P2, b = road.pts[(i + 1) % n] as P2;
    S.push((S[i] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = S[last] as number, s0 = (S[seg] as number) + ((S[seg + 1] as number) - (S[seg] as number)) * at;
  /** The road's point `s` m along it and its heading there; null past an open road's end. */
  const on = (s: number): { x: number; z: number; yaw: number } | null => {
    if (road.closed) s = ((s % total) + total) % total;
    else if (s < 0 || s > total) return null;
    let k = 0;
    while (k < last - 1 && (S[k + 1] as number) < s) k++;
    const a = road.pts[k] as P2, b = road.pts[(k + 1) % n] as P2, t = (s - (S[k] as number)) / ((S[k + 1] as number) - (S[k] as number) || 1);
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  };
  // the point's side of the road (a point on it: the road's right)
  const foot = on(s0) as { x: number; z: number; yaw: number };
  const prefer = best < 0.5 || (px - foot.x) * -Math.cos(foot.yaw) + (pz - foot.z) * Math.sin(foot.yaw) >= 0 ? 1 : -1;
  const W = across(kind), base = HALF_WIDTH[road.cls] + PAVEMENT + VERGE + W;
  const tries: Array<{ slide: number; side: number; out: number; cost: number }> = [];
  for (let slide = -60; slide <= 60; slide += 6) for (const side of [prefer, -prefer]) for (let out = 0; out <= 20; out += 2) {
    tries.push({ slide, side, out, cost: Math.abs(slide) + 1.5 * out + (side === prefer ? 0 : 25) });
  }
  tries.sort((a, b) => a.cost - b.cost);
  let first: ServiceSite | null = null;
  for (const t of tries) {
    const r = on(s0 + t.slide);
    if (!r) continue;
    const fx = Math.sin(r.yaw), fz = Math.cos(r.yaw), off = t.side * (base + t.out);
    const x = r.x - fz * off, z = r.z + fx * off;
    const h0 = ground.surfaceHeight(x - fx * SITE.half, z - fz * SITE.half), h1 = ground.surfaceHeight(x + fx * SITE.half, z + fz * SITE.half);
    const site: ServiceSite = { kind, x, y: (h0 + h1) / 2, z, yaw: r.yaw, half: SITE.half, bay: SITE.bay };
    first ??= site;
    if (clear(ground, site, W, h1 - h0, ground.surfaceHeight(r.x, r.z))) return site;
  }
  return first as ServiceSite;
}

/** Whether a site stands clear: off every road's pavement, on land, off the places, its floor on its ground. */
function clear(ground: Ground, site: ServiceSite, W: number, rise: number, road: number): boolean {
  if (Math.abs(rise) > RISE || Math.abs(site.y - road) > STEP_UP) return false;
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw), rx = -fz, rz = fx;
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
    const x = site.x + fx * a * (site.half + 0.5) + rx * b * W, z = site.z + fz * a * (site.half + 0.5) + rz * b * W;
    if (!ground.onLand(x, z) || ground.nearOtherRoad(x, z, -1, PAVEMENT + VERGE) || reserved(x, z)) return false;
  }
  // level across, and no hump or dip under its floor's middle
  const left = ground.surfaceHeight(site.x - rx * W, site.z - rz * W), right = ground.surfaceHeight(site.x + rx * W, site.z + rz * W);
  return Math.abs(right - left) <= TILT && Math.abs(ground.surfaceHeight(site.x, site.z) - site.y) <= TILT / 2;
}

/** A drive-through's statics, built about the origin along +Z, turned and set on its floor. */
function build(site: ServiceSite, rise: number, list: StaticDesc[]): void {
  const kit = new Architecture(list), start = list.length;
  const len = site.half, w = site.bay, H = SITE.height;
  // the floor: a slab the wheels ride, pitched with the ground along the bay (its ends at the ground's height)
  const floor = kit.box(0, -0.25, 0, w + 2, 0.25, len + 0.5, PALETTE.concrete, 'kerb');
  if (site.kind === 'fuel') {
    // the pump islands either side of the lane, the canopy's posts on them, the canopy over all
    for (const side of [-1, 1]) {
      kit.box(side * (w + SITE.pump.hx), SITE.pump.hy, 0, SITE.pump.hx, SITE.pump.hy, SITE.pump.hz, CITY_COLORS.stone, 'building');
      for (const end of [-1, 1]) kit.box(side * (w + SITE.pump.hx), H / 2, end * (len - 1), 0.2, H / 2, 0.2, CITY_COLORS.trim, 'building');
    }
    kit.box(0, H + 0.3, 0, w + 3, 0.3, len + 1, PALETTE.laneMark, 'decor');
    kit.box(0, H + 0.05, 0, w + 3.05, 0.08, len + 1.05, CITY_COLORS.roof, 'decor');
  } else {
    // a shed: its two walls along the bay, its roof, a band of its colour over each open end
    const band = site.kind === 'repair' ? 0xe0782f : 0x7f4fd8;
    for (const side of [-1, 1]) kit.box(side * (w + SITE.wall), H / 2, 0, SITE.wall, H / 2, len, CITY_COLORS.stone, 'building');
    kit.box(0, H + 0.2, 0, w + SITE.wall * 2 + 0.2, 0.2, len + 0.2, CITY_COLORS.roof, 'decor');
    for (const end of [-1, 1]) kit.box(0, H - 0.5, end * len, w + SITE.wall * 2, 0.5, 0.15, band, 'decor');
  }
  kit.rotateFrom(start, site.x, site.z, site.yaw);
  // on its floor: the whole building at the floor's height, the floor itself pitched along its length
  const pitch = Math.atan2(rise, 2 * len);
  for (let i = start; i < list.length; i++) (list[i] as StaticDesc).position.y += site.y;
  const c = Math.cos(site.yaw / 2), s = Math.sin(site.yaw / 2), cp = Math.cos(-pitch / 2), sp = Math.sin(-pitch / 2);
  floor.rotation = { x: c * sp, y: s * cp, z: -s * sp, w: c * cp };
}

/**
 * The drive-throughs at work: each step the player's car in a bay is served (fuel on its way in when the station is
 * ready; a repair after `REPAIR_TIME` inside; a paint on its way in, the pursuit told as of a swap).
 */
export class Services {
  /** Seconds until each fuel station serves again; seconds the car has been in each bay (0 outside). */
  readonly again: Float32Array;
  readonly inside: Float32Array;
  private readonly local = { along: 0, across: 0 };

  constructor(private readonly sim: SimWorld, readonly sites: readonly ServiceSite[]) {
    this.again = new Float32Array(sites.length);
    this.inside = new Float32Array(sites.length);
  }

  step(dt: number): void {
    const sim = this.sim, p = sim.probe;
    for (let i = 0; i < this.sites.length; i++) {
      const site = this.sites[i] as ServiceSite;
      this.again[i] = Math.max(0, (this.again[i] as number) - dt);
      if (!this.within(site, p.x, p.y, p.z)) { this.inside[i] = 0; continue; }
      const first = this.inside[i] === 0;
      this.inside[i] = (this.inside[i] as number) + dt;
      if (site.kind === 'fuel' && (this.again[i] as number) <= 0) {
        sim.vehicle.boostMeter = 1;
        this.again[i] = FUEL_AGAIN;
        this.served(site, i);
      } else if (site.kind === 'repair' && (this.inside[i] as number) >= REPAIR_TIME && (this.inside[i] as number) - dt < REPAIR_TIME) {
        sim.life.heal();
        this.served(site, i);
      } else if (site.kind === 'paint' && first) {
        // the next of the body's paints: a new look, as a swap's; unseen, the pursuit loses the car
        const paints = bodySpec(sim.carBody).paints, now = paints.indexOf(sim.carPaint);
        const paint = paints[(now + 1) % paints.length] ?? sim.carPaint;
        sim.carPaint = paint;
        sim.pursuit.onSwap(sim.police?.crimeSeen() ?? false, sim.carId, paint, sim.carBody, policeLiveried(sim.carBody));
        this.served(site, i);
      }
    }
  }

  /** Whether (x, y, z) is in a site's bay: along it within its length, across within its lane, near its floor. */
  within(site: ServiceSite, x: number, y: number, z: number): boolean {
    const dx = x - site.x, dz = z - site.z, s = Math.sin(site.yaw), c = Math.cos(site.yaw);
    this.local.along = dx * s + dz * c;
    this.local.across = dx * c - dz * s;
    return Math.abs(this.local.along) <= site.half && Math.abs(this.local.across) <= site.bay && y - site.y < REACH_UP && y - site.y > -1;
  }

  private served(site: ServiceSite, i: number): void {
    this.sim.events.push('service', SERVICE_VALUE[site.kind], site.x, site.y, site.z, i);
  }
}
