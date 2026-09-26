/**
 * Identity (docs/history/M4_PLAN.md slice 5, DESIGN.md §2.5): a swap in sight only
 * changes the descriptor; a swap nobody saw ends the chase and the units box
 * the abandoned car, then withdraw; a police car is a disguise until a crime
 * is seen from it; the door and a swap out clear a blown cover. City, seed
 * 42, traffic on.
 * Long (M7 slice 0): moved out of the quick verify's minute; `npm run verify:gate` runs it.
 */
import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { BALANCE } from '../../src/sim/balance';
import { GARAGE } from '../../src/sim/city/cover';
import type { Lane } from '../../src/sim/city/roads';
import { POLICE } from '../../src/sim/police/tuning';
import type { SimWorld } from '../../src/sim';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run, runUntil } from './helpers';

/** A straight street lane and its pose at `s`. */
function street(sim: SimWorld, s: number): { lane: number; x: number; z: number; yaw: number } {
  const lanes = (sim.traffic as Traffic).lanes;
  for (let i = 0; i < lanes.laneCount; i++) {
    const lane = sim.city!.graph.lanes[i]!;
    if (lane.highway || lane.special || lane.points.length !== 2 || (lanes.length[i] as number) < 150) continue;
    const pose = { x: 0, z: 0, yaw: 0 };
    lanes.positionAt(i, s, 0, pose);
    return { lane: i, ...pose };
  }
  throw new Error('no straight street lane');
}

/** The car stopped at a pose, settled on its wheels (a swap needs two on the ground). */
function place(sim: SimWorld, x: number, z: number, yaw: number): void {
  sim.city?.sync(x, z, true);
  sim.vehicle.teleport({ x, y: 0.8, z }, yaw);
  sim.vehicle.setVelocity(0, 0, 0);
  run(sim, 0.6, (_t, c) => { c.brake = 1; });
}

/** A police car on a lane, in the roster; the traffic pool is full at density 1, so a far civilian makes room. */
function enlist(sim: SimWorld, lane: number, s: number): number {
  const traffic = sim.traffic as Traffic;
  let agent = traffic.spawnAt(lane, s, 'police');
  if (agent < 0) {
    for (let i = 0; i < traffic.capacity && agent < 0; i++) {
      if (traffic.police[i] === 1 || traffic.state[i] !== AgentState.Kinematic) continue;
      if (Math.hypot((traffic.x[i] as number) - sim.probe.x, (traffic.z[i] as number) - sim.probe.z) < 300) continue;
      traffic.clearAround(traffic.x[i] as number, traffic.z[i] as number, 0.5);
      agent = traffic.spawnAt(lane, s, 'police');
    }
  }
  traffic.police[agent] = 1;
  expect(sim.police!.enlist(agent)).toBeGreaterThanOrEqual(0);
  return agent;
}

/** A stopped car `right` m to the right of the player: a swap candidate. */
function beside(sim: SimWorld, kind: 'compact' | 'police', right = 3.2): number {
  const p = sim.vehicle.body.translation();
  const yaw = sim.probe.yaw || 0;
  const traffic = sim.traffic as Traffic;
  const x = p.x - Math.cos(yaw) * right, z = p.z + Math.sin(yaw) * right;
  return kind === 'police' ? traffic.spawnParkedPolice(x, z, yaw, 'police') : traffic.spawnAtPoint(x, z, yaw, kind, AgentState.Abandoned);
}

function swapNow(sim: SimWorld): void {
  run(sim, 1 / 60, (_t, c) => { c.swap = true; });
}

function escapes(sim: SimWorld, from: number): number {
  let n = 0;
  sim.events.readFrom(from, (e) => { if (e.kind === 'escape') n++; });
  return n;
}

/**
 * A corner where two units on the approach to a junction cannot see a
 * player standing round it: lane A into the junction, lane B turning out of
 * it, the rays from both units to the player blocked by a building. The
 * shortest such drive.
 */
