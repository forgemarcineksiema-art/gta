/**
 * The hunt by a naive bot (docs/M5_PLAN.md slice 2's measurement): from each
 * order ring the road bot re-plans the shortest lane path to the wanted car
 * every two seconds and drives it until it is within swap reach. Records the
 * hunt time and whether the traffic repainted a car or spawned one. City,
 * seed 42, traffic on. Long: run by `npm run verify:gate`.
 */
import { describe, expect, it } from 'vitest';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import type { Lane, SimWorld, TrackSample } from '../../src/sim';
import { alongLane, chainPoints, junctionCurve, laneChain, laneSpan, resample, type Pt } from '../../src/sim/city/route';
import { createWorld, runUntil } from './helpers';

/** The lanes from the car's to the wanted car's, and on along its lane past it (an open path ends in a stop: its end must not be the car). */
function pathTo(sim: SimWorld, agent: number): TrackSample[] {
  const city = sim.city!, traffic = sim.traffic!;
  const p = sim.probe;
  const from = city.nearestLane(p.x, p.z);
  const to = traffic.lane[agent] as number;
  if (to < 0) return [];
  const chain = from === to ? [from] : laneChain(city.graph, from, to);
  if (chain.length === 0) return [];
  const raw: Pt[] = [];
  chainPoints(city.graph, chain, raw);
  const last = city.graph.lanes[to] as Lane;
  const s0 = chain.length === 1 ? alongLane(last, p.x, p.z).s : 0;
  const end = (traffic.s[agent] as number) + 80;
  laneSpan(last, s0, Math.max(s0 + 5, Math.min(end, traffic.lanes.length[to] as number)), raw);
  // past the lane's end: on through the junction the wanted car will take, or any
  if (end > (traffic.lanes.length[to] as number)) {
    const nxt = (traffic.next[agent] as number) >= 0 ? (traffic.next[agent] as number) : (last.next[0] ?? -1);
    if (nxt >= 0) {
      const next = city.graph.lanes[nxt] as Lane;
      junctionCurve(last, next, raw);
      laneSpan(next, 0, Math.min(end - (traffic.lanes.length[to] as number), traffic.lanes.length[nxt] as number), raw);
    }
  }
  return resample(raw);
}

describe('steal to order (long)', () => {
  it('2.7 a naive hunter reaches the wanted car in most orders (the measurement; a human has the radar and the ring)', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    try {
      const rows: string[] = [];
      let reached = 0;
      for (const d of sim.jobs.defs.filter((k) => k.kind === 'order')) {
        sim.jobs.abandon();
        sim.heat.reset();
        sim.city?.sync(d.x, d.z, true);
        sim.vehicle.teleport({ x: d.x, y: 0.8, z: d.z }, d.yaw);
        sim.vehicle.setVelocity(0, 0, 0);
        sim.step();
        expect(sim.jobs.state).toBe('hunting');
        const bot = new TrackBot(sim.carId, CITY_BOT_TUNING);
        let replan = 0;
        const t = runUntil(sim, 240, (s) => {
          const w = s.jobs.wantedAgent;
          return w >= 0 && Math.hypot((s.traffic!.x[w] as number) - s.probe.x, (s.traffic!.z[w] as number) - s.probe.z) < 15;
        }, (_t, c, s) => {
          replan -= 1 / 60;
          if (replan <= 0 && s.jobs.wantedAgent >= 0) {
            replan = 2;
            bot.setPath(pathTo(s, s.jobs.wantedAgent));
          }
          bot.drive(s, c, 1 / 60);
        });
        if (t > 0) reached++;
        rows.push(`#${d.id}: ${t > 0 ? `${t.toFixed(1)} s` : 'not reached in 240 s'}, ${sim.jobs.repaints} repaint(s), ${sim.jobs.spawns} spawn(s)`);
      }
      console.info(`hunts by the naive bot:\n  ${rows.join('\n  ')}`);
      // the naive policy loses the car at junctions it re-plans through; four of six is its floor at seed 42
      expect(reached).toBeGreaterThanOrEqual(4);
    } finally { sim.dispose(); }
  }, 600_000);
});
