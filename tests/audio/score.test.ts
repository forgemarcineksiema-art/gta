/**
 * The game's own music (M7 slice 2, docs/history/M7_PLAN.md D2): the score is whole
 * bars, every note inside the loop; the heat adds the layers two, three,
 * three, four, four and five strong from none to five stars; the stings are
 * busted, the escape and the door; a rendered tail folds back onto the loop's
 * start. The sound itself is Marcin's ear, not a pin.
 */
import { describe, expect, it } from 'vitest';
import { BARS, BEAT, LAYERS, LOOP_SECONDS, STINGS, foldTail, hz, layerGain, noteTime, stingFor } from '../../src/audio/score';

describe('the music', () => {
  it('M7 2.1 every layer is whole bars and every note starts inside the loop, on the sixteenth grid', () => {
    expect(LOOP_SECONDS).toBeCloseTo(BARS * 4 * BEAT, 9);
    for (const layer of LAYERS) {
      expect(layer.notes.length, layer.name).toBeGreaterThan(0);
      for (const note of layer.notes) {
        expect(note.bar).toBeGreaterThanOrEqual(0);
        expect(note.bar).toBeLessThan(BARS);
        expect(note.beat).toBeGreaterThanOrEqual(0);
        expect(note.beat).toBeLessThan(4);
        expect(Math.abs(note.beat * 4 - Math.round(note.beat * 4))).toBeLessThan(1e-9);
        expect(noteTime(note)).toBeLessThan(LOOP_SECONDS);
        expect(note.length).toBeGreaterThan(0);
        expect(note.velocity).toBeGreaterThan(0);
        expect(note.velocity).toBeLessThanOrEqual(1);
      }
    }
    // A minor: every pitched note of the bass, the keys and the lead in A natural minor
    const minor = new Set([9, 11, 0, 2, 4, 5, 7]);
    for (const layer of LAYERS.filter((l) => l.name === 'bass' || l.name === 'keys' || l.name === 'lead')) {
      for (const note of layer.notes) expect(minor.has(note.pitch % 12), `${layer.name} ${note.pitch}`).toBe(true);
    }
    expect(hz(69)).toBeCloseTo(440, 9);
  });

  it('M7 2.2 the heat adds the layers: 2, 3, 3, 4, 4, 5 from none to five stars', () => {
    const counts = [0, 1, 2, 3, 4, 5].map((heat) => LAYERS.reduce((n, l) => n + layerGain(l, heat), 0));
    expect(counts).toEqual([2, 3, 3, 4, 4, 5]);
    // the calm layers are the bass and the keys; the lead waits for three stars, the alarm for five
    expect(LAYERS.filter((l) => layerGain(l, 0) === 1).map((l) => l.name)).toEqual(['bass', 'keys']);
    expect(LAYERS.find((l) => l.name === 'alarm')?.fromHeat).toBe(5);
  });

  it('M7 2.3 busted, an escape and the door play their stings; nothing else does', () => {
    expect(stingFor('busted')).toBe('busted');
    expect(stingFor('escape')).toBe('escape');
    expect(stingFor('banked')).toBe('door');
    for (const kind of ['coin', 'hit', 'swap', 'door', 'jobDone', 'takedown']) expect(stingFor(kind), kind).toBeNull();
    for (const notes of Object.values(STINGS)) {
      expect(notes.length).toBeGreaterThan(2);
      for (const note of notes) expect(noteTime(note) + note.length * BEAT).toBeLessThan(3);
    }
  });

  it('M7 2.4 a tail past the loop folds back onto its start, so the loop joins without a click', () => {
    const loop = 8;
    const samples = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0.25, 0.125]);
    const out = foldTail(samples, loop);
    expect(out.length).toBe(loop);
    expect(Array.from(out)).toEqual([1.5, 1.25, 1.125, 1, 1, 1, 1, 1]);
  });
});
