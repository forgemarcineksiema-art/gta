/**
 * Low-poly traffic cars: a loft through the class profile, closed caps, and
 * four wheel cylinders. No arches or decals. Paintable vertices are white so
 * the instance colour supplies the paint; glass and tyres keep their own colour
 * and stay dark under that multiply.
 */
import * as THREE from 'three';
import { PALETTE, type VehicleTuning } from '../../sim';
import type { CarProfile, Section } from './carMesh';

const PAINT = -1;
const WHEEL_SEGMENTS = 10;

export function buildTrafficGeometry(profile: CarProfile, tuning: VehicleTuning): THREE.BufferGeometry {
  const b = new Builder();
  const sections = profile.sections;
  const rings: Ring[] = [];
  for (let i = 0; i < sections.length; i++) rings.push(ringOf(sections[i] as Section));
  for (let i = 0; i + 1 < rings.length; i++) {
    const a = rings[i] as Ring;
    const c = rings[i + 1] as Ring;
    for (let k = 0; k < 6; k++) {
      const glass = k === 1 || k === 3;
      const color = glass ? PALETTE.glassDark : PAINT;
      const inside = { x: 0, y: 0.8, z: ((a[0] as V3).z + (c[0] as V3).z) * 0.5 };
      b.triOut(a[k] as V3, a[(k + 1) % 6] as V3, c[(k + 1) % 6] as V3, inside, color);
      b.triOut(a[k] as V3, c[(k + 1) % 6] as V3, c[k] as V3, inside, color);
    }
  }
  cap(b, rings[0] as Ring, true);
  cap(b, rings[rings.length - 1] as Ring, false);
  const hb = tuning.wheelBase * 0.5;
  const ht = tuning.trackWidth * 0.5;
  const y = tuning.wheelRadius;
  const wheels: Array<[number, number]> = [[-ht, hb], [ht, hb], [-ht, -hb], [ht, -hb]];
  for (let i = 0; i < wheels.length; i++) {
    const w = wheels[i] as [number, number];
    b.cylinderX(w[0], y, w[1], tuning.wheelRadius, tuning.wheelWidth, WHEEL_SEGMENTS, PALETTE.rubber);
  }
  return b.geometry();
}

type V3 = { x: number; y: number; z: number };
type Ring = V3[];

function ringOf(s: Section): Ring {
  return [
    { x: -s.hwFloor, y: s.floor, z: s.z },
    { x: -s.hwBelt, y: s.belt, z: s.z },
    { x: -s.hwRoof, y: s.roof, z: s.z },
    { x: s.hwRoof, y: s.roof, z: s.z },
    { x: s.hwBelt, y: s.belt, z: s.z },
    { x: s.hwFloor, y: s.floor, z: s.z },
  ];
}

/** Close a ring. The nose points +Z, the tail -Z; faces are flipped to point outward. */
function cap(b: Builder, ring: Ring, nose: boolean): void {
  const c = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i] as V3;
    c.x += p.x; c.y += p.y; c.z += p.z;
  }
  c.x /= ring.length; c.y /= ring.length; c.z /= ring.length;
  const inside = { x: 0, y: 0.8, z: nose ? -1 : 1 };
  for (let i = 0; i < ring.length; i++) {
    b.triOut(c, ring[i] as V3, ring[(i + 1) % ring.length] as V3, inside, PAINT);
  }
}

class Builder {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly col: number[] = [];
  private readonly rgb = new THREE.Color();

  triOut(a: V3, b: V3, c: V3, inside: V3, color: number): void {
    const nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
    const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    const nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const mx = (a.x + b.x + c.x) / 3 - inside.x;
    const my = (a.y + b.y + c.y) / 3 - inside.y;
    const mz = (a.z + b.z + c.z) / 3 - inside.z;
    if (nx * mx + ny * my + nz * mz < 0) this.tri(a, c, b, color);
    else this.tri(a, b, c, color);
  }

  tri(a: V3, b: V3, c: V3, color: number): void {
    let nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
    let ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    let nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    if (color < 0) this.rgb.setRGB(1, 1, 1);
    else this.rgb.setHex(color);
    this.push(a, nx, ny, nz);
    this.push(b, nx, ny, nz);
    this.push(c, nx, ny, nz);
  }

  cylinderX(cx: number, cy: number, cz: number, radius: number, width: number, segments: number, color: number): void {
    const hx = width * 0.5;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const y0 = cy + Math.cos(a0) * radius;
      const z0 = cz + Math.sin(a0) * radius;
      const y1 = cy + Math.cos(a1) * radius;
      const z1 = cz + Math.sin(a1) * radius;
      const p0 = { x: cx - hx, y: y0, z: z0 };
      const p1 = { x: cx - hx, y: y1, z: z1 };
      const p2 = { x: cx + hx, y: y1, z: z1 };
      const p3 = { x: cx + hx, y: y0, z: z0 };
      const hub = { x: cx, y: cy, z: cz };
      this.triOut(p0, p1, p2, hub, color);
      this.triOut(p0, p2, p3, hub, color);
      this.triOut({ x: cx - hx, y: cy, z: cz }, p1, p0, hub, color);
      this.triOut({ x: cx + hx, y: cy, z: cz }, p3, p2, hub, color);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    return g;
  }

  private push(p: V3, nx: number, ny: number, nz: number): void {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(nx, ny, nz);
    this.col.push(this.rgb.r, this.rgb.g, this.rgb.b);
  }
}
