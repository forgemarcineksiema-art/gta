/**
 * The game in Polish (docs/DESIGN.md §19, Marcin 2026-09-24): every word the
 * screen can say has its Polish, a Polish text keeps its English key's holes,
 * counts take Polish's three forms, numbers group the Polish way, a paint
 * agrees with its car, one name for each thing holds in Polish too, and the
 * language is the parameter's, else the player's pick, else Polish. The module
 * starts in English (the code's own words, which every other pin reads) and
 * each Polish case puts it back.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BODY_WORDS, CHAIN_STEPS, DISTRICTS, KIT, MEDAL_WORDS, PLACE_WORDS, PROP_TYPES, RIVALS, TRICK_WORDS, english, reqText, resolveLang,
  type Holes, type ReqKind,
} from '../../src/sim';
import { DAILY_TEMPLATES } from '../../src/sim/dailies/Dailies';
import { PAINT_NAMES } from '../../src/sim/jobs/catalog';
import { fixed, num, paintedCar, polishForm, setLang, t } from '../../src/ui/lang';
import { PL, PL_GENDER, PL_PAINT } from '../../src/ui/pl';
import { countsLine, doorLines } from '../../src/ui/hud/totals';
import { newSaid, speak } from '../../src/ui/hud/voice';

const ROOT = new URL('../../', import.meta.url);
const read = (file: string): string => readFileSync(new URL(file, ROOT), 'utf8');
/** The screen's code: the UI but the dictionary itself and the developer's tools, and the app's words. */
const UI = readdirSync(new URL('src/ui/', ROOT), { recursive: true, encoding: 'utf8' }).map((f) => f.replaceAll('\\', '/')).filter((f) => f.endsWith('.ts') && !['pl.ts', 'lang.ts', 'dev/debugPanel.ts', 'dev/telemetryGraph.ts'].includes(f)).map((f) => `src/ui/${f}`);
const CODE = [...UI, 'src/app/App.ts', 'src/app/bootWatch.ts', 'src/main.ts', 'src/sim/board/rivals.ts', 'src/sim/dailies/Dailies.ts'];
const LITERAL = String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")`;
const NBSP = String.fromCharCode(0xa0);

function unquote(literal: string): string {
  return literal.slice(1, -1).replace(/\\(['"\\])/g, '$1');
}

function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/** The keys the code says: the first literal of `t(…)` and `say(…)`, the literal key of `label(…)` and `labelAria(…)`. */
function saidKeys(source: string): string[] {
  const code = strip(source);
  const keys: string[] = [];
  for (const m of code.matchAll(new RegExp(String.raw`\b(?:t|say)\(\s*${LITERAL}`, 'g'))) keys.push(unquote(m[1] as string));
  for (const m of code.matchAll(new RegExp(String.raw`\blabel(?:Aria)?\((?:[^()]|\([^()]*\))*?,\s*${LITERAL}\s*\)`, 'g'))) keys.push(unquote(m[1] as string));
  return keys;
}

/** The upper-case literals of a source (the words test's reading of the screen), `${…}` holes blanked. */
function upperLiterals(source: string): string[] {
  const out: string[] = [];
  for (const m of strip(source).matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
    const text = m[0].slice(1, -1).replace(/\$\{[^}]*\}/g, ' ');
    if (/[a-z]/.test(text) || !/[A-Z]{2,}/.test(text)) continue;
    out.push(text);
  }
  return out;
}

/** A key with nothing to translate (only holes, digits and marks) needs no entry: it is said as written. */
function wordy(key: string): boolean {
  return /\p{L}/u.test(key.replace(/\{[^}]*\}/g, ''));
}

function holes(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)[|}]/g)].map((m) => m[1] as string))].sort();
}

