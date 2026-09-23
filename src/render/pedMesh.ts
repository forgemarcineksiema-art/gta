/**
 * The city's people (M5.5 slice 20, docs/DESIGN.md §13.11): four silhouettes
 * of boxes, feet at y = 0, facing +Z, +X to their left. A man in a long coat,
 * a woman with a bag, a worker in a hard hat and a hi-vis vest, an old man
 * with a stick and a flat cap. Every vertex names its limb and the joint it
 * turns about, so one instanced material swings the legs and arms by a
 * per-instance phase (the walk), throws the arms forward (the dive), pushes
 * up (getting up) and shakes a fist; the sim writes the body's bob and pitch
 * into the transform. The clothes carry the paint mask: the instance's tint
 * is the coat, the jacket, the vest or the cardigan.
 */
import * as THREE from 'three';
import { PED_COLORS, PedLook } from '../sim';

/** Limb ids in the `limb` attribute: the body stays, the rest turn about their joint. */
export const LIMB = { body: 0, legL: 1, legR: 2, armL: 3, armR: 4 } as const;
/** The clothes' tones on the instance tint: full, and a shade darker for a coat's skirt. */
const TINT = -1, TINT_DARK = -2;

type Vec = readonly [number, number, number];

class PedBuilder {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly col: number[] = [];
  private readonly mask: number[] = [];
  private readonly limbs: number[] = [];
  private readonly pivots: number[] = [];
  private readonly c = new THREE.Color();
  private limb: number = LIMB.body;
  private pivot: Vec = [0, 0, 0];

  /** The limb and joint the next boxes belong to. */
  on(limb: number, pivot: Vec = [0, 0, 0]): this {
    this.limb = limb;
    this.pivot = pivot;
    return this;
  }

  /** A box from its centre and size; `taper` scales the top face's width and depth (a coat's skirt, a stoop). */
  box(centre: Vec, size: Vec, color: number, taper = 1, lean = 0): this {
    const [cx, cy, cz] = centre, [w, h, d] = size;
    const bottom = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as const;
    const corner = (k: number, top: boolean): Vec => {
      const [x, z] = bottom[k] as readonly [number, number];
      const s = top ? taper : 1;
      return [cx + x * s, cy + (top ? h / 2 : -h / 2), cz + z * s + (top ? lean : 0)];
    };
    const b = [0, 1, 2, 3].map((k) => corner(k, false)), t = [0, 1, 2, 3].map((k) => corner(k, true));
    const quad = (p: Vec[], out: Vec): void => {
      this.tri(p[0] as Vec, p[1] as Vec, p[2] as Vec, out, color);
      this.tri(p[0] as Vec, p[2] as Vec, p[3] as Vec, out, color);
    };
    quad([b[0], b[1], b[2], b[3]] as Vec[], [0, -1, 0]);
    quad([t[0], t[1], t[2], t[3]] as Vec[], [0, 1, 0]);
    quad([b[0], b[1], t[1], t[0]] as Vec[], [0, 0, -1]);
    quad([b[3], b[2], t[2], t[3]] as Vec[], [0, 0, 1]);
    quad([b[1], b[2], t[2], t[1]] as Vec[], [1, 0, 0]);
    quad([b[0], b[3], t[3], t[0]] as Vec[], [-1, 0, 0]);
    return this;
  }

  private tri(a: Vec, b: Vec, c: Vec, out: Vec, color: number): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) return;
    nx /= len; ny /= len; nz /= len;
    const flip = nx * out[0] + ny * out[1] + nz * out[2] < 0;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const tinted = color < 0;
    if (tinted) {
      const k = color === TINT_DARK ? 0.8 : 1;
      this.c.setRGB(k, k, k);
    } else {
      this.c.setHex(color);
    }
    for (const p of flip ? [a, c, b] : [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.mask.push(tinted ? 1 : 0);
      this.limbs.push(this.limb);
      this.pivots.push(this.pivot[0], this.pivot[1], this.pivot[2]);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('paintMask', new THREE.BufferAttribute(new Float32Array(this.mask), 1));
    g.setAttribute('limb', new THREE.BufferAttribute(new Float32Array(this.limbs), 1));
    g.setAttribute('pivot', new THREE.BufferAttribute(new Float32Array(this.pivots), 3));
    g.computeBoundingSphere();
    return g;
  }
}

const C = PED_COLORS;

