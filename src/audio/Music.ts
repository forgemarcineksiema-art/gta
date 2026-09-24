/**
 * The game's own music (M7 slice 2, DESIGN.md §15.3, docs/M7_PLAN.md D2): the score (`score.ts`) rendered once,
 * a second after gameplay starts, through an `OfflineAudioContext` into one mono loop a layer and a buffer a sting;
 * then the layers loop together from one start time and the heat only moves their gains, over a bar. A sting plays
 * over the loops and ducks them 6 dB for its length. Synthesized like the engine: no file, nothing to load before
 * play. The bus joins the master, so the ad mute and the player's mute silence it with everything else.
 */
import type { SimWorld } from '../sim';
import type { EngineAudio } from './EngineAudio';
import {
  BEAT, CLAP, KICK, LAYERS, LOOP_SECONDS, OPEN_HAT, STINGS,
  foldTail, hz, layerGain, noteTime, stingFor, type Layer, type LayerName, type Note, type StingKind,
} from './score';

/** The music under the master (DESIGN.md §15.3: 14 dB under it, like the file it replaces). */
const BUS_LEVEL = Math.pow(10, -14 / 20);
/** Seconds after gameplay starts before the render (the first quiet second). */
const START_DELAY = 1;
/** Seconds of tail rendered past a loop's end and folded back onto its start. */
const TAIL = 2;
/** A layer's fade: the time constant of a one-bar move. */
const FADE = (4 * BEAT) / 3;
/** The ducking under a sting. */
const DUCK = Math.pow(10, -6 / 20);

type Voice = (ctx: BaseAudioContext, out: AudioNode, note: Note, t: number, noise: AudioBuffer) => void;

export class Music {
  private state: 'idle' | 'rendering' | 'playing' = 'idle';
  private wait = START_DELAY;
  private bus: GainNode | null = null;
  private duck: GainNode | null = null;
  private readonly gains: GainNode[] = [];
  private readonly stings: Partial<Record<StingKind, AudioBuffer>> = {};
  private heat = -1;
  private cursor = -1;
  private volume = 1;

  constructor(private readonly engine: EngineAudio) {}

  /** Each frame: render once after gameplay starts, then follow the heat and play the stings of this frame's events. */
  update(sim: SimWorld, started: boolean, dt: number): void {
    if (this.cursor < 0) this.cursor = sim.events.sequence;
    if (this.state === 'playing') {
      this.setHeat(sim.heat.level);
      this.cursor = sim.events.readFrom(this.cursor, (e) => {
        const s = stingFor(e.kind);
        if (s) this.sting(s);
      });
      return;
    }
    this.cursor = sim.events.sequence;
    if (this.state !== 'idle' || !started || !this.engine.ready) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    const out = this.engine.musicOutput;
    if (!out) return;
    this.state = 'rendering';
    void this.start(out).catch((e: unknown) => {
      console.warn('music: render failed', e);
      this.state = 'idle';
      this.wait = 30;
    });
  }

  /** The music's share of the mix, a gain (the settings' MUSIC row, slice 3). */
  setVolume(v: number): void {
    this.volume = Math.max(0, v);
    if (this.bus) this.bus.gain.setTargetAtTime(BUS_LEVEL * this.volume, this.bus.context.currentTime, 0.05);
  }

  /** The layers the heat level wants, faded over a bar. No allocation. */
  setHeat(level: number): void {
    if (level === this.heat || !this.bus) return;
    this.heat = level;
    const t = this.bus.context.currentTime;
    for (let i = 0; i < LAYERS.length; i++) this.gains[i]?.gain.setTargetAtTime(layerGain(LAYERS[i] as Layer, level), t, FADE);
  }

