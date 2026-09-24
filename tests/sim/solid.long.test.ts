/**
 * The chase read (docs/M8.6_PLAN.md §0, DESIGN.md §18.1): the bot under a level-5 chase for 120 s, every lent body read
 * at every step. Run by `npm run verify:gate` and `npm run test:long`, not by the quick `npm run verify`.
 */
import { describe, expect, it } from 'vitest';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld } from './helpers';

/** How far the lowest corner of an agent's box stands under the body's origin, for a rotation (x, y, z, w). */
function lowest(q: { x: number; y: number; z: number; w: number }, hw: number, hh: number, hl: number): number {
  let low = Infinity;
  for (const sx of [-1, 1]) for (const sy of [0, 2]) for (const sz of [-1, 1]) {
    const y = 2 * (q.x * q.y + q.w * q.z) * sx * hw + (1 - 2 * (q.x * q.x + q.z * q.z)) * sy * hh + 2 * (q.y * q.z - q.w * q.x) * sz * hl;
    low = Math.min(low, y);
  }
  return low;
}

describe('solid cars: the chase read (long)', () => {
  it('M8.6 0.4, 1.4 under a level-5 chase no driving car leans or sinks, no stopped car rests on a side or an end', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 1, record: false, heat: 100 });
    const bot = new TrackBot('muscle', CITY_BOT_TUNING);
    const traffic = sim.traffic as Traffic;
    let driving = 0, leaning = 0, sunk = 0, worstUp = 1, worstSink = 0, busts = 0, stopped = 0, longestAskew = 0;
    // seconds each record's body has rested on a side or an end
    const askew = new Float32Array(traffic.capacity);
    try {
      for (let tick = 0; tick < 120 * 60; tick++) {
        if (sim.run.state === 'busted') { sim.run.closeCard(); busts++; }
        if (sim.heat.points !== 100) sim.heat.set(100);
        bot.drive(sim, sim.controls, 1 / 60);
        sim.step();
        for (let a = 0; a < traffic.capacity; a++) {
          const st = traffic.state[a];
          if (st === AgentState.Wrecked || st === AgentState.Abandoned || st === AgentState.Parked) {
            const body = traffic.rigidBodyOf(a);
            if (!body) { askew[a] = 0; continue; }
            stopped++;
            const q = body.rotation(), v = body.linvel(), w = body.angvel();
            const up = 1 - 2 * (q.x * q.x + q.z * q.z), nose = 2 * (q.y * q.z - q.w * q.x);
            const resting = Math.hypot(v.x, v.y, v.z) < 0.3 && Math.hypot(w.x, w.y, w.z) < 0.3;
            askew[a] = resting && (Math.abs(up) < 0.7 || Math.abs(nose) > 0.7) ? (askew[a] as number) + 1 / 60 : 0;
            longestAskew = Math.max(longestAskew, askew[a] as number);
            continue;
          }
          askew[a] = 0;
          if (st !== AgentState.Physical) continue;
          const body = traffic.rigidBodyOf(a);
          if (!body) continue;
          driving++;
          const q = body.rotation();
          const up = 1 - 2 * (q.x * q.x + q.z * q.z);
          worstUp = Math.min(worstUp, up);
          if (up < Math.cos(3 * Math.PI / 180)) leaning++;
          const under = (traffic.y[a] as number) - (body.translation().y + lowest(q, traffic.halfWidthOf(a), 0.7, traffic.halfLengthOf(a)));
          worstSink = Math.max(worstSink, under);
          if (under > 0.05) sunk++;
        }
      }
      console.log(`[solid] level 5, 120 s, ${busts} busts: ${driving} driving samples, ${leaning} leaning over 3° (least up ${worstUp.toFixed(4)}), ${sunk} sunk over 5 cm (worst ${(worstSink * 100).toFixed(1)} cm); ${stopped} stopped samples, the longest at rest on a side or an end ${longestAskew.toFixed(2)} s`);
      expect(driving).toBeGreaterThan(20_000);
      expect(leaning).toBe(0);
      expect(sunk).toBe(0);
      // M8.6 1.4: a stopped car lies on its wheels or its roof
      expect(longestAskew).toBeLessThanOrEqual(3);
    } finally { sim.dispose(); }
  }, 300_000);
});
