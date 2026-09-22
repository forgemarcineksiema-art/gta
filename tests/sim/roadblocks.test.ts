/**
 * Roadblocks and spike strips (docs/M4_PLAN.md slice 6): placement ahead on
 * the player's road out of view, one at a time; the sawhorse as the weak
 * point; the car half, which only the heavy breaches; the spike's puncture
 * and its cure; the block clearing behind the player. City, seed 42, traffic
 * on, heat 60.
 */
import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { BALANCE } from '../../src/sim/balance';
import type { Chokepoint } from '../../src/sim/city/cover';
import { junctionCurve, laneLength, laneSpan, resample, type Pt } from '../../src/sim/city/route';
import type { Lane } from '../../src/sim/city/roads';
import { POLICE } from '../../src/sim/police/tuning';
import type { SimWorld } from '../../src/sim';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run, runUntil } from './helpers';

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

/** A chokepoint on a straight highway lane (the west side, northbound, inner lane), mid-segment. */
function westSite(sim: SimWorld): Chokepoint {
  const graph = sim.city!.graph;
  const site = sim.cover!.chokepoints.find((c) => {
    const lane = graph.lanes[c.lane] as Lane;
    return lane.highway && lane.offset === 4 && Math.abs(c.x + 679) < 1 && Math.abs(c.yaw) < 0.01 && c.z > 100 && c.z < 300;
  });
  if (!site) throw new Error('no west highway chokepoint');
  return site;
}

/** The car on the site's lane `back` m before it, rolling at `kmh` along the road, `right` m to the right of the lane centre. */
function approach(sim: SimWorld, site: Chokepoint, back: number, kmh: number, right = 0): void {
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
  const x = site.x - fx * back - fz * right, z = site.z - fz * back + fx * right;
  sim.city?.sync(x, z, true);
  sim.vehicle.teleport({ x, y: 0.8, z }, site.yaw);
  // the chase stays on (a roadblock comes down when it ends)
  run(sim, 0.4, (_t, c, s) => { c.brake = 1; s.pursuit.force(); });
  const v = kmh / 3.6;
  sim.vehicle.setVelocity(fx * v, 0, fz * v);
}

function holdSpeed(site: Chokepoint, kmh: number): (t: number, c: unknown, s: SimWorld) => void {
  const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw), v = kmh / 3.6;
  return (_t, _c, s) => {
    s.pursuit.force();
    s.vehicle.setVelocity(fx * v, s.vehicle.telemetry.vy, fz * v);
  };
}

