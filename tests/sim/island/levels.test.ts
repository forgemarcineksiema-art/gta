/**
 * The island's roads cross one over another (the highway over the quay sweep and the gardens' passage, in its tunnel under
 * the hill, the dry canal under its bridges): what happens on one road stays on it. The second bug hunt, 2026-09-27
 * (docs/PROGRESS.md): each of these was a check in plan only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BALANCE, POLICE, clearControls, type SimWorld } from '../../../src/sim';
import type { Island } from '../../../src/sim/island/Island';
import { canalBed } from '../../../src/sim/island/shapes/works';
import { atFinish } from '../../../src/sim/jobs/finish';
import { AgentState, type Traffic } from '../../../src/sim/traffic/Traffic';
import { createWorld } from '../helpers';

describe('the island\'s stacked roads', () => {
  let sim: SimWorld;
  beforeAll(async () => { sim = await createWorld({ map: 'island', seed: 42, traffic: 0, peds: 0, record: false }); }, 60_000);
  afterAll(() => sim.dispose());

  /** The highway's lane and distance right over the road `under`, and that road's lane under it. */
  function overpass(under: string): { high: number; s: number; low: number; lowS: number } {
    const island = sim.island as Island, traffic = sim.traffic as Traffic, net = island.network, lanes = traffic.lanes;
    let best = { d: Infinity, high: -1, x: 0, z: 0, low: -1 };
    for (const h of net.graph.lanes) {
      if (!h.highway) continue;
      for (const q of h.points) for (const l of net.graph.lanes) {
        if (net.laneRoad[l.id] !== under) continue;
        for (const p of l.points) {
          const d = Math.hypot(q.x - p.x, q.z - p.z);
          if ((q.y ?? 0) - (p.y ?? 0) > 3 && d < best.d) best = { d, high: h.id, x: q.x, z: q.z, low: l.id };
        }
      }
    }
    const proj = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
    lanes.project(best.high, best.x, best.z, proj);
    const s = proj.s;
    lanes.project(best.low, best.x, best.z, proj);
    return { high: best.high, s, low: best.low, lowS: proj.s };
  }

  /** The player put at `s` m along `lane`, stopped there. */
  function stopAt(lane: number, s: number): void {
    const lanes = (sim.traffic as Traffic).lanes, pose = { x: 0, z: 0, yaw: 0, y: 0 };
    lanes.positionAt(lane, s, 0, pose);
    sim.spawnAtPoint({ name: 'here', position: { x: pose.x, y: lanes.heightAt(lane, s) + 1, z: pose.z }, yaw: pose.yaw });
    for (let i = 0; i < 90; i++) { clearControls(sim.controls); sim.controls.handbrake = 1; sim.step(); }
  }

  it('18.15 two units on the street under a deck do not bust the player stopped on it', () => {
    const traffic = sim.traffic as Traffic, police = sim.police, lanes = traffic.lanes;
    expect(police).not.toBeNull();
    if (!police) return;
    const o = overpass('quay-sweep');
    stopAt(o.high, o.s);
    police.dispatching = false;
    const cosHalf = Math.cos(POLICE.viewHalfAngleDeg * Math.PI / 180);
    const units: number[] = [];
    for (const back of [20, 35]) {
      const a = traffic.spawnPoliceAt(o.low, Math.max(4, o.lowS - back), 'police', sim.probe, POLICE.viewNear, cosHalf, 3, -1, true);
      if (a >= 0) { police.enlist(a); units.push(a); }
    }
    expect(units.length).toBe(2);
    expect(sim.probe.y - 0.5 - lanes.heightAt(o.low, o.lowS)).toBeGreaterThan(3);
    sim.heat.set((BALANCE.heatThresholds[1] ?? 40) + 1);
    sim.pursuit.force(30);
    // they drive in under the deck (the probe's six runs were busted in 4.8 to 7.9 s)
    let under = 0;
    for (let i = 0; i < 60 * 10 && sim.run.state !== 'busted'; i++) {
      clearControls(sim.controls); sim.controls.handbrake = 1; sim.step();
      if (i % 30 === 0) under = Math.max(under, units.filter((a) => Math.hypot((traffic.x[a] as number) - sim.probe.x, (traffic.z[a] as number) - sim.probe.z) < 12).length);
    }
    expect(under).toBeGreaterThan(0);
    expect(sim.run.state).not.toBe('busted');
    for (const a of units) traffic.remove(a);
    sim.heat.set(0);
    sim.pursuit.reset();
  });

  it('18.16 a car on the highway drives on over a player stopped on the street under it', () => {
    const traffic = sim.traffic as Traffic;
    const o = overpass('quay-sweep');
    stopAt(o.low, o.lowS);
    const a = traffic.spawnAt(o.high, Math.max(1, o.s - 60), 'sedan', AgentState.Kinematic);
    expect(a).toBeGreaterThanOrEqual(0);
    // it braked to a stop 6 m short of the player's point in plan and stood there
    for (let i = 0; i < 60 * 6; i++) { clearControls(sim.controls); sim.controls.handbrake = 1; sim.step(); }
    expect(traffic.lane[a] !== o.high || (traffic.s[a] as number) > o.s + 20).toBe(true);
    traffic.remove(a);
  });

  it('18.17 a finish on the hill is not reached in the tunnel under it (Neon Niko\'s duel ends 17.7 m over it)', () => {
    const island = sim.island as Island;
    const x = 657, z = 431, ground = island.ground.surfaceHeight(x, z);
    let tunnel = Infinity, d = Infinity;
    for (const l of island.network.graph.lanes) {
      if (!l.highway) continue;
      for (const p of l.points) if (Math.hypot(p.x - x, p.z - z) < d) { d = Math.hypot(p.x - x, p.z - z); tunnel = p.y ?? 0; }
    }
    expect(d).toBeLessThan(12);
    expect(ground - tunnel).toBeGreaterThan(15);
    expect(atFinish(sim, x, z, tunnel)).toBe(false);
    expect(atFinish(sim, x, z, ground)).toBe(true);
  });

  it('18.18 a car driving the dry canal passes under its bridges\' lamps', () => {
    const x0 = -600, z0 = 289;
    sim.spawnAtPoint({ name: 'canal', position: { x: x0, y: canalBed(x0, z0) + 1.2, z: z0 }, yaw: -Math.PI / 2 });
    for (let i = 0; i < 20; i++) { clearControls(sim.controls); sim.controls.handbrake = 1; sim.step(); }
    let cursor = sim.events.sequence, smashes = 0;
    for (let i = 0; i < 60 * 8 && sim.probe.x > -700; i++) {
      clearControls(sim.controls); sim.controls.throttle = 1; sim.step();
      cursor = sim.events.readFrom(cursor, (e) => { if (e.kind === 'smash') smashes++; });
    }
    // under both lamps of the bridge at x -640 (the probe smashed both at 18 m/s, heat 0 to 6)
    expect(sim.probe.x).toBeLessThan(-660);
    expect(smashes).toBe(0);
  });
});
