/**
 * The driver's kit drawn (M6 slices 6–7, docs/DESIGN.md §14.4): each topper
 * as a few boxes, cylinders and cones in the palette, flat-shaded vertex
 * colours in one geometry, its origin on the roof, +Z forward; under 300
 * triangles each. The renderer seats the one worn on whatever car the player
 * drives, so it goes into every swapped car.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '../sim';

type Part = THREE.BufferGeometry;

function coloured(g: THREE.BufferGeometry, hex: number): Part {
  const geometry = g.index ? g.toNonIndexed() : g;
  if (geometry !== g) g.dispose();
  const c = new THREE.Color(hex);
  const n = geometry.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number): Part =>
  coloured(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, hex: number, seg = 10): Part =>
  coloured(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z), hex);

/** A five-point star in the x-y plane, `r` to its points, `depth` thick. */
function star(r: number, depth: number, x: number, y: number, z: number, hex: number): Part {
  const s = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = Math.PI / 2 + k * Math.PI / 5, rr = k % 2 === 0 ? r : r * 0.45;
    if (k === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2).translate(x, y, z);
  return coloured(g, hex);
}

/** The streak's cone (M5), and every unknown id's. */
function cone(): Part[] {
  return [coloured(new THREE.ConeGeometry(0.26, 0.55, 20, 1, false).translate(0, 0.275, 0), PALETTE.carOrange), box(0.5, 0.04, 0.5, 0, 0.02, 0, PALETTE.carOrange)];
}

