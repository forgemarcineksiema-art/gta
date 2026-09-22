/**
 * Pedestrians: on the footway, diving out of the player's way, never under the
 * car even with the dive disabled, and deterministic from the seed.
 */
import { describe, expect, it } from 'vitest';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { PedPose, type Pedestrians } from '../../src/sim/traffic/Pedestrians';
import type { PlayerProbe, Traffic } from '../../src/sim/traffic/Traffic';
import type { LanePose } from '../../src/sim/traffic/lanes';
import { createWorld, run } from './helpers';

function probe(sim: Awaited<ReturnType<typeof createWorld>>): PlayerProbe {
  const p = sim.vehicle.body.translation();
  const q = sim.transforms.currRot;
  const i = sim.vehicle.slot * 4;
  const yaw = Math.atan2(2 * ((q[i] as number) * (q[i + 2] as number) + (q[i + 3] as number) * (q[i + 1] as number)), 1 - 2 * ((q[i] as number) ** 2 + (q[i + 1] as number) ** 2));
  const tm = sim.vehicle.telemetry;
  const he = sim.vehicle.tuning.chassisHalfExtents;
  return { x: p.x, y: p.y, z: p.z, yaw, vx: tm.vx, vz: tm.vz, speed: Math.hypot(tm.vx, tm.vz), halfWidth: he.x, halfLength: he.z };
}

/** Distance of a walking pedestrian from its lane's polyline, and the road half width of that lane. */
function laneBand(traffic: Traffic, sim: Awaited<ReturnType<typeof createWorld>>, lane: number): { half: number } {
  const l = sim.city?.graph.lanes[lane];
  if (!l) return { half: 12 };
  if (l.highway) return { half: 19 };
  if (l.special) {
    const road = sim.city?.graph.special.find((r) => r.name === l.special);
    if (road) return { half: road.halfWidth };
  }
  void traffic;
  return { half: 12 };
}

