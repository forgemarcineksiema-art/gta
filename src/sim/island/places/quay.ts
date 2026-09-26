/**
 * Coral Quay's places (M8.10 slice 11, docs/M8.10_PLAN.md §1.2): the marina (four piers from the north shore and the
 * boardwalk across their heads, broken between the second and the third by the gap: a kicker each side, 80 km/h
 * clears it); the pleasure pier and its ferris wheel (turning, scenery); the lighthouse in its loop at the spit's end
 * (its lamp turning); the Coral Hotel on the water; the stadium (its oval a ring of lanes, the tunnel in under the west
 * stand, the stands raised on columns over a concourse a car hides under, the infield's kicker); boats at their
 * moorings; and the giant duck afloat in the bay, a body the hovercraft pushes: it floats, bobs, drifts and comes home
 * on its tether. The reef, the stadium's floor and the decks' footprints are the shapes' (`../shapes/quay`). What
 * stands still goes into the chunks' statics; the wheel, the lamp and the duck are stepped, their poses kept for the
 * view.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { Architecture } from '../../city/architecture';
import { jumpStatics, type JumpDesc } from '../../city/jumps';
import { SEA } from '../../city/sea';
import { GROUPS_PROP } from '../../collision';
import { ACCENTS, CITY_COLORS, ISLAND_COLORS, PALETTE, QUAY_COLORS } from '../../palette';
import { IDENTITY_QUAT, quatFromYaw, type Quat, type StaticDesc } from '../../scene';
import type { P2 } from '../geom';
import { PLACES } from '../plan';
import { MARINA, OVAL, STADIUM_LEVEL, STANDS } from '../shapes/quay';
import type { Place, PlaceContext } from './place';

/** The ferris wheel (m, rad/s): its axle over the platform, its radius, its gondolas, a turn in 90 s, its width. */
export const WHEEL = { axle: 21, radius: 17, gondolas: 12, spin: (2 * Math.PI) / 90, width: 2.6 } as const;
/** The lighthouse (m, rad/s): its lamp's height over its foot, a turn in 10 s. */
export const LIGHTHOUSE = { lamp: 22.5, spin: (2 * Math.PI) / 10 } as const;
/**
 * The giant duck (m, kg, s): afloat with its middle `float` over the sea, bobbing `bob` m every `period` s on a spring
 * of `spring` /s² damped `damping` /s; the water's drag `drag` a second on its way through it; tethered `tether` m from
 * home, past which it is pulled back `pull` /s² a metre. Its body a capsule 10.8 m long, its head a ball.
 */
export const DUCK = {
  mass: 900, float: 1, bob: 0.15, period: 5, spring: 4, damping: 1.6, drag: 0.35, tether: 30, pull: 0.02, yawDamping: 0.8,
  body: { radius: 2.8, half: 2.6 }, head: { radius: 2.4, x: 3.4, y: 3.8 },
} as const;
/** The stands (m): the seats' front row over the concourse and their top row, in rows, round the oval in segments. */
export const SEATS = { low: 4.5, high: 13, rows: 4, segments: 56 } as const;
/** The tunnel's half width through the west stand (its road's carriageway and pavements, m). */
const TUNNEL_HALF = 12;
/** The decks (m): the boards' thickness, the railings' height and half thickness, the piles' spacing. */
const BOARDS = 0.5;
const RAIL = { height: 0.9, half: 0.12 } as const;
const PILE_EVERY = 12;
/** The sea's floor under the Quay's structures reaches no deeper than this (m). */
const FLOOR = -4.5;
/** A kicker at the piers' gap and in the stadium's infield (the grid's: 9 m up to 1.6 m, easing in; m). */
const KICKER = { length: 9, height: 1.6, half: 3.5 } as const;

/** A kicker the view draws: its ramp and the height it stands on. */
export interface Kicker { jd: JumpDesc; base: number }
/** The duck's body, its home and its pose now and a step before (the view's). */
export interface Duck {
  body: RAPIER.RigidBody;
  home: { x: number; z: number };
  x: number; y: number; z: number; yaw: number;
  px: number; py: number; pz: number; pyaw: number;
}
/** Coral Quay's running part: the wheel's and the lamp's turns, the duck, the kickers, the gap. */
export interface QuayPlace extends Place {
  readonly id: 'quay';
  /** The wheel's axle (it turns about the world's x), its turn now and a step before (rad). */
  readonly wheel: { x: number; y: number; z: number; angle: number; prev: number };
  /** The lamp's middle and its heading now and a step before (rad). */
  readonly lamp: { x: number; y: number; z: number; angle: number; prev: number };
  readonly duck: Duck;
  readonly kickers: readonly Kicker[];
  /** The piers' gap: its lips (world x, the sketch's west one first), the boardwalk's line, its boards' height there. */
  readonly gap: { x0: number; x1: number; z: number; y: number };
}

