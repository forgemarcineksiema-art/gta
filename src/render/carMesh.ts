/**
 * Cars built in code from parametric profiles (docs/BRIEF.md §4, docs/STYLE.md).
 *
 * A body is a loft through cross-sections along the car's length. Each section
 * has a floor, a belt line and a roof line with their own half widths, so a
 * profile describes the whole silhouette: nose lip, fender peak, bonnet, raked
 * windscreen, narrow greenhouse, rear window, boot, tail. Faces are coloured per
 * region (paint, darker sills, glass) and flat shaded; no textures.
 *
 * On top of the loft: pillars and a belt trim that split the glass into windows,
 * door seams, wheel-arch lips, a splitter and a sill, bumpers, lights, grille,
 * mirrors, spoiler and exhausts, all as boxes in the shared palette's blacks and
 * greys. Wheels are separate objects driven by the sim: tyre, spoked rim, cap.
 * Lights react to the sim: brake lights on the brake pedal, reverse lights in
 * reverse, running lights always (it is dusk).
 *
 * Local frame: +Z forward, +Y up, +X left. Heights in a profile are above the
 * ground with the car at rest; the builder converts to the body origin.
 */
import * as THREE from 'three';
import { PALETTE, type VehicleTelemetry, type VehicleTuning } from '../sim';

export interface CarMesh {
  root: THREE.Group;
  wheels: THREE.Object3D[];
  update(tm: VehicleTelemetry): void;
}

/** One cross-section of the body, at longitudinal position z (metres, + = front). */
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
  /** Section index range [from, to) whose upper sides are glass (the greenhouse). */
  glassSides: [number, number];
  /** Section pairs (index of the first section) whose sloping top is glass: windscreen and rear window. */
  glassTops: number[];
  /** z positions of the B pillar(s) splitting the side glass, and of the door seams (floor to belt). */
  pillars: number[];
  doorSeams: number[];
  headlight: { width: number; height: number; y: number; inset: number };
  taillight: { width: number; height: number; y: number; inset: number };
  grille: { width: number; height: number; y: number } | null;
  spoiler: { width: number; height: number; y: number; back: number } | null;
  mirrors: boolean;
  exhausts: number;
  /** Visual wheel offset along the axle: negative pushes the wheels outward past the sills. */
  wheelInset: number;
}

/** A long-bonnet coupe: the first car. Heights above ground, length 4.5 m, width ~1.9 m at the belt. */
export const MUSCLE: CarProfile = {
  name: 'muscle',
  sections: [
    { z: 2.25, floor: 0.4, belt: 0.6, roof: 0.64, hwFloor: 0.72, hwBelt: 0.84, hwRoof: 0.8 },
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
  pillars: [-0.42],
  doorSeams: [0.72, -0.5],
  headlight: { width: 0.4, height: 0.14, y: 0.6, inset: 0.28 },
  taillight: { width: 0.56, height: 0.14, y: 0.7, inset: 0.3 },
  grille: { width: 0.66, height: 0.14, y: 0.6 },
  spoiler: { width: 1.5, height: 0.05, y: 1.02, back: 2.12 },
  mirrors: true,
  exhausts: 2,
  wheelInset: -0.08,
};

class FaceBuilder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  private readonly c = new THREE.Color();
  private readonly n = new THREE.Vector3();
  private readonly e1 = new THREE.Vector3();
  private readonly e2 = new THREE.Vector3();

  /** Quad a-b-c-d, wound so its normal points away from `ref` (a point inside the body). */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number, ref: THREE.Vector3): void {
    this.e1.subVectors(b, a);
    this.e2.subVectors(c, a);
    this.n.crossVectors(this.e1, this.e2);
    this.e1.copy(a).add(b).add(c).add(d).multiplyScalar(0.25).sub(ref);
    if (this.n.dot(this.e1) >= 0) {
      this.tri(a, b, c, color);
      this.tri(a, c, d, color);
    } else {
      this.tri(a, c, b, color);
      this.tri(a, d, c, color);
    }
  }

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number): void {
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

/** Loft the body through the profile's sections. `y0` is the body origin's height above ground. */
function loftBody(profile: CarProfile, y0: number, paint: number, paintDark: number): THREE.BufferGeometry {
  const fb = new FaceBuilder();
  const S = profile.sections;
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y - y0, z);
  const glass = PALETTE.glass;
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i] as Section;
    const b = S[i + 1] as Section;
    const sideGlass = i >= profile.glassSides[0] && i < profile.glassSides[1];
    const topGlass = profile.glassTops.includes(i);
    const Lf0 = P(a.hwFloor, a.floor, a.z), Rf0 = P(-a.hwFloor, a.floor, a.z);
    const Lb0 = P(a.hwBelt, a.belt, a.z), Rb0 = P(-a.hwBelt, a.belt, a.z);
    const Lr0 = P(a.hwRoof, a.roof, a.z), Rr0 = P(-a.hwRoof, a.roof, a.z);
    const Lf1 = P(b.hwFloor, b.floor, b.z), Rf1 = P(-b.hwFloor, b.floor, b.z);
    const Lb1 = P(b.hwBelt, b.belt, b.z), Rb1 = P(-b.hwBelt, b.belt, b.z);
    const Lr1 = P(b.hwRoof, b.roof, b.z), Rr1 = P(-b.hwRoof, b.roof, b.z);
    const ref = P(0, (a.floor + a.roof + b.floor + b.roof) / 4, (a.z + b.z) / 2);
    fb.quad(Lf0, Lf1, Rf1, Rf0, PALETTE.charcoal, ref); // floor
    fb.quad(Lf0, Lb0, Lb1, Lf1, paint, ref); // left lower side
    fb.quad(Rf1, Rb1, Rb0, Rf0, paint, ref); // right lower side
    const upper = sideGlass ? glass : paint;
    fb.quad(Lb0, Lr0, Lr1, Lb1, upper, ref); // left upper side
    fb.quad(Rb1, Rr1, Rr0, Rb0, upper, ref); // right upper side
    fb.quad(Lr1, Lr0, Rr0, Rr1, topGlass ? glass : paint, ref); // top: windscreen / roof / rear window
  }
  const cap = (s: Section, lower: number) => {
    const Lf = P(s.hwFloor, s.floor, s.z), Rf = P(-s.hwFloor, s.floor, s.z);
    const Lb = P(s.hwBelt, s.belt, s.z), Rb = P(-s.hwBelt, s.belt, s.z);
    const Lr = P(s.hwRoof, s.roof, s.z), Rr = P(-s.hwRoof, s.roof, s.z);
    const ref = P(0, (s.floor + s.roof) / 2, 0);
    fb.quad(Rf, Rb, Lb, Lf, lower, ref);
    fb.quad(Rb, Rr, Lr, Lb, paint, ref);
  };
  cap(S[0] as Section, paint);
  cap(S[S.length - 1] as Section, paintDark);
  return fb.build();
}