/** The sim's tables the screen names things from. */
function tableWords(): string[] {
  const words: string[] = [];
  for (const r of RIVALS) words.push(r.name, r.line, r.call);
  words.push(...Object.values(BODY_WORDS), ...MEDAL_WORDS, ...PLACE_WORDS, ...KIT.map((k) => k.name), ...Object.values(PROP_TYPES).map((p) => p.name));
  words.push(...TRICK_WORDS, ...DISTRICTS.flatMap((d) => [d.name, d.landmark]), ...CHAIN_STEPS, ...DAILY_TEMPLATES.map((d) => d.text));
  return words.filter((w) => w !== '');
}

/** Every key `reqText` says, for every requirement on the board and each kind at one and at two. */
function requirementKeys(): string[] {
  const keys: string[] = [];
  const record = (text: string, h?: Holes): string => { keys.push(text); return english(text, h); };
  const kinds: ReqKind[] = ['chain', 'raceWins', 'medal', 'escape', 'takedowns', 'zoneWins', 'fares', 'orders', 'carsOwned', 'jumps', 'bestRun', 'billboards', 'hotFares', 'caches', 'board', 'smashed'];
  for (const r of RIVALS) for (const q of r.reqs) reqText(q, record);
  for (const kind of kinds) for (const count of [1, 2]) reqText({ kind, count, level: 2 }, record);
  return keys;
}

afterEach(() => setLang('en'));

