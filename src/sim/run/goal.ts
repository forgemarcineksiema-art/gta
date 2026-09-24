/**
 * The goal line (docs/DESIGN.md §13.4, M5.5 slice 2): one line that says what
 * to do next and one point the route leads to, always. Precedence: the running
 * job (its own line and target); the police on you (LOSE THEM, and the
 * nearest door while the bag holds something); the first undone step of the
 * first quarter hour's chain when it says more than the default; a bag above
 * the door threshold (BANK IT, the nearest door); else the nearest ring (TAKE
 * A JOB). Which ring and which door is the chooser's (M8.7 D1): the way's
 * road distances with its hold, or the straight line when there is no way.
 * Pure over the world's state; writes into the caller's object.
 */
import { BALANCE } from '../balance';
import { RIVALS, type Req, type RivalDef } from '../board/rivals';
import type { JobKind } from '../jobs/catalog';
import type { SimWorld } from '../SimWorld';

/** 'rival': a wanted board's rival is ready, the arrow on their ring; 'needs': their first requirement still open (M6). */
export type GoalKind = 'none' | 'job' | 'lose' | 'take' | 'bank' | 'buy' | 'escape' | 'order' | 'fill' | 'rival' | 'needs';

export interface Goal {
  kind: GoalKind;
  /** The arrow's point; meaningful when `hasTarget`. */
  hasTarget: boolean;
  x: number;
  z: number;
  /** 'buy': the cash still missing (0: affordable, the point is a door); 'fill': the bag now. */
  amount: number;
  /** The kind of the ring the point is ('' for a door, a job's own target or none): the line's dot. */
  ring: JobKind | '';
  /** 'rival' and 'needs': the rival (`RIVALS` index) and, for 'needs', the requirement's index. */
  rival: number;
  req: number;
  /** The job def the point is (a ring, or the running job's), -1 for none; the drop-off whose door it is, -1 for none. */
  id: number;
  door: number;
}

/** How the goal picks its ring and its door (M8.7 D1). Each writes the point, the ring's kind and the id or the door. */
export interface GoalChooser {
  /** The ring of a kind (or any, '') to go to; false when none is open. */
  ring(sim: SimWorld, kind: JobKind | '', out: Goal): boolean;
  /** The door to bank at; false on a map without one. */
  door(sim: SimWorld, out: Goal): boolean;
}

/** The chain's six steps in order, bits 0..5 of `Run.chain`, as the wall and the cards say them. */
export const CHAIN_STEPS: readonly string[] = [
  'TAKE A JOB', 'BANK THE BAG', 'BUY YOUR FIRST CAR', 'LOSE THE COPS AT ★★', 'STEAL A CAR TO ORDER', 'BANK 20,000 IN ONE RUN',
];
/** The bit of each step. */
export const STEP = { take: 0, bank: 1, car: 2, escape: 3, order: 4, big: 5 } as const;
export const CHAIN_ALL = (1 << CHAIN_STEPS.length) - 1;

export function newGoal(): Goal {
  return { kind: 'none', hasTarget: false, x: 0, z: 0, amount: 0, ring: '', rival: -1, req: -1, id: -1, door: -1 };
}

/** Every field of `from` into `to`. */
export function copyGoal(from: Goal, to: Goal): void {
  to.kind = from.kind;
  to.hasTarget = from.hasTarget;
  to.x = from.x;
  to.z = from.z;
  to.amount = from.amount;
  to.ring = from.ring;
  to.rival = from.rival;
  to.req = from.req;
  to.id = from.id;
  to.door = from.door;
}

/** The ring a requirement is met at, for the arrow: '' for none (a count with no place, like billboards). */
const REQ_RING: Partial<Record<Req['kind'], JobKind>> = {
  raceWins: 'race', medal: 'trial', escape: 'escape', takedowns: 'rage', zoneWins: 'rage', orders: 'order',
};

/**
 * The wanted board's step (M6, DESIGN.md §14.2), once the chain is done: the next rival's ring when their
 * requirements are met, else their first open one with the arrow on the nearest ring where it is met (the
 * nearest job for a best run; none for a count with no place).
 */
function boardGoal(sim: SimWorld, out: Goal, choose: GoalChooser): boolean {
  const board = sim.board;
  const i = board.next();
  if (i < 0) return false;
  out.rival = i;
  if (board.ready(i)) {
    const defs = sim.jobs.defs;
    for (let k = 0; k < defs.length; k++) {
      const d = defs[k];
      if (!d || d.kind !== 'duel' || d.level !== i) continue;
      out.kind = 'rival';
      out.x = d.x;
      out.z = d.z;
      out.ring = 'duel';
      out.id = d.id;
      out.hasTarget = true;
      return true;
    }
    return false;
  }
  const r = board.firstOpen(i);
  const want = (RIVALS[i] as RivalDef).reqs[r];
  if (!want) return false;
  out.kind = 'needs';
  out.req = r;
  out.amount = board.have(want);
  const ring = REQ_RING[want.kind];
  if (ring) out.hasTarget = choose.ring(sim, ring, out);
  else if (want.kind === 'bestRun') out.hasTarget = choose.ring(sim, '', out);
  return true;
}

