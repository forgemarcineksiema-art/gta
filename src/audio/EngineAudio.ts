/**
 * Synthesized engine, wind and tyre-skid audio in WebAudio. No samples: two
 * detuned oscillators plus a noise bed shaped by RPM and load, wind noise by
 * speed, a band-passed noise for skids. One master gain for the ad-mute hook.
 *
 * The AudioContext is created lazily on the first user gesture (browser policy;
 * on iOS it must also be resumed inside a gesture).
 */
import type { VehicleTelemetry } from '../sim';

const GESTURES = ['keydown', 'pointerdown', 'touchstart', 'touchend', 'click'] as const;

export class EngineAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Everything but the music, under the master (M7 slice 3: the settings' EFFECTS row). */
  private effects: GainNode | null = null;
  private effectsLevel = 1;
  /** The whole mix's low-pass, open unless something muffles it (the helicopter overhead). */
  private muffler: BiquadFilterNode | null = null;
  private muffled = 0;
  private engineGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private skidGain: GainNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private crashGain: GainNode | null = null;
  private scrapeGain: GainNode | null = null;
  private scrapeFilter: BiquadFilterNode | null = null;
  private muted = false;
  private userMuted = false;
  private volume = 0.5;
  private rpmSmooth = 900;
  private loadSmooth = 0;
  private readonly onGesture: () => void;

  constructor() {
    this.onGesture = () => void this.unlock();
    // keydown/pointerdown for desktop; touchend/click are what iOS needs to recover a suspended context
    for (const ev of GESTURES) window.addEventListener(ev, this.onGesture);
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Muffle the whole mix, 0 (open) to 1 (a thick low-pass): the helicopter hanging overhead. */
  muffle(amount: number): void {
    const a = Math.max(0, Math.min(1, amount));
    if (!this.muffler || !this.ctx || Math.abs(a - this.muffled) < 0.02) return;
    this.muffled = a;
    this.muffler.frequency.setTargetAtTime(20000 * Math.pow(600 / 20000, a), this.ctx.currentTime, 0.15);
  }

  /** The effects' bus, under the master: every sound but the music connects here, so both mutes take it. */
  get output(): GainNode | null {
    return this.effects;
  }

  /** The master itself, for the music's own bus (M7 slice 3): the ad and the player's mute take it too. */
  get musicOutput(): GainNode | null {
    return this.master;
  }

  /** The effects' share of the mix, a gain (the settings' EFFECTS row). */
  setEffectsVolume(gain: number): void {
    this.effectsLevel = Math.max(0, gain);
    if (this.effects && this.ctx) this.effects.gain.setTargetAtTime(this.effectsLevel, this.ctx.currentTime, 0.05);
  }

  /** Create or resume the context. Must run inside a user gesture the first time. */
  async unlock(): Promise<void> {
    try {
      if (!this.ctx) this.build();
      if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume();
    } catch (e) {
      console.warn('audio unlock failed', e);
    }
  }

  private build(): void {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.effectiveVolume();
    this.muffler = ctx.createBiquadFilter();
    this.muffler.type = 'lowpass';
    this.muffler.frequency.value = 20000;
    this.master.connect(this.muffler).connect(ctx.destination);
    this.effects = ctx.createGain();
    this.effects.gain.value = this.effectsLevel;
    this.effects.connect(this.master);

    // engine: saw + square an octave down + sub sine, through a lowpass driven by load
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineFilter.Q.value = 1.2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain).connect(this.effects);

    this.oscA = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscB = ctx.createOscillator();
    this.oscB.type = 'square';
    this.oscSub = ctx.createOscillator();
    this.oscSub.type = 'sine';
    const gA = ctx.createGain();
    gA.gain.value = 0.35;
    const gB = ctx.createGain();
    gB.gain.value = 0.18;
    const gS = ctx.createGain();
    gS.gain.value = 0.3;
    this.oscA.connect(gA).connect(this.engineFilter);
    this.oscB.connect(gB).connect(this.engineFilter);
    this.oscSub.connect(gS).connect(this.engineFilter);
    // a little grit: waveshaper on the saw
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(18);
    gA.disconnect();
    gA.connect(shaper).connect(this.engineFilter);
    this.oscA.start();
    this.oscB.start();
    this.oscSub.start();

    // shared noise source
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, 2);
    noise.loop = true;
    noise.start();

    // wind
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.5;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(this.windFilter).connect(this.windGain).connect(this.effects);

    // skid
    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 1100;
    this.skidFilter.Q.value = 2.5;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    noise.connect(this.skidFilter).connect(this.skidGain).connect(this.effects);

    // body: a low thump on impact, a metallic grind while scraping a wall
    const crashFilter = ctx.createBiquadFilter();
    crashFilter.type = 'lowpass';
    crashFilter.frequency.value = 260;
    this.crashGain = ctx.createGain();
    this.crashGain.gain.value = 0;
    noise.connect(crashFilter).connect(this.crashGain).connect(this.effects);
    this.scrapeFilter = ctx.createBiquadFilter();
    this.scrapeFilter.type = 'bandpass';
    this.scrapeFilter.frequency.value = 2600;
    this.scrapeFilter.Q.value = 1.2;
    this.scrapeGain = ctx.createGain();
    this.scrapeGain.gain.value = 0;
    noise.connect(this.scrapeFilter).connect(this.scrapeGain).connect(this.effects);
  }

  update(tm: VehicleTelemetry, dt: number): void {
    if (!this.ctx || !this.oscA || !this.oscB || !this.oscSub || !this.engineFilter || !this.engineGain || !this.windGain || !this.skidGain || !this.skidFilter || !this.crashGain || !this.scrapeGain || !this.scrapeFilter) return;
    const k = 1 - Math.exp(-dt * 10);
    this.rpmSmooth += (tm.rpm - this.rpmSmooth) * k;
    this.loadSmooth += (tm.load - this.loadSmooth) * k;
    const t = this.ctx.currentTime;
    const tc = 0.03;

    // 4 firing pulses per rev for a V8-ish tone
    const f = (this.rpmSmooth / 60) * 4;
    this.oscA.frequency.setTargetAtTime(f, t, tc);
    this.oscB.frequency.setTargetAtTime(f * 0.5 * 1.005, t, tc);
    this.oscSub.frequency.setTargetAtTime(f * 0.25, t, tc);
    this.engineFilter.frequency.setTargetAtTime(350 + this.loadSmooth * 2400 + this.rpmSmooth * 0.15, t, tc);
    const boostBite = tm.boosting ? 0.12 : 0;
    this.engineGain.gain.setTargetAtTime(0.16 + this.loadSmooth * 0.22 + boostBite, t, tc);

    const speed = Math.abs(tm.speed);
    const wind = Math.pow(Math.min(1, speed / 65), 2) * 0.6;
    this.windGain.gain.setTargetAtTime(wind, t, 0.08);
    if (this.windFilter) this.windFilter.frequency.setTargetAtTime(300 + speed * 12, t, 0.1);

    // squeal from sideways slip past the tyre's peak, and from wheelspin / lock-up
    const angSlip = tm.groundedWheels > 0 ? Math.max(0, (tm.maxSlipDeg - 8) / 25) : 0;
    const ratioSlip = tm.groundedWheels > 0 ? Math.max(0, (Math.max(tm.maxSlipRatio, -tm.minSlipRatio) - 0.25) / 0.6) : 0;
    const slip = Math.max(angSlip, ratioSlip);
    const skid = Math.min(1, slip) * Math.min(1, Math.max(speed, ratioSlip * 12) / 12) * 0.35;
    this.skidGain.gain.setTargetAtTime(skid, t, 0.05);
    this.skidFilter.frequency.setTargetAtTime(900 + Math.min(1, slip) * 500, t, 0.05);

    // a hit is a one-shot thump scaled by the speed lost; scraping is a sustained grind
    if (tm.impact > 0.6) {
      const hit = Math.min(1, tm.impact / 14);
      this.crashGain.gain.cancelScheduledValues(t);
      this.crashGain.gain.setValueAtTime(0.25 + hit * 0.9, t);
      this.crashGain.gain.setTargetAtTime(0, t + 0.02, 0.09 + hit * 0.1);
    }
    this.scrapeGain.gain.setTargetAtTime(tm.scrape * 0.3, t, 0.04);
    this.scrapeFilter.frequency.setTargetAtTime(1800 + speed * 25, t, 0.05);
  }

  /** Ad-mute hook (adStarted / adFinished). Independent from the player's own mute. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
  }

  toggleUserMute(): boolean {
    this.userMuted = !this.userMuted;
    this.applyVolume();
    return this.userMuted;
  }

  get isUserMuted(): boolean {
    return this.userMuted;
  }

  private effectiveVolume(): number {
    return this.muted || this.userMuted ? 0 : this.volume;
  }

  private applyVolume(): void {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.effectiveVolume(), this.ctx.currentTime, 0.02);
  }

  dispose(): void {
    for (const ev of GESTURES) window.removeEventListener(ev, this.onGesture);
    void this.ctx?.close();
    this.ctx = null;
  }
}

function makeNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let s = 22222;
  for (let i = 0; i < len; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    data[i] = (s / 4294967296) * 2 - 1;
  }
  return buf;
}

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}
