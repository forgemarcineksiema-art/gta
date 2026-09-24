/**
 * The player's settings (M7 slice 3, DESIGN.md §15.3): the music's and the effects' volumes, the graphics quality,
 * the radar's orientation and the screen's language (§19), saved with the profile. The sim carries them for the save
 * and never reads them; the pause screen's row writes them and the app applies them.
 */
export type QualitySetting = 'auto' | 'low' | 'high';

/** The screen's languages (DESIGN.md §19): Polish, the default (Marcin, 2026-09-24), and English. */
export type Lang = 'pl' | 'en';

export const LANGS: readonly Lang[] = ['pl', 'en'];

export const DEFAULT_LANG: Lang = 'pl';

export interface Settings {
  /** Volume steps, 0 (silent) to 10 (full). */
  music: number;
  effects: number;
  quality: QualitySetting;
  radarNorth: boolean;
  /** The language the player picked; '' until they pick one (the default then, `DEFAULT_LANG`). */
  lang: Lang | '';
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ music: 7, effects: 10, quality: 'auto', radarNorth: false, lang: '' });

export const QUALITY_SETTINGS: readonly QualitySetting[] = ['auto', 'low', 'high'];

/** The screen's language: the `lang` parameter (tests, playtests), else the player's pick, else the default. */
export function resolveLang(param: string | null, picked: Lang | ''): Lang {
  return LANGS.find((l) => l === param) ?? (picked !== '' ? picked : DEFAULT_LANG);
}

/** A volume step as a gain on a dB curve: 10 is 0 dB, each step 3 dB less, 0 silence. */
export function volumeGain(step: number): number {
  const s = Math.max(0, Math.min(10, Math.round(step)));
  return s === 0 ? 0 : Math.pow(10, (-3 * (10 - s)) / 20);
}