/** Coral Quay's place among the island's, if built. */
export function quayPlace(places: readonly Place[]): QuayPlace | null {
  return (places.find((p) => p.id === 'quay') as QuayPlace | undefined) ?? null;
}

/** A turn by `yaw` about the vertical, then `pitch` up along the turned +Z (the structures' and the kickers' frame). */
function pitched(yaw: number, pitch: number): Quat {
  const a = -pitch;
  return { x: Math.cos(yaw / 2) * Math.sin(a / 2), y: Math.sin(yaw / 2) * Math.cos(a / 2), z: -Math.sin(yaw / 2) * Math.sin(a / 2), w: Math.cos(yaw / 2) * Math.cos(a / 2) };
}
/** A sketch point in the world. */
const W = (x: number, z: number): P2 => [-x, -z];

/** What the parts build with: statics into the chunk that holds them. */
interface Kit {
  ctx: PlaceContext;
  ground(x: number, z: number): number;
  put(st: StaticDesc): StaticDesc;
  box(x: number, y: number, z: number, hx: number, hy: number, hz: number, color: number, tag?: string, rotation?: Quat): StaticDesc;
  cylinder(x: number, y: number, z: number, radius: number, halfHeight: number, color: number, sides?: number, tag?: string): void;
  /** A box along a piece from `a` to `b` (its top's line, [x, y, z]): `across` m right of it, `up` over it. */
  along(a: readonly number[], b: readonly number[], hx: number, hy: number, across: number, up: number, color: number, tag: string, extra?: number): StaticDesc;
}

