/**
 * Jobs (docs/M5_PLAN.md §3.3, slices 1–3; the M4 skeleton extended, nothing
 * renamed). A marker is a ring on the ground; rolling into it under
 * `startSpeed` starts its job (M8.7 D8: driven through faster, nothing but a
 * `ringPass` while it teaches). One job at a time: markers do nothing while
 * one runs (D6), nor while the police are on the player (M8.7 D9), and the
 * door and busted abandon it silently.
 *
 * - delivery: the clock starts at once, the job's heat is added once;
 *   arriving within the ring radius of the drop-off pays
 *   `payout × (1 + timeBonus × remaining / limit)`; the clock running out
 *   fails it.
 * - order (steal-to-order): hunting first. The traffic guarantees a car of
 *   the wanted class and paint 300–600 m away (`Traffic.ensure`), re-checked
 *   every `ensureSeconds` while there is none or it was wrecked or taken; the
 *   swap into it (`onSwap`) starts the clock and adds the heat; arriving at
 *   the fence in that class pays the class's payout less 10 % per damage
 *   stage. A wreck (stage 4) cannot arrive; the clock fails it.
 * - escape: the heat rises to the level's threshold and the police have the
 *   player at once; the `escape` event pays `bounty × level`. No clock.
 * - trial (M5.5 slice 10): the clock starts at once, no heat, the coins lay the
 *   line to a finish across the road; crossing it pays by the medal the time
 *   wins (gold, silver, bronze), the best medal per trial is kept; slower than
 *   bronze fails it.
 * - race (M5.5 slice 11): three rivals start just ahead, everybody to one finish
 *   by any route (no coins); the player's place over the line pays (1st, 2nd,
 *   3rd), fourth fails it, and so does the clock.
 * - rage, mayhem (M5.5 slice 12): one timed zone round the marker; inside it the
 *   takedowns (rage) or the property damage's price (mayhem) count toward the
 *   quota; reaching it pays with the delivery's time bonus; the clock fails it.
 * - fare (M5.5 slice 13): no marker; `Fares` adds one when a hailer hops into the
 *   taxi and starts it; arriving pays the fare and its tips; its def goes when
 *   it is over.
 *
 * Money goes into the bag through the `jobDone` event (`Run` reads it). While
 * the cold open runs only its own marker is live. No allocation per step.
 */
import { BALANCE } from '../balance';
import { RIVALS, type RivalDef } from '../board/rivals';
import type { SimEvent } from '../events';
import type { SimWorld } from '../SimWorld';
import { routeLine, type CoinPoint } from '../city/coins';
import { alongLane, laneChain } from '../city/route';
import type { Lane } from '../city/roads';
import { AgentState, type PlayerProbe } from '../traffic/Traffic';
import type { BodyId } from '../traffic/bodies';
import { CAR_IDS } from '../vehicle/presets';
import { trialMedal, type JobDef } from './catalog';
import { Race } from './Race';
import { markerRingCoins, pointTarget } from './place';

export type { JobDef, JobKind } from './catalog';

export type JobState = 'idle' | 'hunting' | 'active' | 'done' | 'failed';

export class Jobs {
  readonly defs: JobDef[];
  state: JobState = 'idle';
  /** The running (or just finished) def's id, or -1. */
  active = -1;
  /** Seconds left on the clock; NaN while hunting and for an escape (no clock). */
  remaining = 0;
  /** An order's car to take while hunting; -1 otherwise. */
  wantedAgent = -1;
  /** Bumps whenever the defs or the state change, so the views can rebuild. */
  serial = 0;
  /** Seconds since the running job started (the card shows for the first `cardSeconds`). */
  elapsed = 0;
  /** The last job's pay into the bag (the HUD's result line), and whether every coin of its route was taken (the tip). */
  lastPaid = 0;
  lastTip = false;
  /** The last trial's medal (3 gold .. 1 bronze), and the best per trial def id (saved). */
  lastMedal = 0;
  readonly medals = new Map<number, number>();
  /** The running street race's rivals (M5.5 slice 11), and the player's place in the last one. */
  readonly race: Race;
  lastPlace = 0;
  /** The last duel won was a rematch (M6): the line says so, no car. */
  lastRematch = false;
  /** A zone job's count toward its quota (takedowns, or dollars of damage), and whether the car is inside the zone. */
  zoneCount = 0;
  inZone = false;
  /** Ensures run so far for this hunt that repainted a car, and that spawned one (the slice-2 measurement). */
  repaints = 0;
  spawns = 0;
  private hold = 0;
  private nextId = 0;
  private ensureLeft = 0;
  private found = false;
  /** A marker the car was inside when its job ended: it re-arms once the car has left its ring. */
  private rearm = -1;
  /** The ring being driven through too fast (M8.7 D8), until the car leaves it; the passes taught this session. */
  private passing = -1;
  private taught = 0;
  private cursor: number;
  /** An `escape` event was read this step. */
  private escaped = false;
  /** The markers' coin rings are laid on the first step (once; the world's constructor leaves the extra coins to its callers). */
  private ringsLaid = false;
  private readonly routePoints: CoinPoint[] = [];