function shade(hex: number, k: number): number {
  return new THREE.Color(hex).multiplyScalar(k).getHex();
}

/** Belt height and half width of the body at a z, interpolated between sections. */
function beltAt(S: Section[], z: number): { belt: number; hw: number; floor: number; roof: number; hwRoof: number } {
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i] as Section;
    const b = S[i + 1] as Section;
    if (z <= a.z && z >= b.z) {
      const t = a.z === b.z ? 0 : (a.z - z) / (a.z - b.z);
      return {
        belt: a.belt + (b.belt - a.belt) * t,
        hw: a.hwBelt + (b.hwBelt - a.hwBelt) * t,
        floor: a.floor + (b.floor - a.floor) * t,
        roof: a.roof + (b.roof - a.roof) * t,
        hwRoof: a.hwRoof + (b.hwRoof - a.hwRoof) * t,
      };
    }
  }
  const s = z > (S[0] as Section).z ? (S[0] as Section) : (S[S.length - 1] as Section);
  return { belt: s.belt, hw: s.hwBelt, floor: s.floor, roof: s.roof, hwRoof: s.hwRoof };
}

export function buildCarMesh(t: VehicleTuning, profile: CarProfile = MUSCLE, color: number = PALETTE.carRed): CarMesh {
  const root = new THREE.Group();
  // body origin above ground at rest: axle height + attach - static compression
  const gEff = 9.81 + t.extraGravity;
  const staticCompression = (t.mass * gEff) / 4 / t.suspensionStiffness;
  const y0 = t.wheelRadius + t.suspensionRestLength - staticCompression - t.suspensionAttachY;
  const S = profile.sections;
  const nose = S[0] as Section;
  const tail = S[S.length - 1] as Section;

  const paintDark = shade(color, 0.72);
  const flat = (hex: number) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const matInk = flat(PALETTE.ink);
  const matCharcoal = flat(PALETTE.charcoal);
  const matGraphite = flat(PALETTE.graphite);
  const matSteel = flat(PALETTE.steel);
  const matChrome = flat(PALETTE.chrome);
  const matPaintDark = flat(paintDark);

  const body = new THREE.Mesh(loftBody(profile, y0, color, paintDark), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  body.castShadow = true;
  root.add(body);

  const add = (geom: THREE.BufferGeometry, mat: THREE.Material, x: number, yGround: number, z: number, rotY = 0): THREE.Mesh => {
    const m = new THREE.Mesh(geom, mat);
    m.position.set(x, yGround - y0, z);
    m.rotation.y = rotY;
    m.castShadow = true;
    root.add(m);
    return m;
  };

  // --- greenhouse trim: belt strip, pillars, roof rails ------------------------------
  const gh0 = S[profile.glassSides[0]] as Section;
  const gh1 = S[profile.glassSides[1]] as Section;
  const ghLen = gh0.z - gh1.z;
  const ghMid = (gh0.z + gh1.z) / 2;
  for (const sx of [-1, 1]) {
    // belt trim along the window base
    add(new THREE.BoxGeometry(0.05, 0.035, ghLen + 0.1), matInk, sx * (gh0.hwBelt + 0.005), gh0.belt + 0.01, ghMid);
    // A and C pillars at the ends of the side glass, B pillar(s) in between
    const hA = gh0.roof - gh0.belt;
    add(new THREE.BoxGeometry(0.05, hA, 0.09), matCharcoal, sx * ((gh0.hwBelt + gh0.hwRoof) / 2 + 0.01), (gh0.belt + gh0.roof) / 2, gh0.z - 0.03);
    add(new THREE.BoxGeometry(0.05, hA, 0.11), matCharcoal, sx * ((gh1.hwBelt + gh1.hwRoof) / 2 + 0.01), (gh1.belt + gh1.roof) / 2, gh1.z + 0.04);
    for (const pz of profile.pillars) {
      const b = beltAt(S, pz);
      add(new THREE.BoxGeometry(0.05, b.roof - b.belt, 0.08), matCharcoal, sx * ((b.hw + b.hwRoof) / 2 + 0.01), (b.belt + b.roof) / 2, pz);
    }
    // roof rail
    add(new THREE.BoxGeometry(0.04, 0.03, ghLen - 0.2), matCharcoal, sx * (gh0.hwRoof - 0.02), gh0.roof + 0.015, ghMid);
    // door seams and handles
    for (const dz of profile.doorSeams) {
      const b = beltAt(S, dz);
      const hwF = beltAt(S, dz).hw - (gh0.hwBelt - gh0.hwFloor); // floor half width at this z
      const seam = add(new THREE.BoxGeometry(0.03, b.belt - b.floor - 0.06, 0.025), matInk, sx * ((b.hw + hwF) / 2 + 0.012), (b.belt + b.floor) / 2, dz);
      seam.rotation.z = -sx * Math.atan((b.hw - hwF) / (b.belt - b.floor)); // follow the tumblehome
    }
    const handleZ = ((profile.doorSeams[0] ?? 0.7) + (profile.doorSeams[1] ?? -0.5)) / 2 - 0.35;
    const hb = beltAt(S, handleZ);
    add(new THREE.BoxGeometry(0.03, 0.04, 0.16), matGraphite, sx * (hb.hw + 0.01), hb.belt - 0.12, handleZ);
    // sill strip under the doors
    add(new THREE.BoxGeometry(0.06, 0.07, 2.8), matCharcoal, sx * (gh0.hwFloor + 0.01), gh0.floor + 0.02, 0);
    // wheel-arch lips
    for (const wz of [t.wheelBase / 2, -t.wheelBase / 2]) {
      const b = beltAt(S, wz);
      const lipY = t.wheelRadius * 2 + 0.05;
      add(new THREE.BoxGeometry(0.05, 0.08, 0.95), matPaintDark, sx * (b.hw + 0.02), Math.min(lipY, b.belt - 0.06), wz);
    }
  }

  // --- nose and tail ----------------------------------------------------------------
  add(new THREE.BoxGeometry(nose.hwBelt * 2 + 0.06, 0.16, 0.2), matCharcoal, 0, nose.floor + 0.1, nose.z + 0.02); // bumper
  add(new THREE.BoxGeometry(nose.hwFloor * 2 + 0.1, 0.05, 0.3), matInk, 0, nose.floor - 0.02, nose.z - 0.05); // splitter
  add(new THREE.BoxGeometry(tail.hwBelt * 2 + 0.06, 0.16, 0.2), matCharcoal, 0, tail.floor + 0.1, tail.z - 0.02);
  add(new THREE.BoxGeometry(tail.hwFloor * 2 + 0.04, 0.12, 0.26), matInk, 0, tail.floor - 0.02, tail.z + 0.02); // diffuser
  const h = profile.headlight;
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff1c9 });
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(h.width + 0.06, h.height + 0.06, 0.05), matInk, sx * (nose.hwBelt - h.inset), h.y, nose.z + 0.01);
    add(new THREE.BoxGeometry(h.width, h.height, 0.06), headMat, sx * (nose.hwBelt - h.inset), h.y, nose.z + 0.025);
  }
  if (profile.grille) {
    const g = profile.grille;
    add(new THREE.BoxGeometry(g.width, g.height, 0.06), matInk, 0, g.y, nose.z + 0.02);
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(g.width - 0.08, 0.012, 0.07), matSteel, 0, g.y - g.height / 2 + (g.height / 4) * (i + 1), nose.z + 0.02);
    add(new THREE.BoxGeometry(0.1, 0.06, 0.08), matChrome, 0, g.y + g.height / 2 + 0.04, nose.z + 0.02); // badge
  }
  const tl = profile.taillight;
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xc2222f });
  const reverseMat = new THREE.MeshBasicMaterial({ color: 0x8a8a8f });
  const tailLights: THREE.Mesh[] = [];
  const reverseLights: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(tl.width + 0.06, tl.height + 0.06, 0.05), matInk, sx * (tail.hwBelt - tl.inset), tl.y, tail.z - 0.01);
    const cx = sx * (tail.hwBelt - tl.inset);
    tailLights.push(add(new THREE.BoxGeometry(tl.width * 0.68, tl.height, 0.06), tailMat, cx + sx * tl.width * 0.16, tl.y, tail.z - 0.025));
    reverseLights.push(add(new THREE.BoxGeometry(tl.width * 0.26, tl.height, 0.06), reverseMat, cx - sx * tl.width * 0.36, tl.y, tail.z - 0.025));
  }
  if (profile.mirrors) {
    const zM = gh0.z + 0.2;
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.14, 0.03, 0.05), matCharcoal, sx * (gh0.hwBelt + 0.06), gh0.belt + 0.06, zM); // stalk
      add(new THREE.BoxGeometry(0.2, 0.1, 0.12), matPaintDark, sx * (gh0.hwBelt + 0.15), gh0.belt + 0.11, zM);
    }
  }
  if (profile.spoiler) {
    const sp = profile.spoiler;
    add(new THREE.BoxGeometry(sp.width, sp.height, 0.3), matPaintDark, 0, sp.y, -sp.back);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.06, sp.y - tail.roof, 0.16), matCharcoal, sx * (sp.width / 2 - 0.1), (sp.y + tail.roof) / 2, -sp.back);
  }
  for (let i = 0; i < profile.exhausts; i++) {
    const sx = profile.exhausts === 1 ? 0.5 : i === 0 ? -0.4 : 0.4;
    add(new THREE.CylinderGeometry(0.055, 0.055, 0.18, 8).rotateX(Math.PI / 2), matChrome, sx, tail.floor + 0.06, tail.z - 0.06);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8).rotateX(Math.PI / 2), matInk, sx, tail.floor + 0.06, tail.z - 0.07);
  }

  // --- wheels: tyre, sidewall, spoked rim, cap ------------------------------------------
  const wheels: THREE.Object3D[] = [];
  const r = t.wheelRadius;
  const w = t.wheelWidth;
  const tyreGeom = new THREE.CylinderGeometry(r, r, w, 18).rotateZ(Math.PI / 2);
  const sidewallGeom = new THREE.CylinderGeometry(r * 0.78, r * 0.78, w + 0.01, 18).rotateZ(Math.PI / 2);
  const rimGeom = new THREE.CylinderGeometry(r * 0.66, r * 0.66, w * 0.5, 12).rotateZ(Math.PI / 2);
  const spokeGeom = new THREE.BoxGeometry(w * 0.55, r * 1.2, r * 0.16);
  const capGeom = new THREE.CylinderGeometry(r * 0.16, r * 0.16, w * 0.7, 8).rotateZ(Math.PI / 2);
  const matTyre = flat(PALETTE.tyre);
  const matSidewall = flat(PALETTE.rubber);
  const matRim = flat(PALETTE.graphite);
  const matSpoke = flat(PALETTE.lightGrey);
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
    inner.add(new THREE.Mesh(capGeom, matChrome));
    inner.position.x = (i % 2 === 1 ? -1 : 1) * profile.wheelInset;
    g.add(inner);
    wheels.push(g);
  }

  const tailIdle = new THREE.Color(0xc2222f);
  const tailBrake = new THREE.Color(0xff5c6a);
  const reverseOff = new THREE.Color(0x8a8a8f);
  const reverseOn = new THREE.Color(0xfff6dc);
  let lastState = -1;
  return {
    root,
    wheels,
    update(tm) {
      const state = (tm.brake > 0.1 && tm.gear > 0 ? 1 : 0) | (tm.gear === -1 ? 2 : 0);
      if (state !== lastState) {
        for (const m of tailLights) (m.material as THREE.MeshBasicMaterial).color.copy(state & 1 ? tailBrake : tailIdle);
        for (const m of reverseLights) (m.material as THREE.MeshBasicMaterial).color.copy(state & 2 ? reverseOn : reverseOff);
        lastState = state;
      }
    },
  };
}
