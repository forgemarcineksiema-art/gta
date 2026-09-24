/**
 * The game's own music (M7 slice 2, DESIGN.md §15.3): one groove of eight bars in A minor at 120 bpm over
 * Am–F–C–G, two bars a chord, written for the game. Five layers that the heat adds (the bass and the offbeat
 * keys when calm, the drums from one star, the lead's hook from three, the alarm figure at five) and three stings.
 * Data only: `Music` renders it once into loops; nothing here touches WebAudio, so the pins read it in Node.
 */

/** A note: where in the loop (bar 0–7, beat 0–3.75 in sixteenths), how long in beats, a MIDI pitch, 0–1 loud. */
export interface Note {
  bar: number;
  beat: number;
  length: number;
  pitch: number;
  velocity: number;
}

export type LayerName = 'bass' | 'keys' | 'drums' | 'lead' | 'alarm';

/** A layer plays from `fromHeat` stars up; `level` is its place in the mix. */
export interface Layer {
  name: LayerName;
  fromHeat: number;
  level: number;
  notes: readonly Note[];
}

export type StingKind = 'busted' | 'escape' | 'door';

/** The drum kit's pitches in the drums layer (General MIDI numbers, so a reader knows them). */
export const KICK = 36;
export const CLAP = 39;
export const HAT = 42;
export const OPEN_HAT = 46;

export const BPM = 120;
export const BARS = 8;
/** Seconds a beat, and the loop. */
export const BEAT = 60 / BPM;
export const LOOP_SECONDS = BARS * 4 * BEAT;

/** Each bar's chord root (MIDI, the bass's octave): A2 A2 F2 F2 C3 C3 G2 G2. */
const ROOTS = [45, 45, 41, 41, 48, 48, 43, 43] as const;
/** Each bar's offbeat stab, voiced round middle C so the hands barely move: Am, F over A, C over G, G. */
const TRIADS: ReadonlyArray<readonly number[]> = [
  [57, 60, 64], [57, 60, 64], [57, 60, 65], [57, 60, 65], [55, 60, 64], [55, 60, 64], [55, 59, 62], [55, 59, 62],
];

function n(bar: number, beat: number, length: number, pitch: number, velocity: number): Note {
  return { bar, beat, length, pitch, velocity };
}

/** Each bar's seventh and third above its root, in A minor (Am: G, C; F: E, A; C: B, E; G: F, B). */
const SEVENTH = [10, 10, 11, 11, 11, 11, 10, 10] as const;
const THIRD = [3, 3, 4, 4, 4, 4, 4, 4] as const;

/** The bass: driving eighths, the root with its octave on the offbeats, the fifth and the seventh at the bar's end. */
function bass(): Note[] {
  const out: Note[] = [];
  for (let bar = 0; bar < BARS; bar++) {
    const r = ROOTS[bar] as number;
    const sev = r + (SEVENTH[bar] as number), third = r + (THIRD[bar] as number);
    const second = bar % 2 === 1;
    const steps = second ? [r, r + 12, r, r + 12, sev, r + 12, r + 7, third] : [r, r + 12, r, r + 12, r, r + 12, r + 7, sev];
    for (let k = 0; k < 8; k++) out.push(n(bar, k * 0.5, 0.4, steps[k] as number, k % 2 === 0 ? 0.9 : 0.7));
  }
  return out;
}

/** The keys: a short chord on every offbeat, the last of a bar a touch louder. */
function keys(): Note[] {
  const out: Note[] = [];
  for (let bar = 0; bar < BARS; bar++) {
    for (let k = 0; k < 4; k++) {
      for (const p of TRIADS[bar] as readonly number[]) out.push(n(bar, k + 0.5, 0.25, p, k === 3 ? 0.75 : 0.6));
    }
  }
  return out;
}

/** The drums: a kick on every beat, the clap on two and four, eighth hats with the offbeat up, a clap roll into the top. */
function drums(): Note[] {
  const out: Note[] = [];
  for (let bar = 0; bar < BARS; bar++) {
    for (let b = 0; b < 4; b++) out.push(n(bar, b, 0.25, KICK, 1));
    out.push(n(bar, 1, 0.25, CLAP, 0.9), n(bar, 3, 0.25, CLAP, 0.9));
    for (let k = 0; k < 8; k++) {
      const open = k === 7 && bar % 4 === 3;
      out.push(n(bar, k * 0.5, open ? 0.5 : 0.1, open ? OPEN_HAT : HAT, k % 2 === 1 ? 0.8 : 0.45));
    }
  }
  // the fill: sixteenth claps rising over the last two beats
  for (let s = 0; s < 8; s++) out.push(n(BARS - 1, 2 + s * 0.25, 0.2, CLAP, 0.35 + s * 0.08));
  return out;
}