function corner(sim: SimWorld): { a: number; b: number; sa: number[]; sb: number } {
  const traffic = sim.traffic as Traffic;
  const lanes = traffic.lanes;
  const graph = sim.city!.graph;
  const pose = { x: 0, z: 0, yaw: 0 };
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  const blocked = (fx: number, fz: number, tx: number, tz: number): boolean => {
    const dx = tx - fx, dz = tz - fz, dy = 0.7 - POLICE.sightHeight;
    const len = Math.hypot(dx, dy, dz);
    ray.origin = { x: fx, y: POLICE.sightHeight, z: fz };
    ray.dir = { x: dx / len, y: dy / len, z: dz / len };
    return sim.world.castRay(ray, len, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS) !== null;
  };
  let best: { a: number; b: number; sa: number[]; sb: number } | null = null, bestLen = Infinity;
  for (let a = 0; a < lanes.laneCount; a++) {
    const la = graph.lanes[a] as Lane;
    if (la.highway || la.special || Math.abs(graph.nodes[la.to]!.x) > 450 || Math.abs(graph.nodes[la.to]!.z) > 450) continue;
    const lenA = lanes.length[a] as number;
    for (const b of lanes.outs(a)) {
      const lb = graph.lanes[b] as Lane;
      if (lb.highway || lb.special || lanes.straightThrough(a, b) || b === lanes.uturn(a)) continue;
      for (const e of [12, 16, 20, 25, 30, 35]) {
        lanes.positionAt(b, e, 0, pose);
        const px = pose.x, pz = pose.z;
        sim.city!.sync(px, pz, true);
        // freshly loaded colliders join the ray queries on the next physics step
        sim.world.step();
        for (const d of [5, 10, 15, 20, 25, 30]) {
          if (d + e + 10 >= bestLen) continue;
          const sa = [lenA - d, lenA - d - 10];
          const ok = sa.every((s) => { lanes.positionAt(a, s, 0, pose); return blocked(pose.x, pose.z, px, pz); });
          if (ok) { best = { a, b, sa, sb: e }; bestLen = d + e + 10; }
        }
      }
    }
    if (best && bestLen <= 40) break;
  }
  if (!best) throw new Error('no blind corner');
  return best;
}

