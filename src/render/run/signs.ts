/**
 * Which signs and rings the city shows this frame (docs/M8.7_PLAN.md D5–D6; DESIGN.md §20.3 rules 5–6): the pure
 * choice `MarkerView` draws, pinned in Node.
 *
 * - Between jobs every shown marker has its ring on the road and its sign on a pole over it (a rival's floats over
 *   its parked car); the goal's (the way's) is cyan: its ring pulses harder, its rim is cyan, it bobs.
 * - A running job's target has a cyan ring and its kind's sign floating over it; a hunt's car (the wanted car within
 *   `ringRange` in front of the camera, a hunted rival) has the sign over its roof and no ring; a zone job has its
 *   edge instead.
 * - A door the way leads to (BANK IT, BUY, LOSE THEM OR BANK IT) floats the house over its opening.
 * - A fare's hailer floats the taxi, open.
 * - With the police on the player every marker is closed: grey, still (the cold open's own excepted).
 *
 * Shape says what, colour says the state: open white, the goal cyan, closed grey; no kind has a colour of its own.
 * No allocation per call.
 */
import { BALANCE, RIVALS, type JobDef, type SimWorld } from '../../sim';
import { SIGNALS } from '../../sim/palette';
import { glyphIndex, glyphOf } from '../../sim/glyphs';
import { ringGround } from '../../sim/island/jobs';

export const SIGN_OPEN = 0;
export const SIGN_GOAL = 1;
export const SIGN_CLOSED = 2;

/** Each state's colours (the signals, M8.9 R1): the sign's face, its rim, its pictogram, and the ring on the road. */
export const SIGN_COLORS: ReadonlyArray<{ face: number; rim: number; glyph: number; ring: number }> = [
  { face: SIGNALS.ink, rim: SIGNALS.outline, glyph: SIGNALS.outline, ring: SIGNALS.ink },
  { face: SIGNALS.ink, rim: SIGNALS.way, glyph: SIGNALS.outline, ring: SIGNALS.way },
  { face: SIGNALS.off, rim: 0x4a4a55, glyph: 0x4a4a55, ring: SIGNALS.off },
];

/** A sign's centre over the ground on its pole (m), over a car or a walker, and over a door's opening. */
export const SIGN_Y = 3.3;
export const FLOAT_Y = 3.4;
export const DOOR_Y = 4.4;
/** The goal's sign bobs this much (m) at `BOB_HZ`; the goal's ring pulses `GOAL_PULSE`, the others `PULSE`. */
export const BOB = 0.12;
export const BOB_HZ = 1;
export const PULSE = 0.08;
export const GOAL_PULSE = 0.16;

export interface SignList {
  count: number;
  x: Float32Array;
  /** Over `base`: the ground's height under it (the grid's 0; the island's hills, a car's road, a door's floor). */
  y: Float32Array;
  base: Float32Array;
  z: Float32Array;
  state: Uint8Array;
  /** `GLYPH_ORDER` index (`sim/glyphs.ts`), or minus a rival's poster number (its digits). */
  glyph: Int16Array;
  /** 1: on a pole from the ground. */
  pole: Uint8Array;
  /** The marker's index in the jobs' defs, -1 for a sign that is not a marker's (a door, a hailer, a car). */
  def: Int16Array;
}

export interface RingList {
  count: number;
  x: Float32Array;
  z: Float32Array;
  /** The ground's plane under it (M8.10 slice 14): its height at the middle, its rise per metre along x and z (the grid's 0). */
  base: Float32Array;
  sx: Float32Array;
  sz: Float32Array;
  scale: Float32Array;
  state: Uint8Array;
}

/** What the camera sees for the hunt's sighting rule: its position and its horizontal look direction. */
export interface SignView { x: number; z: number; dirX: number; dirZ: number }

export function newSignList(capacity: number): SignList {
  return {
    count: 0, x: new Float32Array(capacity), y: new Float32Array(capacity), base: new Float32Array(capacity), z: new Float32Array(capacity),
    state: new Uint8Array(capacity), glyph: new Int16Array(capacity), pole: new Uint8Array(capacity), def: new Int16Array(capacity),
  };
}

