/**
 * Two wheels and a rider (M8.8 slices 15–16, docs/STYLE.md Vehicles), in blocks, flat-shaded, vertex colours: the
 * sport bike, its paint on the tank, the fairing, the tail and the mudguard; the delivery scooter, its paint on the
 * leg shield, the cowl and the nacelle, a red box on its rack. The rider astride in a navy suit and a white helmet,
 * arms to the bars, or thrown up while bike and rider tumble. A bike draws its own two wheels on the body (the sim's
 * four sit on a 0.1 m track straight down, where a lean would leave them); the front one turns with the fork. The
 * driver's topper sits on the helmet's crown, the boost's flame at the exhaust. Under 3,000 triangles a bike, under
 * 1,500 its rider. Among the traffic a bike stands without its rider, and a courier in red rides a driven one.
 *
 * Local frame as carMesh.ts: +Z forward, +Y up, +X left; the blocks' heights above the ground.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, PED_COLORS, type BodyId, type VehicleTelemetry, type VehicleTuning } from '../../sim';
import { restHeight, wheelGeometry, type CarMesh } from './carMesh';

/** One block: size, centre, a tilt about the across axis (+ turns its top forward), a colour, the paint or the suit, a light. */
interface Block { size: readonly [number, number, number]; at: readonly [number, number, number]; tilt?: number; color: number; paint?: boolean; tail?: boolean }

/** A block in the rider's suit: the player's navy, a courier's red. */
const SUIT = -1;
const TAIL_OFF = 0xba2338, TAIL_ON = 0xff6972;
/** The courier riding a scooter in the traffic: a red jacket to the box. */
const COURIER = PALETTE.carRed;

/** A two-wheeler's shape: its blocks, the fork's pivot and bars, its rider, its exhaust, its wheels' style. */
export interface BikeShape {
  /** The parts that do not turn. */
  body: readonly Block[];
  /** The headstock (the fork's pivot); the fork's legs run from it to the front axle, the mudguard over the tyre. */
  head: { y: number; z: number };
  /** What turns with the fork besides its legs and mudguard, from the pivot. */
  bars: readonly Block[];
  legs: { x: number; size: number };
  /** The rider without arms; the helmet (its crown carries the topper); the arms to the bars, or up in a fall. */
  rider: readonly Block[];
  helmet: { y: number; z: number; r: number };
  armsBars: readonly Block[];
  armsUp: readonly Block[];
  /** The exhaust's end, where the boost's flame burns. */
  exhaust: { x: number; y: number; z: number };
  /** The wheels' hub style (carMesh's `wheelGeometry`). */
  wheels: string;
}