describe('identity', () => {
  it('5.1 a swap a unit sees changes the descriptor and the chase goes on', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 20 });
    sim.police!.dispatching = false;
    try {
      const { lane, x, z, yaw } = street(sim, 100);
      place(sim, x, z, yaw);
      const unit = enlist(sim, lane, 55);
      sim.pursuit.force();
      run(sim, 0.2);
      const p = sim.probe;
      expect(sim.police!.canSee(unit, p, Math.hypot((sim.traffic!.x[unit] as number) - p.x, (sim.traffic!.z[unit] as number) - p.z))).toBe(true);
      expect(sim.police!.crimeSeen()).toBe(true);
      beside(sim, 'compact');
      const seq = sim.events.sequence;
      swapNow(sim);
      expect(sim.carId).toBe('compact');
      expect(sim.pursuit.descriptor.kind).toBe('compact');
      expect(sim.pursuit.state).not.toBe('idle');
      expect(escapes(sim, seq)).toBe(0);
      expect(sim.police!.boxing).toBe(false);
    } finally { sim.dispose(); }
  }, 60_000);

  it('5.2 / 5.7 a swap round a blind corner ends the chase at once; the units box the car left behind, then withdraw without seeing the player', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 20 });
    sim.police!.dispatching = false;
    const traffic = sim.traffic as Traffic;
    try {
      const c = corner(sim);
      const pose = { x: 0, z: 0, yaw: 0 };
      traffic.lanes.positionAt(c.b, c.sb, 0, pose);
      place(sim, pose.x, pose.z, pose.yaw);
      traffic.clearAround(pose.x, pose.z, 60);
      const units = c.sa.map((s) => enlist(sim, c.a, s));
      run(sim, 1 / 60);
      for (const u of units) {
        const d = Math.hypot((traffic.x[u] as number) - sim.probe.x, (traffic.z[u] as number) - sim.probe.z);
        expect(sim.police!.canSee(u, sim.probe, d)).toBe(false);
      }
      beside(sim, 'compact');
      sim.pursuit.force();
      const seq = sim.events.sequence;
      const left = { x: sim.probe.x, z: sim.probe.z };
      swapNow(sim);
      expect(sim.pursuit.state).toBe('idle');
      expect(sim.pursuit.cooldown).toBe(0);
      expect(escapes(sim, seq)).toBe(1);
      expect(sim.police!.boxing).toBe(true);
      expect(Math.hypot(sim.police!.boxX - left.x, sim.police!.boxZ - left.z)).toBeLessThan(0.5);
      // the player sits in the new car beside the old one (in reach of the bodies); the units close on the one left behind
      const dist = (u: number): number => Math.hypot((traffic.x[u] as number) - left.x, (traffic.z[u] as number) - left.z);
      // held still on the handbrake (M8.6 gate: the foot brake held at a standstill is reverse, and the car backed 21 m
      // into the units on their way)
      const boxedAt = runUntil(sim, POLICE.box.maxSeconds, () => units.every((u) => dist(u) < POLICE.box.range && (traffic.speed[u] as number) < 1),
        (_t, ctl) => { ctl.handbrake = 1; });
      expect(boxedAt).toBeGreaterThan(0);
      expect(sim.pursuit.state).toBe('idle');
      // they hold it while the timer runs from the first arrival
      run(sim, 1);
      expect(sim.police!.boxing).toBe(true);
      for (const u of units) expect(dist(u)).toBeLessThan(POLICE.box.range);
      const at = units.map(dist);
      // then they leave, and nobody takes up the chase while they are still near (5.7)
      run(sim, POLICE.box.seconds + 1.5);
      expect(sim.police!.boxing).toBe(false);
      units.forEach((u, k) => expect(dist(u)).toBeGreaterThan(at[k]! + 3));
      expect(sim.pursuit.state).toBe('idle');
    } finally { sim.dispose(); }
  }, 120_000);

  it('5.3 in a borrowed patrol car at heat 40 the police pass the player by until the dispatcher notices', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 40 });
    const traffic = sim.traffic as Traffic;
    try {
      // the swap before any unit is on the road to see it; then the level's roster comes on duty
      sim.police!.dispatching = false;
      run(sim, 0.6);
      beside(sim, 'police', 3.5);
      swapNow(sim);
      sim.police!.dispatching = true;
      expect(sim.carId).toBe('police');
      expect(sim.pursuit.disguised).toBe(true);
      const bot = new TrackBot('police', CITY_BOT_TUNING);
      // a unit on the road ahead, which the bot catches up with and follows
      let closeAndSeen = 0;
      let ahead = -1;
      let idle = true;
      // inside the cover: nobody detects the patrol car, even following a unit
      run(sim, POLICE.disguise.seconds - 2, (_t, c, s) => {
        bot.drive(s, c, 1 / 60);
        if (ahead < 0 && s.time > 2) {
          const lane = traffic.lanes;
          const proj = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
          const l = s.city!.nearestLane(s.probe.x, s.probe.z);
          lane.project(l, s.probe.x, s.probe.z, proj);
          if ((lane.length[l] as number) - proj.s > 80) ahead = enlist(s, l, proj.s + 40);
        }
        if (s.pursuit.state !== 'idle' || s.pursuit.visible) idle = false;
        for (const u of s.police!.units) {
          if (u < 0) continue;
          const d = Math.hypot((traffic.x[u] as number) - s.probe.x, (traffic.z[u] as number) - s.probe.z);
          if (d < 25 && s.police!.crimeSeen()) closeAndSeen++;
        }
      });
      expect(idle).toBe(true);
      expect(closeAndSeen).toBeGreaterThan(0);
      expect(sim.heat.level).toBe(2);
      // then the dispatcher notices the missing unit: the cover is blown (DESIGN.md §12's fallback, measured in slice 5)
      expect(runUntil(sim, 3, (s) => s.pursuit.blown, (_t, c, s) => bot.drive(s, c, 1 / 60))).toBeGreaterThan(0);
    } finally { sim.dispose(); }
  }, 120_000);

  it('5.4 a takedown in a unit\'s sight blows the cover inside a step, and the next sight tick detects the police car', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 40 });
    sim.police!.dispatching = false;
    try {
      const { lane, x, z, yaw } = street(sim, 90);
      place(sim, x, z, yaw);
      beside(sim, 'police', 3.5);
      swapNow(sim);
      enlist(sim, lane, 60);
      run(sim, 0.5);
      expect(sim.police!.crimeSeen()).toBe(true);
      expect(sim.pursuit.state).toBe('idle');
      // the takedown's own detection has its M3 pins; this pins what the police make of one
      sim.events.push('takedownTraffic', 0.5, sim.probe.x, 0, sim.probe.z, -1);
      run(sim, 1 / 60);
      expect(sim.pursuit.blown).toBe(true);
      const t = runUntil(sim, (POLICE.sightEveryTicks + 1) / 60, (s) => s.pursuit.state !== 'idle');
      expect(t).toBeGreaterThan(0);
      expect(sim.pursuit.descriptor.kind).toBe('police');
    } finally { sim.dispose(); }
  }, 60_000);

  it('5.5 a swap out of the cruiser clears a blown cover, and so does the door', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 20 });
    sim.police!.dispatching = false;
    try {
      const { x, z, yaw } = street(sim, 90);
      place(sim, x, z, yaw);
      beside(sim, 'police', 3.5);
      swapNow(sim);
      sim.pursuit.markBlown(x, z);
      expect(sim.pursuit.blown).toBe(true);
      run(sim, 0.2);
      beside(sim, 'compact');
      swapNow(sim);
      expect(sim.pursuit.blown).toBe(false);
      // back into a police car, blown, and into the hideout: the door clears it
      run(sim, 0.2);
      beside(sim, 'police', 3.5);
      swapNow(sim);
      sim.pursuit.markBlown(x, z);
      const site = sim.run.dropOffs[0]!;
      const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
      place(sim, site.x - fx * 2, site.z - fz * 2, site.yaw);
      expect(runUntil(sim, BALANCE.door.closeSeconds + 1, (s) => s.run.state === 'door')).toBeGreaterThan(0);
      expect(sim.pursuit.blown).toBe(false);
      expect(GARAGE.depth).toBeGreaterThan(4);
    } finally { sim.dispose(); }
  }, 60_000);

  it('5.6 a billboard smashed unseen in a police car still costs heat, and nobody comes', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 20 });
    sim.police!.dispatching = false;
    try {
      const p = sim.vehicle.body.translation();
      const board = sim.city!.chunk(Math.round(p.x / 225), Math.round(p.z / 225)).billboards[0]!;
      const nx = Math.sin(board.yaw), nz = Math.cos(board.yaw);
      const yaw = Math.atan2(-nx, -nz);
      place(sim, board.x + nx * 15, board.z + nz * 15, yaw);
      run(sim, 0.3);
      beside(sim, 'police', 3.5);
      swapNow(sim);
      place(sim, board.x + nx * 15, board.z + nz * 15, yaw);
      run(sim, 0.3);
      const before = sim.heat.points;
      const v = 60 / 3.6;
      expect(runUntil(sim, 3, (s) => s.collectibles!.smashed[board.id] === 1,
        (_t, _c, s) => s.vehicle.setVelocity(Math.sin(yaw) * v, s.vehicle.telemetry.vy, Math.cos(yaw) * v))).toBeGreaterThan(0);
      run(sim, 0.1);
      expect(sim.heat.points - before).toBe(BALANCE.heat.billboard);
      expect(sim.pursuit.blown).toBe(false);
      expect(sim.pursuit.state).toBe('idle');
    } finally { sim.dispose(); }
  }, 60_000);
});
