/**
 * Sunset Works' places drawn (M8.10 slice 9): the dry canal's concrete lining over its channel (the ground's mesh is cut
 * away there), the freight train (its units where the sim's train has them, between its last two steps), the level
 * crossings' barrier arms and their blinking lamps. What stands still is drawn with the island's statics. Reads the sim,
 * never writes it.
 */
import * as THREE from 'three';
import { CITY_COLORS, ISLAND_COLORS, PALETTE } from '../../../sim';
import type { Island } from '../../../sim/island/Island';
import { TRAIN, barrierPost, isWorks, type FreightTrain, type LevelCrossing, type TrainUnit } from '../../../sim/island/places/works';
import { CANAL, canalLength, pointAt } from '../../../sim/island/shapes/works';
import { PAVEMENT } from '../../../sim/island/surfaces';
import type { PlaceView } from './index';

/** The lining's sections along the canal (m), and how far it lies over the channel's ground. */
const SECTION = 4;
const LINING_LIFT = 0.03;
/** A barrier's arm (m): its hinge's height on the post, its thickness, its stripes' length. */
const ARM = { hinge: 1.05, thick: 0.13, stripe: 1.2 } as const;

export function worksViews(group: THREE.Group, island: Island): PlaceView[] {
  const place = island.places.find(isWorks);
  if (!place) return [];
  return [canalView(group, island), trainView(group, place.train), barrierView(group, island, place.crossings)];
}

/** A mesh from triangles' corners and a colour a corner, flat-shaded. */
function meshOf(pos: number[], col: number[]): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * The canal's lining: sections across it every few metres (the coping, the sloped side, the floor, the trickle down its
 * middle, and back up the other side) on the channel's ground; no coping under a road's bridge (its pavement is there).
 */
function canalView(group: THREE.Group, island: Island): PlaceView {
  const ground = island.ground, length = canalLength(), c = new THREE.Color();
  const across = [-(CANAL.half + CANAL.coping), -CANAL.half, -CANAL.floorHalf, -0.5, 0.5, CANAL.floorHalf, CANAL.half, CANAL.half + CANAL.coping];
  const bands = [PALETTE.kerb, PALETTE.concrete, ISLAND_COLORS.paving, ISLAND_COLORS.seabed, ISLAND_COLORS.paving, PALETTE.concrete, PALETTE.kerb];
  const sections: number[][] = [];
  const p = { x: 0, z: 0 }, q = { x: 0, z: 0 };
  const count = Math.ceil(length / SECTION);
  for (let k = 0; k <= count; k++) {
    const s = Math.min(length, k * SECTION);
    pointAt(Math.max(0, s - 1), p);
    pointAt(Math.min(length, s + 1), q);
    const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1, rx = -dz / l, rz = dx / l;
    pointAt(s, p);
    const row: number[] = [];
    across.forEach((d, i) => {
      const x = p.x + rx * d, z = p.z + rz * d;
      row.push(x, ground.height(x, z) + LINING_LIFT + (i === 3 || i === 4 ? 0.02 : 0), z);
    });
    sections.push(row);
  }
  const pos: number[] = [], col: number[] = [];
  const corner = (row: number[], i: number): [number, number, number] => [row[i * 3] as number, row[i * 3 + 1] as number, row[i * 3 + 2] as number];
  for (let k = 0; k + 1 < sections.length; k++) {
    const a = sections[k] as number[], b = sections[k + 1] as number[];
    bands.forEach((hex, i) => {
      const a0 = corner(a, i), a1 = corner(a, i + 1), b0 = corner(b, i), b1 = corner(b, i + 1);
      const mx = (a0[0] + b1[0]) / 2, mz = (a0[2] + b1[2]) / 2;
      if ((i === 0 || i === 6) && ground.nearOtherRoad(mx, mz, -1, PAVEMENT + 1)) return;
      c.setHex(hex);
      // (facing up: across runs to the right of the way along)
      pos.push(...a0, ...b1, ...b0, ...a0, ...a1, ...b1);
      for (let v = 0; v < 6; v++) col.push(c.r, c.g, c.b);
    });
  }
  const mesh = meshOf(pos, col);
  group.add(mesh);
  return { dispose: () => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); } };
}

/** Boxes into one geometry (a unit of the train): each its middle, half sizes and colour. */
function boxes(parts: ReadonlyArray<readonly [number, number, number, number, number, number, number]>): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], c = new THREE.Color();
  const unit = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), v = unit.getAttribute('position') as THREE.BufferAttribute;
  for (const [x, y, z, hx, hy, hz, hex] of parts) {
    c.setHex(hex);
    for (let i = 0; i < v.count; i++) {
      pos.push(x + v.getX(i) * hx * 2, y + v.getY(i) * hy * 2, z + v.getZ(i) * hz * 2);
      col.push(c.r, c.g, c.b);
    }
  }
  unit.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * The freight train: each unit a mesh about its body's middle (a locomotive's cab at its outer end, a flat's container
 * on its deck), set each frame where the sim's train is between its last two steps.
 */