/** The motorbike: frame, engine, sump, tank, fairing, nose, screen, headlight, seat, tail, taillight, swingarm, exhaust, pegs. */
const SPORT: BikeShape = {
  body: [
    { size: [0.22, 0.12, 0.9], at: [0, 0.72, 0.1], tilt: -0.2, color: PALETTE.charcoal },
    { size: [0.36, 0.36, 0.5], at: [0, 0.48, 0.05], color: PALETTE.graphite },
    { size: [0.34, 0.1, 0.4], at: [0, 0.3, 0.15], color: PALETTE.charcoal },
    { size: [0.38, 0.22, 0.46], at: [0, 0.93, 0.22], color: 0, paint: true },
    { size: [0.42, 0.4, 0.36], at: [0, 0.85, 0.62], color: 0, paint: true },
    { size: [0.3, 0.2, 0.2], at: [0, 0.78, 0.86], color: 0, paint: true },
    { size: [0.3, 0.18, 0.04], at: [0, 1.1, 0.55], tilt: 0.6, color: PALETTE.glassDark },
    { size: [0.16, 0.08, 0.03], at: [0, 0.82, 0.97], color: PALETTE.barrier },
    { size: [0.3, 0.08, 0.5], at: [0, 0.86, -0.28], color: PALETTE.ink },
    { size: [0.26, 0.14, 0.42], at: [0, 0.93, -0.68], tilt: 0.15, color: 0, paint: true },
    { size: [0.12, 0.05, 0.03], at: [0, 0.95, -0.9], color: TAIL_OFF, tail: true },
    { size: [0.08, 0.08, 0.62], at: [0.1, 0.4, -0.42], tilt: -0.1, color: PALETTE.charcoal },
    { size: [0.08, 0.08, 0.62], at: [-0.1, 0.4, -0.42], tilt: -0.1, color: PALETTE.charcoal },
    { size: [0.12, 0.12, 0.5], at: [0.18, 0.45, -0.6], tilt: 0.15, color: PALETTE.chrome },
    { size: [0.1, 0.03, 0.03], at: [0.2, 0.42, -0.18], color: PALETTE.steel },
    { size: [0.1, 0.03, 0.03], at: [-0.2, 0.42, -0.18], color: PALETTE.steel },
  ],
  head: { y: 0.95, z: 0.52 },
  bars: [{ size: [0.62, 0.04, 0.04], at: [0, 0.08, -0.05], color: PALETTE.ink }],
  legs: { x: 0.09, size: 0.05 },
  // tucked: hips on the seat, the back down to the tank, thighs to the tank, shins to the pegs
  rider: [
    { size: [0.34, 0.2, 0.28], at: [0, 0.98, -0.25], color: SUIT },
    { size: [0.38, 0.22, 0.55], at: [0, 1.16, -0.01], tilt: -0.7, color: SUIT },
    { size: [0.14, 0.14, 0.45], at: [0.14, 0.96, -0.05], tilt: 0.3, color: SUIT },
    { size: [0.14, 0.14, 0.45], at: [-0.14, 0.96, -0.05], tilt: 0.3, color: SUIT },
    { size: [0.12, 0.4, 0.12], at: [0.2, 0.62, 0], tilt: 0.4, color: PED_COLORS.boots },
    { size: [0.12, 0.4, 0.12], at: [-0.2, 0.62, 0], tilt: 0.4, color: PED_COLORS.boots },
  ],
  helmet: { y: 1.43, z: 0.24, r: 0.17 },
  armsBars: [
    { size: [0.09, 0.09, 0.45], at: [0.24, 1.16, 0.34], tilt: 0.6, color: SUIT },
    { size: [0.09, 0.09, 0.45], at: [-0.24, 1.16, 0.34], tilt: 0.6, color: SUIT },
  ],
  armsUp: [
    { size: [0.09, 0.5, 0.09], at: [0.22, 1.6, 0.15], color: SUIT },
    { size: [0.09, 0.5, 0.09], at: [-0.22, 1.6, 0.15], color: SUIT },
  ],
  exhaust: { x: 0.18, y: 0.49, z: -0.85 },
  wheels: 'sports',
};

