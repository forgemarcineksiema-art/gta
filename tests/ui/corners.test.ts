/**
 * The driving screen's corners (M8.5 slice 1, docs/DESIGN.md §17.2): a calm
 * drive shows the stars, the bank, the radar, the speed and the boost (with
 * the goal line, the six: no arrow, DESIGN.md §20); the bag from its first money, its
 * × from the first level that multiplies, the district's name for four
 * seconds, nothing of it behind a shut door or on the busted card; the key
 * hints and the developer's panel only with `?dev=1`. The corners finished
 * (M8.9 slice 8, docs/M8.9_PLAN.md R4): the gauge's arcs, the damage's arc on
 * a hit and from the third stage, the combo's × from ×2, the bag's × from
 * ×1.3 on the HUD and on the wall, the sack, the coin and the flame drawn from
 * the glyphs.
 */
import { describe, expect, it } from 'vitest';
import { GLYPHS, type GlyphId } from '../../src/sim/glyphs';
import {
  DAMAGE_STANDS, DRIVE, HINT_SECONDS, HIT_SECONDS, PLACE_SECONDS, comboMult, devTools, drive, driveNames, hintRow, hintRows, hintsWanted, newDriveState,
  newHitClock, newPlaceClock, tickHit, tickPlace, type DriveState, type KeyHints,
} from '../../src/ui/hud/corners';
import { GAUGE, arcDash, arcPath } from '../../src/ui/hud/gauge';
import { doorLines } from '../../src/ui/hud/totals';
import { setLang } from '../../src/ui/lang';

/** A city drive with nothing happening, long after the last district change. */
function calm(over: Partial<DriveState> = {}): DriveState {
  return { ...newDriveState(), city: true, placeAge: 60, ...over };
}

const KEYS: KeyHints = {
  throttle: 'W', brake: 'S', steerLeft: 'A', steerRight: 'D', handbrake: 'SPACE', boost: 'SHIFT', reset: 'R', pause: 'P',
  camera: 'C', debug: '`', swap: 'E', map: 'TAB', horn: 'H', mute: 'M',
};

