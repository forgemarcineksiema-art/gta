/**
 * Cars built in code from parametric profiles (docs/BRIEF.md §4, docs/STYLE.md).
 *
 * The body is a loft through cross-sections along the car's length: each section
 * has a floor, a belt line and a roof line with their own half widths. Every
 * face of the loft is a bilinear panel, and all the detail lives IN those panels
 * as flush decals (polygons drawn in the panel's own parameter space, offset a
 * few millimetres along its normal): pillars splitting the glass into windows,
 * the belt trim, door seams and handles, wheel-arch pockets, sills, bumper bands,
 * headlights, grille, tail lights, reverse lights, plate. Nothing is a box stuck
 * on a slanted surface. The only true 3D parts are the mirrors, the exhaust tips,
 * a lip spoiler and the wheels (tyre, sidewall, rim, spokes, cap).
 *
 * One geometry, vertex colours, flat shading, no textures. Brake and reverse
 * lights react to the sim by rewriting their decal colours in place.
 *
 * Local frame: +Z forward, +Y up, +X left. Profile heights are above the ground
 * with the car at rest; the builder converts to the body origin.
 */
import * as THREE from 'three';
import { PALETTE, type VehicleTelemetry, type VehicleTuning } from '../sim';

export interface CarMesh {
  root: THREE.Group;
  wheels: THREE.Object3D[];
  update(tm: VehicleTelemetry): void;
}

/** One cross-section of the body at longitudinal position z (metres, + = front). */
export interface Section {
  z: number;
  /** Heights above ground. */
  floor: number;
  belt: number;
  roof: number;
  /** Half widths at the floor, the belt line and the roof. */
  hwFloor: number;
  hwBelt: number;
  hwRoof: number;
}

export interface CarProfile {
  name: string;
  sections: Section[];
  /** Segment index range [from, to) whose upper sides are glass (the doors' windows). */
  glassSides: [number, number];
  /** Segment indices whose sloping top is glass: windscreen and rear window. */
  glassTops: number[];
  /** Segment index of the A pillar (its upper side is glass with the pillar drawn along the slope), and of the C pillar (paint with a quarter window). */
  aPillar: number;
  cPillar: number;
  /** z of the B pillar(s), of the door seams, and of the door handle. */
  pillars: number[];
  doorSeams: number[];
  handleZ: number;
  headlight: { width: number; height: number; y: number; inset: number };
  taillight: { width: number; height: number; y: number; inset: number };
  grille: { width: number; height: number; y: number } | null;
  /** Height of the bumper band on the front and rear caps, metres above the floor. */
  bumperHeight: number;
  lipSpoiler: boolean;
  mirrors: boolean;
  exhausts: number;
  /** Visual wheel offset along the axle: negative pushes the wheels outward past the sills. */
  wheelInset: number;
}

/** A long-bonnet coupe: the first car. Heights above ground, length 4.5 m, width ~1.9 m at the belt. */
export const MUSCLE: CarProfile = {
  name: 'muscle',
  sections: [
    { z: 2.25, floor: 0.4, belt: 0.62, roof: 0.66, hwFloor: 0.74, hwBelt: 0.84, hwRoof: 0.8 },
    { z: 1.95, floor: 0.36, belt: 0.7, roof: 0.74, hwFloor: 0.8, hwBelt: 0.92, hwRoof: 0.88 },
    { z: 1.3, floor: 0.36, belt: 0.76, roof: 0.79, hwFloor: 0.84, hwBelt: 0.94, hwRoof: 0.89 },
    { z: 0.75, floor: 0.36, belt: 0.8, roof: 0.83, hwFloor: 0.84, hwBelt: 0.95, hwRoof: 0.89 },
    { z: 0.05, floor: 0.36, belt: 0.82, roof: 1.32, hwFloor: 0.84, hwBelt: 0.95, hwRoof: 0.72 },
    { z: -0.85, floor: 0.36, belt: 0.82, roof: 1.32, hwFloor: 0.84, hwBelt: 0.95, hwRoof: 0.72 },
    { z: -1.5, floor: 0.37, belt: 0.84, roof: 0.92, hwFloor: 0.83, hwBelt: 0.93, hwRoof: 0.86 },
    { z: -1.95, floor: 0.38, belt: 0.84, roof: 0.9, hwFloor: 0.8, hwBelt: 0.9, hwRoof: 0.84 },
    { z: -2.25, floor: 0.42, belt: 0.8, roof: 0.86, hwFloor: 0.74, hwBelt: 0.84, hwRoof: 0.8 },
  ],
  glassSides: [4, 5],
  glassTops: [3, 5],
  aPillar: 3,
  cPillar: 5,
  pillars: [-0.42],
  doorSeams: [0.72, -0.52],
  handleZ: -0.25,
  headlight: { width: 0.42, height: 0.12, y: 0.54, inset: 0.3 },
  taillight: { width: 0.5, height: 0.13, y: 0.69, inset: 0.3 },
  grille: { width: 0.6, height: 0.1, y: 0.54 },
  bumperHeight: 0.1,
  lipSpoiler: true,
  mirrors: true,
  exhausts: 2,
  wheelInset: -0.08,
};

