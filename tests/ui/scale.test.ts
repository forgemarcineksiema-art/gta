/**
 * The HUD's one scale (docs/M8.9_PLAN.md R3, slice 7): the screen's sizes in rem, the root at 16 px × the height over
 * 720 held to 0.85–1.5; no text in pixels and none under 1 rem (13.6 px at 800×450); the radar in the same scale.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HUD_SCALE, hudScale, rootFontPx } from '../../src/ui/scale';

const CSS = readFileSync('src/ui/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const EXEMPT = /^(\.devpanel|\.fake-ad|\.hud__debug)/;

function rules(): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(CSS); m; m = re.exec(CSS)) out.push({ selector: (m[1] ?? '').trim().replace(/\s+/g, ' '), body: m[2] ?? '' });
  return out;
}

describe('the HUD\'s one scale (M8.9 slice 7)', () => {
  it('M8.9 7.1 the scale is the height over 720, held to 0.85–1.5', () => {
    expect(hudScale(450)).toBe(HUD_SCALE.min);
    expect(hudScale(720)).toBe(1);
    expect(hudScale(1080)).toBe(HUD_SCALE.max);
    expect(hudScale(2160)).toBe(HUD_SCALE.max);
    expect(hudScale(864)).toBeCloseTo(1.2, 6);
    expect(rootFontPx(450)).toBeCloseTo(13.6, 6);
  });

  it('M8.9 7.2 no text size in pixels on the screen, and none under 1 rem (13.6 px at 800×450)', () => {
    const bad: string[] = [];
    for (const { selector, body } of rules()) {
      if (EXEMPT.test(selector) || selector.includes(':root')) continue;
      for (const decl of body.split(';')) {
        const [prop, value] = decl.split(':').map((s) => s?.trim() ?? '');
        if (prop !== 'font-size' && prop !== 'font') continue;
        if (/\d+px/.test(value ?? '')) bad.push(`${selector}: ${decl.trim()}`);
        for (const m of (value ?? '').matchAll(/(\d*\.?\d+)rem/g)) if (Number(m[1]) < 1) bad.push(`${selector}: ${decl.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('M8.9 7.3 the radar is sized in the same scale', () => {
    expect(/--minimap-size:\s*[\d.]+rem;/.test(CSS)).toBe(true);
    // no size of the screen's own is tied to the height any more (the root's size is): no clamp by vh
    const byHeight = rules().filter((r) => !EXEMPT.test(r.selector) && /clamp\([^)]*vh/.test(r.body)).map((r) => r.selector);
    expect(byHeight).toEqual([]);
  });
});
