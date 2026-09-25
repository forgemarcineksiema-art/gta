/**
 * The camera's occlusion rule (M5.5 slice 7, docs/M4_PLAN.md §5 A): a static
 * between the car and the camera pulls the camera in along the boom at once
 * and lets it out again gradually; driven through each covered street, the
 * camera never sits behind a wall or above a roof.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ChaseCamera } from '../../src/render/camera/ChaseCamera';
import type { VehicleTelemetry } from '../../src/sim';
import { COVER } from '../../src/sim/city/covers';
import { createWorld } from '../sim/helpers';

function telemetry(vz: number): VehicleTelemetry {
  return {
    speed: vz, speedKmh: vz * 3.6, drifting: false, driftAngleDeg: 0, boost: 0, boosting: false, airborne: false, tumbling: false, groundedWheels: 4,
    steer: 0, steerDeg: 0, gear: 3, rpm: 3000, load: 0.5, throttle: 1, airTime: 0, driftTime: 0, maxSlipDeg: 0, maxSlipRatio: 0,
    minSlipRatio: 0, shifting: false, landingImpact: 0, brake: 0, driftDistance: 0, vx: 0, vy: 0, vz, yawRate: 0, gLong: 0, gLat: 0, gVert: 0,
    impact: 0, scrape: 0, contactSide: 0, contactX: 0, contactY: 0, contactZ: 0, contactNx: 0, contactNy: 0, contactNz: 0,
    hitHandle: -1, hitImpulse: 0,
  };
}

describe('the camera occlusion rule', () => {
  it('7.3 a static between pulls the camera in at once; clear again, it lets out gradually', () => {
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    const chase = new ChaseCamera(cam);
    const car = new THREE.Object3D();
    const vel = new THREE.Vector3();
    let blocked = false;
    chase.occluder = () => (blocked ? 0.4 : 1);
    const tm = telemetry(0);
    const boom = (): number => cam.position.distanceTo(car.position);
    for (let i = 0; i < 120; i++) chase.update(car, vel, tm, 1 / 60, i === 0);
    const open = boom();
    blocked = true;
    chase.update(car, vel, tm, 1 / 60, false);
    expect(boom()).toBeLessThan(open * 0.45);
    blocked = false;
    chase.update(car, vel, tm, 1 / 60, false);
    const first = boom();
    expect(first).toBeLessThan(open * 0.6);
    for (let i = 0; i < 90; i++) chase.update(car, vel, tm, 1 / 60, false);
    expect(boom()).toBeGreaterThan(open * 0.97);
  });

  it('7.4 through each covered street the camera never sits behind a static', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
      const chase = new ChaseCamera(cam);
      chase.occluder = (ax, ay, az, bx, by, bz) => sim.clearFraction(ax, ay, az, bx, by, bz);
      const car = new THREE.Object3D();
      const vel = new THREE.Vector3();
      const speed = 20;
      for (const c of sim.city!.covers) {
        // the car's line down the street, 60 m before the cover to 60 m past it, in its lane
        const along = c.axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
        const across = c.axis === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
        const start = new THREE.Vector3(c.x, 0.5, c.z).addScaledVector(along, -(COVER.length / 2 + 60)).addScaledVector(across, 4.5);
        car.position.copy(start);
        car.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(along.x, along.z));
        vel.copy(along).multiplyScalar(speed);
        const tm = telemetry(speed);
        let worst = 1;
        for (let i = 0, n = Math.round(((COVER.length + 120) / speed) * 60); i < n; i++) {
          car.position.addScaledVector(vel, 1 / 60);
          sim.city!.sync(car.position.x, car.position.z, true);
          sim.world.step();
          chase.update(car, vel, tm, 1 / 60, i === 0);
          worst = Math.min(worst, sim.clearFraction(car.position.x, car.position.y + chase.tuning.lookHeight, car.position.z, cam.position.x, cam.position.y, cam.position.z));
        }
        expect(worst, `${c.style}: a static between the camera and the car`).toBeGreaterThan(0.99);
      }
    } finally { sim.dispose(); }
  }, 60_000);
});
