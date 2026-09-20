/**
 * Cars built in code from parametric profiles (docs/BRIEF.md §4, docs/STYLE.md).
 *
 * A body is a loft through cross-sections along the car's length. Each section
 * has a floor, a belt line and a roof line with their own half widths, so a
 * profile describes the whole silhouette: low nose, bonnet, raked windscreen,
 * narrow greenhouse, rear window, tail. Faces are coloured per region (paint,
 * glass, trim) and flat shaded; no textures. Details (lights, grille, bumpers,
 * mirrors, spoiler, exhausts) are extra boxes. Wheels are separate objects
 * driven by the sim's wheel transforms and sit wider than the body.
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
  /** Section index range [from, to] whose upper sides are glass (the greenhouse). */
  glassSides: [number, number];
  /** Section pairs (index of the first section) whose sloping top is glass: windscreen and rear window. */
  glassTops: number[];
  /** Visual wheel offset along the axle: negative pushes the wheels outward past the sills. */
  headlight: { width: number; height: number; y: number; inset: number };
  taillight: { width: number; height: number; y: number; inset: number };
  grille: { width: number; height: number; y: number } | null;
  spoiler: { width: number; height: number; y: number; back: number } | null;
  mirrors: boolean;
  exhausts: number;
  wheelInset: number;
  headlightColor?: number;
}

/** A long-bonnet coupe: the first car. Heights above ground, length 4.5 m, width 1.84 m. */
export const MUSCLE: CarProfile = {
  name: 'muscle',
  sections: [
    { z: 2.25, floor: 0.38, belt: 0.64, roof: 0.68, hwFloor: 0.74, hwBelt: 0.86, hwRoof: 0.82 },
    { z: 1.75, floor: 0.36, belt: 0.72, roof: 0.76, hwFloor: 0.82, hwBelt: 0.92, hwRoof: 0.88 },
    { z: 0.75, floor: 0.36, belt: 0.8, roof: 0.83, hwFloor: 0.84, hwBelt: 0.94, hwRoof: 0.88 },
    { z: 0.05, floor: 0.36, belt: 0.82, roof: 1.32, hwFloor: 0.84, hwBelt: 0.94, hwRoof: 0.72 },
    { z: -0.85, floor: 0.36, belt: 0.82, roof: 1.32, hwFloor: 0.84, hwBelt: 0.94, hwRoof: 0.72 },
    { z: -1.6, floor: 0.37, belt: 0.84, roof: 0.9, hwFloor: 0.82, hwBelt: 0.92, hwRoof: 0.86 },
    { z: -2.25, floor: 0.4, belt: 0.82, roof: 0.88, hwFloor: 0.76, hwBelt: 0.86, hwRoof: 0.82 },
  ],
  glassSides: [3, 4],
  glassTops: [2, 4],
  headlight: { width: 0.4, height: 0.14, y: 0.6, inset: 0.28 },
  taillight: { width: 0.56, height: 0.14, y: 0.7, inset: 0.32 },
  grille: { width: 0.66, height: 0.14, y: 0.6 },
  spoiler: { width: 1.5, height: 0.05, y: 1.0, back: 2.12 },
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
    // corners: L = +x, R = -x; f = floor, b = belt, r = roof; suffixes 0 (section a) and 1 (section b)
    const Lf0 = P(a.hwFloor, a.floor, a.z), Rf0 = P(-a.hwFloor, a.floor, a.z);
    const Lb0 = P(a.hwBelt, a.belt, a.z), Rb0 = P(-a.hwBelt, a.belt, a.z);
    const Lr0 = P(a.hwRoof, a.roof, a.z), Rr0 = P(-a.hwRoof, a.roof, a.z);
    const Lf1 = P(b.hwFloor, b.floor, b.z), Rf1 = P(-b.hwFloor, b.floor, b.z);
    const Lb1 = P(b.hwBelt, b.belt, b.z), Rb1 = P(-b.hwBelt, b.belt, b.z);
    const Lr1 = P(b.hwRoof, b.roof, b.z), Rr1 = P(-b.hwRoof, b.roof, b.z);
    const ref = P(0, (a.floor + a.roof + b.floor + b.roof) / 4, (a.z + b.z) / 2);
    fb.quad(Lf0, Lf1, Rf1, Rf0, paintDark, ref); // floor
    fb.quad(Lf0, Lb0, Lb1, Lf1, paint, ref); // left lower side
    fb.quad(Rf1, Rb1, Rb0, Rf0, paint, ref); // right lower side
    const upper = sideGlass ? glass : paint;
    fb.quad(Lb0, Lr0, Lr1, Lb1, upper, ref); // left upper side
    fb.quad(Rb1, Rr1, Rr0, Rb0, upper, ref); // right upper side
    fb.quad(Lr1, Lr0, Rr0, Rr1, topGlass ? glass : paint, ref); // top: windscreen / roof / rear window
  }
  // caps
  const f = S[0] as Section;
  const r = S[S.length - 1] as Section;
  const cap = (s: Section) => {
    const Lf = P(s.hwFloor, s.floor, s.z), Rf = P(-s.hwFloor, s.floor, s.z);
    const Lb = P(s.hwBelt, s.belt, s.z), Rb = P(-s.hwBelt, s.belt, s.z);
    const Lr = P(s.hwRoof, s.roof, s.z), Rr = P(-s.hwRoof, s.roof, s.z);
    const ref = P(0, (s.floor + s.roof) / 2, 0);
    fb.quad(Rf, Rb, Lb, Lf, paint, ref);
    fb.quad(Rb, Rr, Lr, Lb, paint, ref);
  };
  cap(f);
  cap(r);
  return fb.build();
}

