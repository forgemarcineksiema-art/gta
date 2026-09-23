/**
 * The siren bed (docs/M4_PLAN.md §3.1 audio, slice 7): while the police are
 * after the player, a wailing siren whose loudness follows the nearest unit;
 * a lower third voice joins while heavies are in the roster, and the Chief
 * leans on a two-tone horn when it is close. Nodes are built once when the
 * engine's context runs; a frame only moves gains and never allocates.
 */
import type { EngineAudio } from './EngineAudio';
import type { SimWorld } from '../sim';

/** Metres at which the siren fades out, and its loudest level. */
const REACH = 260;
const LEVEL = 0.07;
/** The Chief's horn: within this many metres, a blast every `HORN_EVERY` s. */
const HORN_RANGE = 90;
const HORN_EVERY = 2.6;

export class Siren {
  private ctx: BaseAudioContext | null = null;
  private main: GainNode | null = null;
  private low: GainNode | null = null;
  /** The main voice's sweep: a slow wail at level 1, the faster yelp from level 2 (DESIGN.md §13.9). */
  private mainLfo: OscillatorNode | null = null;
  private lfoRate = 0;
  private horn: GainNode | null = null;
  private hornLeft = 0;

  constructor(private readonly engine: EngineAudio) {}

  update(sim: SimWorld, dt: number): void {
    const out = this.engine.ready ? this.engine.output : null;
    if (!out) return;
    if (!this.ctx) this.build(out);
    const ctx = this.ctx as BaseAudioContext;
    const police = sim.police, traffic = sim.traffic;
    let nearest = Infinity, chief = Infinity;
    const on = police !== null && traffic !== null && sim.pursuit.state !== 'idle';
    if (on) {
      for (let u = 0; u < police.units.length; u++) {
        const agent = police.units[u] as number;
        if (agent < 0) continue;
        const d = Math.hypot((traffic.x[agent] as number) - sim.probe.x, (traffic.z[agent] as number) - sim.probe.z);
        if (d < nearest) nearest = d;
        if (agent === police.chief) chief = d;
      }
    }
    const near = on ? Math.max(0, 1 - nearest / REACH) : 0;
    const t = ctx.currentTime;
    (this.main as GainNode).gain.setTargetAtTime(near * near * LEVEL, t, 0.15);
    // the siren by heat: the yelp from level 2, the low voice from level 3 (and with the heavies)
    const level = sim.heat.level;
    const rate = level >= 2 ? 1.6 : 0.45;
    if (rate !== this.lfoRate && this.mainLfo) {
      this.lfoRate = rate;
      this.mainLfo.frequency.setTargetAtTime(rate, t, 0.3);
    }
    (this.low as GainNode).gain.setTargetAtTime(on && (level >= 3 || (police?.heavies ?? 0) > 0) ? near * near * LEVEL * 0.7 : 0, t, 0.2);
    this.hornLeft -= dt;
    if (chief < HORN_RANGE && this.hornLeft <= 0) {
      this.hornLeft = HORN_EVERY;
      const g = (this.horn as GainNode).gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(0.09, t + 0.03);
      g.setValueAtTime(0.09, t + 0.3);
      g.exponentialRampToValueAtTime(0.0001, t + 0.4);
    }
  }

  /** Two wailing voices (a fifth and an octave apart, the low one for heavies) and the horn's two tones. */
  private build(out: GainNode): void {
    const ctx = out.context;
    this.ctx = ctx;
    let lastLfo: OscillatorNode | null = null;
    const voice = (base: number, depth: number, rate: number): GainNode => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = base;
      const lfo = ctx.createOscillator();
      lfo.type = 'triangle';
      lfo.frequency.value = rate;
      const sweep = ctx.createGain();
      sweep.gain.value = depth;
      lfo.connect(sweep).connect(osc.frequency);
      lastLfo = lfo;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2200;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(out);
      osc.start();
      lfo.start();
      return gain;
    };
    this.main = voice(980, 330, 0.45);
    this.mainLfo = lastLfo;
    this.lfoRate = 0.45;
    this.low = voice(490, 160, 0.45);
    const horn = ctx.createGain();
    horn.gain.value = 0;
    for (const f of [311, 370]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1400;
      osc.connect(filter).connect(horn);
      osc.start();
    }
    horn.connect(out);
    this.horn = horn;
  }
}