/** The first step not done yet, or -1 when the chain is complete. */
export function chainStep(chain: number): number {
  for (let i = 0; i < CHAIN_STEPS.length; i++) if ((chain & (1 << i)) === 0) return i;
  return -1;
}

/** The nearest live ring by straight line (of a kind, or any): writes the point, its kind and its id; false when there is none. */
function nearestRing(sim: SimWorld, kind: JobKind | '', out: Goal): boolean {
  const jobs = sim.jobs;
  const p = sim.probe;
  let best = Infinity;
  for (let i = 0; i < jobs.defs.length; i++) {
    const d = jobs.defs[i];
    if (!d || !jobs.shown(d) || (kind !== '' && d.kind !== kind)) continue;
    const dist = (d.x - p.x) ** 2 + (d.z - p.z) ** 2;
    if (dist >= best) continue;
    best = dist;
    out.x = d.x;
    out.z = d.z;
    out.ring = d.kind;
    out.id = d.id;
    out.door = -1;
  }
  return best < Infinity;
}

/** The nearest drop-off's door by straight line; false on a map without one. */
function nearestDoor(sim: SimWorld, out: Goal): boolean {
  const p = sim.probe;
  const doors = sim.run.dropOffs;
  let best = Infinity;
  for (let i = 0; i < doors.length; i++) {
    const door = doors[i]?.door;
    if (!door) continue;
    const dist = (door.x - p.x) ** 2 + (door.z - p.z) ** 2;
    if (dist >= best) continue;
    best = dist;
    out.x = door.x;
    out.z = door.z;
    out.door = i;
  }
  out.ring = '';
  out.id = -1;
  return best < Infinity;
}

/** The straight line's choice, where there is no way (the test track, a sim without roads). */
export const NEAREST: GoalChooser = { ring: nearestRing, door: nearestDoor };

export function goalFor(sim: SimWorld, out: Goal, choose: GoalChooser = NEAREST): void {
  out.kind = 'none';
  out.hasTarget = false;
  out.amount = 0;
  out.ring = '';
  out.rival = -1;
  out.req = -1;
  out.id = -1;
  out.door = -1;
  const jobs = sim.jobs;
  if (jobs.running) {
    out.kind = 'job';
    out.id = jobs.active;
    out.hasTarget = jobs.target(out);
    return;
  }
  const run = sim.run;
  // the cold open starts in its chase: its ring is the goal all the same (M8.7 D11)
  if (sim.pursuit.state !== 'idle' && !sim.coldOpen.active) {
    out.kind = 'lose';
    if (run.bag > 0) out.hasTarget = choose.door(sim, out);
    return;
  }
  const c = BALANCE.chain;
  switch (chainStep(run.chain)) {
    case STEP.bank:
      if (run.bag > 0) {
        out.kind = 'bank';
        out.hasTarget = choose.door(sim, out);
        return;
      }
      break;
    case STEP.car: {
      const price = BALANCE.prices.compact;
      if (run.bank >= price) {
        out.kind = 'buy';
        out.hasTarget = choose.door(sim, out);
        return;
      }
      if (run.bank >= price * c.buyShare) {
        out.kind = 'buy';
        out.amount = price - run.bank;
        out.hasTarget = choose.ring(sim, '', out);
        return;
      }
      break;
    }
    case STEP.escape:
      if (choose.ring(sim, 'escape', out)) {
        out.kind = 'escape';
        out.hasTarget = true;
        return;
      }
      break;
    case STEP.order:
      if (choose.ring(sim, 'order', out)) {
        out.kind = 'order';
        out.hasTarget = true;
        return;
      }
      break;
    case STEP.big:
      if (run.bag >= c.bankGoal) {
        out.kind = 'bank';
        out.hasTarget = choose.door(sim, out);
        return;
      }
      out.kind = 'fill';
      out.amount = run.bag;
      out.hasTarget = choose.ring(sim, '', out);
      return;
    default:
      break;
  }
  if (run.bag > BALANCE.offer.doorThreshold && run.dropOffs.length > 0) {
    out.kind = 'bank';
    out.hasTarget = choose.door(sim, out);
    return;
  }
  if (chainStep(run.chain) < 0 && boardGoal(sim, out, choose)) return;
  if (choose.ring(sim, '', out)) {
    out.kind = 'take';
    out.hasTarget = true;
  }
}