/** The delivery scooter: floorboard, frame, leg shield, cowl, seat, engine, exhaust, rack, the box and its lid, taillight. */
const SCOOTER: BikeShape = {
  body: [
    { size: [0.32, 0.05, 0.56], at: [0, 0.33, 0.04], color: PALETTE.ink },
    { size: [0.26, 0.14, 0.62], at: [0, 0.24, 0.02], color: PALETTE.graphite },
    { size: [0.46, 0.62, 0.07], at: [0, 0.66, 0.36], tilt: -0.25, color: 0, paint: true },
    { size: [0.4, 0.3, 0.72], at: [0, 0.62, -0.36], color: 0, paint: true },
    { size: [0.3, 0.1, 0.56], at: [0, 0.82, -0.26], color: PALETTE.ink },
    { size: [0.14, 0.2, 0.5], at: [0.13, 0.3, -0.45], color: PALETTE.graphite },
    { size: [0.08, 0.08, 0.34], at: [-0.12, 0.28, -0.6], color: PALETTE.steel },
    { size: [0.34, 0.03, 0.36], at: [0, 0.785, -0.74], color: PALETTE.steel },
    { size: [0.44, 0.4, 0.44], at: [0, 1.0, -0.74], color: PALETTE.carRed },
    { size: [0.46, 0.05, 0.46], at: [0, 1.22, -0.74], color: PALETTE.carWhite },
    { size: [0.12, 0.05, 0.03], at: [0, 0.68, -0.735], color: TAIL_OFF, tail: true },
  ],
  head: { y: 1.0, z: 0.33 },
  bars: [
    { size: [0.58, 0.04, 0.04], at: [0, 0.1, -0.05], color: PALETTE.ink },
    { size: [0.24, 0.12, 0.16], at: [0, 0.08, 0.03], color: 0, paint: true },
    { size: [0.12, 0.07, 0.02], at: [0, 0.08, 0.115], color: PALETTE.barrier },
  ],
  legs: { x: 0.07, size: 0.045 },
  // upright: hips on the seat, the back straight, thighs forward, shins down to the floorboard
  rider: [
    { size: [0.34, 0.2, 0.3], at: [0, 0.97, -0.3], color: SUIT },
    { size: [0.38, 0.46, 0.24], at: [0, 1.26, -0.28], tilt: 0.12, color: SUIT },
    { size: [0.14, 0.14, 0.4], at: [0.13, 0.96, -0.1], color: SUIT },
    { size: [0.14, 0.14, 0.4], at: [-0.13, 0.96, -0.1], color: SUIT },
    { size: [0.12, 0.52, 0.12], at: [0.14, 0.62, 0.08], tilt: 0.1, color: PED_COLORS.boots },
    { size: [0.12, 0.52, 0.12], at: [-0.14, 0.62, 0.08], tilt: 0.1, color: PED_COLORS.boots },
  ],
  helmet: { y: 1.62, z: -0.24, r: 0.17 },
  armsBars: [
    { size: [0.09, 0.09, 0.67], at: [0.24, 1.275, 0.015], tilt: 0.55, color: SUIT },
    { size: [0.09, 0.09, 0.67], at: [-0.24, 1.275, 0.015], tilt: 0.55, color: SUIT },
  ],
  armsUp: [
    { size: [0.09, 0.5, 0.09], at: [0.22, 1.72, -0.27], color: SUIT },
    { size: [0.09, 0.5, 0.09], at: [-0.22, 1.72, -0.27], color: SUIT },
  ],
  exhaust: { x: -0.12, y: 0.28, z: -0.77 },
  wheels: 'compact',
};

/** A two-wheeled body's shape: the scooter's, else the motorbike's. */
export function bikeShapeOf(body: BodyId): BikeShape {
  return body === 'scooter' ? SCOOTER : SPORT;
}

/** A geometry in one colour, its UVs dropped (the blocks merge with the wheels' lathes). */
function tinted(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const n = g.getAttribute('position').count, c = new THREE.Color(hex), colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

interface Built { geometry: THREE.BufferGeometry; paint: Array<[number, number]>; tail: Array<[number, number]> }

/** Blocks into one geometry raised by `lift`, painted ones in `paint`, the suit in `suit`; the paint's and the taillight's vertex ranges. */
function blocks(list: readonly Block[], lift: number, paint: number, suit: number = PED_COLORS.navy): Built {
  const parts: THREE.BufferGeometry[] = [];
  const paintRanges: Array<[number, number]> = [], tail: Array<[number, number]> = [];
  let at = 0;
  for (const b of list) {
    const g = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]).toNonIndexed();
    if (b.tilt) g.rotateX(b.tilt);
    g.translate(b.at[0], b.at[1] + lift, b.at[2]);
    tinted(g, b.paint ? paint : b.color === SUIT ? suit : b.color);
    const n = g.getAttribute('position').count;
    if (b.paint) paintRanges.push([at, n]);
    if (b.tail) tail.push([at, n]);
    parts.push(g);
    at += n;
  }
  const geometry = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return { geometry, paint: paintRanges, tail };
}

/** The fork from its pivot: two legs raked down to the front axle, the mudguard over the tyre, the shape's bars. */
function forkBlocks(shape: BikeShape, t: VehicleTuning): Block[] {
  const dy = t.wheelRadius - shape.head.y, dz = t.wheelBase / 2 - shape.head.z;
  const length = Math.hypot(dy, dz), tilt = Math.atan2(-dz, -dy), { x, size } = shape.legs;
  return [
    { size: [size, length, size], at: [x, dy / 2, dz / 2], tilt, color: PALETTE.chrome },
    { size: [size, length, size], at: [-x, dy / 2, dz / 2], tilt, color: PALETTE.chrome },
    { size: [t.wheelWidth - 0.02, 0.04, t.wheelRadius * 1.55], at: [0, dy + t.wheelRadius + 0.04, dz], color: 0, paint: true },
    ...shape.bars,
  ];
}

