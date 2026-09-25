/**
 * A voice per engine (M8.8 slice 8): every body has one, a class's civilian bodies share its voice unless the table
 * names their own, and the ear tells the classes apart by the note and the timbre. The sound itself is Marcin's ear,
 * not a pin.
 */
import { describe, expect, it } from 'vitest';
import { CLASS_VOICES, OWN_VOICES, voiceOf } from '../../src/audio/voices';
import { BODY_IDS, bodySpec } from '../../src/sim/traffic/bodies';

describe('a voice per engine', () => {
  it('M8.8 8.1 every body has a voice, each one playable', () => {
    for (const body of BODY_IDS) {
      const v = voiceOf(body);
      expect(v, body).toBeDefined();
      expect(v.pulses, body).toBeGreaterThan(0);
      for (const level of [v.saw, v.square, v.sub, v.rattle]) {
        expect(level, body).toBeGreaterThanOrEqual(0);
        expect(level, body).toBeLessThanOrEqual(0.5);
      }
      expect(v.saw + v.square + v.sub, body).toBeGreaterThan(0.3);
      expect(v.floor, body).toBeGreaterThan(100);
      expect(v.floor + v.open, body).toBeLessThan(6000);
      expect(v.level, body).toBeGreaterThan(0.5);
      expect(v.level, body).toBeLessThanOrEqual(1.2);
    }
  });

  it('M8.8 8.2 a class\'s civilian bodies share its voice unless the table names their own', () => {
    for (const body of BODY_IDS) {
      if (OWN_VOICES[body]) continue;
      expect(voiceOf(body), body).toBe(CLASS_VOICES[bodySpec(body).car]);
    }
    // the V8's four pulses, the six's three, the four's and the diesel's two, the two-stroke's one
    expect(voiceOf('muscle').pulses).toBe(4);
    expect(voiceOf('police')).toBe(voiceOf('muscle'));
    expect(voiceOf('sports').pulses).toBe(3);
    expect(voiceOf('compact').pulses).toBe(2);
    expect(voiceOf('bus')).toBe(voiceOf('heavy'));
    expect(voiceOf('heavy').rattle).toBeGreaterThan(0);
    expect(voiceOf('bubble').pulses).toBe(1);
    expect(voiceOf('bubble')).not.toBe(voiceOf('compact'));
  });
});