describe('the corners', () => {
  it('M8.5 1.1 a calm drive shows exactly the stars, the bank, the radar, the speed and the boost; the test track the car alone', () => {
    expect(driveNames(drive(calm()))).toEqual(['stars', 'bank', 'radar', 'speed', 'boost']);
    // with the goal line (jobs.ts): the six of §17.2 since §20 took the arrow out
    expect(driveNames(drive(calm())).length + 1).toBe(6);
    expect(driveNames(drive(calm({ city: false })))).toEqual(['speed', 'boost']);
    // a hit and a running combo come and go with their moments
    expect(driveNames(drive(calm({ damage: 0.2, hitAge: 0, combo: true })))).toEqual(['stars', 'bank', 'radar', 'speed', 'boost', 'damage', 'combo']);
  });

  it('M8.5 1.2 the bag hides at 0 and shows from its first money; the × hides at ×1 and shows at ×1.3, never without a bag', () => {
    const has = (s: DriveState, bit: number): boolean => (drive(s) & bit) !== 0;
    expect(has(calm({ bag: 0, multiplier: 1.3 }), DRIVE.bag)).toBe(false);
    expect(has(calm({ bag: 0, multiplier: 1.3 }), DRIVE.mult)).toBe(false);
    expect(has(calm({ bag: 1 }), DRIVE.bag)).toBe(true);
    expect(has(calm({ bag: 6500, multiplier: 1 }), DRIVE.mult)).toBe(false);
    expect(has(calm({ bag: 6500, multiplier: 1.3 }), DRIVE.mult)).toBe(true);
  });

  it('M8.5 1.3 the district name shows for four seconds after a change and after a new run, then not', () => {
    const shows = (age: number): boolean => (drive(calm({ placeAge: age })) & DRIVE.place) !== 0;
    expect(shows(0)).toBe(true);
    expect(shows(PLACE_SECONDS - 0.01)).toBe(true);
    expect(shows(PLACE_SECONDS)).toBe(false);
    const c = newPlaceClock();
    const a = { id: 'crown' }, b = { id: 'quay' };
    const dt = 1 / 60;
    const drive5 = (place: unknown): number => {
      let age = 0;
      for (let i = 0; i < 300; i++) age = tickPlace(c, place, 'running', dt);
      return age;
    };
    expect(tickPlace(c, a, 'running', dt)).toBe(0);
    expect(drive5(a)).toBeGreaterThan(PLACE_SECONDS);
    // a new district
    expect(tickPlace(c, b, 'running', dt)).toBe(0);
    drive5(b);
    // a door, then the drive-out in the same district: the name again
    tickPlace(c, b, 'closing', dt);
    expect(tickPlace(c, b, 'door', dt)).toBeGreaterThan(PLACE_SECONDS);
    expect(tickPlace(c, b, 'running', dt)).toBe(0);
    drive5(b);
    // the busted card closed: the same; backing out of a closing door is not a new run
    tickPlace(c, b, 'busted', dt);
    expect(tickPlace(c, b, 'running', dt)).toBe(0);
    drive5(b);
    tickPlace(c, b, 'closing', dt);
    expect(tickPlace(c, b, 'running', dt)).toBeGreaterThan(PLACE_SECONDS);
  });

  it('M8.5 1.4 behind a shut door and on the busted card no driving element shows, whatever the run holds', () => {
    for (const run of ['door', 'busted'] as const) {
      expect(drive(calm({ run, bag: 9000, multiplier: 2.6, damage: 0.5, combo: true, placeAge: 0 }))).toBe(0);
      expect(drive(calm({ run, city: false }))).toBe(0);
    }
    // the door closing is still the drive (the player keeps the wheel)
    expect(drive(calm({ run: 'closing' })) & DRIVE.speed).not.toBe(0);
  });

  it('M8.5 1.5 without ?dev=1 no hint names the tuning panel; with it the last row does', () => {
    expect(devTools(new URLSearchParams(''))).toBe(false);
    expect(devTools(new URLSearchParams('?dev=0'))).toBe(false);
    expect(devTools(new URLSearchParams('?map=city&dev=1'))).toBe(true);
    const off = hintRows({ ...KEYS, debug: '' });
    expect(off.map((r) => r.label)).not.toContain('tuning');
    for (const r of off) for (const k of r.keys) expect(k).not.toBe('');
    const on = hintRows(KEYS);
    expect(on[on.length - 1]).toEqual({ keys: ['`'], label: 'tuning' });
    expect(on.length).toBe(off.length + 1);
  });
});

