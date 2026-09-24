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
  // jobs (M4 slice 4 skeleton, M5): value = payout on start, paid on done; target = the def's id;
  // orderFound: the wanted car exists (target: its agent)
  | 'jobStart' | 'jobDone' | 'jobFailed' | 'orderFound'
  // the wall and the day (M5): purchase value = the price, target = the car's index or -1;
  // dailyDone value = the reward, target = the slot; streak value = the day's cash, target = the count
  | 'purchase' | 'dailyDone' | 'streak'
  // identity (slice 5): a crime seen from the police car the player drives
  | 'blown'
  // the ratchet crossed a threshold (M5.5): value = the new level; the ticker and the siren sting
  | 'heatLevel'
  // a cache found (M5.5): value = the bonus into the bank (0 but every tenth), target = found today
  | 'cache'
  // the radio (M5.5): value = DISPATCH code, target = a packed descriptor for SUSPECT; the chase's bounty: value = the pay
  | 'dispatch' | 'chase'
  // the skill chain (M5.5 slice 14): value = the pay banked into the bag, or what was lost; target = the tricks
  | 'skill' | 'skillLost'
  // the hunts (M5.5 slice 14): value = the set's reward into the bank (0 but for the last), target = 0 jumps, 1 billboards
  | 'hunt'
  // a hidden car found (M5.5 slice 16): target = its index in HIDDEN_CARS
  | 'hiddenCar'
  // a pursuit breaker brought down (M5.5 slice 18): value and target = its id
  | 'breaker'
  // the wanted board (M6): a rival ready for the player, or beaten for the first time (value = the player's new
  // place on the board); target = the rival's index in RIVALS. Seen: the next rival's car cruising by (M7 slice 13)
  | 'rivalReady' | 'rivalBeaten' | 'rivalSeen'
  // a twin swapped cars (M6 slice 3): target = the new car's body index over its paint (the radio names it)
  | 'twinSwap'
  // the player's horn (M6 slice 7): value = the cars that pulled aside, target = the kit's horn worn (-1 the class's own)
  | 'horn'
  // a standing prop knocked down (M8): value = its bill when the player knocked it (0 for anyone else), target = its id
  | 'smash'
  // the run's property damage in a district passed a mark (M8 slice 6): value = the mark, target = the district's index
  | 'damageNews';

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