  constructor(private readonly sim: SimWorld, defs: JobDef[]) {
    this.defs = defs;
    this.race = new Race(sim);
    for (const d of defs) this.nextId = Math.max(this.nextId, d.id + 1);
    this.cursor = sim.events.sequence;
  }

  /** A def added at run time (the cold open's takes id 0 when it is free); returns its id. */
  add(def: Omit<JobDef, 'id' | 'level' | 'descriptor'> & Partial<Pick<JobDef, 'level' | 'descriptor'>>, id = -1): number {
    const use = id >= 0 && !this.defOf(id) ? id : this.nextId++;
    this.defs.push({ level: 0, descriptor: -1, ...def, id: use });
    this.serial++;
    return use;
  }

  /** Removes a def; abandons it first when it is the running one. */
  remove(id: number): void {
    if (this.active === id) this.abandon();
    const i = this.defs.findIndex((d) => d.id === id);
    if (i < 0) return;
    this.defs.splice(i, 1);
    this.serial++;
  }

  defOf(id: number): JobDef | null {
    for (let i = 0; i < this.defs.length; i++) if ((this.defs[i] as JobDef).id === id) return this.defs[i] as JobDef;
    return null;
  }

  /** The running def (hunting or active), or null. */
  get running(): JobDef | null {
    return this.state === 'hunting' || this.state === 'active' ? this.defOf(this.active) : null;
  }

  /** A marker that is there: during the cold open only its own; a rival's ring while the board says so (M6). */
  shown(d: JobDef): boolean {
    const co = this.sim.coldOpen;
    if (co.active) return d.id === co.job;
    return d.id !== co.job && (d.kind !== 'duel' || this.sim.board.live(d.level));
  }

  /** A marker the player can start now (M8.7 D9): shown, and not while the police are on the player; the cold open's own in its chase too. */
  open(d: JobDef): boolean {
    return this.shown(d) && (this.sim.pursuit.state === 'idle' || this.sim.coldOpen.active);
  }

