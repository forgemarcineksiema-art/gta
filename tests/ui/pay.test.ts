/**
 * M8.9 slice 0 (docs/M8.9_PLAN.md R7, R12): the label over the nearest open sign is placed from its first show (it sat
 * in the screen's top-left corner since M8.7: its first point was compared with NaN) and names the kind with the pay;
 * a sign grown past a share of the screen folds away, so the camera never enters one; the pause's veil is the top layer.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RIVALS, type JobKind } from '../../src/sim';
import { SIGN_FOLD, signFold, signShare } from '../../src/render/run/signs';
import { moved, payKindKey } from '../../src/ui/hud/pay';
import { PL } from '../../src/ui/pl';

const KINDS: readonly JobKind[] = ['delivery', 'order', 'escape', 'trial', 'race', 'rage', 'mayhem', 'fare', 'duel'];

describe('M8.9 slice 0: the pay label, the sign in the camera, the pause', () => {
  it('M8.9 0.1 the label moves from its first, unplaced point, and not for half a pixel', () => {
    expect(moved(NaN, NaN, 0, 0)).toBe(true);
    expect(moved(NaN, NaN, 640, 360)).toBe(true);
    expect(moved(640, 360, 640.4, 360.4)).toBe(false);
    expect(moved(640, 360, 641, 360)).toBe(true);
    expect(moved(640, 360, 640, 359)).toBe(true);
  });

  it('M8.9 0.2 the label names every kind in both languages (a rival by its name)', () => {
    for (const kind of KINDS) {
      if (kind === 'duel') continue;
      const key = payKindKey({ kind, level: 0 });
      expect(key.length, kind).toBeGreaterThan(0);
      expect(PL[key], `${kind}: ${key}`).toBeTruthy();
    }
    for (let level = 0; level < RIVALS.length; level++) {
      const key = payKindKey({ kind: 'duel', level });
      expect(key).toBe(RIVALS[level]?.name);
      expect(PL[key], key).toBeTruthy();
    }
  });

  it('M8.9 0.3 a sign folds above 15 % of the screen\'s height and is gone at 20 %', () => {
    expect(signFold(0)).toBe(1);
    expect(signFold(SIGN_FOLD.from)).toBe(1);
    expect(signFold(0.175)).toBeCloseTo(0.5, 6);
    expect(signFold(SIGN_FOLD.to)).toBe(0);
    expect(signFold(1)).toBe(0);
    // the face (1.52 m) at the camera's 60°: whole from 8.8 m, folding to 6.6 m, gone nearer; behind the camera, whole
    const fov = Math.PI / 3, face = 1.52;
    expect(signFold(signShare(face, 9, fov))).toBe(1);
    const mid = signFold(signShare(face, 7.5, fov));
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    expect(signFold(signShare(face, 6, fov))).toBe(0);
    expect(signShare(face, -3, fov)).toBe(0);
    expect(signFold(signShare(face, -3, fov))).toBe(1);
  });

  it('M8.9 0.4 the pause\'s veil is the top layer: fixed, over the full map, the dev panel and the loading, under the ad', () => {
    const css = readFileSync('src/ui/styles.css', 'utf8');
    const z = (selector: string): number => {
      const at = css.indexOf(`\n${selector} {`);
      expect(at, selector).toBeGreaterThanOrEqual(0);
      const block = css.slice(at, css.indexOf('}', at));
      const m = /z-index:\s*(\d+)/.exec(block);
      expect(m, `${selector} has a z-index`).not.toBeNull();
      return Number(m?.[1]);
    };
    const pause = css.slice(css.indexOf('\n.hud__pause {'), css.indexOf('}', css.indexOf('\n.hud__pause {')));
    expect(pause).toContain('position: fixed');
    expect(z('.hud__pause')).toBeGreaterThan(z('.bigmap'));
    expect(z('.hud__pause')).toBeGreaterThan(z('.devpanel'));
    expect(z('.hud__pause')).toBeGreaterThan(z('.loading'));
    expect(z('.hud__pause')).toBeLessThan(z('.fake-ad'));
    // the HUD mounts it on the UI's root, a sibling of the run's layer, not inside its own layer
    const hud = readFileSync('src/ui/hud/hud.ts', 'utf8');
    expect(hud).toContain('parent.appendChild(this.pause)');
  });
});