export function quayPlaces(ctx: PlaceContext): Place[] {
  const put = (st: StaticDesc): StaticDesc => { ctx.statics(st.position.x, st.position.z).push(st); return st; };
  const kit: Kit = {
    ctx, put,
    ground: (x, z) => ctx.ground.surfaceHeight(x, z),
    box: (x, y, z, hx, hy, hz, color, tag = 'decor', rotation = IDENTITY_QUAT) => put({ shape: { kind: 'box', hx, hy, hz }, position: { x, y, z }, rotation, color, tag }),
    cylinder: (x, y, z, radius, halfHeight, color, sides, tag = 'decor') => {
      put({ shape: { kind: 'cylinder', radius, halfHeight, ...(sides ? { sides } : {}) }, position: { x, y, z }, rotation: IDENTITY_QUAT, color, tag });
    },
    along: (a, b, hx, hy, across, up, color, tag, extra = 0) => {
      const dx = (b[0] as number) - (a[0] as number), dy = (b[1] as number) - (a[1] as number), dz = (b[2] as number) - (a[2] as number);
      const run = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, run);
      // the piece's right (facing along it, +X is the left) and its up
      const rx = -Math.cos(yaw), rz = Math.sin(yaw);
      const nx = -Math.sin(pitch) * Math.sin(yaw), ny = Math.cos(pitch), nz = -Math.sin(pitch) * Math.cos(yaw);
      const mx = ((a[0] as number) + (b[0] as number)) / 2, my = ((a[1] as number) + (b[1] as number)) / 2, mz = ((a[2] as number) + (b[2] as number)) / 2;
      return put({ shape: { kind: 'box', hx, hy, hz: Math.hypot(run, dy) / 2 + extra }, position: { x: mx + rx * across + nx * up, y: my + ny * up, z: mz + rz * across + nz * up }, rotation: pitched(yaw, pitch), color, tag });
    },
  };

  clearPalms(ctx);
  const kickers: Kicker[] = [];
  const gap = marina(kit, kickers);
  const wheelAt = pleasurePier(kit);
  const lampAt = lighthouse(kit);
  hotel(kit);
  stadium(kit, kickers);

  // the duck: a capsule of a body along its x, a ball of a head, afloat in the bay
  const home = PLACES.duck, y0 = SEA.level + DUCK.float;
  const body = ctx.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(home.x, y0, home.z).enabledRotations(false, true, false)
    .setAngularDamping(DUCK.yawDamping).setCanSleep(false));
  const bodyMass = DUCK.mass * 0.8;
  ctx.world.createCollider(RAPIER.ColliderDesc.capsule(DUCK.body.half, DUCK.body.radius).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 })
    .setMass(bodyMass).setFriction(0.3).setRestitution(0.4).setCollisionGroups(GROUPS_PROP), body);
  ctx.world.createCollider(RAPIER.ColliderDesc.ball(DUCK.head.radius).setTranslation(DUCK.head.x, DUCK.head.y, 0)
    .setMass(DUCK.mass - bodyMass).setFriction(0.3).setRestitution(0.4).setCollisionGroups(GROUPS_PROP), body);
  const duck: Duck = { body, home: { x: home.x, z: home.z }, x: home.x, y: y0, z: home.z, yaw: 0, px: home.x, py: y0, pz: home.z, pyaw: 0 };
  const gravity = -ctx.world.gravity.y;
  const at = { x: 0, y: 0, z: 0 }, vel = { x: 0, y: 0, z: 0 }, turn = { x: 0, y: 0, z: 0, w: 1 }, impulse = { x: 0, y: 0, z: 0 };
  let time = 0;

  const place: QuayPlace = {
    id: 'quay',
    wheel: { ...wheelAt, angle: 0, prev: 0 },
    lamp: { ...lampAt, angle: 0, prev: 0 },
    duck, kickers, gap,
    step(dt: number): void {
      time += dt;
      const w = place.wheel, l = place.lamp;
      w.prev = w.angle;
      w.angle += WHEEL.spin * dt;
      l.prev = l.angle;
      l.angle += LIGHTHOUSE.spin * dt;
      // the duck's pose after the last physics step, and the water on it: held at its float by a damped spring (none
      // out of the water, where it only falls), dragged back through it, pulled home past its tether
      const p = body.translation(at), v = body.linvel(vel), q = body.rotation(turn);
      duck.px = duck.x; duck.py = duck.y; duck.pz = duck.z; duck.pyaw = duck.yaw;
      duck.x = p.x; duck.y = p.y; duck.z = p.z; duck.yaw = 2 * Math.atan2(q.y, q.w);
      const float = y0 + DUCK.bob * Math.sin((2 * Math.PI * time) / DUCK.period);
      const up = Math.max(0, gravity + DUCK.spring * (float - p.y) - DUCK.damping * v.y);
      let ax = -DUCK.drag * v.x, az = -DUCK.drag * v.z;
      const hx = duck.home.x - p.x, hz = duck.home.z - p.z, away = Math.hypot(hx, hz);
      if (away > DUCK.tether) { ax += (DUCK.pull * (away - DUCK.tether) * hx) / away; az += (DUCK.pull * (away - DUCK.tether) * hz) / away; }
      impulse.x = ax * DUCK.mass * dt; impulse.y = up * DUCK.mass * dt; impulse.z = az * DUCK.mass * dt;
      body.applyImpulse(impulse, true);
    },
  };
  return [place];
}

/** Clear the fill's palms out of the ways onto the Quay's decks (the Quay's sweep lines its verges with them). */
function clearPalms(ctx: PlaceContext): void {
  // the boardwalk's west end and the pleasure pier's root, from the sweep's pavement (sketch rectangles)
  const ways = [{ x0: 330, x1: MARINA.walk.x0 + 12, z0: MARINA.walk.z - 6, z1: MARINA.walk.z + 6 }, { x0: 312, x1: MARINA.pleasure.x0 + 12, z0: 553, z1: 568 }];
  const fill = ctx.fill;
  for (let i = fill.palms.length - 1; i >= 0; i--) {
    const p = fill.palms[i] as { x: number; z: number };
    if (!ways.some((r) => -p.x > r.x0 && -p.x < r.x1 && -p.z > r.z0 && -p.z < r.z1)) continue;
    // a palm's pieces all stand on its point (its trunk, its fronds, its crown)
    const list = ctx.statics(p.x, p.z);
    for (let k = list.length - 1; k >= 0; k--) {
      const st = list[k] as StaticDesc;
      if (Math.abs(st.position.x - p.x) < 1e-6 && Math.abs(st.position.z - p.z) < 1e-6) list.splice(k, 1);
    }
    fill.palms.splice(i, 1);
  }
}

/**
 * A deck along its points (world [x, top's y, z]): the boards (the wheels' ground), a railing each side but where
 * another deck joins it (`joined`), one across its far end if it ends over the water, piles where the water is under it.
 */
