/**
 * The M1 test playground: a flat lot with a long straight, a slalom, a skidpad,
 * ramps and kerbs. Builds Rapier colliders and the matching render descriptors.
 * Everything here is deterministic and allocation-free after construction.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS_SOLID, GROUPS_TERRAIN } from './collision';
import { PALETTE } from './palette';
import { IDENTITY_QUAT, quatFromAxisAngle, quatFromYaw, type Quat, type StaticDesc, type Vec3 } from './scene';
import { buildTrackDef, buildTrackGeometry, type TrackDef } from './track';

export interface SpawnPoint {
  position: Vec3;
  yaw: number;
  name: string;
}

export interface PropSpawn {
  position: Vec3;
  rotation: Quat;
  shape: { kind: 'cylinder'; radius: number; halfHeight: number } | { kind: 'box'; hx: number; hy: number; hz: number };
  color: number;
  mass: number;
}

export interface PlaygroundLayout {
  statics: StaticDesc[];
  spawns: SpawnPoint[];
  props: PropSpawn[];
  track: TrackDef;
  /** Ground size (square, centred on origin). */
  groundSize: number;
}

/** Straight-road constants shared with the renderer's decorations. */
export const STRAIGHT = { x: 0, zStart: -60, zEnd: 1000, width: 14 } as const;