type UV = [number, number];

/**
 * A bilinear surface patch with an outward normal and a mapping from car
 * coordinates (a, b) to (u, v). `lo(u)`/`hi(u)` give the b-range at a given u,
 * `a0`/`a1` the a-range, so decals can be authored in metres.
 */
interface Panel {
  c0: THREE.Vector3;
  c1: THREE.Vector3;
  c2: THREE.Vector3;
  c3: THREE.Vector3;
  normal: THREE.Vector3;
  a0: number;
  a1: number;
  lo0: number;
  lo1: number;
  hi0: number;
  hi1: number;
}

class BodyBuilder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  private readonly c = new THREE.Color();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly tmp3 = new THREE.Vector3();

  /** Base quad of a panel. */
  fill(p: Panel, color: number): void {
    this.tri(p.c0, p.c1, p.c2, color);
    this.tri(p.c0, p.c2, p.c3, color);
  }

  /** Convex polygon in car coordinates on a panel, clipped to the panel, offset along its normal. Returns [start vertex, count]. */
  decal(p: Panel, poly: UV[], color: number, offset = 0.004): [number, number] {
    let uv: UV[] = poly.map(([a, b]) => this.toUV(p, a, b));
    uv = clipUnitSquare(uv);
    const start = this.positions.length / 3;
    if (uv.length < 3) return [start, 0];
    // counter-clockwise in (u, v) means the triangles face along the panel's outward normal
    let area = 0;
    for (let i = 0; i < uv.length; i++) {
      const [u0, v0] = uv[i] as UV;
      const [u1, v1] = uv[(i + 1) % uv.length] as UV;
      area += u0 * v1 - u1 * v0;
    }
    if (area < 0) uv.reverse();
    const pts = uv.map(([u, v]) => this.at(p, u, v).addScaledVector(p.normal, offset));
    for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0] as THREE.Vector3, pts[i] as THREE.Vector3, pts[i + 1] as THREE.Vector3, color);
    return [start, this.positions.length / 3 - start];
  }

  private toUV(p: Panel, a: number, b: number): UV {
    const u = (a - p.a0) / (p.a1 - p.a0);
    const lo = p.lo0 + (p.lo1 - p.lo0) * u;
    const hi = p.hi0 + (p.hi1 - p.hi0) * u;
    return [u, (b - lo) / Math.max(1e-4, hi - lo)];
  }

  private at(p: Panel, u: number, v: number): THREE.Vector3 {
    this.tmp2.lerpVectors(p.c0, p.c1, u);
    this.tmp3.lerpVectors(p.c3, p.c2, u);
    return new THREE.Vector3().lerpVectors(this.tmp2, this.tmp3, v);
  }

  private tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number): void {
    this.c.setHex(color);
    for (const v of [a, b, c]) {
      this.positions.push(v.x, v.y, v.z);
      this.colors.push(this.c.r, this.c.g, this.c.b);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeVertexNormals();
    void this.tmp;
    return g;
  }
}

