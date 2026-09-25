/**
 * The screen's language (docs/DESIGN.md §19, Marcin 2026-09-24): Polish by default, English beside it. Every word on
 * the screen is written in English in the code and goes through `t` on its way there: the English is the key, the
 * Polish its value in `pl.ts`. Numbers group their thousands the language's way (84,500 and 84 500); a car's paint
 * agrees with the car in Polish (`paintedCar`). A static label keeps its key on its element (`label`), so a new
 * language is said again by `relabel` without building the screen anew.
 *
 * The module starts in English, the code's own language, so the pure tests read what the code writes; the app sets
 * the player's language before it builds the screen.
 */
import { BEST_AT, BODY_WORDS, ONLY_IT, ROLE_WORDS, bodySpec, english, englishNumber, fill, type BodyId, type Holes, type Lang } from '../sim';
import { PL, PL_BEST, PL_GENDER, PL_ONLY_IT, PL_PAINT } from './pl';

/** A language named in itself: the settings row shows it so, in either language. */
export const LANG_NAMES: Readonly<Record<Lang, string>> = { pl: 'POLSKI', en: 'ENGLISH' };

let current: Lang = 'en';

const PL_NUMBER = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 3 });

function polishNumber(v: number): string {
  return PL_NUMBER.format(v);
}

/** Polish counts: 1 one form; 2–4 (but not 12–14) another; the rest, and a fraction, a third or the second. */
export function polishForm(n: number): number {
  if (!Number.isInteger(n)) return 1;
  const a = Math.abs(n), ten = a % 10, hundred = a % 100;
  if (a === 1) return 0;
  return ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14) ? 1 : 2;
}

export function setLang(l: Lang): void {
  current = l;
}

export function lang(): Lang {
  return current;
}

/** The English text (a template with holes) in the player's language. A key the table lacks is said as written. */
export function t(key: string, holes?: Holes): string {
  if (current === 'en') return english(key, holes);
  return fill(PL[key] ?? key, holes, polishNumber, polishForm);
}

/** A number as the screen writes it: 84,500 or 84 500 (Polish groups from five digits, with a space that holds). */
export function num(v: number): string {
  return current === 'en' ? englishNumber(v) : polishNumber(v);
}

/** A number with `digits` decimals: 1.5 or 1,5. */
export function fixed(v: number, digits: number): string {
  const s = v.toFixed(digits);
  return current === 'en' ? s : s.replace('.', ',');
}

const FORM = { m: 0, f: 1, n: 2 } as const;

/** A car in a paint (the English names): RED TAXI; in Polish the paint agrees with the car, CZERWONA TAKSÓWKA. */
export function paintedCar(paint: string, car: string): string {
  if (current === 'en') return `${paint} ${car}`;
  const forms = PL_PAINT[paint];
  return `${forms ? forms[FORM[PL_GENDER[car] ?? 'm']] : t(paint)} ${t(car)}`;
}

/**
 * The line under a car's name on the wall (M8.8 slices 3, 5, 11): a crazy car's ONLY IT (TYLKO ON: ROZJEŻDŻA AUTA,
 * the pronoun the car's), a trophy's BEST AT, in Polish agreeing with the car (NAJTWARDSZA laweta, NAJSZYBSZY fantom),
 * else what its class is for.
 */
export function carLine(body: BodyId): string {
  const only = ONLY_IT[body];
  if (only) {
    return current === 'pl' ? `${PL_ONLY_IT[FORM[PL_GENDER[BODY_WORDS[body]] ?? 'm']]}: ${t(only)}` : t('ONLY IT: {thing}', { thing: t(only) });
  }
  const best = BEST_AT[body];
  if (!best) return t(ROLE_WORDS[bodySpec(body).car]);
  const forms = current === 'pl' ? PL_BEST[best] : undefined;
  return forms ? forms[FORM[PL_GENDER[BODY_WORDS[body]] ?? 'm']] : t('BEST AT: {thing}', { thing: t(best) });
}

/** A label that never changes but with the language: its key stays on the element for `relabel`. */
export function label<T extends HTMLElement>(e: T, key: string): T {
  e.dataset['say'] = key;
  e.textContent = t(key);
  return e;
}

/** An element's spoken name (`aria-label`), kept like a label's text. */
export function labelAria<T extends HTMLElement>(e: T, key: string): T {
  e.dataset['sayAria'] = key;
  e.setAttribute('aria-label', t(key));
  return e;
}

/** Every label under `root` said again in the current language. */
export function relabel(root: ParentNode): void {
  for (const e of root.querySelectorAll<HTMLElement>('[data-say]')) e.textContent = t(e.dataset['say'] ?? '');
  for (const e of root.querySelectorAll<HTMLElement>('[data-say-aria]')) e.setAttribute('aria-label', t(e.dataset['sayAria'] ?? ''));
}