function deck(kit: Kit, points: ReadonlyArray<readonly [number, number, number]>, half: number, joined: (x: number, z: number) => boolean, endRail: boolean): void {
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as readonly [number, number, number], b = points[i + 1] as readonly [number, number, number];
    kit.along(a, b, half, BOARDS / 2, 0, -BOARDS / 2, QUAY_COLORS.boards, 'kerb', 0.05);
    const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, rx = -uz, rz = ux;
    const lerp = (f: number): number[] => [a[0] + dx * f, a[1] + (b[1] - a[1]) * f, a[2] + dz * f];
    // the railings in runs of 1.5 m steps, each kept where no other deck's boards are just past it
    for (const side of [-1, 1]) {
      const o = side * (half - RAIL.half), n = Math.max(1, Math.ceil(len / 1.5));
      const keep = Array.from({ length: n }, (_, j) => {
        const t = ((j + 0.5) / n) * len;
        return !joined(a[0] + ux * t + rx * (o + side * 0.6), a[2] + uz * t + rz * (o + side * 0.6));
      });
      for (let j = 0; j < n;) {
        if (!keep[j]) { j++; continue; }
        let e = j;
        while (e < n && keep[e]) e++;
        if (((e - j) / n) * len > 1) kit.along(lerp(j / n), lerp(e / n), RAIL.half, RAIL.height / 2, o, RAIL.height / 2, PALETTE.barrier, 'building');
        j = e;
      }
    }
    // piles under the boards' edges where the water is
    for (let s = PILE_EVERY / 2; s < len; s += PILE_EVERY) for (const side of [-1, 1]) {
      const x = a[0] + ux * s + rx * side * (half - 0.4), z = a[2] + uz * s + rz * side * (half - 0.4);
      const top = a[1] + ((b[1] - a[1]) * s) / len - BOARDS, foot = kit.ground(x, z);
      if (foot < SEA.level) kit.cylinder(x, (top + foot) / 2, z, 0.3, (top - foot) / 2, QUAY_COLORS.piles, 6);
    }
  }
  if (!endRail) return;
  const a = points[points.length - 2] as readonly [number, number, number], b = points[points.length - 1] as readonly [number, number, number];
  const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
  kit.box(b[0] - Math.sin(yaw) * RAIL.half, b[1] + RAIL.height / 2, b[2] - Math.cos(yaw) * RAIL.half, half, RAIL.height / 2, RAIL.half, PALETTE.barrier, 'building', quatFromYaw(yaw));
}

/**
 * The marina: the boardwalk from the west shore to the east, sloping with the land from end to end, broken at the gap
 * with a kicker each side (each the other's landing); the four piers from their roots on the north shore, sloping to
 * the boardwalk's boards where they cross it, on out to their ends; boats moored between them. The gap's place.
 */
