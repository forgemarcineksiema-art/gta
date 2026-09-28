/**
 * Camera comfort contract: steering alone cannot swing the view; actual
 * corners stay readable without excessive yaw lag. Supersedes the M1 lead pins.
 * Pure math in Node: a synthetic car object and telemetry, no WebGL.
 */
import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { ChaseCamera, DEFAULT_CAMERA, SIDE_CUT, sideCutEye } from '../../src/render/camera/ChaseCamera';
import { SHOWROOM, newShot, showroomMix, showroomShot, turntableYaw } from '../../src/render/camera/showroom';
import { BODIES, type SimWorld, type VehicleTelemetry } from '../../src/sim';
import { CameraDirector, sideShot } from '../../src/render/camera/CameraDirector';
import { CIRCLE, CRANE, circleShot, craneShot, newStillShot } from '../../src/render/camera/shots';

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

/**
 * The reverse view in the one camera (M8.9 slice 23, R14): the view's yaw is one number with one smoother; the
 * reverse gear turns it round after a moment of backing up and the gas brings it back at once; a slide tail first is
 * followed along its travel and held when it stops. A car written frame by frame: its nose, its travel and speed, its
 * gear and its gas.
 */
describe('the reverse view in the one camera (M8.9 slice 23)', () => {
  const HZ = 60;
  const dt = 1 / HZ;
  const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
  const deg = (r: number): number => (Math.abs(r) * 180) / Math.PI;

  function rig() {
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    const chase = new ChaseCamera(cam);
    const car = new THREE.Object3D();
    const vel = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    /** The car now: `travel` the way it goes, `speed` how fast (m/s, never negative). */
    const car_ = { nose: 0, travel: 0, speed: 0, gear: 1, throttle: 0, yawRate: 0, drifting: false };
    const frames: Array<{ view: number; nose: number; travel: number; speed: number }> = [];
    let first = true;
    const frame = (): void => {
      car.quaternion.setFromAxisAngle(up, car_.nose);
      vel.set(Math.sin(car_.travel) * car_.speed, 0, Math.cos(car_.travel) * car_.speed);
      car.position.addScaledVector(vel, dt);
      chase.update(car, vel, telemetry({
        speed: car_.speed * Math.cos(car_.travel - car_.nose), vx: vel.x, vz: vel.z, gear: car_.gear, throttle: car_.throttle,
        yawRate: car_.yawRate, drifting: car_.drifting, steer: 0,
      }), dt, first);
      first = false;
      cam.getWorldDirection(dir);
      frames.push({ view: Math.atan2(dir.x, dir.z), nose: car_.nose, travel: car_.travel, speed: car_.speed });
    };
    /** `seconds` of frames, `script` setting the car at each from the seconds since it began. */
    const run = (seconds: number, script: (s: number) => void): void => {
      for (let i = 0; i < Math.round(seconds * HZ); i++) {
        script(i * dt);
        frame();
      }
    };
    return { car: car_, run, frames };
  }

  /** The view's turn in all (degrees) and its fastest (degrees per second) over `from` onwards. */
  function turning(frames: ReadonlyArray<{ view: number }>, from = 1): { total: number; peak: number } {
    let total = 0, peak = 0;
    for (let i = Math.max(1, from); i < frames.length; i++) {
      const step = deg(wrap((frames[i] as { view: number }).view - (frames[i - 1] as { view: number }).view));
      total += step;
      peak = Math.max(peak, step * HZ);
    }
    return { total, peak };
  }

  /**
   * Forward at 15 m/s, a stop, then the reverse gear backing up to `back` m/s over `ramp` s, held to `seconds`; the
   * frame the reverse gear began at.
   */
  function reverse(r: ReturnType<typeof rig>, seconds: number, back = 5, ramp = 1): number {
    r.run(2, () => { r.car.speed = 15; r.car.throttle = 1; });
    r.run(0.4, (s) => { r.car.speed = Math.max(0, 15 - 40 * s); r.car.throttle = 0; });
    r.car.gear = -1;
    r.car.travel = r.car.nose + Math.PI;
    const began = r.frames.length;
    r.run(seconds, (s) => { r.car.speed = back * Math.min(1, s / ramp); });
    return began;
  }

  test('23.1 a back-up of 1 s off a wall and a three-point turn leave the view behind the car', () => {
    const r = rig();
    reverse(r, 1, 4);
    // the gas: the reverse gear goes, the car stops and drives off along its nose
    r.car.gear = 1;
    r.run(0.5, (s) => { r.car.throttle = 1; r.car.speed = 4 * (1 - s / 0.5); });
    r.car.travel = r.car.nose;
    r.run(2, (s) => { r.car.speed = 5 * s; });
    const t = rig();
    // a three-point turn: forward on full lock, back on the other lock for 1.1 s, forward again
    t.run(1.5, () => { t.car.speed = 3; t.car.throttle = 1; t.car.yawRate = 0.8; t.car.nose += 0.8 * dt; t.car.travel = t.car.nose; });
    t.run(0.3, (s) => { t.car.speed = 3 * (1 - s / 0.3); t.car.throttle = 0; t.car.yawRate = 0; });
    t.car.gear = -1;
    t.run(1.1, (s) => { t.car.speed = Math.min(3, 6 * s); t.car.yawRate = 0.6; t.car.nose += 0.6 * dt * Math.min(1, 2 * s); t.car.travel = t.car.nose + Math.PI; });
    t.car.gear = 1;
    t.run(0.3, (s) => { t.car.throttle = 1; t.car.speed = 3 * (1 - s / 0.3); t.car.yawRate = 0; });
    t.run(1.5, (s) => { t.car.speed = Math.min(4, 6 * s); t.car.yawRate = 0.8; t.car.nose += 0.8 * dt; t.car.travel = t.car.nose; });
    for (const f of [...r.frames, ...t.frames]) expect(deg(wrap(f.view - f.nose))).toBeLessThan(30);
  });

  test('23.2 a long reverse turns the view once to the travel, never faster than 155 deg/s, and the gas turns it back at once', () => {
    const r = rig();
    const start = reverse(r, 3.5, 7, 1.5);
    const last = r.frames[r.frames.length - 1] as { view: number; travel: number };
    expect(deg(wrap(last.view - last.travel))).toBeLessThan(10);
    // the gas: the reverse gear goes at once, the car still rolling back
    r.car.gear = 1;
    const gas = r.frames.length;
    r.run(1.2, (s) => { r.car.throttle = 1; r.car.speed = 7 * (1 - s / 1.2); });
    r.car.travel = r.car.nose;
    r.run(1.5, (s) => { r.car.speed = 6 * s; });
    const at = (i: number) => r.frames[i] as { view: number; nose: number };
    // a quarter of a second after the gas the view is on its way back behind the nose
    expect(deg(wrap(at(gas - 1).view - at(gas - 1).nose)) - deg(wrap(at(gas + 15).view - at(gas + 15).nose))).toBeGreaterThan(5);
    const end = r.frames[r.frames.length - 1] as { view: number; nose: number };
    expect(deg(wrap(end.view - end.nose))).toBeLessThan(10);
    // once round and once back: the view passes the car's side twice in all
    let sides = 0;
    for (let i = start; i < r.frames.length; i++) {
      const a = at(i - 1), b = at(i);
      if (Math.cos(wrap(a.view - a.nose)) * Math.cos(wrap(b.view - b.nose)) < 0) sides++;
    }
    expect(sides).toBe(2);
    expect(turning(r.frames, start).peak).toBeLessThan(155);
  });

  /** At 20 m/s the car is turned half round in 0.8 s (a ram) and slides on tail first to a stop. */
  function spin(r: ReturnType<typeof rig>): void {
    r.run(1, () => { r.car.speed = 20; r.car.gear = 3; });
    r.run(0.8, (s) => { r.car.speed = 20 - 7.5 * s; r.car.yawRate = 4; r.car.nose += 4 * dt; r.car.drifting = true; });
    r.car.yawRate = 0;
    r.car.drifting = false;
    r.run(2.5, (s) => { r.car.speed = 14 * (1 - s / 2.5); });
  }

  test('23.3 a car spun half round at 20 m/s: the view follows its slide and turns once, never faster than 155 deg/s', () => {
    const r = rig();
    spin(r);
    for (const f of r.frames.slice(60)) if (f.speed > 1) expect(deg(wrap(f.view - f.travel))).toBeLessThan(10);
    // the gas: behind the nose, which now points back the way it came
    r.car.travel = r.car.nose;
    r.run(3, (s) => { r.car.throttle = 1; r.car.gear = 1; r.car.speed = 3.3 * s; });
    const turned = turning(r.frames);
    expect(turned.total).toBeLessThan(200);
    expect(turned.peak).toBeLessThan(155);
    const end = r.frames[r.frames.length - 1] as { view: number; nose: number };
    expect(deg(wrap(end.view - end.nose))).toBeLessThan(10);
  });

  test('23.4 reverse, stop, stand 2 s and reverse again: the view turns round once', () => {
    const r = rig();
    reverse(r, 2);
    r.run(0.5, (s) => { r.car.speed = 5 * (1 - s / 0.5); });
    r.run(2, () => { r.car.speed = 0; });
    r.run(1, (s) => { r.car.speed = 5 * Math.min(1, s); });
    expect(turning(r.frames).total).toBeLessThan(190);
    const last = r.frames[r.frames.length - 1] as { view: number; travel: number };
    expect(deg(wrap(last.view - last.travel))).toBeLessThan(10);
  });

  test('23.5 a slide ended tail first: the gas turns the view behind the nose, the reverse keeps it', () => {
    const gas = rig();
    spin(gas);
    gas.run(0.5, () => { gas.car.speed = 0; });
    gas.car.travel = gas.car.nose;
    gas.run(2, (s) => { gas.car.throttle = 1; gas.car.gear = 1; gas.car.speed = 3 * s; });
    const g = gas.frames[gas.frames.length - 1] as { view: number; nose: number };
    expect(deg(wrap(g.view - g.nose))).toBeLessThan(10);
    const back = rig();
    spin(back);
    back.run(0.5, () => { back.car.speed = 0; });
    const held = back.frames.length;
    // the reverse gear: backing on the way the slide went, the view where it is
    back.car.gear = -1;
    back.run(2, (s) => { back.car.speed = 3 * Math.min(1, s); });
    for (const f of back.frames.slice(held)) expect(deg(wrap(f.view - (f.nose + Math.PI)))).toBeLessThan(10);
  });
});

