/**
 * Life extras (M5.5 slice 17, BACKLOG Life): the downtown crossings' traffic
 * lights hold a car at the line through the other arms' green, past the
 * junction wait and without a honk, and let it go on its own green; the
 * kerbside bays hold parked cars (civilian bodies that fit a bay, apart from
 * the moving traffic's count), and one alongside is a swap candidate.
 * Long (M7 slice 0): moved out of the quick verify's minute; `npm run verify:gate` runs it.
 */
import { describe, expect, it } from 'vitest';
import { signalledNodes } from '../../src/sim/city/signals';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { BODY_INDEX } from '../../src/sim/traffic/bodies';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

describe('traffic lights', () => {
  it('17.1 a car arriving on red waits at the line past the junction wait, no honk, and goes on its green', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic;
      const graph = sim.city!.graph;
      // the centre crossing has lights; the highway's do not
      const centre = graph.nodes.find((n) => n.x === 0 && n.z === 0)!;
      expect(signalledNodes(graph)).toContain(centre.id);
      expect(traffic.signalPhase(graph.nodes.find((n) => n.x === -675 && n.z === 0)!.id)).toBe(-1);
      // the player down the south arm, out of the crossing but inside the traffic's reach
      sim.city?.sync(0, -150, true);
      sim.vehicle.teleport({ x: -3, y: 1, z: -150 }, 0);
      run(sim, 0.3);
      const lane = graph.lanes.find((l) => l.to === centre.id && !l.highway && l.special === undefined && traffic.axisOf(l.id) === 0)!;
      const len = traffic.lanes.length[lane.id] as number;
      // the Z arms' green with 12 s of it left: this X arm waits about 16 s
      const s = TRAFFIC.signals;
      const half = s.green + s.amber + s.allRed;
      traffic.clock = half + 2 - 12;
      expect(traffic.signalPhase(centre.id)).toBe(3);
      const a = traffic.spawnAt(lane.id, len - 60, 'sedan', AgentState.Kinematic);
      traffic.speed[a] = 10;
      traffic.pace[a] = 1;
      traffic.bad[a] = 0;
      let honks = 0;
      const seq = sim.events.sequence;
      const redFor = 2 * half - (half + 2) - 0.5;
      run(sim, redFor);
      sim.events.readFrom(seq, (e) => { if (e.kind === 'honk' && e.target === a) honks++; });
      expect(redFor).toBeGreaterThan(TRAFFIC.junctionWait);
      expect(traffic.lane[a]).toBe(lane.id);
      expect(traffic.s[a] as number).toBeGreaterThan(len - 12);
      expect(traffic.speed[a]).toBeLessThan(0.3);
      expect(honks).toBe(0);
      // its green: into the crossing within a few seconds
      run(sim, 1);
      expect(traffic.signalPhase(centre.id)).toBe(0);
      let left = false;
      run(sim, 9, () => { if (traffic.lane[a] !== lane.id) left = true; });
      expect(left).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);
});

describe('parked cars', () => {
  it('17.2 the bays near the player hold parked civilians, off the moving count; one alongside is a swap candidate', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic;
      const bays = sim.city!.roadMarkings.parking;
      run(sim, 2);
      const parked: number[] = [];
      for (let i = 0; i < traffic.capacity; i++) if (traffic.parkedCiv[i] === 1) parked.push(i);
      expect(parked.length).toBeGreaterThan(0);
      expect(parked.length).toBeLessThanOrEqual(TRAFFIC.parked.max);
      for (const i of parked) {
        expect(traffic.state[i]).toBe(AgentState.Parked);
        expect(traffic.police[i]).toBe(0);
        const body = traffic.body[i] as number;
        expect([BODY_INDEX.bus, BODY_INDEX.truck, BODY_INDEX.icecream]).not.toContain(body);
        expect(body).toBeGreaterThanOrEqual(BODY_INDEX.sedan);
        const x = traffic.x[i] as number, z = traffic.z[i] as number;
        expect(Math.min(...bays.map((b) => Math.hypot(b.x - x, b.z - z)))).toBeLessThan(0.6);
      }
      // the moving traffic keeps its own count
      let moving = 0;
      for (let i = 0; i < traffic.capacity; i++) if (traffic.state[i] !== AgentState.Free && traffic.parkedCiv[i] === 0) moving++;
      expect(moving).toBeLessThanOrEqual(TRAFFIC.agents);
      // alongside one, stopped: the swap takes it
      const a = parked[0] as number;
      const yaw = traffic.yaw[a] as number;
      let candidate = -1;
      for (const side of [1, -1]) {
        const lx = Math.cos(yaw) * side, lz = -Math.sin(yaw) * side;
        sim.city?.sync(traffic.x[a] as number, traffic.z[a] as number, true);
        sim.vehicle.teleport({ x: (traffic.x[a] as number) + lx * 3.4, y: 1, z: (traffic.z[a] as number) + lz * 3.4 }, yaw);
        run(sim, 0.8);
        candidate = sim.life.state.swapCandidate;
        if (candidate === a) break;
      }
      expect(candidate).toBe(a);
      const body = traffic.bodyOf(a);
      sim.controls.swap = true;
      sim.step();
      expect(sim.carBody).toBe(body);
      expect(traffic.parkedCiv[a]).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);
});
