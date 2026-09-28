/**
 * The kit's trees drawn as models (docs/M8.9_PLAN.md slice 22), where the sim marks a tree's crown static with the model
 * it stands for (`StaticDesc.model`): a broadleaf's crown of a few jittered low-poly lumps in two greens over a tapering
 * trunk whose two limbs reach into it; a palm's curved, ringed trunk under arched fronds hanging from their midribs
 * (both sides drawn: they are seen from under them) and a cluster of coconuts. A few variants of each, the variant and
 * the turn chosen by the tree's place. Each is built once, in metres from the trunk's foot, as the flat arrays the city's
 * builder copies (positions, normals and, unlike the unit shapes, a linear colour a vertex).
 */
import * as THREE from 'three';
import { TREE_COLORS, type TreeModel } from '../sim';

/** Variants of each model. */
export const TREE_VARIANTS = 4;

/** A model's triangles: three corners each, a normal and a linear colour a corner. */
export interface TreeRaw { p: Float32Array; n: Float32Array; c: Float32Array }

/** A number in 0..1 from a place (the same for the same place). */
function hash(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** The variant a tree at (x, z) takes. */
export function treeVariant(x: number, z: number): number {
  return Math.min(TREE_VARIANTS - 1, Math.floor(hash(x, z) * TREE_VARIANTS));
}

/** The turn (rad) a tree at (x, z) takes about its trunk. */
export function treeYaw(x: number, z: number): number {
  const h = hash(x, z) * 7.31;
  return (h - Math.floor(h)) * Math.PI * 2;
}

/** A seeded stream of numbers in 0..1 (a variant's own shape). */
function stream(seed: number): () => number {
  let s = seed * 7919 + 17;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nrm = new THREE.Vector3();

/** Triangles being gathered, each with its face's normal and one colour. */
class Faces {
  private readonly p: number[] = [];
  private readonly n: number[] = [];
  private readonly c: number[] = [];

  /** A triangle, turned to face away from `inside` when given. */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, colour: THREE.Color, inside?: THREE.Vector3): void {
    nrm.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    if (nrm.lengthSq() < 1e-12) return;
    nrm.normalize();
    if (inside) {
      const cx = (a.x + b.x + c.x) / 3 - inside.x, cy = (a.y + b.y + c.y) / 3 - inside.y, cz = (a.z + b.z + c.z) / 3 - inside.z;
      if (nrm.x * cx + nrm.y * cy + nrm.z * cz < 0) {
        this.tri(a, c, b, colour);
        return;
      }
    }
    for (const v of [a, b, c]) {
      this.p.push(v.x, v.y, v.z);
      this.n.push(nrm.x, nrm.y, nrm.z);
      this.c.push(colour.r, colour.g, colour.b);
    }
  }

  /** A triangle drawn on both its sides. */
  both(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, colour: THREE.Color): void {
    this.tri(a, b, c, colour);
    this.tri(a, c, b, colour);
  }

  /** A tube's side between rings `a` and `b` (as many points each, round `axis`), open at its ends. */
  tube(a: THREE.Vector3[], b: THREE.Vector3[], colour: THREE.Color, axis: THREE.Vector3): void {
    for (let k = 0; k < a.length; k++) {
      const k1 = (k + 1) % a.length;
      this.tri(a[k] as THREE.Vector3, a[k1] as THREE.Vector3, b[k1] as THREE.Vector3, colour, axis);
      this.tri(a[k] as THREE.Vector3, b[k1] as THREE.Vector3, b[k] as THREE.Vector3, colour, axis);
    }
  }

  done(): TreeRaw {
    return { p: Float32Array.from(this.p), n: Float32Array.from(this.n), c: Float32Array.from(this.c) };
  }
}

/** A ring of `sides` points round `at` in the horizontal plane, `radius` out, turned by `turn`. */
function ring(at: THREE.Vector3, radius: number, sides: number, turn = 0): THREE.Vector3[] {
  return Array.from({ length: sides }, (_, k) => {
    const a = turn + (k / sides) * Math.PI * 2;
    return new THREE.Vector3(at.x + Math.cos(a) * radius, at.y, at.z + Math.sin(a) * radius);
  });
}

/** The icosahedron's faces (three corners each), a unit's. */
const ICOSA = (() => {
  const g = new THREE.IcosahedronGeometry(1, 0).toNonIndexed(), p = g.getAttribute('position');
  return Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
})();

/**
 * A lump of leaves: an icosahedron `radius` round (flattened a little), each corner pushed in or out by its own
 * number (the same for the faces that share it, so it stays closed), each face a shade of `colour` by its own.
 */
function lump(out: Faces, at: THREE.Vector3, radius: number, colour: number, seed: number): void {
  const base = new THREE.Color(colour), shade = new THREE.Color();
  const corner = (v: THREE.Vector3): THREE.Vector3 => {
    const j = 1 + 0.32 * (hash(Math.round(v.x * 1000) + seed * 3.1, Math.round(v.y * 1000) * 1.7 + Math.round(v.z * 1000)) - 0.5);
    return new THREE.Vector3(at.x + v.x * radius * j, at.y + v.y * radius * j * 0.82, at.z + v.z * radius * j);
  };
  for (let f = 0; f < ICOSA.length; f += 3) {
    const a = corner(ICOSA[f] as THREE.Vector3), b = corner(ICOSA[f + 1] as THREE.Vector3), c = corner(ICOSA[f + 2] as THREE.Vector3);
    shade.copy(base).multiplyScalar(0.9 + 0.2 * hash(f * 1.37 + seed, seed * 0.71));
    out.tri(a, b, c, shade, at);
  }
}

/** A limb: a thin three-sided tube from `a` to `b`. */
function limb(out: Faces, a: THREE.Vector3, b: THREE.Vector3, radius: number, colour: THREE.Color): void {
  const d = new THREE.Vector3().subVectors(b, a).normalize();
  const u = new THREE.Vector3(0, 1, 0).cross(d).normalize(), w = new THREE.Vector3().crossVectors(d, u);
  const at = (p: THREE.Vector3, r: number): THREE.Vector3[] => [0, 1, 2].map((k) => {
    const t = (k / 3) * Math.PI * 2;
    return p.clone().addScaledVector(u, Math.cos(t) * r).addScaledVector(w, Math.sin(t) * r);
  });
  const mid = a.clone().add(b).multiplyScalar(0.5);
  out.tube(at(a, radius), at(b, radius * 0.6), colour, mid);
}

/** A broadleaf: a trunk tapering to its crown, two limbs into it, three or four lumps of leaves. */
function broadleaf(variant: number): TreeRaw {
  const r = stream(variant + 1), out = new Faces(), bark = new THREE.Color(TREE_COLORS.bark);
  const top = 2.9 + 0.8 * r();
  const foot = new THREE.Vector3(0, 0, 0), neck = new THREE.Vector3(0, top, 0);
  out.tube(ring(foot, 0.28, 5), ring(neck, 0.15, 5, 0.3), bark, new THREE.Vector3(0, top / 2, 0));
  const greens = [TREE_COLORS.leaves, TREE_COLORS.leavesDark, TREE_COLORS.leavesLight];
  const main = new THREE.Vector3(0, top + 1.5, 0);
  lump(out, main, 2 + 0.25 * r(), greens[variant % 2] as number, variant * 11 + 1);
  const sides = 2 + (variant % 2), turn = r() * Math.PI * 2;
  for (let k = 0; k < sides; k++) {
    const a = turn + (k / sides) * Math.PI * 2 + (r() - 0.5) * 0.6, d = 1.25 + 0.3 * r();
    const at = new THREE.Vector3(Math.cos(a) * d, top + 0.9 + 0.5 * r(), Math.sin(a) * d);
    lump(out, at, 1.3 + 0.3 * r(), greens[(k + variant + 1) % 3] as number, variant * 11 + k + 2);
    if (k < 2) limb(out, new THREE.Vector3(0, top * 0.72, 0), at.clone().multiplyScalar(0.7), 0.09, bark);
  }
  if (variant % 2 === 0) lump(out, new THREE.Vector3(0.3 * (r() - 0.5), top + 2.7, 0.3 * (r() - 0.5)), 1.2 + 0.2 * r(), TREE_COLORS.leavesLight, variant * 11 + 9);
  return out.done();
}

/**
 * A palm: a trunk curving up out of its lean, a ring's shade a segment; fronds from its top, each an arch rising and
 * drooping to its tip, its leaflets hanging from the midrib either side; coconuts under them.
 */
function palm(variant: number): TreeRaw {
  const r = stream(variant + 101), out = new Faces();
  const tall = 6.6 + 1.6 * r(), lean = 0.5 + 0.9 * r(), segments = 4;
  const bark = new THREE.Color(TREE_COLORS.palmBark), ringShade = bark.clone().multiplyScalar(0.8);
  const axis = (y: number): THREE.Vector3 => new THREE.Vector3(lean * (1 - (1 - y / tall) ** 2), y, 0);
  let below = ring(axis(0), 0.27, 5);
  for (let s = 1; s <= segments; s++) {
    const y = (s / segments) * tall, above = ring(axis(y), 0.27 - 0.1 * (s / segments), 5, s * 0.4);
    out.tube(below, above, s % 2 ? bark : ringShade, axis(y - tall / segments / 2));
    below = above;
  }
  const crown = axis(tall), up = new THREE.Vector3(0, 1, 0);
  const fronds = 7 + (variant % 2), light = new THREE.Color(TREE_COLORS.frond), dark = new THREE.Color(TREE_COLORS.frondDark);
  const turn = r() * Math.PI;
  for (let k = 0; k < fronds; k++) {
    const a = turn + (k / fronds) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = new THREE.Vector3(-d.z, 0, d.x);
    // young fronds stand up, old ones droop: the arch's rise and its tip's fall
    const age = r(), length = 3.2 + 0.6 * r(), width = 0.55 + 0.15 * r();
    const rise = 0.75 - 0.6 * age, fall = 0.5 + 1.5 * age;
    const s0 = crown.clone().addScaledVector(d, 0.15);
    const s1 = crown.clone().addScaledVector(d, length * 0.5).addScaledVector(up, rise);
    const s2 = crown.clone().addScaledVector(d, length).addScaledVector(up, -fall);
    const hang = (p: THREE.Vector3, w: number, sign: number): THREE.Vector3 => p.clone().addScaledVector(side, sign * w).addScaledVector(up, -0.35 * w);
    const l0 = hang(s0, 0.1, -1), r0 = hang(s0, 0.1, 1), l1 = hang(s1, width, -1), r1 = hang(s1, width, 1);
    const colour = k % 2 ? light : dark;
    out.both(s0, l0, l1, colour);
    out.both(s0, l1, s1, colour);
    out.both(s0, s1, r1, colour);
    out.both(s0, r1, r0, colour);
    out.both(s1, l1, s2, colour);
    out.both(s1, s2, r1, colour);
  }
  // coconuts: small tetrahedra hanging under the fronds
  const nut = new THREE.Color(TREE_COLORS.coconut);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + variant, c = crown.clone().add(new THREE.Vector3(Math.cos(a) * 0.24, -0.3, Math.sin(a) * 0.24)), s = 0.17;
    const p = [new THREE.Vector3(0, s, 0), new THREE.Vector3(s, -s * 0.6, 0), new THREE.Vector3(-s * 0.5, -s * 0.6, s * 0.87), new THREE.Vector3(-s * 0.5, -s * 0.6, -s * 0.87)].map((v) => v.add(c));
    for (const [i, j, l] of [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]] as const) out.tri(p[i] as THREE.Vector3, p[j] as THREE.Vector3, p[l] as THREE.Vector3, nut, c);
  }
  return out.done();
}