/** Legs from the hip down with shoes, each on its own joint. */
function legs(b: PedBuilder, hip: number, half: number, width: number, cloth: number, shoe: number, shoeHeight = 0.08): void {
  for (const [limb, x] of [[LIMB.legL, half], [LIMB.legR, -half]] as const) {
    b.on(limb, [x, hip, 0])
      .box([x, (hip + shoeHeight) / 2, 0], [width, hip - shoeHeight, width + 0.02], cloth)
      .box([x, shoeHeight / 2, 0.035], [width + 0.02, shoeHeight, width + 0.13], shoe);
  }
}

/** Arms from the shoulder down with hands, each on its own joint. */
function arms(b: PedBuilder, shoulder: number, x: number, length: number, width: number, sleeve: number, z = 0): void {
  for (const [limb, side] of [[LIMB.armL, 1], [LIMB.armR, -1]] as const) {
    b.on(limb, [side * x, shoulder, z])
      .box([side * x, shoulder - length / 2, z], [width, length, width + 0.01], sleeve)
      .box([side * x, shoulder - length - 0.045, z], [width - 0.02, 0.09, width - 0.01], C.skin);
  }
}

export function buildPed(look: PedLook): THREE.BufferGeometry {
  const b = new PedBuilder();
  switch (look) {
    case PedLook.Coat: {
      // a man in a long coat: the skirt to the knees hides the thighs, a scarf, short dark hair
      legs(b, 0.92, 0.1, 0.13, C.trousers, C.shoes);
      b.on(LIMB.body)
        .box([0, 0.76, 0], [0.47, 0.42, 0.3], TINT_DARK, 0.94)
        .box([0, 1.23, 0], [0.45, 0.54, 0.27], TINT)
        .box([0, 1.52, 0.01], [0.3, 0.07, 0.22], C.scarf)
        .box([0, 1.57, 0], [0.1, 0.06, 0.1], C.skin)
        .box([0, 1.7, 0.01], [0.2, 0.22, 0.21], C.skin)
        .box([0, 1.82, -0.005], [0.21, 0.05, 0.22], C.hair);
      arms(b, 1.47, 0.285, 0.54, 0.12, TINT);
      break;
    }
    case PedLook.Bag: {
      // a woman with a bag on her left arm: a jacket in the tint, a dark skirt, auburn hair to the neck
      legs(b, 0.84, 0.085, 0.11, C.skin, C.shoes);
      b.on(LIMB.body)
        .box([0, 0.72, 0], [0.4, 0.3, 0.26], C.skirt, 0.88)
        .box([0, 1.12, 0], [0.38, 0.5, 0.23], TINT, 0.95)
        .box([0, 1.41, 0], [0.09, 0.07, 0.09], C.skin)
        .box([0, 1.53, 0.01], [0.18, 0.2, 0.19], C.skin)
        .box([0, 1.64, -0.005], [0.2, 0.05, 0.21], C.hairAuburn)
        .box([0, 1.5, -0.08], [0.2, 0.26, 0.07], C.hairAuburn);
      arms(b, 1.35, 0.24, 0.5, 0.1, TINT);
      b.on(LIMB.armL, [0.24, 1.35, 0])
        .box([0.29, 0.86, 0], [0.09, 0.22, 0.3], C.bag)
        .box([0.26, 1.03, 0], [0.02, 0.14, 0.02], C.bag);
      break;
    }
    case PedLook.Worker: {
      // a worker: boots, denim, a vest in the tint with its reflective bands, grey sleeves, a yellow hard hat
      legs(b, 0.94, 0.11, 0.15, C.denim, C.boots, 0.12);
      b.on(LIMB.body)
        .box([0, 1.25, 0], [0.47, 0.58, 0.29], TINT)
        .box([0, 1.12, 0], [0.48, 0.04, 0.3], C.stripe)
        .box([0, 1.32, 0], [0.48, 0.04, 0.3], C.stripe)
        .box([0, 1.58, 0], [0.11, 0.06, 0.11], C.skinDark)
        .box([0, 1.71, 0.01], [0.21, 0.22, 0.21], C.skinDark)
        .box([0, 1.85, 0], [0.25, 0.09, 0.27], C.hardHat, 0.85)
        .box([0, 1.8, 0.02], [0.29, 0.025, 0.33], C.hardHat);
      arms(b, 1.5, 0.3, 0.56, 0.13, C.sleeve);
      break;
    }
    case PedLook.Officer: {
      // the officer (M5.5 slice 18): navy trousers and cap with a peak, a blue shirt, a belt, a badge, the ticket book in the left hand
      legs(b, 0.92, 0.1, 0.14, C.navy, C.shoes);
      b.on(LIMB.body)
        .box([0, 0.97, 0], [0.42, 0.1, 0.27], C.navy)
        .box([0, 1.24, 0], [0.44, 0.46, 0.27], C.uniform)
        .box([0.12, 1.36, 0.14], [0.06, 0.07, 0.02], C.badge)
        .box([0, 1.53, 0], [0.1, 0.06, 0.1], C.skin)
        .box([0, 1.66, 0.01], [0.2, 0.22, 0.21], C.skin)
        .box([0, 1.8, -0.005], [0.23, 0.07, 0.24], C.navy)
        .box([0, 1.77, 0.12], [0.2, 0.02, 0.1], C.navy)
        .box([0, 1.8, 0.115], [0.06, 0.04, 0.02], C.badge);
      arms(b, 1.45, 0.28, 0.54, 0.12, C.uniform);
      b.on(LIMB.armL, [0.28, 1.45, 0])
        .box([0.28, 0.83, 0.07], [0.12, 0.16, 0.03], C.ticket);
      break;
    }
    case PedLook.Old: {
      // an old man, stooped, a cardigan in the tint, a flat cap, grey hair, a stick in his right hand
      legs(b, 0.84, 0.1, 0.13, C.sleeve, C.shoes);
      b.on(LIMB.body)
        .box([0, 1.12, 0.02], [0.42, 0.5, 0.26], TINT, 0.95, 0.07)
        .box([0, 1.42, 0.1], [0.09, 0.07, 0.09], C.skin)
        .box([0, 1.53, 0.13], [0.19, 0.2, 0.2], C.skin)
        .box([0, 1.55, 0.03], [0.2, 0.1, 0.05], C.hairGrey)
        .box([0, 1.645, 0.14], [0.21, 0.05, 0.25], C.trousers)
        .box([0, 1.625, 0.28], [0.18, 0.02, 0.08], C.trousers);
      arms(b, 1.35, 0.26, 0.5, 0.11, TINT, 0.07);
      b.on(LIMB.armR, [-0.26, 1.35, 0.07])
        .box([-0.28, 0.43, 0.1], [0.03, 0.86, 0.03], C.stick)
        .box([-0.28, 0.87, 0.06], [0.03, 0.03, 0.1], C.stick);
      break;
    }
  }
  return b.geometry();
}

