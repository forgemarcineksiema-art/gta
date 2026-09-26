/**
 * The island's twenty jumps (M8.10 slice 15, docs/M8.10_PLAN.md §1.4), in the plan's order (`JUMPS`): the places' own
 * (the quarry's edge, the piers' gap, the stadium's infield, the car park's roof, the mega-ramp, the Gardens' crest and
 * its two dunes) and the kickers this slice builds where the plan puts the rest. Crown Avenue's three and the hill's
 * street's stand in the kerbside strip of the way down, where no bay is painted and no lane runs (a car climbing the
 * avenue on its line, or its lane's traffic, never meets them); the others off the roads with their run-up and landing
 * kept clear: the summit's ring by the quarry track, the serpentine's third hairpin, the canal's banks (over it and into
 * it), the container yard's stack, the siding's flatcar, the roundabout's island, the verge at the level crossing. Each is a
 * `JumpDesc` the grid's `Jumps` reads: its foot's height, a hump's or a gap's footprint both ways. A kicker is the grid's
 * (`rampProfile`), laid along the ground under it; statics, drawn in the kit, its slabs the wheels' ground.
 */
import { rampProfile, type JumpDesc } from '../city/jumps';
import { BALANCE } from '../balance';
import { PALETTE } from '../palette';
import type { StaticDesc } from '../scene';
import type { GradedRoad, Ground } from './ground';
import type { P2 } from './geom';
import { JUMPS } from './plan';
import type { Place } from './places';
import type { CrownPlace, IslandJump } from './places/crown';
import { quayPlace } from './places/quay';
import { megaJump, MEGA, MEGA_LAUNCH } from './places/airfield';
import { BEACH_JUMP, CREST, DUNE_JUMP, type Hump } from './shapes/gardens';

/** A kicker this slice builds: its lip, the way it launches, its size (the grid's by default), what it is dressed as. */
export interface Kicker {
  /** The plan's jump it is (an index into `JUMPS`). */
  jump: number;
  x: number;
  z: number;
  yaw: number;
  length: number;
  height: number;
  half: number;
  /** The container yard's with containers stacked beside it; the siding's drawn as a wagon on its bogies. */
  dress?: 'containers' | 'flatcar';
}

/**
 * The speed each jump is built for (km/h): a second or more in the air at it, the big ones through their billboard. The
 * canal's jump over it clears the far bank at its; the mega-ramp's is the Phantom's run at it from the runway.
 */
export function designKmh(id: number): number {
  return id === 16 ? 200 : id === 7 ? 110 : 90;
}

/**
 * How far before its foot a jump's straight run-up starts (m): the car park's roof its lane's length, the container
 * stack's where the viaduct comes down, the mega-ramp's down the runway; else 40 m.
 */
export function runUp(id: number): number {
  return id === 15 ? 25 : id === 9 ? 20 : id === 16 ? 250 : 40;
}

/** The grid's kicker (m): 9 m up to 1.6 m, easing in. */
const GRID_KICKER = { length: BALANCE.jumps.length, height: BALANCE.jumps.height } as const;
/** A kerbside kicker's half width on an avenue and a street, and how far its middle stands off the road's (m). */
const KERBSIDE = { avenue: { half: 2.2, off: 9 }, street: { half: 1.5, off: 7.3 } } as const;

/**
 * A kicker in a road's kerbside strip on the way `dir` runs along it (+1 with its points, -1 against), its lip at the
 * plan's jump projected onto the road, `shift` m on along the way.
 */
function kerbside(ground: Ground, jump: number, roadId: string, dir: 1 | -1, shift = 0): Kicker | null {
  const road = ground.roads.find((r) => r.id === roadId), at = (JUMPS[jump] as { at: P2 }).at;
  if (!road) return null;
  const s = stationOf(road, at[0], at[1]) + dir * shift, p = pointAt(road, s);
  const fx = p.tx * dir, fz = p.tz * dir, cls = road.cls === 'avenue' ? KERBSIDE.avenue : KERBSIDE.street;
  // on the way's right: (−fz, fx) is a car's right facing (fx, fz)
  return { jump, x: p.x - fz * cls.off, z: p.z + fx * cls.off, yaw: Math.atan2(fx, fz), ...GRID_KICKER, half: cls.half };
}

