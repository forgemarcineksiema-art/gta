/**
 * The overpasses (M5.5 slice 8, docs/M4_PLAN.md §5 B): the highway climbs
 * over its four crossings with the central streets. The graph carries the
 * height, the traffic drives it, the player's car climbs the ramp, crosses the
 * deck and comes down inside the landing rules, the street passes under it,
 * and a patrol under the deck cannot see through it.
 */
import { describe, expect, it } from 'vitest';
import { BLOCK, OVERPASS, OVERPASS_NODES, buildRoadGraph, type Lane } from '../../src/sim/city/roads';
import { laneAt, laneLength } from '../../src/sim/city/route';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

/** The overpass lanes: highway lanes whose points carry height. */
function spans(lanes: readonly Lane[]): Lane[] {
  return lanes.filter((l) => l.highway && l.points.some((p) => (p.y ?? 0) > 0));
}

describe('overpasses', () => {
  it('8.1 the graph: the highway over each crossing climbs to the deck and back, gently; the street under it stays on the ground', () => {
    const graph = buildRoadGraph();
    const over = spans(graph.lanes);
    // two lanes each way over each of the four crossings
    expect(over.length).toBe(16);
    for (const [gx, gz] of OVERPASS_NODES) {
      const node = graph.nodes.find((n) => n.x === gx * BLOCK && n.z === gz * BLOCK)!;
      // only its street meets it now
      for (const id of node.outgoing) expect(graph.lanes[id]!.highway).toBe(false);
      expect(graph.lanes.filter((l) => l.to === node.id).every((l) => !l.highway && l.points.every((p) => (p.y ?? 0) === 0))).toBe(true);
    }
    for (const lane of over) {
      const len = laneLength(lane);
      expect(laneAt(lane, 0).y).toBeCloseTo(0, 5);
      expect(laneAt(lane, len).y).toBeCloseTo(0, 5);
      let top = 0, steepest = 0, prev = laneAt(lane, 0).y;
      for (let s = 1; s <= len; s += 1) {
        const y = laneAt(lane, s).y;
        top = Math.max(top, y);
        steepest = Math.max(steepest, Math.abs(y - prev));
        prev = y;
      }
      expect(top).toBeCloseTo(OVERPASS.height, 3);
      // the landing rules: no grade over 11 %
      expect(steepest).toBeLessThan(0.11);
    }
  });

  it('8.2 a traffic car drives over at the road\'s height, nose up the ramp', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      const lane = spans(sim.city!.graph.lanes)[0]!;
      // the player parked 80 m inside the ring from the crossing: near enough to keep the car, too far to lend it a body
      const mid = laneAt(lane, laneLength(lane) / 2);
      const px = mid.x - Math.sign(mid.x) * (Math.abs(mid.x) > 600 ? 80 : 0), pz = mid.z - Math.sign(mid.z) * (Math.abs(mid.z) > 600 ? 80 : 0);
      sim.city?.sync(px, pz, true);
      sim.vehicle.teleport({ x: px, y: 1, z: pz }, 0);
      sim.vehicle.setVelocity(0, 0, 0);
      const car = traffic.spawnAt(lane.id, 20, 'sedan');
      traffic.pace[car] = 1;
      traffic.bad[car] = 0;
      let top = 0, worst = 0, pitched = false;
      const over = new Set(spans(sim.city!.graph.lanes).map((l) => l.id));
      run(sim, 18, (_t, _c, s) => {
        const t = s.traffic!;
        // on either lane of the span (it may move over to overtake nobody, or back)
        if (!over.has(t.lane[car] as number) || t.state[car] !== AgentState.Kinematic || (t.s[car] as number) > laneLength(lane)) return;
        const slot = t.slot[car] as number;
        const y = s.transforms.currPos[slot * 3 + 1] as number;
        const road = laneAt(s.city!.graph.lanes[t.lane[car] as number]!, t.s[car] as number).y;
        worst = Math.max(worst, Math.abs(y - 0.03 - road));
        top = Math.max(top, y);
        if (Math.abs(t.grade[car] as number) > 0.05 && Math.abs(s.transforms.currRot[slot * 4] as number) + Math.abs(s.transforms.currRot[slot * 4 + 2] as number) > 0.01) pitched = true;
      });
      expect(top).toBeGreaterThan(OVERPASS.height - 0.2);
      expect(worst).toBeLessThan(0.1);
      expect(pitched).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);

  it('8.3 the player\'s car climbs the ramp, crosses the deck and comes down on its wheels; the street runs on under it', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const lane = spans(sim.city!.graph.lanes)[0]!;
      const start = laneAt(lane, 5);
      const drive = (x: number, z: number, yaw: number, seconds: number, speed: number): { top: number; air: number; end: number } => {
        sim.city?.sync(x, z, true);
        sim.vehicle.teleport({ x, y: 1, z }, yaw);
        sim.vehicle.setVelocity(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed);
        let top = 0, air = 0, airNow = 0;
        run(sim, seconds, (_t, c, s) => {
          c.throttle = s.vehicle.telemetry.speed < speed ? 1 : 0;
          c.steer = 0;
          top = Math.max(top, s.vehicle.body.translation().y);
          airNow = s.vehicle.telemetry.groundedWheels === 0 ? airNow + 1 / 60 : 0;
          air = Math.max(air, airNow);
        });
        return { top, air, end: sim.vehicle.telemetry.speed };
      };
      const over = drive(start.x, start.z, lane.yaw0, 14, 25);
      expect(over.top).toBeGreaterThan(OVERPASS.height);
      expect(over.air).toBeLessThan(0.35);
      expect(over.end).toBeGreaterThan(15);
      // down the other side on the ground again
      expect(sim.vehicle.body.translation().y).toBeLessThan(1.5);
      // the central street under the deck: its stub runs on to the sea, flat
      const [gx, gz] = OVERPASS_NODES[0] as readonly [number, number];
      const inward = gz < 0 ? 1 : -1;
      const under = drive(gx * BLOCK + 4.5, gz * BLOCK + inward * 60, gz < 0 ? Math.PI : 0, 4, 12);
      expect(under.top).toBeLessThan(1.5);
    } finally { sim.dispose(); }
  }, 60_000);

  it('8.4 a patrol under the deck cannot see the player on it; one on the deck can', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      const [gx, gz] = OVERPASS_NODES[0] as readonly [number, number];
      const cx = gx * BLOCK, cz = gz * BLOCK;
      const alongX = Math.abs(gz) === 3;
      const put = (u: number, v: number): { x: number; z: number } => (alongX ? { x: cx + u, z: cz + v } : { x: cx + v, z: cz + u });
      const on = put(0, 4);
      sim.city?.sync(on.x, on.z, true);
      sim.vehicle.teleport({ x: on.x, y: OVERPASS.height + 1, z: on.z }, alongX ? Math.PI / 2 : 0);
      sim.vehicle.setVelocity(0, 0, 0);
      run(sim, 0.8, (_t, c) => { c.brake = 1; });
      expect(sim.vehicle.body.translation().y).toBeGreaterThan(OVERPASS.height);
      const below = put(-6, -8);
      const under = traffic.spawnParkedPolice(below.x, below.z, 0, 'police');
      expect(sim.police!.canSee(under, sim.probe, Math.hypot(below.x - sim.probe.x, below.z - sim.probe.z))).toBe(false);
      traffic.clearAround(below.x, below.z, 1);
      // on the deck: a lane car at the deck's height sees along it
      const lane = spans(sim.city!.graph.lanes).find((l) => {
        const mid = laneAt(l, laneLength(l) / 2);
        return Math.hypot(mid.x - cx, mid.z - cz) < 20;
      })!;
      const s = laneLength(lane) / 2 - 20;
      const unit = traffic.spawnAt(lane.id, s, 'police');
      traffic.police[unit] = 1;
      run(sim, 1 / 60);
      expect(traffic.y[unit]).toBeGreaterThan(OVERPASS.height - 0.5);
      expect(sim.police!.canSee(unit, sim.probe, Math.hypot((traffic.x[unit] as number) - sim.probe.x, (traffic.z[unit] as number) - sim.probe.z))).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);
});
