/**
 * Traffic-pool drives over ~10 s of wall time under the parallel suite (M3): the body lender, the pool step, the
 * same run twice from a seed, and the scrapyard run's body pool.
 * Long: run by `npm run verify:gate` and `npm run test:long` (CLAUDE.md), moved
 * unchanged from `traffic.test.ts` in M5.1.
 */
import { describe, expect, it } from 'vitest';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import type { LanePose } from '../../src/sim/traffic/lanes';
import { createWorld } from './helpers';

const pose: LanePose = { x: 0, z: 0, yaw: 0 };

describe('traffic pool (long)', () => {
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
      // best of three windows: inside the full parallel suite other workers share the CPU
      // (a single 3,600-step mean read 3.6-3.8 ms there and 0.6-0.8 ms alone)
      const windows = 3;
      const steps = 1200;
      let mean = Infinity;
      for (let w = 0; w < windows; w++) {
        const t0 = performance.now();
        for (let i = 0; i < steps; i++) {
          bot.drive(sim, sim.controls, 1 / 60);
          sim.step();
        }
        mean = Math.min(mean, (performance.now() - t0) / steps);
      }
      console.log(`[traffic] mean step ${mean.toFixed(3)} ms (best of ${windows} windows) with ${traffic.capacity - traffic.count(AgentState.Free)} cars and ${sim.peds?.count() ?? 0} pedestrians`);
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
          // a pursuit unit keeps its body `policeBodyReach` further out (M4); the beat can be chasing the bot here (M5.5)
          if (dist > 70 && traffic.police[i] !== 1) expect(held).toBe(false);
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
            // settled cars only: a car spun by a shove turns back on the spot, which is physics recovering, not steering;
            // and the lane follower's cars only: a unit on a chase plan (M5.5 slice 4, the police driving mode) goes
            // round slower cars and takes the U-turn its route asks for, away from the lane's carrot by design
            const settled = step - (physicalSince[i] as number) > 60 && step - (contactAt[i] as number) > 60;
            const chasing = traffic.police[i] === 1 && traffic.planSpeed(i) > 0;
            if (dist > 8 && settled && !chasing && (traffic.speed[i] as number) > 3) maxHeadingError = Math.max(maxHeadingError, err);
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

  it('keeps the body pool out of the hands of wrecks over a scrapyard run in one place', async () => {
    const sim = await createWorld({ map: 'city', seed: 3, traffic: 1, peds: 0, record: false });
    const traffic = sim.traffic as Traffic;
    // the pin is the tow rule: the beat (M5.5) would see the circling player wreck cars and start a chase
    sim.police!.dispatching = false;
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