/** A road's station (m along its points) nearest (x, z). */
export function stationOf(road: GradedRoad, x: number, z: number): number {
  let best = 0, bd = Infinity, s = 0;
  for (let i = 0; i + 1 < road.pts.length; i++) {
    const a = road.pts[i] as P2, b = road.pts[i + 1] as P2, dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (l * l || 1)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < bd) { bd = d; best = s + t * l; }
    s += l;
  }
  return best;
}

/** The point `s` m along a road's points and the unit way along it there. */
export function pointAt(road: GradedRoad, s: number): { x: number; z: number; tx: number; tz: number } {
  let run = 0;
  for (let i = 0; i + 1 < road.pts.length; i++) {
    const a = road.pts[i] as P2, b = road.pts[i + 1] as P2, dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    if (run + l >= s || i + 2 === road.pts.length) {
      const t = Math.max(0, Math.min(1, (s - run) / (l || 1)));
      return { x: a[0] + dx * t, z: a[1] + dz * t, tx: dx / (l || 1), tz: dz / (l || 1) };
    }
    run += l;
  }
  const p = road.pts[0] as P2;
  return { x: p[0], z: p[1], tx: 1, tz: 0 };
}

/**
 * The kickers the island's roads carry in their kerbside strips (worked out before the roads' surfaces, which paint no
 * bay under them): Crown Avenue's three on its way down, the hill's on the x 290 street southward out of the arcade.
 */
export function kerbsideKickers(ground: Ground): Kicker[] {
  return [
    kerbside(ground, 0, 'crown-avenue-up', -1),
    kerbside(ground, 1, 'crown-avenue-up', -1),
    kerbside(ground, 2, 'crown-avenue-up', -1),
    // out of the crossing's box, where the traffic turning in from the z 410 street sweeps
    kerbside(ground, 3, 'crown-street-4', -1, 12),
  ].filter((k): k is Kicker => k !== null);
}

/** A kicker by its lip and heading (m, degrees: 0 north, 90 west), the grid's size unless given. */
function at(jump: number, x: number, z: number, heading: number, size: Partial<Pick<Kicker, 'length' | 'height' | 'half' | 'dress'>> = {}): Kicker {
  return { jump, x, z, yaw: (heading * Math.PI) / 180, ...GRID_KICKER, half: 2.6, ...size };
}

/** The flatcar's kicker (m): longer and higher than the grid's, as narrow as a wagon's deck. */
const FLATCAR = { length: 12, height: 2.2, half: 1.6 } as const;

/**
 * The kickers off the roads (world m): each with a straight run-up to it and its landing clear (the lots and the props
 * keep off both). The summit's, on the outer half of its ring (its lane runs on the ring's line) beside the quarry track's
 * mouth, taken straight out across the plaza, flying off the hill's shoulder toward the quarry;
 * the serpentine's, straight on off its third hairpin; the canal's, across it from its south bank and down into it on
 * the diagonal; the container stack's, on the highway's south shoulder where it comes off the viaduct; the flatcar's, on
 * the siding, off its west end; the roundabout's, on its island, down Crown Avenue's line; the level crossing's, on the
 * verge of the street's way north, over the rails.
 */
export function freeKickers(): Kicker[] {
  return [
    at(4, 539.4, 454.0, 52.1, { length: 6, height: 1.2 }),
    at(5, 764.4, 316.5, 100.2),
    at(7, -380, 283, 0),
    at(8, -153.1, 262.7, -45),
    at(9, -628, 624.5, -90, { dress: 'containers' }),
    at(10, -318, 502, 90, { ...FLATCAR, dress: 'flatcar' }),
    at(18, -3.3, 47.7, -124.8),
    at(19, -654.5, 506, 0),
  ];
}

/**
 * A kicker's statics along the ground under it: each piece of the grid's profile a slab from the ground's height at
 * its ends plus the profile's there, drawn thick down into the ground (so its body stands on a slope), a thin twin for
 * the wheels; the white lip across its top.
 */