  step(probe: PlayerProbe, dt: number): void {
    if (!this.ringsLaid) {
      this.ringsLaid = true;
      // a ring of coins round every placed marker (DESIGN.md §3.2); not the cold open's, whose line leads there, nor
      // a rival's, which is there only while the board says so (M6)
      this.sim.coins?.addExtra(markerRingCoins(this.defs.filter((d) => d.id !== 0 && d.kind !== 'duel')));
    }
    this.escaped = false;
    this.cursor = this.sim.events.readFrom(this.cursor, this.onEvent);
    const r = BALANCE.jobs.markerRadius;
    if (this.rearm >= 0) {
      const d = this.defOf(this.rearm);
      if (!d || (d.x - probe.x) ** 2 + (d.z - probe.z) ** 2 > r * r) this.rearm = -1;
    }
    if (this.passing >= 0) {
      const d = this.defOf(this.passing);
      if (!d || (d.x - probe.x) ** 2 + (d.z - probe.z) ** 2 > r * r) this.passing = -1;
    }
    if (this.state === 'done' || this.state === 'failed') {
      this.hold -= dt;
      if (this.hold > 0) return;
      // a fare's def was only for its ride
      const over = this.defOf(this.active);
      this.state = 'idle';
      this.active = -1;
      if (over?.kind === 'fare') this.remove(over.id);
      this.serial++;
    }
    if (this.state === 'idle') {
      for (let i = 0; i < this.defs.length; i++) {
        const d = this.defs[i] as JobDef;
        // a rival waits at the kerb (M6): pull up beside them, slowly, inside the wider ring; driving past does nothing
        const duel = d.kind === 'duel';
        const rr = duel ? BALANCE.board.ringRadius : r;
        if (d.id === this.rearm || (d.x - probe.x) ** 2 + (d.z - probe.z) ** 2 > rr * rr) continue;
        if (!this.open(d)) continue;
        if (probe.speed > (duel ? BALANCE.board.pullUp : BALANCE.jobs.startSpeed)) {
          // driven through (M8.7 D8): nothing starts; the first ring while the chain's first step is open, and the
          // session's first few passes, teach the rule
          if (!duel && d.id !== this.passing) {
            this.passing = d.id;
            if ((this.sim.run.chain & 1) === 0 || this.taught < BALANCE.jobs.teachPasses) {
              this.taught++;
              this.sim.events.push('ringPass', 0, d.x, 0, d.z, d.id);
            }
          }
          continue;
        }
        this.start(d);
        return;
      }
      return;
    }
    const d = this.defOf(this.active);
    if (!d) {
      this.abandon();
      return;
    }
    this.elapsed += dt;
    if (this.state === 'hunting') {
      this.hunt(d, probe, dt);
      return;
    }
    if (d.kind === 'duel') {
      this.duelStep(d, probe, dt);
      return;
    }
    if (d.kind === 'race') this.race.step(probe);
    if (d.kind === 'rage' || d.kind === 'mayhem') {
      this.inZone = (d.x - probe.x) ** 2 + (d.z - probe.z) ** 2 <= BALANCE.jobs.zone.radius ** 2;
      if (this.zoneCount >= d.level) {
        // the quota reached: the pay with the time bonus
        const paid = Math.round(d.payout * (1 + BALANCE.jobs.timeBonus * Math.max(0, this.remaining) / d.limitSeconds));
        this.lastPaid = paid;
        this.lastTip = false;
        this.finish('done', probe);
        this.sim.events.push('jobDone', paid, probe.x, 0, probe.z, d.id);
        return;
      }
      this.remaining -= dt;
      if (this.remaining > 1e-9) return;
      this.remaining = 0;
      this.finish('failed', probe);
      this.sim.events.push('jobFailed', 0, probe.x, 0, probe.z, d.id);
      return;
    }
    if (d.kind === 'escape') {
      // the chase was lost (by the cooldown or a swap nobody saw): the bounty
      if (!this.escaped) return;
      this.lastPaid = d.payout;
      this.finish('done', probe);
      this.sim.events.push('jobDone', d.payout, probe.x, 0, probe.z, d.id);
      return;
    }
    const reach = d.kind === 'trial' ? BALANCE.jobs.trial.finishRadius : d.kind === 'race' ? BALANCE.jobs.race.finishRadius : r;
    if ((d.targetX - probe.x) ** 2 + (d.targetZ - probe.z) ** 2 <= reach * reach && this.canArrive(d)) {
      let paid: number;
      if (d.kind === 'fare') {
        // the ride and its tips; the leftover time carries into the next fare
        const fares = this.sim.fares;
        this.lastPaid = d.payout + fares.tips;
        this.lastTip = false;
        fares.delivered(this.remaining);
        this.finish('done', probe);
        this.sim.events.push('jobDone', this.lastPaid, d.targetX, 0, d.targetZ, d.id);
        return;
      }
      if (d.kind === 'race') {
        // over the line: the place the rivals already home leave, and its pay; fourth pays nothing
        const place = this.race.finished + 1;
        this.lastPlace = place;
        paid = BALANCE.jobs.race.pay[place - 1] ?? 0;
        if (paid <= 0) {
          this.finish('failed', probe);
          this.sim.events.push('jobFailed', 0, probe.x, 0, probe.z, d.id);
          return;
        }
      } else if (d.kind === 'trial') {
        // the medal the time wins, and the best one kept
        const medal = Math.max(1, trialMedal(d.limitSeconds, d.limitSeconds - Math.max(0, this.remaining)));
        this.lastMedal = medal;
        this.medals.set(d.id, Math.max(this.medals.get(d.id) ?? 0, medal));
        paid = BALANCE.jobs.trial.pay[medal - 1] as number;
      } else {
        paid = d.kind === 'order'
          ? Math.round(d.payout * Math.max(0, 1 - BALANCE.jobs.order.stagePenalty * this.sim.life.state.stage))
          : Math.round(d.payout * (1 + BALANCE.jobs.timeBonus * Math.max(0, this.remaining) / d.limitSeconds));
      }
      // arriving takes the cap on the target; every coin of the route taken is the clean line, and pays the tip
      const coins = this.sim.coins;
      if (coins && coins.routeTotal > 0) {
        coins.take(coins.extraId('route', coins.routeTotal - 1), this.sim.events);
        this.lastTip = coins.routePicked >= coins.routeTotal;
        if (this.lastTip) paid += Math.round(d.payout * BALANCE.coin.route.tip);
      } else {
        this.lastTip = false;
      }
      this.lastPaid = paid;
      this.finish('done', probe);
      this.sim.events.push('jobDone', paid, d.targetX, 0, d.targetZ, d.id);
      return;
    }
    this.remaining -= dt;
    // Fixed 60 Hz subtraction must finish on the limit's last step, not one after from rounding.
    if (this.remaining > 1e-9) return;
    this.remaining = 0;
    if (d.kind === 'fare') this.sim.fares.broken();
    this.finish('failed', probe);
    this.sim.events.push('jobFailed', 0, probe.x, 0, probe.z, d.id);
  }

