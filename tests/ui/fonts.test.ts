/**
 * One typeface, two styles (docs/M8.9_PLAN.md R2, slice 6): Rubik in three faces cut to the game's characters, every
 * character the screen can say inside the cut (the ★ is drawn, never a glyph), no text skewed (the plates and the bars
 * keep their −8°), the two styles the only rules that set a text, and the faces small.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { FONT_FACES, FONT_RANGES, FONT_STACK, inRanges, unicodeRange } from '../../src/ui/fonts';
import { fixed, num, setLang } from '../../src/ui/lang';
import { PL, PL_BEST, PL_ONLY_IT, PL_PAINT } from '../../src/ui/pl';

const ROOT = new URL('../../', import.meta.url);
const read = (file: string): string => readFileSync(new URL(file, ROOT), 'utf8');
const CSS = read('src/ui/styles.css');

/** The stylesheet's rules with their selectors (comments dropped, @-blocks opened). */
function rules(css: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(clean); m; m = re.exec(clean)) out.push({ selector: (m[1] ?? '').trim().replace(/\s+/g, ' '), body: m[2] ?? '' });
  return out;
}

/** The developer's tools and the platform's stand-in ad keep their own type. */
const EXCEPT = /^(\.devpanel|\.fake-ad|\.hud__debug)/;

afterEach(() => setLang('en'));

describe('one typeface, two styles (M8.9 slice 6)', () => {
  it('M8.9 6.1 every character the screen can say is in the subsets’ ranges, or is the drawn ★', () => {
    const said = new Set<string>();
    const add = (s: string): void => { for (const ch of s) said.add(ch); };
    // the Polish table's keys (the English the code writes) and its values, the forms that agree with a car
    for (const [k, v] of Object.entries(PL)) { add(k); add(v); }
    for (const forms of Object.values(PL_BEST)) forms.forEach(add);
    for (const forms of Object.values(PL_PAINT)) forms.forEach(add);
    PL_ONLY_IT.forEach(add);
    // the numbers' separators in both languages
    for (const l of ['pl', 'en'] as const) {
      setLang(l);
      add(num(-1234567.125));
      add(fixed(12.5, 1));
    }
    // the stylesheet's own words, the loading screen's, and every literal of the screen's code (a keycap, a step's ‹ ›)
    for (const m of CSS.matchAll(/content:\s*'([^']*)'/g)) add(m[1] ?? '');
    add(read('index.html'));
    const files = readdirSync(new URL('src/ui/', ROOT), { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      const code = read(`src/ui/${f.replaceAll('\\', '/')}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
      for (const m of code.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
        add(m[0].slice(1, -1).replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))));
      }
    }
    const outside = [...said].filter((ch) => (ch.codePointAt(0) ?? 0) >= 0x20 && ch !== '★' && !inRanges(ch.codePointAt(0) ?? 0));
    expect(outside.map((ch) => `U+${(ch.codePointAt(0) ?? 0).toString(16)} ${ch}`)).toEqual([]);
    // the Polish letters, the no-break space Polish groups with, the dashes, the ellipsis: all in
    for (const ch of 'ĄĆĘŁŃÓŚŹŻąćęłńóśźż –—…×·') expect(inRanges(ch.codePointAt(0) ?? 0), ch).toBe(true);
    expect(unicodeRange().split(', ')).toHaveLength(FONT_RANGES.length);
  });

  it('M8.9 6.2 no text is skewed (only the plates and the bars), and the two styles are the only rules that set a text', () => {
    const all = rules(CSS);
    // the skew: the plates under the job card, the tabs and DRIVE OUT, and the combo's bar
    const skewed = all.filter((r) => /skew/.test(r.body)).map((r) => r.selector);
    for (const s of skewed) for (const part of s.split(',')) expect(part.trim(), s).toMatch(/(::before|__skill-track)$/);
    expect(skewed.length).toBeGreaterThanOrEqual(3);
    // the type: only the label's rule and the display's say weight, slant, tracking, figures, family or outline
    const TYPE = /(^|;|\n)\s*(font-weight|font-style|letter-spacing|font-variant-numeric|font-family|font)\s*:\s*([^;]+)|(^|;|\n)\s*text-shadow\s*:\s*([^;]+)/g;
    const label = all.find((r) => r.selector.startsWith('#ui,'));
    const display = all.find((r) => r.selector.startsWith('.loading,'));
    expect(label && display).toBeTruthy();
    const offenders: string[] = [];
    for (const r of all) {
      if (r === label || r === display || EXCEPT.test(r.selector)) continue;
      for (const m of r.body.matchAll(TYPE)) {
        const value = (m[3] ?? m[5] ?? '').trim();
        // a button's reset takes the screen's; a plate's words need no outline
        if (value === 'inherit' || (m[5] !== undefined && value === 'none')) continue;
        offenders.push(`${r.selector}: ${m[0].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
    // the two: the label Bold upright tracked 0.06 em with its 1.5 px ring; the display Black Italic with its ring and
    // its flat shadow; both Rubik, both in tabular figures
    const decl = (body: string, prop: string): string => new RegExp(`(?:^|;|\\n)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body)?.[1]?.trim() ?? '';
    expect([decl(label!.body, 'font-weight'), decl(label!.body, 'font-style'), decl(label!.body, 'letter-spacing')]).toEqual(['700', 'normal', '0.06em']);
    expect([decl(display!.body, 'font-weight'), decl(display!.body, 'font-style')]).toEqual(['900', 'italic']);
    for (const r of [label!, display!]) {
      expect(decl(r.body, 'font-family')).toBe('var(--font)');
      expect(decl(r.body, 'font-variant-numeric')).toBe('tabular-nums');
    }
    expect(decl(label!.body, 'text-shadow')).toBe('var(--label-outline)');
    expect(decl(display!.body, 'text-shadow')).toBe('var(--display-outline), var(--display-shadow)');
    // the CSS's family is the maps' (ui/fonts.ts)
    expect(/--font:\s*([^;]+);/.exec(CSS)?.[1]?.trim()).toBe(FONT_STACK);
  });

  it('M8.9 6.3 the faces are 80 KB or less, all beside the page, the display face preloaded by a relative path', () => {
    let bytes = 0;
    for (const f of FONT_FACES) bytes += statSync(new URL(`public/fonts/${f.file}`, ROOT)).size;
    expect(bytes).toBeLessThanOrEqual(80 * 1024);
    expect(statSync(new URL('public/fonts/OFL.txt', ROOT)).size).toBeGreaterThan(0);
    const display = FONT_FACES.find((f) => f.weight === '900' && f.style === 'italic');
    const html = read('index.html');
    expect(html).toContain(`<link rel="preload" as="font" type="font/woff2" crossorigin href="./fonts/${display?.file ?? ''}" />`);
    expect(read('docs/ASSETS.md')).toMatch(/Rubik/);
  });
});