export function kickerStatics(k: Kicker, ground: Ground): StaticDesc[] {
  const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
  const jd: JumpDesc = { id: 0, x: k.x, z: k.z, yaw: k.yaw, length: k.length, height: k.height, halfWidth: k.half };
  const profile = rampProfile(jd);
  // the ground under each point of the profile along the kicker's middle (its lowest across it)
  const under = (along: number): number => {
    const x = k.x + fx * along, z = k.z + fz * along, rx = -fz * k.half, rz = fx * k.half;
    return Math.min(ground.surfaceHeight(x, z), ground.surfaceHeight(x + rx, z + rz), ground.surfaceHeight(x - rx, z - rz));
  };
  const out: StaticDesc[] = [];
  const piece = (a: { along: number; y: number }, b: { along: number; y: number }, ya: number, yb: number, thick: number, tag: string, colour: number, only: boolean): void => {
    const ax = k.x + fx * a.along, az = k.z + fz * a.along, bx = k.x + fx * b.along, bz = k.z + fz * b.along;
    const ay = ya + a.y, by = yb + b.y, run = Math.hypot(bx - ax, bz - az), pitch = Math.atan2(by - ay, run);
    // the top's middle, less half the thickness along the slab's up
    const ux = -Math.sin(pitch) * fx, uy = Math.cos(pitch), uz = -Math.sin(pitch) * fz;
    out.push({
      shape: { kind: 'box', hx: k.half, hy: thick / 2, hz: Math.hypot(run, by - ay) / 2 + 0.02 },
      position: { x: (ax + bx) / 2 - (ux * thick) / 2, y: (ay + by) / 2 - (uy * thick) / 2, z: (az + bz) / 2 - (uz * thick) / 2 },
      rotation: pitched(k.yaw, pitch), color: colour, tag, ...(only ? { collisionOnly: true } : {}),
    });
  };
  for (let i = 0; i + 1 < profile.length; i++) {
    const a = profile[i] as { along: number; y: number }, b = profile[i + 1] as { along: number; y: number };
    const ya = under(a.along), yb = under(b.along);
    // drawn thick, so its body reaches the ground under its highest point (the flatcar's its wagon's, a red plate on
    // it); its collider the slab's top
    const wagon = k.dress === 'flatcar';
    piece(a, b, ya, yb, 0.4 + Math.max(a.y, b.y) + Math.abs(ya - yb), 'decor', wagon ? PALETTE.graphite : PALETTE.ramp, false);
    if (wagon) piece(a, b, ya + 0.02, yb + 0.02, 0.1, 'decor', PALETTE.ramp, false);
    piece(a, b, ya, yb, 0.15, 'kerb', PALETTE.ramp, true);
  }
  // the white lip across its top
  const ridge = profile[profile.length - 2] as { along: number; y: number }, before = profile[profile.length - 3] as { along: number; y: number };
  const slope = (ridge.y - before.y) / (ridge.along - before.along), y = under(ridge.along) + ridge.y;
  piece({ along: ridge.along - 0.35, y: -0.35 * slope }, { along: ridge.along, y: 0 }, y, y, 0.06, 'decor', PALETTE.barrier, false);
  if (k.dress === 'containers') out.push(...containerStack(k, ground));
  if (k.dress === 'flatcar') out.push(...bogies(k, under(-k.length / 2)));
  return out;
}

/** A box `hx` by `hy` by `hz` (half) turned with a kicker, `along` its way, `across` to its right, its foot at `y`. */
function boxAt(k: Kicker, along: number, across: number, y: number, hx: number, hy: number, hz: number, colour: number, tag: string): StaticDesc {
  const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
  return {
    shape: { kind: 'box', hx, hy, hz }, position: { x: k.x + fx * along - fz * across, y: y + hy, z: k.z + fz * along + fx * across },
    rotation: pitched(k.yaw, 0), color: colour, tag,
  };
}

/** The container yard's stack beside its kicker, on the kicker's right: two containers one on the other, solid. */
function containerStack(k: Kicker, ground: Ground): StaticDesc[] {
  const across = k.half + 0.4 + 1.22, fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
  const y = ground.surfaceHeight(k.x - fx * 3 - fz * across, k.z - fz * 3 + fx * across);
  return [boxAt(k, -3, across, y, 1.22, 1.3, 3.03, PALETTE.carOrange, 'building'), boxAt(k, -3, across, y + 2.6, 1.22, 1.3, 3.03, PALETTE.carBlue, 'building')];
}

