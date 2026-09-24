/**
 * The player's settings (M7 slice 3, DESIGN.md §15.3): the music's and the effects' volumes, the graphics quality
 * and the radar's orientation, saved with the profile. The sim carries them for the save and never reads them; the
 * pause screen's row writes them and the app applies them.
 */
export type QualitySetting = 'auto' | 'low' | 'high';

export interface Settings {
  /** Volume steps, 0 (silent) to 10 (full). */
  music: number;
  effects: number;
  quality: QualitySetting;
  radarNorth: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ music: 7, effects: 10, quality: 'auto', radarNorth: false });

export const QUALITY_SETTINGS: readonly QualitySetting[] = ['auto', 'low', 'high'];

/** A volume step as a gain on a dB curve: 10 is 0 dB, each step 3 dB less, 0 silence. */
export function volumeGain(step: number): number {
  const s = Math.max(0, Math.min(10, Math.round(step)));
  return s === 0 ? 0 : Math.pow(10, (-3 * (10 - s)) / 20);
}