  /** A fare's ride starts at once (Fares added its def): the clock, no heat, no coins. */
  startFare(id: number): void {
    const d = this.defOf(id);
    if (!d || this.state === 'hunting' || this.state === 'active') return;
    this.active = id;
    this.elapsed = 0;
    this.state = 'active';
    this.remaining = d.limitSeconds;
    this.serial++;
    this.sim.events.push('jobStart', d.payout, d.x, 0, d.z, d.id);
  }

  /** The running job's target: the drop-off or fence, the wanted car while it exists; false for none (idle, an escape). */
  target(out: { x: number; z: number }): boolean {
    const d = this.running;
    if (!d) return false;
    if (this.state === 'hunting') {
      const traffic = this.sim.traffic;
      if (!traffic || this.wantedAgent < 0) return false;
      out.x = traffic.x[this.wantedAgent] as number;
      out.z = traffic.z[this.wantedAgent] as number;
      return true;
    }
    if (d.kind === 'escape' || (d.kind === 'duel' && RIVALS[d.level]?.format === 'chief')) return false;
    if (d.kind === 'duel' && RIVALS[d.level]?.format === 'hunt') {
      // a hunt's target is the rival's car
      const traffic = this.sim.traffic, a = this.race.rivals[0] as number;
      if (!traffic || a < 0 || traffic.state[a] === AgentState.Free) return false;
      out.x = traffic.x[a] as number;
      out.z = traffic.z[a] as number;
      return true;
    }
    out.x = d.targetX;
    out.z = d.targetZ;
    return true;
  }

  /** The door and busted: back to idle with no event. */
  abandon(): void {
    if (this.state === 'idle') return;
    this.release();
    this.race.stop();
    const over = this.defOf(this.active);
    if (over?.kind === 'fare') {
      this.sim.fares.broken();
      const i = this.defs.indexOf(over);
      if (i >= 0) this.defs.splice(i, 1);
    }
    this.sim.coins?.clearExtra('route');
    this.state = 'idle';
    this.active = -1;
    this.remaining = 0;
    this.hold = 0;
    this.wantedAgent = -1;
    this.serial++;
  }

  /** Life's swap, before the record changes hands: taking the wanted car starts the order's clock. */
  onSwap(agent: number): void {
    if (this.state !== 'hunting' || agent !== this.wantedAgent || agent < 0) return;
    const d = this.defOf(this.active);
    if (!d) return;
    this.state = 'active';
    this.remaining = d.limitSeconds;
    this.wantedAgent = -1;
    if (this.sim.traffic) this.sim.traffic.wanted = -1;
    this.sim.heat.add(d.heat);
    // the car is taken: the coins from here to the fence
    this.layRoute(this.sim.probe.x, this.sim.probe.z, d.targetX, d.targetZ);
    this.serial++;
  }