export function newRingList(capacity: number): RingList {
  return {
    count: 0, x: new Float32Array(capacity), z: new Float32Array(capacity), base: new Float32Array(capacity), sx: new Float32Array(capacity), sz: new Float32Array(capacity),
    scale: new Float32Array(capacity), state: new Uint8Array(capacity),
  };
}

function addSign(out: SignList, x: number, y: number, z: number, state: number, glyph: number, pole: boolean, def = -1, base = 0): void {
  if (out.count >= out.x.length) return;
  const i = out.count++;
  out.def[i] = def;
  out.x[i] = x;
  out.y[i] = y;
  out.base[i] = base;
  out.z[i] = z;
  out.state[i] = state;
  out.glyph[i] = glyph;
  out.pole[i] = pole ? 1 : 0;
}

function addRing(out: RingList, x: number, z: number, scale: number, state: number, plane: RingPlane = FLAT): void {
  if (out.count >= out.x.length) return;
  const i = out.count++;
  out.x[i] = x;
  out.z[i] = z;
  out.base[i] = plane.y;
  out.sx[i] = plane.sx;
  out.sz[i] = plane.sz;
  out.scale[i] = scale;
  out.state[i] = state;
}

const scratch = { x: 0, z: 0 };

/** The ground's plane under a ring: its height at the middle and its rise per metre along x and z. */
export interface RingPlane { readonly y: number; readonly sx: number; readonly sz: number }
const FLAT: RingPlane = { y: 0, sx: 0, sz: 0 };
/** Each job's ring's plane and its end's, worked out the first time they are drawn (a ring never moves). */
const planes = new WeakMap<JobDef, { ring: RingPlane; end: RingPlane | null }>();

/** A ring on the island stands this far over its ground's plane, past the ground's strays from it (m): clear of a pavement's top. */
export const RING_LIFT = 0.1;

/**
 * The plane a job's ring lies on (M8.10 slice 14): the island's ground under it, fitted through its middle and edge
 * (`ringGround`), raised by the most the ground strays from it and `RING_LIFT`, so no part of the ring sinks into a
 * slope or under a pavement; or its end's (`end`: the target a running job's ring stands on); the grid's flat 0.
 */
export function ringPlane(sim: SimWorld, d: JobDef, end = false): RingPlane {
  const island = sim.island;
  if (!island) return FLAT;
  let known = planes.get(d);
  if (!known) {
    known = { ring: plane(ringGround(island, d.x, d.z, { y: 0, sx: 0, sz: 0, bent: 0 })), end: null };
    planes.set(d, known);
  }
  if (!end) return known.ring;
  known.end ??= plane(ringGround(island, d.targetX, d.targetZ, { y: 0, sx: 0, sz: 0, bent: 0 }));
  return known.end;
}
const plane = (g: { y: number; sx: number; sz: number; bent: number }): RingPlane => ({ y: g.y + g.bent + RING_LIFT, sx: g.sx, sz: g.sz });

/** The ground's height under a sign at (x, z): the island's drawn ground, the grid's 0. */
function groundUnder(sim: SimWorld, x: number, z: number): number {
  return sim.island ? sim.island.ground.surfaceHeight(x, z) : 0;
}

/**
 * Fills `signs` and `rings` for this frame, each over the ground under it (the island's worked out once a ring,
 * `ringPlane`). `time` drives the pulse and the bob; `view` the hunt's sighting rule (null: always sighted); `carAt`
 * interpolates a traffic record's position (false: not drawn).
 */
