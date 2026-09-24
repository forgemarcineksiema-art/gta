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
import { glyphIndex, glyphOf } from '../../sim/glyphs';

export const SIGN_OPEN = 0;
export const SIGN_GOAL = 1;
export const SIGN_CLOSED = 2;

/** Each state's colours: the sign's face, its rim, its pictogram, and the ring on the road. */
export const SIGN_COLORS: ReadonlyArray<{ face: number; rim: number; glyph: number; ring: number }> = [
  { face: 0xf7f3ea, rim: 0x160e28, glyph: 0x160e28, ring: 0xf7f3ea },
  { face: 0xf7f3ea, rim: 0x2bd1ff, glyph: 0x160e28, ring: 0x2bd1ff },
  { face: 0x8d8a96, rim: 0x4a4a55, glyph: 0x4a4a55, ring: 0x8d8a96 },
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
  y: Float32Array;
  z: Float32Array;
  state: Uint8Array;
  /** `GLYPH_ORDER` index (`sim/glyphs.ts`), or minus a rival's poster number (its digits). */
  glyph: Int16Array;
  /** 1: on a pole from the ground. */
  pole: Uint8Array;
}

export interface RingList {
  count: number;
  x: Float32Array;
  z: Float32Array;
  scale: Float32Array;
  state: Uint8Array;
}

/** What the camera sees for the hunt's sighting rule: its position and its horizontal look direction. */
export interface SignView { x: number; z: number; dirX: number; dirZ: number }

export function newSignList(capacity: number): SignList {
  return {
    count: 0, x: new Float32Array(capacity), y: new Float32Array(capacity), z: new Float32Array(capacity),
    state: new Uint8Array(capacity), glyph: new Int16Array(capacity), pole: new Uint8Array(capacity),
  };
}

export function newRingList(capacity: number): RingList {
  return { count: 0, x: new Float32Array(capacity), z: new Float32Array(capacity), scale: new Float32Array(capacity), state: new Uint8Array(capacity) };
}

function addSign(out: SignList, x: number, y: number, z: number, state: number, glyph: number, pole: boolean): void {
  if (out.count >= out.x.length) return;
  const i = out.count++;
  out.x[i] = x;
  out.y[i] = y;
  out.z[i] = z;
  out.state[i] = state;
  out.glyph[i] = glyph;
  out.pole[i] = pole ? 1 : 0;
}

function addRing(out: RingList, x: number, z: number, scale: number, state: number): void {
  if (out.count >= out.x.length) return;
  const i = out.count++;
  out.x[i] = x;
  out.z[i] = z;
  out.scale[i] = scale;
  out.state[i] = state;
}

const scratch = { x: 0, z: 0 };

/**
 * Fills `signs` and `rings` for this frame. `time` drives the pulse and the bob; `view` the hunt's sighting rule
 * (null: always sighted); `carAt` interpolates a traffic record's position (false: not drawn).
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
      addRing(rings, d.x, d.z, wide * pulse, state);
      const up = state === SIGN_GOAL ? bob : 0;
      // a rival's sign floats over the car parked in its ring; the others stand on their poles
      if (d.kind === 'duel') addSign(signs, d.x, FLOAT_Y + up, d.z, state, glyphOf(d), false);
      else addSign(signs, d.x, SIGN_Y + up, d.z, state, glyphOf(d), true);
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
          addSign(signs, scratch.x, FLOAT_Y + bob, scratch.z, SIGN_GOAL, glyphIndex('key'), false);
        }
      } else if (hunt) {
        const agent = jobs.race.rivals[0] ?? -1;
        if (agent >= 0 && carAt(agent, scratch)) addSign(signs, scratch.x, FLOAT_Y + bob, scratch.z, SIGN_GOAL, glyphOf(running), false);
      } else if (!zone && jobs.target(scratch)) {
        addRing(rings, scratch.x, scratch.z, 1 + GOAL_PULSE * wave, SIGN_GOAL);
        addSign(signs, scratch.x, FLOAT_Y + bob, scratch.z, SIGN_GOAL, glyphOf(running), false);
      }
    }
  }
  // a door the way leads to: the house over its opening
  if (goal && goal.hasTarget && goal.door >= 0) {
    const door = sim.run.dropOffs[goal.door]?.door;
    if (door) addSign(signs, door.x, DOOR_Y + bob, door.z, SIGN_GOAL, glyphIndex('house'), false);
  }
  // a fare's hailer: the taxi over them
  const hailer = sim.fares.hailer, peds = sim.peds;
  if (hailer >= 0 && peds) addSign(signs, peds.x[hailer] as number, FLOAT_Y, peds.z[hailer] as number, SIGN_OPEN, glyphIndex('taxi'), false);
}

/** The pay shows over an open sign within this of the car (m, M8.7 D5). */
export const PAY_RANGE = 100;

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
