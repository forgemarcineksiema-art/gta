import { describe, expect, test } from 'vitest';
import { EventLog, type EventKind, type SimEvent } from '../../src/sim/events';

describe('event log', () => {
  test('a stale reader sees the last 64 events oldest-first, and a second read is empty', () => {
    const log = new EventLog();
    expect(log.capacity).toBe(64);
    expect(log.entries.length).toBe(64);
    const ring = log.entries;

    for (let i = 0; i < 70; i++) {
      log.tick = i;
      log.push(i % 2 === 0 ? 'hit' : 'honk', i, i, i + 1, i + 2, i);
    }

    expect(log.entries).toBe(ring);
    expect(log.entries.length).toBe(64);
    expect(log.sequence).toBe(70);

    const seen: SimEvent[] = [];
    const next = log.readFrom(0, (e) => seen.push(e));
    expect(seen.map((e) => e.seq)).toEqual(Array.from({ length: 64 }, (_, i) => i + 6));
    expect(next).toBe(70);
    // in place: the oldest surviving event is still the ring slot it was written into
    expect(seen[0]).toBe(log.entries[6]);
    const oldest = seen[0] as SimEvent;
    expect(oldest.kind).toBe('hit');
    expect(oldest.value).toBe(6);
    expect(oldest.tick).toBe(6);
    expect(oldest.target).toBe(6);
    expect([oldest.x, oldest.y, oldest.z]).toEqual([6, 7, 8]);

    const again: EventKind[] = [];
    expect(log.readFrom(next, (e) => again.push(e.kind))).toBe(70);
    expect(again).toEqual([]);
  });

  test('a missing target is -1 and a future cursor does not move backwards', () => {
    const log = new EventLog();
    log.push('swap', 0, 1, 2, 3);
    const seen: SimEvent[] = [];
    expect(log.readFrom(0, (e) => seen.push(e))).toBe(1);
    expect(seen).toHaveLength(1);
    expect((seen[0] as SimEvent).target).toBe(-1);
    expect(log.readFrom(5, () => { throw new Error('nothing to visit'); })).toBe(5);
  });
});