export function collectSigns(sim: SimWorld, time: number, view: SignView | null, carAt: (agent: number, out: { x: number; z: number }) => boolean,
  signs: SignList, rings: RingList): void {
  signs.count = 0;
  rings.count = 0;
  const jobs = sim.jobs, way = sim.way;
  const closed = sim.pursuit.state !== 'idle' && !sim.coldOpen.active;
  const wave = Math.sin(time * Math.PI * 2 * 1.2);
  const bob = BOB * Math.sin(time * Math.PI * 2 * BOB_HZ);
  const goal = way?.goal;
  const goalRing = goal && goal.hasTarget && goal.kind !== 'job' ? goal.id : -1;
  if (jobs.state === 'idle') {
    for (let i = 0; i < jobs.defs.length; i++) {
      const d = jobs.defs[i] as JobDef;
      if (d.kind === 'fare' || !jobs.shown(d)) continue;
      const state = closed ? SIGN_CLOSED : d.id === goalRing ? SIGN_GOAL : SIGN_OPEN;
      const wide = d.kind === 'duel' ? BALANCE.board.ringRadius / BALANCE.jobs.markerRadius : 1;
      const pulse = state === SIGN_CLOSED ? 1 : 1 + (state === SIGN_GOAL ? GOAL_PULSE : PULSE) * wave;
      // on the ground under it (the island's slopes: M8.10 slice 14)
      const plane = ringPlane(sim, d);
      addRing(rings, d.x, d.z, wide * pulse, state, plane);
      const up = state === SIGN_GOAL ? bob : 0;
      // a rival's sign floats over the car parked in its ring; the others stand on their poles
      if (d.kind === 'duel') addSign(signs, d.x, FLOAT_Y + up, d.z, state, glyphOf(d), false, i, plane.y);
      else addSign(signs, d.x, SIGN_Y + up, d.z, state, glyphOf(d), true, i, plane.y);
    }
  } else {
    const running = jobs.running;
    if (running) {
      const zone = jobs.state === 'active' && (running.kind === 'rage' || running.kind === 'mayhem');
      const hunt = running.kind === 'duel' && RIVALS[running.level]?.format === 'hunt';
      if (jobs.state === 'hunting') {
        // the wanted car, within its range and in front of the camera: the key over its roof (a sighting, not a radar)
        const agent = jobs.wantedAgent;
        if (agent >= 0 && carAt(agent, scratch) && sighted(sim, scratch.x, scratch.z, view)) {
          addSign(signs, scratch.x, FLOAT_Y + bob, scratch.z, SIGN_GOAL, glyphIndex('key'), false, -1, carBase(sim, agent));
        }
      } else if (hunt) {
        const agent = jobs.race.rivals[0] ?? -1;
        if (agent >= 0 && carAt(agent, scratch)) addSign(signs, scratch.x, FLOAT_Y + bob, scratch.z, SIGN_GOAL, glyphOf(running), false, -1, carBase(sim, agent));
      } else if (!zone && jobs.target(scratch)) {
        const plane = ringPlane(sim, running, true);
        addRing(rings, scratch.x, scratch.z, 1 + GOAL_PULSE * wave, SIGN_GOAL, plane);
        addSign(signs, scratch.x, FLOAT_Y + bob, scratch.z, SIGN_GOAL, glyphOf(running), false, -1, plane.y);
      }
    }
  }
  // a door the way leads to: the house over its opening, over its floor
  if (goal && goal.hasTarget && goal.door >= 0) {
    const site = sim.run.dropOffs[goal.door];
    if (site) addSign(signs, site.door.x, DOOR_Y + bob, site.door.z, SIGN_GOAL, glyphIndex('house'), false, -1, site.y);
  }
  // a fare's hailer: the taxi over them
  const hailer = sim.fares.hailer, peds = sim.peds;
  if (hailer >= 0 && peds) {
    const x = peds.x[hailer] as number, z = peds.z[hailer] as number;
    addSign(signs, x, FLOAT_Y, z, SIGN_OPEN, glyphIndex('taxi'), false, -1, groundUnder(sim, x, z));
  }
}

/** The road under a traffic car (its record's height: a deck's, a hill's): the island's; the grid's flat 0. */
function carBase(sim: SimWorld, agent: number): number {
  return sim.island && sim.traffic ? (sim.traffic.y[agent] as number) : 0;
}

/** The pay shows over an open sign within this of the car (m, M8.7 D5). */
export const PAY_RANGE = 100;

/** A sign's face across its rim (m): what the fold and the floor measure. */
export const SIGN_SIZE = 1.52;

