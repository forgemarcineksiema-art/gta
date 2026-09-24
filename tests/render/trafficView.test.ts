/**
 * The traffic's meshes (M7 slice 6): a body's instanced mesh is built the
 * first time a car of that body is drawn, so the fourteen bodies M6 added
 * (most never spawned in a session) cost nothing until they appear.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TrafficView } from '../../src/render/TrafficView';
import { BODY_IDS } from '../../src/sim';
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
      const bodies = new Set<number>();
      for (let i = 0; i < traffic.capacity; i++) if (traffic.state[i] !== AgentState.Free) bodies.add(traffic.body[i] as number);
      expect(view.built).toBe(bodies.size);
      expect(view.built).toBeLessThan(BODY_IDS.length);
      expect(scene.children.length).toBe(bodies.size);
    } finally { sim.dispose(); }
  }, 60_000);
});
