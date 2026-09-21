import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAR_IDS, CAR_PRESETS, type VehicleTelemetry } from '../../src/sim';
import { CAR_PROFILES } from '../../src/render/carProfiles';
import { buildCarMesh } from '../../src/render/carMesh';

describe.each(CAR_IDS)('%s visual assembly', (id) => {
  const tuning = CAR_PRESETS[id];
  const car = buildCarMesh(tuning, CAR_PROFILES[id]);
  const body = car.root.children[0] as THREE.Mesh<THREE.BufferGeometry>;
  const wheel = car.wheels[0]?.children[0] as THREE.Mesh<THREE.BufferGeometry>;
  const y0 = tuning.wheelRadius + tuning.suspensionRestLength
    - tuning.mass * (9.81 + tuning.extraGravity) / 4 / tuning.suspensionStiffness - tuning.suspensionAttachY;

  it('has open wheel wells on both sides and exposed wheel faces', () => {
    body.updateMatrixWorld(true);
    for (const side of [-1, 1]) for (const z of [-tuning.wheelBase / 2, tuning.wheelBase / 2]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(side * 3, tuning.wheelRadius + 0.035 - y0, z), new THREE.Vector3(-side, 0, 0), 0, 2.35);
      expect(ray.intersectObject(body)).toHaveLength(0);
    }
    wheel.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(2, tuning.wheelRadius * 0.4, 0), new THREE.Vector3(-1, 0, 0));
    const hit = ray.intersectObject(wheel)[0];
    expect(hit?.face).toBeTruthy();
    const color = wheel.geometry.getAttribute('color');
    expect(color.getX(hit?.face?.a ?? 0)).toBeGreaterThan(0.3);
  });

  it('stays under 7000 triangles with five meshes and finite geometry', () => {
    let meshes = 0, triangles = 0;
    for (const object of [car.root, ...car.wheels]) object.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      meshes++;
      const g = o.geometry as THREE.BufferGeometry;
      triangles += (g.index?.count ?? g.getAttribute('position').count) / 3;
      for (const attribute of ['position', 'normal', 'color']) expect(Array.from(g.getAttribute(attribute).array).every(Number.isFinite)).toBe(true);
    });
    expect(meshes).toBe(5);
    expect(triangles).toBeLessThan(7000);
    expect(car.wheels).toHaveLength(4);
  });

  it('updates brake and reverse colours without changing geometry or reallocating buffers', () => {
    const tm = { brake: 0, gear: 1 } as VehicleTelemetry;
    car.update(tm);
    const colors = body.geometry.getAttribute('color');
    const positions = body.geometry.getAttribute('position').array;
    const idle = Array.from(colors.array);
    car.update({ ...tm, brake: 1 });
    const braking = Array.from(colors.array);
    expect(braking).not.toEqual(idle);
    car.update({ ...tm, gear: -1 });
    expect(Array.from(colors.array)).not.toEqual(braking);
    expect(Array.from(colors.array)).not.toEqual(idle);
    car.update(tm);
    expect(Array.from(colors.array)).toEqual(idle);
    expect(body.geometry.getAttribute('color')).toBe(colors);
    expect(body.geometry.getAttribute('position').array).toBe(positions);
  });
});