function marina(kit: Kit, kickers: Kicker[]): QuayPlace['gap'] {
  const m = MARINA;
  const [wx0, wz] = W(m.walk.x0, m.walk.z), [wx1] = W(m.walk.x1, m.walk.z);
  const y0 = kit.ground(wx0, wz) + 0.03, y1 = kit.ground(wx1, wz) + 0.03;
  // the boardwalk's boards' height at a world x along it
  const walkY = (x: number): number => y0 + ((y1 - y0) * (x - wx0)) / (wx1 - wx0);
  const [gx0] = W(m.gap.x0, 0), [gx1] = W(m.gap.x1, 0);
  const decks: Array<{ pts: Array<[number, number, number]>; half: number; end: boolean }> = [
    { pts: [[wx0, y0, wz], [gx0, walkY(gx0), wz]], half: m.walk.half, end: false },
    { pts: [[gx1, walkY(gx1), wz], [wx1, y1, wz]], half: m.walk.half, end: false },
  ];
  PLACES.marinaPiers.forEach((p, k) => {
    const x = p.from[0], root = -(m.pier.rootZ[k] as number);
    decks.push({ pts: [[x, kit.ground(x, root) + 0.03, root], [x, walkY(x), wz], [x, walkY(x), p.to[1]]], half: m.pier.half, end: true });
  });
  // on another deck's boards (a railing stops there)
  const on = (d: typeof decks[number], x: number, z: number): boolean => {
    for (let i = 0; i + 1 < d.pts.length; i++) {
      const a = d.pts[i] as [number, number, number], b = d.pts[i + 1] as [number, number, number];
      const dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz, t = ((x - a[0]) * dx + (z - a[2]) * dz) / l2;
      if (t >= -0.01 && t <= 1.01 && Math.abs((x - a[0]) * dz - (z - a[2]) * dx) / Math.sqrt(l2) < d.half) return true;
    }
    return false;
  };
  for (const d of decks) deck(kit, d.pts, d.half, (x, z) => decks.some((o) => o !== d && on(o, x, z)), d.end);
  // the gap's kickers: each rises to its lip over the gap, the other's its landing (the sketch's east is the world's −x)
  const profile = [{ along: -KICKER.length, y: 0 }, { along: -6, y: 0.267 }, { along: -3, y: 0.8 }, { along: 0, y: KICKER.height }];
  for (const [x, yaw] of [[gx0, -Math.PI / 2], [gx1, Math.PI / 2]] as const) {
    const jd: JumpDesc = { id: kickers.length, x, z: wz, yaw, length: KICKER.length, height: KICKER.height, profile, halfWidth: KICKER.half };
    const base = walkY(x);
    kickers.push({ jd, base });
    for (const st of jumpStatics(jd)) { st.position.y += base; kit.put(st); }
  }
  // boats moored between the piers, north and south of the boardwalk (sketch numbers)
  const colours = [QUAY_COLORS.hull, PALETTE.carBlue, QUAY_COLORS.hull, PALETTE.carOrange, QUAY_COLORS.hull, QUAY_COLORS.seatTeal, QUAY_COLORS.hull, QUAY_COLORS.coral];
  ([[483, 404], [507, 420], [531, 398], [583, 404], [607, 420], [546, 418], [494, 456], [596, 457]] as const).forEach(([sx, sz], k) => {
    const [x, z] = W(sx, sz), y = SEA.level;
    kit.box(x, y + 0.1, z, 1.2, 0.5, 3.6, colours[k] as number);
    kit.box(x, y + 0.95, z + 0.4, 0.85, 0.4, 1.3, CITY_COLORS.chalk);
    kit.box(x, y + 2.9, z - 0.6, 0.05, 2.3, 0.05, CITY_COLORS.roof);
  });
  return { x0: gx0, x1: gx1, z: wz, y: walkY((gx0 + gx1) / 2) };
}

/**
 * The pleasure pier from the beach's top by the Quay's sweep out over the bay, lamps along its railings, and at its end
 * the wheel's platform: the ferris wheel's two A-frames (solid), a ticket booth; the wheel itself is the view's. Its
 * axle's place.
 */
function pleasurePier(kit: Kit): { x: number; y: number; z: number } {
  const m = MARINA, pp = PLACES.pleasurePier, mid = (pp.z0 + pp.z1) / 2;
  const x0 = -m.pleasure.x0, level = kit.ground(x0, mid) + 0.03;
  // (the world's −x is out over the bay)
  const endX = pp.x0, farX = pp.x0 - m.platform.length;
  const inPlatform = (x: number, z: number): boolean => x <= endX + 0.5 && x >= farX - 0.5 && Math.abs(z - mid) < m.platform.half;
  const onPier = (x: number, z: number): boolean => x <= x0 && x >= endX - 0.5 && Math.abs(z - mid) < m.pleasure.half;
  deck(kit, [[x0, level, mid], [endX, level, mid]], m.pleasure.half, inPlatform, false);
  deck(kit, [[endX, level, mid], [farX, level, mid]], m.platform.half, onPier, true);
  // the platform's near end either side of the pier
  const side = (m.platform.half - m.pleasure.half) / 2;
  for (const s of [-1, 1]) kit.box(endX - RAIL.half, level + RAIL.height / 2, mid + s * (m.pleasure.half + side), RAIL.half, RAIL.height / 2, side, PALETTE.barrier, 'building');
  // lamps on the railings' line every 15 m (their heads glow at dusk)
  for (let x = x0 - 12; x > endX + 4; x -= 15) for (const s of [-1, 1]) {
    const z = mid + s * (m.pleasure.half - RAIL.half);
    kit.box(x, level + RAIL.height + 1.2, z, 0.06, 1.2, 0.06, PALETTE.charcoal);
    kit.box(x, level + RAIL.height + 2.5, z, 0.25, 0.14, 0.25, PALETTE.laneMark, 'glow');
  }
  // the wheel's A-frames either side of it: a leg each way from the axle down to the platform, leaning in
  const wx = PLACES.ferrisWheel.x, spread = 10, leg = Math.hypot(spread, WHEEL.axle), lean = Math.atan2(spread, WHEEL.axle);
  for (const s of [-1, 1]) for (const foot of [-1, 1]) {
    // a box standing on its y, its top turned toward the axle (about the world's x)
    const a = -foot * lean;
    kit.box(wx + s * (WHEEL.width / 2 + 0.9), level + WHEEL.axle / 2, mid + (foot * spread) / 2, 0.35, leg / 2, 0.35, PALETTE.barrier, 'building', { x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) });
  }
  // a ticket booth by the platform's railing
  kit.box(wx + 7, level + 1.3, mid - m.platform.half + 3, 1.6, 1.3, 1.4, QUAY_COLORS.coral, 'building');
  kit.box(wx + 7, level + 2.75, mid - m.platform.half + 3, 1.9, 0.15, 1.7, PALETTE.barrier);
  return { x: wx, y: level + WHEEL.axle, z: mid };
}