describe('the game in Polish', () => {
  it('PL 1 every word the screen can say has its Polish: the code\'s keys, its upper-case literals, the sim\'s tables, the requirements', () => {
    const missing = new Set<string>();
    let said = 0;
    for (const file of CODE) {
      const source = read(file);
      for (const key of saidKeys(source)) {
        said++;
        if (wordy(key) && !(key in PL)) missing.add(`${file}: ${key}`);
      }
      if (!file.startsWith('src/sim/')) for (const text of upperLiterals(source)) if (wordy(text) && !(text in PL)) missing.add(`${file}: '${text}'`);
    }
    for (const w of [...tableWords(), ...requirementKeys()]) if (wordy(w) && !(w in PL)) missing.add(`table: ${w}`);
    // the reading finds the screen, not nothing
    expect(said).toBeGreaterThan(180);
    expect([...missing]).toEqual([]);
    // the keycap the keyboard names in words
    expect(PL['SPACE']).toBe('SPACJA');
  });

  it('PL 2 a Polish text keeps its key\'s holes, no more and no fewer', () => {
    const wrong = Object.entries(PL).filter(([key, value]) => holes(key).join() !== holes(value).join()).map(([key]) => key);
    expect(wrong).toEqual([]);
  });

  it('PL 3 counts take Polish\'s three forms, numbers group the Polish way, decimals take a comma', () => {
    expect([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 104, 112].map(polishForm)).toEqual([2, 0, 1, 1, 2, 2, 2, 2, 2, 1, 2, 1, 2]);
    setLang('pl');
    expect([1, 2, 5, 22].map((n) => t('{n} TAKEDOWNS', { n }))).toEqual(['1 ELIMINACJA', '2 ELIMINACJE', '5 ELIMINACJI', '22 ELIMINACJE']);
    expect(t('WIN {n} STREET RACES', { n: 3 })).toBe('WYGRAJ 3 WYŚCIGI ULICZNE');
    expect([num(84_500), num(4_000), num(2.6), fixed(1.5, 1)]).toEqual([`84${NBSP}500`, '4000', '2,6', '1,5']);
    expect(t('BANK {n} IN ONE RUN', { n: 40_000 })).toBe(`WPŁAĆ 40${NBSP}000 W JEDNYM WYPADZIE`);
    setLang('en');
    expect([t('{n} TAKEDOWNS', { n: 5 }), num(84_500), fixed(1.5, 1), t('{n} {n|COIN|COINS}', { n: 1 })]).toEqual(['5 TAKEDOWNS', '84,500', '1.5', '1 COIN']);
  });

  it('PL 4 one name for each thing in Polish: BANK, ŁUP, the stars, GARAŻ, GLINY, KOMBO; no word the glossary retired', () => {
    expect([PL['BANK'], PL['BAG {cash}'], PL['GARAGE'], PL['COPS'], PL['POLICE CAR'], PL['COMBO +{cash}'], PL['BAG BONUS']])
      .toEqual(['BANK', 'ŁUP {cash}', 'GARAŻ', 'GLINY', 'RADIOWÓZ', 'KOMBO +{cash}', 'PREMIA DO ŁUPU']);
    expect([PL['TAKEDOWN!'], PL['BUSTED'], PL['BOOST'], PL['FOR THE NEXT RUN'], PL['TAKE A JOB']]).toEqual(['ELIMINACJA!', 'WPADKA', 'NITRO', 'NA NASTĘPNY WYPAD', 'WEŹ ZLECENIE']);
    // cash, the bag's other names, the multiplier, a level for the stars, a hideout or a door, units, a chain, the fence, a booster
    const NEVER = /^(GOTÓWK|KAS[AYĘ]$|FORS|TORB|WOREK|WORK|MNOŻNIK|POZIOM|KRYJÓWK|DRZWI|JEDNOSTK|ŁAŃCUCH|PASER|DOPALACZ|TAKEDOWN|ZŁAPAN|ARESZT)/u;
    const found = Object.values(PL).flatMap((v) => v.toUpperCase().split(/[^\p{L}]+/u).filter((w) => NEVER.test(w)).map((w) => `${w} in '${v}'`));
    expect(found).toEqual([]);
  });

  it('PL 5 a paint agrees with its car: every car has a gender, every paint three forms', () => {
    for (const car of Object.values(BODY_WORDS)) expect(PL_GENDER[car], car).toBeDefined();
    for (const [, paint] of PAINT_NAMES) expect(PL_PAINT[paint], paint).toBeDefined();
    expect(PL_PAINT['ODD']).toBeDefined();
    setLang('pl');
    expect([paintedCar('RED', 'SEDAN'), paintedCar('RED', 'TAXI'), paintedCar('CYAN', 'ESTATE')]).toEqual(['CZERWONY SEDAN', 'CZERWONA TAKSÓWKA', 'BŁĘKITNE KOMBI']);
    expect(t('SUSPECT IN A {car}', { car: paintedCar('LIME', 'GOLD LIMO') })).toBe('PODEJRZANY: LIMONKOWA ZŁOTA LIMUZYNA');
    setLang('en');
    expect(paintedCar('RED', 'TAXI')).toBe('RED TAXI');
  });

  it('PL 6 the language: the parameter, else the player\'s pick, else Polish', () => {
    expect(resolveLang(null, '')).toBe('pl');
    expect(resolveLang('en', '')).toBe('en');
    expect(resolveLang(null, 'en')).toBe('en');
    expect(resolveLang('pl', 'en')).toBe('pl');
    expect(resolveLang('klingon', 'en')).toBe('en');
  });

  it('PL 7 the screen in Polish: a pop, the sums at the door, the run\'s counts', () => {
    setLang('pl');
    const ctx = { jumps: 4, jumpsTotal: 20, boards: 13, boardsTotal: 50, cachesTotal: 30, cameraLimits: [50, 80] };
    expect(speak('skill', 21_000, 4, ctx, newSaid()).text).toBe(`KOMBO +21${NBSP}000`);
    expect(speak('billboard', 0, 7, ctx, newSaid()).text).toBe('BILLBOARD 13/50');
    expect(doorLines({ lastBag: 32_500, lastMultiplier: 2.6, lastBanked: 84_500, lastDoubled: false, lastFence: false }))
      .toEqual([{ label: `ŁUP 32${NBSP}500 ×2,6`, value: `+84${NBSP}500`, strong: true }]);
    const counts = countsLine({ takedowns: 3, escapes: 1, billboards: 5, coins: 22, smashes: 12, damage: 12_300 });
    expect(counts.split(NBSP).join(' ')).toBe('3 ELIMINACJE · 1 UCIECZKA · 5 BILLBOARDÓW · 22 MONETY · SZKODY W MIEŚCIE 12 300');
  });
});
