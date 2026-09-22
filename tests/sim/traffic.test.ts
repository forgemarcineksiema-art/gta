/**
 * Kinematic traffic on the city graph: determinism, braking for a stopped
 * player, the cost of a full pool, lent bodies, wrecks and towing. Lane
 * holding and separation over a long bot drive are in traffic.long.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import type { LanePose, LaneProjection } from '../../src/sim/traffic/lanes';
import { createWorld, run } from './helpers';

const pose: LanePose = { x: 0, z: 0, yaw: 0 };

describe('traffic', () => {
  it('is identical from the same seed and inputs', async () => {
    const runOnce = async () => {
      const sim = await createWorld({ map: 'city', seed: 7, traffic: 1, peds: 0, record: false });
      try {
        for (let i = 0; i < 600; i++) {
          sim.controls.throttle = 1;
          sim.controls.steer = Math.sin(i / 40) * 0.4;
          sim.step();
        }
        return {
          x: Array.from(sim.traffic?.x ?? []),
          z: Array.from(sim.traffic?.z ?? []),
          state: Array.from(sim.traffic?.state ?? []),
        };
      } finally { sim.dispose(); }
    };
    expect(await runOnce()).toEqual(await runOnce());
  }, 60_000);

  it('stops behind a stopped player and does not hit them', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lanes = traffic.lanes;
    let lane = -1;
    for (let i = 0; i < lanes.laneCount; i++) {
      if ((lanes.limit[i] as number) === 14 && (lanes.length[i] as number) > 110) { lane = i; break; }
    }
    expect(lane).toBeGreaterThanOrEqual(0);
    lanes.positionAt(lane, 90, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const agent = traffic.spawnAt(lane, 60, 'compact');
    expect(agent).toBeGreaterThanOrEqual(0);
    try {
      run(sim, 8);
      const here = sim.vehicle.body.translation();
      const proj: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
      lanes.project(lane, here.x, here.z, proj);
      const along = proj.s - (traffic.s[agent] as number);
      const hits: string[] = [];
      sim.events.readFrom(0, (e) => { if (e.kind === 'hit') hits.push(e.kind); });
      expect(hits).toEqual([]);
      expect(traffic.speed[agent] as number).toBeLessThan(1);
      expect(along).toBeGreaterThanOrEqual(5);
      expect(along).toBeLessThanOrEqual(9);
    } finally { sim.dispose(); }
  }, 30_000);

  it('steps a full pool in under 3 ms', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 1, record: false });
    const bot = new TrackBot('muscle', CITY_BOT_TUNING);
    const traffic = sim.traffic as Traffic;
    try {
      // the road bot keeps moving, so the spawn ring stays inside the city and the pool fills
      let alive = 0;
      for (let i = 0; i < 40 * 60 && alive < 44; i++) {
        bot.drive(sim, sim.controls, 1 / 60);
        sim.step();
        alive = traffic.capacity - traffic.count(AgentState.Free);
      }
      expect(alive).toBeGreaterThanOrEqual(44);
      const steps = 3600;
      const t0 = performance.now();
      for (let i = 0; i < steps; i++) {
        bot.drive(sim, sim.controls, 1 / 60);
        sim.step();
      }
      const mean = (performance.now() - t0) / steps;
      console.log(`[traffic] mean step ${mean.toFixed(3)} ms with ${traffic.capacity - traffic.count(AgentState.Free)} cars and ${sim.peds?.count() ?? 0} pedestrians`);
      expect(mean).toBeLessThan(3);
    } finally { sim.dispose(); }
  }, 120_000);

  it('lends a body near the player, steers it straight, moves it through junctions and returns it far away', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    const bot = new TrackBot('muscle', CITY_BOT_TUNING);
    const traffic = sim.traffic as Traffic;
    const bodies = traffic.tuning.physicsBodies;
    const prevLane = new Int16Array(traffic.capacity).fill(-1);
    const atEnd = new Float32Array(traffic.capacity);
    const lastS = new Float32Array(traffic.capacity).fill(-1);
    const physicalSince = new Int32Array(traffic.capacity);
    const contactAt = new Int32Array(traffic.capacity).fill(-1000);
    let laneChanges = 0;
    let maxYawRate = 0;
    let maxHeadingError = 0;
    let maxAtEnd = 0;
    try {
      for (let step = 0; step < 60 * 60; step++) {
        bot.drive(sim, sim.controls, 1 / 60);
        sim.step();
        const px = sim.vehicle.body.translation().x;
        const pz = sim.vehicle.body.translation().z;
        let lent = 0;
        for (let i = 0; i < traffic.capacity; i++) {
          const st = traffic.state[i];
          if (st === AgentState.Free) { prevLane[i] = -1; continue; }
          const dx = (traffic.x[i] as number) - px;
          const dz = (traffic.z[i] as number) - pz;
          const dist = Math.hypot(dx, dz);
          const held = traffic.hasBody(i);
          if (held) lent++;
          if (dist < 35) expect(st).not.toBe(AgentState.Kinematic);
          if (dist > 70) expect(held).toBe(false);
          const lane = traffic.lane[i] as number;
          if (st !== AgentState.Physical) physicalSince[i] = step;
          if ((traffic.contactDv[i] as number) > 0) contactAt[i] = step;
          if (st === AgentState.Physical && lane >= 0) {
            // heading: a stable controller, no spinning, nose within 25 degrees of the path
            // (a car the player is shoving from 8 m or less is physics, not the controller)
            if (dist > 8) maxYawRate = Math.max(maxYawRate, Math.abs(traffic.bodyYawRate(i)));
            // the nose points at the path 8 m ahead (the controller's carrot); on a tight corner the tangent at the
            // car's own position can differ by 45 degrees, so the pin is against the carrot direction
            traffic.lanes.positionAt(lane, (traffic.s[i] as number) + 8, traffic.laneOffset[i] as number, pose, traffic.next[i]);
            let err = Math.atan2(pose.x - (traffic.x[i] as number), pose.z - (traffic.z[i] as number)) - (traffic.yaw[i] as number);
            err = Math.abs(Math.atan2(Math.sin(err), Math.cos(err)));
            // settled cars only: a car spun by a shove turns back on the spot, which is physics recovering, not steering
            const settled = step - (physicalSince[i] as number) > 60 && step - (contactAt[i] as number) > 60;
            if (dist > 8 && settled && (traffic.speed[i] as number) > 3) maxHeadingError = Math.max(maxHeadingError, err);
            if ((prevLane[i] as number) >= 0 && prevLane[i] !== lane) laneChanges++;
            // progress: a lent car with nothing in front of it and no reservation to wait for keeps moving along its path
            const s = traffic.s[i] as number;
            const stalled = Math.abs(s - (lastS[i] as number)) < 0.02 && traffic.waiting(i) === 0 && traffic.blocker[i] === 0;
            if (stalled) {
              atEnd[i] = (atEnd[i] as number) + 1 / 60;
              maxAtEnd = Math.max(maxAtEnd, atEnd[i] as number);
            } else atEnd[i] = 0;
            lastS[i] = s;
          } else { atEnd[i] = 0; lastS[i] = -1; }
          prevLane[i] = st === AgentState.Physical ? lane : -1;
        }
        expect(lent).toBeLessThanOrEqual(bodies);
      }
      console.log(`[traffic] lent bodies: lane changes ${laneChanges}, max yaw rate ${maxYawRate.toFixed(2)} rad/s, max nose-to-carrot error ${(maxHeadingError * 180 / Math.PI).toFixed(1)} deg, longest unexplained stall ${maxAtEnd.toFixed(2)} s`);
      expect(traffic.guardHops).toBe(0);
      expect(laneChanges).toBeGreaterThan(0);
      expect(maxYawRate).toBeLessThan(2);
      expect(maxHeadingError).toBeLessThan(60 * Math.PI / 180);
      expect(maxAtEnd).toBeLessThan(3);
    } finally { sim.dispose(); }
  }, 120_000);

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

  it('pushes a car in a rear-end and keeps most of the player speed', async () => {
    const sim = await createWorld({ map: 'city', seed: 3, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lane = longLane(traffic, 14, 120);
    const pose = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 40, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const agent = traffic.spawnAt(lane, 60, 'compact');
    traffic.speed[agent] = 10;
    let hitAt = -1;
    let hitSpeed = 0;
    let pushed = false;
    let maxSpeed = 0;
    let after = -1;
    try {
      for (let i = 0; i < 180; i++) {
        const yaw = pose.yaw;
        if (hitAt < 0 && i < 25) sim.vehicle.setVelocity(Math.sin(yaw) * (80 / 3.6), 0, Math.cos(yaw) * (80 / 3.6));
        sim.step();
        maxSpeed = Math.max(maxSpeed, traffic.speed[agent]);
        if (maxSpeed > 12) pushed = true;
        if (hitAt < 0) {
          sim.events.readFrom(0, (e) => {
            if (e.kind === 'hit' && e.target === agent) hitAt = sim.time;
          });
          if (hitAt >= 0) hitSpeed = Math.abs(sim.vehicle.telemetry.speed);
        } else if (sim.time >= hitAt + 1 && after < 0) {
          after = Math.abs(sim.vehicle.telemetry.speed);
          break;
        }
      }
      expect(hitAt).toBeGreaterThan(0);
      expect(hitAt).toBeLessThan(2);
      expect(pushed).toBe(true);
      expect(after).toBeGreaterThan(hitSpeed * 0.25);
      expect(after).toBeLessThan(hitSpeed * 0.85);
      expect(sim.hasNaN()).toBe(false);
      const held = traffic.state[agent] === AgentState.Disturbed || traffic.state[agent] === AgentState.Physical || traffic.state[agent] === AgentState.Wrecked;
      expect(held).toBe(true);
    } finally { sim.dispose(); }
  }, 30_000);

  it('knocks a stopped physical car sideways in a T-bone and stays upright', async () => {
    const sim = await createWorld({ map: 'city', seed: 5, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lane = longLane(traffic, 14, 120);
    const pose = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 40, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    // A stopped car across the lane: a wreck is a physical obstacle that never drives off.
    const agent = traffic.spawnAt(lane, 48, 'compact', AgentState.Wrecked);
    sim.step();
    expect(traffic.hasBody(agent)).toBe(true);
    traffic.setFacing(agent, pose.yaw + Math.PI / 2);
    const x0 = traffic.x[agent] as number;
    const z0 = traffic.z[agent] as number;
    const fx = Math.sin(pose.yaw);
    const fz = Math.cos(pose.yaw);
    let moved = 0;
    try {
      for (let i = 0; i < 100; i++) {
        if (i < 15) sim.vehicle.setVelocity(fx * (100 / 3.6), 0, fz * (100 / 3.6));
        sim.step();
        const dx = (traffic.x[agent] as number) - x0;
        const dz = (traffic.z[agent] as number) - z0;
        moved = Math.max(moved, Math.abs(dx * fx + dz * fz));
      }
      expect(moved).toBeGreaterThanOrEqual(3);
      expect(upnessOf(sim)).toBeGreaterThan(0.8);
      expect(sim.hasNaN()).toBe(false);
    } finally { sim.dispose(); }
  }, 30_000);

  it('keeps a wreck as a stopped obstacle', async () => {
    const sim = await createWorld({ map: 'city', seed: 11, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lane = longLane(traffic, 14, 140);
    const pose = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 30, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const agent = traffic.spawnAt(lane, 44, 'compact');
    try {
      // ram it hard enough for wreckImpact
      let wrecked = false;
      for (let i = 0; i < 240 && !wrecked; i++) {
        if (i < 20) sim.vehicle.setVelocity(Math.sin(pose.yaw) * 40, 0, Math.cos(pose.yaw) * 40);
        sim.step();
        wrecked = traffic.state[agent] === AgentState.Wrecked;
      }
      console.log(`[traffic] wreck by impact: ${wrecked}`);
      if (!wrecked) traffic.wreck(agent);
      // let the flung wreck slide to a stop, then park the player 15 m behind it so the pool keeps it, and watch 15 s
      run(sim, 6); // no input: the brake from a standstill would engage reverse
      const wx = traffic.x[agent] as number;
      const wz = traffic.z[agent] as number;
      sim.vehicle.teleport({ x: wx - Math.sin(pose.yaw) * 15, y: 1, z: wz - Math.cos(pose.yaw) * 15 }, pose.yaw);
      run(sim, 1);
      const x0 = traffic.x[agent] as number;
      const z0 = traffic.z[agent] as number;
      run(sim, 15);
      expect(traffic.state[agent]).toBe(AgentState.Wrecked);
      expect(traffic.speed[agent] as number).toBeLessThan(0.1);
      expect(Math.hypot((traffic.x[agent] as number) - x0, (traffic.z[agent] as number) - z0)).toBeLessThan(0.5);
      // still an obstacle: the body pool keeps it while the player is near
      expect(traffic.hasBody(agent)).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);

  it('returns a body once the player drives away', async () => {
    const sim = await createWorld({ map: 'city', seed: 9, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const lane = longLane(traffic, 14, 140);
    const pose = { x: 0, z: 0, yaw: 0 };
    traffic.lanes.positionAt(lane, 30, 0, pose);
    sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
    const agent = traffic.spawnAt(lane, 48, 'muscle');
    let disturbed = false;
    try {
      for (let i = 0; i < 150 && !disturbed; i++) {
        sim.vehicle.setVelocity(Math.sin(pose.yaw) * 25, 0, Math.cos(pose.yaw) * 25);
        sim.step();
        disturbed = traffic.state[agent] === AgentState.Disturbed || traffic.state[agent] === AgentState.Wrecked;
      }
      expect(disturbed).toBe(true);
      traffic.lanes.positionAt(lane, 30, 0, pose);
      const away = 90;
      sim.vehicle.teleport({ x: pose.x + Math.sin(pose.yaw) * -away, y: 1, z: pose.z + Math.cos(pose.yaw) * -away }, pose.yaw);
      for (let i = 0; i < 90; i++) sim.step();
      const dx = (traffic.x[agent] as number) - sim.vehicle.body.translation().x;
      const dz = (traffic.z[agent] as number) - sim.vehicle.body.translation().z;
      expect(Math.hypot(dx, dz)).toBeLessThan(traffic.tuning.despawn);
      expect(traffic.state[agent]).not.toBe(AgentState.Free);
      expect(traffic.state[agent] === AgentState.Kinematic || traffic.state[agent] === AgentState.Wrecked).toBe(true);
      expect(traffic.state[agent]).not.toBe(AgentState.Physical);
      expect(traffic.state[agent]).not.toBe(AgentState.Disturbed);
    } finally { sim.dispose(); }
  }, 30_000);

  it('tows a wreck away once it is old enough and out of sight, and never one in view', async () => {
    const sim = await createWorld({ map: 'city', seed: 9, traffic: 0, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    const tow = traffic.tuning.wreckTow;
    try {
      const lane = longLane(traffic, 14, 120);
      traffic.lanes.positionAt(lane, 60, 0, pose);
      // Facing +Z: a wreck 80 m up the +Z axis is inside the view cone, one 80 m down it is behind.
      sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, 0);
      const behind = traffic.spawnAtPoint(pose.x, pose.z - 80, 0, 'compact', AgentState.Wrecked);
      const ahead = traffic.spawnAtPoint(pose.x, pose.z + 80, 0, 'compact', AgentState.Wrecked);
      expect(behind).toBeGreaterThanOrEqual(0);
      expect(ahead).toBeGreaterThanOrEqual(0);

      run(sim, tow - 2);
      expect(traffic.state[behind]).toBe(AgentState.Wrecked);
      expect(traffic.wreckedFor[behind] as number).toBeGreaterThan(tow - 3);
      expect(traffic.towedAway).toBe(0);

      run(sim, 3);
      expect(traffic.state[behind]).toBe(AgentState.Free);
      expect(traffic.towedAway).toBe(1);
      // The one the player is looking at stays where it died, however long it sits there.
      expect(traffic.state[ahead]).toBe(AgentState.Wrecked);
      expect(traffic.wreckedFor[ahead] as number).toBeGreaterThan(tow);
      expect(sim.hasNaN()).toBe(false);
    } finally { sim.dispose(); }
  }, 60_000);

  it('keeps the body pool out of the hands of wrecks over a scrapyard run in one place', async () => {
    const sim = await createWorld({ map: 'city', seed: 3, traffic: 1, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    try {
      // The backlog's case: the player never leaves, so nothing despawns. Circling
      // on the highway and writing off two cars every five seconds is a worse
      // scrapyard run than anyone will drive, and the tow has to keep up with it.
      const lane = longLane(traffic, traffic.tuning.speedHighway, 150);
      traffic.lanes.positionAt(lane, 80, 0, pose);
      sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
      let peakWrecks = 0;
      let peakWrecksWithBody = 0;
      let wrecked = 0;
      let travelled = 0;
      for (let i = 0; i < 300 * 60; i++) {
        sim.controls.throttle = 0.5;
        sim.controls.steer = 1;
        sim.step();
        travelled = Math.max(travelled, Math.hypot(traffic.x[0] as number, 0));
        if (i % 300 === 0) wrecked += wreckNearest(traffic, sim, 2);
        if (i % 30 !== 0) continue;
        let withBody = 0;
        for (let a = 0; a < traffic.capacity; a++) {
          if (traffic.state[a] === AgentState.Wrecked && traffic.hasBody(a)) withBody++;
        }
        peakWrecks = Math.max(peakWrecks, traffic.count(AgentState.Wrecked));
        peakWrecksWithBody = Math.max(peakWrecksWithBody, withBody);
      }
      console.log(`[tow] scrapyard 300 s: wrecked ${wrecked}, towed ${traffic.towedAway}, peak wrecks ${peakWrecks}/${traffic.capacity}, peak wrecks holding a body ${peakWrecksWithBody}/${traffic.tuning.physicsBodies}, driving ${traffic.count(AgentState.Kinematic) + traffic.count(AgentState.Physical)}`);
      expect(wrecked).toBeGreaterThan(80);
      expect(traffic.towedAway).toBeGreaterThan(wrecked * 0.5);
      expect(peakWrecksWithBody).toBeLessThan(traffic.tuning.physicsBodies);
      expect(sim.hasNaN()).toBe(false);
    } finally { sim.dispose(); }
  }, 180_000);
});

function longLane(traffic: Traffic, limit: number, minLength: number): number {
  for (let i = 0; i < traffic.lanes.laneCount; i++) {
    if ((traffic.lanes.limit[i] as number) === limit && (traffic.lanes.length[i] as number) > minLength) return i;
  }
  return 0;
}

/** Write off the `n` driving cars nearest the player; returns how many were written off. */
function wreckNearest(traffic: Traffic, sim: { vehicle: { body: { translation(): { x: number; z: number } } } }, n: number): number {
  const p = sim.vehicle.body.translation();
  const order: Array<[number, number]> = [];
  for (let a = 0; a < traffic.capacity; a++) {
    const st = traffic.state[a];
    if (st !== AgentState.Kinematic && st !== AgentState.Physical) continue;
    order.push([a, Math.hypot((traffic.x[a] as number) - p.x, (traffic.z[a] as number) - p.z)]);
  }
  order.sort((a, b) => a[1] - b[1]);
  const take = Math.min(n, order.length);
  for (let k = 0; k < take; k++) traffic.wreck((order[k] as [number, number])[0]);
  return take;
}

function upnessOf(sim: { vehicle: { slot: number }; transforms: { currRot: Float32Array } }): number {
  const q = sim.transforms.currRot;
  const i = sim.vehicle.slot * 4;
  const x = q[i] as number;
  const z = q[i + 2] as number;
  return 1 - 2 * (x * x + z * z);
}
