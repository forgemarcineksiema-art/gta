/**
 * The sky, the fog and the light (docs/STYLE.md: late golden hour): a vertex-coloured dome that rides with the
 * camera so the horizon never comes closer, a hemisphere fill, and the sun whose one shadow map follows the car on
 * a texel grid (shadows.ts). The quality tier sets the fog's reach and the shadow map's size.
 */
import * as THREE from 'three';
import { PALETTE } from '../sim';
import { SHADOW_HALF, SUN_OFFSET, stableShadowTarget } from './shadows';

export class Sky {
  readonly sun: THREE.DirectionalLight;
  private readonly dome: THREE.Mesh;
  private readonly shadowTarget = new THREE.Object3D();
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {
    scene.background = new THREE.Color(PALETTE.skyHorizon);
    scene.fog = new THREE.Fog(PALETTE.fog, 120, 700);
    const hemi = new THREE.HemisphereLight(0xe5e4f4, 0x777184, 1.35);
    scene.add(hemi);
    this.sun = new THREE.DirectionalLight(PALETTE.sun, 1.8);
    this.sun.position.set(-60, 70, -40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 700;
    const s = SHADOW_HALF;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.18;
    this.sun.shadow.intensity = 0.72;
    this.sun.target = this.shadowTarget;
    scene.add(this.sun, this.shadowTarget);
    this.dome = buildSkyDome();
    scene.add(this.dome);
  }

  /** The fog's reach and the shadow map's size for a quality tier. */
  setTier(q: { readonly near: number; readonly far: number; readonly shadow: number }): void {
    this.scene.fog = new THREE.Fog(PALETTE.fog, q.near, q.far);
    this.sun.shadow.mapSize.set(q.shadow, q.shadow);
    this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
  }

  update(car: THREE.Vector3, eye: THREE.Vector3): void {
    // Fixed coverage and a texel-aligned light basis avoid speed-dependent shadow jumps.
    stableShadowTarget(car, this.sun.shadow.mapSize.x, this.tmp);
    this.shadowTarget.position.copy(this.tmp);
    this.sun.position.copy(this.tmp).add(SUN_OFFSET);
    // the sky dome rides with the camera so the horizon never comes closer
    this.dome.position.copy(eye);
  }
}

/** A large inverted sphere with a vertex-colour gradient: sky for free. */
function buildSkyDome(): THREE.Mesh {
  const g = new THREE.SphereGeometry(850, 24, 12);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(PALETTE.skyTop);
  const horizon = new THREE.Color(PALETTE.skyHorizon);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 850;
    const t = Math.pow(Math.max(0, y), 0.55);
    c.copy(horizon).lerp(top, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