/** The rider raised by `lift`: body, helmet and visor, arms to the bars or up, in `suit`. */
function riderAt(shape: BikeShape, arms: 'bars' | 'up', lift: number, suit: number): THREE.BufferGeometry {
  const h = shape.helmet;
  const body = blocks(shape.rider, lift, 0, suit).geometry;
  const helmet = tinted(new THREE.IcosahedronGeometry(h.r, 1).translate(0, h.y + lift, h.z), PALETTE.carWhite);
  const visor = blocks([{ size: [0.2, 0.08, 0.04], at: [0, h.y, h.z + h.r - 0.01], color: PALETTE.glassDark }], lift, 0).geometry;
  const limbs = blocks(arms === 'bars' ? shape.armsBars : shape.armsUp, lift, 0, suit).geometry;
  const g = mergeGeometries([body, helmet, visor, limbs], false);
  for (const p of [body, helmet, visor, limbs]) p.dispose();
  return g;
}

/** The player's rider in a pose, in the mesh's frame. */
export function riderGeometry(t: VehicleTuning, arms: 'bars' | 'up', shape: BikeShape = SPORT): THREE.BufferGeometry {
  return riderAt(shape, arms, -restHeight(t), PED_COLORS.navy);
}

/** The bike's parts in the mesh's frame: the body that does not turn, the fork from its pivot, a wheel. */
export function bikeGeometries(t: VehicleTuning, paint: number, shape: BikeShape = SPORT): { body: Built; fork: Built; wheel: THREE.BufferGeometry } {
  return { body: blocks(shape.body, -restHeight(t), paint), fork: blocks(forkBlocks(shape, t), 0, paint), wheel: wheelGeometry(t, shape.wheels) };
}

