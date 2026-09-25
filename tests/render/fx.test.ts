/**
 * The effects' puffs and what the ground throws up (the FX pass, 2026-09-25): smoke, fire, dust and spray are one
 * instanced mesh drawn exactly while a puff lives; a wheel rolling on dirt throws dust and one on the road none; the
 * hovercraft's cushion on the sea throws spray even at rest; a hard landing throws a ring of dust and the floor's
 * sparks, a soft one or one along a landing slope nothing.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Kickup, type GroundWheel } from '../../src/render/fx/Kickup';
import { Smoke } from '../../src/render/fx/Smoke';
import { Sparks } from '../../src/render/fx/Sparks';
import { ASPHALT, DIRT, GRASS, type SurfaceKind } from '../../src/sim';

const DT = 1 / 60;

function wheels(surface: SurfaceKind, water = false, normal = { x: 0, y: 1, z: 0 }): GroundWheel[] {
  return [0, 1, 2, 3].map(() => ({ grounded: true, surface, water, contact: { x: 0, y: 0, z: 0 }, normal, slipAngle: 0, slipRatio: 0 }));
}

function drawnWheels(): THREE.Object3D[] {
  return [[0.8, 1.3], [-0.8, 1.3], [0.8, -1.3], [-0.8, -1.3]].map(([x, z]) => {
    const o = new THREE.Object3D();
    o.position.set(x as number, 0.3, z);
    return o;
  });
}

/** `seconds` of frames at a steady velocity on the given wheels; the puffs alive at the end. */
function drive(surface: SurfaceKind, speed: number, seconds: number, opts: { water?: boolean; hover?: boolean } = {}): number {
  const smoke = new Smoke(), sparks = new Sparks(), kick = new Kickup(), car = new THREE.Object3D(), drawn = drawnWheels();
  const vel = new THREE.Vector3(0, 0, speed), w = wheels(surface, opts.water);
  for (let t = 0; t < seconds; t += DT) {
    kick.update(DT, w, { airborne: false }, opts.hover ?? false, drawn, car, vel, smoke, sparks);
    smoke.update(DT);
  }
  return smoke.live;
}

describe('the puffs', () => {
  it('FX.1 smoke, fire, dust and spray are one mesh, drawn exactly while a puff lives', () => {
    const smoke = new Smoke();
    smoke.update(DT);
    expect(smoke.object.visible).toBe(false);
    expect(smoke.object.count).toBe(0);
    smoke.emit('smoke', 0, 1, 0);
    smoke.emit('fire', 0, 1, 0);
    smoke.kick('dust', 0, 0, 0, 1, 1, 0);
    smoke.kick('spray', 0, 0, 0, 1, 2, 0);
    smoke.update(DT);
    expect(smoke.object.visible).toBe(true);
    expect(smoke.object.count).toBe(4);
    for (let k = 0; k < 180; k++) smoke.update(DT);
    expect(smoke.live).toBe(0);
    expect(smoke.object.visible).toBe(false);
    expect(smoke.object.count).toBe(0);
  });

  it('FX.2 a flame stands up and shrinks as it rises; smoke grows', () => {
    const smoke = new Smoke(), m = new THREE.Matrix4(), s = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Quaternion();
    smoke.emit('fire', 0, 1, 0);
    const size = (): THREE.Vector3 => { smoke.object.getMatrixAt(0, m); m.decompose(p, q, s); return s.clone(); };
    for (let k = 0; k < 4; k++) smoke.update(DT);
    const early = size(), earlyY = p.y;
    expect(early.y).toBeGreaterThan(early.x * 1.3);
    for (let k = 0; k < 12; k++) smoke.update(DT);
    const late = size();
    expect(late.y).toBeLessThan(early.y);
    expect(p.y).toBeGreaterThan(earlyY);
    const puff = new Smoke();
    puff.emit('dark', 0, 1, 0);
    puff.update(DT);
    puff.object.getMatrixAt(0, m); m.decompose(p, q, s);
    const first = s.x;
    for (let k = 0; k < 60; k++) puff.update(DT);
    puff.object.getMatrixAt(0, m); m.decompose(p, q, s);
    expect(s.x).toBeGreaterThan(first + 0.5);
  });
});

describe('what the ground throws up', () => {
  it('FX.3 a wheel rolling on dirt throws dust, less on grass; on the road, or crawling, none', () => {
    const dirt = drive(DIRT, 15, 1), grass = drive(GRASS, 15, 1);
    expect(dirt).toBeGreaterThan(20);
    expect(grass).toBeGreaterThan(5);
    expect(grass).toBeLessThan(dirt);
    expect(drive(ASPHALT, 15, 1)).toBe(0);
    expect(drive(DIRT, 2, 1)).toBe(0);
  });

  it('FX.4 the cushion on the sea throws spray at rest, and more at speed', () => {
    const rest = drive(ASPHALT, 0, 1, { water: true, hover: true }), fast = drive(ASPHALT, 15, 1, { water: true, hover: true });
    expect(rest).toBeGreaterThan(5);
    expect(fast).toBeGreaterThan(rest * 2);
  });

  it('FX.5 a hard landing throws a ring of dust and sparks off the floor; a soft one, or one along a landing slope, nothing', () => {
    const land = (fall: THREE.Vector3, normal = { x: 0, y: 1, z: 0 }): { puffs: number; sparks: boolean } => {
      const smoke = new Smoke(), sparks = new Sparks(), kick = new Kickup(), car = new THREE.Object3D(), drawn = drawnWheels();
      const w = wheels(ASPHALT, false, normal);
      kick.update(DT, w, { airborne: true }, false, drawn, car, fall, smoke, sparks);
      kick.update(DT, w, { airborne: false }, false, drawn, car, new THREE.Vector3(0, 0, fall.z), smoke, sparks);
      smoke.update(DT);
      sparks.update({ contactSide: 0 } as Parameters<Sparks['update']>[0], new THREE.Vector3(), DT);
      return { puffs: smoke.live, sparks: sparks.object.visible };
    };
    const hard = land(new THREE.Vector3(0, -11, 12));
    expect(hard.puffs).toBeGreaterThanOrEqual(4 * 6);
    expect(hard.sparks).toBe(true);
    const firm = land(new THREE.Vector3(0, -5, 12));
    expect(firm.puffs).toBeGreaterThanOrEqual(8);
    expect(firm.sparks).toBe(false);
    expect(land(new THREE.Vector3(0, -2, 12)).puffs).toBe(0);
    // down a 30° landing slope at its own pitch: the speed into it is nearly nothing
    expect(land(new THREE.Vector3(0, -10, 17.3), { x: 0, y: Math.cos(Math.PI / 6), z: Math.sin(Math.PI / 6) }).puffs).toBe(0);
  });
});
