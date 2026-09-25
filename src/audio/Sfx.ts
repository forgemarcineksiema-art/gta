/**
 * One-shot stings driven by the sim event log. Silent until the engine context
 * is running; events from before that are consumed and dropped. The callbacks
 * are bound once because the ring is polled every frame.
 */
import type { EngineAudio } from './EngineAudio';
import type { PropMaterial, SimEvent, SimWorld } from '../sim';
import { BALANCE, PROPS } from '../sim/balance';
import { PROP_KINDS, PROP_TYPES } from '../sim/city/props';
import { BODIES } from '../sim/traffic/bodies';
import { KIT } from '../sim/garage/kit';
import { CAR_IDS } from '../sim/vehicle/presets';

export class Sfx {
  private seq = 0;
  private ctx: BaseAudioContext | null = null;
  private master: AudioNode | null = null;
  private traffic: SimWorld['traffic'] = null;
  private props: SimWorld['props'] = null;
  private px = 0;
  private pz = 0;
  /** A broken hydrant's hiss (M8 slice 5): one looping noise, its gain by the nearest jet's distance. */
  private hiss: GainNode | null = null;
  /** The player's class index (the horn's pitch when none is worn). */
  private playerKind = 0;
  private readonly drop = (): void => undefined;
  private readonly play = (e: SimEvent): void => {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    if (e.kind === 'nearMiss' || e.kind === 'nearMissOncoming') this.sweep(ctx, master);
    else if (e.kind === 'honk') this.honk(ctx, master, e.target >= 0 ? (this.traffic?.kind[e.target] ?? 0) : 0, e.target >= 0 && (BODIES[this.traffic?.body[e.target] ?? 0]?.stretch ?? false));
    else if (e.kind === 'nearMissPed') this.yelp(ctx, master);
    else if (e.kind === 'damage') this.crunch(ctx, master, e.value);
    else if (e.kind === 'wrecked') this.boom(ctx, master);
    else if (e.kind === 'respawn' || e.kind === 'swap') this.whoosh(ctx, master);
    else if (e.kind === 'takedown' || e.kind === 'takedownTraffic') { this.crunch(ctx, master, 4); this.boom(ctx, master); }
    else if (e.kind === 'billboard') { this.splinter(ctx, master); this.ding(ctx, master); }
    else if (e.kind === 'breaker') this.splinter(ctx, master);
    else if (e.kind === 'smash') {
      // a prop knocked down (M8 slice 5): its material's voice, quieter with the distance (a chasing unit's smash 60 m back)
      const k = this.props ? this.props.kind[e.target] ?? 255 : 255;
      const near = Math.max(0, 1 - Math.hypot(e.x - this.px, e.z - this.pz) / 90);
      if (k !== 255 && near > 0) this.smash(ctx, master, PROP_TYPES[PROP_KINDS[k] as keyof typeof PROP_TYPES].material, near);
    }
    else if (e.kind === 'door') this.thud(ctx, master);
    else if (e.kind === 'coin') this.coin(ctx, master, e.value);
    else if (e.kind === 'spill') this.cascade(ctx, master);
    else if (e.kind === 'busted') this.fall(ctx, master);
    else if (e.kind === 'camera') this.shutter(ctx, master);
    else if (e.kind === 'jump') { this.crunch(ctx, master, 1); this.ding(ctx, master); }
    else if (e.kind === 'roadblock') { this.splinter(ctx, master); this.crunch(ctx, master, 1); }
    // a car flattened by the steamroller (M8.8 slice 11): a crunch and a comic two-note sag
    else if (e.kind === 'flatten') { this.crunch(ctx, master, 3); this.note(ctx, master, 392, 0.06, 0.14, 0.07, 'triangle'); this.note(ctx, master, 196, 0.18, 0.3, 0.07, 'triangle'); }
    // jobs and the wall (M5): a two-note sting up, a chord, a low buzz; a ping when the wanted car turns up
    else if (e.kind === 'jobStart') { this.note(ctx, master, 523.25, 0, 0.12, 0.09, 'square'); this.note(ctx, master, 783.99, 0.11, 0.2, 0.09, 'square'); }
    else if (e.kind === 'jobDone') { for (const f of [523.25, 659.25, 783.99, 1046.5]) this.note(ctx, master, f, 0, 0.6, 0.06, 'triangle'); }
    else if (e.kind === 'jobFailed') { this.note(ctx, master, 110, 0, 0.45, 0.1, 'sawtooth'); this.note(ctx, master, 103.8, 0.05, 0.45, 0.08, 'sawtooth'); }
    else if (e.kind === 'orderFound') this.note(ctx, master, 1318.5, 0, 0.18, 0.06, 'sine');
    else if (e.kind === 'purchase') { this.note(ctx, master, 1567.98, 0, 0.08, 0.07, 'square'); this.note(ctx, master, 2093, 0.07, 0.35, 0.07, 'triangle'); this.coin(ctx, master, 50); }
    else if (e.kind === 'dailyDone') { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.note(ctx, master, f, i * 0.09, i === 3 ? 0.55 : 0.12, 0.08, 'square')); }
    // the ratchet crossed a level (M5.5): a short two-tone wail, the siren's shape in a sting
    else if (e.kind === 'heatLevel') { this.note(ctx, master, 440, 0, 0.16, 0.07, 'sawtooth'); this.note(ctx, master, 587.33, 0.15, 0.3, 0.07, 'sawtooth'); }
    // a cache found (M5.5): the cap's bell already rang; every tenth adds the streak's two notes
    else if (e.kind === 'cache') { if (e.value > 0) { this.note(ctx, master, 880, 0, 0.12, 0.06, 'triangle'); this.note(ctx, master, 1174.66, 0.1, 0.3, 0.06, 'triangle'); } }
    else if (e.kind === 'streak') { this.note(ctx, master, 880, 0, 0.12, 0.06, 'triangle'); this.note(ctx, master, 1174.66, 0.1, 0.3, 0.06, 'triangle'); }
    // the player's horn (M6 slice 7): the kit's worn one, or the class's own
    else if (e.kind === 'horn') this.playerHorn(ctx, master, e.target);
    // the wanted board (M6): a rival calls you out (three notes up, a question); a rival beaten (the chord, then an octave)
    else if (e.kind === 'rivalReady') { [392, 523.25, 698.46].forEach((f, i) => this.note(ctx, master, f, i * 0.12, i === 2 ? 0.4 : 0.12, 0.08, 'square')); }
    else if (e.kind === 'rivalBeaten') { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.note(ctx, master, f, i * 0.08, i === 4 ? 0.7 : 0.14, 0.08, 'square')); }
  };

  constructor(private readonly engine: EngineAudio) {}

  update(sim: SimWorld): void {
    const master = this.engine.ready ? this.engine.output : null;
    if (!master) {
      this.seq = sim.events.readFrom(this.seq, this.drop);
      return;
    }
    this.ctx = master.context;
    this.master = master;
    this.traffic = sim.traffic;
    this.props = sim.props;
    this.px = sim.probe.x;
    this.pz = sim.probe.z;
    this.water(master.context, master, sim);
    this.playerKind = Math.max(0, CAR_IDS.indexOf(sim.carId));
    this.seq = sim.events.readFrom(this.seq, this.play);
  }

  /** A horn looked at on the wall (M8.9 R10): sounded once, as the car's horn would. */
  horn(item: number): void {
    const master = this.engine.ready ? this.engine.output : null;
    if (master) this.playerHorn(master.context, master, item);
  }

  /** One enveloped oscillator note `delay` s from now. */
  private note(ctx: BaseAudioContext, master: AudioNode, freq: number, delay: number, dur: number, peak: number, type: OscillatorType): void {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private sweep(ctx: BaseAudioContext, master: AudioNode): void {
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(1800, t + 0.25);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    noise.connect(filter).connect(gain).connect(master);
    noise.start(t);
    noise.stop(t + 0.26);
  }

  /**
   * The player's horn (M6 slice 7) by the kit's item: the clown's squeeze, a goose, a doorbell, a two-tone, a kazoo,
   * the air horn; none worn is the class's own honk. Our own sounds, synthesized like the rest.
   */
  private playerHorn(ctx: BaseAudioContext, master: AudioNode, item: number): void {
    const id = item >= 0 ? (KIT[item]?.id ?? '') : '';
    switch (id) {
      case 'clown':
        this.bend(ctx, master, 'triangle', [[620, 0], [780, 0.08], [520, 0.2]], 0.24, 0.1);
        this.bend(ctx, master, 'triangle', [[700, 0.28], [900, 0.36], [600, 0.46]], 0.5, 0.1);
        break;
      case 'goose':
        for (const d of [0, 0.22]) this.bend(ctx, master, 'sawtooth', [[520, d], [420, d + 0.14]], d + 0.16, 0.07);
        break;
      case 'doorbell':
        this.note(ctx, master, 1318.5, 0, 0.5, 0.08, 'sine');
        this.note(ctx, master, 1046.5, 0.32, 0.8, 0.08, 'sine');
        break;
      case 'twoToneHorn':
        this.note(ctx, master, 392, 0, 0.26, 0.07, 'square');
        this.note(ctx, master, 523.25, 0.24, 0.3, 0.07, 'square');
        break;
      case 'kazoo':
        this.bend(ctx, master, 'sawtooth', [[440, 0], [466, 0.1], [440, 0.2], [494, 0.3], [440, 0.42]], 0.46, 0.05);
        break;
      case 'airHorn':
        this.honk(ctx, master, 0, true);
        this.note(ctx, master, 110, 0, 0.7, 0.07, 'sawtooth');
        break;
      default:
        this.honk(ctx, master, this.playerKind);
    }
  }

  /** One oscillator through a list of (frequency, time) points, held to `end`. */
  private bend(ctx: BaseAudioContext, master: AudioNode, type: OscillatorType, points: ReadonlyArray<readonly [number, number]>, end: number, peak: number): void {
    const t = ctx.currentTime, first = points[0];
    if (!first) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(first[0], t + first[1]);
    for (let k = 1; k < points.length; k++) {
      const p = points[k] as readonly [number, number];
      osc.frequency.linearRampToValueAtTime(p[0], t + p[1]);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t + first[1]);
    gain.gain.exponentialRampToValueAtTime(peak, t + first[1] + 0.02);
    gain.gain.setValueAtTime(peak, t + end - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + end);
    osc.connect(gain).connect(master);
    osc.start(t + first[1]);
    osc.stop(t + end + 0.02);
  }

  /** A car's horn by class; a truck's or a bus's is the low air horn, held longer. */
  private honk(ctx: BaseAudioContext, master: AudioNode, kind: number, air = false): void {
    const t = ctx.currentTime;
    const base = air ? 140 : 220 + kind * 40;
    const hold = air ? 0.55 : 0.3;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.setValueAtTime(base * 1.25, t + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + hold);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + hold + 0.02);
  }

  private yelp(ctx: BaseAudioContext, master: AudioNode): void {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(500, t + 0.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  /** A part coming off: a short metallic noise burst plus a low knock, harder with the stage. */
  private crunch(ctx: BaseAudioContext, master: AudioNode, stage: number): void {
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, t);
    filter.Q.setValueAtTime(0.8, t);
    const gain = ctx.createGain();
    const peak = 0.18 + 0.06 * Math.min(4, stage);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    noise.connect(filter).connect(gain).connect(master);
    noise.start(t);
    noise.stop(t + 0.15);
    const knock = ctx.createOscillator();
    knock.type = 'square';
    knock.frequency.setValueAtTime(90, t);
    knock.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.0001, t);
    kg.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    knock.connect(kg).connect(master);
    knock.start(t);
    knock.stop(t + 0.13);
  }

  /** The wreck: a low boom and two seconds of crackle. */
  private boom(ctx: BaseAudioContext, master: AudioNode): void {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.72);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(0.14, t + 0.05);
    for (let k = 1; k <= 8; k++) cg.gain.setTargetAtTime(k % 2 ? 0.05 : 0.12, t + 0.05 + k * 0.22, 0.05);
    cg.gain.setTargetAtTime(0.0001, t + 2.0, 0.15);
    noise.connect(filter).connect(cg).connect(master);
    noise.start(t);
    noise.stop(t + 2.6);
  }

  /** A noise burst through a filter: `type` at `freq` (Q), up in `attack` s to `peak`, down by `end` s. */
  private burst(ctx: BaseAudioContext, master: AudioNode, type: BiquadFilterType, freq: number, q: number, attack: number, peak: number, end: number, delay = 0): void {
    const t = ctx.currentTime + delay;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    filter.Q.setValueAtTime(q, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + end);
    noise.connect(filter).connect(gain).connect(master);
    noise.start(t);
    noise.stop(t + end + 0.02);
  }

  /** A pitch falling from `from` to `to` Hz over `dur` s. */
  private fallTo(ctx: BaseAudioContext, master: AudioNode, type: OscillatorType, from: number, to: number, dur: number, peak: number): void {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /**
   * A smash's voice by what the thing is made of (M8 slice 5): metal clangs (two inharmonic partials over a tick),
   * glass shatters (a hiss and tinkles), wood cracks (a snap over a thump), plastic bonks, fruit squelches, paper
   * rustles, ceramic clinks and crashes. `near` (0..1) the distance's share.
   */
  private smash(ctx: BaseAudioContext, master: AudioNode, material: PropMaterial, near: number): void {
    const g = near * near;
    switch (material) {
      case 'metal':
        this.note(ctx, master, 383, 0, 0.45, 0.07 * g, 'triangle');
        this.note(ctx, master, 587, 0, 0.3, 0.05 * g, 'square');
        this.burst(ctx, master, 'bandpass', 3200, 2, 0.003, 0.12 * g, 0.06);
        break;
      case 'glass':
        this.burst(ctx, master, 'highpass', 4200, 0.7, 0.004, 0.2 * g, 0.35);
        for (let k = 0; k < 5; k++) this.note(ctx, master, 2600 + ((k * 1297) % 2400), 0.03 + k * 0.05, 0.12, 0.03 * g, 'sine');
        break;
      case 'wood':
        this.burst(ctx, master, 'bandpass', 950, 1.4, 0.002, 0.24 * g, 0.12);
        this.fallTo(ctx, master, 'sine', 140, 70, 0.16, 0.12 * g);
        break;
      case 'plastic':
        this.fallTo(ctx, master, 'triangle', 240, 140, 0.13, 0.1 * g);
        this.burst(ctx, master, 'bandpass', 1500, 1.2, 0.002, 0.08 * g, 0.07);
        break;
      case 'fruit':
        this.burst(ctx, master, 'lowpass', 650, 0.8, 0.01, 0.2 * g, 0.22);
        this.fallTo(ctx, master, 'sine', 320, 70, 0.22, 0.09 * g);
        break;
      case 'paper':
        this.burst(ctx, master, 'bandpass', 2600, 0.6, 0.03, 0.09 * g, 0.55);
        break;
      case 'ceramic':
        this.note(ctx, master, 1850, 0, 0.1, 0.05 * g, 'sine');
        this.note(ctx, master, 2730, 0.01, 0.08, 0.04 * g, 'sine');
        this.burst(ctx, master, 'highpass', 3000, 0.7, 0.004, 0.14 * g, 0.2);
        break;
    }
  }

  /** The hydrants' hiss: made once, its gain following the nearest running jet (silent past 50 m). */
  private water(ctx: BaseAudioContext, master: AudioNode, sim: SimWorld): void {
    const props = sim.props;
    if (!props) return;
    let best = Infinity;
    for (let j = 0; j < PROPS.jet.max; j++) {
      if ((props.jets[j * 3 + 2] as number) <= 0) continue;
      best = Math.min(best, Math.hypot((props.jets[j * 3] as number) - this.px, (props.jets[j * 3 + 1] as number) - this.pz));
    }
    if (!this.hiss) {
      if (best === Infinity) return;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer(ctx);
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2100;
      filter.Q.value = 0.6;
      this.hiss = ctx.createGain();
      this.hiss.gain.value = 0;
      noise.connect(filter).connect(this.hiss).connect(master);
      noise.start();
    }
    const k = Math.max(0, 1 - best / 50);
    this.hiss.gain.setTargetAtTime(0.14 * k * k, ctx.currentTime, 0.15);
  }

  /** Billboard: a short bright noise burst, the panel splintering. */
  private splinter(ctx: BaseAudioContext, master: AudioNode): void {
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1800, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    noise.connect(filter).connect(gain).connect(master);
    noise.start(t);
    noise.stop(t + 0.3);
  }

  /** A speed camera: a shutter click and the flash's rising whine. */
  private shutter(ctx: BaseAudioContext, master: AudioNode): void {
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200, t);
    const click = ctx.createGain();
    click.gain.setValueAtTime(0.0001, t);
    click.gain.exponentialRampToValueAtTime(0.3, t + 0.004);
    click.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    noise.connect(filter).connect(click).connect(master);
    noise.start(t);
    noise.stop(t + 0.06);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400, t + 0.02);
    osc.frequency.exponentialRampToValueAtTime(5200, t + 0.35);
    const whine = ctx.createGain();
    whine.gain.setValueAtTime(0.0001, t + 0.02);
    whine.gain.exponentialRampToValueAtTime(0.05, t + 0.06);
    whine.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(whine).connect(master);
    osc.start(t + 0.02);
    osc.stop(t + 0.42);
  }

  /** Billboard: the collect chime, two sines a fifth apart. */
  private ding(ctx: BaseAudioContext, master: AudioNode): void {
    const t = ctx.currentTime + 0.05;
    for (const [freq, level] of [[1318.5, 0.12], [1975.5, 0.06]] as Array<[number, number]>) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + 0.52);
    }
  }

  private coinStreak = 0;
  private coinAt = -1;

  /**
   * A coin: a small bell (a sine and its octave) that climbs a semitone per
   * coin while they keep coming, so a line plays a scale; the cap a line ends
   * on adds a fifth that rings on.
   */
  private coin(ctx: BaseAudioContext, master: AudioNode, value: number): void {
    const t = ctx.currentTime;
    this.coinStreak = t - this.coinAt < 0.45 ? Math.min(this.coinStreak + 1, 12) : 0;
    this.coinAt = t;
    const freq = 1318.5 * Math.pow(2, this.coinStreak / 12);
    this.bell(ctx, master, freq, t, 0.05, 0.14);
    this.bell(ctx, master, freq * 2, t, 0.016, 0.09);
    if (value >= BALANCE.coin.cap) {
      this.bell(ctx, master, freq * 1.5, t + 0.06, 0.05, 0.32);
      this.bell(ctx, master, freq * 3, t + 0.06, 0.012, 0.2);
    }
  }

  private bell(ctx: BaseAudioContext, master: AudioNode, freq: number, t: number, peak: number, decay: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + decay + 0.01);
  }

  /** The spill: six falling blips, the bag bursting. */
  private cascade(ctx: BaseAudioContext, master: AudioNode): void {
    const t0 = ctx.currentTime;
    for (let k = 0; k < 6; k++) {
      const t = t0 + k * 0.06;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1760 * Math.pow(2, -k * 2 / 12), t);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + 0.09);
    }
  }

  /** The roller door hitting the floor: a low knock and a short rattle. */
  private thud(ctx: BaseAudioContext, master: AudioNode): void {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.45, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.32);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(700, t);
    filter.Q.setValueAtTime(1.2, t);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    noise.connect(filter).connect(ng).connect(master);
    noise.start(t);
    noise.stop(t + 0.36);
  }

  /** Busted: two falling notes, the comic "wah-wah". */
  private fall(ctx: BaseAudioContext, master: AudioNode): void {
    const t0 = ctx.currentTime;
    for (const [start, from, to] of [[0, 392, 370], [0.28, 311, 233]] as Array<[number, number, number]>) {
      const t = t0 + start;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(to, t + 0.26);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1600, t);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.1, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(filter).connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + 0.32);
    }
  }

  /** Respawn: an upward noise sweep. */
  private whoosh(ctx: BaseAudioContext, master: AudioNode): void {
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(2400, t + 0.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    noise.connect(filter).connect(gain).connect(master);
    noise.start(t);
    noise.stop(t + 0.44);
  }
}

let cached: AudioBuffer | null = null;
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  if (cached && cached.sampleRate === ctx.sampleRate) return cached;
  const buffer = ctx.createBuffer(1, ctx.sampleRate >> 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  cached = buffer;
  return buffer;
}
