/**
 * One colour, one meaning (docs/M8.9_PLAN.md R1, slice 5): money yellow, the way cyan, trouble red, the police blue,
 * everything else ink, closed grey. The CSS names them once in `:root`, equal to `sim/palette.ts` SIGNALS; no rule has
 * a hue of its own (the dev panel and the fake ad excepted); cyan is the way's alone; each reads against its outline.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIGNALS } from '../../src/sim/palette';
import { SIGN_COLORS } from '../../src/render/run/signs';
import * as Colors from '../../src/ui/colors';
import * as Minimap from '../../src/ui/map/minimap';

const CSS = readFileSync('src/ui/styles.css', 'utf8');
const ROOT = /:root \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? '';
const REST = CSS.replace(/:root \{[\s\S]*?\n\}/, '');

/** The rules of the stylesheet outside `:root`, with their selectors (comments dropped, @-blocks opened). */
function rules(css: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(clean); m; m = re.exec(clean)) out.push({ selector: (m[1] ?? '').trim().replace(/\s+/g, ' '), body: m[2] ?? '' });
  return out;
}

/** A colour literal's channels, or null. */
function channels(lit: string): [number, number, number] | null {
  let m = /^#([0-9a-f]{6})$/i.exec(lit);
  if (m) { const v = parseInt(m[1] as string, 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  m = /^#([0-9a-f]{3})$/i.exec(lit);
  if (m) { const s = m[1] as string; return [0, 1, 2].map((i) => parseInt((s[i] as string) + (s[i] as string), 16)) as [number, number, number]; }
  m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(lit);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

const EXCEPT = /^(\.devpanel|\.fake-ad|\.hud__debug)/;

function lum(c: number): number {
  const ch = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch((c >> 16) & 255) + 0.7152 * ch((c >> 8) & 255) + 0.0722 * ch(c & 255);
}

describe('one colour, one meaning (M8.9 slice 5)', () => {
  it('M8.9 5.1 no rule outside :root has a hue of its own (greys and black shadows allowed; dev panel and fake ad excepted)', () => {
    const found: string[] = [];
    for (const { selector, body } of rules(REST)) {
      if (EXCEPT.test(selector)) continue;
      for (const lit of body.match(/#[0-9a-fA-F]{3,6}\b|rgba?\([^)]*\)/g) ?? []) {
        const c = channels(lit);
        if (c && Math.max(...c) - Math.min(...c) > 16) found.push(`${selector}: ${lit}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('M8.9 5.2 the maps and the signs take the signals', () => {
    expect(Minimap.ROUTE).toBe(Colors.WAY);
    expect(Minimap.CACHE_COLOR).toBe(Colors.MONEY);
    expect(Minimap.UNIT_LIT).toBe(Colors.POLICE);
    expect(Minimap.RIVAL).toBe(Colors.TROUBLE);
    expect(Minimap.CLOSED).toBe(Colors.OFF);
    expect(Minimap.INK).toBe(Colors.INK);
    expect(SIGN_COLORS[1]?.rim).toBe(SIGNALS.way);
    expect(SIGN_COLORS[0]?.face).toBe(SIGNALS.ink);
    expect(SIGN_COLORS[2]?.face).toBe(SIGNALS.off);
    // no yellow on the maps but money
    expect(Object.values(Minimap).filter((v) => typeof v === 'string' && v.toLowerCase() === Colors.MONEY)).toEqual([Colors.MONEY]);
  });

  it('M8.9 5.3 the CSS tokens equal the signals', () => {
    const token = (name: string): string => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(ROOT)?.[1]?.toLowerCase() ?? '';
    expect(token('money')).toBe(Colors.MONEY);
    expect(token('way')).toBe(Colors.WAY);
    expect(token('trouble')).toBe(Colors.TROUBLE);
    expect(token('police')).toBe(Colors.POLICE);
    expect(token('ink')).toBe(Colors.INK);
    expect(token('off')).toBe(Colors.OFF);
    expect(token('outline')).toBe(Colors.OUTLINE);
  });

  it('M8.9 5.4 each signal reads at 4.5:1 or more against the outline', () => {
    for (const [name, c] of Object.entries(SIGNALS)) {
      if (name === 'outline') continue;
      const ratio = (lum(c) + 0.05) / (lum(SIGNALS.outline) + 0.05);
      expect(ratio, name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('M8.9 5.5 cyan is the way\'s alone: the route, the goal\'s badge and card, the swap prompt', () => {
    const allowed = new Set(['.hud__swap-label', '.cold__caption--swap .cold__word', '.jobs__card', '.jobs__badge-rim', '.devpanel__section']);
    const users = rules(REST).filter((r) => r.body.includes('var(--way)')).map((r) => r.selector);
    for (const s of users) expect(allowed.has(s), s).toBe(true);
    expect(users.length).toBeGreaterThanOrEqual(4);
  });
});