/**
 * The jolt from the physics (M8.9 slice 24, R14): a spring in the camera's own axes kicked by the sim's hit (its
 * contact's normal and speed) and landing, alike whichever way the car goes; the car thrown across the screen the way
 * it goes in the world, then caught.
 */
describe('the jolt from the physics (M8.9 slice 24)', () => {
  const HZ = 60;
  const dt = 1 / HZ;

  /**
   * A car at 20 m/s heading `yaw`, `over` in its telemetry for the one frame after three seconds: the car's place on
   * a 1280×720 screen each frame after it, in pixels right of and above the place it had before it.
   */
  function jolted(yaw: number, over: Partial<VehicleTelemetry>, frames = 30): Array<{ x: number; y: number }> {
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    const chase = new ChaseCamera(cam);
    const car = new THREE.Object3D();
    const vel = new THREE.Vector3(Math.sin(yaw) * 20, 0, Math.cos(yaw) * 20);
    const p = new THREE.Vector3();
    car.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const at = (): { x: number; y: number } => {
      cam.updateMatrixWorld();
      p.copy(car.position).project(cam);
      return { x: p.x * 640, y: p.y * 360 };
    };
    for (let i = 0; i < 3 * HZ; i++) {
      car.position.addScaledVector(vel, dt);
      chase.update(car, vel, telemetry({ vx: vel.x, vz: vel.z }), dt, i === 0);
    }
    const before = at();
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < frames; i++) {
      car.position.addScaledVector(vel, dt);
      chase.update(car, vel, telemetry({ vx: vel.x, vz: vel.z, ...(i === 0 ? over : {}) }), dt, false);
      const now = at();
      out.push({ x: now.x - before.x, y: now.y - before.y });
    }
    return out;
  }

  /** A hit from the car's left at 8 m/s: the normal from the wall into the car points to its right. */
  const fromLeft = (yaw: number): Partial<VehicleTelemetry> => ({ impact: 8, contactNx: -Math.cos(yaw), contactNy: 0, contactNz: Math.sin(yaw) });

  test('24.1 the same hit seen driving north and driving east moves the car on the screen alike', () => {
    const peak = (yaw: number): number => Math.max(...jolted(yaw, fromLeft(yaw)).map((q) => Math.abs(q.x)));
    const north = peak(0), east = peak(Math.PI / 2);
    expect(north).toBeGreaterThan(5);
    expect(Math.abs(east - north) / north).toBeLessThan(0.05);
  });

  test('24.2 a hit from the left throws the car to the right on the screen, a landing lifts it, both settled within 0.4 s', () => {
    const hit = jolted(0.7, fromLeft(0.7));
    expect((hit[3] as { x: number }).x).toBeGreaterThan(3);
    const landing = jolted(0.7, { landingImpact: 6 });
    expect((landing[3] as { y: number }).y).toBeGreaterThan(3);
    for (const q of [hit[24], landing[24]] as Array<{ x: number; y: number }>) expect(Math.hypot(q.x, q.y)).toBeLessThan(0.5);
  });

  test('24.3 a calm drive does not shake the car on the screen', () => {
    for (const q of jolted(0.3, {}, 180)) expect(Math.hypot(q.x, q.y)).toBeLessThan(0.3);
  });
});

