/**
 * The island's slipways and its sea trial (M8.10 slice 15, docs/M8.10_PLAN.md §1.4; the grid's M8.8 slices 19–20): the
 * hovercraft's two ways down to the sea, the marina's off the bay's quay and the beach's through the boardwalk's gap.
 * Each is a concrete ramp from its top on the shore out under the sea's surface, with kerbs along it; the island's wall
 * across its mouth is a gate every chassis but the hovercraft's stops at, as the grid's seawall's. The sea trial's ring
 * stands at the marina's top, its buoys are the plan's round the bay and the lighthouse, its finish is off the beach's
 * slipway. Worked out once from the plan and the ground; no Three.js.
 */
import { BALANCE } from '../balance';
import { SEA, SLIPWAY, buoyStatics } from '../city/sea';
import type { JobDef } from '../jobs/catalog';
import { PALETTE } from '../palette';
import type { StaticDesc } from '../scene';
import { COAST_REACH, type Ground, type GroundProbe } from './ground';
import { turn } from './places/crown';
import { BUOYS, SLIPWAYS } from './plan';

/** A slipway on the island: its top (the plan's point), its way out to sea, where the shore's line crosses it, its ramp. */
export interface IslandSlipway {
  x: number; z: number;
  /** Its way out to sea (a unit vector). */
  nx: number; nz: number;
  /** How far out from the top the shore's line is (m). */
  line: number;
  /** Off a steep edge over the water ('quay'), or down a beach's sand ('beach'). */
  kind: 'quay' | 'beach';
  /** The ramp's surface along its axis, (m out from the top, height), from its top down to its foot under the sea. */
  profile: ReadonlyArray<{ along: number; y: number }>;
}

/**
 * The ramps (m): off a quay level with its top for `inland` m back from its edge (a physics cell: the ground's height
 * field eases down over one past the dug edge, under the ramp), then a grade of `grade` down to `foot` under the sea,
 * the physics' ground dug `dig` m out past the edge under it (the land's height holds a cell out there) to `digTo`;
 * down a beach its sand's own slope, a piece every `step` m, from `back` m inland of the top (the pavement's edge) to
 * `past` m beyond the shore's line (past the wall in the shallows). Each `lift` over the ground it starts on; a slab
 * `thick` deep; its kerbs `kerb` wide and as high over it; the quay's body under it down past the sea's floor, `body`
 * deep.
 */
export const RAMP = { grade: 1 / 6, inland: 2, foot: -1.2, dig: 4, digTo: -4, lift: 0.04, step: 3, back: 3, past: 10, thick: 0.3, kerb: 0.4, body: 8 } as const;
/** The wall opens to a gate this far either side of a ramp's width, from the top out past the beach's wall (m). */
const MOUTH = { side: 3, out: 12 } as const;
/** The sea trial's ring: on the marina's axis this far back from the shore's line (the grid's 4 in from its wall; the
 *  quay's edge falls away over a metre or two, so its 4 m ring stands whole on the top), m. */
export const RING_BACK = 5.5;
/** Its finish: off the beach's slipway, this far out past the shore's line (the grid's 24.5 off its east slipway), m. */
export const FINISH_OUT = 25;

/**
 * The plan's two slipways on the ground: each one's kind by its shore (a steep edge near its top is a quay's, else a
 * beach's), where that shore's line crosses its axis (a quay's edge, a beach's waterline), its ramp's profile (a quay's
 * level to its edge, then a straight run down; a beach's the sand's own slope); under a quay's ramp past its edge the
 * ground is dug.
 */
export function islandSlipways(ground: Ground): IslandSlipway[] {
  const probe: GroundProbe = { h: 0, steep: 0, steepKind: -1, road: Infinity, surface: 0 };
  return SLIPWAYS.map(({ at, out }) => {
    const [x, z] = at, len = Math.hypot(out[0], out[1]), nx = out[0] / len, nz = out[1] / len;
    const kind: IslandSlipway['kind'] = ground.probe(x, z, probe).steep < COAST_REACH ? 'quay' : 'beach';
    // the shore's line out along the axis: a quay's steep edge (its signed distance down to 0), a beach's waterline
    let line = 0;
    const off = (d: number): boolean => (kind === 'quay' ? ground.probe(x + nx * d, z + nz * d, probe).steep <= 0 : ground.surfaceHeight(x + nx * d, z + nz * d) < SEA.level);
    while (line < 80 && !off(line)) line += 0.1;
    const profile: Array<{ along: number; y: number }> = [];
    if (kind === 'quay') {
      const top = ground.surfaceHeight(x + nx * (line - RAMP.inland), z + nz * (line - RAMP.inland)) + RAMP.lift;
      profile.push({ along: line - RAMP.inland, y: top }, { along: line, y: top }, { along: line + (top - RAMP.foot) / RAMP.grade, y: RAMP.foot });
      // the land's height holds a cell out past the edge: dug under the ramp, so the wheels meet the ramp there
      const mid = line + RAMP.dig / 2;
      ground.dig(x + nx * mid, z + nz * mid, Math.atan2(nx, nz), SLIPWAY.width / 2 + 0.5, RAMP.dig / 2, RAMP.digTo);
    } else {
      for (let a = -RAMP.back; a <= line + RAMP.past + 1e-6; a += RAMP.step) profile.push({ along: a, y: ground.surfaceHeight(x + nx * a, z + nz * a) + RAMP.lift });
    }
    return { x, z, nx, nz, line, kind, profile };
  });
}