  /** A sting over the loops, which duck under it. */
  sting(kind: StingKind): void {
    const buffer = this.stings[kind];
    if (!buffer || !this.bus || !this.duck) return;
    const ctx = this.bus.context;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.bus);
    const t = ctx.currentTime;
    src.start(t);
    const g = this.duck.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(DUCK, t, 0.03);
    g.setTargetAtTime(1, t + buffer.duration * 0.8, 0.2);
  }

  dispose(): void {
    this.bus?.disconnect();
    this.bus = null;
    this.state = 'idle';
  }

  private async start(out: GainNode): Promise<void> {
    const ctx = out.context;
    const rate = ctx.sampleRate;
    const loop = Math.round(LOOP_SECONDS * rate);
    const layers = await Promise.all(LAYERS.map((l) => render(rate, loop + Math.round(TAIL * rate), l.notes, voiceFor(l.name), l.level)));
    const stingKinds = Object.keys(STINGS) as StingKind[];
    const stings = await Promise.all(stingKinds.map((k) => render(rate, Math.round(3 * rate), STINGS[k], stingVoice, 0.3)));
    stingKinds.forEach((k, i) => { this.stings[k] = stings[i] as AudioBuffer; });

    this.bus = ctx.createGain();
    this.bus.gain.value = BUS_LEVEL * this.volume;
    this.bus.connect(out);
    this.duck = ctx.createGain();
    this.duck.connect(this.bus);
    const at = ctx.currentTime + 0.1;
    for (let i = 0; i < LAYERS.length; i++) {
      const rendered = layers[i] as AudioBuffer;
      const buffer = ctx.createBuffer(1, loop, rate);
      buffer.copyToChannel(foldTail(rendered.getChannelData(0), loop), 0);
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.duck);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(g);
      src.start(at);
      this.gains.push(g);
    }
    this.heat = -1;
    this.state = 'playing';
  }
}

/** Renders `notes` with `voice` into a mono buffer of `frames` at `rate`, at `level`. */
async function render(rate: number, frames: number, notes: readonly Note[], voice: Voice, level: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, frames, rate);
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(ctx.destination);
  const noise = ctx.createBuffer(1, rate, rate);
  const data = noise.getChannelData(0);
  let seed = 0x2f6b;
  for (let i = 0; i < data.length; i++) {
    // a small LCG: the same noise every render
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  for (const note of notes) voice(ctx, out, note, noteTime(note), noise);
  return ctx.startRendering();
}

function voiceFor(name: LayerName): Voice {
  switch (name) {
    case 'bass': return bassVoice;
    case 'keys': return keysVoice;
    case 'drums': return drumVoice;
    case 'lead': return leadVoice;
    case 'alarm': return alarmVoice;
  }
}

/** An envelope on a gain: attack, then down to `sustain`, released at the note's end. */
function envelope(g: GainNode, t: number, length: number, peak: number, attack: number, sustain: number, release: number): void {
  const p = g.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setTargetAtTime(peak * sustain, t + attack, Math.max(0.01, length * 0.3));
  p.setTargetAtTime(0, t + length, release);
}

/** A saw through a snapping low-pass: the driving bass. */
const bassVoice: Voice = (ctx, out, note, t) => {
  const len = note.length * BEAT;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = hz(note.pitch);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 6;
  f.frequency.setValueAtTime(1800, t);
  f.frequency.setTargetAtTime(420, t, 0.05);
  const g = ctx.createGain();
  envelope(g, t, len, note.velocity, 0.005, 0.6, 0.03);
  osc.connect(f).connect(g).connect(out);
  osc.start(t);
  osc.stop(t + len + 0.3);
};

/** Two triangles a few cents apart, plucked: the offbeat keys. */
const keysVoice: Voice = (ctx, out, note, t) => {
  const g = ctx.createGain();
  envelope(g, t, note.length * BEAT, note.velocity, 0.003, 0.2, 0.06);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 2200;
  f.connect(g).connect(out);
  for (const cents of [-6, 6]) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = hz(note.pitch);
    osc.detune.value = cents;
    osc.connect(f);
    osc.start(t);
    osc.stop(t + note.length * BEAT + 0.4);
  }
};

