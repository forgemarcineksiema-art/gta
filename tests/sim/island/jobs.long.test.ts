/**
 * M8.10 slice 14 on the island (docs/M8.10_PLAN.md §1.4). A delivery driven end to end: rolled into its ring, the road
 * bot on the lanes from the ring's road the clock was worked out from, down the island's hills to its drop by the
 * lighthouse, paid inside the limit; the police off and no traffic (measured 2026-09-26 with traffic on: the careful bot
 * jammed on the quay's sweep where the Coral Hotel's podium stands on its southern lane, a place's to mend, not the
 * job's). A chase up Crown Avenue with the units on the car model (the AI cars, on since slice 14). Long: run by
 * `npm run verify:gate`. The scripted run of every job is the gate's.
 */
import { describe, expect, it } from 'vitest';
import { clearControls, type SimWorld } from '../../../src/sim';
import { routeToPoint } from '../../../src/app/doorRoute';
import { CITY_BOT_TUNING, TrackBot } from '../../../src/app/trackBot';
import { alongLane, laneAt } from '../../../src/sim/city/route';
import type { Lane } from '../../../src/sim/city/roads';
import type { Island } from '../../../src/sim/island/Island';
import { pathTo, pathsFrom, startsNear } from '../../../src/sim/island/jobs';
import { createWorld, runUntil } from '../helpers';

describe('M8.10 slice 14 (long): a delivery and a chase on the island', () => {
  it('14b.10 the bot takes the delivery to the lighthouse from its ring, over the island\'s hills, and is paid inside the limit', async () => {
    const sim = await createWorld({ map: 'island', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const island = sim.island as Island, streets = sim.traffic!.streets, graph = streets.graph, lanes = sim.traffic!.lanes;
      const d = sim.jobs.defs.find((q) => q.id === 6);
      expect(d?.kind).toBe('delivery');
      if (!d) return;
      put(sim, island, d.x, d.z, d.yaw);
      for (let i = 0; i < 3; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
      expect(sim.jobs.active).toBe(d.id);
      expect(sim.jobs.state).toBe('active');
      // onto the ring's road the limit's drive starts from, then the lanes to the drop
      const t = streets.nearestLane(d.targetX, d.targetZ, streets.groundAt(d.targetX, d.targetZ));
      const target = { lane: t, s: alongLane(graph.lanes[t] as Lane, d.targetX, d.targetZ).s };
      let best = { lane: -1, s: 0 }, bestLength = Infinity;
      for (const st of startsNear(island, streets, d.x, d.z, 24)) {
        const p = pathTo(pathsFrom(graph, lanes, [st]), lanes, target);
        if (p.length < bestLength) { bestLength = p.length; best = st; }
      }
      expect(best.lane).toBeGreaterThanOrEqual(0);
      const at = laneAt(graph.lanes[best.lane] as Lane, best.s);
      put(sim, island, at.x, at.z, at.yaw);
      const bot = new TrackBot(sim.carId, { ...CITY_BOT_TUNING, careful: true });
      const path = routeToPoint(sim, d.targetX, d.targetZ);
      expect(path.length).toBeGreaterThan(100);
      bot.setPath(path);
      const bank = sim.run.bag;
      const time = runUntil(sim, d.limitSeconds + 10, (s) => s.jobs.state === 'done' || s.jobs.state === 'failed', (_t, c, s) => bot.drive(s, c, 1 / 60));
      console.info(`14b.10 the delivery to the lighthouse: ${sim.jobs.state} in ${time.toFixed(1)} of ${d.limitSeconds} s, ${path.length * 3} m, paid ${sim.jobs.lastPaid}, the bot's resets ${bot.resets}`);
      expect(sim.jobs.state).toBe('done');
      expect(time).toBeLessThan(d.limitSeconds);
      expect(bot.resets).toBe(0);
      expect(sim.jobs.lastPaid).toBeGreaterThanOrEqual(d.payout);
      expect(sim.run.bag - bank).toBeGreaterThanOrEqual(sim.jobs.lastPaid);
    } finally { sim.dispose(); }
  }, 300_000);

  it('14b.11 a chase up Crown Avenue: the units on the car model take the hill, upright, their wheels on the island\'s ground', async () => {
    const sim = await createWorld({ map: 'island', seed: 42, traffic: 1, peds: 0, record: false });
    try {
      const island = sim.island as Island, streets = sim.traffic!.streets;
      const lane = streets.graph.lanes[streets.nearestLane(150, 170, streets.groundAt(150, 170))] as Lane;
      const start = lane.points[1] as { x: number; z: number };
      put(sim, island, start.x, start.z, lane.yaw0);
      for (let i = 0; i < 30; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
      const bot = new TrackBot(sim.carId, { ...CITY_BOT_TUNING });
      bot.setPath(routeToPoint(sim, 400, 480));
      const from = sim.probe.y;
      sim.heat.set(40);
      sim.pursuit.force(8);
      let steps = 0, upright = 1, low = Infinity, high = -Infinity;
      const taken = new Set<number>();
      for (let i = 0; i < 60 * 30; i++) {
        clearControls(sim.controls);
        bot.drive(sim, sim.controls, 1 / 60);
        sim.step();
        for (const car of sim.ai?.cars ?? []) {
          if (car.agent < 0 || car.role !== 'unit') continue;
          taken.add(car.agent);
          steps++;
          const q = car.vehicle.body.rotation(), p = car.vehicle.body.translation();
          upright = Math.min(upright, 1 - 2 * (q.x * q.x + q.z * q.z));
          const over = p.y - island.ground.height(p.x, p.z);
          low = Math.min(low, over);
          high = Math.max(high, over);
        }
      }
      console.info(`14b.11 a chase up Crown Avenue: ${taken.size} units on the car model for ${(steps / 60).toFixed(0)} unit-seconds, the least upright ${upright.toFixed(2)}, their middles ${low.toFixed(2)}..${high.toFixed(2)} m over the ground; the player climbed ${(sim.probe.y - from).toFixed(0)} m`);
      expect(sim.probe.y - from).toBeGreaterThan(20);
      expect(taken.size).toBeGreaterThanOrEqual(2);
      expect(steps).toBeGreaterThan(60 * 20);
      expect(upright).toBeGreaterThan(0.85);
      expect(low).toBeGreaterThan(0);
      expect(high).toBeLessThan(2);
      expect(sim.hasNaN()).toBe(false);
    } finally { sim.dispose(); }
  }, 300_000);
});

/** The car stopped at (x, z) facing `yaw`, its ground loaded. */
function put(sim: SimWorld, island: Island, x: number, z: number, yaw: number): void {
  island.sync(x, z, true);
  sim.vehicle.teleport({ x, y: island.standAt(x, z) + 0.9, z }, yaw);
  sim.vehicle.setVelocity(0, 0, 0);
}