/** Whether a shore's point (x, z) is at a slipway's mouth, where the island's wall is a gate: across its ramp and a little either side. */
export function atSlipway(slipways: readonly IslandSlipway[], x: number, z: number): boolean {
  for (const s of slipways) {
    const dx = x - s.x, dz = z - s.z, along = dx * s.nx + dz * s.nz, across = Math.abs(dx * s.nz - dz * s.nx);
    if (across < SLIPWAY.width / 2 + MOUTH.side && along > -MOUTH.side && along < s.line + MOUTH.out) return true;
  }
  return false;
}

/** Where a slipway's ramp begins on the land: the way down to the sea the street furniture keeps clear. */
export function slipwayHead(s: IslandSlipway): { x: number; z: number } {
  const a = (s.profile[0] as { along: number }).along;
  return { x: s.x + s.nx * a, z: s.z + s.nz * a };
}

/** A slipway's height at `along` m out from its top on its ramp (its first height before it, its foot's past it). */
export function rampAt(s: IslandSlipway, along: number): number {
  const p = s.profile;
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i] as { along: number; y: number }, b = p[i + 1] as { along: number; y: number };
    if (along <= b.along || i + 2 === p.length) {
      const t = Math.max(0, Math.min(1, (along - a.along) / (b.along - a.along || 1)));
      return a.y + (b.y - a.y) * t;
    }
  }
  return (p[0] as { along: number; y: number }).y;
}

/**
 * The slipways' and the sea trial's statics: each ramp's slab a piece at a time (the wheels' ground, drawn), its kerbs
 * either side, a quay's body under it; a buoy at each of the trial's points.
 */
export function seaStatics(slipways: readonly IslandSlipway[]): StaticDesc[] {
  const out: StaticDesc[] = [];
  for (const s of slipways) {
    const yaw = Math.atan2(s.nx, s.nz), lx = s.nz, lz = -s.nx, half = SLIPWAY.width / 2;
    const at = (along: number, y: number, side: number): { x: number; y: number; z: number } => ({ x: s.x + s.nx * along + lx * side, y, z: s.z + s.nz * along + lz * side });
    for (let i = 0; i + 1 < s.profile.length; i++) {
      const a = s.profile[i] as { along: number; y: number }, b = s.profile[i + 1] as { along: number; y: number };
      out.push(slab(at(a.along, a.y, 0), at(b.along, b.y, 0), yaw, half, RAMP.thick, PALETTE.kerb, 'kerb'));
      for (const side of [-1, 1]) {
        const o = side * (half + RAMP.kerb / 2);
        out.push(slab(at(a.along, a.y + RAMP.kerb, o), at(b.along, b.y + RAMP.kerb, o), yaw, RAMP.kerb / 2, 2 * RAMP.kerb, PALETTE.lightGrey, 'decor'));
      }
      // off a quay the ramp is a solid run of concrete down into the water, not a plank
      if (s.kind === 'quay') out.push(slab(at(a.along, a.y - RAMP.thick, 0), at(b.along, b.y - RAMP.thick, 0), yaw, half + RAMP.kerb, RAMP.body, PALETTE.concrete, 'decor'));
    }
  }
  for (const [x, z] of BUOYS) out.push(...buoyStatics({ x, z }));
  return out;
}

/** A slab whose top runs from `a` to `b` along its middle (heading `yaw`), `half` wide each side, `thick` deep under its top. */
function slab(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, yaw: number, half: number, thick: number, color: number, tag: string): StaticDesc {
  const run = Math.hypot(b.x - a.x, b.z - a.z), dy = b.y - a.y, pitch = Math.atan2(dy, run), length = Math.hypot(run, dy);
  // the top's middle, less half the thickness along the slab's up
  const ux = -Math.sin(pitch) * Math.sin(yaw), uy = Math.cos(pitch), uz = -Math.sin(pitch) * Math.cos(yaw);
  return {
    shape: { kind: 'box', hx: half, hy: thick / 2, hz: length / 2 },
    position: { x: (a.x + b.x) / 2 - ux * thick / 2, y: (a.y + b.y) / 2 - uy * thick / 2, z: (a.z + b.z) / 2 - uz * thick / 2 },
    rotation: turn(yaw, pitch), color, tag,
  };
}

/** The sea trial's ring: on the marina's axis, `RING_BACK` m in from the shore's line (at the ramp's top). */
export function trialRing(s: IslandSlipway): { x: number; z: number } {
  return { x: s.x + s.nx * (s.line - RING_BACK), z: s.z + s.nz * (s.line - RING_BACK) };
}

/**
 * The island's sea trial (the grid's `seaTrial`, M8.8 slice 20): its ring at the marina's slipway, the plan's buoys in
 * order, its finish off the beach's slipway; timed and paid as every trial, its bronze limit the line's length at the
 * bronze speed. Null without the two slipways.
 */
export function islandSeaTrial(slipways: readonly IslandSlipway[]): Omit<JobDef, 'id'> | null {
  const from = slipways[0], to = slipways[1];
  if (!from || !to) return null;
  const ring = trialRing(from), buoys = BUOYS.map(([x, z]) => ({ x, z }));
  const finish = { x: to.x + to.nx * (to.line + FINISH_OUT), z: to.z + to.nz * (to.line + FINISH_OUT) };
  const line = [ring, ...buoys, finish];
  let length = 0;
  for (let k = 1; k < line.length; k++) {
    const a = line[k - 1] as { x: number; z: number }, b = line[k] as { x: number; z: number };
    length += Math.hypot(b.x - a.x, b.z - a.z);
  }
  const tr = BALANCE.jobs.trial;
  return {
    kind: 'trial', x: ring.x, z: ring.z, yaw: Math.atan2(from.nx, from.nz), targetX: finish.x, targetZ: finish.z, level: 0, descriptor: -1,
    payout: tr.pay[2] as number, limitSeconds: Math.round(length / (tr.speeds[0] as number)), heat: 0, route: buoys, hover: true,
  };
}