describe('roadblocks', () => {
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

  it('6.3 the sawhorse at 60 km/h: through, a little speed gone, no damage, the bag and the heat', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 60 });
    sim.police!.dispatching = false;
    try {
      const site = westSite(sim);
      (sim.traffic as Traffic).clearAround(site.x, site.z, 80);
      sim.pursuit.force();
      sim.roadblocks!.raise(site);
      approach(sim, site, 40, 60);
      const bag = sim.run.bag, heat = sim.heat.points;
      // held at 60 km/h into it; the speed right after the step that broke it
      const t = runUntil(sim, 4, (s) => !s.roadblocks!.sawhorseUp, holdSpeed(site, 60));
      expect(t).toBeGreaterThan(0);
      const after = Math.hypot(sim.vehicle.body.linvel().x, sim.vehicle.body.linvel().z);
      const loss = 1 - after / (60 / 3.6);
      expect(loss).toBeGreaterThanOrEqual(0.03);
      expect(loss).toBeLessThanOrEqual(0.08);
      run(sim, 0.5);
      expect(sim.life.state.stage).toBe(0);
      expect(sim.run.bag - bag).toBe(BALANCE.bag.roadblock);
      expect(sim.heat.points - heat).toBe(BALANCE.heat.roadblock);
      expect(sim.roadblocks!.active).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);

  it('6.4 the car half at 80 km/h: a compact wrecks; a heavy breaches it with little damage and the car is knocked aside', async () => {
    for (const car of ['compact', 'heavy'] as const) {
      const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 60, car });
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic;
      try {
        const site = westSite(sim);
        traffic.clearAround(site.x, site.z, 80);
        // aimed at the right-hand car of the pair
        sim.pursuit.force();
        sim.roadblocks!.raise(site);
        approach(sim, site, 40, 80, POLICE.roadblock.gap / 2);
        const target = sim.roadblocks!.agents[1];
        const from = { x: traffic.x[target] as number, z: traffic.z[target] as number };
        let hitAt = -1;
        run(sim, 2.5, (tick, c, s) => {
          if (hitAt < 0) holdSpeed(site, 80)(tick, c, s);
          else s.pursuit.force();
          if (hitAt < 0 && s.vehicle.telemetry.impact > 1) hitAt = s.time;
        });
        expect(hitAt).toBeGreaterThan(0);
        if (car === 'compact') {
          expect(sim.life.state.stage).toBe(4);
        } else {
          expect(sim.life.state.stage).toBeLessThan(2);
          expect(traffic.state[target] === AgentState.Disturbed || traffic.state[target] === AgentState.Wrecked).toBe(true);
          expect(Math.hypot((traffic.x[target] as number) - from.x, (traffic.z[target] as number) - from.z)).toBeGreaterThanOrEqual(2);
        }
      } finally { sim.dispose(); }
    }
  }, 120_000);

  it('6.5 the spike at 80 km/h punctures the tyres: less grip and a pull, cured by a swap and by the door', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 60 });
    sim.police!.dispatching = false;
    const traffic = sim.traffic as Traffic;
    try {
      const site = westSite(sim);
      traffic.clearAround(site.x, site.z, 120);
      sim.pursuit.force();
      sim.roadblocks!.raise(site);
      // on the open lane, over the strip
      const rb = sim.roadblocks!;
      const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
      const right = (rb.spikeX - site.x) * -fz + (rb.spikeZ - site.z) * fx;
      approach(sim, site, POLICE.roadblock.spikeBefore + 30, 80, right);
      expect(runUntil(sim, 3, (s) => s.life.spiked, holdSpeed(site, 80))).toBeGreaterThan(0);
      expect(sim.vehicle.gripMul).toBeCloseTo(POLICE.spike.grip, 5);
      expect(Math.abs(sim.vehicle.lateralPull)).toBe(POLICE.spike.pull);
      // a slalom on the open road: the punctured car turns less
      const peak = (s: SimWorld): number => {
        let max = 0;
        const p = westSite(s);
        approach(s, p, 120, 60, 8);
        run(s, 4, (tick, c, w) => {
          c.throttle = 0.6;
          c.steer = Math.sin(tick / 60 * Math.PI) > 0 ? 1 : -1;
          max = Math.max(max, Math.abs(w.vehicle.body.angvel().y));
        });
        return max;
      };
      rb.clear();
      const spikedPeak = peak(sim);
      expect(sim.life.spiked).toBe(true);
      // a swap: fresh tyres
      run(sim, 1, (_t, c) => { c.brake = 1; });
      const p = sim.vehicle.body.translation(), yaw = sim.probe.yaw;
      // the pool is full at density 1: a far civilian makes room for the car to take
      for (let i = 0; i < traffic.capacity; i++) {
        if (traffic.police[i] === 1 || traffic.state[i] !== AgentState.Kinematic) continue;
        if (Math.hypot((traffic.x[i] as number) - p.x, (traffic.z[i] as number) - p.z) < 300) continue;
        traffic.clearAround(traffic.x[i] as number, traffic.z[i] as number, 0.5);
        break;
      }
      expect(traffic.spawnAtPoint(p.x - Math.cos(yaw) * 3.2, p.z + Math.sin(yaw) * 3.2, yaw, 'muscle', AgentState.Abandoned)).toBeGreaterThanOrEqual(0);
      run(sim, 1 / 60, (_t, c) => { c.swap = true; });
      expect(sim.life.spiked).toBe(false);
      expect(sim.vehicle.gripMul).toBe(1);
      expect(sim.vehicle.lateralPull).toBe(0);
      const soundPeak = peak(sim);
      expect(spikedPeak).toBeLessThan(soundPeak);
      // punctured again, and into the hideout: the door fits new tyres
      sim.life.puncture(1);
      const site2 = sim.run.dropOffs[0]!;
      const gx = Math.sin(site2.yaw), gz = Math.cos(site2.yaw);
      sim.city?.sync(site2.x, site2.z, true);
      sim.vehicle.teleport({ x: site2.x - gx * 2, y: 0.8, z: site2.z - gz * 2 }, site2.yaw);
      sim.vehicle.setVelocity(0, 0, 0);
      expect(runUntil(sim, BALANCE.door.closeSeconds + 1, (s) => s.run.state === 'door')).toBeGreaterThan(0);
      expect(sim.life.spiked).toBe(false);
      expect(sim.vehicle.gripMul).toBe(1);
    } finally { sim.dispose(); }
  }, 120_000);

  it('6.6 150 m past it the roadblock clears and its cars pull out into the chase', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 60 });
    sim.police!.dispatching = false;
    const traffic = sim.traffic as Traffic;
    try {
      const site = westSite(sim);
      traffic.clearAround(site.x, site.z, 120);
      sim.pursuit.force();
      sim.roadblocks!.raise(site);
      const cars = [...sim.roadblocks!.agents];
      // round the block on the far lane, keeping the chase on
      approach(sim, site, 20, 70, 8);
      const cleared = runUntil(sim, 12, (s) => s.roadblocks!.active === 0, (tick, c, s) => {
        s.pursuit.force();
        holdSpeed(site, 70)(tick, c, s);
      });
      expect(cleared).toBeGreaterThan(0);
      const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
      expect((sim.probe.x - site.x) * fx + (sim.probe.z - site.z) * fz).toBeGreaterThan(POLICE.roadblock.clearPast - 2);
      run(sim, 3, (_t, _c, s) => s.pursuit.force());
      for (const agent of cars) {
        expect([AgentState.Kinematic, AgentState.Physical]).toContain(traffic.state[agent]);
        expect(Array.from(sim.police!.units)).toContain(agent);
      }
    } finally { sim.dispose(); }
  }, 60_000);
});
