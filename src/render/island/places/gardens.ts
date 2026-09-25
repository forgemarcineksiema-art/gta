/**
 * Palm Gardens' own surfaces drawn over the ground (M8.10 slice 10): the botanic garden's gravel paths and the
 * Glasshouse's paved terrace; the golf's fairways mown in stripes, its greens and tees, its bunkers' sand. One mesh, a
 * hair over the ground (whose mesh keeps under them, `gardensLaid`). What stands (the Glasshouse, the trees, the flags,
 * the boardwalk) is drawn with the island's statics; the dunes and the pond are the ground's and the sea's. Reads the
 * sim, never writes it.
 */
import * as THREE from 'three';
import { ISLAND_COLORS, PALETTE } from '../../../sim';
import type { Island } from '../../../sim/island/Island';
import { BUNKERS, FAIRWAYS, GLASSHOUSE, GREENS, PATH, TEE, TEES, gardenPaths, type Capsule, type Oval } from '../../../sim/island/shapes/gardens';
import type { PlaceView } from './index';

/** How far each surface lies over the ground (m): the fairways, then the bunkers and the greens over them. */
const LIFT = { gravel: 0.05, fairway: 0.05, bunker: 0.06, green: 0.07 } as const;
/** The fairways' mown stripes across them, this long (m). */
const STRIPE = 8;

export function gardensViews(group: THREE.Group, island: Island): PlaceView[] {
  const ground = island.ground, pos: number[] = [], col: number[] = [], c = new THREE.Color();
  const vertex = (x: number, z: number, lift: number): [number, number, number] => [x, ground.surfaceHeight(x, z) + lift, z];
  // a triangle facing up, its colour
  const tri = (a: readonly number[], b: readonly number[], d: readonly number[], hex: number): void => {
    const up = ((b[2] as number) - (a[2] as number)) * ((d[0] as number) - (a[0] as number)) - ((b[0] as number) - (a[0] as number)) * ((d[2] as number) - (a[2] as number));
    const [p, q] = up >= 0 ? [b, d] : [d, b];
    pos.push(...a, ...p, ...q);
    c.setHex(hex);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  };
  const quad = (a: readonly number[], b: readonly number[], d: readonly number[], e: readonly number[], hex: number): void => { tri(a, b, d, hex); tri(a, d, e, hex); };

  // an oval (a green, a bunker, the terrace) as rings round its middle, each ring's points on the ground
  const oval = (o: Oval, lift: number, hex: number, rings = 2, sides = 24): void => {
    const ring = (f: number): Array<[number, number, number]> => Array.from({ length: sides }, (_, k) => {
      const a = (k / sides) * Math.PI * 2;
      return vertex(o.x + Math.cos(a) * o.rx * f, o.z + Math.sin(a) * o.rz * f, lift);
    });
    const middle = vertex(o.x, o.z, lift);
    let inner = ring(1 / rings);
    for (let k = 0; k < sides; k++) tri(middle, inner[k] as number[], inner[(k + 1) % sides] as number[], hex);
    for (let r = 2; r <= rings; r++) {
      const outer = ring(r / rings);
      for (let k = 0; k < sides; k++) quad(inner[k] as number[], outer[k] as number[], outer[(k + 1) % sides] as number[], inner[(k + 1) % sides] as number[], hex);
      inner = outer;
    }
  };

  // the garden's paths: a strip along each (three points across), the straight ones cut at the parkway's inner edge
  for (const p of gardenPaths()) {
    const n = p.pts.length, last = p.closed ? n : n - 1;
    const across = (i: number, o: number): number[] => {
      const q = p.pts[i % n] as readonly [number, number], a = p.pts[p.closed ? (i - 1 + n) % n : Math.max(0, i - 1)] as readonly [number, number], b = p.pts[p.closed ? (i + 1) % n : Math.min(n - 1, i + 1)] as readonly [number, number];
      const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
      const z = q[1] + (tx / l) * o;
      let x = q[0] - (tz / l) * o;
      // (a straight path's end on the parkway's inner edge, each point across on the circle)
      const gx = x - GLASSHOUSE.x, gz = z - GLASSHOUSE.z, reach = PATH.end - 0.5;
      if (!p.closed && Math.hypot(gx, gz) > reach) x = GLASSHOUSE.x + Math.sign(gx) * Math.sqrt(Math.max(0, reach * reach - gz * gz));
      return vertex(x, z, LIFT.gravel);
    };
    for (let i = 0; i < last; i++) {
      for (const [o0, o1] of [[-PATH.half, 0], [0, PATH.half]] as const) quad(across(i, o0), across(i + 1, o0), across(i + 1, o1), across(i, o1), ISLAND_COLORS.gravel);
    }
  }
  // the Glasshouse's terrace
  oval({ x: GLASSHOUSE.x, z: GLASSHOUSE.z, rx: GLASSHOUSE.paved, rz: GLASSHOUSE.paved }, LIFT.gravel, ISLAND_COLORS.paving, 5, 40);

  // the fairways: along each, its round ends finer, its stripes across
  for (const f of FAIRWAYS) fairway(f);
  for (const t of TEES) {
    const s = Math.sin(t.yaw), co = Math.cos(t.yaw);
    const at = (u: number, v: number): number[] => vertex(t.x + s * u + co * v, t.z + co * u - s * v, LIFT.green);
    for (const [u0, u1] of [[-TEE.along, 0], [0, TEE.along]] as const) quad(at(u0, -TEE.across), at(u1, -TEE.across), at(u1, TEE.across), at(u0, TEE.across), ISLAND_COLORS.green);
  }
  for (const g of GREENS) oval(g, LIFT.green, ISLAND_COLORS.green, 3, 28);
  for (const b of BUNKERS) oval(b, LIFT.bunker, PALETTE.sand, 3, 24);

  function fairway(f: Capsule): void {
    const dx = f.bx - f.ax, dz = f.bz - f.az, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    // stations along from −r to len + r: every 2 m round the ends, every 4 m between, and at every stripe's edge
    const stations: number[] = [];
    for (let s = -f.r; s < 0; s += 2) stations.push(s);
    for (let s = 0; s < len; s += 4) stations.push(s);
    for (let s = Math.ceil(-f.r / STRIPE) * STRIPE; s < len + f.r; s += STRIPE) stations.push(s);
    for (let s = len; s < len + f.r; s += 2) stations.push(s);
    stations.push(len + f.r);
    stations.sort((p, q) => p - q);
    const width = (s: number): number => (s < 0 ? Math.sqrt(Math.max(0, f.r * f.r - s * s)) : s > len ? Math.sqrt(Math.max(0, f.r * f.r - (s - len) ** 2)) : f.r);
    const at = (s: number, k: number): number[] => {
      const o = width(s) * (k / 2 - 1);
      return vertex(f.ax + ux * s - uz * o, f.az + uz * s + ux * o, LIFT.fairway);
    };
    for (let i = 0; i + 1 < stations.length; i++) {
      const s0 = stations[i] as number, s1 = stations[i + 1] as number;
      if (s1 - s0 < 0.01) continue;
      const hex = Math.floor(((s0 + s1) / 2 + f.r) / STRIPE) % 2 === 0 ? ISLAND_COLORS.fairway : ISLAND_COLORS.fairwayStripe;
      for (let k = 0; k < 4; k++) quad(at(s0, k), at(s1, k), at(s1, k + 1), at(s0, k + 1), hex);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  group.add(mesh);
  return [{ dispose: () => { mesh.removeFromParent(); geometry.dispose(); material.dispose(); } }];
}
