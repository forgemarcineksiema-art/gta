/**
 * The first car, built in code from the tuning's dimensions: a low-poly muscle
 * coupe. Body parts are children of `root` (the chassis body transform); wheels
 * are separate objects driven by their own transform slots.
 */
import * as THREE from 'three';
import { PALETTE, type VehicleTelemetry, type VehicleTuning } from '../sim';

export interface CarMesh {
  root: THREE.Group;
  wheels: THREE.Object3D[];
  update(tm: VehicleTelemetry): void;
}

export function buildCarMesh(t: VehicleTuning, color: number = PALETTE.carRed): CarMesh {
  const root = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: PALETTE.carBlack, flatShading: true });
  const glass = new THREE.MeshLambertMaterial({ color: PALETTE.glass, flatShading: true });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff4c2 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a3a });

  const w = t.chassisHalfExtents.x * 2;
  const l = t.chassisHalfExtents.z * 2;
  const bodyH = 0.55;
  const baseY = t.chassisOffsetY - t.chassisHalfExtents.y;

  const add = (geom: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(geom, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = false;
    root.add(m);
    return m;
  };

  // lower body
  add(new THREE.BoxGeometry(w, bodyH, l), paint, 0, baseY + bodyH / 2, 0);
  // bonnet slope (front, +Z) and boot
  const cabinL = l * 0.42;
  const cabinH = 0.5;
  const cabinZ = -l * 0.05;
  const cabin = new THREE.BoxGeometry(w * 0.86, cabinH, cabinL);
  add(cabin, glass, 0, baseY + bodyH + cabinH / 2 - 0.02, cabinZ);
  // roof cap in paint so the glass reads as windows
  add(new THREE.BoxGeometry(w * 0.86, 0.08, cabinL * 0.7), paint, 0, baseY + bodyH + cabinH, cabinZ);
  // pillars
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.08, cabinH, 0.1), dark, sx * (w * 0.43 - 0.04), baseY + bodyH + cabinH / 2, cabinZ + cabinL / 2 - 0.05);
    add(new THREE.BoxGeometry(0.08, cabinH, 0.1), dark, sx * (w * 0.43 - 0.04), baseY + bodyH + cabinH / 2, cabinZ - cabinL / 2 + 0.05);
  }
  // front bumper lip and rear spoiler
  add(new THREE.BoxGeometry(w * 0.98, 0.16, 0.25), dark, 0, baseY + 0.1, l / 2 - 0.05);
  add(new THREE.BoxGeometry(w * 0.9, 0.06, 0.35), dark, 0, baseY + bodyH + 0.22, -l / 2 + 0.2);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.2, 0.2), dark, sx * w * 0.4, baseY + bodyH + 0.1, -l / 2 + 0.2);
  // lights
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.34, 0.12, 0.05), lightMat, sx * (w / 2 - 0.28), baseY + bodyH * 0.65, l / 2 + 0.01);
    add(new THREE.BoxGeometry(0.34, 0.1, 0.05), tailMat, sx * (w / 2 - 0.28), baseY + bodyH * 0.6, -l / 2 - 0.01);
  }
  // exhausts
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6).rotateX(Math.PI / 2), dark, sx * 0.35, baseY + 0.08, -l / 2 - 0.05);

  const wheels: THREE.Object3D[] = [];
  const tyreGeom = new THREE.CylinderGeometry(t.wheelRadius, t.wheelRadius, t.wheelWidth, 14).rotateZ(Math.PI / 2);
  const rimGeom = new THREE.CylinderGeometry(t.wheelRadius * 0.62, t.wheelRadius * 0.62, t.wheelWidth + 0.02, 6).rotateZ(Math.PI / 2);
  const tyreMat = new THREE.MeshLambertMaterial({ color: PALETTE.tyre, flatShading: true });
  const rimMat = new THREE.MeshLambertMaterial({ color: PALETTE.rim, flatShading: true });
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const tyre = new THREE.Mesh(tyreGeom, tyreMat);
    tyre.castShadow = true;
    const rim = new THREE.Mesh(rimGeom, rimMat);
    g.add(tyre, rim);
    wheels.push(g);
  }

  const brakeLights = root.children.filter((c) => (c as THREE.Mesh).material === tailMat) as THREE.Mesh[];
  const brakeOn = new THREE.Color(0xff5a66);
  const brakeOff = new THREE.Color(0x8a1a22);
  let lastBrake = -1;

  return {
    root,
    wheels,
    update(tm) {
      const braking = tm.throttle === 0 && Math.abs(tm.speed) > 1 ? 1 : 0;
      if (braking !== lastBrake) {
        for (const m of brakeLights) (m.material as THREE.MeshBasicMaterial).color.copy(braking ? brakeOn : brakeOff);
        lastBrake = braking;
      }
    },
  };
}