  private start(d: JobDef): void {
    this.active = d.id;
    this.elapsed = 0;
    this.serial++;
    this.sim.events.push('jobStart', d.payout, d.x, 0, d.z, d.id);
    if (d.kind === 'order') {
      this.state = 'hunting';
      this.remaining = NaN;
      this.wantedAgent = -1;
      this.ensureLeft = 0;
      this.found = false;
      this.repaints = 0;
      this.spawns = 0;
      return;
    }
    this.state = 'active';
    if (d.kind === 'duel') {
      this.startDuel(d);
      return;
    }
    if (d.kind === 'escape') {
      // straight into a chase at the level: the heat to its threshold (the ratchet never lowers), the police on the player now
      this.remaining = NaN;
      const threshold = BALANCE.heatThresholds[d.level - 1] ?? 0;
      this.sim.heat.add(Math.max(0, threshold - this.sim.heat.points));
      this.sim.pursuit.force(BALANCE.jobs.escape.radioSeconds);
      return;
    }
    this.remaining = d.limitSeconds;
    this.sim.heat.add(d.heat);
    if (d.kind === 'race') {
      // any route: no coin line, the rivals on the grid ahead
      this.lastPlace = 0;
      this.race.start(d.targetX, d.targetZ, this.sim.probe);
      return;
    }
    if (d.kind === 'rage' || d.kind === 'mayhem') {
      // the zone round the marker: nothing laid, the count from nothing
      this.zoneCount = 0;
      this.inZone = true;
      return;
    }
    // the coins along the way (DESIGN.md §13.5); the cold open lays its own line
    if (d.id !== this.sim.coldOpen.job) this.layRoute(d.x, d.z, d.targetX, d.targetZ);
  }

  /**
   * A wanted board's duel (M6, DESIGN.md §14.3): the heat to the rival's level (the ratchet never lowers), then
   * their race to the finish with the pace and band of their place on the board; the Chief's is an escape at five
   * stars with no clock. A hunt races until slice 2 gives it its own rule.
   */
  private startDuel(d: JobDef): void {
    const rival = RIVALS[d.level] as RivalDef;
    this.lastPlace = 0;
    // the rival's parked car pulls out: the racer takes its place on the road
    this.sim.board.unpark(d.level);
    const threshold = rival.heat > 0 ? (BALANCE.heatThresholds[rival.heat - 1] ?? 0) : 0;
    this.sim.heat.add(Math.max(0, threshold - this.sim.heat.points));
    if (rival.format === 'chief') {
      // his is an escape at five stars with him on the roster from the first second
      this.remaining = NaN;
      this.sim.pursuit.force(BALANCE.jobs.escape.radioSeconds);
      this.sim.police?.summonChief();
      return;
    }
    const b = BALANCE.board, h = b.hunt;
    const cars: Array<readonly [BodyId, number]> = rival.paints.map((paint) => [rival.body, paint] as const);
    const pace = b.pace[d.level] ?? 1, band = b.band[d.level] ?? [0.8, 1.2];
    const tw = rival.twist;
    const twists = { twins: tw === 'twins', breakers: tw === 'breakers', hidden: tw === 'ghost' };
    if (rival.format === 'hunt') {
      // the rival drives home with a bag: wreck their car first
      this.remaining = h.seconds;
      const armour = (h.armour[d.level] ?? 2) * (tw === 'heavy' ? h.heavy : 1);
      this.race.start(d.targetX, d.targetZ, this.sim.probe, { cars, pace: pace * h.pace, band, lead: h.lead, armour, ...twists });
    } else {
      this.remaining = d.limitSeconds;
      this.race.start(d.targetX, d.targetZ, this.sim.probe, { cars, pace, band, ...twists });
    }
    this.twist(tw);
  }

  /**
   * The twists that are not the race's own (M6 slice 3, DESIGN.md §14.3): Pete drives like the bad driver; Frank
   * wears a badge (units leave him alone, a hit on him is a hit on a unit); the Nephew's escort comes after the
   * player at once; the helicopter hangs over the player from the first second of Pip's race.
   */
  private twist(tw: RivalDef['twist']): void {
    const sim = this.sim, traffic = sim.traffic, a = this.race.rivals[0] as number;
    if (!traffic || a < 0) return;
    if (tw === 'bad') traffic.bad[a] = 1;
    else if (tw === 'disguise') traffic.badge[a] = 1;
    else if (tw === 'escort' && sim.police) {
      sim.pursuit.force(BALANCE.jobs.escape.radioSeconds);
      const city = sim.city, p = sim.probe;
      if (!city) return;
      const lane = city.nearestLane(p.x, p.z, p.y - 0.5);
      const s = alongLane(city.graph.lanes[lane] as Lane, p.x, p.z).s;
      sim.police.escort(lane, s, BALANCE.board.escort);
    } else if (tw === 'heli' && sim.police) {
      sim.pursuit.force(BALANCE.jobs.escape.radioSeconds);
      sim.police.heli.overhead(sim.probe);
    }
  }