export function buildPlayground(world: RAPIER.World): PlaygroundLayout {
  const statics: StaticDesc[] = [];
  const spawns: SpawnPoint[] = [];
  const props: PropSpawn[] = [];
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

  const addBox = (
    hx: number,
    hy: number,
    hz: number,
    position: Vec3,
    rotation: Quat,
    color: number,
    opts: { collide?: boolean; friction?: number; tag?: string } = {},
  ): void => {
    statics.push({ shape: { kind: 'box', hx, hy, hz }, position, rotation, color, tag: opts.tag ?? 'prop' });
    if (opts.collide !== false) {
      const terrain = opts.tag !== 'wall';
      const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(position.x, position.y, position.z)
        .setRotation(rotation)
        .setFriction(opts.friction ?? 1.0)
        .setCollisionGroups(terrain ? GROUPS_TERRAIN : GROUPS_SOLID);
      world.createCollider(desc, ground);
    }
  };

  // ---- ground -------------------------------------------------------------
  const groundSize = 1400;
  addBox(groundSize / 2, 0.5, groundSize / 2, { x: 0, y: -0.5, z: 400 }, IDENTITY_QUAT, PALETTE.grass, { tag: 'ground' });
  // the asphalt lot (visual only; sits 1 cm above the ground collider)
  addBox(200, 0.01, 200, { x: 0, y: 0.0, z: 80 }, IDENTITY_QUAT, PALETTE.asphalt, { collide: false, tag: 'road' });

  // ---- long straight -------------------------------------------------------
  const zMid = (STRAIGHT.zStart + STRAIGHT.zEnd) / 2;
  const halfLen = (STRAIGHT.zEnd - STRAIGHT.zStart) / 2;
  addBox(STRAIGHT.width / 2, 0.015, halfLen, { x: STRAIGHT.x, y: 0.0, z: zMid }, IDENTITY_QUAT, PALETTE.asphaltLight, {
    collide: false,
    tag: 'road',
  });
  // centre dashes and edge lines
  for (let z = STRAIGHT.zStart; z < STRAIGHT.zEnd; z += 12) {
    addBox(0.08, 0.02, 2.5, { x: STRAIGHT.x, y: 0.005, z: z + 2.5 }, IDENTITY_QUAT, PALETTE.laneMark, { collide: false, tag: 'mark' });
  }
  addBox(0.1, 0.02, halfLen, { x: STRAIGHT.x - STRAIGHT.width / 2 + 0.3, y: 0.005, z: zMid }, IDENTITY_QUAT, PALETTE.laneMark, {
    collide: false,
    tag: 'mark',
  });
  addBox(0.1, 0.02, halfLen, { x: STRAIGHT.x + STRAIGHT.width / 2 - 0.3, y: 0.005, z: zMid }, IDENTITY_QUAT, PALETTE.laneMark, {
    collide: false,
    tag: 'mark',
  });
  // roadside posts every 20 m: cheap sense-of-speed reference
  for (let z = STRAIGHT.zStart + 20; z < STRAIGHT.zEnd; z += 20) {
    for (const side of [-1, 1]) {
      const x = STRAIGHT.x + side * (STRAIGHT.width / 2 + 2);
      addBox(0.12, 1.2, 0.12, { x, y: 1.2, z }, IDENTITY_QUAT, PALETTE.barrier, { collide: false, tag: 'post' });
      addBox(0.14, 0.15, 0.14, { x, y: 2.3, z }, IDENTITY_QUAT, PALETTE.cone, { collide: false, tag: 'post' });
    }
  }
  // distance boards every 100 m
  for (let z = 100; z <= STRAIGHT.zEnd; z += 100) {
    addBox(1.6, 0.6, 0.08, { x: STRAIGHT.x + STRAIGHT.width / 2 + 6, y: 2.2, z }, IDENTITY_QUAT, PALETTE.carBlue, { collide: false, tag: 'board' });
    addBox(0.1, 1.1, 0.1, { x: STRAIGHT.x + STRAIGHT.width / 2 + 6, y: 0.8, z }, IDENTITY_QUAT, PALETTE.concrete, { collide: false, tag: 'board' });
  }
  // end wall (soft stop)
  addBox(STRAIGHT.width, 1.0, 0.5, { x: STRAIGHT.x, y: 1.0, z: STRAIGHT.zEnd + 5 }, IDENTITY_QUAT, PALETTE.barrier, { tag: 'wall' });

  // ---- kerb lane: a straight with kerbs on both sides (rollover test) ----------
  const kerbX = 60;
  addBox(4, 0.015, 120, { x: kerbX, y: 0.0, z: 100 }, IDENTITY_QUAT, PALETTE.asphaltLight, { collide: false, tag: 'road' });
  for (const side of [-1, 1]) {
    for (let z = -20; z < 220; z += 6) {
      addBox(0.5, 0.06, 2.9, { x: kerbX + side * 3.6, y: 0.06, z }, IDENTITY_QUAT, (z / 6) % 2 === 0 ? PALETTE.ramp : PALETTE.kerb, { tag: 'kerb' });
    }
  }
  // rumble strip across the lane
  for (let z = 150; z < 180; z += 5) {
    addBox(4, 0.05, 0.4, { x: kerbX, y: 0.05, z }, IDENTITY_QUAT, PALETTE.laneMark, { tag: 'kerb' });
  }

  // ---- slalom ---------------------------------------------------------------
  const slalomX = -60;
  addBox(6, 0.015, 130, { x: slalomX, y: 0.0, z: 90 }, IDENTITY_QUAT, PALETTE.asphaltLight, { collide: false, tag: 'road' });
  for (let i = 0; i < 12; i++) {
    props.push({
      position: { x: slalomX, y: 0.45, z: 10 + i * 14 },
      rotation: IDENTITY_QUAT,
      shape: { kind: 'cylinder', radius: 0.28, halfHeight: 0.45 },
      color: PALETTE.cone,
      mass: 4,
    });
  }
  // gate marks
  for (let i = 0; i < 12; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    addBox(2.5, 0.02, 0.15, { x: slalomX + side * 3.2, y: 0.005, z: 10 + i * 14 }, IDENTITY_QUAT, PALETTE.laneMark, { collide: false, tag: 'mark' });
  }

  // ---- skidpad --------------------------------------------------------------
  const skid = { x: 150, z: 60, r: 26 };
  const segs = 48;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 0.5) / segs) * Math.PI * 2;
    const len = (Math.PI * 2 * skid.r) / segs;
    for (const [r, color] of [
      [skid.r, PALETTE.laneMark],
      [skid.r - 8, PALETTE.laneMark],
    ] as Array<[number, number]>) {
      const x = skid.x + Math.cos(a1) * r;
      const z = skid.z + Math.sin(a1) * r;
      addBox(len * 0.5 * (r / skid.r), 0.02, 0.15, { x, y: 0.005, z }, quatFromYaw(-a1), color, { collide: false, tag: 'mark' });
    }
    void a0;
  }
  addBox(skid.r + 12, 0.012, skid.r + 12, { x: skid.x, y: 0.0, z: skid.z }, IDENTITY_QUAT, PALETTE.asphaltLight, { collide: false, tag: 'road' });
  // centre mark (no props on the pad: a cone under a drifting car reads as a kerb to the suspension rays)
  addBox(1.5, 0.02, 0.15, { x: skid.x, y: 0.005, z: skid.z }, IDENTITY_QUAT, PALETTE.laneMark, { collide: false, tag: 'mark' });
  addBox(0.15, 0.02, 1.5, { x: skid.x, y: 0.005, z: skid.z }, IDENTITY_QUAT, PALETTE.laneMark, { collide: false, tag: 'mark' });

  // ---- ramps -----------------------------------------------------------------
  const rampX = -150;
  addBox(10, 0.015, 220, { x: rampX, y: 0.0, z: 180 }, IDENTITY_QUAT, PALETTE.asphaltLight, { collide: false, tag: 'road' });
  const ramps: Array<{ z: number; deg: number; len: number }> = [
    { z: 40, deg: 8, len: 10 },
    { z: 110, deg: 16, len: 10 },
    { z: 210, deg: 26, len: 12 },
  ];
  for (const r of ramps) {
    const rad = (r.deg * Math.PI) / 180;
    const thickness = 0.5;
    const cz = r.z + (Math.cos(rad) * r.len) / 2;
    const cy = (Math.sin(rad) * r.len) / 2 - thickness * Math.cos(rad) + 0.02;
    addBox(4, thickness, r.len / 2, { x: rampX, y: cy, z: cz }, quatFromAxisAngle(1, 0, 0, -rad), PALETTE.ramp, { friction: 1.0, tag: 'ramp' });
    // landing marker
    addBox(4, 0.02, 0.5, { x: rampX, y: 0.005, z: r.z + r.len + 20 + r.deg * 1.5 }, IDENTITY_QUAT, PALETTE.laneMark, { collide: false, tag: 'mark' });
  }
  // a big jump with a gap and a landing pad
  const big = { z: 320, deg: 22, len: 16 };
  {
    const rad = (big.deg * Math.PI) / 180;
    const cz = big.z + (Math.cos(rad) * big.len) / 2;
    const cy = (Math.sin(rad) * big.len) / 2 - 0.5 * Math.cos(rad) + 0.02;
    addBox(5, 0.5, big.len / 2, { x: rampX, y: cy, z: cz }, quatFromAxisAngle(1, 0, 0, -rad), PALETTE.carMagenta, { tag: 'ramp' });
    addBox(5, 0.02, 12, { x: rampX, y: 0.006, z: big.z + 70 }, IDENTITY_QUAT, PALETTE.carLime, { collide: false, tag: 'mark' });
  }

  // ---- walls lane: concrete barriers to scrape, an angled barrier to glance, a head-on wall ----
  // Barriers are tall and thick so the chassis meets a vertical face and never climbs them.
  const wallX = 250;
  const wallHalf = 7;
  addBox(wallHalf + 1, 0.015, 160, { x: wallX, y: 0.0, z: 110 }, IDENTITY_QUAT, PALETTE.asphaltLight, { collide: false, tag: 'road' });
  for (const side of [-1, 1]) {
    addBox(0.3, 0.6, 150, { x: wallX + side * (wallHalf + 0.3), y: 0.6, z: 100 }, IDENTITY_QUAT, PALETTE.concrete, { tag: 'wall' });
  }
  // angled barrier: from the left wall at z 190 to the lane centre at z 250 (about 7 degrees)
  {
    const x0 = wallX - wallHalf;
    const x1 = wallX + 0.5;
    const z0 = 190;
    const z1 = 250;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    addBox(0.3, 0.6, len / 2, { x: (x0 + x1) / 2, y: 0.6, z: (z0 + z1) / 2 }, quatFromYaw(yaw), PALETTE.concrete, { tag: 'wall' });
  }
  // pillars: a building corner at speed
  for (const z of [140, 160]) addBox(0.5, 1.5, 0.5, { x: wallX - 2.5, y: 1.5, z }, IDENTITY_QUAT, PALETTE.concrete, { tag: 'wall' });
  // head-on wall closing the lane
  addBox(wallHalf + 0.6, 1.0, 0.5, { x: wallX, y: 1.0, z: 270 }, IDENTITY_QUAT, PALETTE.barrier, { tag: 'wall' });

  // ---- scattered props on the lot: soft boxes to bump ---------------------------
  for (let i = 0; i < 10; i++) {
    props.push({
      position: { x: 20 + (i % 5) * 4, y: 0.6, z: -30 - Math.floor(i / 5) * 4 },
      rotation: IDENTITY_QUAT,
      shape: { kind: 'box', hx: 0.6, hy: 0.6, hz: 0.6 },
      color: i % 2 === 0 ? PALETTE.carOrange : PALETTE.sand,
      mass: 25,
    });
  }

  // ---- the test track (west of the lot) ----------------------------------------------
  const track = buildTrackDef({ x: -420, z: 40 });
  buildTrackGeometry(track, world, statics);

  // ---- spawn points ---------------------------------------------------------------
  spawns.push({ name: 'lot', position: { x: 0, y: 0.6, z: -40 }, yaw: 0 });
  spawns.push({ name: 'straight', position: { x: STRAIGHT.x, y: 0.6, z: STRAIGHT.zStart + 10 }, yaw: 0 });
  spawns.push({ name: 'straight-far', position: { x: STRAIGHT.x, y: 0.6, z: 500 }, yaw: 0 });
  spawns.push({ name: 'kerbs', position: { x: kerbX, y: 0.6, z: -40 }, yaw: 0 });
  spawns.push({ name: 'slalom', position: { x: slalomX, y: 0.6, z: -10 }, yaw: 0 });
  spawns.push({ name: 'skidpad', position: { x: skid.x, y: 0.6, z: skid.z - skid.r - 20 }, yaw: 0 });
  spawns.push({ name: 'ramps', position: { x: rampX, y: 0.6, z: 0 }, yaw: 0 });
  spawns.push({ name: 'walls', position: { x: wallX, y: 0.6, z: -30 }, yaw: 0 });
  spawns.push({ name: 'bigjump', position: { x: rampX, y: 0.6, z: 250 }, yaw: 0 });
  // 12 m before the start line so the first crossing starts the clock
  spawns.push({ name: 'track', position: { x: track.start.x - Math.sin(track.start.yaw) * 12, y: 0.6, z: track.start.z - Math.cos(track.start.yaw) * 12 }, yaw: track.start.yaw });

  return { statics, spawns, props, groundSize, track };
}