describe('pedestrians', () => {
  it('walk on the footway band of their street', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 1, record: false });
    const bot = new TrackBot('muscle', CITY_BOT_TUNING);
    const peds = sim.peds as Pedestrians;
    const traffic = sim.traffic as Traffic;
    const proj = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
    let checked = 0;
    try {
      for (let step = 0; step < 30 * 60; step++) {
        bot.drive(sim, sim.controls, 1 / 60);
        sim.step();
        if (step % 10 !== 0) continue;
        for (let i = 0; i < peds.capacity; i++) {
          if (!peds.active[i] || peds.pose[i] !== PedPose.Walk) continue;
          const lane = peds.lane[i] as number;
          if (lane < 0) continue;
          // only walkers on their line: between two footways a pedestrian crosses the block corner
          traffic.lanes.positionAt(lane, peds.s[i] as number, 9.75, proj);
          const road = sim.city?.graph.lanes[lane];
          if (road?.highway || road?.special) continue;
          if (Math.hypot(proj.x - (peds.x[i] as number), proj.z - (peds.z[i] as number)) > 0.5) continue;
          traffic.lanes.project(lane, peds.x[i] as number, peds.z[i] as number, proj);
          // the lane polyline is 4.5 m (6 m on the highway) right of the centreline; the footway
          // is [half, half + 4.5] from the centreline, so from the lane it is [half - 4.5, half] on streets
          const l = sim.city?.graph.lanes[lane];
          const laneOffset = l?.highway ? 6 : l?.special ? Math.min(4.5, laneBand(traffic, sim, lane).half - 3.5) : 4.5;
          const fromCentre = proj.lateral + laneOffset;
          const half = laneBand(traffic, sim, lane).half;
          expect(fromCentre).toBeGreaterThanOrEqual(half - 0.5);
          expect(fromCentre).toBeLessThanOrEqual(half + 5);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(200);
      expect(peds.count()).toBeGreaterThan(10);
    } finally { sim.dispose(); }
  }, 60_000);

  it('dive out of the way, are never under the car, and walk again', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const peds = sim.peds as Pedestrians;
    const traffic = sim.traffic as Traffic;
    const pose: LanePose = { x: 0, z: 0, yaw: 0 };
    let lane = 0;
    for (let i = 0; i < traffic.lanes.laneCount; i++) if ((traffic.lanes.limit[i] as number) === 14 && (traffic.lanes.length[i] as number) > 120) { lane = i; break; }
    // the player drives along the footway line, straight at a pedestrian 40 m ahead
    traffic.lanes.positionAt(lane, 30, 9.75, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const yaw = pose.yaw;
    traffic.lanes.positionAt(lane, 70, 9.75, pose);
    const ped = peds.spawnAt(pose.x, pose.z, yaw + Math.PI);
    expect(ped).toBeGreaterThanOrEqual(0);
    let divedAtDistance = -1;
    let overlapped = false;
    let events = 0;
    let seq = 0;
    let walkingAgainAt = -1;
    let passedAt = -1;
    try {
      for (let step = 0; step < 6 * 60; step++) {
        if (step < 3 * 60) sim.vehicle.setVelocity(Math.sin(yaw) * (80 / 3.6), 0, Math.cos(yaw) * (80 / 3.6));
        else sim.controls.brake = 1;
        sim.step();
        const pr = probe(sim);
        const d = Math.hypot((peds.x[ped] as number) - pr.x, (peds.z[ped] as number) - pr.z);
        const ahead = ((peds.x[ped] as number) - pr.x) * Math.sin(yaw) + ((peds.z[ped] as number) - pr.z) * Math.cos(yaw) > 0;
        if (divedAtDistance < 0 && peds.pose[ped] === PedPose.Dive) divedAtDistance = d;
        if (peds.overlapsPlayer(pr)) overlapped = true;
        if (passedAt < 0 && !ahead) passedAt = sim.time;
        if (passedAt >= 0 && walkingAgainAt < 0 && peds.pose[ped] === PedPose.Walk) walkingAgainAt = sim.time;
        seq = sim.events.readFrom(seq, (e) => { if (e.kind === 'nearMissPed') events++; });
      }
      expect(divedAtDistance).toBeGreaterThan(8);
      expect(overlapped).toBe(false);
      expect(events).toBe(1);
      expect(walkingAgainAt).toBeGreaterThan(0);
      expect(walkingAgainAt - passedAt).toBeLessThan(3);
      expect(peds.guaranteeHops).toBe(0);
    } finally { sim.dispose(); }
  }, 30_000);

  it('are still never under the car when the dive is switched off', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const peds = sim.peds as Pedestrians;
    const traffic = sim.traffic as Traffic;
    const pose: LanePose = { x: 0, z: 0, yaw: 0 };
    let lane = 0;
    for (let i = 0; i < traffic.lanes.laneCount; i++) if ((traffic.lanes.limit[i] as number) === 14 && (traffic.lanes.length[i] as number) > 120) { lane = i; break; }
    traffic.lanes.positionAt(lane, 30, 9.75, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const yaw = pose.yaw;
    traffic.lanes.positionAt(lane, 70, 9.75, pose);
    const ped = peds.spawnAt(pose.x, pose.z, yaw + Math.PI);
    peds.dodgeEnabled = false;
    let overlapped = false;
    try {
      for (let step = 0; step < 4 * 60; step++) {
        if (step < 3 * 60) sim.vehicle.setVelocity(Math.sin(yaw) * (80 / 3.6), 0, Math.cos(yaw) * (80 / 3.6));
        sim.step();
        if (peds.overlapsPlayer(probe(sim))) overlapped = true;
      }
      expect(overlapped).toBe(false);
      expect(peds.guaranteeHops).toBeGreaterThanOrEqual(1);
      expect(peds.active[ped]).toBe(1);
    } finally { sim.dispose(); }
  }, 30_000);

  it('are identical from the same seed and inputs', async () => {
    const runOnce = async () => {
      const sim = await createWorld({ map: 'city', seed: 7, traffic: 1, peds: 1, record: false });
      try {
        run(sim, 10, (t, c) => { c.throttle = 1; c.steer = Math.sin(t / 40) * 0.4; });
        return { x: Array.from(sim.peds?.x ?? []), z: Array.from(sim.peds?.z ?? []), pose: Array.from(sim.peds?.pose ?? []) };
      } finally { sim.dispose(); }
    };
    expect(await runOnce()).toEqual(await runOnce());
  }, 60_000);
});
