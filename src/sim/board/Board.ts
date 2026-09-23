/**
 * The wanted board (M6 slice 1, docs/DESIGN.md §14.2): ten rivals and the
 * Chief, beaten one at a time in their order. The next rival's ring is live
 * once their two requirements are met, a beaten rival's stays for a rematch;
 * a first win owns their car (the item comes with the driver's kit, slice 6)
 * and moves the player's poster up. Pure over the world's counters apart from
 * the beaten bits the save carries. No allocation per step.
 */
import { BALANCE } from '../balance';
import type { JobDef } from '../jobs/catalog';
import type { SimWorld } from '../SimWorld';
import { AgentState, type PlayerProbe } from '../traffic/Traffic';
import { BODY_INDEX } from '../traffic/bodies';
import { CHIEF, RIVALS, type Req, type RivalDef } from './rivals';

export class Board {
  /** The rivals beaten, a bit each by `RIVALS` index (bit 10 the Chief). */
  beaten = 0;
  /** `?board=`: the next rival's requirements count as met (tests and playtests). */
  force = false;
  /** Bumps on a win (the wall, the posters). */
  serial = 0;
  /** The rival already announced as ready, so the ticker says it once; -2 before the first step. */
  private announced = -2;
  /** Each rival's duel def (their bay), found on the first step. */
  private readonly ring: Array<JobDef | null> = [];
  /** Each rival's parked car's traffic record while it waits at the bay, -1 otherwise. */
  readonly car = new Int16Array(CHIEF + 1).fill(-1);

  constructor(private readonly sim: SimWorld) {}

  isBeaten(i: number): boolean {
    return (this.beaten & (1 << i)) !== 0;
  }

  /** The rivals of the ten beaten. */
  get beatenCount(): number {
    let n = 0;
    for (let i = 0; i < CHIEF; i++) if (this.isBeaten(i)) n++;
    return n;
  }

  /** The player's place on the board: 11 off it, 10 after the first rival, 1 at the top. */
  get rank(): number {
    return 11 - this.beatenCount;
  }

  /** The next rival to beat, `CHIEF` after the ten, -1 when the Chief is beaten too. */
  next(): number {
    for (let i = 0; i <= CHIEF; i++) if (!this.isBeaten(i)) return i;
    return -1;
  }

  /** How far the player is toward a requirement. */
  have(r: Req): number {
    const sim = this.sim, c = sim.career;
    switch (r.kind) {
      case 'chain': {
        let n = 0;
        for (let b = sim.run.chain; b !== 0; b &= b - 1) n++;
        return n;
      }
      case 'raceWins': return c.races;
      case 'medal': {
        let n = 0;
        const defs = sim.jobs.defs;
        for (let k = 0; k < defs.length; k++) {
          const d = defs[k];
          if (d && d.kind === 'trial' && (sim.jobs.medals.get(d.id) ?? 0) >= r.level) n++;
        }
        return n;
      }
      case 'escape': return c.escapesFrom(r.level);
      case 'takedowns': return c.takedowns;
      case 'zoneWins': return c.zones;
      case 'fares': return c.fares;
      case 'orders': return c.orders;
      case 'carsOwned': return sim.garage.owned.size;
      case 'jumps': return sim.jumps?.foundCount ?? 0;
      case 'bestRun': return sim.run.bestRun;
      case 'billboards': return sim.collectibles?.smashedCount ?? 0;
      case 'hotFares': return c.hotFares;
      case 'caches': return c.caches;
      case 'board': return this.beatenCount;
    }
  }

  met(r: Req): boolean {
    return this.have(r) >= r.count;
  }

  /** The first requirement of rival `i` not met, -1 when all are. */
  firstOpen(i: number): number {
    const reqs = (RIVALS[i] as RivalDef).reqs;
    for (let k = 0; k < reqs.length; k++) if (!this.met(reqs[k] as Req)) return k;
    return -1;
  }

  /** Rival `i`'s requirements are met (or forced, for the next one). */
  ready(i: number): boolean {
    if (i < 0 || i > CHIEF) return false;
    if (this.force && i === this.next()) return true;
    return this.firstOpen(i) < 0;
  }

  /** A duel's ring is live: the next rival's once ready, a beaten rival's for a rematch. */
  live(i: number): boolean {
    return this.isBeaten(i) || (i === this.next() && this.ready(i));
  }

  /** The purse a duel pays now: the whole on the first win, a share on a rematch. */
  purse(i: number): number {
    const p = (RIVALS[i] as RivalDef).purse;
    return this.isBeaten(i) ? Math.round(p * BALANCE.board.rematchShare) : p;
  }

  /**
   * The ticker's news: the next rival turning ready is announced once (not at boot), and the rings redrawn. Each
   * live rival's car waits parked at its bay while the player is near and no duel of theirs runs.
   */
  step(probe: PlayerProbe): void {
    if (this.ring.length === 0) this.findRings();
    const n = this.next();
    const ready = n >= 0 && this.ready(n) ? n : -1;
    if (ready !== this.announced) {
      if (ready >= 0 && this.announced !== -2) this.sim.events.push('rivalReady', 0, 0, 0, 0, ready);
      this.announced = ready;
      this.sim.jobs.serial++;
    }
    this.park(probe);
  }

  /** A rival's parked car leaves its bay: the duel starts and the rival pulls out as a racer. */
  unpark(i: number): void {
    const a = this.car[i] as number;
    if (a >= 0) this.sim.traffic?.remove(a);
    this.car[i] = -1;
  }

  private findRings(): void {
    const traffic = this.sim.traffic;
    for (let i = 0; i <= CHIEF; i++) {
      const d = this.sim.jobs.defs.find((k) => k.kind === 'duel' && k.level === i) ?? null;
      this.ring.push(d);
      if (d) traffic?.reserveBayAt(d.x, d.z);
    }
  }

  private park(probe: PlayerProbe): void {
    const traffic = this.sim.traffic;
    if (!traffic) return;
    const running = this.sim.jobs.running;
    const range = BALANCE.board.carRange;
    for (let i = 0; i <= CHIEF; i++) {
      const d = this.ring[i];
      if (!d) continue;
      const r = RIVALS[i] as RivalDef;
      const a = this.car[i] as number;
      // the record went (the traffic's despawn) or is another car now
      if (a >= 0 && (traffic.state[a] === AgentState.Free || traffic.body[a] !== BODY_INDEX[r.body] || traffic.rival[a] !== 1)) this.car[i] = -1;
      const wanted = this.live(i) && running?.id !== d.id && (d.x - probe.x) ** 2 + (d.z - probe.z) ** 2 <= range * range;
      if (!wanted || (this.car[i] as number) >= 0) continue;
      const agent = traffic.spawnAtPoint(d.x, d.z, d.yaw, r.body, AgentState.Parked, r.paints[0]);
      if (agent < 0) continue;
      traffic.rival[agent] = 1;
      this.car[i] = agent;
    }
  }

  /** A first win: the bit, the rival's car in the garage, the news. A rematch changes nothing here. */
  win(i: number): void {
    if (this.isBeaten(i)) return;
    this.beaten |= 1 << i;
    this.serial++;
    this.sim.jobs.serial++;
    this.ownCar(i);
    this.force = false;
    this.sim.events.push('rivalBeaten', this.rank, 0, 0, 0, i);
  }

  /** The rival's car, owned in their paint (a respray kept); the save's apply calls it for every rival beaten. */
  ownCar(i: number): void {
    const r = RIVALS[i] as RivalDef;
    if (!this.sim.garage.owned.has(r.body)) this.sim.garage.own(r.body, r.paints[0]);
  }
}
