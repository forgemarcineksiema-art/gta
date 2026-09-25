/**
 * The hidden cars' clues (M5.5 slice 16, M6 slice 9): the ice-cream truck's
 * music box, the roadster's jaunty low motif, the sweeper's reversing beeps,
 * the hot-dog van's bell, each a short figure of our own from the nearest
 * unfound car to whoever drives within `REACH` m (follow it to find it), and
 * softly from the car itself while the player drives it slowly. Notes are
 * scheduled a moment ahead on the audio clock, one oscillator each; a frame
 * moves one gain.
 */
import type { EngineAudio } from './EngineAudio';
import type { SimWorld } from '../sim';
import { HIDDEN_CARS, type HiddenCar } from '../sim/city/stash';

/** Metres at which the stashed truck's tune fades out, and its loudest level. */
const REACH = 160;
const LEVEL = 0.12;
/** Driving it: the level at a standstill, and the speed (m/s) at which it has faded out. */
const DRIVEN = 0.05;
const QUIET_SPEED = 14;
/** The tune: semitones above C5 and beats, a music-box figure written for the game. */
const TUNE: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [4, 1], [7, 1], [12, 2], [11, 1], [7, 1], [9, 2],
  [5, 1], [9, 1], [12, 1], [14, 2], [12, 1], [11, 1], [7, 2],
  [0, 1], [4, 1], [7, 1], [9, 1], [7, 1], [4, 1], [2, 1], [0, 3],
];
const BEAT = 0.22;
const C5 = 523.25;
/** Each hidden car's figure: semitones above C5 (NaN a rest) and beats. */
const TUNES: Readonly<Record<HiddenCar, ReadonlyArray<readonly [number, number]>>> = {
  icecream: TUNE,
  roadster: [[-12, 1], [-8, 1], [-5, 1], [-3, 2], [-5, 1], [-8, 1], [-12, 2], [NaN, 2], [-10, 1], [-7, 1], [-3, 1], [-1, 2], [-3, 1], [-7, 1], [-10, 2], [NaN, 2]],
  sweeper: [[19, 1], [NaN, 1], [19, 1], [NaN, 1], [19, 1], [NaN, 3]],
  hotdog: [[16, 1], [19, 1], [NaN, 1], [16, 1], [19, 1], [NaN, 1], [24, 2], [NaN, 3]],
  // the steamroller's slow low chug (M8.8 slice 11)
  roller: [[-24, 2], [NaN, 1], [-24, 2], [NaN, 1], [-19, 1], [-24, 3], [NaN, 3]],
};

export class Jingle {
  private gain: GainNode | null = null;
  private next = 0;
  private note = 0;
  /** The car whose figure is playing (it starts from the top when another is heard). */
  private playing: HiddenCar = 'icecream';

  constructor(private readonly engine: EngineAudio) {}

  update(sim: SimWorld): void {
    const out = this.engine.ready ? this.engine.output : null;
    if (!out) return;
    const ctx = out.context;
    if (!this.gain) {
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(out);
    }
    let level = 0, source: HiddenCar | null = null;
    const stash = sim.stash, traffic = sim.traffic;
    if (traffic) {
      // the nearest unfound car standing at its spot
      for (let k = 0; k < HIDDEN_CARS.length; k++) {
        const a = stash.agents[k] as number;
        if (a < 0) continue;
        const d = Math.hypot((traffic.x[a] as number) - sim.probe.x, (traffic.z[a] as number) - sim.probe.z);
        const near = Math.max(0, 1 - d / REACH);
        if (near * near * LEVEL > level) { level = near * near * LEVEL; source = HIDDEN_CARS[k] as HiddenCar; }
      }
    }
    const driven = (HIDDEN_CARS as readonly string[]).includes(sim.carBody) ? sim.carBody as HiddenCar : null;
    if (driven) {
      const soft = DRIVEN * Math.max(0, 1 - sim.probe.speed / QUIET_SPEED);
      if (soft > level) { level = soft; source = driven; }
    }
    if (source && source !== this.playing) {
      this.playing = source;
      this.note = 0;
    }
    const t = ctx.currentTime;
    this.gain.gain.setTargetAtTime(level, t, 0.15);
    if (level <= 0.001) {
      // silent: nothing scheduled; the tune starts from the top when it is heard again
      this.next = 0;
      this.note = 0;
      return;
    }
    if (this.next < t) this.next = t + 0.05;
    const tune = TUNES[this.playing];
    while (this.next < t + 0.3) {
      const [semi, beats] = tune[this.note % tune.length] as readonly [number, number];
      if (!Number.isNaN(semi)) this.pluck(ctx, this.next, C5 * 2 ** (semi / 12), beats * BEAT);
      this.next += beats * BEAT;
      this.note++;
    }
  }

  /** One music-box note: a triangle with a quick attack and a bell's decay. */
  private pluck(ctx: BaseAudioContext, at: number, hz: number, length: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = hz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.9, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.01, at + Math.max(0.2, length * 1.5));
    osc.connect(env).connect(this.gain as GainNode);
    osc.start(at);
    osc.stop(at + Math.max(0.25, length * 1.6));
  }
}