/**
 * Big air (M8.9 slice 25, R14): in the air the camera stays within bounds over the car, on a long flight the look leans
 * toward where the car will come down, and the mega-ramp's apex is a side shot. A car written frame by frame off a
 * plateau 16 m up, launched at 21 m/s and 8 m/s up, down onto the flat.
 */
describe('big air (M8.9 slice 25)', () => {
  const HZ = 60;
  const dt = 1 / HZ;
  const G = 13.31;

  function flight() {
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    const chase = new ChaseCamera(cam);
    chase.floor = () => 0;
    chase.gravity = G;
    const car = new THREE.Object3D();
    const vel = new THREE.Vector3(0, 0, 21);
    car.position.set(0, 16, 0);
    const p = new THREE.Vector3();
    const frames: Array<{ over: number; x: number; y: number; air: boolean; vy: number }> = [];
    let air = false, landed = -1, apexCam: THREE.PerspectiveCamera | null = null;
    const landing = new THREE.Vector3();
    for (let i = 0; i < 6 * HZ; i++) {
      let impact = 0;
      if (i === 2 * HZ) { air = true; vel.y = 8; }
      if (air) vel.y -= G * dt;
      car.position.addScaledVector(vel, dt);
      if (air && car.position.y <= 0) {
        car.position.y = 0;
        impact = -vel.y;
        vel.y = 0;
        air = false;
        landed = i;
        landing.copy(car.position);
      }
      chase.update(car, vel, telemetry({ vx: vel.x, vy: vel.y, vz: vel.z, airborne: air, groundedWheels: air ? 0 : 4, landingImpact: impact }), dt, i === 0);
      cam.updateMatrixWorld();
      p.copy(car.position).project(cam);
      frames.push({ over: cam.position.y - car.position.y, x: p.x * 640, y: p.y * 360, air, vy: vel.y });
      if (air && vel.y <= 0 && !apexCam) apexCam = cam.clone();
    }
    return { frames, landed, landing, apexCam: apexCam as THREE.PerspectiveCamera };
  }

  test('25.1 a flight falling 16 m: the camera stays 0.8 to 4 m over the car throughout', () => {
    const { frames } = flight();
    const inAir = frames.filter((f) => f.air);
    expect(inAir.length).toBeGreaterThan(2 * HZ);
    for (const f of inAir) {
      expect(f.over).toBeGreaterThan(0.8 - 1e-6);
      expect(f.over).toBeLessThan(4 + 1e-6);
    }
  });

  test('25.2 from the apex the landing and the car are on the screen', () => {
    const { landing, apexCam } = flight();
    apexCam.updateMatrixWorld();
    const q = landing.clone().project(apexCam);
    expect(Math.abs(q.x)).toBeLessThan(1);
    expect(Math.abs(q.y)).toBeLessThan(1);
    expect(q.z).toBeLessThan(1);
  });

  test('25.3 the landing moves the car on the screen by 20 px at most', () => {
    const { frames, landed } = flight();
    const before = frames[landed - 1] as { x: number; y: number };
    let most = 0;
    for (const f of frames.slice(landed, landed + 30)) most = Math.max(most, Math.hypot(f.x - before.x, f.y - before.y));
    expect(most).toBeLessThan(20);
  });

  test("25.4 the apex's side shot looks from a side with a clear line, and holds only while the apex's slow motion runs", () => {
    // travelling +Z: the left is +X; the left blocked, the right; both blocked, none
    const eye = { x: 0, y: 0, z: 0 };
    expect(sideShot(eye, 10, 16, 20, 0, 1, (x) => x < 10)).not.toBeNull();
    expect(eye.x).toBeCloseTo(10 - SIDE_CUT.side, 9);
    expect(sideShot(eye, 10, 16, 20, 0, 1, () => false)).toBeNull();
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    const chase = new ChaseCamera(cam);
    const state = { slowMo: 0.6, slowMoTarget: -1 };
    const jumps = { flying: 0, descs: [{ mega: true }] };
    const sim = { life: { state }, traffic: null, run: { state: 'running' }, jumps, clearFraction: () => 1 } as unknown as SimWorld;
    const director = new CameraDirector(chase, sim);
    const at = new THREE.Vector3(0, 16, 0), vel = new THREE.Vector3(0, 0, 21);
    director.syncFocus(at, vel);
    expect(chase.cutting).toBe(true);
    state.slowMo = 0;
    director.syncFocus(at, vel);
    expect(chase.cutting).toBe(false);
    // a kicker's slow motion rides its whole flight: no shot
    jumps.descs[0] = { mega: false };
    state.slowMo = 0.6;
    director.syncFocus(at, vel);
    expect(chase.cutting).toBe(false);
  });
});

