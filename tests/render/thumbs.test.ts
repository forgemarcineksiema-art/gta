/**
 * The garage's pictures (docs/M8.9_PLAN.md R10, slice 14): a cell for every body and every kit item, a few a frame
 * while the wall is up, none while the run drives. The queue is pure; the drawing is WebGL's (the stills show it).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THUMBS, ThumbQueue, thumbKeys } from '../../src/render/cars/thumbs';
import { BODIES, BODY_IDS, KIT } from '../../src/sim';

describe('the pictures (M8.9 slice 14)', () => {
  it('M8.9 14.1 every body in BODIES and every kit item has a cell, each its own', () => {
    const q = new ThumbQueue();
    const cells = new Set<number>();
    expect(BODY_IDS.length).toBe(BODIES.length);
    for (const id of BODY_IDS) cells.add(q.cellOf(`body:${id}`));
    for (const k of KIT) cells.add(q.cellOf(`kit:${k.id}`));
    expect(cells.has(-1)).toBe(false);
    expect(cells.size).toBe(BODY_IDS.length + KIT.length);
    expect(thumbKeys().length).toBe(cells.size);
  });

  it('M8.9 14.2 at most THUMBS.perFrame cells a frame, every cell once, a respray first', () => {
    const q = new ThumbQueue();
    const out: number[] = [];
    const seen: number[] = [];
    let frames = 0;
    while (q.next(true, out) > 0) {
      expect(out.length).toBeLessThanOrEqual(THUMBS.perFrame);
      for (const c of out) { seen.push(c); q.drawn(c); }
      frames++;
    }
    expect(seen.length).toBe(q.keys.length);
    expect(new Set(seen).size).toBe(q.keys.length);
    expect(frames).toBe(Math.ceil(q.keys.length / THUMBS.perFrame));
    // a car resprayed: its cell again, first, once
    const cell = q.cellOf('body:muscle');
    q.redo(cell);
    q.redo(cell);
    expect(q.next(true, out)).toBe(1);
    expect(out).toEqual([cell]);
    q.drawn(cell);
    expect(q.version[cell]).toBe(2);
  });

  it('M8.9 14.3 no picture is drawn while the run drives: only behind the shut door', () => {
    const q = new ThumbQueue();
    const out: number[] = [];
    // before the first door and while driving: nothing
    for (let k = 0; k < 10; k++) expect(q.next(false, out)).toBe(0);
    expect(q.waiting).toBe(q.keys.length);
    expect(q.next(true, out)).toBe(THUMBS.perFrame);
    // the door opened: the rest waits for the next door
    for (let k = 0; k < 10; k++) expect(q.next(false, out)).toBe(0);
    expect(q.waiting).toBe(q.keys.length - THUMBS.perFrame);
    // the renderer asks only behind the shut door
    const renderer = readFileSync(new URL('../../src/render/Renderer.ts', import.meta.url), 'utf8');
    expect(renderer).toContain("this.thumbs?.step(sim.run.state === 'door')");
  });
});
