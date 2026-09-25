/**
 * The player's car is always seen (M8.6 slice 4, D9): a car in the camera's way, or at the camera, is thinned through a
 * screen door; the choice and the pace, pure.
 */
import { describe, expect, it } from 'vitest';
import { FADE, blocks, doorDraws, fadeTarget, stepFade } from '../../src/render/camera/fade';

/** A sedan's box: 0.9 half wide, 0.75 half high, 2.3 half long. */
const HW = 0.9, HH = 0.75, HL = 2.3;

describe('the car is always seen', () => {
  it('M8.6 4.1 a car on the camera\'s line is in the way, one a metre beside it is not; a wreck on its side too', () => {
    // the camera 7 m behind and 3 m above the player's car at the origin, looking down +z
    const eye = { x: 0, y: 3, z: -7 }, car = { x: 0, y: 0.6, z: 0 };
    // a sedan square across the line 3.5 m behind the player
    const across = { x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) };
    expect(blocks(eye.x, eye.y, eye.z, car.x, car.y, car.z, 0, 0, -3.5, across.x, across.y, across.z, across.w, HW, HH, HL, FADE.grow)).toBe(true);
    // the same car a metre clear of the line's side (its end 1 m past the grown box)
    const off = HL + FADE.grow + 1;
    expect(blocks(eye.x, eye.y, eye.z, car.x, car.y, car.z, off + HL, 0, -3.5, across.x, across.y, across.z, across.w, HW, HH, HL, FADE.grow)).toBe(false);
    // a car behind the camera or beyond the player's car is not between them
    expect(blocks(eye.x, eye.y, eye.z, car.x, car.y, car.z, 0, 0, -12, 0, 0, 0, 1, HW, HH, HL, FADE.grow)).toBe(false);
    expect(blocks(eye.x, eye.y, eye.z, car.x, car.y, car.z, 0, 0, 6, 0, 0, 0, 1, HW, HH, HL, FADE.grow)).toBe(false);
    // a wreck lying on its side across the line, its roof toward the camera: its box stands up to its width
    const side = { x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) };
    expect(blocks(eye.x, eye.y, eye.z, car.x, car.y, car.z, 0.8, 0.9, -3.5, side.x, side.y, side.z, side.w, HW, HH, HL, FADE.grow)).toBe(true);
  });

  it('M8.6 4.2 a car within 2.5 m of the camera is thinned wherever it stands; clear, it is whole', () => {
    expect(fadeTarget(false, FADE.near - 0.1)).toBe(FADE.floor);
    expect(fadeTarget(false, FADE.near + 0.1)).toBe(1);
    expect(fadeTarget(true, 30)).toBe(FADE.floor);
    expect(FADE.floor).toBeGreaterThan(0);
    // thinned to half at most: the steady state is the one-pixel checker (M8.9 R12)
    expect(FADE.floor).toBeLessThanOrEqual(0.5);
  });

  it('M8.6 4.3 the fade goes from whole to thinned in 0.15 s, never faster, and back', () => {
    let f = 1, steps = 0;
    while (f > FADE.floor && steps < 100) {
      const next = stepFade(f, FADE.floor, 1 / 60);
      expect(f - next).toBeLessThanOrEqual((1 - FADE.floor) / FADE.seconds / 60 + 1e-9);
      f = next;
      steps++;
    }
    expect(steps).toBe(Math.ceil(FADE.seconds * 60 - 1e-9));
    for (let k = 0; k < 9; k++) f = stepFade(f, 1, 1 / 60);
    expect(f).toBe(1);
  });
});

describe('nothing looks like a fault (M8.9 slice 12)', () => {
  it('M8.9 12.4 at the steady fade the screen door is a one-pixel checker; the 4×4 pattern only while it fades', () => {
    const drawn = (fade: number): boolean[] => {
      const out: boolean[] = [];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out.push(doorDraws(fade, x, y));
      return out;
    };
    const steady = drawn(FADE.floor);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) expect(steady[x + y * 8], `${x},${y}`).toBe((x + y) % 2 === 0);
    // whole is whole; on the way there, some other share of the 4×4 (not a checker)
    expect(drawn(1).every(Boolean)).toBe(true);
    const halfway = drawn(0.75);
    expect(halfway.filter(Boolean).length).toBe(48);
    expect(halfway.every((d, i) => d === (((i % 8) + Math.floor(i / 8)) % 2 === 0))).toBe(false);
  });
});