/**
 * The crowd's material: flat, vertex colours, the tint where the mask says so, and the limbs posed per
 * instance by `anim` (x the phase, y the amount, z the pose: 0 walk, 1 dive, 2 getting up, 3 the fist, 4 hailing a taxi, 5 writing a ticket).
 */
export function pedMaterial(): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const color = THREE.ShaderChunk.color_vertex.replace('vColor.rgb *= instanceColor.rgb;', 'vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, paintMask );');
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float paintMask;
attribute float limb;
attribute vec3 pivot;
attribute vec3 anim;
float limbAngle() {
  float leg = limb > 0.5 && limb < 2.5 ? 1.0 : 0.0;
  float arm = limb > 2.5 ? 1.0 : 0.0;
  float side = (limb > 0.5 && limb < 1.5) || (limb > 2.5 && limb < 3.5) ? 1.0 : -1.0;
  float swing = sin( anim.x ) * anim.y;
  if ( anim.z < 0.5 ) return leg * side * 0.5 * swing - arm * side * 0.45 * swing;
  if ( anim.z < 1.5 ) return leg * ( side > 0.0 ? 0.35 : 0.1 ) * anim.y - arm * 2.6 * anim.y;
  if ( anim.z < 2.5 ) return -arm * 0.9 * anim.y;
  if ( anim.z < 3.5 ) return side < 0.0 ? -arm * ( 2.6 + 0.25 * sin( anim.x ) ) : arm * 0.15;
  // hailing: the right arm straight up and still
  if ( anim.z < 4.5 ) return side < 0.0 ? -arm * 2.9 : 0.0;
  // writing the ticket: the book held up in the left hand, the right hand at it, a scribble in the wrist
  return side > 0.0 ? -arm * 1.25 : -arm * ( 1.1 + 0.06 * sin( anim.x ) );
}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float limbA = limb > 0.5 ? limbAngle() : 0.0;
if ( limbA != 0.0 ) {
  vec3 fromJoint = transformed - pivot;
  float cs = cos( limbA ), sn = sin( limbA );
  transformed = pivot + vec3( fromJoint.x, cs * fromJoint.y - sn * fromJoint.z, sn * fromJoint.y + cs * fromJoint.z );
}`)
      .replace('#include <color_vertex>', color);
  };
  material.customProgramCacheKey = () => 'ped-limbs';
  return material;
}
