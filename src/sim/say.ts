/**
 * The screen's words with holes (docs/DESIGN.md §19: the game speaks Polish by default, English beside it). The code
 * writes every text in English; a text with holes is a template: `{name}` is filled from the holes (a number grouped
 * the language's way), `{name|one|other}` picks a count's form by the number in `name` (Polish has three:
 * `{n|one|few|many}`). The sim's text tables say theirs through a `Say`: `english` here, the UI's own (`ui/lang.ts`)
 * to put them in the player's language. The sim never knows which.
 */
export type Holes = Readonly<Record<string, string | number>>;

/** A text in the player's language: the English template is the key. */
export type Say = (text: string, holes?: Holes) => string;

const HOLE = /\{(\w+)(?:\|([^}]*))?\}/g;

/** The holes filled: a number through `num`, a count's form by `form` (the last form when the list is shorter). */
export function fill(text: string, holes: Holes | undefined, num: (v: number) => string, form: (n: number) => number): string {
  if (!holes || !text.includes('{')) return text;
  return text.replace(HOLE, (_all, name: string, forms: string | undefined) => {
    const v = holes[name];
    if (forms !== undefined) {
      const list = forms.split('|');
      return list[Math.min(form(Number(v)), list.length - 1)] ?? '';
    }
    return typeof v === 'number' ? num(v) : v ?? '';
  });
}

const EN_NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

/** 12,400 and 2.6: a number as the English screen writes it. */
export function englishNumber(v: number): string {
  return EN_NUMBER.format(v);
}

/** English counts: one, and the rest. */
export function englishForm(n: number): number {
  return n === 1 ? 0 : 1;
}

export const english: Say = (text, holes) => fill(text, holes, englishNumber, englishForm);