/** A traffic geometry's `paintMask` (bodyMesh.ts): 1 over the ranges, 0 elsewhere. */
function masked(g: THREE.BufferGeometry, ranges: Array<[number, number]>): THREE.BufferGeometry {
  const mask = new Float32Array(g.getAttribute('position').count);
  for (const [start, n] of ranges) mask.fill(1, start, start + n);
  g.setAttribute('paintMask', new THREE.BufferAttribute(mask, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * A two-wheeler among the traffic's instanced bodies (bodyMesh.ts's frame: the origin on the road, a `paintMask` of
 * 1 where the instance's paint goes): the bike without its rider, the fork straight, plain tyres.
 */
export function bikeTrafficGeometry(t: VehicleTuning, shape: BikeShape = SPORT): THREE.BufferGeometry {
  const body = blocks(shape.body, 0, 0xffffff), fork = blocks(forkBlocks(shape, t), 0, 0xffffff);
  fork.geometry.translate(0, shape.head.y, shape.head.z);
  const r = t.wheelRadius, w = t.wheelWidth;
  const wheel = (z: number): THREE.BufferGeometry[] => [
    tinted(new THREE.CylinderGeometry(r, r, w, 10).toNonIndexed().rotateZ(Math.PI / 2).translate(0, r, z), PALETTE.rubber),
    tinted(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.01, 8).toNonIndexed().rotateZ(Math.PI / 2).translate(0, r, z), PALETTE.rim),
  ];
  const parts = [body.geometry, fork.geometry, ...wheel(t.wheelBase / 2), ...wheel(-t.wheelBase / 2)];
  const forkAt = body.geometry.getAttribute('position').count;
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return masked(g, [...body.paint, ...fork.paint.map(([start, n]): [number, number] => [forkAt + start, n])]);
}

/** The courier on a two-wheeler driven in the traffic, in the traffic's frame: no paint of the instance's. */
export function riderTrafficGeometry(shape: BikeShape): THREE.BufferGeometry {
  return masked(riderAt(shape, 'bars', 0, COURIER), []);
}

/** A drawn bike with its rider: a `CarMesh` whose `wheels` (the sim's four) stay empty, its own two on the body. */
export function buildBikeMesh(t: VehicleTuning, paint: number = PALETTE.carMagenta, shape: BikeShape = SPORT): CarMesh {
  const ground = -restHeight(t);
  const root = new THREE.Group();
  root.name = 'bike';
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const parts = bikeGeometries(t, paint, shape);
  const body = new THREE.Mesh(parts.body.geometry, material);
  body.name = 'body-and-trim';
  body.castShadow = true;
  // the fork turns about the headstock, the front wheel in it
  const fork = new THREE.Group();
  fork.position.set(0, shape.head.y + ground, shape.head.z);
  const forkMesh = new THREE.Mesh(parts.fork.geometry, material);
  forkMesh.castShadow = true;
  const front = new THREE.Mesh(parts.wheel, material);
  front.position.set(0, t.wheelRadius - shape.head.y, t.wheelBase / 2 - shape.head.z);
  front.castShadow = true;
  fork.add(forkMesh, front);
  const rear = new THREE.Mesh(parts.wheel, material);
  rear.position.set(0, t.wheelRadius + ground, -t.wheelBase / 2);
  rear.castShadow = true;
  // the rider: arms to the bars, or up while they tumble
  const riding = new THREE.Mesh(riderGeometry(t, 'bars', shape), material);
  riding.name = 'rider';
  const tumbling = new THREE.Mesh(riderGeometry(t, 'up', shape), material);
  tumbling.name = 'rider-tumbling';
  riding.castShadow = tumbling.castShadow = true;
  tumbling.visible = false;
  root.add(body, fork, rear, riding, tumbling);
  const colors = parts.body.geometry.getAttribute('color') as THREE.BufferAttribute;
  const forkColors = parts.fork.geometry.getAttribute('color') as THREE.BufferAttribute;
  const tone = new THREE.Color(), graphite = new THREE.Color(PALETTE.graphite);
  const fill = (target: THREE.BufferAttribute, ranges: Array<[number, number]>): void => {
    for (const [start, n] of ranges) for (let k = start; k < start + n; k++) target.setXYZ(k, tone.r, tone.g, tone.b);
    target.needsUpdate = true;
  };
  // the paint darkens toward graphite stage by stage, as a car's does; a bike takes its knocks in its paint
  const repaint = (): void => {
    tone.setHex(mesh.paint).lerp(graphite, Math.min(0.85, 0.25 * mesh.damageStage));
    fill(colors, parts.body.paint);
    fill(forkColors, parts.fork.paint);
  };
  let braking = false, roll = 0;
  parts.body.geometry.computeBoundingBox();
  const box = parts.body.geometry.boundingBox as THREE.Box3;
  const h = shape.helmet, e = shape.exhaust;
  const mesh: CarMesh = {
    root, wheels: [0, 1, 2, 3].map(() => new THREE.Group()), spinners: [front, rear], damageStage: 0, paint,
    roofY: box.max.y, midY: (box.min.y + box.max.y) / 2,
    crown: { y: h.y + h.r + ground, z: h.z },
    exhaust: { x: e.x, y: e.y + ground, z: e.z },
    update(tm: VehicleTelemetry) {
      // the fork follows the steer (+ right), the arms go up in a fall
      fork.rotation.y = -tm.steerDeg * (Math.PI / 180);
      if (riding.visible === tm.tumbling) {
        riding.visible = !tm.tumbling;
        tumbling.visible = tm.tumbling;
      }
      const brake = tm.brake > 0.1 && tm.gear > 0;
      if (brake !== braking) {
        braking = brake;
        tone.setHex(brake ? TAIL_ON : TAIL_OFF);
        fill(colors, parts.body.tail);
      }
    },
    setDamage(stage) {
      stage = Math.max(0, Math.min(4, Math.round(stage)));
      if (stage === mesh.damageStage) return;
      mesh.damageStage = stage;
      repaint();
    },
    setPaint(hex) {
      mesh.paint = hex;
      repaint();
    },
    dent() {},
    spin(dt, speed) {
      roll = (roll + (speed / t.wheelRadius) * dt) % (Math.PI * 2);
      front.rotation.x = roll;
      rear.rotation.x = roll;
    },
  };
  return mesh;
}