/**
 * A sign reads from afar (docs/M8.9_PLAN.md R7): never smaller on the screen than `px` at 720p, in the HUD's scale (the
 * height over 720 held to 0.85–1.5, as `ui/scale.ts`); past the depth where its face would be, it is drawn larger about
 * its centre, out to `reach` m (beyond, it shrinks as the world does). The goal's sign is `goal` times the others.
 */
export const SIGN_MIN = { px: 28, reach: 150, goal: 1.25, base: 720, scaleMin: 0.85, scaleMax: 1.5 } as const;

/** The sign's growth at `depth` m for a vertical fov (rad) and a view `height` CSS px tall: 1 where its face reads, more past it. */
export function signScale(depth: number, fovY: number, height: number): number {
  if (!(depth > 0) || !(fovY > 0) || !(height > 0)) return 1;
  const k = Math.min(SIGN_MIN.scaleMax, Math.max(SIGN_MIN.scaleMin, height / SIGN_MIN.base));
  const px = signShare(SIGN_SIZE, Math.min(depth, SIGN_MIN.reach), fovY) * height;
  const want = SIGN_MIN.px * k;
  return px >= want ? 1 : want / px;
}

/** The height (m) a pay label sits at over a sign on its pole: over the face as drawn, grown or not. */
export function signTopY(grow: number, goal: boolean): number {
  return SIGN_Y + (SIGN_SIZE / 2) * grow * (goal ? SIGN_MIN.goal : 1) + 0.29;
}

/**
 * A sign taller on screen than `from` of the screen's height folds away and is gone at `to` (M8.9 R7): driving through
 * a ring's centre the camera passes its pole, and the face (1.52 m across) would fill the screen. Its pole folds with it.
 */
export const SIGN_FOLD = { from: 0.15, to: 0.2 } as const;

/** A sign's share of the screen's height: its size (m) over the view's height at its depth (m) for a vertical fov (rad); 0 behind the camera. */
export function signShare(size: number, depth: number, fovY: number): number {
  if (depth <= 0) return 0;
  return size / (2 * depth * Math.tan(fovY / 2));
}

/** The sign's scale for its share of the screen's height: whole up to `SIGN_FOLD.from`, gone from `SIGN_FOLD.to`. */
export function signFold(share: number): number {
  if (!(share > SIGN_FOLD.from)) return 1;
  if (share >= SIGN_FOLD.to) return 0;
  return (SIGN_FOLD.to - share) / (SIGN_FOLD.to - SIGN_FOLD.from);
}

/** The nearest open marker within `PAY_RANGE` of the car and in front of the camera, whose pay shows over its sign; null for none. */
export function paySign(sim: SimWorld, view: SignView | null): JobDef | null {
  const jobs = sim.jobs;
  if (jobs.state !== 'idle') return null;
  const p = sim.probe;
  let best: JobDef | null = null, bestD = PAY_RANGE * PAY_RANGE;
  for (let i = 0; i < jobs.defs.length; i++) {
    const d = jobs.defs[i] as JobDef;
    if (d.kind === 'fare' || !jobs.open(d)) continue;
    const dd = (d.x - p.x) ** 2 + (d.z - p.z) ** 2;
    if (dd >= bestD) continue;
    if (view && (d.x - view.x) * view.dirX + (d.z - view.z) * view.dirZ < 0) continue;
    best = d;
    bestD = dd;
  }
  return best;
}

/** A marker's headline pay: a rival's purse, else its payout. */
export function payOf(sim: SimWorld, d: JobDef): number {
  return d.kind === 'duel' ? sim.board.purse(d.level) : d.payout;
}

/** The hunt's sighting: within `ringRange` of the car and in front of the camera. */
function sighted(sim: SimWorld, x: number, z: number, view: SignView | null): boolean {
  const p = sim.probe, range = BALANCE.jobs.order.ringRange;
  if ((x - p.x) ** 2 + (z - p.z) ** 2 > range * range) return false;
  return !view || (x - view.x) * view.dirX + (z - view.z) * view.dirZ >= 0;
}
