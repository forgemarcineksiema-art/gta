/**
 * The save store (docs/M5_PLAN.md slice 0) with a fake platform and a fake
 * clock, in Node: the debounce, the flush and its no-op, the newer-save guard
 * and a failing load.
 */
import { describe, expect, it } from 'vitest';
import { SaveStore } from '../../src/app/save';
import { LocalPlatform } from '../../src/platform/LocalPlatform';
import { BALANCE } from '../../src/sim/balance';
import { SAVE_VERSION } from '../../src/sim/save/format';
import { createWorld } from '../sim/helpers';

/** A LocalPlatform whose data calls are recorded in memory. */
class FakePlatform extends LocalPlatform {
  readonly writes: string[] = [];
  store = new Map<string, string>();
  failLoad = false;
  override saveData(key: string, value: string): Promise<void> {
    this.writes.push(value);
    this.store.set(key, value);
    return Promise.resolve();
  }
  override loadData(key: string): Promise<string | null> {
    if (this.failLoad) return Promise.reject(new Error('storage gone'));
    return Promise.resolve(this.store.get(key) ?? null);
  }
}

function clock(): { now: () => number; advance: (s: number) => void } {
  let t = 100;
  return { now: () => t, advance: (s) => { t += s; } };
}

describe('save store', () => {
  it('0.7 600 changes in one second produce one write', async () => {
    const platform = new FakePlatform('');
    const c = clock();
    const store = new SaveStore(platform, BALANCE.save.key, c.now);
    await store.load();
    const sim = await createWorld({ map: 'playground' });
    try {
      for (let i = 0; i < 600; i++) {
        sim.run.bank += 1;
        store.markDirty();
        store.tick(sim, 1 / 600);
        await Promise.resolve();
        c.advance(1 / 600 - 1e-9);
      }
      expect(platform.writes.length).toBe(1);
      // the next second writes the rest once
      c.advance(0.01);
      store.tick(sim, 0.01);
      await Promise.resolve();
      expect(platform.writes.length).toBe(2);
      expect((JSON.parse(platform.writes[1] as string) as { bank: number }).bank).toBe(600);
    } finally { sim.dispose(); }
  });

  it('0.8 flush writes at once; a second flush with no change writes nothing', async () => {
    const platform = new FakePlatform('');
    const store = new SaveStore(platform, BALANCE.save.key, clock().now);
    await store.load();
    const sim = await createWorld({ map: 'playground' });
    try {
      sim.run.bank = 777;
      await store.flush(sim);
      expect(platform.writes.length).toBe(1);
      expect(store.bytes).toBe((platform.writes[0] as string).length);
      await store.flush(sim);
      expect(platform.writes.length).toBe(1);
    } finally { sim.dispose(); }
  });

  it('0.9 a newer save is kept: nothing is written over it', async () => {
    const platform = new FakePlatform('');
    const newer = JSON.stringify({ v: SAVE_VERSION + 1, bank: 999999, hovercraft: true });
    platform.store.set(BALANCE.save.key, newer);
    const store = new SaveStore(platform, BALANCE.save.key, clock().now);
    const save = await store.load();
    expect(save.bank).toBe(0);
    expect(store.unknownRaw).toBe(newer);
    const sim = await createWorld({ map: 'playground' });
    try {
      sim.run.bank = 5;
      store.markDirty();
      store.tick(sim, 1);
      await store.flush(sim);
      expect(platform.writes.length).toBe(0);
      expect(platform.store.get(BALANCE.save.key)).toBe(newer);
    } finally { sim.dispose(); }
  });

  it('0.10 a load that rejects resolves the defaults', async () => {
    const platform = new FakePlatform('');
    platform.failLoad = true;
    const store = new SaveStore(platform, BALANCE.save.key, clock().now);
    const save = await store.load();
    expect(save.bank).toBe(0);
    expect(save.owned).toEqual(['muscle']);
    expect(store.unknownRaw).toBeNull();
  });
});
