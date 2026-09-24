/**
 * The city's cars as instanced packs (docs/DESIGN.md §13.11, M5.5 slice 19).
 * A body's profile is lofted as the player's cars are (the same sections and
 * six-point ring) with the windows framed in paint, the pillars, lights,
 * grille, plate, bumpers, mirrors, dark arches, hubs and the profile's own
 * parts, in one geometry of a few hundred triangles. A `paintMask` attribute
 * marks what takes the instance's paint (1, in one of its three tones) and
 * what keeps its own colour (0): glass, lights, tyres and a truck's box never
 * tint. `paintMaskMaterial` mixes the instance colour in by that mask.
 *
 * Local frame as carMesh.ts: +Z forward, +Y up, +X left; heights above the
 * ground (the traffic's body origin is on the road).
 */
import * as THREE from 'three';
import { PALETTE, type VehicleTuning } from '../../sim';
import type { CarProfile, Section } from './carMesh';

type V3 = { x: number; y: number; z: number };
/** The paint's tones as negative colours: the instance paint times 1, 0.72 or 1.13 (carMesh.ts's three). */
const PAINT = -1, DARK = -2, LIGHT = -3;
const TONES = [1, 0.72, 1.13];
const GLASS = 0x294653, HEADLIGHT = 0xffefca, TAILLIGHT = 0xba2338, PLATE = 0xeee2bd;
const WHEEL_SEGMENTS = 10;
const ARCH_SEGMENTS = 8;