/**
 * The street's young tree: a thin trunk and a crown of three small lumps; one shape (a knocked one, drawn about its own
 * middle, keeps the look it stood with).
 */
function sapling(): TreeRaw {
  const out = new Faces(), bark = new THREE.Color(TREE_COLORS.bark), top = 2.5;
  out.tube(ring(new THREE.Vector3(0, 0, 0), 0.07, 4), ring(new THREE.Vector3(0, top, 0), 0.05, 4), bark, new THREE.Vector3(0, top / 2, 0));
  lump(out, new THREE.Vector3(0, top + 0.7, 0), 1.0, TREE_COLORS.leaves, 41);
  lump(out, new THREE.Vector3(0.45, top + 0.35, -0.3), 0.62, TREE_COLORS.leavesDark, 42);
  lump(out, new THREE.Vector3(0.1, top + 1.55, 0.1), 0.66, TREE_COLORS.leavesLight, 43);
  return out.done();
}

const YOUNG = sapling();

const MODELS: Record<TreeModel, TreeRaw[]> = {
  broadleaf: Array.from({ length: TREE_VARIANTS }, (_, v) => broadleaf(v)),
  palm: Array.from({ length: TREE_VARIANTS }, (_, v) => palm(v)),
  sapling: Array.from({ length: TREE_VARIANTS }, () => YOUNG),
};

/** A model's variant, built once. */
export function treeRaw(model: TreeModel, variant: number): TreeRaw {
  return MODELS[model][variant] as TreeRaw;
}