/** The lighthouse on the spit's end, in its loop: a tower in white and red, the gallery, the lantern; the lamp's place. */
function lighthouse(kit: Kit): { x: number; y: number; z: number } {
  const { x, z } = PLACES.lighthouse, y = kit.ground(x, z);
  kit.cylinder(x, y + 0.5, z, 3.8, 0.7, PALETTE.concrete, 8);
  [PALETTE.barrier, QUAY_COLORS.lighthouse, PALETTE.barrier].forEach((c, k) => kit.cylinder(x, y + 1.2 + 3.25 + k * 6.5, z, 3.4 - k * 0.3, 3.25, c, 8));
  kit.cylinder(x, y + 20.9, z, 3.3, 0.2, PALETTE.charcoal, 8);
  kit.cylinder(x, y + 22.5, z, 1.9, 1.4, PALETTE.glass, 8, 'glow');
  kit.cylinder(x, y + 24.2, z, 2.2, 0.3, QUAY_COLORS.lighthouse, 8);
  kit.cylinder(x, y + 24.9, z, 0.6, 0.45, QUAY_COLORS.lighthouse, 8);
  // its door toward the loop's way in (the lighthouse road comes from the world's +x, +z)
  kit.box(x + 2.45, y + 2.3, z + 2.45, 0.9, 1.1, 0.15, PALETTE.charcoal, 'decor', quatFromYaw(Math.PI / 4));
  // its solid: an octagon up to the gallery
  const hull = Array.from({ length: 8 }, (_, k) => ({ x: x + Math.cos((k * Math.PI) / 4) * 3.6, z: z + Math.sin((k * Math.PI) / 4) * 3.6 }));
  kit.put({ shape: { kind: 'prism', points: hull, y0: y - 1, y1: y + 21 }, position: { x, y: y + 10, z }, rotation: IDENTITY_QUAT, color: PALETTE.barrier, tag: 'building', collisionOnly: true });
  return { x, y: y + LIGHTHOUSE.lamp, z };
}

/**
 * The Coral Hotel on the bay's north shore: its podium over the plan's footprint, its tower in pale coral rising from
 * it with the Quay's sign on its roof toward the bay, and its wing out over the water on piles.
 */
function hotel(kit: Kit): void {
  const h = PLACES.hotel, statics: StaticDesc[] = [], a = new Architecture(statics);
  let base = -Infinity, foot = Infinity;
  for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
    const y = kit.ground(h.x + dx * h.hx, h.z + dz * h.hz);
    base = Math.max(base, y);
    foot = Math.min(foot, y);
  }
  a.building(0, 0, h.hx, h.hz, 'marina', 1, 1, 2, 0, ACCENTS.marina, false, true);
  a.box(0, (foot - base - 0.4) / 2, 0, h.hx + 0.05, (base - foot + 0.4) / 2, h.hz + 0.05, CITY_COLORS.stone, 'building');
  // the tower on the podium's roof (its ground floor inside the podium), its face and sign toward the bay (the world's −z)
  const lift = 3.8 + 3.1, from = statics.length;
  a.rotatedLandmark(0, 0, 0, h.hx - 10, h.hz - 5, { body: QUAY_COLORS.hotel, sign: ACCENTS.marina, floors: 12, district: 'marina' }, ACCENTS.marina);
  for (let i = from; i < statics.length; i++) (statics[i] as StaticDesc).position.y += lift;
  a.rotateFrom(0, h.x, h.z, 0);
  for (const st of statics) { st.position.y += base; kit.put(st); }
  // the wing on the water, off the podium's south face from the shore out over the bay (sketch numbers)
  const [wx0, wz0] = W(630, 362), [wx1, wz1] = W(676, 392);
  const cx = (wx0 + wx1) / 2, cz = (wz0 + wz1) / 2, hx = Math.abs(wx1 - wx0) / 2, hz = Math.abs(wz1 - wz0) / 2;
  const deckY = kit.ground(cx, wz0 - 1) + 0.2, wing: StaticDesc[] = [], b = new Architecture(wing);
  b.building(0, 0, hx, hz, 'marina', 1, 1, 2, 1, ACCENTS.marina, true, true, { body: QUAY_COLORS.hotel });
  b.rotateFrom(0, cx, cz, 0);
  for (const st of wing) { st.position.y += deckY; kit.put(st); }
  // what it stands on: a solid down into the water (nothing drives under it), piles along its sea side
  kit.box(cx, (deckY + FLOOR) / 2, cz, hx, (deckY - FLOOR) / 2, hz, CITY_COLORS.stone, 'building').collisionOnly = true;
  for (let x = wx0 - 3; x > wx1; x -= 7) for (const z of [wz1 + 0.6, cz]) {
    const bed = kit.ground(x, z);
    if (bed < SEA.level) kit.cylinder(x, (deckY + bed) / 2, z, 0.45, (deckY - bed) / 2, QUAY_COLORS.piles, 6);
  }
}

