/**
 * One name for each thing (M8.5 slice 4, docs/DESIGN.md §17.4): no string on
 * the screen says a word the glossary retired. The screen's strings are the
 * upper-case literals of the UI and of the sim's text tables (the dailies, the
 * rivals' requirements, the chain's steps, the jobs' words); a literal with a
 * lower-case letter is code (a class, a key, a path). The props' own names
 * (a smashed FENCE is a fence) are the world's, not the glossary's. The Polish
 * table (`src/ui/pl.ts`, DESIGN.md §19) is not read here: its keys are these
 * same words (a prop's name among them), its values Polish, pinned by
 * tests/ui/lang.test.ts PL 4.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAILY_TEMPLATES } from '../../src/sim/dailies/Dailies';

const ROOT = new URL('../../', import.meta.url);
const UI = readdirSync(new URL('src/ui/', ROOT)).filter((f) => f.endsWith('.ts') && f !== 'pl.ts').map((f) => `src/ui/${f}`);
const TABLES = ['src/sim/dailies/Dailies.ts', 'src/sim/board/rivals.ts', 'src/sim/run/goal.ts', 'src/sim/jobs/catalog.ts'];

/** §17.4's never-words as they would stand on the screen. */
const NEVER: ReadonlyArray<[RegExp, string]> = [
  [/\bCASH\b/, 'BANK'], [/\bFUNDS\b/, 'BANK'], [/\bMULTIPLIER\b/, 'the ×'], [/\bHEAT\b/, 'the stars'], [/\bLEVEL\b/, 'the stars'],
  [/\bDOOR\b/, 'GARAGE'], [/\bHIDEOUT\b/, 'GARAGE'], [/\bDROP-OFF\b/, 'the arrow'], [/\bMARK\b/, 'the arrow'],
  [/\bUNITS?\b/, 'COPS'], [/\bAIR UNIT\b/, 'HELICOPTER'], [/\bSKILL CHAIN\b/, 'COMBO'], [/\bCHAIN\b/, 'COMBO'], [/\bFENCE\b/, 'BAG BONUS'],
];

/** The upper-case literals of a source, comments stripped and `${…}` holes blanked. */
function onScreen(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  const out: string[] = [];
  for (const m of code.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
    const text = m[0].slice(1, -1).replace(/\$\{[^}]*\}/g, ' ');
    if (/[a-z]/.test(text) || !/[A-Z]{2,}/.test(text)) continue;
    out.push(text);
  }
  return out;
}

describe('the words', () => {
  it('M8.5 4.1 no string on the screen says a retired word: CASH, HEAT, LEVEL, DOOR, HIDEOUT, DROP-OFF, UNITS, SKILL CHAIN, FENCE…', () => {
    const found: string[] = [];
    let strings = 0;
    for (const file of [...UI, ...TABLES]) {
      for (const text of onScreen(readFileSync(new URL(file, ROOT), 'utf8'))) {
        strings++;
        for (const [re, instead] of NEVER) if (re.test(text)) found.push(`${file}: '${text}' (say ${instead})`);
      }
    }
    // the scan reads the screen, not nothing
    expect(strings).toBeGreaterThan(150);
    expect(found).toEqual([]);
  });

  it('M8.5 4.2 the dailies changed their words only: the ids, kinds and targets stand', () => {
    expect(DAILY_TEMPLATES.map((d) => [d.id, d.kind, d.target])).toEqual([
      [0, 'banked', 10000], [1, 'banked', 25000], [2, 'banked', 50000], [3, 'escape', 3], [4, 'escape', 5], [5, 'takedown', 3],
      [6, 'billboard', 3], [7, 'jobDone', 1], [8, 'jobDone', 2], [9, 'takedown', 2], [10, 'coin', 150], [11, 'nearMiss', 10],
      [12, 'run', 3], [13, 'smash', 60], [14, 'smash', 10],
    ]);
    expect(DAILY_TEMPLATES.find((d) => d.id === 3)?.text).toBe('ESCAPE FROM ★★★');
  });
});
