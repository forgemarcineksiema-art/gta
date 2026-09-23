/**
 * Roadblocks and spike strips (docs/M4_PLAN.md slice 6); the placement pin
 * (6.1, 6.2) is in roadblocks.long.test.ts. The sawhorse as the weak
 * point; the car half, which only the heavy breaches; the spike's puncture
 * and its cure; the block clearing behind the player. City, seed 42, traffic
 * on, heat 60.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import type { Chokepoint } from '../../src/sim/city/cover';
import type { Lane } from '../../src/sim/city/roads';
import { POLICE } from '../../src/sim/police/tuning';
import type { SimWorld } from '../../src/sim';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run, runUntil } from './helpers';

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
      // the forced pursuit drips heat meanwhile (M5.5): the breach's points plus under a second of chase
      expect(Math.floor(sim.heat.points - heat)).toBe(BALANCE.heat.roadblock);
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
