/**
 * No hitches from the sim (M7 slice 5, DESIGN.md §15.1): a minute of the city
 * with traffic and pedestrians, driven by the road bot, runs no major garbage
 * collection and few scavenges (measured at the M7 slice: none and 19), and
 * loads at most one chunk of collision a step while driving, so no step stacks
 * the streaming. A player's stutter, if any, is the renderer's (the perf run's
 * long frames at the gate). Long: a minute of sim.
 */
import { PerformanceObserver, constants } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { createWorld } from './helpers';

describe('garbage (long)', () => {
  it('M7 5.1 a minute of the city: no major collection, under 40 scavenges, one chunk of collision a step at most', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 1, record: false });
    try {
      const bot = new TrackBot('muscle', CITY_BOT_TUNING);
      for (let i = 0; i < 600; i++) { bot.drive(sim, sim.controls, 1 / 60); sim.step(); }
      const kinds: number[] = [];
      const observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) kinds.push((e as unknown as { detail: { kind: number } }).detail.kind);
      });
      observer.observe({ entryTypes: ['gc'] });
      const city = sim.city!;
      let most = 0;
      for (let i = 0; i < 3600; i++) {
        const before = city.loaded;
        bot.drive(sim, sim.controls, 1 / 60);
        sim.step();
        most = Math.max(most, city.loaded - before);
      }
      await new Promise((r) => setTimeout(r, 50));
      observer.disconnect();
      const major = kinds.filter((k) => k === constants.NODE_PERFORMANCE_GC_MAJOR).length;
      const minor = kinds.filter((k) => k === constants.NODE_PERFORMANCE_GC_MINOR).length;
      console.info(`a minute of the city: ${minor} scavenges, ${major} major collections; at most ${most} chunk(s) loaded in a step`);
      expect(major).toBe(0);
      expect(minor).toBeLessThan(40);
      expect(most).toBeLessThanOrEqual(1);
    } finally { sim.dispose(); }
  }, 180_000);
});