/** The flatcar's bogies under its sides: a frame and two wheels each side at either end of the wagon. */
function bogies(k: Kicker, y: number): StaticDesc[] {
  const out: StaticDesc[] = [];
  for (const b of [-k.length * 0.8, -k.length * 0.2]) {
    out.push(boxAt(k, b, 0, y + 0.1, k.half + 0.05, 0.25, 1.2, PALETTE.charcoal, 'decor'));
    for (const side of [-1, 1]) for (const w of [-0.75, 0.75]) out.push(boxAt(k, b + w, side * (k.half + 0.1), y, 0.08, 0.4, 0.4, PALETTE.steel, 'decor'));
  }
  return out;
}

/** A turn by `yaw` about +Y after a climb by `pitch` (nose up) about +X: a slab laid along a slope. */
function pitched(yaw: number, pitch: number): { x: number; y: number; z: number; w: number } {
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
  return { x: -cy * sp, y: sy * cp, z: sy * sp, w: cy * cp };
}

/** A kicker as the jumps read it: its lip, its size, its foot's ground. */
function kickerDesc(id: number, k: Kicker, ground: Ground): JumpDesc {
  const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
  return { id, x: k.x, z: k.z, yaw: k.yaw, length: k.length, height: k.height, halfWidth: k.half, y: ground.surfaceHeight(k.x - fx * k.length, k.z - fz * k.length) };
}

/** A place's kicker (the car park's roof, the quarry's edge): its lip, its size, its foot's height. */
function placeKicker(id: number, k: IslandJump): JumpDesc {
  return { id, x: k.x, z: k.z, yaw: k.yaw, length: k.length, height: k.height, halfWidth: k.half, y: k.y - k.height };
}

/** A hump of the ground (the Gardens' crest and dunes), taken either way: its whole length, its base's height. */
function humpDesc(id: number, h: Hump, ground: Ground): JumpDesc {
  const reach = h.top + h.ramp;
  const base = Math.min(ground.surfaceHeight(h.x - h.dx * reach, h.z - h.dz * reach), ground.surfaceHeight(h.x + h.dx * reach, h.z + h.dz * reach));
  return { id, x: h.x, z: h.z, yaw: Math.atan2(h.dx, h.dz), length: reach, back: reach, height: h.h, halfWidth: h.half, y: base };
}

/** The twenty as the island has them, the plan's order: its places' own and the kickers built for the rest. */
export function islandJumps(ground: Ground, places: readonly Place[], kickers: readonly Kicker[]): JumpDesc[] {
  const crown = places.find((p) => p.id === 'crown') as CrownPlace | undefined, quay = quayPlace(places);
  const out: JumpDesc[] = [];
  JUMPS.forEach((_, id) => {
    const k = kickers.find((q) => q.jump === id);
    let jd: JumpDesc | null = k ? kickerDesc(id, k, ground) : null;
    if (!jd) jd = placeJump(id, ground, crown, quay);
    if (jd) out.push(jd);
  });
  return out;
}

/** The jumps the places built (slices 8–12), by the plan's index; null where this slice builds a kicker. */
function placeJump(id: number, ground: Ground, crown: CrownPlace | undefined, quay: ReturnType<typeof quayPlace>): JumpDesc | null {
  switch (id) {
    case 6: return crown ? placeKicker(id, crown.jumps.edge) : null;
    case 11: {
      // the piers' gap: its two kickers, each the other's landing, as one jump taken either way
      const g = quay?.gap, k = quay?.kickers[0]?.jd;
      if (!g || !k) return null;
      const half = Math.abs(g.x1 - g.x0) / 2;
      return { id, x: (g.x0 + g.x1) / 2, z: g.z, yaw: k.yaw, length: half + k.length, back: half + k.length, height: k.height, halfWidth: k.halfWidth ?? 3, y: g.y };
    }
    case 12: return humpDesc(id, BEACH_JUMP, ground);
    case 13: return humpDesc(id, DUNE_JUMP, ground);
    case 14: {
      const k = quay?.kickers[2];
      return k ? { ...k.jd, id, y: k.base } : null;
    }
    case 15: return crown ? placeKicker(id, crown.jumps.roof) : null;
    case 16: {
      const first = MEGA_LAUNCH[0] as { along: number };
      return { ...megaJump(id), y: ground.surfaceHeight(MEGA.x + Math.sin(MEGA.yaw) * first.along, MEGA.z + Math.cos(MEGA.yaw) * first.along) };
    }
    case 17: return humpDesc(id, CREST, ground);
    default: return null;
  }
}