/** The traffic's shared material: flat, vertex colours, the instance's paint where the mask says so. */
export function paintMaskMaterial(): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const chunk = THREE.ShaderChunk.color_vertex.replace('vColor.rgb *= instanceColor.rgb;', 'vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, paintMask );');
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float paintMask;\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <color_vertex>', `${chunk}\nvFade = aFade;`);
    // a car in the camera's way through a screen door (M8.6 D9, render/fade.ts): a 4×4 ordered pattern keeps `vFade`
    // of its pixels and discards the rest; no blending, so no sorting and no extra draw call
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vFade;\n${SCREEN_DOOR}`)
      .replace('void main() {', 'void main() {\n  if ( vFade < 0.999 && vFade <= screenDoor() ) discard;');
  };
  material.customProgramCacheKey = () => 'traffic-paint-mask-fade';
  return material;
}

/** The 4×4 Bayer threshold under this fragment, in (0, 1). */
const SCREEN_DOOR = `
const float BAYER[16] = float[16]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
float screenDoor() {
  int x = int( mod( gl_FragCoord.x, 4.0 ) );
  int y = int( mod( gl_FragCoord.y, 4.0 ) );
  return ( BAYER[ x + y * 4 ] + 0.5 ) / 16.0;
}`;

export function buildBodyGeometry(profile: CarProfile, t: VehicleTuning): THREE.BufferGeometry {
  const b = new Builder();
  const S = profile.sections;
  const last = S.length - 1;
  const nose = S[0] as Section, tail = S[last] as Section;
  const fixed = profile.fixed;
  const colorOf = (i: number): number => fixed && i >= fixed.from && i < fixed.to ? fixed.color : PAINT;
  const glassSide = (i: number): boolean => i === profile.aPillar || (i >= profile.glassSides[0] && i < profile.glassSides[1]);
  const P = (x: number, y: number, z: number): V3 => ({ x, y, z });

  // the loft: two sides a segment (below and above the belt), the top and the floor
  for (let i = 0; i < last; i++) {
    const a = S[i] as Section, c = S[i + 1] as Section;
    const color = colorOf(i);
    for (const side of [-1, 1]) {
      const out = P(side, 0, 0);
      b.quad([P(side * a.hwFloor, a.floor, a.z), P(side * c.hwFloor, c.floor, c.z), P(side * c.hwBelt, c.belt, c.z), P(side * a.hwBelt, a.belt, a.z)], out, color);
      const upper = [P(side * a.hwBelt, a.belt, a.z), P(side * c.hwBelt, c.belt, c.z), P(side * c.hwRoof, c.roof, c.z), P(side * a.hwRoof, a.roof, a.z)] as const;
      b.quad(upper, out, color);
      if (glassSide(i)) b.inset(upper, out, i === profile.aPillar ? 0.12 : 0.07, profile.windowMargins?.bottom ?? 0.06, GLASS, profile.windowMargins?.top ?? 0.06);
    }
    const out = P(0, 1, Math.sign(c.roof - a.roof));
    const top = [P(a.hwRoof, a.roof, a.z), P(c.hwRoof, c.roof, c.z), P(-c.hwRoof, c.roof, c.z), P(-a.hwRoof, a.roof, a.z)] as const;
    const glassTop = profile.glassTops.includes(i);
    b.quad(top, out, profile.darkTops?.includes(i) ? PALETTE.charcoal : color);
    if (glassTop) b.inset(top, out, 0.08, 0.07, GLASS);
    b.quad([P(a.hwFloor, a.floor, a.z), P(c.hwFloor, c.floor, c.z), P(-c.hwFloor, c.floor, c.z), P(-a.hwFloor, a.floor, a.z)], P(0, -1, 0), PALETTE.charcoal);
  }

  // the caps: the nose in the paint, the tail's lower half in its dark tone (a fixed tail keeps its colour)
  for (const front of [true, false]) {
    const s = front ? nose : tail, dir = front ? 1 : -1, out = P(0, 0, dir);
    const color = colorOf(front ? 0 : last - 1);
    const lowColor = color === PAINT && !front ? DARK : color;
    b.quad([P(-s.hwFloor, s.floor, s.z), P(s.hwFloor, s.floor, s.z), P(s.hwBelt, s.belt, s.z), P(-s.hwBelt, s.belt, s.z)], out, lowColor);
    b.quad([P(-s.hwBelt, s.belt, s.z), P(s.hwBelt, s.belt, s.z), P(s.hwRoof, s.roof, s.z), P(-s.hwRoof, s.roof, s.z)], out, color);
    const zAt = (off: number) => s.z + dir * off;
    const halfAt = (y: number) => s.hwFloor + (s.hwBelt - s.hwFloor) * Math.min(1, Math.max(0, (y - s.floor) / (s.belt - s.floor)));
    // the bumper band across the bottom of the cap
    const by = s.floor + profile.bumperHeight;
    b.quad([P(-s.hwFloor, s.floor, zAt(0.006)), P(s.hwFloor, s.floor, zAt(0.006)), P(halfAt(by), by, zAt(0.006)), P(-halfAt(by), by, zAt(0.006))], out, PALETTE.charcoal);
    const lamp = front ? profile.headlight : profile.taillight;
    for (const side of [-1, 1]) {
      const cx = side * (s.hwBelt - lamp.inset);
      b.rectZ(cx, lamp.y, lamp.width + 0.05, lamp.height + 0.06, zAt(0.01), out, front ? PALETTE.charcoal : PALETTE.ink);
      b.rectZ(cx, lamp.y, lamp.width, lamp.height, zAt(0.014), out, front ? (profile.lampsOff ? PALETTE.graphite : HEADLIGHT) : TAILLIGHT);
    }
    if (front && profile.grille) {
      const g = profile.grille;
      b.rectZ(0, g.y, g.width, g.height, zAt(0.01), out, PALETTE.ink);
    }
    if (!front) {
      const plateY = s.floor + profile.bumperHeight + 0.085;
      b.rectZ(0, plateY, 0.44, 0.12, zAt(0.014), out, PLATE);
    }
    // the bumper itself, proud of the cap
    b.box(s.hwFloor * 1.98, profile.wheelStyle === 'heavy' ? 0.12 : 0.075, 0.11, PALETTE.charcoal, 0, s.floor + 0.06, s.z);
  }

  // pillars across the side glass
  const at = (z: number): Section => sectionAt(S, z);
  for (const z of profile.pillars) {
    const i = segmentAt(S, z);
    if (i < 0 || !glassSide(i)) continue;
    for (const side of [-1, 1]) {
      const za = z + 0.05, zb = z - 0.05, sa = at(za), sb = at(zb);
      b.quad([P(side * (sa.hwBelt + 0.012), sa.belt, za), P(side * (sb.hwBelt + 0.012), sb.belt, zb), P(side * (sb.hwRoof + 0.012), sb.roof, zb), P(side * (sa.hwRoof + 0.012), sa.roof, za)], P(side, 0, 0), PAINT);
    }
  }

  // mirrors at the windscreen's foot
  if (profile.mirrors) {
    const s = S[Math.max(0, profile.aPillar)] as Section;
    for (const side of [-1, 1]) b.box(0.18, 0.1, 0.13, DARK, side * (s.hwBelt + 0.13), s.belt + 0.12, s.z - 0.14);
  }

  // wheels: tyres, hubs, and the dark arch round each on the flank
  const heavy = profile.wheelStyle === 'heavy';
  const hb = t.wheelBase / 2, ht = t.trackWidth / 2, r = t.wheelRadius, w = t.wheelWidth;
  const archR = r + (heavy ? 0.1 : 0.085);
  for (const z of [hb, -hb]) {
    for (const side of [-1, 1]) {
      b.cylinderX(side * ht, r, z, r, w, WHEEL_SEGMENTS, PALETTE.rubber);
      b.disc(side * (ht + w / 2 + 0.004), r, z, r * 0.55, side, PALETTE.rim);
      const centre = P(0, Math.max(r, at(z).floor), z);
      const rim: V3[] = [];
      for (let k = 0; k <= ARCH_SEGMENTS; k++) {
        const angle = (k / ARCH_SEGMENTS) * Math.PI;
        const pz = z + Math.cos(angle) * archR;
        const s = at(pz);
        const py = Math.max(s.floor, r + Math.sin(angle) * archR);
        rim.push(P(side * (flankAt(s, py) + 0.007), py, pz));
      }
      centre.x = side * (flankAt(at(z), centre.y) + 0.007);
      for (let k = 0; k < ARCH_SEGMENTS; k++) b.tri(centre, rim[k] as V3, rim[k + 1] as V3, P(side, 0, 0), PALETTE.charcoal);
    }
  }

  for (const p of profile.parts ?? []) {
    const color = p.color === 'paint' ? PAINT : p.color === 'dark' ? DARK : p.color === 'light' ? LIGHT : p.color;
    for (const side of p.mirror ? [1, -1] : [1]) b.box(p.size[0], p.size[1], p.size[2], color, side * p.at[0], p.at[1], p.at[2]);
  }
  return b.geometry();
}

/** The body's half width on the flank at height y (below the belt on the lower panel, above it on the upper). */
function flankAt(s: Section, y: number): number {
  if (y <= s.belt) return s.hwFloor + (s.hwBelt - s.hwFloor) * Math.min(1, Math.max(0, (y - s.floor) / (s.belt - s.floor)));
  return s.hwBelt + (s.hwRoof - s.hwBelt) * Math.min(1, Math.max(0, (y - s.belt) / Math.max(1e-6, s.roof - s.belt)));
}

function segmentAt(S: readonly Section[], z: number): number {
  for (let i = 0; i < S.length - 1; i++) if (z <= (S[i] as Section).z && z >= (S[i + 1] as Section).z) return i;
  return -1;
}

function sectionAt(S: readonly Section[], z: number): Section {
  const i = segmentAt(S, z);
  if (i < 0) return (z > (S[0] as Section).z ? S[0] : S[S.length - 1]) as Section;
  const a = S[i] as Section, c = S[i + 1] as Section;
  const f = a.z === c.z ? 0 : (z - a.z) / (c.z - a.z);
  return {
    z, floor: a.floor + (c.floor - a.floor) * f, belt: a.belt + (c.belt - a.belt) * f, roof: a.roof + (c.roof - a.roof) * f,
    hwFloor: a.hwFloor + (c.hwFloor - a.hwFloor) * f, hwBelt: a.hwBelt + (c.hwBelt - a.hwBelt) * f, hwRoof: a.hwRoof + (c.hwRoof - a.hwRoof) * f,
  };
}

class Builder {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly col: number[] = [];
  private readonly mask: number[] = [];
  private readonly rgb = new THREE.Color();

  /** A triangle facing `out` (flipped when its winding faces in). */
  tri(a: V3, b: V3, c: V3, out: V3, color: number): void {
    let nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
    let ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    let nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    nx /= len; ny /= len; nz /= len;
    const flip = nx * out.x + ny * out.y + nz * out.z < 0;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const painted = color < 0;
    if (painted) {
      const k = TONES[-color - 1] as number;
      this.rgb.setRGB(k, k, k);
    } else {
      this.rgb.setHex(color);
    }
    for (const p of flip ? [a, c, b] : [a, b, c]) {
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(nx, ny, nz);
      this.col.push(this.rgb.r, this.rgb.g, this.rgb.b);
      this.mask.push(painted ? 1 : 0);
    }
  }

  quad(q: readonly [V3, V3, V3, V3] | readonly V3[], out: V3, color: number): void {
    this.tri(q[0], q[1], q[2], out, color);
    this.tri(q[0], q[2], q[3], out, color);
  }

  /**
   * A panel inset into a quad (corners: start-low, end-low, end-high, start-high), `along` metres in from
   * the ends, `up` metres from the low edge and `top` from the high one, lifted off it: a window framed by the paint.
   */
  inset(q: readonly V3[], out: V3, along: number, up: number, color: number, top = up): void {
    const [c0, c1, c2, c3] = q as [V3, V3, V3, V3];
    const length = Math.hypot(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z);
    const height = Math.hypot(c3.x - c0.x, c3.y - c0.y, c3.z - c0.z);
    if (length < 0.12 || height < 0.12) return;
    const u0 = Math.min(0.4, along / length), v0 = Math.min(0.35, up / height), v1 = Math.min(0.35, top / height);
    const lerp = (p: V3, q2: V3, f: number): V3 => ({ x: p.x + (q2.x - p.x) * f, y: p.y + (q2.y - p.y) * f, z: p.z + (q2.z - p.z) * f });
    const pt = (u: number, v: number): V3 => lerp(lerp(c0, c1, u), lerp(c3, c2, u), v);
    const corners = [pt(u0, v0), pt(1 - u0, v0), pt(1 - u0, 1 - v1), pt(u0, 1 - v1)];
    // lift along the panel's own normal, toward `out`
    const ex = c1.x - c0.x, ey = c1.y - c0.y, ez = c1.z - c0.z, fx = c3.x - c0.x, fy = c3.y - c0.y, fz = c3.z - c0.z;
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const len = Math.hypot(nx, ny, nz) || 1;
    const sign = nx * out.x + ny * out.y + nz * out.z < 0 ? -1 : 1;
    nx *= (sign * 0.006) / len; ny *= (sign * 0.006) / len; nz *= (sign * 0.006) / len;
    this.quad(corners.map((p) => ({ x: p.x + nx, y: p.y + ny, z: p.z + nz })), out, color);
  }

  /** An upright rectangle on a cap (the plane z = const), centred at (cx, cy). */
  rectZ(cx: number, cy: number, width: number, height: number, z: number, out: V3, color: number): void {
    const x0 = cx - width / 2, x1 = cx + width / 2, y0 = cy - height / 2, y1 = cy + height / 2;
    this.quad([{ x: x0, y: y0, z }, { x: x1, y: y0, z }, { x: x1, y: y1, z }, { x: x0, y: y1, z }], out, color);
  }

  box(w: number, h: number, d: number, color: number, cx: number, cy: number, cz: number): void {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
    this.quad([v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), v(x1, y0, z1)], v(1, 0, 0), color);
    this.quad([v(x0, y0, z0), v(x0, y1, z0), v(x0, y1, z1), v(x0, y0, z1)], v(-1, 0, 0), color);
    this.quad([v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1)], v(0, 1, 0), color);
    this.quad([v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1)], v(0, -1, 0), color);
    this.quad([v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)], v(0, 0, 1), color);
    this.quad([v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0)], v(0, 0, -1), color);
  }

  /** A tyre along X: the tread and both faces. */
  cylinderX(cx: number, cy: number, cz: number, radius: number, width: number, segments: number, color: number): void {
    const hx = width / 2;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
      const y0 = cy + Math.cos(a0) * radius, z0 = cz + Math.sin(a0) * radius, y1 = cy + Math.cos(a1) * radius, z1 = cz + Math.sin(a1) * radius;
      const mid = { x: 0, y: (Math.cos(a0) + Math.cos(a1)) / 2, z: (Math.sin(a0) + Math.sin(a1)) / 2 };
      this.quad([{ x: cx - hx, y: y0, z: z0 }, { x: cx - hx, y: y1, z: z1 }, { x: cx + hx, y: y1, z: z1 }, { x: cx + hx, y: y0, z: z0 }], mid, color);
      this.tri({ x: cx + hx, y: cy, z: cz }, { x: cx + hx, y: y0, z: z0 }, { x: cx + hx, y: y1, z: z1 }, { x: 1, y: 0, z: 0 }, color);
      this.tri({ x: cx - hx, y: cy, z: cz }, { x: cx - hx, y: y0, z: z0 }, { x: cx - hx, y: y1, z: z1 }, { x: -1, y: 0, z: 0 }, color);
    }
  }

  /** A hub disc facing ±X. */
  disc(x: number, cy: number, cz: number, radius: number, side: number, color: number): void {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      this.tri({ x, y: cy, z: cz }, { x, y: cy + Math.cos(a0) * radius, z: cz + Math.sin(a0) * radius }, { x, y: cy + Math.cos(a1) * radius, z: cz + Math.sin(a1) * radius }, { x: side, y: 0, z: 0 }, color);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('paintMask', new THREE.BufferAttribute(new Float32Array(this.mask), 1));
    g.computeBoundingSphere();
    return g;
  }
}
