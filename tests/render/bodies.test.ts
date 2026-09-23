/**
 * Traffic's own bodies drawn (M5.5 slice 19, docs/DESIGN.md §13.11): every
 * body's instanced geometry is under 3,000 triangles, as long and as wide as
 * its footprint in the sim, on the ground, with paint and fixed colours both
 * present; a taken body's full mesh builds on the same footprint.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildBodyGeometry } from '../../src/render/bodyMesh';
import { BODY_PROFILES } from '../../src/render/bodyProfiles';
import { buildCarMesh } from '../../src/render/carMesh';
import { BODY_IDS, CIVILIAN_BODIES, bodySpec, bodyTuning } from '../../src/sim';

describe('traffic\'s own bodies, drawn', () => {
  it('19.5 each body: under 3,000 triangles, its footprint, on the ground, paint and fixed colours', () => {
    for (const id of BODY_IDS) {
      const g = buildBodyGeometry(BODY_PROFILES[id], bodyTuning(id));
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
