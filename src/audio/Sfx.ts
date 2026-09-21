/**
 * One-shot stings driven by the sim event log. Silent until the engine context
 * is running; events from before that are consumed and dropped.
 */
import type { EngineAudio } from './EngineAudio';
import type { SimWorld } from '../sim';

export class Sfx {
  private seq = 0;

  constructor(private readonly engine: EngineAudio) {}

  update(sim: SimWorld): void {
    const ctx = this.engine.ready ? this.engine.output?.context ?? null : null;
    const master = this.engine.output;
    if (!ctx || !master) {
      this.seq = sim.events.readFrom(this.seq, () => undefined);
      return;
    }
    this.seq = sim.events.readFrom(this.seq, (e) => {
      if (e.kind === 'nearMiss' || e.kind === 'nearMissOncoming') this.sweep(ctx, master);
      else if (e.kind === 'honk') this.honk(ctx, master, e.target >= 0 ? (sim.traffic?.kind[e.target] ?? 0) : 0);
      else if (e.kind === 'nearMissPed') this.yelp(ctx, master);
    });
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
