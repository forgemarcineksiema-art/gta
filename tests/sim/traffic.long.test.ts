/**
 * Long-running traffic pins: lane holding and separation over 30–60 s of the
 * bot driving with the full pool. Run by `npm run verify:gate` and
 * `npm run test:long`, not by the quick `npm run verify` (CLAUDE.md).
 */
import { describe, expect, it } from 'vitest';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
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
          // civilians: a police unit chasing the bot (M5.5's beat sees it speed) runs its plan's speed by design
          if (traffic.state[a] !== AgentState.Kinematic || traffic.police[a] === 1) continue;
          const lane = traffic.lane[a] as number;
          traffic.lanes.positionAt(lane, traffic.s[a] as number, traffic.laneOffset[a] as number, pose, traffic.next[a]);
          // M5.5: a driver's shift across the lane (a flinch, a pull-over, a pass, a lane change easing over)
          const sh = traffic.shift[a] as number;
          const dx = (traffic.x[a] as number) - (pose.x - Math.cos(pose.yaw) * sh);
          const dz = (traffic.z[a] as number) - (pose.z + Math.sin(pose.yaw) * sh);
          expect(Math.hypot(dx, dz)).toBeLessThan(0.6);
          // and its own share of the limit: the fastest pace and class, or an angry driver's
          const share = (traffic.angryLeft[a] as number) > 0 ? TRAFFIC.angry.pace : Math.max(...TRAFFIC.pace.values) * Math.max(...Object.values(TRAFFIC.classPace));
          expect(traffic.speed[a] as number).toBeLessThanOrEqual((traffic.lanes.limit[lane] as number) * share + 0.1);
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

// Moved unchanged from `traffic.test.ts` in M5.1: over ~10 s of wall time under the parallel suite.
describe('traffic flow (long)', () => {
  it('flows: cars mostly drive, few stand still, few give up on a junction', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    const bot = new TrackBot('muscle', CITY_BOT_TUNING);
    const traffic = sim.traffic as Traffic;
    let agentSteps = 0;
    let ratioSum = 0;
    let stopped = 0;
    let highwaySteps = 0;
    let highwayRatio = 0;
    try {
      for (let step = 0; step < 60 * 60; step++) {
        bot.drive(sim, sim.controls, 1 / 60);
        sim.step();
        if (step < 10 * 60) continue; // let the pool fill and settle
        for (let i = 0; i < traffic.capacity; i++) {
          const st = traffic.state[i];
          if (st !== AgentState.Kinematic && st !== AgentState.Physical) continue;
          const lane = traffic.lane[i] as number;
          if (lane < 0) continue;
          const limit = traffic.lanes.limit[lane] as number;
          const ratio = (traffic.speed[i] as number) / limit;
          agentSteps++;
          ratioSum += ratio;
          if ((traffic.speed[i] as number) < 0.5) stopped++;
          if (limit === traffic.tuning.speedHighway) { highwaySteps++; highwayRatio += ratio; }
        }
      }
      const mean = ratioSum / Math.max(1, agentSteps);
      const stoppedShare = stopped / Math.max(1, agentSteps);
      const highway = highwayRatio / Math.max(1, highwaySteps);
      console.log(`[traffic] flow: mean speed/limit ${mean.toFixed(3)}, stopped share ${stoppedShare.toFixed(3)}, highway ${highway.toFixed(3)}, waited past ${traffic.waitedPast}, wrecked ${traffic.count(AgentState.Wrecked)}`);
      expect(mean).toBeGreaterThan(0.6);
      expect(stoppedShare).toBeLessThan(0.15);
      expect(traffic.waitedPast).toBeLessThanOrEqual(5);
    } finally { sim.dispose(); }
  }, 120_000);
});
