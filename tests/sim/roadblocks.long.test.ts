/**
 * The roadblock placement pin (docs/history/M4_PLAN.md slice 6, 6.1 and 6.2): the
 * bot round the highway in a chase for 90 s. Long: run by `npm run
 * verify:gate`.
 */
import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { junctionCurve, laneLength, laneSpan, resample, type Pt } from '../../src/sim/city/route';
import type { Lane } from '../../src/sim/city/roads';
import { POLICE } from '../../src/sim/police/tuning';
import type { SimWorld } from '../../src/sim';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

/** Round the highway ring on one lane, as samples for the bot. */
function highwayLoop(sim: SimWorld, x: number, z: number, yaw: number): ReturnType<typeof resample> {
  const graph = sim.city!.graph;
  const lanes = (sim.traffic as Traffic).lanes;
  let start = -1, best = Infinity;
  for (const lane of graph.lanes) {
    if (!lane.highway) continue;
    const proj = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
    lanes.project(lane.id, x, z, proj);
    const cost = proj.dist + (1 - Math.cos(proj.yaw - yaw)) * 50;
    if (cost < best) { best = cost; start = lane.id; }
  }
  const raw: Pt[] = [];
  let current = graph.lanes[start] as Lane;
  for (let hop = 0; hop < 25; hop++) {
    laneSpan(current, 0, laneLength(current), raw);
    let next = -1, nextCost = Infinity;
    for (const out of current.next) {
      const to = graph.lanes[out] as Lane;
      if (!to.highway || to.offset !== current.offset || out === lanes.uturn(current.id)) continue;
      const cost = Math.abs(lanes.headingChange(current.id, out));
      if (cost < nextCost) { nextCost = cost; next = out; }
    }
    if (next < 0) break;
    junctionCurve(current, graph.lanes[next] as Lane, raw);
    current = graph.lanes[next] as Lane;
  }
  return resample(raw);
}

describe('roadblocks (long)', () => {
  it('6.1 / 6.2 in a chase on the highway a roadblock goes up 150-300 m ahead, out of view, never within 100 m, one at a time', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 60 });
    const traffic = sim.traffic as Traffic;
    try {
      // 450 m short of the north-west corner, northbound on the inner lane
      const x = -679, z = 225, yaw = 0;
      sim.city?.sync(x, z, true);
      sim.vehicle.teleport({ x, y: 0.8, z }, yaw);
      const bot = new TrackBot('muscle', CITY_BOT_TUNING);
      bot.setPath(highwayLoop(sim, x, z, yaw), true);
      const rb = sim.roadblocks!;
      let activeAt = -1, placedAt = -1, placement: { occluded: boolean; d: number; angle: number } | null = null;
      const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
      let twice = false, placedCount = 0, lastActive = 0;
      run(sim, 90, (_t, c, s) => {
        bot.drive(s, c, 1 / 60);
        if (activeAt < 0 && s.pursuit.state === 'active') activeAt = s.time;
        if (rb.active === 1 && lastActive === 0) {
          placedCount++;
          if (placedAt < 0) {
            placedAt = s.time;
            const p = s.probe;
            const d = Math.hypot(rb.x - p.x, rb.z - p.z);
            const along = (rb.x - p.x) * Math.sin(p.yaw) + (rb.z - p.z) * Math.cos(p.yaw);
            // the driver's line to it: a building in the way is out of view as well
            const dy = 1 - 1.3, len = Math.hypot(rb.x - p.x, dy, rb.z - p.z);
            ray.origin = { x: p.x, y: 1.3, z: p.z };
            ray.dir = { x: (rb.x - p.x) / len, y: dy / len, z: (rb.z - p.z) / len };
            const occluded = s.world.castRay(ray, len, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS) !== null;
            placement = { occluded, d, angle: Math.acos(Math.max(-1, Math.min(1, along / d))) * 180 / Math.PI };
          }
        }
        if (rb.active > 1) twice = true;
        let lit = 0;
        for (let i = 0; i < traffic.capacity; i++) if (traffic.lights[i] === 1 && traffic.state[i] === AgentState.Parked && (rb.agents[0] === i || rb.agents[1] === i)) lit++;
        if (lit > 2) twice = true;
        lastActive = rb.active;
        if (s.run.state === 'busted') s.run.closeCard();
      });
      expect(activeAt).toBeGreaterThanOrEqual(0);
      expect(placedAt).toBeGreaterThan(0);
      expect(placedAt - activeAt).toBeLessThanOrEqual(POLICE.roadblock.retryAfter);
      expect(placement!.d).toBeGreaterThanOrEqual(POLICE.roadblock.minDistance);
      expect(placement!.d).toBeLessThanOrEqual(POLICE.roadblock.maxAhead);
      // never in view at placement: out of the view cone, or behind a building
      expect(placement!.occluded || placement!.angle > POLICE.viewHalfAngleDeg).toBe(true);
      expect(twice).toBe(false);
      expect(placedCount).toBeGreaterThanOrEqual(1);
    } finally { sim.dispose(); }
  }, 120_000);

});
