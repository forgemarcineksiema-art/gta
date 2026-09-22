/**
 * Fixed ring of sim events. HUD, audio and the renderer each poll with the
 * sequence they last consumed. No callbacks out of the sim, no allocation
 * after construction.
 */
export type EventKind =
  | 'nearMiss' | 'nearMissOncoming' | 'nearMissPed' | 'oncoming'
  | 'hit' | 'damage' | 'wrecked' | 'respawn'
  | 'takedown' | 'takedownTraffic' | 'swap' | 'billboard' | 'honk' | 'escape'
  // the run (M4): money and its endings; camera, roadblock and jump are pushed from slice 6
  | 'camera' | 'roadblock' | 'jump' | 'door' | 'banked' | 'busted' | 'coin' | 'spill'
  // jobs (M4 slice 4 skeleton): value = payout on start, paid on done; target = the def's id
  | 'jobStart' | 'jobDone' | 'jobFailed'
  // identity (slice 5): a crime seen from the police car the player drives
  | 'blown';

export interface SimEvent {
  kind: EventKind;
  value: number;
  x: number;
  y: number;
  z: number;
  tick: number;
  target: number;
  seq: number;
}

export class EventLog {
  readonly capacity = 64;
  /** Next sequence number to assign. */
  sequence = 0;
  /**
   * Stamped onto each push. The world sets this to the current sim tick
   * at the start of the step; `push` has no tick argument so the ring
   * stays allocation-free.
   */
  tick = 0;
  /** Pre-allocated ring. Length never changes after construction. */
  readonly entries: SimEvent[];
  private write = 0;
  private count = 0;

  constructor() {
    const entries: SimEvent[] = [];
    for (let i = 0; i < this.capacity; i++) {
      entries.push({ kind: 'hit', value: 0, x: 0, y: 0, z: 0, tick: 0, target: -1, seq: -1 });
    }
    this.entries = entries;
  }

  push(kind: EventKind, value: number, x: number, y: number, z: number, target = -1): void {
    const e = this.entries[this.write] as SimEvent;
    e.kind = kind;
    e.value = value;
    e.x = x;
    e.y = y;
    e.z = z;
    e.tick = this.tick;
    e.target = target;
    e.seq = this.sequence;
    this.sequence++;
    this.write++;
    if (this.write === this.capacity) this.write = 0;
    if (this.count < this.capacity) this.count++;
  }

  /**
   * Visits events with `seq >= from`, oldest first, without copying.
   * Returns the next sequence to read from.
   */
  readFrom(from: number, visit: (e: SimEvent) => void): number {
    const n = this.count;
    const cap = this.capacity;
    const start = n < cap ? 0 : this.write;
    for (let i = 0; i < n; i++) {
      const e = this.entries[(start + i) % cap] as SimEvent;
      if (e.seq >= from) visit(e);
    }
    return from > this.sequence ? from : this.sequence;
  }
}
