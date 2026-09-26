/**
 * Damage pins (docs/history/M3_PLAN.md slice 5, bands from the calibration table under
 * its section 3.4): a 100 km/h head-on wrecks, 60 km/h dents, a glance and a
 * prop cost nothing; a wreck cannot drive and respawns rolling on the road
 * with a clean car and its boost; hits on traffic count less.
 * Long (M7 slice 0): moved out of the quick verify's minute; `npm run verify:gate` runs it.
 */
import { describe, expect, it } from 'vitest';
import { DAMAGE } from '../../src/sim/economy';
import type { Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, kmh, position, run } from './helpers';

const WALL_X = 257;

async function launch(deg: number, kmhIn: number) {
  // the playground keeps damage off for the M1 pins; these tests switch it on
  const sim = await createWorld({ spawn: 'walls', car: 'muscle', damage: true });
  run(sim, 1);
  const th = (deg * Math.PI) / 180;
  sim.vehicle.teleport({ x: WALL_X - 8, y: 0.6, z: 20 }, th);
  run(sim, 0.5);
  const v = kmhIn / 3.6;
  sim.vehicle.body.setLinvel({ x: Math.sin(th) * v, y: 0, z: Math.cos(th) * v }, true);
  return sim;
}

describe('damage', () => {
  it('bands: 100 km/h head-on wrecks, 60 dents, 40 scuffs, a glance and a prop cost nothing', async () => {
    const hundred = await launch(90, 100);
    try {
      run(hundred, 2);
      expect(hundred.life.state.damage).toBe(1);
      expect(hundred.life.state.stage).toBe(4);
      expect(hundred.life.state.wrecked).toBe(true);
    } finally { hundred.dispose(); }
    const sixty = await launch(90, 60);
    try {
      run(sixty, 2);
      expect(sixty.life.state.damage).toBeGreaterThan(0.3);
      expect(sixty.life.state.damage).toBeLessThan(0.6);
      expect(sixty.life.state.stage).toBe(1);
    } finally { sixty.dispose(); }
    const forty = await launch(90, 40);
    try {
      run(forty, 2);
      expect(forty.life.state.damage).toBeGreaterThan(0.1);
      expect(forty.life.state.damage).toBeLessThan(0.3);
    } finally { forty.dispose(); }
    const glance = await launch(20, 100);
    try {
      run(glance, 3, (_t, c) => { c.throttle = 1; });
      expect(glance.life.state.damage).toBeLessThan(0.1);
    } finally { glance.dispose(); }
    // the lot boxes (the wall test's prop case): a real impact, no damage
    const lot = await createWorld({ spawn: 'lot', car: 'muscle', damage: true });
    try {
      run(lot, 1);
      lot.vehicle.teleport({ x: 28, y: 0.6, z: -60 }, 0);
      run(lot, 0.5);
      lot.vehicle.body.setLinvel({ x: 0, y: 0, z: 60 / 3.6 }, true);
      let maxImpact = 0;
      run(lot, 3, (_t, c) => { c.throttle = 1; maxImpact = Math.max(maxImpact, lot.vehicle.telemetry.impact); });
      expect(maxImpact).toBeGreaterThan(0.05);
      expect(lot.life.state.damage).toBe(0);
    } finally { lot.dispose(); }
  }, 60_000);

  it('a wreck cannot drive, respawns rolling on the road with a clean car, and R respawns at once', async () => {
    const sim = await launch(90, 100);
    try {
      run(sim, 1.5);
      expect(sim.life.state.wrecked).toBe(true);
      const boost = sim.vehicle.boostMeter;
      const p0 = position(sim);
      run(sim, 1.4, (_t, c) => { c.throttle = 1; });
      const p1 = position(sim);
      // the bounce off the wall is still settling; full throttle adds nothing to it
      expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(2.5);
      expect(sim.life.state.respawnIn).toBeGreaterThan(0);
      expect(sim.life.state.respawnIn).toBeLessThan(DAMAGE.wreckRespawn);
      let respawnedAt = -1;
      run(sim, DAMAGE.wreckRespawn + 0.5, (_t, _c, s) => { if (respawnedAt < 0 && s.respawned) respawnedAt = s.time; });
      expect(respawnedAt).toBeGreaterThan(0);
      expect(sim.life.state.wrecked).toBe(false);
      expect(sim.life.state.damage).toBe(0);
      expect(sim.life.state.stage).toBe(0);
      expect(sim.vehicle.engineCut).toBe(false);
      expect(sim.vehicle.boostMeter).toBeGreaterThanOrEqual(boost - 0.001); // kept (airtime off the wall may even add a little)
      // rolling: the respawn gave it a start; on the playground the reset pose is the nearest spawn point
      expect(kmh(sim)).toBeGreaterThan(5);
      const events: string[] = [];
      sim.events.readFrom(0, (e) => events.push(e.kind));
      expect(events).toContain('wrecked');
      expect(events).toContain('respawn');
    } finally { sim.dispose(); }
    const quick = await launch(90, 100);
    try {
      run(quick, 1.5);
      expect(quick.life.state.wrecked).toBe(true);
      run(quick, 0.2, (_t, c) => { c.reset = true; });
      expect(quick.life.state.wrecked).toBe(false);
      expect(quick.life.state.damage).toBe(0);
    } finally { quick.dispose(); }
  }, 60_000);

  it('a rear-end on traffic costs little', async () => {
    const sim = await createWorld({ map: 'city', seed: 3, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    let lane = 0;
    for (let i = 0; i < traffic.lanes.laneCount; i++) if ((traffic.lanes.limit[i] as number) === 14 && (traffic.lanes.length[i] as number) > 120) { lane = i; break; }
    const pose = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 40, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const agent = traffic.spawnAt(lane, 60, 'compact');
    traffic.speed[agent] = 10;
    try {
      for (let i = 0; i < 180; i++) {
        if (i < 25) sim.vehicle.setVelocity(Math.sin(pose.yaw) * (80 / 3.6), 0, Math.cos(pose.yaw) * (80 / 3.6));
        sim.step();
      }
      let hits = 0;
      sim.events.readFrom(0, (e) => { if (e.kind === 'hit' && e.target === agent) hits++; });
      expect(hits).toBeGreaterThan(0);
      expect(sim.life.state.damage).toBeLessThan(0.3);
    } finally { sim.dispose(); }
  }, 30_000);
});
