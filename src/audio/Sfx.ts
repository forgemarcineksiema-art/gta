/**
 * One-shot stings driven by the sim event log. Silent until the engine context
 * is running; events from before that are consumed and dropped. The callbacks
 * are bound once because the ring is polled every frame.
 */
import type { EngineAudio } from './EngineAudio';
import type { SimEvent, SimWorld } from '../sim';

export class Sfx {
  private seq = 0;
  private ctx: BaseAudioContext | null = null;
  private master: AudioNode | null = null;
  private traffic: SimWorld['traffic'] = null;
  private readonly drop = (): void => undefined;
  private readonly play = (e: SimEvent): void => {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    if (e.kind === 'nearMiss' || e.kind === 'nearMissOncoming') this.sweep(ctx, master);
    else if (e.kind === 'honk') this.honk(ctx, master, e.target >= 0 ? (this.traffic?.kind[e.target] ?? 0) : 0);
    else if (e.kind === 'nearMissPed') this.yelp(ctx, master);
    else if (e.kind === 'damage') this.crunch(ctx, master, e.value);
    else if (e.kind === 'wrecked') this.boom(ctx, master);
    else if (e.kind === 'respawn' || e.kind === 'swap') this.whoosh(ctx, master);
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
    this.seq = sim.events.readFrom(this.seq, this.play);
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

  private honk(ctx: BaseAudioContext, master: AudioNode, kind: number): void {
    const t = ctx.currentTime;
    const base = 220 + kind * 40;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.setValueAtTime(base * 1.25, t + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.32);
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