/**
 * The ground (M8.9 slice 26, R14): the rig pitches with the road, and the camera keeps its room over the ground under
 * it. A car at 20 m/s along +Z over a road laid out by the pin, its origin 0.5 m over it.
 */
describe('the ground (M8.9 slice 26)', () => {
  const HZ = 60;
  const dt = 1 / HZ;

  function drive(road: (z: number) => number, seconds: number, each?: (cam: THREE.PerspectiveCamera) => void): { cam: THREE.PerspectiveCamera; z: number } {
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    const chase = new ChaseCamera(cam);
    chase.floor = (_x, _y, z) => road(z);
    const car = new THREE.Object3D();
    const vel = new THREE.Vector3();
    let z = 0;
    for (let i = 0; i < seconds * HZ; i++) {
      z = 20 * i * dt;
      vel.set(0, 20 * (road(z + 0.5) - road(z - 0.5)), 20);
      car.position.set(0, road(z) + 0.5, z);
      chase.update(car, vel, telemetry({ vx: 0, vy: vel.y, vz: 20 }), dt, i === 0);
      cam.updateMatrixWorld();
      each?.(cam);
    }
    return { cam, z };
  }

  test('26.1 on a 6 % downhill the road 35 m ahead sits within 12 px of its place on the flat', () => {
    const ahead = (road: (z: number) => number): number => {
      const { cam, z } = drive(road, 4);
      return new THREE.Vector3(0, road(z + 35), z + 35).project(cam).y * 360;
    };
    expect(Math.abs(ahead((z) => -0.06 * z) - ahead(() => 0))).toBeLessThan(12);
  });

  test('26.3 the camera never sits under 1.5 m over the ground under it (a steep hill down onto the flat)', () => {
    const road = (z: number): number => (z < 60 ? 0.3 * (60 - z) : 0);
    let least = Infinity;
    drive(road, 6, (cam) => { least = Math.min(least, cam.position.y - road(cam.position.z)); });
    expect(least).toBeGreaterThan(1.5 - 1e-6);
  });
});