/** The lead's hook, eighth notes over two bars a chord; `[step, pitch, eighths held]`. */
const HOOK: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [[0, 76, 1], [2, 81, 1], [4, 84, 1], [5, 83, 1], [6, 81, 1]],
  [[0, 79, 1], [2, 81, 1], [4, 76, 3]],
  [[0, 77, 1], [2, 81, 1], [4, 84, 1], [5, 83, 1], [6, 81, 1]],
  [[0, 79, 1], [2, 77, 1], [4, 76, 3]],
  [[0, 76, 1], [2, 79, 1], [4, 84, 1], [5, 83, 1], [6, 79, 1]],
  [[0, 76, 1], [2, 79, 1], [4, 81, 3]],
  [[0, 74, 1], [2, 79, 1], [4, 83, 1], [5, 81, 1], [6, 79, 1]],
  [[0, 76, 1], [2, 74, 1], [4, 71, 3]],
];

function lead(): Note[] {
  const out: Note[] = [];
  HOOK.forEach((bar, b) => { for (const [step, pitch, held] of bar) out.push(n(b, step * 0.5, held * 0.5 - 0.05, pitch, 0.8)); });
  return out;
}

/** The alarm at five stars: a siren figure, A5 to D#6 and back, a bar each way. */
function alarm(): Note[] {
  const out: Note[] = [];
  for (let bar = 0; bar < BARS; bar++) out.push(n(bar, 0, 1.9, 81, 0.6), n(bar, 2, 1.9, 87, 0.6));
  return out;
}

export const LAYERS: readonly Layer[] = [
  { name: 'bass', fromHeat: 0, level: 0.5, notes: bass() },
  { name: 'keys', fromHeat: 0, level: 0.2, notes: keys() },
  { name: 'drums', fromHeat: 1, level: 0.55, notes: drums() },
  { name: 'lead', fromHeat: 3, level: 0.24, notes: lead() },
  { name: 'alarm', fromHeat: 5, level: 0.14, notes: alarm() },
];

/**
 * The stings, in beats from their start (bar 0): busted slips down a semitone twice and falls a fourth with a sag;
 * the escape climbs the A minor chord; the door is the till's bright chord and its bell.
 */
export const STINGS: Readonly<Record<StingKind, readonly Note[]>> = {
  busted: [n(0, 0, 0.45, 69, 0.8), n(0, 0.5, 0.45, 68, 0.8), n(0, 1, 0.45, 67, 0.8), n(0, 1.5, 1.6, 62, 0.85), n(0, 1.5, 1.6, 38, 0.7)],
  escape: [n(0, 0, 0.22, 69, 0.8), n(0, 0.25, 0.22, 72, 0.8), n(0, 0.5, 0.22, 76, 0.85), n(0, 0.75, 1.3, 81, 0.9), n(0, 0.75, 1.3, 45, 0.8)],
  door: [n(0, 0, 0.12, 72, 0.8), n(0, 0.125, 0.12, 76, 0.8), n(0, 0.25, 0.12, 79, 0.85), n(0, 0.375, 1.1, 84, 0.9), n(0, 0.375, 1.4, 96, 0.5)],
};

/** The score in one object (docs/M7_PLAN.md §3.2): the tempo, the loop's bars, the layers and the stings. */
export const SCORE = { bpm: BPM, bars: BARS, layers: LAYERS, stings: STINGS } as const;

/** Seconds from a note's place in the loop. */
export function noteTime(note: Note): number {
  return (note.bar * 4 + note.beat) * BEAT;
}

/** The layer's target gain at a heat level (0–5 stars): all or nothing, the fade is the audio's. */
export function layerGain(layer: Layer, heat: number): number {
  return heat >= layer.fromHeat ? 1 : 0;
}

/** A MIDI pitch's frequency. */
export function hz(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

/**
 * A rendered loop's tail (release, the delay's echoes) played past its end folded back onto its start, so the loop
 * joins without a click: `samples` holds `loop` frames and the tail after them; returns the first `loop` frames.
 */
export function foldTail<B extends ArrayBufferLike>(samples: Float32Array<B>, loop: number): Float32Array<B> {
  const out = samples.subarray(0, loop);
  for (let i = loop; i < samples.length; i++) {
    const j = (i - loop) % loop;
    out[j] = (out[j] as number) + (samples[i] as number);
  }
  return out;
}

/** Which sting an event plays: busted, an escape, the door banking the bag. */
export function stingFor(kind: string): StingKind | null {
  return kind === 'busted' ? 'busted' : kind === 'escape' ? 'escape' : kind === 'banked' ? 'door' : null;
}
