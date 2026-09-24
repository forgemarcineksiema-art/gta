/**
 * The goal line (docs/DESIGN.md §13.4, M5.5 slice 2): one line that says what
 * to do next and one point the arrow shows, always. Precedence: the running
 * job (its own line and target); the police on you (LOSE THEM, and the
 * nearest door while the bag holds something); the first undone step of the
 * first quarter hour's chain when it says more than the default; a bag above
 * the door threshold (BANK IT, the nearest door); else the nearest ring (TAKE
 * A JOB). Pure over the world's state; writes into the caller's object.
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
}

/** The chain's six steps in order, bits 0..5 of `Run.chain`, as the wall and the cards say them. */
export const CHAIN_STEPS: readonly string[] = [
  'TAKE A JOB', 'BANK THE BAG', 'BUY YOUR FIRST CAR', 'LOSE THE COPS AT ★★', 'STEAL A CAR TO ORDER', 'BANK 20,000 IN ONE RUN',
];
/** The bit of each step. */
export const STEP = { take: 0, bank: 1, car: 2, escape: 3, order: 4, big: 5 } as const;
export const CHAIN_ALL = (1 << CHAIN_STEPS.length) - 1;

export function newGoal(): Goal {
  return { kind: 'none', hasTarget: false, x: 0, z: 0, amount: 0, ring: '', rival: -1, req: -1 };
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
function boardGoal(sim: SimWorld, out: Goal): boolean {
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
  if (ring) out.hasTarget = nearestRing(sim, ring, out);
  else if (want.kind === 'bestRun') out.hasTarget = nearestRing(sim, '', out);
  return true;
}

/** The first step not done yet, or -1 when the chain is complete. */
export function chainStep(chain: number): number {
  for (let i = 0; i < CHAIN_STEPS.length; i++) if ((chain & (1 << i)) === 0) return i;
  return -1;
}

/** The nearest live ring (of a kind, or any): writes the point and its kind; false when there is none. */
function nearestRing(sim: SimWorld, kind: JobKind | '', out: Goal): boolean {
  const jobs = sim.jobs;
  const p = sim.probe;
  let best = Infinity;
  for (let i = 0; i < jobs.defs.length; i++) {
    const d = jobs.defs[i];
    if (!d || !jobs.live(d) || (kind !== '' && d.kind !== kind)) continue;
    const dist = (d.x - p.x) ** 2 + (d.z - p.z) ** 2;
    if (dist >= best) continue;
    best = dist;
    out.x = d.x;
    out.z = d.z;
    out.ring = d.kind;
  }
  return best < Infinity;
}

/** The nearest drop-off's door; false on a map without one. */
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
  }
  out.ring = '';
  return best < Infinity;
}

export function goalFor(sim: SimWorld, out: Goal): void {
  out.kind = 'none';
  out.hasTarget = false;
  out.amount = 0;
  out.ring = '';
  out.rival = -1;
  out.req = -1;
  const jobs = sim.jobs;
  if (jobs.running) {
    out.kind = 'job';
    out.hasTarget = jobs.target(out);
    return;
  }
  const run = sim.run;
  if (sim.pursuit.state !== 'idle') {
    out.kind = 'lose';
    if (run.bag > 0) out.hasTarget = nearestDoor(sim, out);
    return;
  }
  const c = BALANCE.chain;
  switch (chainStep(run.chain)) {
    case STEP.bank:
      if (run.bag > 0) {
        out.kind = 'bank';
        out.hasTarget = nearestDoor(sim, out);
        return;
      }
      break;
    case STEP.car: {
      const price = BALANCE.prices.compact;
      if (run.bank >= price) {
        out.kind = 'buy';
        out.hasTarget = nearestDoor(sim, out);
        return;
      }
      if (run.bank >= price * c.buyShare) {
        out.kind = 'buy';
        out.amount = price - run.bank;
        out.hasTarget = nearestRing(sim, '', out);
        return;
      }
      break;
    }
    case STEP.escape:
      if (nearestRing(sim, 'escape', out)) {
        out.kind = 'escape';
        out.hasTarget = true;
        return;
      }
      break;
    case STEP.order:
      if (nearestRing(sim, 'order', out)) {
        out.kind = 'order';
        out.hasTarget = true;
        return;
      }
      break;
    case STEP.big:
      if (run.bag >= c.bankGoal) {
        out.kind = 'bank';
        out.hasTarget = nearestDoor(sim, out);
        return;
      }
      out.kind = 'fill';
      out.amount = run.bag;
      out.hasTarget = nearestRing(sim, '', out);
      return;
    default:
      break;
  }
  if (run.bag > BALANCE.offer.doorThreshold && run.dropOffs.length > 0) {
    out.kind = 'bank';
    out.hasTarget = nearestDoor(sim, out);
    return;
  }
  if (chainStep(run.chain) < 0 && boardGoal(sim, out)) return;
  if (nearestRing(sim, '', out)) {
    out.kind = 'take';
    out.hasTarget = true;
  }
}
