/**
 * The motorbike and its rider (M8.8 slice 15, docs/STYLE.md Vehicles): a sport bike in blocks, flat-shaded, vertex
 * colours, its paint on the tank, the fairing, the tail and the mudguard; the rider astride in a navy suit and a white
 * helmet, arms to the bars, or thrown up while bike and rider tumble. The bike draws its own two wheels on the body
 * (the sim's four sit on a 0.1 m track straight down, where a lean would leave them); the front one turns with the
 * fork. The driver's topper sits on the helmet's crown, the boost's flame at the exhaust. Under 3,000 triangles the
 * bike, under 1,500 the rider. A bike left in the street is drawn among the traffic without its rider.
 *
 * Local frame as carMesh.ts: +Z forward, +Y up, +X left; the blocks' heights above the ground.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, PED_COLORS, type VehicleTelemetry, type VehicleTuning } from '../../sim';
import { restHeight, wheelGeometry, type CarMesh } from './carMesh';

/** One block: size, centre, a tilt about the across axis (+ tips its front down), a colour or the paint, a light. */
interface Block { size: readonly [number, number, number]; at: readonly [number, number, number]; tilt?: number; color: number; paint?: boolean; tail?: boolean }

const TAIL_OFF = 0xba2338, TAIL_ON = 0xff6972;
/** The exhaust's end, where the boost's flame burns. */
const EXHAUST = { x: 0.18, y: 0.49, z: -0.85 } as const;

/** The bike, less its fork and wheels: frame, engine, sump, tank, fairing, nose, screen, headlight, seat, tail, taillight, swingarm, exhaust, pegs. */
const BIKE: readonly Block[] = [
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
  { size: [0.12, 0.12, 0.5], at: [EXHAUST.x, 0.45, -0.6], tilt: 0.15, color: PALETTE.chrome },
  { size: [0.1, 0.03, 0.03], at: [0.2, 0.42, -0.18], color: PALETTE.steel },
  { size: [0.1, 0.03, 0.03], at: [-0.2, 0.42, -0.18], color: PALETTE.steel },
];

/** The headstock (the fork's pivot), above the ground and along the bike. */
const HEAD = { y: 0.95, z: 0.52 } as const;
/** The fork from its pivot: the legs raked down to the axle, the clip-on bars, the mudguard over the tyre. */
const FORK: readonly Block[] = [
  { size: [0.05, 0.66, 0.05], at: [0.09, -0.3, 0.1], tilt: -0.3, color: PALETTE.chrome },
  { size: [0.05, 0.66, 0.05], at: [-0.09, -0.3, 0.1], tilt: -0.3, color: PALETTE.chrome },
  { size: [0.62, 0.04, 0.04], at: [0, 0.08, -0.05], color: PALETTE.ink },
  { size: [0.14, 0.04, 0.5], at: [0, -0.27, 0.205], color: 0, paint: true },
];

const SUIT = PED_COLORS.navy;
/** The rider astride: hips on the seat, the back down to the tank, the face under the visor, thighs and shins to the pegs. */
const RIDER: readonly Block[] = [
  { size: [0.34, 0.2, 0.28], at: [0, 0.98, -0.25], color: SUIT },
  { size: [0.38, 0.22, 0.55], at: [0, 1.16, -0.01], tilt: -0.7, color: SUIT },
  { size: [0.2, 0.22, 0.22], at: [0, 1.38, 0.22], color: PED_COLORS.skin },
  { size: [0.2, 0.07, 0.03], at: [0, 1.43, 0.39], color: PALETTE.glassDark },
  { size: [0.14, 0.14, 0.45], at: [0.14, 0.96, -0.05], tilt: 0.3, color: SUIT },
  { size: [0.14, 0.14, 0.45], at: [-0.14, 0.96, -0.05], tilt: 0.3, color: SUIT },
  { size: [0.12, 0.4, 0.12], at: [0.2, 0.62, 0], tilt: 0.4, color: PED_COLORS.boots },
  { size: [0.12, 0.4, 0.12], at: [-0.2, 0.62, 0], tilt: 0.4, color: PED_COLORS.boots },
];
/** The helmet's centre and radius: the topper sits on its crown. */
const HELMET = { y: 1.43, z: 0.24, r: 0.17 } as const;
/** The arms: to the bars, or thrown up in a tumble. */
const ARMS_BARS: readonly Block[] = [
  { size: [0.09, 0.09, 0.45], at: [0.24, 1.16, 0.34], tilt: 0.6, color: SUIT },
  { size: [0.09, 0.09, 0.45], at: [-0.24, 1.16, 0.34], tilt: 0.6, color: SUIT },
];
const ARMS_UP: readonly Block[] = [
  { size: [0.09, 0.5, 0.09], at: [0.22, 1.6, 0.15], color: SUIT },
  { size: [0.09, 0.5, 0.09], at: [-0.22, 1.6, 0.15], color: SUIT },
];