/**
 * The moments without control (M8.9 slice 27, R14): BUSTED's crane and the circle round a wreck, each from where the
 * chase stood; and one cut at a time, each released only by the shot that made it. The director in the Renderer's order
 * a frame: the door, the still moments, the chase, the takedown and the apex.
 */
describe('BUSTED and the wreck (M8.9 slice 27)', () => {
  const dt = 1 / 60;
  const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

  function directorRig(over: Record<string, unknown> = {}) {
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    const chase = new ChaseCamera(cam);
    const state = { slowMo: 0, slowMoTarget: -1, wrecked: false };
    const run = { state: 'running', dropOff: -1, dropOffs: [] };
    const sim = { run, life: { state }, traffic: null, transforms: null, jumps: null, clearFraction: () => 1, viewFraction: () => 1, ...over } as unknown as SimWorld;
    const director = new CameraDirector(chase, sim);
    const car = new THREE.Object3D();
    const vel = new THREE.Vector3();
    let first = true;
    const frame = (): void => {
      car.position.addScaledVector(vel, dt);
      director.syncDoor(dt, 16 / 9, 1, 3, 1.6);
      director.syncStill(dt, cam.position, car.position);
      chase.update(car, vel, telemetry({ vx: vel.x, vz: vel.z, speed: vel.length() }), dt, first);
      first = false;
      director.syncFocus(car.position, vel, 1);
    };
    const frames = (seconds: number): void => { for (let i = 0; i < Math.round(seconds * 60); i++) frame(); };
    return { cam, chase, car, vel, state, run, frame, frames };
  }

  test('27.1 the crane only rises and draws back, the car and the units round it framed under the card at the ten sizes', () => {
    const car = { x: 0, y: 0, z: 0 };
    const fromEye = { x: 0, y: 2.4, z: -8 }, fromLook = { x: 0, y: 0.9, z: 3 };
    const shot = newStillShot();
    let up = -Infinity, back = -Infinity;
    for (let t = 0; t <= CRANE.seconds + 0.5; t += 0.1) {
      craneShot(fromEye, fromLook, car, t, (DEFAULT_CAMERA.fovBase * Math.PI) / 180, shot);
      expect(shot.eye.y).toBeGreaterThanOrEqual(up - 1e-9);
      expect(Math.hypot(shot.eye.x, shot.eye.z)).toBeGreaterThanOrEqual(back - 1e-9);
      up = shot.eye.y;
      back = Math.hypot(shot.eye.x, shot.eye.z);
    }
    // the end: the car and four units boxing it 5 m round, in the frame's lower part, under the busted card that takes
    // its middle (its bottom 0.25 under the middle at 1280x720)
    craneShot(fromEye, fromLook, car, CRANE.seconds, (DEFAULT_CAMERA.fovBase * Math.PI) / 180, shot);
    const round = [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]] as const;
    for (const [w, h] of SIZES) {
      const cam = new THREE.PerspectiveCamera(DEFAULT_CAMERA.fovBase, w / h, 0.1, 1000);
      cam.position.set(shot.eye.x, shot.eye.y, shot.eye.z);
      cam.lookAt(shot.look.x, shot.look.y, shot.look.z);
      cam.updateMatrixWorld();
      for (const [x, z] of round) {
        const p = new THREE.Vector3(x, 0, z).project(cam);
        expect(Math.abs(p.x), `${w}x${h}`).toBeLessThan(0.95);
        expect(p.y, `${w}x${h}`).toBeLessThan(-0.3);
        expect(p.y, `${w}x${h}`).toBeGreaterThan(-0.9);
      }
    }
  });

  test('27.2 the circle turns under 40 deg/s round the wreck and keeps its eye on a clear line to it', () => {
    const wreck = { x: 0, y: 0, z: 0 };
    const shot = newStillShot();
    circleShot({ x: 0, y: 2.4, z: -8 }, { x: 0, y: 0.9, z: 3 }, wreck, 0, shot);
    let last = Math.atan2(shot.eye.x, shot.eye.z), peak = 0;
    for (let i = 1; i <= CIRCLE.seconds * 60; i++) {
      circleShot({ x: 0, y: 2.4, z: -8 }, { x: 0, y: 0.9, z: 3 }, wreck, i / 60, shot);
      const a = Math.atan2(shot.eye.x, shot.eye.z);
      peak = Math.max(peak, (Math.abs(wrap(a - last)) * 60 * 180) / Math.PI);
      last = a;
    }
    expect(peak).toBeLessThan(40);
    // a wall 5 m from the wreck all round: the eye pulled in along its line to inside it
    const r = directorRig({ viewFraction: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      return len > 5 ? 5 / len : 1;
    } });
    r.frames(1);
    r.state.wrecked = true;
    for (let i = 0; i < 150; i++) {
      r.frame();
      expect(r.chase.cutting).toBe(true);
      expect(r.cam.position.distanceTo(r.car.position)).toBeLessThan(5.5);
    }
  });

  test('27.3 the key at the card and the respawn give the chase back in that frame', () => {
    const r = directorRig();
    r.frames(1);
    r.run.state = 'busted';
    r.frames(1);
    expect(r.chase.cutting).toBe(true);
    r.run.state = 'running';
    r.frame();
    expect(r.chase.cutting).toBe(false);
    r.state.wrecked = true;
    r.frames(1);
    expect(r.chase.cutting).toBe(true);
    r.state.wrecked = false;
    r.frame();
    expect(r.chase.cutting).toBe(false);
  });

  test("27.4 a cut is released only by the shot that made it: the takedown's side cut holds through its slow motion", () => {
    // the door's sync released any cut every frame since M5.5: the side cut, made after the chase's update, never showed
    const tb = { prevPos: new Float32Array([10, 0, 20]), currPos: new Float32Array([10, 0, 20]) };
    const r = directorRig({ traffic: { slot: [0] }, transforms: tb });
    r.vel.set(0, 0, 10);
    r.frames(1);
    r.state.slowMo = 1;
    r.state.slowMoTarget = 0;
    const eye = sideCutEye({ x: 0, y: 0, z: 0 }, 10, 0.8, 20, 0, 1, 1);
    let shown = 0;
    for (let i = 0; i < 30; i++) {
      r.frame();
      if (r.cam.position.distanceTo(new THREE.Vector3(eye.x, eye.y, eye.z)) < 0.5) shown++;
    }
    expect(shown).toBeGreaterThan(27);
    r.state.slowMo = 0;
    r.frames(0.1);
    expect(r.chase.cutting).toBe(false);
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

/** The ten sizes the platform shows the game at (CLAUDE.md). */
const SIZES: ReadonlyArray<[number, number]> = [[821, 462], [907, 510], [1077, 606], [1216, 684], [1280, 720], [1366, 768], [1536, 864], [1920, 1080], [800, 450], [1080, 607]];

describe('the showroom (M8.9 slice 13)', () => {
  test('M8.9 13.1 the showroom camera sees the whole box of the car in the left 52 % (the wall and its margin have the rest) at the ten sizes, all the way round the turntable', () => {
    const site = { x: 120, y: 0.16, z: -340, yaw: 0.7 };
    const cam = new THREE.PerspectiveCamera(DEFAULT_CAMERA.fovBase, 16 / 9, 0.1, 500);
    const shot = newShot();
    const v = new THREE.Vector3();
    const bad: string[] = [];
    // every body the garage can hold in its middle: the buses (12 m) need more room than the garage has
    const bodies = BODIES.filter((b) => b.halfLength <= 4);
    expect(bodies.length).toBeGreaterThan(20);
    for (const body of bodies) {
      const radius = Math.hypot(body.halfLength, body.halfWidth);
      const height = body.big ? 3.2 : 1.8;
      for (const [w, h] of SIZES) {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
        showroomShot(site, radius, height, cam.aspect, THREE.MathUtils.degToRad(cam.fov), shot);
        cam.position.set(shot.eye.x, shot.eye.y, shot.eye.z);
        cam.lookAt(shot.look.x, shot.look.y, shot.look.z);
        cam.updateMatrixWorld();
        for (let turn = 0; turn < 24; turn++) {
          const yaw = shot.carYaw + (turn / 24) * Math.PI * 2;
          const c = Math.cos(yaw), s = Math.sin(yaw);
          for (const along of [-body.halfLength, body.halfLength]) {
            for (const across of [-body.halfWidth, body.halfWidth]) {
              for (const y of [0, height]) {
                v.set(site.x + s * along + c * across, site.y + y, site.z + c * along - s * across).project(cam);
                if (v.x < -1 || v.x > 2 * SHOWROOM.leftShare - 1 || v.y < -1 || v.y > 1 || v.z > 1) bad.push(`${body.id} ${w}x${h} turn ${turn}: ${v.x.toFixed(2)}, ${v.y.toFixed(2)}`);
              }
            }
          }
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    // inside the room: the eye never leaves the garage's walls (14 × 20 m)
    showroomShot(site, 4, 3.2, 16 / 9, THREE.MathUtils.degToRad(60), shot);
    const dx = shot.eye.x - site.x, dz = shot.eye.z - site.z;
    const along = dx * Math.sin(site.yaw) + dz * Math.cos(site.yaw), across = -dx * Math.cos(site.yaw) + dz * Math.sin(site.yaw);
    expect(Math.abs(along)).toBeLessThan(9.7);
    expect(Math.abs(across)).toBeLessThan(6.7);
    // the move and the turntable: 0.6 s eased, 8° a second
    expect([showroomMix(0), showroomMix(SHOWROOM.seconds), showroomMix(10)]).toEqual([0, 1, 1]);
    expect(turntableYaw(1, 10) - 1).toBeCloseTo((80 * Math.PI) / 180, 9);
  });
});