  /**
   * The duel's step: a rival over the line (or home) first loses it at once; the player over the line wins a race,
   * the rival's car wrecked wins a hunt (their bag bursts on the road); the Chief's is won by losing him; the clock
   * fails any of them.
   */
  private duelStep(d: JobDef, probe: PlayerProbe, dt: number): void {
    const rival = RIVALS[d.level] as RivalDef;
    if (rival.format === 'chief') {
      if (this.escaped) this.winDuel(d, probe);
      return;
    }
    const traffic = this.sim.traffic;
    const hunted = rival.format === 'hunt' ? (this.race.rivals[0] as number) : -1;
    if (hunted >= 0 && traffic && traffic.state[hunted] === AgentState.Wrecked) {
      const x = traffic.x[hunted] as number, z = traffic.z[hunted] as number;
      this.sim.coins?.spill(x, z, traffic.yaw[hunted] as number, BALANCE.board.hunt.burst, this.sim.events);
      this.lastPlace = 1;
      this.winDuel(d, probe);
      return;
    }
    this.race.step(probe, dt);
    if (this.race.finished > 0) {
      this.lastPlace = 2;
      this.finish('failed', probe);
      this.sim.events.push('jobFailed', 0, probe.x, 0, probe.z, d.id);
      return;
    }
    const reach = BALANCE.jobs.race.finishRadius;
    if (rival.format === 'race' && (d.targetX - probe.x) ** 2 + (d.targetZ - probe.z) ** 2 <= reach * reach) {
      this.lastPlace = 1;
      this.winDuel(d, probe);
      return;
    }
    this.remaining -= dt;
    if (this.remaining > 1e-9) return;
    this.remaining = 0;
    this.finish('failed', probe);
    this.sim.events.push('jobFailed', 0, probe.x, 0, probe.z, d.id);
  }

  /** The purse into the bag (the whole, or a rematch's share), then the board's first win: the rival's car, the news. */
  private winDuel(d: JobDef, probe: PlayerProbe): void {
    const board = this.sim.board;
    const paid = board.purse(d.level);
    this.lastPaid = paid;
    this.lastTip = false;
    this.lastRematch = board.isBeaten(d.level);
    this.finish('done', probe);
    this.sim.events.push('jobDone', paid, probe.x, 0, probe.z, d.id);
    board.win(d.level);
  }

  /**
   * The route's coins: the lane chain from a point to the target, laid whole
   * into the coins' route pool (D3), the cap on the target.
   */
  private layRoute(x: number, z: number, targetX: number, targetZ: number): void {
    const coins = this.sim.coins;
    const city = this.sim.city;
    if (!coins || !city) return;
    coins.clearExtra('route');
    const target = pointTarget(city, targetX, targetZ);
    // the marker stands on the ground: its lane is the street's, never an overpass above it
    const start = city.nearestLane(x, z, 0);
    const s0 = alongLane(city.graph.lanes[start] as Lane, x, z).s;
    const chain = start === target.lane && target.s >= s0 ? [start] : laneChain(city.graph, start, target.lane);
    if (chain.length === 0) return;
    this.routePoints.length = 0;
    routeLine(city.graph, chain, s0, target.s, { x: targetX, z: targetZ }, this.routePoints);
    coins.addExtra(this.routePoints, 'route');
    this.routePoints.length = 0;
  }

