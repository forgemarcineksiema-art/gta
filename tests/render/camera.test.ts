/**
 * Camera comfort contract: steering alone cannot swing the view; actual
 * corners stay readable without excessive yaw lag. Supersedes the M1 lead pins.
 * Pure math in Node: a synthetic car object and telemetry, no WebGL.
 */
import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { ChaseCamera, SIDE_CUT, sideCutEye } from '../../src/render/camera/ChaseCamera';
import type { VehicleTelemetry } from '../../src/sim';

function telemetry(over: Partial<VehicleTelemetry> = {}): VehicleTelemetry {
  return {
    speed: 20, speedKmh: 72, drifting: false, driftAngleDeg: 0, boost: 0, boosting: false, airborne: false, tumbling: false, groundedWheels: 4,
    steer: 0, steerDeg: 0, gear: 3, rpm: 3000, load: 0.5, throttle: 1, airTime: 0, driftTime: 0, maxSlipDeg: 0, maxSlipRatio: 0,
    minSlipRatio: 0, shifting: false, landingImpact: 0, brake: 0, driftDistance: 0, vx: 0, vy: 0, vz: 20, yawRate: 0, gLong: 0, gLat: 0, gVert: 0,
    impact: 0, scrape: 0, contactSide: 0, contactX: 0, contactY: 0, contactZ: 0, contactNx: 0, contactNy: 0, contactNz: 0,
    hitHandle: -1, hitImpulse: 0,
    ...over,
  };
}

/** Runs the camera for `seconds` on a car moving at 20 m/s with the given yaw rate and steer. */
function settle(yawRate: number, steer: number, seconds = 3, hz = 60): { yawOffsetDeg: number; sideOffset: number } {
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  const chase = new ChaseCamera(cam);
  const car = new THREE.Object3D();
  const vel = new THREE.Vector3();
  let yaw = 0;
  const dt = 1 / hz;
  for (let i = 0; i < seconds * hz; i++) {
    yaw += yawRate * dt;
    car.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    vel.set(Math.sin(yaw) * 20, 0, Math.cos(yaw) * 20);
    car.position.addScaledVector(vel, dt);
    chase.update(car, vel, telemetry({ yawRate, steer, vx: vel.x, vz: vel.z }), dt, i === 0);
  }
  // the view direction's yaw relative to the car's nose, and the look point's offset to the car's left
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const viewYaw = Math.atan2(dir.x, dir.z);
  let d = viewYaw - yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  // project the point 8 m along the view ray onto the car's left axis
  const left = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const toPoint = dir.clone().multiplyScalar(cam.position.distanceTo(car.position) + 4).add(cam.position).sub(car.position);
  return { yawOffsetDeg: (d * 180) / Math.PI, sideOffset: toPoint.dot(left) };
}

describe('chase camera comfort', () => {
  test('straight ahead the view is centred on the nose', () => {
    const r = settle(0, 0);
    expect(Math.abs(r.yawOffsetDeg)).toBeLessThan(0.5);
    expect(Math.abs(r.sideOffset)).toBeLessThan(0.05);
  });

  test('a sustained corner stays within nine degrees of the road heading', () => {
    const r = settle(0.6, -0.4);
    expect(Math.abs(r.yawOffsetDeg)).toBeLessThan(9);
    expect(Math.abs(r.sideOffset)).toBeLessThan(1);
  });

  test('a right turn mirrors it', () => {
    const l = settle(0.6, -0.4);
    const r = settle(-0.6, 0.4);
    expect(r.yawOffsetDeg).toBeCloseTo(-l.yawOffsetDeg, 1);
    expect(r.sideOffset).toBeCloseTo(-l.sideOffset, 1);
  });

  test('steering alone cannot rotate the view before the car actually turns', () => {
    const r = settle(0, -0.4);
    expect(Math.abs(r.sideOffset)).toBeLessThan(0.05);
    expect(Math.abs(r.yawOffsetDeg)).toBeLessThan(0.5);
  });
  test('sustained corner framing agrees at 30, 60 and 120 Hz', () => {
    const reference = settle(0.6, -0.4, 4, 60);
    for (const hz of [30, 120]) {
      const actual = settle(0.6, -0.4, 4, hz);
      expect(Math.abs(actual.yawOffsetDeg - reference.yawOffsetDeg)).toBeLessThan(0.6);
      expect(Math.abs(actual.sideOffset - reference.sideOffset)).toBeLessThan(0.1);
    }
  });

  test('a brief course correction stays smooth and recentres after release', () => {
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    const chase = new ChaseCamera(cam), car = new THREE.Object3D(), vel = new THREE.Vector3();
    chase.tuning.shakeAmount = 0;
    let yaw = 0, previous = 0, peakRate = 0;
    const view = new THREE.Vector3();
    for (let i = 0; i < 240; i++) {
      const yawRate = i >= 60 && i < 72 ? 0.6 : i >= 72 && i < 84 ? -0.6 : 0;
      yaw += yawRate / 60;
      car.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      vel.set(Math.sin(yaw) * 20, 0, Math.cos(yaw) * 20);
      car.position.addScaledVector(vel, 1 / 60);
      chase.update(car, vel, telemetry({ yawRate, steer: -Math.sign(yawRate) * 0.4 }), 1 / 60, i === 0);
      cam.getWorldDirection(view);
      const angle = Math.atan2(view.x, view.z);
      if (i > 0) peakRate = Math.max(peakRate, Math.abs(angle - previous) * 60 * 180 / Math.PI);
      previous = angle;
    }
    expect(peakRate).toBeLessThan(40);
    expect(Math.abs(previous * 180 / Math.PI)).toBeLessThan(0.5);
  });
});