/** Each topper's parts, its origin on the roof. */
const TOPPERS: Record<string, () => Part[]> = {
  cone,
  duck: () => [
    box(0.5, 0.3, 0.62, 0, 0.17, -0.05, PALETTE.coin),
    box(0.3, 0.28, 0.28, 0, 0.42, 0.16, PALETTE.coin),
    box(0.16, 0.06, 0.16, 0, 0.4, 0.36, PALETTE.carOrange),
    box(0.04, 0.05, 0.04, 0.09, 0.48, 0.3, PALETTE.ink), box(0.04, 0.05, 0.04, -0.09, 0.48, 0.3, PALETTE.ink),
    box(0.3, 0.12, 0.14, 0, 0.28, -0.36, PALETTE.coin),
  ],
  shark: () => [
    box(0.06, 0.2, 0.6, 0, 0.1, 0, PALETTE.slate),
    box(0.06, 0.2, 0.42, 0, 0.3, -0.08, PALETTE.slate),
    box(0.06, 0.2, 0.26, 0, 0.5, -0.15, PALETTE.slate),
    box(0.06, 0.14, 0.12, 0, 0.67, -0.2, PALETTE.slate),
  ],
  crown: () => [
    cyl(0.3, 0.3, 0.16, 0, 0.08, 0, PALETTE.carGold, 10),
    ...[0, 1, 2, 3, 4].map((k) => box(0.1, 0.18, 0.1, Math.cos(k * 1.2566) * 0.26, 0.25, Math.sin(k * 1.2566) * 0.26, PALETTE.carGold)),
    ...[0, 1, 2, 3, 4].map((k) => box(0.06, 0.06, 0.06, Math.cos(k * 1.2566) * 0.26, 0.37, Math.sin(k * 1.2566) * 0.26, PALETTE.carRed)),
  ],
  signal: () => [
    box(0.08, 0.2, 0.08, 0, 0.1, 0, PALETTE.steel),
    box(0.3, 0.72, 0.26, 0, 0.56, 0, PALETTE.charcoal),
    box(0.16, 0.16, 0.03, 0, 0.78, 0.14, PALETTE.carRed),
    box(0.16, 0.16, 0.03, 0, 0.56, 0.14, PALETTE.carOrange),
    box(0.16, 0.16, 0.03, 0, 0.34, 0.14, PALETTE.carLime),
    box(0.16, 0.16, 0.03, 0, 0.78, -0.14, PALETTE.carRed),
  ],
  donut: () => [
    coloured(new THREE.TorusGeometry(0.3, 0.13, 6, 12).rotateX(Math.PI / 2).translate(0, 0.14, 0), PALETTE.wafer),
    coloured(new THREE.TorusGeometry(0.3, 0.1, 4, 12).rotateX(Math.PI / 2).translate(0, 0.2, 0), PALETTE.iceCream),
  ],
  dish: () => [
    box(0.08, 0.26, 0.08, 0, 0.13, 0, PALETTE.steel),
    coloured(new THREE.CylinderGeometry(0.34, 0.06, 0.14, 12, 1, true).rotateX(-0.9).translate(0, 0.38, 0.02), PALETTE.lightGrey),
    box(0.04, 0.3, 0.04, 0, 0.44, 0.14, PALETTE.steel),
  ],
  mattress: () => [
    box(1.1, 0.2, 1.7, 0, 0.1, -0.1, PALETTE.carWhite),
    box(1.12, 0.05, 0.1, 0, 0.12, 0.35, PALETTE.carBlue),
    box(1.12, 0.05, 0.1, 0, 0.12, -0.55, PALETTE.carBlue),
    box(0.03, 0.22, 1.72, 0.3, 0.1, -0.1, PALETTE.ink), box(0.03, 0.22, 1.72, -0.3, 0.1, -0.1, PALETTE.ink),
  ],
  trophy: () => [
    box(0.3, 0.1, 0.3, 0, 0.05, 0, PALETTE.ink),
    cyl(0.05, 0.05, 0.22, 0, 0.21, 0, PALETTE.carGold, 8),
    cyl(0.22, 0.1, 0.34, 0, 0.49, 0, PALETTE.carGold, 12),
    box(0.06, 0.2, 0.06, 0.26, 0.5, 0, PALETTE.carGold), box(0.06, 0.2, 0.06, -0.26, 0.5, 0, PALETTE.carGold),
  ],
  flamingo: () => [
    box(0.03, 0.34, 0.03, 0.05, 0.17, 0, PALETTE.iceCream), box(0.03, 0.34, 0.03, -0.05, 0.17, 0, PALETTE.iceCream),
    box(0.24, 0.2, 0.42, 0, 0.44, -0.05, PALETTE.iceCream),
    box(0.06, 0.34, 0.06, 0, 0.66, 0.14, PALETTE.iceCream),
    box(0.12, 0.1, 0.16, 0, 0.84, 0.18, PALETTE.iceCream),
    box(0.06, 0.05, 0.12, 0, 0.82, 0.3, PALETTE.ink),
  ],
  flowerpots: () => [-0.32, 0, 0.32].flatMap((x) => [
    box(0.26, 0.22, 0.26, x, 0.11, 0, PALETTE.wafer),
    box(0.3, 0.12, 0.3, x, 0.28, 0, PALETTE.grass),
    box(0.12, 0.09, 0.12, x, 0.38, 0, PALETTE.iceCream),
  ]),
  pizza: () => [
    box(0.08, 0.1, 0.08, 0, 0.05, 0, PALETTE.ink),
    ...[0.14, 0.3, 0.46, 0.62].map((w, k) => box(w, 0.11, 0.06, 0, 0.16 + k * 0.11, 0, PALETTE.coin)),
    box(0.74, 0.12, 0.09, 0, 0.6, 0, PALETTE.wafer),
    box(0.1, 0.09, 0.08, 0.12, 0.43, 0, PALETTE.carRed), box(0.1, 0.09, 0.08, -0.14, 0.37, 0, PALETTE.carRed),
  ],
  beacon: () => [
    box(1.0, 0.1, 0.22, 0, 0.05, 0, PALETTE.charcoal),
    box(0.3, 0.12, 0.24, 0.3, 0.16, 0, PALETTE.cone), box(0.3, 0.12, 0.24, -0.3, 0.16, 0, PALETTE.cone),
  ],
  discoBar: () => [
    box(1.1, 0.08, 0.26, 0, 0.04, 0, PALETTE.charcoal),
    ...[PALETTE.iceCream, PALETTE.carLime, PALETTE.coin, PALETTE.carBlue, PALETTE.carMagenta].map((c, k) => box(0.18, 0.12, 0.22, -0.44 + k * 0.22, 0.14, 0, c)),
  ],
  flags: () => [0.35, -0.35].flatMap((x) => [
    box(0.02, 0.5, 0.02, x, 0.25, 0.1, PALETTE.chrome),
    box(0.012, 0.18, 0.3, x, 0.42, -0.06, PALETTE.carRed),
    box(0.014, 0.06, 0.3, x, 0.42, -0.06, PALETTE.carWhite),
  ]),
  propeller: () => [
    coloured(new THREE.SphereGeometry(0.26, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), PALETTE.carLime),
    box(0.14, 0.03, 0.2, 0, 0.02, 0.3, PALETTE.carBlue),
    box(0.03, 0.14, 0.03, 0, 0.32, 0, PALETTE.steel),
    box(0.62, 0.02, 0.07, 0, 0.4, 0, PALETTE.carRed),
  ],
  goldStar: () => [box(0.06, 0.14, 0.06, 0, 0.07, 0, PALETTE.steel), star(0.3, 0.07, 0, 0.44, 0, PALETTE.carGold)],
};

/** A topper's geometry by its kit id (the cone for an unknown one). */
export function topperGeometry(id: string): THREE.BufferGeometry {
  const parts = (TOPPERS[id] ?? cone)();
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** The topper ids drawn here (tests: every topper in the kit has one). */
export const TOPPER_IDS: readonly string[] = Object.keys(TOPPERS);
