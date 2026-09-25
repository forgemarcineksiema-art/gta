/**
 * Traffic's own bodies drawn (M5.5 slice 19, docs/DESIGN.md §13.11): every
 * body's instanced geometry is under 3,000 triangles, as long and as wide as
 * its footprint in the sim, on the ground, with paint and fixed colours both
 * present; a taken body's full mesh builds on the same footprint. The bike and
 * its rider (M8.8 slice 15) under their budgets, no car part on the bike, the
 * topper on the helmet.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BODY_PROFILES } from '../../src/render/cars/bodyProfiles';
import { bikeGeometries, riderGeometry } from '../../src/render/cars/bikeMesh';
import { buildCarMesh } from '../../src/render/cars/carMesh';
import { PlayerCar } from '../../src/render/cars/PlayerCar';
import { trafficBodyGeometry } from '../../src/render/traffic/TrafficView';
import { BODY_IDS, CAR_PRESETS, CIVILIAN_BODIES, KIT, KIT_INDEX, Kit, PALETTE, bodySpec, bodyTuning, isCarSlot, type SimWorld } from '../../src/sim';
import { createWorld } from '../sim/helpers';

const triangles = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

describe('traffic\'s own bodies, drawn', () => {
  it('19.5 each body: under 3,000 triangles, its footprint, on the ground, paint and fixed colours', () => {
    for (const id of BODY_IDS) {
      const g = trafficBodyGeometry(id);
      const pos = g.getAttribute('position');
      const mask = g.getAttribute('paintMask');
      expect(pos.count / 3, id).toBeLessThan(3000);
      g.computeBoundingBox();
      const box = g.boundingBox as THREE.Box3;
      const spec = bodySpec(id);
      // bumpers stand proud of the caps; mirrors of the flanks
      expect(box.max.z, id).toBeGreaterThan(spec.halfLength - 0.15);
      expect(box.max.z, id).toBeLessThan(spec.halfLength + 0.15);
      expect(box.min.z, id).toBeLessThan(-spec.halfLength + 0.15);
      expect(Math.max(box.max.x, -box.min.x), id).toBeLessThan(spec.halfWidth + 0.4);
      expect(box.min.y, id).toBeGreaterThanOrEqual(-1e-6);
      let painted = 0;
      for (let i = 0; i < mask.count; i++) painted += mask.getX(i);
      expect(painted, id).toBeGreaterThan(0);
      expect(painted, id).toBeLessThan(mask.count);
      g.dispose();
    }
  });

  it('19.6 a taken body\'s full mesh builds on its footprint', () => {
    for (const id of CIVILIAN_BODIES) {
      const car = buildCarMesh(bodyTuning(id), BODY_PROFILES[id], 0x808182);
      const body = car.root.getObjectByName('body-and-trim') as THREE.Mesh;
      body.geometry.computeBoundingBox();
      const box = body.geometry.boundingBox as THREE.Box3;
      const spec = bodySpec(id);
      expect(box.max.z - box.min.z, id).toBeGreaterThan(spec.halfLength * 2 - 0.1);
      expect(box.max.z - box.min.z, id).toBeLessThan(spec.halfLength * 2 + 0.4);
      expect(car.wheels.length).toBe(4);
      body.geometry.dispose();
    }
  });
});

describe('M8.8 slice 15: the bike and its rider, drawn', () => {
  it('M8.8 15.1 the rider under 1,500 triangles in either pose, the bike under 3,000', () => {
    const t = CAR_PRESETS.moto;
    for (const pose of ['bars', 'up'] as const) {
      const g = riderGeometry(t, pose);
      expect(triangles(g), pose).toBeLessThan(1500);
      g.dispose();
    }
    const bike = bikeGeometries(t, PALETTE.carMagenta);
    expect(triangles(bike.body.geometry) + triangles(bike.fork.geometry) + 2 * triangles(bike.wheel)).toBeLessThan(3000);
  });

  it('M8.8 15.2 no car part fits the bike, the rest of the kit does; the topper seats on the helmet', async () => {
    const kit = new Kit({} as SimWorld);
    for (let i = 0; i < KIT.length; i++) {
      const item = KIT[i] as (typeof KIT)[number];
      expect(kit.fits(i, 'moto'), item.id).toBe(!isCarSlot(item.slot));
      expect(kit.fits(i, 'muscle'), item.id).toBe(true);
    }
    const sim = await createWorld({ spawn: 'lot', car: 'moto' });
    try {
      const player = new PlayerCar(new THREE.Scene(), sim);
      const duck = KIT_INDEX['duck'] as number;
      sim.kit.owned[duck] = 1;
      expect(sim.kit.wear(duck)).toBe(true);
      player.sync();
      const holder = player.mesh.root.getObjectByName('topper-duck')?.parent;
      expect(holder?.parent).toBe(player.mesh.root);
      // on the crown: the rider's top in the riding pose, over the helmet's middle
      const rider = (player.mesh.root.getObjectByName('rider') as THREE.Mesh).geometry;
      rider.computeBoundingBox();
      const top = (rider.boundingBox as THREE.Box3).max.y;
      const pos = rider.getAttribute('position');
      let z = 0, n = 0;
      for (let k = 0; k < pos.count; k++) if (pos.getY(k) > top - 0.05) { z += pos.getZ(k); n++; }
      expect(Math.abs((holder?.position.y ?? 0) - top)).toBeLessThan(0.05);
      expect(Math.abs((holder?.position.z ?? 0) - z / n)).toBeLessThan(0.05);
      expect(holder?.position.x).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);
});