  /** The wanted car: kept while it is the class and paint and still a driving civilian, else found again. */
  private hunt(d: JobDef, probe: PlayerProbe, dt: number): void {
    const traffic = this.sim.traffic;
    if (!traffic) return;
    const kind = CAR_IDS[(d.descriptor >>> 24) & 0xff] ?? 'compact';
    const paint = d.descriptor & 0xffffff;
    const w = this.wantedAgent;
    if (w >= 0) {
      const st = traffic.state[w];
      const gone = (st !== AgentState.Kinematic && st !== AgentState.Physical && st !== AgentState.Disturbed)
        || traffic.police[w] === 1 || traffic.kindOf(w) !== kind || traffic.paintOf(w) !== paint;
      if (gone) {
        this.wantedAgent = -1;
        traffic.wanted = -1;
        this.ensureLeft = 0;
      }
    }
    if (this.wantedAgent >= 0) {
      // it cruises, so a hunter can close on it; the guide holds per lane and is renewed every step
      const lane = traffic.lane[this.wantedAgent] as number;
      if (lane >= 0) traffic.setGuidePlan(this.wantedAgent, (traffic.lanes.limit[lane] as number) * BALANCE.jobs.order.cruise);
      return;
    }
    this.ensureLeft -= dt;
    if (this.ensureLeft > 0) return;
    this.ensureLeft = BALANCE.jobs.order.ensureSeconds;
    const police = this.sim.police;
    const cosHalf = Math.cos((police?.tuning.viewHalfAngleDeg ?? 60) * Math.PI / 180);
    const before = traffic.aliveCount;
    const agent = traffic.ensure(kind, paint, probe, police?.tuning.viewNear ?? 60, cosHalf);
    if (agent < 0) return;
    if (traffic.aliveCount > before) this.spawns++;
    else this.repaints++;
    this.wantedAgent = agent;
    traffic.wanted = agent;
    if (!this.found) {
      this.found = true;
      this.sim.events.push('orderFound', 0, traffic.x[agent] as number, 0, traffic.z[agent] as number, agent);
    }
  }

  /** An order arrives in its own class and not as a wreck; a delivery always. */
  private canArrive(d: JobDef): boolean {
    if (d.kind !== 'order') return true;
    const kind = CAR_IDS[(d.descriptor >>> 24) & 0xff];
    return this.sim.carBody === kind && this.sim.life.state.stage < 4 && !this.sim.life.state.wrecked;
  }

  /** The wanted car goes back to being traffic. */
  private release(): void {
    const traffic = this.sim.traffic;
    if (!traffic) return;
    if (this.wantedAgent >= 0 && traffic.police[this.wantedAgent] !== 1) traffic.clearPolicePlan(this.wantedAgent);
    traffic.wanted = -1;
  }

  private finish(state: 'done' | 'failed', probe: PlayerProbe): void {
    this.release();
    this.race.stop();
    this.sim.coins?.clearExtra('route');
    const d = this.defOf(this.active);
    if (d && (d.x - probe.x) ** 2 + (d.z - probe.z) ** 2 <= BALANCE.jobs.markerRadius ** 2) this.rearm = d.id;
    this.state = state;
    this.hold = BALANCE.jobs.holdSeconds;
    this.wantedAgent = -1;
    this.serial++;
  }

  private readonly onEvent = (e: SimEvent): void => {
    if (e.kind === 'escape') this.escaped = true;
    // a running zone job counts what happened inside the zone
    if (this.state !== 'active' || !this.inZone) return;
    const d = this.defOf(this.active);
    if (!d) return;
    if (d.kind === 'rage') {
      if (e.kind === 'takedown' || e.kind === 'takedownTraffic') this.zoneCount++;
    } else if (d.kind === 'mayhem') {
      this.zoneCount += damagePrice(e);
    }
  };
}

/**
 * What an event is worth to mayhem (DESIGN.md §4): a traffic hit by its impact, capped; a wall by less; a smashed
 * thing by its bill (M8 slice 8; the player's, a unit's is 0); the rest priced.
 */
function damagePrice(e: SimEvent): number {
  const m = BALANCE.jobs.zone.mayhem;
  switch (e.kind) {
    case 'smash': return e.value;
    case 'hit': return e.target >= 0 ? Math.min(m.hitCap, Math.round(e.value * m.hitPerMs)) : Math.min(m.wallCap, Math.round(e.value * m.wallPerMs));
    case 'takedownTraffic': return m.takedownTraffic;
    case 'takedown': return m.takedown;
    case 'billboard': return m.billboard;
    case 'camera': return m.camera;
    case 'roadblock': return m.roadblock;
    default: return 0;
  }
}
