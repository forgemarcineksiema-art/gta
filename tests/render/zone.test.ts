/**
 * A zone job's edge on the grid (M5.5 slice 12): the ring round the zone lies on the ground at its lift, its radius
 * round the zone's middle; its lift not scaled up with its radius (it stood 14 m in the air, found in M8.10 slice 14).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BALANCE, CHAIN_ALL, clearControls } from '../../src/sim';
import { MarkerView } from '../../src/render/run/MarkerView';
import { createWorld } from '../sim/helpers';

describe('a zone job\'s edge on the grid', () => {
  it('lies on the ground round the zone at its lift', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      if (sim.police) sim.police.dispatching = false;
      sim.run.chain = CHAIN_ALL;
      const d = sim.jobs.defs.find((q) => q.kind === 'rage');
      expect(d).toBeDefined();
      if (!d) return;
      sim.vehicle.teleport({ x: d.x, y: 1, z: d.z }, d.yaw);
      sim.vehicle.setVelocity(0, 0, 0);
      for (let i = 0; i < 60 && sim.jobs.active !== d.id; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
      expect(sim.jobs.active).toBe(d.id);
      const view = new MarkerView(new THREE.Scene(), sim);
      view.update(sim, 0);
      const zone = (view as unknown as { zone: THREE.Mesh }).zone, R = BALANCE.jobs.zone.radius;
      expect(zone.visible).toBe(true);
      zone.updateMatrixWorld();
      const pos = zone.geometry.getAttribute('position') as THREE.BufferAttribute, v = new THREE.Vector3();
      for (let k = 0; k < pos.count; k += 7) {
        v.fromBufferAttribute(pos, k).applyMatrix4(zone.matrixWorld);
        expect(v.y).toBeCloseTo(0.09, 4);
        expect(Math.abs(Math.hypot(v.x - d.targetX, v.z - d.targetZ) - R)).toBeLessThan(0.02 * R);
      }
    } finally { sim.dispose(); }
  });
});
