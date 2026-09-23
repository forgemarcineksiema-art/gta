/**
 * The overpass ramps drawn as built (M5.5 play fix, 2026-09-23): the city geometry applies a pitched static's
 * whole rotation, not only its yaw, so each ramp piece lies on the profile the physics drives. Drawn level, the
 * pieces were steps up to a metre tall at their middle heights, the cars sinking into the steps' fronts.
 */
import { expect, it } from 'vitest';
import * as THREE from 'three';
import { cityGeometry } from '../../src/render/CityView';
import { overpassStatics } from '../../src/sim/city/overpass';
import { BLOCK, OVERPASS, OVERPASS_NODES, overpassProfile } from '../../src/sim/city/roads';

it('draws each ramp on its profile, along X and along Z', () => {
  // k 0 runs along X (the ring's south side), k 3 along Z (its east side)
  for (const k of [0, 3]) {
    const [gx, gz] = OVERPASS_NODES[k] as readonly [number, number];
    const alongX = Math.abs(gz) === 3;
    const geometry = cityGeometry(overpassStatics(k));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    const ray = new THREE.Raycaster(), from = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
    try {
      let worst = 0;
      for (const sign of [-1, 1]) for (let d = OVERPASS.deck + 1; d < OVERPASS.deck + OVERPASS.ramp - 1; d += 0.5) {
        // a lane's middle, clear of the painted lines
        const u = sign * d, v = 4;
        ray.set(from.set(gx * BLOCK + (alongX ? u : v), 20, gz * BLOCK + (alongX ? v : u)), down);
        const hit = ray.intersectObject(mesh)[0];
        expect(hit, `k ${k} at ${u}`).toBeDefined();
        worst = Math.max(worst, Math.abs((hit as THREE.Intersection).point.y - overpassProfile(u)));
      }
      // the chords of 10 m pieces sag under 5 cm from the smoothstep
      expect(worst).toBeLessThan(0.1);
    } finally { geometry.dispose(); }
  }
});
