/**
 * The helicopter's rotor (M5.5 slice 9): a thumping low noise at the blade
 * rate whose loudness follows the aircraft's distance, and, while it hangs
 * overhead, the whole mix muffled through the engine's low-pass (the BACKLOG's
 * "rotor as a low-pass on everything"). Nodes are built once; a frame only
 * moves gains.
 */
import type { EngineAudio } from './EngineAudio';
import type { SimWorld } from '../sim';

/** Metres at which the rotor fades out, its loudest level, the blade rate (Hz), and the overhead reach (m). */
const REACH = 320;
const LEVEL = 0.16;
const BLADE_HZ = 13;
const OVERHEAD = 70;

export class Rotor {
  private built = false;
  private gain: GainNode | null = null;

  constructor(private readonly engine: EngineAudio) {}

  update(sim: SimWorld): void {
    const out = this.engine.ready ? this.engine.output : null;
    if (!out) return;
    if (!this.built) this.build(out);
    const heli = sim.police?.heli;
    const on = heli?.active ?? false;
    const d = on && heli ? Math.hypot(heli.x - sim.probe.x, heli.z - sim.probe.z) : Infinity;
    const near = on ? Math.max(0, 1 - d / REACH) : 0;
    const t = out.context.currentTime;
    (this.gain as GainNode).gain.setTargetAtTime(near * near * LEVEL, t, 0.2);
    this.engine.muffle(on && d < OVERHEAD ? 1 - d / OVERHEAD : 0);
  }

  /** Noise through a low band, its loudness chopped at the blade rate. */
  private build(out: GainNode): void {
    const ctx = out.context;
    this.built = true;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'lowpass';
    band.frequency.value = 180;
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = BLADE_HZ;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(chop.gain);
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    noise.connect(band).connect(chop).connect(this.gain).connect(out);
    noise.start();
    lfo.start();
  }
}
