/**
 * A voice per engine (M8.8 slice 8): what the synthesized engine sounds like in each body. The firing pulses a
 * revolution set the note at a given rpm (a V8's four, a six's three, a four's two); the mix of the three oscillators,
 * the saw's grit and the low-pass's range set the timbre; a diesel clatters on a band of noise. The ear tells the
 * class; a class's civilian bodies share its voice unless `OWN_VOICES` names their own. Each new vehicle's slice adds
 * its voice here.
 */
import { bodySpec, type BodyId, type CarId } from '../sim';

export interface EngineVoice {
  /** Firing pulses a crank revolution: the note at a given rpm. */
  pulses: number;
  /** The oscillators' levels: the gritty saw on the note, the square an octave down, the sub sine two octaves down. */
  saw: number;
  square: number;
  sub: number;
  /** The waveshaper's drive on the saw. */
  grit: number;
  /** The low-pass: its floor (Hz) and how far a full load opens it (Hz). */
  floor: number;
  open: number;
  /** A band of noise under the engine (a diesel's clatter, a two-stroke's rasp), its level and its centre (Hz); 0 none. */
  rattle: number;
  rattleHz: number;
  /** The engine's loudness, a factor on its level. */
  level: number;
}

/** The muscle car's and the police car's V8: a deep burble (the engine as it was before the voices). */
const V8: EngineVoice = { pulses: 4, saw: 0.35, square: 0.18, sub: 0.3, grit: 18, floor: 350, open: 2400, rattle: 0, rattleHz: 1000, level: 1 };
/** The compact's four: a note an octave up at the same revs, buzzier, less bottom. */
const FOUR: EngineVoice = { pulses: 2, saw: 0.42, square: 0.12, sub: 0.1, grit: 30, floor: 520, open: 2800, rattle: 0, rattleHz: 1000, level: 0.9 };
/** The sports car's six: smooth and bright, the square carrying it. */
const SIX: EngineVoice = { pulses: 3, saw: 0.28, square: 0.26, sub: 0.18, grit: 10, floor: 460, open: 3200, rattle: 0, rattleHz: 1000, level: 1 };
/** The van's diesel, and every truck's and bus's: a low four's note on a clatter of noise. */
const DIESEL: EngineVoice = { pulses: 2, saw: 0.3, square: 0.22, sub: 0.34, grit: 40, floor: 260, open: 1500, rattle: 0.22, rattleHz: 1400, level: 1.05 };
/** The 4×4's big six (M8.8 slice 10): three pulses, low and gruff, a little clatter under it. */
const BIG_SIX: EngineVoice = { pulses: 3, saw: 0.32, square: 0.2, sub: 0.32, grit: 26, floor: 300, open: 1900, rattle: 0.08, rattleHz: 1100, level: 1 };
/** The Bubble's two-stroke: one pulse a revolution, a square's buzz, a rasp over it. */
const TWO_STROKE: EngineVoice = { pulses: 1, saw: 0.18, square: 0.42, sub: 0.04, grit: 60, floor: 900, open: 3500, rattle: 0.06, rattleHz: 3200, level: 0.85 };

/** Each class's voice: its shell's, and its civilian bodies' unless they have their own. */
export const CLASS_VOICES: Readonly<Record<CarId, EngineVoice>> = { muscle: V8, compact: FOUR, heavy: DIESEL, sports: SIX, police: V8, offroad: BIG_SIX };

/** The bodies with a voice of their own. */
export const OWN_VOICES: Readonly<Partial<Record<BodyId, EngineVoice>>> = { bubble: TWO_STROKE };

export function voiceOf(body: BodyId): EngineVoice {
  return OWN_VOICES[body] ?? CLASS_VOICES[bodySpec(body).car];
}
