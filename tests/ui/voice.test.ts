/**
 * One voice at a time (M8.5 slice 2, docs/DESIGN.md §17.3): every event
 * speaks in one place with one text, the combo's tricks never pop, two pops
 * at most, the flavour lines speak nowhere, and nothing speaks at the top
 * over the wall or the busted card.
 */
import { describe, expect, it } from 'vitest';
import { PALETTE, RIVALS, packDescriptor, type EventKind } from '../../src/sim';
import { screenTaken } from '../../src/ui/corners';
import { arrangeTop, topBit } from '../../src/ui/lanes';
import { POP_SECONDS, POP_SLOTS, Pops, WHERE, newSaid, speak, type VoiceContext } from '../../src/ui/voice';

const CTX: VoiceContext = { jumps: 4, jumpsTotal: 20, boards: 13, boardsTotal: 50, cachesTotal: 30, cameraLimits: [50, 80] };
const SUSPECT = packDescriptor('muscle', PALETTE.carRed);

describe('one voice', () => {
  it('M8.5 2.1 every event speaks in its one place with one text; the combo\'s tricks never pop; the stars lead their news', () => {
    const kinds = Object.keys(WHERE) as EventKind[];
    expect(kinds.length).toBeGreaterThan(40);
    const out = newSaid();
    for (const kind of kinds) {
      const target = kind === 'rivalReady' ? 0 : kind === 'twinSwap' || kind === 'dispatch' ? SUSPECT : 1;
      for (const value of [0, 1, 3, 1200]) {
        speak(kind, value, target, CTX, out);
        // the table's place, or nowhere when there is nothing to say (the radio's unit down)
        expect([WHERE[kind], 'none']).toContain(out.where);
        if (out.where !== 'none') expect(out.text).not.toBe('');
        if (out.where === 'top') expect(out.lead).not.toBe('');
      }
    }
    for (const trick of ['nearMiss', 'nearMissOncoming', 'oncoming', 'smash'] as const) expect(WHERE[trick]).toBe('none');
    const news = speak('heatLevel', 3, -1, CTX, out);
    expect(news.lead).toBe('★★★');
    expect(`${news.lead} ${news.text}`).not.toMatch(/LEVEL|HEAT/);
    expect(speak('billboard', 0, 7, CTX, out).text).toBe('BILLBOARD 13/50');
    expect(speak('hunt', 0, 0, CTX, out).text).toBe('NEW JUMP 4/20');
    expect(speak('skill', 2100, 4, CTX, out).text).toBe('COMBO +2,100');
    expect(speak('rivalReady', 0, 0, CTX, out).text).toContain(RIVALS[0]!.name);
  });

  it('M8.5 2.2 two pops at most: a burst of five leaves the newest two, and they go out after their time', () => {
    const pops = new Pops();
    expect(POP_SLOTS).toBe(2);
    for (const t of ['A', 'B', 'C', 'D', 'E']) pops.push(t);
    expect(pops.live()).toEqual(['E', 'D']);
    expect(pops.step(POP_SECONDS / 2)).toBe(0);
    expect(pops.live()).toEqual(['E', 'D']);
    expect(pops.step(POP_SECONDS)).toBe(0b11);
    expect(pops.live()).toEqual([]);
    pops.push('F');
    expect(pops.clear()).not.toBe(0);
    expect(pops.live()).toEqual([]);
  });

  it('M8.5 2.3 the flavour lines speak nowhere; over the wall and the busted card the top shows no news and no hints', () => {
    const out = newSaid();
    for (const kind of ['rivalSeen', 'rivalBeaten', 'damageNews', 'nearMissPed', 'swap'] as const) {
      expect(speak(kind, 50000, 1, CTX, out).where).toBe('none');
    }
    // the radio: a unit down is flavour; the roadblock, the suspect's car and the helicopter speak
    expect(speak('dispatch', 2, -1, CTX, out).where).toBe('none');
    expect(speak('dispatch', 1, -1, CTX, out).text).toBe('ROADBLOCK AHEAD');
    expect(speak('dispatch', 3, SUSPECT, CTX, out).text).toMatch(/^SUSPECT IN A /);
    expect(speak('dispatch', 4, -1, CTX, out).text).toBe('HELICOPTER ON YOU');
    const all = topBit('jobLine') | topBit('card') | topBit('caption') | topBit('hints') | topBit('news');
    for (const run of ['busted', 'door'] as const) {
      expect(screenTaken(run)).toBe(true);
      const shown = arrangeTop(all, screenTaken(run));
      expect(shown & (topBit('hints') | topBit('news'))).toBe(0);
    }
    for (const run of ['running', 'closing'] as const) expect(screenTaken(run)).toBe(false);
  });
});
