/**
 * Cars built in code from parametric profiles (docs/BRIEF.md §4, docs/STYLE.md).
 *
 * The body is a loft through cross-sections along the car's length: each section
 * has a floor, a belt line and a roof line with their own half widths. Every
 * face of the loft is a triangulated panel, and surface detail lives IN those panels
 * as flush decals (polygons drawn in the panel's own parameter space, offset a
 * few millimetres along its normal). Wheel openings cut the shell; bevelled
 * arch returns reveal the tyres and deep-dish wheels. Trim, mirrors, bumpers
 * and exhausts are merged into the body: five draw calls per complete car.
 *
 * One geometry, vertex colours, flat shading, no textures. Brake and reverse
 * lights react to the sim by rewriting their decal colours in place.
 *
 * Local frame: +Z forward, +Y up, +X left. Profile heights are above the ground
 * with the car at rest; the builder converts to the body origin.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, type VehicleTelemetry, type VehicleTuning } from '../sim';

export interface CarMesh {
  root: THREE.Group;
  wheels: THREE.Object3D[];
  update(tm: VehicleTelemetry): void;
  /** Damage stage 0..4: paint darkens toward graphite, parts collapse (front bumper at 1, rear at 2, mirrors and spoiler at 3), glass darkens at 4. Stage 0 restores everything. */
  setDamage(stage: number): void;
  damageStage: number;
  /** A respray (the garage's PAINT page): the body's three paint tones from a new colour, the damage kept. */
  setPaint(hex: number): void;
  paint: number;
  /**
   * The crumple (M5.5 slice 16): the shell pushed in round a point of the body (metres, the car's own frame)
   * toward its middle, `depth` m at the point falling off to nothing at `radius` m. Kept until stage 0.
   */
  dent(x: number, y: number, z: number, radius: number, depth: number): void;
  /** The body's top and vertical middle in its own frame (the wreck's squash aims from the roof). */
  roofY: number;
  midY: number;
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
  paint: number;
  /** The hubs' style ('heavy', 'compact'); the profile's name otherwise. */
  wheelStyle?: string;
  /** Boxes on the body (a taxi's sign, roof rails, a bed's rails, a truck's box stripe), in the profile's frame. */
  parts?: BodyPart[];
  /** Segment indices whose top is dark (a pickup's open bed). */
  darkTops?: number[];
  /** Segments [from, to) that keep their own colour instead of the paint (a box truck's box), the tail with them when they reach it. */
  fixed?: { from: number; to: number; color: number };
  /** The paint left below and above the side windows, metres (the traffic's shells; 0.06 each when absent): a bus's roof band. */
  windowMargins?: { bottom: number; top: number };
  /** The headlamps dark (M6: the Ghost's car drives with its lights off). */
  lampsOff?: boolean;
}

/** A box fitted to a body: size and centre in metres (heights above the ground), a colour or one of the paint's tones; `mirror` adds the one at -x. */
export interface BodyPart {
  size: readonly [number, number, number];
  at: readonly [number, number, number];
  color: number | 'paint' | 'dark' | 'light';
  mirror?: boolean;
}

/** A long-bonnet coupe: the first car. Heights above ground, length 4.5 m, width ~1.9 m at the belt. */
export const MUSCLE: CarProfile = {
  name: 'muscle',
  sections: [
    { z: 2.25, floor: 0.34, belt: 0.78, roof: 0.83, hwFloor: 0.8, hwBelt: 0.88, hwRoof: 0.8 },
    { z: 1.95, floor: 0.32, belt: 0.88, roof: 0.94, hwFloor: 0.88, hwBelt: 0.98, hwRoof: 0.87 },
    { z: 1.3, floor: 0.32, belt: 0.91, roof: 0.96, hwFloor: 0.88, hwBelt: 1.0, hwRoof: 0.88 },
    { z: 0.65, floor: 0.32, belt: 0.89, roof: 0.94, hwFloor: 0.86, hwBelt: 0.97, hwRoof: 0.87 },
    { z: -0.05, floor: 0.32, belt: 0.91, roof: 1.39, hwFloor: 0.85, hwBelt: 0.96, hwRoof: 0.73 },
    { z: -0.86, floor: 0.32, belt: 0.93, roof: 1.37, hwFloor: 0.87, hwBelt: 0.99, hwRoof: 0.73 },
    { z: -1.55, floor: 0.33, belt: 0.96, roof: 1.0, hwFloor: 0.89, hwBelt: 1.0, hwRoof: 0.87 },
    { z: -1.95, floor: 0.34, belt: 0.9, roof: 0.95, hwFloor: 0.85, hwBelt: 0.95, hwRoof: 0.86 },
    { z: -2.25, floor: 0.38, belt: 0.85, roof: 0.91, hwFloor: 0.8, hwBelt: 0.9, hwRoof: 0.81 },
  ],
  glassSides: [4, 5],
  glassTops: [3, 5],
  aPillar: 3,
  cPillar: 5,
  pillars: [-0.42],
  doorSeams: [0.72, -0.52],
  handleZ: -0.25,
  headlight: { width: 0.42, height: 0.17, y: 0.665, inset: 0.27 },
  taillight: { width: 0.57, height: 0.16, y: 0.71, inset: 0.32 },
  grille: { width: 0.63, height: 0.18, y: 0.65 },
  bumperHeight: 0.1,
  lipSpoiler: true,
  mirrors: true,
  exhausts: 2,
  wheelInset: 0.015,
  paint: PALETTE.carRed,
};

