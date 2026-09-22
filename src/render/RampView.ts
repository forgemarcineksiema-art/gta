/**
 * The stunt ramps (docs/STYLE.md, ramps): each drawn from the sim's own
 * `rampProfile`, so the wheels meet the surface the slabs give them: `ramp`
 * red faces, a `barrier` white lip along the ridge, sides down to the grass.
 * Twenty ramps in one merged mesh, built once. Reads sim state only.
 */
import * as THREE from 'three';
import { PALETTE, type JumpDesc, type SimWorld } from '../sim';
import { RAMP_HALF_WIDTH, rampProfile } from '../sim/city/jumps';

export class RampView {
  private readonly mesh: THREE.Mesh;

  constructor(scene: THREE.Scene, sim: SimWorld) {
    const pos: number[] = [], col: number[] = [];
    for (const jd of sim.jumps?.descs ?? []) ramp(jd, pos, col);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    // both sides: the faces are wound by hand and flat shading takes its normal from the face seen
    this.mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

function ramp(jd: JumpDesc, pos: number[], col: number[]): void {
  const fx = Math.sin(jd.yaw), fz = Math.cos(jd.yaw);
  // right of the heading is (-fz, fx)
  const rx = -fz, rz = fx, w = RAMP_HALF_WIDTH;
  const at = (along: number, across: number, y: number): [number, number, number] =>
    [jd.x + fx * along + rx * across, y, jd.z + fz * along + rz * across];
  const red = new THREE.Color(PALETTE.ramp), white = new THREE.Color(PALETTE.barrier);
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number], colour: THREE.Color): void => {
    pos.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) col.push(colour.r, colour.g, colour.b);
  };
  const profile = rampProfile(jd);
  for (let k = 0; k + 1 < profile.length; k++) {
    const a = profile[k] as { along: number; y: number }, b = profile[k + 1] as { along: number; y: number };
    // the top
    const al = at(a.along, -w, a.y), ar = at(a.along, w, a.y), bl = at(b.along, -w, b.y), br = at(b.along, w, b.y);
    tri(al, bl, br, red);
    tri(al, br, ar, red);
    // the two sides, down to the ground
    tri(at(a.along, -w, 0), bl, al, red);
    tri(at(a.along, -w, 0), at(b.along, -w, 0), bl, red);
    tri(at(a.along, w, 0), ar, br, red);
    tri(at(a.along, w, 0), br, at(b.along, w, 0), red);
  }
  // the lip: a white band just over the ridge, facing back at the driver
  const ridge = profile[profile.length - 2] as { along: number; y: number };
  const l0 = at(ridge.along - 0.02, -w, ridge.y - 0.18), r0 = at(ridge.along - 0.02, w, ridge.y - 0.18);
  const l1 = at(ridge.along - 0.02, -w, ridge.y + 0.02), r1 = at(ridge.along - 0.02, w, ridge.y + 0.02);
  tri(l0, r0, r1, white);
  tri(l0, r1, l1, white);
}