/** Car-swap whip and takedown focus: fast but never a cut, and always released. */
describe('chase camera whip and focus', () => {
  const HZ = 60;
  const dt = 1 / HZ;
  function rig() {
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    const chase = new ChaseCamera(cam);
    const car = new THREE.Object3D();
    const vel = new THREE.Vector3();
    const drive = (yaw: number, seconds: number, first = false) => {
      for (let i = 0; i < seconds * HZ; i++) {
        car.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        vel.set(Math.sin(yaw) * 20, 0, Math.cos(yaw) * 20);
        car.position.addScaledVector(vel, dt);
        chase.update(car, vel, telemetry({ vx: vel.x, vz: vel.z }), dt, first && i === 0);
      }
    };
    const behind = (yaw: number): { along: number; side: number } => {
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const dx = cam.position.x - car.position.x, dz = cam.position.z - car.position.z;
      return { along: dx * fx + dz * fz, side: dx * -fz + dz * fx };
    };
    return { cam, chase, car, vel, drive, behind };
  }

  test('a swap whips the view behind a car heading 90 degrees away within half a second, without a cut', () => {
    const r = rig();
    r.drive(0, 2, true);
    // the new car: 6 m to the side, heading +x
    const yaw = Math.PI / 2;
    r.car.position.x -= 6;
    r.chase.whip(0.35);
    let maxDist = 0;
    for (let i = 0; i < 0.5 * HZ; i++) {
      r.drive(yaw, dt);
      maxDist = Math.max(maxDist, r.cam.position.distanceTo(r.car.position));
    }
    const b = r.behind(yaw);
    expect(b.along).toBeLessThan(-3);                 // behind the car
    expect(Math.abs(b.side)).toBeLessThan(2.5);        // and on its axis
    expect(maxDist).toBeLessThan(25);                  // it swung round, it did not fly off
    // the same turn without a whip is still far from behind after half a second (the whip is what did it)
    const s = rig();
    s.drive(0, 2, true);
    s.car.position.x -= 6;
    for (let i = 0; i < 0.5 * HZ; i++) s.drive(yaw, dt);
    expect(Math.abs(s.behind(yaw).side)).toBeGreaterThan(2.5);
  });

  test('a focus looks at the target within 0.3 s and returns within 0.6 s of release', () => {
    const r = rig();
    r.drive(0, 2, true);
    const target = new THREE.Vector3(r.car.position.x + 20, 0.8, r.car.position.z + 25);
    const angleTo = (): number => {
      const dir = new THREE.Vector3();
      r.cam.getWorldDirection(dir);
      const want = target.clone().sub(r.cam.position).normalize();
      return Math.acos(Math.max(-1, Math.min(1, dir.dot(want)))) * 180 / Math.PI;
    };
    r.chase.focus(target.x, target.y, target.z, 2);
    for (let i = 0; i < 0.3 * HZ; i++) { r.drive(0, dt); target.z += 20 * dt; target.x += 20 * dt; r.chase.focus(target.x, target.y, target.z, 2); }
    expect(angleTo()).toBeLessThan(20);
    r.chase.release();
    for (let i = 0; i < 0.6 * HZ; i++) r.drive(0, dt);
    const dir = new THREE.Vector3();
    r.cam.getWorldDirection(dir);
    expect(Math.abs(Math.atan2(dir.x, dir.z)) * 180 / Math.PI).toBeLessThan(5);
  });
});

describe('the takedown side cut (M5.5 slice 17)', () => {
  test('17.3 the eye stands to the side of the travel, a little behind the wreck and above it', () => {
    const out = { x: 0, y: 0, z: 0 };
    // travelling +Z: left is +X
    sideCutEye(out, 10, 0.8, 20, 0, 1, 1);
    expect(out).toEqual({ x: 10 + SIDE_CUT.side, y: 0.8 + SIDE_CUT.up, z: 20 - SIDE_CUT.back });
    sideCutEye(out, 10, 0.8, 20, 0, 1, -1);
    expect(out.x).toBeCloseTo(10 - SIDE_CUT.side, 9);
    // travelling +X: left is -Z, behind is -X
    sideCutEye(out, 0, 0, 0, 1, 0, 1);
    expect(out.x).toBeCloseTo(-SIDE_CUT.back, 9);
    expect(out.z).toBeCloseTo(-SIDE_CUT.side, 9);
  });
});