/**
 * The stadium on its level floor: the stands round the oval in segments (four rows of seats a segment raised on columns
 * over the concourse, a solid slab under them, the back wall behind, roofs over the long sides), the tunnel's portal
 * through the west stand (the world's +x end) with its lintel, four floodlights, the scoreboard over the east stand, the
 * concourse's floor; the infield's kicker.
 */
function stadium(kit: Kit, kickers: Kicker[]): void {
  const o = OVAL, level = STADIUM_LEVEL, S = SEATS.segments, rise = SEATS.high - SEATS.low;
  // a point `d` m off the oval's line along its outward normal, at its angle `t`
  const at = (t: number, d: number): [number, number] => {
    const c = Math.cos(t), s = Math.sin(t), nx = o.rz * c, nz = o.r * s, nl = Math.hypot(nx, nz);
    return [o.x + o.r * c + (nx / nl) * d, o.z + o.rz * s + (nz / nl) * d];
  };
  const mid = (p: readonly number[], q: readonly number[]): [number, number] => [((p[0] as number) + (q[0] as number)) / 2, ((p[1] as number) + (q[1] as number)) / 2];
  const inTunnel = (x: number, z: number): boolean => x > o.x + o.r && Math.abs(z - o.z) < TUNNEL_HALF;
  for (let k = 0; k < S; k++) {
    const t0 = (2 * Math.PI * k) / S, t1 = (2 * Math.PI * (k + 1)) / S, long = Math.abs(Math.sin((t0 + t1) / 2)) > 0.8;
    const f0 = at(t0, STANDS.front), f1 = at(t1, STANDS.front), b0 = at(t0, STANDS.back), b1 = at(t1, STANDS.back);
    const e0 = at(t0, STANDS.edge + 0.2), e1 = at(t1, STANDS.edge + 0.2);
    const mf = mid(f0, f1), mb = mid(b0, b1), ux = mb[0] - mf[0], uz = mb[1] - mf[1], run = Math.hypot(ux, uz), yaw = Math.atan2(ux, uz);
    const half = Math.max(Math.hypot(f1[0] - f0[0], f1[1] - f0[1]), Math.hypot(b1[0] - b0[0], b1[1] - b0[1])) / 2 + 0.25;
    const colour = Math.floor(k / 4) % 2 === 0 ? QUAY_COLORS.coral : QUAY_COLORS.seatTeal;
    // the seats: rows stepping up from the front to the back
    for (let r = 0; r < SEATS.rows; r++) {
      const c = (r + 0.5) / SEATS.rows, top = level + SEATS.low + ((r + 1) * rise) / SEATS.rows, bottom = level + SEATS.low + (r * rise) / SEATS.rows - 0.6;
      kit.box(mf[0] + ux * c, (top + bottom) / 2, mf[1] + uz * c, half, (top - bottom) / 2, run / SEATS.rows / 2 + 0.02, r % 2 === 0 ? colour : PALETTE.barrier, 'decor', quatFromYaw(yaw));
    }
    // their solid: one slab from the front row's foot to the back row's top
    kit.put({ shape: { kind: 'box', hx: half, hy: 0.4, hz: Math.hypot(run, rise) / 2 }, position: { x: (mf[0] + mb[0]) / 2, y: level + (SEATS.low + SEATS.high) / 2 - 0.4, z: (mf[1] + mb[1]) / 2 },
      rotation: pitched(yaw, Math.atan2(rise, run)), color: PALETTE.concrete, tag: 'building', collisionOnly: true });
    // the back wall (higher on the long sides, under their roofs), but at the tunnel's portal
    const wx = mb[0] + Math.sin(yaw) * 0.4, wz = mb[1] + Math.cos(yaw) * 0.4, wallTop = SEATS.high + (long ? 4.5 : 1.2);
    if (!inTunnel(wx, wz)) kit.box(wx, level + (wallTop - 0.5) / 2, wz, 0.4, (wallTop + 0.5) / 2, Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) / 2 + 0.3, CITY_COLORS.chalk, 'building', quatFromYaw(Math.atan2(b1[0] - b0[0], b1[1] - b0[1])));
    // the columns under the front row, every other segment
    if (k % 2 === 0 && !inTunnel(f0[0], f0[1])) kit.box(f0[0], level + SEATS.low / 2 - 0.3, f0[1], 0.4, SEATS.low / 2 - 0.3, 0.4, CITY_COLORS.stone, 'building');
    // the concourse's floor from the track's edge to the wall (the tunnel's road draws its own)
    const cm = mid(mid(e0, e1), mb);
    if (!inTunnel(cm[0], cm[1])) {
      kit.put({ shape: { kind: 'prism', points: [{ x: e0[0], z: e0[1] }, { x: e1[0], z: e1[1] }, { x: b1[0], z: b1[1] }, { x: b0[0], z: b0[1] }], y0: level + 0.005, y1: level + 0.045 },
        position: { x: (e0[0] + e1[0] + b0[0] + b1[0]) / 4, y: level + 0.025, z: (e0[1] + e1[1] + b0[1] + b1[1]) / 4 }, rotation: IDENTITY_QUAT, color: ISLAND_COLORS.paving, tag: 'decor' });
    }
    // the long sides' roofs, cantilevered in over the top rows
    if (long) {
      const inner = mid(at(t0, STANDS.front + 5), at(t1, STANDS.front + 5)), span = Math.hypot(inner[0] - mb[0], inner[1] - mb[1]);
      kit.box((mb[0] + inner[0]) / 2, level + wallTop + 0.5, (mb[1] + inner[1]) / 2, half + 0.2, 0.2, span / 2, PALETTE.barrier, 'decor', pitched(yaw + Math.PI, 0.08));
    }
  }
  // the tunnel's portal: the lintel over it in the back wall, the Quay's band over its mouth
  const [px, pz] = at(0, STANDS.back + 0.4), lintel = (SEATS.high + 1.2 - 6) / 2;
  kit.box(px, level + 6 + lintel, pz, 0.4, lintel, TUNNEL_HALF + 0.5, CITY_COLORS.chalk, 'building');
  kit.box(px + 0.5, level + 7.6, pz, 0.1, 0.8, TUNNEL_HALF - 2, ACCENTS.marina);
  // the floodlights at the four corners, their lamps toward the middle
  for (const t of [0.55, Math.PI - 0.55, Math.PI + 0.55, 2 * Math.PI - 0.55]) {
    const [x, z] = at(t, STANDS.back + 1.6), face = Math.atan2(o.x - x, o.z - z);
    kit.box(x, level + 16, z, 0.35, 16, 0.35, PALETTE.steel, 'building');
    kit.box(x + Math.sin(face) * 0.6, level + 32.5, z + Math.cos(face) * 0.6, 2.4, 1, 0.3, PALETTE.laneMark, 'glow', quatFromYaw(face));
  }
  // the scoreboard over the east stand (the world's −x end), facing the infield
  const [sx, sz] = at(Math.PI, STANDS.back + 0.6);
  kit.box(sx, level + SEATS.high + 6.2, sz, 0.5, 3.6, 9.5, PALETTE.charcoal);
  kit.box(sx + 0.55, level + SEATS.high + 6.2, sz, 0.05, 3.1, 9, ACCENTS.marina);
  for (const s of [-1, 1]) kit.box(sx, level + SEATS.high + 1.8, sz + s * 6, 0.25, 1.4, 0.25, PALETTE.steel);
  // the infield's kicker at the middle, launching toward the east stand (the world's −x)
  const jd: JumpDesc = { id: kickers.length, x: o.x, z: o.z, yaw: -Math.PI / 2, length: KICKER.length, height: KICKER.height, halfWidth: KICKER.half };
  kickers.push({ jd, base: level });
  for (const st of jumpStatics(jd)) { st.position.y += level; kit.put(st); }
}