/** Sutherland–Hodgman clip of a convex polygon to [0,1]². */
function clipUnitSquare(poly: UV[]): UV[] {
  let out = poly;
  const edges: Array<(p: UV) => number> = [([u]) => u, ([u]) => 1 - u, ([, v]) => v, ([, v]) => 1 - v];
  for (const inside of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i] as UV;
      const prev = input[(i + input.length - 1) % input.length] as UV;
      const dc = inside(cur);
      const dp = inside(prev);
      if (dc >= 0) {
        if (dp < 0) out.push(lerpUV(prev, cur, dp / (dp - dc)));
        out.push(cur);
      } else if (dp >= 0) {
        out.push(lerpUV(prev, cur, dp / (dp - dc)));
      }
    }
    if (out.length === 0) return out;
  }
  return out;
}

function lerpUV(a: UV, b: UV, t: number): UV {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Rectangle on a cap panel, whose parameters run (a = height, b = x). */
function rectYX(y0: number, y1: number, x0: number, x1: number): UV[] {
  return rect(y0, y1, x0, x1);
}

function rect(a0: number, a1: number, b0: number, b1: number): UV[] {
  return [
    [a0, b0],
    [a1, b0],
    [a1, b1],
    [a0, b1],
  ];
}

function makePanel(c0: THREE.Vector3, c1: THREE.Vector3, c2: THREE.Vector3, c3: THREE.Vector3, ref: THREE.Vector3, map: Omit<Panel, 'c0' | 'c1' | 'c2' | 'c3' | 'normal'>): Panel {
  const n = new THREE.Vector3().subVectors(c1, c0).cross(new THREE.Vector3().subVectors(c3, c0));
  if (n.lengthSq() < 1e-12) n.subVectors(c2, c0).cross(new THREE.Vector3().subVectors(c3, c0));
  n.normalize();
  const centre = new THREE.Vector3().add(c0).add(c1).add(c2).add(c3).multiplyScalar(0.25).sub(ref);
  if (n.dot(centre) < 0) {
    n.negate();
    // keep the winding consistent with the normal
    return { c0: c1, c1: c0, c2: c3, c3: c2, normal: n, ...map, a0: map.a1, a1: map.a0, lo0: map.lo1, lo1: map.lo0, hi0: map.hi1, hi1: map.hi0 };
  }
  return { c0, c1, c2, c3, normal: n, ...map };
}

function shade(hex: number, k: number): number {
  return new THREE.Color(hex).multiplyScalar(k).getHex();
}

export function buildCarMesh(t: VehicleTuning, profile: CarProfile = MUSCLE, color: number = PALETTE.carRed): CarMesh {
  const root = new THREE.Group();
  const gEff = 9.81 + t.extraGravity;
  const staticCompression = (t.mass * gEff) / 4 / t.suspensionStiffness;
  const y0 = t.wheelRadius + t.suspensionRestLength - staticCompression - t.suspensionAttachY;
  const S = profile.sections;
  const nose = S[0] as Section;
  const tail = S[S.length - 1] as Section;
  const paint = color;
  const paintDark = shade(color, 0.72);
  const glass = PALETTE.glass;
  const bb = new BodyBuilder();
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y - y0, z);

  // ---- the loft: per segment, six panels ------------------------------------------
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i] as Section;
    const b = S[i + 1] as Section;
    const ref = P(0, (a.floor + a.roof + b.floor + b.roof) / 4, (a.z + b.z) / 2);
    const aMap = { a0: a.z, a1: b.z };
    // floor
    bb.fill(makePanel(P(a.hwFloor, a.floor, a.z), P(b.hwFloor, b.floor, b.z), P(-b.hwFloor, b.floor, b.z), P(-a.hwFloor, a.floor, a.z), ref, { ...aMap, lo0: a.hwFloor, lo1: b.hwFloor, hi0: -a.hwFloor, hi1: -b.hwFloor }), PALETTE.charcoal);
    for (const side of [1, -1]) {
      // lower side: floor -> belt (a = z, b = height)
      const lower = makePanel(P(side * a.hwFloor, a.floor, a.z), P(side * b.hwFloor, b.floor, b.z), P(side * b.hwBelt, b.belt, b.z), P(side * a.hwBelt, a.belt, a.z), ref, { ...aMap, lo0: a.floor, lo1: b.floor, hi0: a.belt, hi1: b.belt });
      bb.fill(lower, paint);
      // sill along the bottom of the doors and fenders
      bb.decal(lower, rect(a.z, b.z, Math.min(a.floor, b.floor), Math.max(a.floor, b.floor) + 0.05), PALETTE.charcoal);
      // wheel-arch pockets
      for (const wz of [t.wheelBase / 2, -t.wheelBase / 2]) {
        if (wz + 0.5 < Math.min(a.z, b.z) || wz - 0.5 > Math.max(a.z, b.z)) continue;
        const arc: UV[] = [];
        const rr = t.wheelRadius + 0.07;
        for (let k = 0; k <= 10; k++) {
          const ang = (k / 10) * Math.PI;
          arc.push([wz + Math.cos(ang) * rr, t.wheelRadius + Math.sin(ang) * rr]);
        }
        bb.decal(lower, arc, PALETTE.ink, 0.003);
      }
      // door seams and handle
      for (const dz of profile.doorSeams) bb.decal(lower, rect(dz + 0.012, dz - 0.012, Math.min(a.floor, b.floor) + 0.06, 2), PALETTE.ink);
      bb.decal(lower, rect(profile.handleZ + 0.08, profile.handleZ - 0.08, a.belt - 0.16, a.belt - 0.12), PALETTE.graphite);

      // upper side: belt -> roof
      const upper = makePanel(P(side * a.hwBelt, a.belt, a.z), P(side * b.hwBelt, b.belt, b.z), P(side * b.hwRoof, b.roof, b.z), P(side * a.hwRoof, a.roof, a.z), ref, { ...aMap, lo0: a.belt, lo1: b.belt, hi0: a.roof, hi1: b.roof });
      const isGlass = i >= profile.glassSides[0] && i < profile.glassSides[1];
      if (i === profile.aPillar) {
        // quarter light with the A pillar drawn along the windscreen slope
        bb.fill(upper, glass);
        const w = 0.16;
        bb.decal(upper, [[a.z, a.belt], [a.z - w, a.belt], [b.z + w * 0.3, b.roof], [b.z, b.roof]].map(([z, y]) => [z, y] as UV), PALETTE.charcoal);
        bb.decal(upper, [[a.z, a.belt], [b.z, b.belt], [b.z, b.belt + 0.06], [a.z, a.belt + 0.03]] as UV[], PALETTE.ink);
      } else if (i === profile.cPillar) {
        // thick C pillar with a small quarter window in front of it
        bb.fill(upper, paint);
        bb.decal(upper, [[a.z - 0.02, a.belt + 0.08], [a.z - 0.02, a.roof - 0.08], [a.z - 0.42, a.roof - 0.12], [a.z - 0.38, a.belt + 0.08]] as UV[], glass);
        bb.decal(upper, rect(a.z, b.z, a.belt, a.belt + 0.05), PALETTE.ink);
      } else if (isGlass) {
        bb.fill(upper, glass);
        for (const pz of profile.pillars) bb.decal(upper, rect(pz + 0.045, pz - 0.045, 0, 3), PALETTE.charcoal);
        bb.decal(upper, rect(a.z, b.z, a.belt, a.belt + 0.05), PALETTE.ink); // belt trim
        bb.decal(upper, rect(a.z, b.z, a.roof - 0.04, a.roof), PALETTE.charcoal); // drip rail
      } else {
        bb.fill(upper, paint);
      }
    }
    // top: roof line a -> b
    const top = makePanel(P(a.hwRoof, a.roof, a.z), P(b.hwRoof, b.roof, b.z), P(-b.hwRoof, b.roof, b.z), P(-a.hwRoof, a.roof, a.z), ref, { ...aMap, lo0: a.hwRoof, lo1: b.hwRoof, hi0: -a.hwRoof, hi1: -b.hwRoof });
    bb.fill(top, profile.glassTops.includes(i) ? glass : paint);
  }

  // ---- caps: nose and tail, with bumper bands, lights, grille, plate -----------------------
  const cap = (s: Section, front: boolean) => {
    const ref = P(0, (s.floor + s.roof) / 2, 0);
    // parameter a runs up the cap (height), b across it (x), so the width follows the trapezoid exactly
    const lower = makePanel(P(-s.hwFloor, s.floor, s.z), P(-s.hwBelt, s.belt, s.z), P(s.hwBelt, s.belt, s.z), P(s.hwFloor, s.floor, s.z), ref, { a0: s.floor, a1: s.belt, lo0: -s.hwFloor, lo1: -s.hwBelt, hi0: s.hwFloor, hi1: s.hwBelt });
    const upper = makePanel(P(-s.hwBelt, s.belt, s.z), P(-s.hwRoof, s.roof, s.z), P(s.hwRoof, s.roof, s.z), P(s.hwBelt, s.belt, s.z), ref, { a0: s.belt, a1: s.roof, lo0: -s.hwBelt, lo1: -s.hwRoof, hi0: s.hwBelt, hi1: s.hwRoof });
    bb.fill(lower, front ? paint : paintDark);
    bb.fill(upper, paint);
    // bumper band across the whole lower cap
    bb.decal(lower, rectYX(s.floor, s.floor + profile.bumperHeight, -2, 2), PALETTE.charcoal);
    bb.decal(lower, rectYX(s.floor, s.floor + 0.03, -2, 2), PALETTE.ink);
    return lower;
  };
  const noseLower = cap(nose, true);
  const tailLower = cap(tail, false);
  const h = profile.headlight;
  for (const sx of [-1, 1]) {
    const cx = sx * (nose.hwBelt - h.inset);
    bb.decal(noseLower, rectYX(h.y - h.height / 2 - 0.02, h.y + h.height / 2 + 0.02, cx - h.width / 2 - 0.02, cx + h.width / 2 + 0.02), PALETTE.ink, 0.003);
    bb.decal(noseLower, rectYX(h.y - h.height / 2, h.y + h.height / 2, cx - h.width / 2, cx + h.width / 2), 0xfff1c9, 0.005);
  }
  if (profile.grille) {
    const g = profile.grille;
    bb.decal(noseLower, rectYX(g.y - g.height / 2, g.y + g.height / 2, -g.width / 2, g.width / 2), PALETTE.ink, 0.003);
    for (let k = 0; k < 2; k++) {
      const y = g.y - g.height / 2 + (g.height / 3) * (k + 1);
      bb.decal(noseLower, rectYX(y - 0.006, y + 0.006, -g.width / 2 + 0.03, g.width / 2 - 0.03), PALETTE.steel, 0.005);
    }
  }
  const tl = profile.taillight;
  const tailLightRanges: Array<[number, number]> = [];
  const reverseRanges: Array<[number, number]> = [];
  for (const sx of [-1, 1]) {
    const cx = sx * (tail.hwBelt - tl.inset);
    bb.decal(tailLower, rectYX(tl.y - tl.height / 2 - 0.02, tl.y + tl.height / 2 + 0.02, cx - tl.width / 2 - 0.02, cx + tl.width / 2 + 0.02), PALETTE.ink, 0.003);
    const inner = cx - sx * tl.width * 0.2; // the reverse lamp sits on the inboard end
    tailLightRanges.push(bb.decal(tailLower, rectYX(tl.y - tl.height / 2, tl.y + tl.height / 2, inner + sx * 0.03, cx + sx * (tl.width / 2)), 0xc2222f, 0.005));
    reverseRanges.push(bb.decal(tailLower, rectYX(tl.y - tl.height / 2, tl.y + tl.height / 2, cx - sx * (tl.width / 2), inner - sx * 0.01), 0x8a8a8f, 0.005));
  }
  bb.decal(tailLower, rectYX(tail.floor + profile.bumperHeight + 0.05, tail.floor + profile.bumperHeight + 0.16, -0.2, 0.2), PALETTE.lightGrey, 0.004); // plate

  const geometry = bb.build();
  const body = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  body.castShadow = true;
  root.add(body);

  // ---- true 3D parts: mirrors, exhausts, lip spoiler ------------------------------------
  const flat = (hex: number) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const add = (geom: THREE.BufferGeometry, mat: THREE.Material, x: number, yGround: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(geom, mat);
    m.position.set(x, yGround - y0, z);
    m.castShadow = true;
    root.add(m);
    return m;
  };
  if (profile.mirrors) {
    const s = S[profile.aPillar] as Section;
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.12, 0.025, 0.04), flat(PALETTE.charcoal), sx * (s.hwBelt + 0.05), s.belt + 0.05, s.z - 0.12);
      add(new THREE.BoxGeometry(0.17, 0.08, 0.1), flat(paintDark), sx * (s.hwBelt + 0.13), s.belt + 0.09, s.z - 0.12);
    }
  }
  for (let i = 0; i < profile.exhausts; i++) {
    const sx = profile.exhausts === 1 ? 0.5 : i === 0 ? -0.42 : 0.42;
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10).rotateX(Math.PI / 2), flat(PALETTE.chrome), sx, tail.floor + 0.04, tail.z - 0.05);
    add(new THREE.CylinderGeometry(0.032, 0.032, 0.15, 8).rotateX(Math.PI / 2), flat(PALETTE.ink), sx, tail.floor + 0.04, tail.z - 0.056);
  }
  if (profile.lipSpoiler) add(new THREE.BoxGeometry(tail.hwRoof * 2 - 0.2, 0.035, 0.14), flat(paintDark), 0, tail.roof + 0.015, tail.z + 0.05);

  // ---- wheels: tyre, sidewall, rim, spokes, cap -------------------------------------------
  const wheels: THREE.Object3D[] = [];
  const r = t.wheelRadius;
  const w = t.wheelWidth;
  const tyreGeom = new THREE.CylinderGeometry(r, r, w, 18).rotateZ(Math.PI / 2);
  const sidewallGeom = new THREE.CylinderGeometry(r * 0.8, r * 0.8, w + 0.012, 18).rotateZ(Math.PI / 2);
  const rimGeom = new THREE.CylinderGeometry(r * 0.64, r * 0.64, w * 0.55, 12).rotateZ(Math.PI / 2);
  const spokeGeom = new THREE.BoxGeometry(w * 0.6, r * 1.16, r * 0.15);
  const capGeom = new THREE.CylinderGeometry(r * 0.15, r * 0.15, w * 0.72, 8).rotateZ(Math.PI / 2);
  const matTyre = flat(PALETTE.tyre);
  const matSidewall = flat(PALETTE.rubber);
  const matRim = flat(PALETTE.graphite);
  const matSpoke = flat(PALETTE.lightGrey);
  const matCap = flat(PALETTE.chrome);
  for (let i = 0; i < 4; i++) {
    // order matches the sim: FR, FL, RR, RL (left = odd, +x)
    const g = new THREE.Group();
    const inner = new THREE.Group();
    const tyre = new THREE.Mesh(tyreGeom, matTyre);
    tyre.castShadow = true;
    inner.add(tyre, new THREE.Mesh(sidewallGeom, matSidewall), new THREE.Mesh(rimGeom, matRim));
    for (let k = 0; k < 5; k++) {
      const spoke = new THREE.Mesh(spokeGeom, matSpoke);
      spoke.rotation.x = (k / 5) * Math.PI;
      inner.add(spoke);
    }
    inner.add(new THREE.Mesh(capGeom, matCap));
    inner.position.x = (i % 2 === 1 ? -1 : 1) * profile.wheelInset;
    g.add(inner);
    wheels.push(g);
  }

  // ---- reactive lights: rewrite decal colours in place -------------------------------------
  const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
  const paintRange = (ranges: Array<[number, number]>, hex: number) => {
    const c = new THREE.Color(hex);
    for (const [start, count] of ranges) for (let k = start; k < start + count; k++) colorAttr.setXYZ(k, c.r, c.g, c.b);
    colorAttr.needsUpdate = true;
  };
  let lastState = -1;
  return {
    root,
    wheels,
    update(tm) {
      const state = (tm.brake > 0.1 && tm.gear > 0 ? 1 : 0) | (tm.gear === -1 ? 2 : 0);
      if (state !== lastState) {
        paintRange(tailLightRanges, state & 1 ? 0xff5c6a : 0xc2222f);
        paintRange(reverseRanges, state & 2 ? 0xfff6dc : 0x8a8a8f);
        lastState = state;
      }
    },
  };
}