type UV = [number, number];

/**
 * A triangulated surface patch with an outward normal and a mapping from car
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

  /** Base quad of a panel. */
  fill(p: Panel, color: number): void {
    this.tri(p.c0, p.c1, p.c2, color);
    this.tri(p.c0, p.c2, p.c3, color);
  }

  /** Convex polygon in car coordinates on a panel, clipped to the panel, offset along its normal. Returns [start vertex, count]. */
  decal(p: Panel, poly: UV[], color: number, offset = 0.004): [number, number] {
    const start = this.positions.length / 3;
    const coords: UV[] = [[p.a0, p.lo0], [p.a1, p.lo1], [p.a1, p.hi1], [p.a0, p.hi0]];
    const points = [p.c0, p.c1, p.c2, p.c3];
    for (const indices of [[0, 1, 2], [0, 2, 3]]) {
      const [ia, ib, ic] = indices as [number, number, number];
      const a = coords[ia] as UV, b = coords[ib] as UV, c = coords[ic] as UV;
      const dx = b[0] - a[0], dy = b[1] - a[1], ex = c[0] - a[0], ey = c[1] - a[1];
      const det = dx * ey - dy * ex;
      if (Math.abs(det) < 1e-10) continue;
      // Clip in affine triangle coordinates. This keeps authored lines straight
      // across a trapezoid even where its lower boundary follows a wheel arch.
      let uv: UV[] = poly.map(([x, y]) => [((x - a[0]) * ey - (y - a[1]) * ex) / det, (dx * (y - a[1]) - dy * (x - a[0])) / det]);
      for (const inside of [([u]: UV) => u, ([, v]: UV) => v, ([u, v]: UV) => 1 - u - v]) uv = clipHalfPlane(uv, inside);
      let area = 0;
      for (let i = 0; i < uv.length; i++) {
        const cur = uv[i] as UV, next = uv[(i + 1) % uv.length] as UV;
        area += cur[0] * next[1] - next[0] * cur[1];
      }
      if (area < 0) uv.reverse();
      const pts = uv.map(([u, v]) => (points[ia] as THREE.Vector3).clone().multiplyScalar(1 - u - v)
        .addScaledVector(points[ib] as THREE.Vector3, u).addScaledVector(points[ic] as THREE.Vector3, v).addScaledVector(p.normal, offset));
      for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0] as THREE.Vector3, pts[i] as THREE.Vector3, pts[i + 1] as THREE.Vector3, color);
    }
    return [start, this.positions.length / 3 - start];
  }

  /** Detail in normalized panel coordinates; useful for framed, raked windows. */
  patch(p: Panel, poly: UV[], color: number, offset = 0.004): [number, number] {
    const uv = clipUnitSquare(poly);
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
    // The loft quad can be twisted. Split decals along its actual triangle seam
    // so the glazing never cuts through the painted body on one side of the car.
    for (const sign of [-1, 1]) {
      const half = clipHalfPlane(uv, ([u, v]) => sign * (u - v));
      const pts = half.map(([u, v]) => this.at(p, u, v).addScaledVector(p.normal, offset));
      for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0] as THREE.Vector3, pts[i] as THREE.Vector3, pts[i + 1] as THREE.Vector3, color);
    }
    return [start, this.positions.length / 3 - start];
  }

  private at(p: Panel, u: number, v: number): THREE.Vector3 {
    return u >= v
      ? p.c0.clone().multiplyScalar(1 - u).addScaledVector(p.c1, u - v).addScaledVector(p.c2, v)
      : p.c0.clone().multiplyScalar(1 - v).addScaledVector(p.c2, u).addScaledVector(p.c3, v - u);
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
    return g;
  }
}

