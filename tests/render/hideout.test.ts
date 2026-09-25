/**
 * The garage's things (M5.5 slice 5, docs/DESIGN.md §13.6): one merged mesh
 * under a thousand triangles, inside the walls, clear of the floor the car
 * needs (the entry box) and of the door's opening.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HideoutView, ROOM_LIGHT, propsGeometry, roomGeometry, roomGlowGeometry } from '../../src/render/run/HideoutView';
import { PlayerCar } from '../../src/render/cars/PlayerCar';
import { GARAGE } from '../../src/sim';
import { createWorld } from '../sim/helpers';

describe('the garage dressed', () => {
  it('5.1 the props: under 1,000 triangles, inside the walls, clear of the car\'s floor and the doorway', () => {
    const g = propsGeometry();
    const pos = g.getAttribute('position');
    const tris = (g.index ? g.index.count : pos.count) / 3;
    expect(tris).toBeLessThan(1000);
    const innerAcross = GARAGE.width / 2 - GARAGE.wall;
    const innerAlong = GARAGE.depth / 2 - GARAGE.wall;
    for (let i = 0; i < pos.count; i++) {
      const across = -pos.getX(i), y = pos.getY(i), along = pos.getZ(i);
      expect(Math.abs(across)).toBeLessThanOrEqual(innerAcross + 1e-6);
      expect(Math.abs(along)).toBeLessThanOrEqual(innerAlong + 1e-6);
      expect(y).toBeGreaterThanOrEqual(-1e-6);
      expect(y).toBeLessThanOrEqual(GARAGE.height);
      // the car's floor (the entry box) is free below head height, except the poster on the back wall
      if (along < innerAlong - 0.1 && y < 2.6) expect(Math.abs(across)).toBeGreaterThan(GARAGE.entryAcross + 1.3);
    }
    g.dispose();
  });
});

describe('the showroom (M8.9 slice 13)', () => {
  it('M8.9 13.2 the light count is the same from boot to the door and back: the room light is there from the start, at zero', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const scene = new THREE.Scene();
      const view = new HideoutView(scene, sim);
      const lights = (): number => {
        let n = 0;
        scene.traverse((o) => { if ((o as THREE.Light).isLight) n++; });
        return n;
      };
      const boot = lights();
      expect(boot).toBe(1);
      expect(view.lamp.intensity).toBe(0);
      view.light({ x: 10, y: GARAGE.floorTop, z: 20 }, 1);
      expect(lights()).toBe(boot);
      expect(view.lamp.intensity).toBe(ROOM_LIGHT.intensity);
      expect(view.lamp.position.y).toBeCloseTo(GARAGE.floorTop + ROOM_LIGHT.up, 9);
      view.light(null, 0);
      expect(lights()).toBe(boot);
      expect(view.lamp.intensity).toBe(0);
      // the dressing stands inside the room: the ceiling under the roof, the bay on the floor, the strips and the neon
      for (const g of [roomGeometry(), roomGlowGeometry()]) {
        const pos = g.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          expect(Math.abs(pos.getX(i))).toBeLessThanOrEqual(GARAGE.width / 2 - GARAGE.wall + 1e-6);
          expect(Math.abs(pos.getZ(i))).toBeLessThanOrEqual(GARAGE.depth / 2 - GARAGE.wall + 1e-6);
          expect(pos.getY(i)).toBeGreaterThanOrEqual(0);
          expect(pos.getY(i)).toBeLessThanOrEqual(GARAGE.height);
        }
        g.dispose();
      }
    } finally { sim.dispose(); }
  });

  it('M8.9 13.3 the turntable is drawn only: the car moves and turns on the screen, its pose in the game unchanged', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const scene = new THREE.Scene();
      const car = new PlayerCar(scene, sim);
      const before = Array.from(sim.transforms.currPos).concat(Array.from(sim.transforms.currRot));
      car.place(1);
      const p = car.mesh.root.position;
      const x = p.x + 3, z = p.z - 2;
      car.showroom(x, z, 1.1, 1);
      expect(car.mesh.root.position.x).toBeCloseTo(x, 6);
      expect(car.mesh.root.position.z).toBeCloseTo(z, 6);
      const yaw = new THREE.Euler().setFromQuaternion(car.mesh.root.quaternion, 'YXZ').y;
      expect(yaw).toBeCloseTo(1.1, 6);
      // the wheels went with it: each within the car's reach of its middle
      for (const w of car.mesh.wheels) expect(Math.hypot(w.position.x - x, w.position.z - z)).toBeLessThan(3.5);
      const after = Array.from(sim.transforms.currPos).concat(Array.from(sim.transforms.currRot));
      expect(after).toEqual(before);
    } finally { sim.dispose(); }
  });
});