describe('the corners finished (M8.9 slice 8)', () => {
  it('M8.9 8.1 the calm drive shows its six (the line, the stars, the bank, the radar, the gauge\'s speed and boost); the gauge\'s arcs open at the bottom', () => {
    expect(driveNames(drive(calm()))).toEqual(['stars', 'bank', 'radar', 'speed', 'boost']);
    // the arcs: 270° from the bottom left, clockwise over the top, to the bottom right; nothing drawn at 0, all at 1
    const ends = (r: number): number[] => [...arcPath(r).matchAll(/-?[\d.]+/g)].map((m) => Number(m[0]));
    for (const r of [GAUGE.boost.r, GAUGE.damage.r]) {
      const [x0, y0, , , , large, sweep, x1, y1] = ends(r);
      const k = r * Math.SQRT1_2;
      expect([x0, y0, x1, y1].map((v) => Math.round((v as number) * 10) / 10)).toEqual([50 - k, 50 + k, 50 + k, 50 + k].map((v) => Math.round(v * 10) / 10));
      expect([large, sweep]).toEqual([1, 1]);
      const length = (r * 3 * Math.PI) / 2;
      expect(Number(arcDash(r, 0).split(' ')[0])).toBe(0);
      expect(Number(arcDash(r, 1).split(' ')[0])).toBeCloseTo(length, 1);
      expect(Number(arcDash(r, 1).split(' ')[1])).toBeGreaterThan(length);
      expect(Number(arcDash(r, 2).split(' ')[0])).toBeCloseTo(length, 1);
    }
    // the sack, the coin and the flame: one drawing each, closed outlines inside the unit square
    for (const id of ['sack', 'coin', 'flame'] as GlyphId[]) {
      expect(GLYPHS[id].length, id).toBeGreaterThan(0);
      for (const shape of GLYPHS[id]) {
        for (const pts of [shape.outer, ...(shape.holes ?? [])]) {
          expect(pts.length % 2, id).toBe(0);
          expect(pts.length, id).toBeGreaterThanOrEqual(6);
          for (const v of pts) expect(v >= 0 && v <= 1, id).toBe(true);
        }
      }
    }
  });

  it('M8.9 8.3 the combo\'s × is hidden at ×1 and says itself from ×2', () => {
    expect(comboMult(1)).toBe('');
    expect(comboMult(2)).toBe('×2');
    expect(comboMult(5)).toBe('×5');
  });

  it('M8.9 8.4 the damage\'s arc: for a few seconds after a hit, standing from the third stage, never at the first two without a hit', () => {
    const shows = (over: Partial<DriveState>): boolean => (drive(calm({ damage: 0.4, ...over })) & DRIVE.damage) !== 0;
    for (const stage of [0, 1, 2]) {
      expect(shows({ stage, hitAge: Infinity }), `stage ${stage}`).toBe(false);
      expect(shows({ stage, hitAge: 0 }), `stage ${stage}`).toBe(true);
      expect(shows({ stage, hitAge: HIT_SECONDS - 0.01 }), `stage ${stage}`).toBe(true);
      expect(shows({ stage, hitAge: HIT_SECONDS }), `stage ${stage}`).toBe(false);
    }
    expect(DAMAGE_STANDS).toBe(3);
    expect(shows({ stage: 3, damage: 0.9, hitAge: Infinity })).toBe(true);
    expect(shows({ stage: 4, damage: 1, hitAge: Infinity })).toBe(true);
    // no damage, nothing to show; behind the door, never
    expect(shows({ damage: 0, hitAge: 0 })).toBe(false);
    expect(shows({ run: 'door', stage: 3, hitAge: 0 })).toBe(false);
    // the clock: the first reading (the intro's dented van) is no hit, a rise is, a fresh car is not
    const c = newHitClock();
    const dt = 1 / 60;
    expect(tickHit(c, 0.6, dt)).toBe(Infinity);
    expect(tickHit(c, 0.6, dt)).toBe(Infinity);
    expect(tickHit(c, 0.7, dt)).toBe(0);
    expect(tickHit(c, 0.7, dt)).toBeCloseTo(dt, 9);
    let age = 0;
    for (let i = 0; i < 200; i++) age = tickHit(c, 0.7, dt);
    expect(age).toBeGreaterThan(HIT_SECONDS);
    expect(tickHit(c, 0, dt)).toBeGreaterThan(HIT_SECONDS);
    expect(tickHit(c, 0.1, dt)).toBe(0);
  });

  it('M8.9 8.5 the bag\'s × is hidden at ×1, on the HUD and on the wall', () => {
    expect(drive(calm({ bag: 6500, multiplier: 1 })) & DRIVE.mult).toBe(0);
    expect(drive(calm({ bag: 6500, multiplier: 1.3 })) & DRIVE.mult).not.toBe(0);
    const wall = (multiplier: number): string => doorLines({ lastBag: 12_000, lastMultiplier: multiplier, lastBanked: 12_000 * multiplier, lastDoubled: false, lastFence: false })[0]?.label ?? '';
    expect(wall(1)).toBe('BAG 12,000');
    expect(wall(1.3)).toBe('BAG 12,000 ×1.3');
    setLang('pl');
    try {
      expect(wall(1)).not.toContain('×');
      expect(wall(1.3)).toContain('×1,3');
    } finally {
      setLang('en');
    }
  });
});

describe('the key hints (M8.9 slice 9)', () => {
  it('M8.9 9.4 four hints in one row (drive, boost, the map, pause), in the profile\'s first two sessions only; the pause lists them all', () => {
    const row = hintRow(KEYS);
    expect(row.map((r) => r.label)).toEqual(['drive', 'boost', 'map (hold)', 'pause']);
    expect(row[0]?.keys).toEqual(['W', 'A', 'S', 'D']);
    expect([0, 1, 2, 3, 10].map(hintsWanted)).toEqual([false, true, true, false, false]);
    expect(HINT_SECONDS).toBe(8);
    // the pause screen's list has every key, the four among them
    const all = hintRows({ ...KEYS, debug: '' }).map((r) => r.label);
    expect(all.length).toBeGreaterThanOrEqual(8);
    for (const r of row) expect(all).toContain(r.label);
  });
});