function trainView(group: THREE.Group, train: FreightTrain): PlaceView {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const meshes = train.units.map((u, k) => {
    const hl = u.length / 2, hh = u.height / 2, w = TRAIN.half;
    const outer = k === 0 ? 1 : -1;
    const parts: Array<readonly [number, number, number, number, number, number, number]> = u.kind === 'loco'
      ? [
        [0, -hh + 0.55, 0, hl, 0.55, w - 0.1, PALETTE.charcoal],
        [-outer * 1.2, 0.3, 0, hl - 1.4, hh - 0.6, w - 0.35, u.colour],
        [outer * (hl - 1.6), 0.55, 0, 1.5, hh - 0.35, w, u.colour],
        [outer * (hl - 1.6), 1.1, 0, 1.52, 0.45, w + 0.02, PALETTE.glassDark],
        [outer * (hl - 0.05), -hh + 1.5, 0, 0.08, 0.3, w - 0.4, PALETTE.carWhite],
        [0, -hh + 1.15, w - 0.05, hl - 0.2, 0.12, 0.08, PALETTE.carOrange],
        [0, -hh + 1.15, -w + 0.05, hl - 0.2, 0.12, 0.08, PALETTE.carOrange],
      ]
      : [
        [0, -hh + 0.6, 0, hl, 0.6, w - 0.2, PALETTE.graphite],
        [0, 0.6, 0, hl - 0.3, hh - 0.6, w - 0.05, u.colour],
        [hl - 0.28, 0.6, 0, 0.02, hh - 0.75, w - 0.2, CITY_COLORS.roof],
        [0, hh + 0.02, 0, hl - 0.4, 0.02, w - 0.25, CITY_COLORS.trim],
      ];
    const mesh = new THREE.Mesh(boxes(parts), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  });
  return {
    update(alpha: number): void {
      const mid = train.prevX + (train.x - train.prevX) * alpha;
      for (let k = 0; k < train.units.length; k++) {
        const u = train.units[k] as TrainUnit, x = mid + u.offset;
        (meshes[k] as THREE.Mesh).position.set(x, train.railAt(x) + TRAIN.ride + u.height / 2, train.z);
      }
    },
    dispose(): void {
      for (const m of meshes) m.geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * The crossings' barriers: an arm on each post, striped red and white, swinging from upright to across its half of the
 * road as the sim lowers it; two lamps on each post blinking in turn while the crossing is shut.
 */
function barrierView(group: THREE.Group, island: Island, crossings: readonly LevelCrossing[]): PlaceView {
  interface Arm { c: LevelCrossing; x: number; y: number; z: number; dx: number; dz: number; length: number; last: number }
  const arms: Arm[] = [], at = { x: 0, z: 0 };
  for (const c of crossings) for (const along of [-1, 1]) for (const side of [-1, 1]) {
    barrierPost(c, along, side, at);
    // toward the road's middle: the left of its way from the right edge, and back
    arms.push({ c, x: at.x, y: island.ground.surfaceHeight(at.x, at.z) + ARM.hinge, z: at.z, dx: side * c.uz, dz: -side * c.ux, length: c.half + 0.7, last: -1 });
  }
  // the arm along +X from its hinge, in stripes
  const longest = Math.max(1, ...arms.map((a) => a.length)), parts: Array<readonly [number, number, number, number, number, number, number]> = [];
  for (let s = 0, k = 0; s < longest; s += ARM.stripe, k++) parts.push([s + ARM.stripe / 2, 0, 0, ARM.stripe / 2, ARM.thick / 2, ARM.thick / 2, k % 2 ? PALETTE.carWhite : PALETTE.carRed]);
  const geometry = boxes(parts);
  const armMesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }), arms.length);
  armMesh.castShadow = true;
  group.add(armMesh);
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.08), new THREE.MeshBasicMaterial({ color: 0xff2a2a }), arms.length * 2);
  group.add(lamps);
  const m = new THREE.Matrix4(), xAxis = new THREE.Vector3(), yAxis = new THREE.Vector3(), zAxis = new THREE.Vector3(), scale = new THREE.Vector3();
  const place = (a: Arm, k: number, down: number): void => {
    // upright at 0, across the road at 1: the arm's way turns from up to the road's middle about the road's own way
    const t = (1 - down) * (Math.PI / 2 - 0.05);
    xAxis.set(a.dx * Math.cos(t), Math.sin(t), a.dz * Math.cos(t));
    zAxis.set(a.c.ux, 0, a.c.uz);
    yAxis.crossVectors(zAxis, xAxis);
    m.makeBasis(xAxis, yAxis, zAxis);
    // its length to its half of the road
    m.scale(scale.set(a.length / longest, 1, 1));
    m.setPosition(a.x, a.y, a.z);
    armMesh.setMatrixAt(k, m);
  };
  arms.forEach((a, k) => place(a, k, a.c.down));
  let clock = 0, shown = -1;
  return {
    update(_alpha: number, dt: number): void {
      clock += dt;
      let moved = false, shut = false;
      for (let k = 0; k < arms.length; k++) {
        const a = arms[k] as Arm;
        shut ||= a.c.closed;
        if (a.c.down === a.last) continue;
        a.last = a.c.down;
        place(a, k, a.c.down);
        moved = true;
      }
      if (moved) armMesh.instanceMatrix.needsUpdate = true;
      // the lamps either side of each post's housing (across the road's way); lit in turn while shut
      const blink = Math.floor(clock * 2) % 2, key = shut ? blink : -2;
      if (key === shown && !moved) return;
      shown = key;
      for (let k = 0; k < arms.length; k++) {
        const a = arms[k] as Arm;
        for (let n = 0; n < 2; n++) {
          const on = a.c.closed && n === blink, o = n ? 0.32 : -0.32;
          m.makeScale(on ? 1 : 0.001, on ? 1 : 0.001, on ? 1 : 0.001);
          m.setPosition(a.x + a.dx * o, a.y - ARM.hinge + 2.9, a.z + a.dz * o);
          lamps.setMatrixAt(k * 2 + n, m);
        }
      }
      lamps.instanceMatrix.needsUpdate = true;
    },
    dispose(): void {
      geometry.dispose();
      (armMesh.material as THREE.Material).dispose();
      lamps.geometry.dispose();
      (lamps.material as THREE.Material).dispose();
    },
  };
}