function shade(hex: number, k: number): number {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return c.getHex();
}

export function buildCarMesh(t: VehicleTuning, profile: CarProfile = MUSCLE, color: number = PALETTE.carRed): CarMesh {
  const root = new THREE.Group();
  // body origin above ground at rest: axle height + attach - static compression
  const gEff = 9.81 + t.extraGravity;
  const staticCompression = (t.mass * gEff) / 4 / t.suspensionStiffness;
  const y0 = t.wheelRadius + t.suspensionRestLength - staticCompression - t.suspensionAttachY;

  const paintDark = shade(color, 0.72);
  const body = new THREE.Mesh(loftBody(profile, y0, color, paintDark), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  body.castShadow = true;
  root.add(body);

  const dark = new THREE.MeshLambertMaterial({ color: PALETTE.carBlack, flatShading: true });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff4c2 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd42a3a });
  const add = (geom: THREE.BufferGeometry, mat: THREE.Material, x: number, yGround: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(geom, mat);
    m.position.set(x, yGround - y0, z);
    m.castShadow = true;
    root.add(m);
    return m;
  };
  const S = profile.sections;
  const nose = S[0] as Section;
  const tail = S[S.length - 1] as Section;

  // bumpers
  add(new THREE.BoxGeometry(nose.hwBelt * 2 + 0.04, 0.16, 0.18), dark, 0, nose.floor + 0.1, nose.z + 0.02);
  add(new THREE.BoxGeometry(tail.hwBelt * 2 + 0.04, 0.16, 0.18), dark, 0, tail.floor + 0.1, tail.z - 0.02);
  // headlights, tail lights, grille
  const h = profile.headlight;
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(h.width, h.height, 0.06), lightMat, sx * (nose.hwBelt - h.inset), h.y, nose.z + 0.02);
  const tl = profile.taillight;
  const tailLights: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) tailLights.push(add(new THREE.BoxGeometry(tl.width, tl.height, 0.06), tailMat, sx * (tail.hwBelt - tl.inset), tl.y, tail.z - 0.02));
  if (profile.grille) add(new THREE.BoxGeometry(profile.grille.width, profile.grille.height, 0.06), dark, 0, profile.grille.y, nose.z + 0.02);
  // mirrors, spoiler, exhausts
  if (profile.mirrors) {
    const zM = (S[profile.glassSides[0]] as Section).z + 0.25;
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.22, 0.1, 0.14), dark, sx * ((S[2] as Section).hwBelt + 0.12), (S[2] as Section).belt + 0.12, zM);
    }
  }
  if (profile.spoiler) {
    const sp = profile.spoiler;
    const spoilerMat = new THREE.MeshLambertMaterial({ color: paintDark, flatShading: true });
    add(new THREE.BoxGeometry(sp.width, sp.height, 0.3), spoilerMat, 0, sp.y, -sp.back);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.06, sp.y - tail.roof, 0.16), dark, sx * (sp.width / 2 - 0.1), (sp.y + tail.roof) / 2, -sp.back);
  }
  for (let i = 0; i < profile.exhausts; i++) {
    const sx = profile.exhausts === 1 ? 0.5 : i === 0 ? -0.4 : 0.4;
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 6).rotateX(Math.PI / 2), dark, sx, tail.floor + 0.06, tail.z - 0.06);
  }

  // wheels: tyre + rim + hub, wider than the body
  const wheels: THREE.Object3D[] = [];
  const tyreGeom = new THREE.CylinderGeometry(t.wheelRadius, t.wheelRadius, t.wheelWidth, 16).rotateZ(Math.PI / 2);
  const rimGeom = new THREE.CylinderGeometry(t.wheelRadius * 0.6, t.wheelRadius * 0.6, t.wheelWidth + 0.02, 8).rotateZ(Math.PI / 2);
  const hubGeom = new THREE.CylinderGeometry(t.wheelRadius * 0.22, t.wheelRadius * 0.22, t.wheelWidth + 0.05, 6).rotateZ(Math.PI / 2);
  const tyreMat = new THREE.MeshLambertMaterial({ color: PALETTE.tyre, flatShading: true });
  const rimMat = new THREE.MeshLambertMaterial({ color: PALETTE.rim, flatShading: true });
  for (let i = 0; i < 4; i++) {
    // order matches the sim: FR, FL, RR, RL (left = odd, +x)
    const g = new THREE.Group();
    const tyre = new THREE.Mesh(tyreGeom, tyreMat);
    tyre.castShadow = true;
    const inner = new THREE.Group();
    inner.add(tyre, new THREE.Mesh(rimGeom, rimMat), new THREE.Mesh(hubGeom, dark));
    inner.position.x = (i % 2 === 1 ? -1 : 1) * profile.wheelInset;
    g.add(inner);
    wheels.push(g);
  }

  const brakeOn = new THREE.Color(0xff7b86);
  const brakeOff = new THREE.Color(0xd42a3a);
  let lastBrake = -1;
  return {
    root,
    wheels,
    update(tm) {
      const braking = tm.throttle === 0 && Math.abs(tm.speed) > 1 ? 1 : 0;
      if (braking !== lastBrake) {
        for (const m of tailLights) (m.material as THREE.MeshBasicMaterial).color.copy(braking ? brakeOn : brakeOff);
        lastBrake = braking;
      }
    },
  };
}
