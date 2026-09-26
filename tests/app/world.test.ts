/** M8.10 slice 18: the island is the game's world; the grid behind `map=grid` (and its spawns), the playground as it was. */
import { describe, expect, it } from 'vitest';
import { worldMap } from '../../src/app/world';

describe('M8.10 slice 18: which world a page makes', () => {
  it('18.1 the default world is the island; the grid by its map or its spawns; the playground by its map, its spawns or the track bot', () => {
    const map = (q: string): string => worldMap(new URLSearchParams(q));
    expect(map('')).toBe('island');
    expect(map('?quality=low')).toBe('island');
    expect(map('?bot=1&seed=42&duration=20')).toBe('island');
    expect(map('?spawn=runway')).toBe('island');
    expect(map('?spawn=hideout')).toBe('island');
    expect(map('?map=island&spawn=crown')).toBe('island');
    expect(map('?map=grid')).toBe('city');
    expect(map('?map=city')).toBe('city');
    expect(map('?spawn=crown')).toBe('city');
    expect(map('?spawn=loop')).toBe('city');
    expect(map('?map=playground')).toBe('playground');
    expect(map('?spawn=skidpad')).toBe('playground');
    expect(map('?bot=track')).toBe('playground');
  });
});
