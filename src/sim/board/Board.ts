/**
 * The wanted board (M6 slice 1, docs/DESIGN.md §14.2): ten rivals and the
 * Chief, beaten one at a time in their order. The next rival's ring is live
 * once their two requirements are met, a beaten rival's stays for a rematch;
 * a first win owns their car (the item comes with the driver's kit, slice 6)
 * and moves the player's poster up. Pure over the world's counters apart from
 * the beaten bits the save carries. Until the next rival is ready, their car
 * cruises their district in the traffic (M7 slice 13, the teaser). No
 * allocation per step.
 */
import { BALANCE } from '../balance';
import type { JobDef } from '../jobs/catalog';
import type { SimWorld } from '../SimWorld';
import { AgentState, type PlayerProbe } from '../traffic/Traffic';
import { BODY_INDEX } from '../traffic/bodies';
import { CHIEF, RIVALS, type Req, type RivalDef } from './rivals';

/** A turf's junction keeps its district this far round it (m): one on a street bounding the district is not the turf's. */
const TURF_EDGE = 15;
const TURF_PROBE: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];

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
  /** The next rival's car cruising their turf while they are not ready (M7 slice 13), -1 when none. */
  teaser = -1;
  /** `SimWorldOptions.teasers`: off in the headless test worlds, whose bot pins' traffic predates the teaser. */
  teasers = true;
  /** Seconds to the next try at placing the teaser; whether the ticker has named it. */
  private teaseWait = 0;
  private teaserSeen = false;
  /** Per lane: 1 when both its ends are junctions inside the district (index by the `DISTRICTS` order), built once. */
  private turfLanes: Map<string, Uint8Array> | null = null;

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
      case 'smashed': return c.smashed;
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
  step(probe: PlayerProbe, dt: number): void {
    if (this.ring.length === 0) this.findRings();
    const n = this.next();
    const ready = n >= 0 && this.ready(n) ? n : -1;
    if (ready !== this.announced) {
      if (ready >= 0 && this.announced !== -2) this.sim.events.push('rivalReady', 0, 0, 0, 0, ready);
      this.announced = ready;
      this.sim.jobs.serial++;
    }
    this.park(probe);
    this.tease(probe, n, dt);
  }

  /**
   * The teaser (M7 slice 13, DESIGN.md §15): while the next rival is not ready and no job runs, their car drives the
   * lanes of their district in the traffic, placed out of the player's sight and kept to the district at every
   * junction; the ticker names them the first time the player sees them near. Gone once they are ready (they park
   * at their bay for the duel), out of the player's sight.
   */
  private tease(probe: PlayerProbe, n: number, dt: number): void {
    const traffic = this.sim.traffic;
    if (!traffic) return;
    const r = n >= 0 ? RIVALS[n] : undefined;
    let a = this.teaser;
    // the record went (the traffic's despawn, a wreck's clean-up) or is another car now
    if (a >= 0 && (traffic.state[a] === AgentState.Free || traffic.rival[a] !== 1 || !r || traffic.body[a] !== BODY_INDEX[r.body])) {
      this.teaser = -1;
      a = -1;
    }
    const police = this.sim.police;
    const near = police?.tuning.viewNear ?? 60, cosHalf = Math.cos((police?.tuning.viewHalfAngleDeg ?? 55) * Math.PI / 180);
    const wanted = this.teasers && r !== undefined && r.turf !== 'highway' && !this.ready(n) && this.sim.jobs.running === null;
    if (!wanted) {
      if (a < 0) return;
      // they park for the duel: the car goes when the player cannot see it go
      const x = traffic.x[a] as number, z = traffic.z[a] as number;
      if (traffic.outOfView(x, z, 3, probe, near, cosHalf)) { traffic.remove(a); this.teaser = -1; }
      return;
    }
    const turf = this.turf(r.turf);
    if (!turf) return;
    if (a >= 0) {
      this.keepToTurf(a, turf);
      if (!this.teaserSeen) {
        const x = traffic.x[a] as number, z = traffic.z[a] as number, seen = BALANCE.board.teaser.seen;
        if ((x - probe.x) ** 2 + (z - probe.z) ** 2 <= seen * seen && !traffic.outOfView(x, z, 3, probe, 0, cosHalf)) {
          this.teaserSeen = true;
          this.sim.events.push('rivalSeen', 0, x, 0, z, n);
        }
      }
      return;
    }
    this.teaseWait -= dt;
    if (this.teaseWait > 0) return;
    this.teaseWait = BALANCE.board.teaser.retry;
    // a lane of the turf in the band round the player, behind them: the nearest to the band's middle
    const lanes = traffic.lanes, [lo, hi] = BALANCE.board.teaser.range, mid = (lo + hi) / 2;
    const fx = Math.sin(probe.yaw), fz = Math.cos(probe.yaw);
    let best = -1, bestD = Infinity;
    for (let l = 0; l < lanes.laneCount; l++) {
      if (turf[l] !== 1) continue;
      const dx = (lanes.midX[l] as number) - probe.x, dz = (lanes.midZ[l] as number) - probe.z;
      const d = Math.hypot(dx, dz);
      if (d < lo || d > hi || dx * fx + dz * fz > 0) continue;
      if (Math.abs(d - mid) < bestD) { bestD = Math.abs(d - mid); best = l; }
    }
    if (best < 0) return;
    const agent = traffic.spawnTeaser(best, (lanes.length[best] as number) / 2, r.body, r.paints[0] as number, probe, near, cosHalf);
    if (agent < 0) return;
    this.teaser = agent;
    this.teaserSeen = false;
    this.keepToTurf(agent, turf);
  }

  /** The teaser's next exit: one into its district, never a U-turn when there is another (the order turned by its lane). */
  private keepToTurf(a: number, turf: Uint8Array): void {
    const traffic = this.sim.traffic;
    if (!traffic) return;
    const lane = traffic.lane[a] as number;
    if (lane < 0) return;
    const outs = traffic.lanes.outs(lane), uturn = traffic.lanes.uturn(lane);
    let pick = -1;
    for (let k = 0; k < outs.length && pick < 0; k++) {
      const id = outs[(k + lane) % outs.length] as number;
      if (id !== uturn && turf[id] === 1) pick = id;
    }
    if (pick < 0 && uturn >= 0 && turf[uturn] === 1) pick = uturn;
    if (pick >= 0) traffic.route(a, pick);
  }

  /**
   * The lanes of a district whose both ends are its own junctions (none on the streets that bound it: a junction whose
   * district differs `TURF_EDGE` m off it, as the grid's on its axes; the grid's streets or the island's, M8.10 slice 14).
   */
  private turf(id: string): Uint8Array | null {
    const streets = this.sim.traffic?.streets;
    if (!streets) return null;
    this.turfLanes ??= new Map();
    let lanes = this.turfLanes.get(id);
    if (!lanes) {
      const graph = streets.graph;
      const inside = (node: number): boolean => {
        const nd = graph.nodes[node];
        if (!nd) return false;
        for (const [dx, dz] of TURF_PROBE) if (streets.district(nd.x + dx * TURF_EDGE, nd.z + dz * TURF_EDGE) !== id) return false;
        return true;
      };
      lanes = new Uint8Array(graph.lanes.length);
      for (let l = 0; l < graph.lanes.length; l++) {
        const lane = graph.lanes[l];
        if (lane && inside(lane.from) && inside(lane.to)) lanes[l] = 1;
      }
      this.turfLanes.set(id, lanes);
    }
    return lanes;
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
      const agent = traffic.spawnProp(d.x, d.z, d.yaw, r.body, AgentState.Parked, r.paints[0] as number);
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
