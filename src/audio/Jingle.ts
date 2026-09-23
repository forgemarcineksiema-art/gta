/**
 * The ice-cream truck's jingle (M5.5 slice 16): a music box playing a short
 * tune of its own, from the stashed truck to whoever drives within `REACH` m
 * (follow it to find the truck), and softly from the truck itself while the
 * player drives it slowly. Notes are scheduled a moment ahead on the audio
 * clock, one oscillator each; a frame moves one gain.
 */
import type { EngineAudio } from './EngineAudio';
import type { SimWorld } from '../sim';

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

export class Jingle {
  private gain: GainNode | null = null;
  private next = 0;
  private note = 0;

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
    let level = 0;
    const stash = sim.stash, traffic = sim.traffic;
    if (stash.standing && traffic) {
      const a = stash.agent;
      const d = Math.hypot((traffic.x[a] as number) - sim.probe.x, (traffic.z[a] as number) - sim.probe.z);
      const near = Math.max(0, 1 - d / REACH);
      level = near * near * LEVEL;
    }
    if (sim.carBody === 'icecream') level = Math.max(level, DRIVEN * Math.max(0, 1 - sim.probe.speed / QUIET_SPEED));
    const t = ctx.currentTime;
    this.gain.gain.setTargetAtTime(level, t, 0.15);
    if (level <= 0.001) {
      // silent: nothing scheduled; the tune starts from the top when it is heard again
      this.next = 0;
      this.note = 0;
      return;
    }
    if (this.next < t) this.next = t + 0.05;
    while (this.next < t + 0.3) {
      const [semi, beats] = TUNE[this.note % TUNE.length] as readonly [number, number];
      this.pluck(ctx, this.next, C5 * 2 ** (semi / 12), beats * BEAT);
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