/** Sutherland–Hodgman clip of a convex polygon to [0,1]². */
function clipUnitSquare(poly: UV[]): UV[] {
  let out = poly;
  const edges: Array<(p: UV) => number> = [([u]) => u, ([u]) => 1 - u, ([, v]) => v, ([, v]) => 1 - v];
  for (const inside of edges) {
    out = clipHalfPlane(out, inside);
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

/** Shared non-indexed vertex colour geometry; all rigid fittings share the body draw. */
function coloured(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const result = g.index ? g.toNonIndexed() : g;
  if (result !== g) g.dispose();
  const c = new THREE.Color(hex);
  const colors = new Float32Array(result.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  result.deleteAttribute('uv');
  return result;
}

function clipHalfPlane(input: UV[], inside: (p: UV) => number): UV[] {
  const out: UV[] = [];
  for (let i = 0; i < input.length; i++) {
    const cur = input[i] as UV, prev = input[(i + input.length - 1) % input.length] as UV;
    const dc = inside(cur), dp = inside(prev);
    if ((dc >= 0) !== (dp >= 0)) out.push(lerpUV(prev, cur, dp / (dp - dc)));
    if (dc >= 0) out.push(cur);
  }
  return out;
}

function wheelGeometry(t: VehicleTuning, style: string): THREE.BufferGeometry {
  const r = t.wheelRadius, w = t.wheelWidth;
  const parts: THREE.BufferGeometry[] = [];
  // Revolved shoulder and sidewall with an open centre: the rim is not buried in a capped cylinder.
  const profile = [[0.62, -0.5], [0.83, -0.5], [0.96, -0.37], [1, -0.24], [1, 0.24], [0.96, 0.37], [0.83, 0.5], [0.62, 0.5]];
  parts.push(coloured(new THREE.LatheGeometry(profile.map(([radius, x]) => new THREE.Vector2((radius ?? 0) * r, (x ?? 0) * w)), 20).rotateZ(Math.PI / 2), PALETTE.tyre));
  const cylinder = (radius: number, depth: number, x: number, color: number, segments = 20) => {
    parts.push(coloured(new THREE.CylinderGeometry(radius, radius, depth, segments).rotateZ(Math.PI / 2).translate(x, 0, 0), color));
  };
  for (const side of [-1, 1]) {
    const face = side * (w * 0.5 + 0.004);
    cylinder(r * 0.65, 0.022, face - side * 0.025, PALETTE.steel);
    cylinder(r * 0.56, 0.026, face - side * 0.01, PALETTE.ink);
    parts.push(coloured(new THREE.TorusGeometry(r * 0.61, r * 0.045, 4, 20).rotateY(Math.PI / 2).translate(face, 0, 0), PALETTE.lightGrey));
    const count = style === 'heavy' ? 6 : style === 'compact' ? 4 : 5;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      parts.push(coloured(new THREE.BoxGeometry(0.035, r * 0.48, r * (style === 'compact' ? 0.23 : 0.14))
        .translate(0, r * 0.32, 0).rotateX(angle).translate(face + side * 0.005, 0, 0), style === 'heavy' ? PALETTE.silver : PALETTE.lightGrey));
    }
    cylinder(r * (style === 'heavy' ? 0.28 : 0.2), 0.04, face + side * 0.015, PALETTE.graphite, 10);
    cylinder(r * 0.10, 0.047, face + side * 0.023, PALETTE.chrome, 8);
  }
  const result = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return result;
}

export function buildCarMesh(t: VehicleTuning, profile: CarProfile = MUSCLE, color: number = profile.paint): CarMesh {
  const root = new THREE.Group();
  root.name = `car-${profile.name}`;
  const staticCompression = (t.mass * (9.81 + t.extraGravity)) / 4 / t.suspensionStiffness;
  const y0 = t.wheelRadius + t.suspensionRestLength - staticCompression - t.suspensionAttachY;
  const S = profile.sections;
  const nose = S[0] as Section, tail = S[S.length - 1] as Section;
  const paint = color, paintDark = shade(color, 0.72), paintLight = shade(color, 1.13);
  const muscle = profile.name === 'muscle', compact = profile.name === 'compact', van = profile.name === 'heavy';
  const glass = 0x294653, glassLight = 0x6394a2;
  const bb = new BodyBuilder();
  const tailLightRanges: Array<[number, number]> = [], reverseRanges: Array<[number, number]> = [];
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y - y0, z);
  const extras: THREE.BufferGeometry[] = [];
  const part = (g: THREE.BufferGeometry, c: number, x: number, y: number, z: number) => extras.push(coloured(g.translate(x, y - y0, z), c));
  const box = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => part(new THREE.BoxGeometry(w, h, d), c, x, y, z);
  const panel = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ref: THREE.Vector3) => makePanel(a, b, c, d, ref, { a0: 0, a1: 1, lo0: 0, lo1: 0, hi0: 1, hi1: 1 });
  const longitudinalPatch = (p: Panel, poly: UV[], c: number, offset = 0.004) =>
    bb.patch(p, poly.map(([u, v]) => [p.a0 < p.a1 ? 1 - u : u, v]), c, offset);
  const windowPanel = (p: Panel, margin = 0.07) => {
    bb.fill(p, paint);
    bb.patch(p, rect(margin * 0.6, 1 - margin * 0.6, 0.045, 0.955), PALETTE.charcoal, 0.004);
    bb.patch(p, rect(margin, 1 - margin, 0.10, 0.90), glass, 0.006);
    // Broad restrained reflection, framed by painted pillars; no transparent sorting or texture.
    bb.patch(p, [[margin, 0.65], [1 - margin, 0.48], [1 - margin, 0.87], [margin, 0.87]], glassLight, 0.008);
  };
  const interpolate = (a: Section, b: Section, z: number): Section => {
    const f = (z - a.z) / (b.z - a.z), s = { ...a, z };
    for (const k of ['floor', 'belt', 'roof', 'hwFloor', 'hwBelt', 'hwRoof'] as const) s[k] = a[k] + (b[k] - a[k]) * f;
    return s;
  };
  const sectionAt = (z: number) => {
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i] as Section, b = S[i + 1] as Section;
      if (z <= a.z && z >= b.z) return interpolate(a, b, z);
    }
    return z > nose.z ? nose : tail;
  };
  const sideWidth = (s: Section, y: number) => s.hwFloor + (s.hwBelt - s.hwFloor) * Math.min(1, (y - s.floor) / (s.belt - s.floor));
  // a fixed segment (a truck's box) keeps its own colour in the three tones the paint would take
  const fixed = profile.fixed;
  const fixedTones = fixed ? [fixed.color, shade(fixed.color, 0.72), shade(fixed.color, 1.13)] as const : null;
  const toneSet = (i: number): readonly [number, number, number] => fixed && fixedTones && i >= fixed.from && i < fixed.to ? fixedTones : [paint, paintDark, paintLight];
  const arcRadius = t.wheelRadius + (van ? 0.105 : 0.085);
  // The same polygon drives both the cutout and the bevel, preventing cracks between them.
  const arcs = [t.wheelBase / 2, -t.wheelBase / 2].map(z => Array.from({ length: 13 }, (_, i) => {
    const angle = (i / 12) * Math.PI;
    return { z: z + Math.cos(angle) * arcRadius, y: t.wheelRadius + Math.sin(angle) * arcRadius };
  }));
  const bottom = (s: Section) => {
    let y = s.floor;
    for (const arc of arcs) for (let i = 0; i < arc.length - 1; i++) {
      const a = arc[i] as { z: number; y: number }, b = arc[i + 1] as { z: number; y: number };
      if (s.z <= a.z + 1e-6 && s.z >= b.z - 1e-6) y = Math.max(y, a.y + (b.y - a.y) * (s.z - a.z) / (b.z - a.z));
    }
    return y;
  };

  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i] as Section, b = S[i + 1] as Section;
    const [tone, toneDark, toneLight] = toneSet(i);
    const ref = P(0, (a.floor + a.roof + b.floor + b.roof) / 4, (a.z + b.z) / 2);
    const aMap = { a0: a.z, a1: b.z };
    // Narrow undertray leaves the wheel wells open from below as well as the sides.
    bb.fill(panel(P(0.53, a.floor, a.z), P(0.53, b.floor, b.z), P(-0.53, b.floor, b.z), P(-0.53, a.floor, a.z), P(0, a.floor + 0.1, a.z)), PALETTE.charcoal);
    for (const side of [-1, 1]) {
      const cuts = [a.z, b.z, ...arcs.flat().map(p => p.z).filter(z => z < a.z - 1e-6 && z > b.z + 1e-6)].sort((x, y) => y - x);
      for (let j = 0; j < cuts.length - 1; j++) {
        const sa = interpolate(a, b, cuts[j] as number), sb = interpolate(a, b, cuts[j + 1] as number);
        const ya = bottom(sa), yb = bottom(sb);
        const lower = makePanel(P(side * sideWidth(sa, ya), ya, sa.z), P(side * sideWidth(sb, yb), yb, sb.z), P(side * sb.hwBelt, sb.belt, sb.z), P(side * sa.hwBelt, sa.belt, sa.z), ref,
          { a0: sa.z, a1: sb.z, lo0: ya, lo1: yb, hi0: sa.belt, hi1: sb.belt });
        bb.fill(lower, tone);
        bb.decal(lower, rect(sa.z, sb.z, 0, Math.max(sa.floor, sb.floor) + (van ? 0.19 : 0.09)), van ? PALETTE.charcoal : toneDark);
        bb.decal(lower, rect(sa.z, sb.z, a.belt - 0.10, a.belt - 0.075), toneLight);
        for (const dz of profile.doorSeams) bb.decal(lower, rect(dz + 0.009, dz - 0.009, 0.43, 2), toneDark);
        bb.decal(lower, rect(profile.handleZ + 0.10, profile.handleZ - 0.10, a.belt - 0.13, a.belt - 0.09), PALETTE.charcoal);
        if (van) bb.decal(lower, rect(sa.z, sb.z, 0.85, 0.94), PALETTE.charcoal);
        if (muscle && i < 3) bb.decal(lower, rect(0.88, 0.70, 0.7, 0.74), PALETTE.chrome);
      }
      const upper = makePanel(P(side * a.hwBelt, a.belt, a.z), P(side * b.hwBelt, b.belt, b.z), P(side * b.hwRoof, b.roof, b.z), P(side * a.hwRoof, a.roof, a.z), ref,
        { ...aMap, lo0: a.belt, lo1: b.belt, hi0: a.roof, hi1: b.roof });
      if (i === profile.aPillar || (i >= profile.glassSides[0] && i < profile.glassSides[1])) {
        windowPanel(upper, i === profile.aPillar ? 0.14 : 0.06);
        for (const z of profile.pillars) bb.decal(upper, rect(z - 0.035, z + 0.035, 0, 3), PALETTE.charcoal, 0.012);
      } else if (i === profile.cPillar) {
        bb.fill(upper, tone);
        longitudinalPatch(upper, [[0.13, 0.16], [0.72, 0.16], [0.6, 0.72], [0.13, 0.84]], PALETTE.charcoal);
        longitudinalPatch(upper, [[0.18, 0.24], [0.63, 0.24], [0.54, 0.65], [0.18, 0.73]], glassLight, 0.006);
      } else {
        bb.fill(upper, tone);
        if (van && i === 4) {
          // Cargo panel surround, sliding-door split and rail: no passenger quarter glass.
          bb.patch(upper, rect(0.07, 0.94, 0.10, 0.88), paintDark);
          bb.patch(upper, rect(0.085, 0.925, 0.12, 0.85), paintLight, 0.006);
          bb.decal(upper, rect(-0.8, -0.816, 0.9, 2.2), paintDark, 0.009);
          bb.decal(upper, rect(-0.15, -2.24, 1.19, 1.23), PALETTE.steel, 0.009);
          bb.decal(upper, rect(-0.60, -0.75, 1.31, 1.37), PALETTE.charcoal, 0.01);
        }
      }
    }
    const top = makePanel(P(a.hwRoof, a.roof, a.z), P(b.hwRoof, b.roof, b.z), P(-b.hwRoof, b.roof, b.z), P(-a.hwRoof, a.roof, a.z), ref,
      { ...aMap, lo0: a.hwRoof, lo1: b.hwRoof, hi0: -a.hwRoof, hi1: -b.hwRoof });
    if (profile.glassTops.includes(i)) {
      windowPanel(top, 0.08);
      if (i === profile.aPillar) for (const side of [-1, 1]) bb.patch(top, rect(0.12, 0.135, side === 1 ? 0.16 : 0.57, side === 1 ? 0.43 : 0.84), PALETTE.charcoal, 0.014);
    } else {
      bb.fill(top, (compact && i === 3) || profile.darkTops?.includes(i) ? PALETTE.charcoal : tone);
      if (muscle) for (const side of [-1, 1]) bb.decal(top, rect(a.z, b.z, side * 0.12, side * 0.30), PALETTE.charcoal);
      if (van && i >= 3) for (const x of [-0.63, -0.31, 0.31, 0.63]) bb.decal(top, rect(a.z, b.z, x - 0.018, x + 0.018), paintLight);
    }
  }
  // Flared arch lips and the dark inward return are real geometry, not painted circles.
  for (const side of [-1, 1]) for (const arc of arcs) for (let k = 0; k < arc.length - 1; k++) {
    const a = arc[k] as { z: number; y: number }, b = arc[k + 1] as { z: number; y: number }, sa = sectionAt(a.z), sb = sectionAt(b.z);
    const ya = Math.max(sa.floor, a.y), yb = Math.max(sb.floor, b.y);
    const wa = sideWidth(sa, ya), wb = sideWidth(sb, yb);
    const ref = P(0, t.wheelRadius, (a.z + b.z) / 2);
    bb.fill(panel(P(side * (wa + 0.025), ya, a.z), P(side * (wb + 0.025), yb, b.z), P(side * (wb + 0.012), yb + 0.045, b.z), P(side * (wa + 0.012), ya + 0.045, a.z), ref), compact || van ? PALETTE.charcoal : paintLight);
    bb.fill(panel(P(side * (wa + 0.025), ya, a.z), P(side * (wb + 0.025), yb, b.z), P(side * (wb - 0.12), yb, b.z), P(side * (wa - 0.12), ya, a.z), P(0, ya + 0.2, (a.z + b.z) / 2)), PALETTE.charcoal);
  }

  const capPanels = (s: Section, front: boolean) => {
    const ref = P(0, (s.floor + s.roof) / 2, 0);
    const lo = makePanel(P(-s.hwFloor, s.floor, s.z), P(-s.hwBelt, s.belt, s.z), P(s.hwBelt, s.belt, s.z), P(s.hwFloor, s.floor, s.z), ref,
      { a0: s.floor, a1: s.belt, lo0: -s.hwFloor, lo1: -s.hwBelt, hi0: s.hwFloor, hi1: s.hwBelt });
    const hi = makePanel(P(-s.hwBelt, s.belt, s.z), P(-s.hwRoof, s.roof, s.z), P(s.hwRoof, s.roof, s.z), P(s.hwBelt, s.belt, s.z), ref,
      { a0: s.belt, a1: s.roof, lo0: -s.hwBelt, lo1: -s.hwRoof, hi0: s.hwBelt, hi1: s.hwRoof });
    const [tone, toneDark] = toneSet(front ? 0 : S.length - 2);
    bb.fill(lo, front ? tone : toneDark); bb.fill(hi, tone);
    bb.decal(lo, rectYX(s.floor, s.floor + profile.bumperHeight, -2, 2), PALETTE.charcoal);
    return [lo, hi] as const;
  };
  const [noseLower] = capPanels(nose, true), tailPanels = capPanels(tail, false);
  const [tailLower, tailUpper] = tailPanels;
  const h = profile.headlight;
  const circle = (y: number, x: number, radius: number): UV[] => Array.from({ length: 12 }, (_, k) => [y + Math.sin(k / 12 * Math.PI * 2) * radius, x + Math.cos(k / 12 * Math.PI * 2) * radius]);
  for (const side of [-1, 1]) {
    const cx = side * (nose.hwBelt - h.inset);
    bb.decal(noseLower, rectYX(h.y - h.height / 2 - 0.035, h.y + h.height / 2 + 0.035, cx - h.width / 2 - 0.025, cx + h.width / 2 + 0.025), PALETTE.charcoal);
    if (muscle) for (const dx of [-0.108, 0.108]) {
      bb.decal(noseLower, circle(h.y, cx + dx, 0.083), PALETTE.chrome, 0.006);
      bb.decal(noseLower, circle(h.y, cx + dx, 0.061), 0xffebbb, 0.009);
    } else {
      bb.decal(noseLower, rectYX(h.y - h.height / 2, h.y + h.height / 2, cx - h.width / 2, cx + h.width / 2), profile.lampsOff ? PALETTE.graphite : 0xffefca, 0.006);
      if (!profile.lampsOff) bb.decal(noseLower, rectYX(h.y - 0.05, h.y + 0.05, cx + side * h.width * 0.2, cx + side * h.width * 0.45), PALETTE.carOrange, 0.008);
    }
  }
  if (profile.grille) {
    const g = profile.grille;
    bb.decal(noseLower, rectYX(g.y - g.height / 2, g.y + g.height / 2, -g.width / 2, g.width / 2), PALETTE.ink);
    for (let k = 1; k <= 3; k++) {
      const y = g.y - g.height / 2 + g.height * k / 4;
      bb.decal(noseLower, rectYX(y - 0.007, y + 0.007, -g.width / 2 + 0.025, g.width / 2 - 0.025), PALETTE.steel, 0.007);
    }
    bb.decal(noseLower, [[g.y - 0.032, 0], [g.y, 0.045], [g.y + 0.032, 0], [g.y, -0.045]], PALETTE.chrome, 0.009);
  }
  const tl = profile.taillight;
  if (muscle) bb.decal(tailLower, rectYX(tl.y - 0.13, tl.y + 0.12, -0.82, 0.82), PALETTE.charcoal);
  for (const p of tailPanels) for (const side of [-1, 1]) {
    const cx = side * (tail.hwBelt - tl.inset), inner = cx - side * tl.width * 0.2;
    bb.decal(p, rectYX(tl.y - tl.height / 2 - 0.025, tl.y + tl.height / 2 + 0.025, cx - tl.width / 2 - 0.02, cx + tl.width / 2 + 0.02), PALETTE.ink, 0.006);
    tailLightRanges.push(bb.decal(p, rectYX(tl.y - tl.height / 2, tl.y + tl.height / 2, inner + side * 0.03, cx + side * tl.width / 2), 0xba2338, 0.009));
    reverseRanges.push(bb.decal(p, rectYX(tl.y - tl.height / 2, tl.y + tl.height / 2, cx - side * tl.width / 2, inner - side * 0.01), 0x95a4a5, 0.009));
    if (muscle) for (let k = 1; k <= 2; k++) {
      const x = inner + side * 0.03 + side * k * 0.11;
      bb.decal(p, rectYX(tl.y - tl.height / 2, tl.y + tl.height / 2, x, x + 0.015), PALETTE.charcoal, 0.012);
    }
  }
  const plateY = tail.floor + profile.bumperHeight + 0.085;
  bb.decal(tailLower, rectYX(plateY - 0.075, plateY + 0.075, -0.24, 0.24), PALETTE.charcoal, 0.005);
  bb.decal(tailLower, rectYX(plateY - 0.056, plateY + 0.056, -0.215, 0.215), 0xeee2bd, 0.008);
  for (let k = 0; k < 5; k++) bb.decal(tailLower, rectYX(plateY - 0.027, plateY + 0.027, -0.15 + k * 0.062, -0.12 + k * 0.062), PALETTE.charcoal, 0.01);
  if (van) {
    for (const side of [-1, 1]) {
      bb.decal(tailUpper, rectYX(1.21, 1.98, side * 0.10, side * 0.77), paintDark);
      bb.decal(tailUpper, rectYX(1.25, 1.94, side * 0.14, side * 0.73), paintLight, 0.007);
      box(0.12, 0.055, 0.03, PALETTE.charcoal, side * 0.15, 1.37, tail.z - 0.016);
      for (const y of [0.95, 1.77]) box(0.11, 0.05, 0.05, PALETTE.steel, side * 0.65, y, tail.z - 0.014);
    }
    for (const p of tailPanels) bb.decal(p, rectYX(0.69, 2.13, -0.012, 0.012), PALETTE.charcoal, 0.012);
  }
  // Fittings have real thickness, but are baked into the body vertex buffer.
  // Detachable ones record their vertex range so damage can collapse them in place.
  const detachable: Array<{ from: number; to: number; stage: number }> = [];
  const vertexCursor = () => bb.positions.length / 3 + extras.reduce((n, g) => n + g.getAttribute('position').count, 0);
  for (const s of [nose, tail]) {
    const from = vertexCursor();
    box(s.hwFloor * 1.98, van ? 0.14 : 0.075, 0.11, muscle ? PALETTE.silver : PALETTE.charcoal, 0, s.floor + 0.06, s.z);
    if (muscle) box(s.hwFloor * 1.96, 0.045, 0.13, PALETTE.charcoal, 0, s.floor - 0.015, s.z);
    detachable.push({ from, to: vertexCursor(), stage: s === nose ? 1 : 2 });
  }
  if (profile.mirrors) {
    const s = S[profile.aPillar] as Section;
    const from = vertexCursor();
    for (const side of [-1, 1]) {
      box(0.16, 0.035, 0.055, PALETTE.charcoal, side * (s.hwBelt + 0.035), s.belt + 0.085, s.z - 0.14);
      box(van ? 0.17 : 0.18, van ? 0.21 : 0.10, 0.13, compact || van ? PALETTE.charcoal : paintDark, side * (s.hwBelt + 0.13), s.belt + 0.12, s.z - 0.14);
      box(0.13, van ? 0.15 : 0.068, 0.007, glassLight, side * (s.hwBelt + 0.13), s.belt + 0.12, s.z - 0.208);
    }
    detachable.push({ from, to: vertexCursor(), stage: 3 });
  }
  for (let i = 0; i < profile.exhausts; i++) {
    const x = profile.exhausts === 1 ? 0.58 : i === 0 ? -0.62 : 0.62;
    part(new THREE.CylinderGeometry(0.057, 0.057, 0.16, 10).rotateX(Math.PI / 2), PALETTE.chrome, x, tail.floor - 0.025, tail.z - 0.035);
    part(new THREE.CircleGeometry(0.039, 10).rotateY(Math.PI), PALETTE.ink, x, tail.floor - 0.025, tail.z - 0.117);
  }
  if (profile.lipSpoiler) {
    const from = vertexCursor();
    for (const x of [-0.58, 0.58]) box(0.085, 0.07, 0.1, paintDark, x, tail.roof + 0.03, tail.z + 0.17);
    box(tail.hwRoof * 2 + 0.04, 0.065, 0.22, paintDark, 0, tail.roof + 0.08, tail.z + 0.13);
    detachable.push({ from, to: vertexCursor(), stage: 3 });
  }
  if (compact) {
    const s = S[4] as Section;
    box(1.40, 0.065, 0.22, PALETTE.charcoal, 0, s.roof + 0.015, s.z - 0.06);
    const lightStart = bb.positions.length / 3 + extras.reduce((n, g) => n + g.getAttribute('position').count, 0);
    box(0.36, 0.035, 0.012, 0xba2338, 0, s.roof + 0.015, s.z - 0.175);
    tailLightRanges.push([lightStart, 36]);
  }
  for (const p of profile.parts ?? []) {
    const c = p.color === 'paint' ? paint : p.color === 'dark' ? paintDark : p.color === 'light' ? paintLight : p.color;
    for (const side of p.mirror ? [1, -1] : [1]) box(p.size[0], p.size[1], p.size[2], c, side * p.at[0], p.at[1], p.at[2]);
  }
  const bodyGeometry = bb.build();
  const geometry = mergeGeometries([bodyGeometry, ...extras], false);
  bodyGeometry.dispose(); for (const g of extras) g.dispose();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const body = new THREE.Mesh(geometry, material); body.name = 'body-and-trim'; body.castShadow = true;
  root.add(body);
  const wheels: THREE.Object3D[] = [], wheelGeom = wheelGeometry(t, profile.wheelStyle ?? profile.name);
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(); g.name = `wheel-${i}`;
    const mesh = new THREE.Mesh(wheelGeom, material); mesh.castShadow = true;
    mesh.position.x = (i % 2 === 1 ? -1 : 1) * profile.wheelInset;
    g.add(mesh); wheels.push(g);
  }
  const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
  const lightColor = new THREE.Color();
  const paintRange = (ranges: Array<[number, number]>, hex: number) => {
    lightColor.setHex(hex);
    for (const [start, count] of ranges) for (let k = start; k < start + count; k++) colorAttr.setXYZ(k, lightColor.r, lightColor.g, lightColor.b);
    colorAttr.needsUpdate = true;
  };
  let lastState = -1;
  // Damage: paint vertices (the three paint tones) darken toward graphite, glass darkens at stage 4,
  // detachable parts collapse onto their centroid. Originals are kept for the restore at stage 0.
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const originalPos = new Float32Array(posAttr.array as Float32Array);
  // the shell with its dents: what the stages collapse and restore to
  const basePos = new Float32Array(originalPos);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox as THREE.Box3;
  const midY = (bounds.min.y + bounds.max.y) / 2;
  /** Every vertex at its dented place, the detached parts collapsed onto their centroids. */
  const writePositions = (stage: number) => {
    (posAttr.array as Float32Array).set(basePos);
    for (const part of detachable) {
      if (stage < part.stage) continue;
      let cx = 0, cy = 0, cz = 0;
      const n = part.to - part.from;
      for (let k = part.from; k < part.to; k++) { cx += basePos[k * 3] as number; cy += basePos[k * 3 + 1] as number; cz += basePos[k * 3 + 2] as number; }
      cx /= n; cy /= n; cz /= n;
      for (let k = part.from; k < part.to; k++) posAttr.setXYZ(k, cx, cy, cz);
    }
    posAttr.needsUpdate = true;
  };
  const originalCol = new Float32Array(colorAttr.array as Float32Array);
  const isTone = (k: number, hex: number) => {
    const c = lightColor.setHex(hex);
    return Math.abs((originalCol[k * 3] as number) - c.r) < 0.004 && Math.abs((originalCol[k * 3 + 1] as number) - c.g) < 0.004 && Math.abs((originalCol[k * 3 + 2] as number) - c.b) < 0.004;
  };
  const paintIdx: number[] = [], paintTone: number[] = [], glassIdx: number[] = [];
  for (let k = 0; k < colorAttr.count; k++) {
    if (isTone(k, paint)) { paintIdx.push(k); paintTone.push(0); }
    else if (isTone(k, paintDark)) { paintIdx.push(k); paintTone.push(1); }
    else if (isTone(k, paintLight)) { paintIdx.push(k); paintTone.push(2); }
    else if (isTone(k, glass) || isTone(k, glassLight)) glassIdx.push(k);
  }
  const graphite = new THREE.Color(PALETTE.graphite), soot = new THREE.Color(PALETTE.ink);
  const tint = (idx: number[], toward: THREE.Color, amount: number) => {
    for (const k of idx) {
      colorAttr.setXYZ(k,
        (originalCol[k * 3] as number) + (toward.r - (originalCol[k * 3] as number)) * amount,
        (originalCol[k * 3 + 1] as number) + (toward.g - (originalCol[k * 3 + 1] as number)) * amount,
        (originalCol[k * 3 + 2] as number) + (toward.b - (originalCol[k * 3 + 2] as number)) * amount);
    }
  };
  const applyStage = (stage: number) => {
    tint(paintIdx, graphite, Math.min(0.85, 0.25 * stage));
    tint(glassIdx, soot, stage >= 4 ? 0.6 : 0);
    writePositions(stage);
    colorAttr.needsUpdate = true;
    lastState = -1; // the lights repaint over the restored colours on the next update
  };
  const tones = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  const mesh: CarMesh = { root, wheels, damageStage: 0, paint: color, roofY: bounds.max.y, midY, update(tm) {
    const state = (tm.brake > 0.1 && tm.gear > 0 ? 1 : 0) | (tm.gear === -1 ? 2 : 0);
    if (state !== lastState) {
      paintRange(tailLightRanges, state & 1 ? 0xff6972 : 0xba2338);
      paintRange(reverseRanges, state & 2 ? 0xfff6dc : 0x95a4a5);
      lastState = state;
    }
  }, setDamage(stage) {
    stage = Math.max(0, Math.min(4, Math.round(stage)));
    if (stage === mesh.damageStage) return;
    mesh.damageStage = stage;
    // a fresh car: the dents go with the damage
    if (stage === 0) basePos.set(originalPos);
    applyStage(stage);
  }, dent(x, y, z, radius, depth) {
    // inward: from the point toward the body's middle, flattened a little so a side hit stays a side hit
    let dx = -x, dy = (midY - y) * 0.6, dz = -z;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    const r2 = radius * radius;
    for (let k = 0; k < posAttr.count; k++) {
      const ox = (basePos[k * 3] as number) - x, oy = (basePos[k * 3 + 1] as number) - y, oz = (basePos[k * 3 + 2] as number) - z;
      const d2 = ox * ox + oy * oy + oz * oz;
      if (d2 >= r2) continue;
      const f = 1 - Math.sqrt(d2) / radius, push = depth * f * f;
      basePos[k * 3] = (basePos[k * 3] as number) + dx * push;
      basePos[k * 3 + 1] = (basePos[k * 3 + 1] as number) + dy * push;
      basePos[k * 3 + 2] = (basePos[k * 3 + 2] as number) + dz * push;
    }
    writePositions(mesh.damageStage);
  }, setPaint(hex) {
    if (hex === mesh.paint) return;
    mesh.paint = hex;
    (tones[0] as THREE.Color).setHex(hex);
    (tones[1] as THREE.Color).setHex(shade(hex, 0.72));
    (tones[2] as THREE.Color).setHex(shade(hex, 1.13));
    for (let i = 0; i < paintIdx.length; i++) {
      const k = paintIdx[i] as number, c = tones[paintTone[i] as number] as THREE.Color;
      originalCol[k * 3] = c.r; originalCol[k * 3 + 1] = c.g; originalCol[k * 3 + 2] = c.b;
    }
    applyStage(mesh.damageStage);
  } };
  return mesh;
}

/**
 * The streak's day-7 topper (docs/M5_PLAN.md slice 6): a `carOrange` cone on
 * the roof, 20 sides (40 triangles), flat-shaded. The renderer puts it on
 * whichever car the player drives, so it survives a swap.
 */
export function buildTopper(): THREE.Mesh {
  const geometry = new THREE.ConeGeometry(0.26, 0.55, 20, 1, false).translate(0, 0.275, 0);
  const material = new THREE.MeshLambertMaterial({ color: PALETTE.carOrange, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'topper';
  mesh.castShadow = true;
  mesh.visible = false;
  return mesh;
}