/** A geometry in one colour, its UVs dropped (the blocks merge with the wheels' lathes). */
function tinted(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const n = g.getAttribute('position').count, c = new THREE.Color(hex), colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

interface Built { geometry: THREE.BufferGeometry; paint: Array<[number, number]>; tail: Array<[number, number]> }

/** Blocks into one geometry raised by `lift`, the painted ones in `paint`; the paint's and the taillight's vertex ranges. */
function blocks(list: readonly Block[], lift: number, paint: number): Built {
  const parts: THREE.BufferGeometry[] = [];
  const paintRanges: Array<[number, number]> = [], tail: Array<[number, number]> = [];
  let at = 0;
  for (const b of list) {
    const g = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]).toNonIndexed();
    if (b.tilt) g.rotateX(b.tilt);
    g.translate(b.at[0], b.at[1] + lift, b.at[2]);
    tinted(g, b.paint ? paint : b.color);
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

/** The rider in a pose, in the mesh's frame: body, helmet, arms. */
export function riderGeometry(t: VehicleTuning, arms: 'bars' | 'up'): THREE.BufferGeometry {
  const ground = -restHeight(t);
  const body = blocks(RIDER, ground, 0).geometry;
  const helmet = tinted(new THREE.IcosahedronGeometry(HELMET.r, 1).translate(0, HELMET.y + ground, HELMET.z), PALETTE.carWhite);
  const limbs = blocks(arms === 'bars' ? ARMS_BARS : ARMS_UP, ground, 0).geometry;
  const g = mergeGeometries([body, helmet, limbs], false);
  body.dispose(); helmet.dispose(); limbs.dispose();
  return g;
}

/** The bike's parts in the mesh's frame: the body that does not turn, the fork from its pivot, a wheel. */
export function bikeGeometries(t: VehicleTuning, paint: number): { body: Built; fork: Built; wheel: THREE.BufferGeometry } {
  return { body: blocks(BIKE, -restHeight(t), paint), fork: blocks(FORK, 0, paint), wheel: wheelGeometry(t, 'sports') };
}

/**
 * A bike left in the street, among the traffic's instanced bodies (bodyMesh.ts's frame: the origin on the road, a
 * `paintMask` of 1 where the instance's paint goes): the bike without its rider, the fork straight, plain tyres.
 */
export function bikeTrafficGeometry(t: VehicleTuning): THREE.BufferGeometry {
  const body = blocks(BIKE, 0, 0xffffff), fork = blocks(FORK, 0, 0xffffff);
  fork.geometry.translate(0, HEAD.y, HEAD.z);
  const r = t.wheelRadius, w = t.wheelWidth;
  const wheel = (z: number): THREE.BufferGeometry[] => [
    tinted(new THREE.CylinderGeometry(r, r, w, 10).toNonIndexed().rotateZ(Math.PI / 2).translate(0, r, z), PALETTE.rubber),
    tinted(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.01, 8).toNonIndexed().rotateZ(Math.PI / 2).translate(0, r, z), PALETTE.rim),
  ];
  const parts = [body.geometry, fork.geometry, ...wheel(t.wheelBase / 2), ...wheel(-t.wheelBase / 2)];
  const forkAt = body.geometry.getAttribute('position').count;
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const mask = new Float32Array(g.getAttribute('position').count);
  for (const [start, n] of body.paint) mask.fill(1, start, start + n);
  for (const [start, n] of fork.paint) mask.fill(1, forkAt + start, forkAt + start + n);
  g.setAttribute('paintMask', new THREE.BufferAttribute(mask, 1));
  g.computeBoundingSphere();
  return g;
}

/** A drawn bike with its rider: a `CarMesh` whose `wheels` (the sim's four) stay empty, its own two on the body. */
export function buildBikeMesh(t: VehicleTuning, paint: number = PALETTE.carMagenta): CarMesh {
  const ground = -restHeight(t);
  const root = new THREE.Group();
  root.name = 'bike';
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const parts = bikeGeometries(t, paint);
  const body = new THREE.Mesh(parts.body.geometry, material);
  body.name = 'body-and-trim';
  body.castShadow = true;
  // the fork turns about the headstock, the front wheel in it
  const fork = new THREE.Group();
  fork.position.set(0, HEAD.y + ground, HEAD.z);
  const forkMesh = new THREE.Mesh(parts.fork.geometry, material);
  forkMesh.castShadow = true;
  const front = new THREE.Mesh(parts.wheel, material);
  front.position.set(0, t.wheelRadius - HEAD.y, t.wheelBase / 2 - HEAD.z);
  front.castShadow = true;
  fork.add(forkMesh, front);
  const rear = new THREE.Mesh(parts.wheel, material);
  rear.position.set(0, t.wheelRadius + ground, -t.wheelBase / 2);
  rear.castShadow = true;
  // the rider: arms to the bars, or up while they tumble
  const riding = new THREE.Mesh(riderGeometry(t, 'bars'), material);
  riding.name = 'rider';
  const tumbling = new THREE.Mesh(riderGeometry(t, 'up'), material);
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
  const mesh: CarMesh = {
    root, wheels: [0, 1, 2, 3].map(() => new THREE.Group()), spinners: [front, rear], damageStage: 0, paint,
    roofY: box.max.y, midY: (box.min.y + box.max.y) / 2,
    crown: { y: HELMET.y + HELMET.r + ground, z: HELMET.z },
    exhaust: { x: EXHAUST.x, y: EXHAUST.y + ground, z: EXHAUST.z },
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
