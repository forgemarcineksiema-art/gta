/** M8.10 slice 13: the island's streets as the traffic reads them, and a second of its life (docs/M8.10_PLAN.md). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearControls, type SimWorld } from '../../../src/sim';
import type { Island } from '../../../src/sim/island/Island';
import { AgentState, type Traffic } from '../../../src/sim/traffic/Traffic';
import { createWorld } from '../helpers';

describe('M8.10 slice 13: the island\'s streets', () => {
  // one island for both: 13.5 drives on from 13.0's second
  let sim: SimWorld;
  beforeAll(async () => { sim = await createWorld({ map: 'island', seed: 42, traffic: 1, peds: 1, record: false }); }, 60_000);
  afterAll(() => sim.dispose());

  it('13.0 lights at the avenues\' junctions, bays, footways, heights; the traffic, the walkers and the police run', () => {
    const island = sim.island as Island, traffic = sim.traffic as Traffic, streets = traffic.streets;
    expect(streets.signals.length).toBeGreaterThan(5);
    expect(streets.bays.length).toBeGreaterThan(150);
    // a lit junction's arriving ways in two phases
    for (const id of streets.signals) {
      const phases = new Set(streets.graph.lanes.filter((l) => l.to === id).map((l) => streets.signalAxis(l)));
      expect(phases.size, `the light at node ${id}`).toBe(2);
    }
    expect(streets.graph.lanes.filter((l) => Number.isFinite(streets.footway(l))).length).toBeGreaterThan(200);
    expect(sim.police).not.toBeNull();
    for (let i = 0; i < 60; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
    // the cars on the road's surface, across the junctions too (the highway's in its tunnel and on its decks not)
    let moving = 0;
    for (let i = 0; i < traffic.pool; i++) {
      if (traffic.state[i] !== AgentState.Kinematic) continue;
      moving++;
      const lane = streets.graph.lanes[traffic.lane[i] as number];
      if (lane?.highway) continue;
      expect(Math.abs((traffic.y[i] as number) - island.ground.surfaceHeight(traffic.x[i] as number, traffic.z[i] as number)), `a car at ${(traffic.x[i] as number).toFixed(0)}, ${(traffic.z[i] as number).toFixed(0)}`).toBeLessThan(0.3);
    }
    expect(moving).toBeGreaterThan(5);
    expect(sim.peds?.count() ?? 0).toBeGreaterThan(5);
  });

  it('13.5 a car lent its body near the player keeps to the road across a junction on a hill', () => {
    const island = sim.island as Island, traffic = sim.traffic as Traffic, lanes = traffic.lanes, graph = traffic.streets.graph;
    // the junction whose road climbs furthest from where its arriving lane ends: a lent body held at that end's height
    // sank into it (the bug hunt's chase: 3.9 m) and rose out of it at the next lane
    let from = -1, to = -1, rise = 0;
    graph.lanes.forEach((l, i) => {
      if (l.highway) return;
      const len = lanes.length[i] as number, end = lanes.heightAt(i, len);
      for (const n of lanes.outs(i)) {
        const across = lanes.connectionLength(i, n);
        for (let c = 0; c <= across; c += 1) {
          const d = Math.abs(lanes.heightOn(i, len + c, n) - end);
          if (d > rise) { rise = d; from = i; to = n; }
        }
      }
    });
    expect(rise).toBeGreaterThan(1.5);
    // the player stopped 45 m on along the next lane, a car 15 m short of the junction: within the bodies' 40 m
    const at = { x: 0, z: 0, yaw: 0, y: 0 };
    lanes.positionAt(to, Math.min(45, (lanes.length[to] as number) - 1), 0, at);
    island.sync(at.x, at.z, true);
    sim.vehicle.teleport({ x: at.x, y: (at.y ?? 0) + 0.8, z: at.z }, at.yaw);
    const a = traffic.spawnAt(from, Math.max(0, (lanes.length[from] as number) - 15), 'sedan');
    expect(a).toBeGreaterThanOrEqual(0);
    traffic.next[a] = to;
    // every car lent its body round the player (off the highway's decks), on its lane and across the junctions (the one put
    // there queues in the junction behind the cars ahead and the player)
    let worst = 0, across = 0;
    for (let i = 0; i < 60 * 20 && traffic.lane[a] === from; i++) {
      clearControls(sim.controls); sim.controls.brake = 1; sim.step();
      for (let k = 0; k < traffic.pool; k++) {
        const lane = traffic.lane[k] as number;
        if (traffic.state[k] !== AgentState.Physical || lane < 0 || graph.lanes[lane]?.highway) continue;
        if ((traffic.s[k] as number) > (lanes.length[lane] as number)) across++;
        worst = Math.max(worst, Math.abs((traffic.y[k] as number) - island.ground.surfaceHeight(traffic.x[k] as number, traffic.z[k] as number)));
      }
    }
    expect(traffic.lane[a] !== from || (traffic.s[a] as number) > (lanes.length[from] as number)).toBe(true);
    expect(across).toBeGreaterThan(30);
    // within half a metre (the lanes' heights sampled along their line, a body's sway across a hill's camber: 0.38 m at
    // most), not the 3.5 m it sank into the junction
    expect(worst).toBeLessThan(0.5);
  });

  it("13.6 a car given back to its lane off it on a hill is drawn on the ground it left, not at its lane point's height", () => {
    const island = sim.island as Island, traffic = sim.traffic as Traffic, lanes = traffic.lanes, graph = traffic.streets.graph;
    // the lane that starts steepest (off the highway's decks), and a point 8 m back down its line, on the hill
    let lane = -1, grade = 0;
    graph.lanes.forEach((l, i) => {
      if (l.highway || (lanes.length[i] as number) < 20) return;
      const g = Math.abs(lanes.heightAt(i, 6) - lanes.heightAt(i, 0)) / 6;
      if (g > grade) { grade = g; lane = i; }
    });
    expect(grade).toBeGreaterThan(0.12);
    const l = graph.lanes[lane] as { x0: number; z0: number; yaw0: number };
    const bx = l.x0 - Math.sin(l.yaw0) * 8, bz = l.z0 - Math.cos(l.yaw0) * 8, by = island.ground.surfaceHeight(bx, bz);
    const a = traffic.spawnAt(lane, 10, 'sedan');
    expect(a).toBeGreaterThanOrEqual(0);
    // an AI car's record on this lane at its start while the car is still 8 m short of it (on the junction's curve):
    // given back, it blends over a second from where the car was (the second bug hunt's third: 1.7 m under the road)
    traffic.puppetOn(a, 1e6);
    traffic.puppetPose(a, bx, by, bz, { x: 0, y: Math.sin(l.yaw0 / 2), z: 0, w: Math.cos(l.yaw0 / 2) }, 10, lane, 0);
    traffic.puppetOff(a);
    expect(traffic.blending(a)).toBe(true);
    expect(Math.hypot((traffic.x[a] as number) - bx, (traffic.z[a] as number) - bz)).toBeLessThan(0.5);
    expect(Math.abs((traffic.y[a] as number) - by)).toBeLessThan(0.3);
    traffic.remove(a);
  });
});
