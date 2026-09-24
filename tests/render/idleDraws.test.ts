/**
 * No draw call for nothing (the M7 gate's A/B): three issues a draw call for an instanced mesh of no instances, so
 * the police's liveries, the coins' pools and the debris hide theirs while they are empty, as the traffic's and the
 * walkers' meshes already did. Every instanced mesh in the scene is shown exactly when it has something to draw.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Coins } from '../../src/render/run/Coins';
import { Debris } from '../../src/render/fx/Debris';
import { PoliceView } from '../../src/render/police/PoliceView';
import { buildCarMesh } from '../../src/render/cars/carMesh';
import { CAR_PROFILES } from '../../src/render/cars/carProfiles';
import { CAR_PRESETS } from '../../src/sim';
import { createWorld, run } from '../sim/helpers';

/** The scene's instanced meshes: how many there are, and how many are shown with nothing in them. */
function audit(scene: THREE.Scene): { meshes: number; hidden: number; wrong: number } {
  let meshes = 0, hidden = 0, wrong = 0;
  scene.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh)) return;
    meshes++;
    if (!o.visible) hidden++;
    if (o.visible !== o.count > 0) wrong++;
  });
  return { meshes, hidden, wrong };
}

describe('no draw call for nothing', () => {
  it('M7 G.3 the police liveries, the coins\' pools and the debris are hidden while empty, shown once in use', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    try {
      run(sim, 5);
      const scene = new THREE.Scene();
      const police = new PoliceView(scene, sim, { police: buildCarMesh(CAR_PRESETS.police, CAR_PROFILES.police) });
      police.update(1);
      const p = audit(scene);
      // four liveries of three meshes; at heat 0 the Chief's, at least, is empty
      expect(p.meshes).toBe(12);
      expect(p.hidden).toBeGreaterThanOrEqual(3);
      expect(p.wrong).toBe(0);

      const coinScene = new THREE.Scene();
      const coins = new Coins(coinScene);
      const car = new THREE.Vector3();
      coins.update(sim, 1 / 60, car);
      // the spill and the two flying pools are empty (the laid coins' mesh holds the run's extra coins, if any)
      const idle = audit(coinScene);
      expect(idle.meshes).toBe(4);
      expect(idle.hidden).toBeGreaterThanOrEqual(3);
      expect(idle.wrong).toBe(0);
      // a picked coin flies to the car: its pool is shown while it flies, hidden again after
      sim.events.push('coin', 10, 5, 0.5, 5, 3);
      coins.update(sim, 1 / 60, car);
      expect(audit(coinScene)).toEqual({ ...idle, hidden: idle.hidden - 1 });
      for (let k = 0; k < 120; k++) coins.update(sim, 1 / 60, car);
      expect(audit(coinScene)).toEqual(idle);

      const debrisScene = new THREE.Scene();
      const debris = new Debris(debrisScene);
      debris.update(1 / 60);
      expect(debris.mesh.visible).toBe(false);
      debris.burst(0, 1, 0, 2, 1, 0, 3, 0.3, 0xff0000);
      debris.update(1 / 60);
      expect(debris.mesh.visible).toBe(true);
      for (let k = 0; k < 200; k++) debris.update(1 / 60);
      expect(debris.mesh.visible).toBe(false);
    } finally { sim.dispose(); }
  }, 60_000);
});