/** The kit: a swept sine kick, a triple-burst noise clap, high-passed noise hats. */
const drumVoice: Voice = (ctx, out, note, t, noise) => {
  const v = note.velocity;
  if (note.pitch === KICK) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.3);
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  if (note.pitch === CLAP) {
    f.type = 'bandpass';
    f.frequency.value = 1500;
    f.Q.value = 1.2;
    g.gain.setValueAtTime(0, t);
    for (const k of [0, 0.011, 0.022]) {
      g.gain.setValueAtTime(v * 0.8, t + k);
      g.gain.setTargetAtTime(v * 0.1, t + k + 0.002, 0.004);
    }
    g.gain.setValueAtTime(v * 0.7, t + 0.033);
    g.gain.setTargetAtTime(0, t + 0.034, 0.05);
  } else {
    f.type = 'highpass';
    f.frequency.value = 7000;
    const open = note.pitch === OPEN_HAT;
    g.gain.setValueAtTime(v * 0.5, t);
    g.gain.setTargetAtTime(0, t + 0.002, open ? 0.09 : 0.015);
  }
  src.connect(f).connect(g).connect(out);
  src.start(t, (t * 7.31) % 0.8);
  src.stop(t + 0.5);
};

/** Two squares a few cents apart through a low-pass, with a dotted-eighth echo: the hook. */
const leadVoice: Voice = (ctx, out, note, t) => {
  const len = note.length * BEAT;
  const g = ctx.createGain();
  envelope(g, t, len, note.velocity, 0.01, 0.7, 0.05);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 2600;
  const echo = ctx.createDelay(1);
  echo.delayTime.value = BEAT * 0.75;
  const back = ctx.createGain();
  back.gain.value = 0.3;
  const wet = ctx.createGain();
  wet.gain.value = 0.25;
  f.connect(g);
  g.connect(out);
  g.connect(echo);
  echo.connect(back).connect(echo);
  echo.connect(wet).connect(out);
  for (const cents of [-7, 7]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = hz(note.pitch);
    osc.detune.value = cents;
    osc.connect(f);
    osc.start(t);
    osc.stop(t + len + 0.3);
  }
};

/** A saw that slides into its note and wobbles: the siren at five stars. */
const alarmVoice: Voice = (ctx, out, note, t) => {
  const len = note.length * BEAT;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(hz(note.pitch - 3), t);
  osc.frequency.exponentialRampToValueAtTime(hz(note.pitch), t + 0.15);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 6;
  const depth = ctx.createGain();
  depth.gain.value = 15;
  lfo.connect(depth).connect(osc.detune);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 3000;
  const g = ctx.createGain();
  envelope(g, t, len, note.velocity, 0.05, 0.9, 0.08);
  osc.connect(f).connect(g).connect(out);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + len + 0.4);
  lfo.stop(t + len + 0.4);
};

/** The stings: a square lead, a saw bass under the low notes, a bell for the till's top note. */
const stingVoice: Voice = (ctx, out, note, t, noise) => {
  if (note.pitch >= 96) {
    // the till's bell: a sine and an inharmonic partial, ringing
    for (const [mul, level] of [[1, 0.5], [2.76, 0.25]] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = hz(note.pitch) * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(note.velocity * level, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 1.3);
    }
    return;
  }
  if (note.pitch < 50) {
    bassVoice(ctx, out, note, t, noise);
    return;
  }
  const len = note.length * BEAT;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(hz(note.pitch), t);
  // a long last note sags a little: the busted sting's deflating end
  if (note.length > 1) osc.frequency.setTargetAtTime(hz(note.pitch - 1), t + len * 0.4, len * 0.3);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 2400;
  const g = ctx.createGain();
  envelope(g, t, len, note.velocity, 0.01, 0.75, 0.08);
  osc.connect(f).connect(g).connect(out);
  osc.start(t);
  osc.stop(t + len + 0.5);
};
