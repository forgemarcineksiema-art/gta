/**
 * Bot policies (docs/M4_PLAN.md slice 5): the measurements of slices 5 and 6
 * and M5's balance script assume a novice and a skilled player, and the road
 * bot only follows lanes. `novice` is the road bot as it is. `skilled` wraps
 * it: it swaps when a car is alongside and no unit can see (during a chase,
 * or into any police car it is not already in), leaves the tour for a path
 * that turns at every junction while the police search for it, and boosts on
 * straights. Counts what it did for the measurements. App glue: reads the
 * sim, writes controls only. The bike's case (M8.8 slice 17): `keepCar` never
 * swaps, so a class is measured on its own (the busted rate on a bike).
 */
import type { Lane, SimWorld, SimEvent, TrackSample, VehicleControls } from '../sim';
import { junctionCurve, laneLength, laneSpan, resample, type Pt } from '../sim/city/route';
import type { TrackBot } from './trackBot';

export type PolicyName = 'novice' | 'skilled';

/** Junctions a turning path covers before it is rebuilt. */
const TURNS = 3;
/** The skilled bot boosts above this speed on a straight (m/s). */
const BOOST_ABOVE = 15;

export class BotPolicy {
  swaps = 0;
  escapesBySwap = 0;
  escapesByCooldown = 0;
  /** Escapes by a swap into a police car: the disguise. */
  disguiseEscapes = 0;
  private cursor = -1;
  private turning = false;
  private turnSalt = 0;
  private sim: SimWorld | null = null;

  constructor(readonly name: PolicyName, readonly bot: TrackBot, readonly keepCar = false) {
    if (name === 'skilled') bot.tuning.boostAbove = BOOST_ABOVE;
  }

  get resets(): number {
    return this.bot.resets;
  }

  drive(sim: SimWorld, controls: VehicleControls, dt: number): void {
    this.sim = sim;
    if (this.cursor < 0) this.cursor = sim.events.sequence;
    this.cursor = sim.events.readFrom(this.cursor, this.onEvent);
    if (this.name === 'skilled') this.steerSearch(sim);
    this.bot.drive(sim, controls, dt);
    if (this.name === 'novice' || this.keepCar) return;
    const candidate = sim.life.state.swapCandidate;
    if (candidate < 0 || (sim.police?.crimeSeen() ?? true)) return;
    const policeCar = sim.traffic?.police[candidate] === 1;
    if (sim.pursuit.state !== 'idle' || (policeCar && sim.carId !== 'police')) controls.swap = true;
  }

  /** While the police search, a path that turns at every junction; back to the tour when they stop. */
  private steerSearch(sim: SimWorld): void {
    const lost = sim.pursuit.state === 'lost';
    if (lost && (!this.turning || this.bot.pathLeft < 30)) {
      const path = turningPath(sim, this.turnSalt++);
      if (path.length > 1) {
        this.bot.setPath(path);
        this.turning = true;
      }
    } else if (!lost && this.turning) {
      this.bot.setPath([]);
      this.turning = false;
    }
  }

  private readonly onEvent = (e: SimEvent): void => {
    if (e.kind === 'swap') this.swaps++;
    else if (e.kind === 'escape') {
      if (e.target === 1) {
        this.escapesBySwap++;
        if (this.sim?.pursuit.descriptor.police) this.disguiseEscapes++;
      } else {
        this.escapesByCooldown++;
      }
    }
  };
}

/** From the lane the car drives along, `TURNS` junctions taking a turn at each (left and right by turns), resampled for the bot. */
function turningPath(sim: SimWorld, salt: number): TrackSample[] {
  const traffic = sim.traffic, city = sim.city;
  if (!traffic || !city) return [];
  const lanes = traffic.lanes;
  const p = sim.probe;
  const proj = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
  let lane = -1, best = Infinity, s0 = 0;
  for (let i = 0; i < lanes.laneCount; i++) {
    if (Math.hypot((lanes.midX[i] as number) - p.x, (lanes.midZ[i] as number) - p.z) > (lanes.length[i] as number) / 2 + 20) continue;
    lanes.project(i, p.x, p.z, proj);
    // the lane the car is on and going along: near, and facing the way it drives
    const cost = proj.dist + (1 - Math.cos(proj.yaw - p.yaw)) * 20;
    if (cost < best) { best = cost; lane = i; s0 = proj.s; }
  }
  if (lane < 0) return [];
  const graph = city.graph;
  const raw: Pt[] = [];
  let current = graph.lanes[lane] as Lane;
  laneSpan(current, s0, laneLength(current), raw);
  for (let k = 0; k < TURNS; k++) {
    const outs = lanes.outs(current.id);
    const uturn = lanes.uturn(current.id);
    const turns = outs.filter((o) => o !== uturn && !lanes.straightThrough(current.id, o));
    const pick = turns.length > 0 ? turns[(salt + k) % turns.length] : outs.find((o) => o !== uturn);
    if (pick === undefined) break;
    const next = graph.lanes[pick] as Lane;
    junctionCurve(current, next, raw);
    laneSpan(next, 0, laneLength(next), raw);
    current = next;
  }
  return resample(raw);
}
