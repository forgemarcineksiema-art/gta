/**
 * The traffic's meshes (M7 slice 6): a body's instanced mesh is built the
 * first time a car of that body is drawn, so the fourteen bodies M6 added
 * (most never spawned in a session) cost nothing until they appear; the
 * couriers on driven two-wheelers (M8.8 slice 16) likewise.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TrafficView } from '../../src/render/traffic/TrafficView';
import { BODY_IDS, bodyTuning } from '../../src/sim';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from '../sim/helpers';

describe('the traffic view', () => {
  it('M7 6.2 a body\'s mesh is built the first time a car of it is drawn, and only then', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    try {
      const scene = new THREE.Scene();
      const view = new TrafficView(scene, sim.traffic as Traffic);
      expect(view.built).toBe(0);
      run(sim, 5);
      view.update(sim.transforms, 1);
      const traffic = sim.traffic as Traffic;
      const bodies = new Set<number>(), ridden = new Set<number>();
      for (let i = 0; i < traffic.capacity; i++) {
        if (traffic.state[i] === AgentState.Free) continue;
        bodies.add(traffic.body[i] as number);
        // a courier on a driven two-wheeler (M8.8 slice 16): its own mesh, built with the first one
        const driven = traffic.state[i] === AgentState.Kinematic || traffic.state[i] === AgentState.Physical || traffic.state[i] === AgentState.Disturbed;
        if (driven && bodyTuning(traffic.bodyOf(i)).twoWheel > 0) ridden.add(traffic.body[i] as number);
      }
      expect(view.built).toBe(bodies.size);
      expect(view.built).toBeLessThan(BODY_IDS.length);
      expect(view.ridersBuilt).toBe(ridden.size);
      expect(scene.children.length).toBe(bodies.size + ridden.size);
    } finally { sim.dispose(); }
  }, 60_000);
});
