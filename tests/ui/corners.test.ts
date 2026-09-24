/**
 * The driving screen's corners (M8.5 slice 1, docs/DESIGN.md §17.2): a calm
 * drive shows the stars, the bank, the radar, the speed and the boost (with
 * the goal line, the six: no arrow, DESIGN.md §20); the bag from its first money, its
 * × from the first level that multiplies, the district's name for four
 * seconds, nothing of it behind a shut door or on the busted card; the key
 * hints and the developer's panel only with `?dev=1`.
 */
import { describe, expect, it } from 'vitest';
import { DRIVE, PLACE_SECONDS, devTools, drive, driveNames, hintRows, newDriveState, newPlaceClock, tickPlace, type DriveState, type KeyHints } from '../../src/ui/hud/corners';

/** A city drive with nothing happening, long after the last district change. */
function calm(over: Partial<DriveState> = {}): DriveState {
  return { ...newDriveState(), city: true, placeAge: 60, ...over };
}

const KEYS: KeyHints = {
  throttle: 'W', brake: 'S', steerLeft: 'A', steerRight: 'D', handbrake: 'SPACE', boost: 'SHIFT', reset: 'R', pause: 'P',
  camera: 'C', debug: '`', swap: 'E', map: 'TAB', horn: 'H',
};

describe('the corners', () => {
  it('M8.5 1.1 a calm drive shows exactly the stars, the bank, the radar, the speed and the boost; the test track the car alone', () => {
    expect(driveNames(drive(calm()))).toEqual(['stars', 'bank', 'radar', 'speed', 'boost']);
    // with the goal line (jobs.ts): the six of §17.2 since §20 took the arrow out
    expect(driveNames(drive(calm())).length + 1).toBe(6);
    expect(driveNames(drive(calm({ city: false })))).toEqual(['speed', 'boost']);
    // a dent and a running combo come and go with their moments
    expect(driveNames(drive(calm({ damage: 0.2, combo: true })))).toEqual(['stars', 'bank', 'radar', 'speed', 'boost', 'damage', 'combo']);
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
