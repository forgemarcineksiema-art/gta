import { BALANCE } from '../balance';
import type { EventLog, SimEvent } from '../events';
import type { Traffic } from '../traffic/Traffic';

/**
 * Heat survives an escape. Event consumers each own a cursor into the ring.
 *
 * What the police see decides how much a crime costs (docs/DESIGN.md §13.3,
 * M5.5 slice 0): a crime in a unit's sight pays `seenFactor` times its
 * points and makes the player wanted at once (the points never land below
 * the first threshold), so the patrols on the beat at heat 0 are the city's
 * eyes; a crime nobody saw raises the ratchet quietly. Reckless driving
 * counts: a hit on a civilian above the disturb threshold, once per car per
 * `hitCooldown`; the chase itself, `chasePerSecond` while the pursuit is
 * active; speeding in a patrol's sight (the police push that one).
 */
export class Heat {
  private value = 0;
  private sequence = 0;
  /** The last discrete gain and a serial that bumps with it: the HUD's `+n` pop. */
  lastGain = 0;
  gainSerial = 0;
  /** Whether a crime read this step is in a unit's sight; the world wires it to `Police.crimeSeen`. */
  seen: () => boolean = () => false;
  /** The player's speed at the contact (the faster car is at fault); the world wires it to the probe. */
  playerSpeed: () => number = () => Infinity;
  private lastLevel = 0;
  private readonly hitCooldown: Float32Array;
  /** The ceiling the points may reach: 100, but under the cold open's cap while it runs (the world sets it each step). */
  cap = 100;

  constructor(private readonly events: EventLog, private readonly traffic: Traffic | null) {
    this.hitCooldown = new Float32Array(traffic ? traffic.capacity : 0);
  }

  get points(): number { return this.value; }

  get level(): number {
    let level = 0;
    for (const threshold of BALANCE.heatThresholds) if (this.value >= threshold) level++;
    return level;
  }

  /**
   * Points for a crime. `seen` pays `seenFactor` times as much and never
   * leaves the player below the first threshold: a cop who saw it comes
   * after you. The chase's quiet drip goes through `tick`.
   */
  add(points: number, seen = false): void {
    if (!(points > 0) || !Number.isFinite(points)) return;
    let gain = seen ? points * BALANCE.heat.seenFactor : points;
    if (seen) gain = Math.max(gain, (BALANCE.heatThresholds[0] ?? 0) - this.value);
    this.value = Math.max(this.value, Math.min(this.cap, this.value + gain));
    this.lastGain = gain;
    this.gainSerial++;
  }

  /** The sighting alone: wanted from here (level 1 at least), the points flat. Speeding past a patrol. */
  wanted(points: number): void {
    const gain = Math.max(points, (BALANCE.heatThresholds[0] ?? 0) - this.value);
    if (!(gain > 0)) return;
    this.value = Math.max(this.value, Math.min(this.cap, this.value + gain));
    this.lastGain = gain;
    this.gainSerial++;
  }

  /** Test and tuning hook: the points set outright (the balance probe holds a level; the URL's `heat=`). */
  set(points: number): void {
    this.value = Math.max(0, Math.min(100, points));
    this.lastLevel = this.level;
  }

  reset(): void {
    this.value = 0;
    this.lastLevel = 0;
    this.sequence = this.events.sequence;
    this.hitCooldown.fill(0);
  }

  /** The ring's crimes since the last step, each judged by what the police could see this step. */
  step(): void {
    this.sequence = this.events.readFrom(this.sequence, this.onEvent);
  }

  /**
   * After the ring: the chase's drip while the pursuit is active, the hit
   * cooldowns, and the level-up event the HUD and the audio answer.
   */
  tick(dt: number, chasing: boolean): void {
    const heat = BALANCE.heat;
    if (chasing && heat.chasePerSecond > 0) this.value = Math.max(this.value, Math.min(this.cap, this.value + heat.chasePerSecond * dt));
    const cool = this.hitCooldown;
    for (let i = 0; i < cool.length; i++) {
      const c = cool[i] as number;
      if (c > 0) cool[i] = c - dt;
    }
    const level = this.level;
    if (level > this.lastLevel) this.events.push('heatLevel', level, 0, 0, 0);
    this.lastLevel = level;
  }

  private readonly onEvent = (event: SimEvent): void => {
    const heat = BALANCE.heat;
    const kind = event.kind;
    if (kind === 'takedown' || kind === 'takedownTraffic') {
      this.add(this.traffic?.police[event.target] ? heat.policeTakedown : heat.trafficTakedown, this.seen());
    } else if (kind === 'billboard') {
      this.add(heat.billboard, this.seen());
    } else if (kind === 'camera') {
      this.add(heat.camera, this.seen());
    } else if (kind === 'roadblock') {
      this.add(heat.roadblock, this.seen());
    } else if (kind === 'hit') {
      // a civilian rammed hard enough to knock it off its lane, once per car per cooldown; the faster car
      // is at fault, so one that drives into a slower or stopped player pays nothing
      const agent = event.target;
      const traffic = this.traffic;
      // a unit, or a car the law takes for one (Fake Frank), is the police's own rule
      if (agent < 0 || !traffic || traffic.police[agent] === 1 || traffic.badge[agent] === 1) return;
      if (event.value < traffic.tuning.disturbedImpact || (this.hitCooldown[agent] as number) > 0) return;
      const other = Math.max(traffic.speed[agent] as number, traffic.prevSpeed[agent] as number);
      if (other > this.playerSpeed() + heat.faultMargin) return;
      this.hitCooldown[agent] = heat.hitCooldown;
      this.add(heat.hit, this.seen());
    }
  };
}
