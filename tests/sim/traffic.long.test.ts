/**
 * Long-running traffic pins: lane holding and separation over 30–60 s of the
 * bot driving with the full pool. Run by `npm run verify:gate` and
 * `npm run test:long`, not by the quick `npm run verify` (CLAUDE.md).
 */
import { describe, expect, it } from 'vitest';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import type { LanePose } from '../../src/sim/traffic/lanes';
import { createWorld } from './helpers';

const pose: LanePose = { x: 0, z: 0, yaw: 0 };

describe('traffic (long)', () => {
  it('stays on its lane at or under the limit', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    const bot = new TrackBot('muscle', CITY_BOT_TUNING);
    const traffic = sim.traffic as Traffic;
    try {
      for (let i = 0; i < 30 * 60; i++) {
        bot.drive(sim, sim.controls, 1 / 60);
        sim.step();
        for (let a = 0; a < traffic.capacity; a++) {
          if (traffic.state[a] !== AgentState.Kinematic) continue;
          const lane = traffic.lane[a] as number;
          traffic.lanes.positionAt(lane, traffic.s[a] as number, traffic.laneOffset[a] as number, pose, traffic.next[a]);
          const dx = (traffic.x[a] as number) - pose.x;
          const dz = (traffic.z[a] as number) - pose.z;
          expect(Math.hypot(dx, dz)).toBeLessThan(0.6);
          expect(traffic.speed[a] as number).toBeLessThanOrEqual((traffic.lanes.limit[lane] as number) + 0.1);
        }
      }
      expect(traffic.count(AgentState.Kinematic)).toBeGreaterThan(10);
    } finally { sim.dispose(); }
  }, 60_000);

  it('keeps cars apart, including through junctions', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    const bot = new TrackBot('muscle', CITY_BOT_TUNING);
    const traffic = sim.traffic as Traffic;
    let minSame = Infinity;
    let minAny = Infinity;
    try {
      for (let step = 0; step < 60 * 60; step++) {
        bot.drive(sim, sim.controls, 1 / 60);
        sim.step();
        for (let i = 0; i < traffic.capacity; i++) {
          if (traffic.state[i] !== AgentState.Kinematic) continue;
          for (let j = i + 1; j < traffic.capacity; j++) {
            if (traffic.state[j] !== AgentState.Kinematic) continue;
            const dx = (traffic.x[i] as number) - (traffic.x[j] as number);
            const dz = (traffic.z[i] as number) - (traffic.z[j] as number);
            const dist = Math.hypot(dx, dz);
            if (dist < minAny) minAny = dist;
            if (traffic.lane[i] === traffic.lane[j] && dist < minSame) minSame = dist;
          }
        }
      }
      console.log(`[traffic] waited past junction ${traffic.waitedPast}, min same-lane ${minSame.toFixed(2)} m, min any ${minAny.toFixed(2)} m, alive ${traffic.count(AgentState.Kinematic)}`);
      expect(traffic.count(AgentState.Kinematic)).toBeGreaterThan(10);
      expect(minSame).toBeGreaterThanOrEqual(4.5);
      expect(minAny).toBeGreaterThanOrEqual(2.5);
    } finally { sim.dispose(); }
  }, 120_000);
});
