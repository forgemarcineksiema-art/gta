/**
 * The sky, the fog and the light (docs/STYLE.md; docs/M8.9_PLAN.md R8, the golden hour): a vertex-coloured dome in
 * three stops that rides with the camera so the horizon never comes closer, a hemisphere fill, and a low warm sun whose
 * one shadow map follows the car on a texel grid (shadows.ts). The quality tier sets the fog's reach and the shadow
 * map's size.
 *
 * The golden hour (M8.9 slice 2): the sun low (about 25°, `SUN_OFFSET`), warm and strong; the fill weak, a cool violet
 * sky over a warm ground's bounce, so a sunlit face glows warm and a shaded one goes violet; the sky hot peach at the
 * horizon, rose a few degrees up and deep violet from 15° up, so the frame's top, where the HUD's words sit, is dark
 * enough to read them; the fog and the background are the horizon's colour, so the far city dissolves into it.
 */
import * as THREE from 'three';
import { PALETTE } from '../sim';
import { SHADOW_HALF, SUN_OFFSET, stableShadowTarget } from './shadows';

/** The light and the sky's stops (colours from the palette; elevations in degrees over the horizon). */
export const SKY = {
  sun: { color: PALETTE.sun, intensity: 2.4 },
  fill: { sky: 0xa8a4ec, ground: 0xb08a6c, intensity: 1.5 },
  shadow: 0.85,
  stops: [
    { at: 0, color: PALETTE.skyHorizon },
    { at: 5, color: PALETTE.skyMid },
    { at: 15, color: PALETTE.skyTop },
  ],
} as const;

const stopColors = SKY.stops.map((s) => new THREE.Color(s.color));

/** The sky's colour at an elevation (degrees; the horizon's below it, the top's above the last stop). */
export function skyColorAt(elevation: number, out: THREE.Color): THREE.Color {
  const stops = SKY.stops;
  if (elevation <= (stops[0] as { at: number }).at) return out.copy(stopColors[0] as THREE.Color);
  for (let i = 1; i < stops.length; i++) {
    const hi = stops[i] as { at: number }, lo = stops[i - 1] as { at: number };
    if (elevation <= hi.at) return out.copy(stopColors[i - 1] as THREE.Color).lerp(stopColors[i] as THREE.Color, (elevation - lo.at) / (hi.at - lo.at));
  }
  return out.copy(stopColors[stops.length - 1] as THREE.Color);
}

export class Sky {
  readonly sun: THREE.DirectionalLight;
  private readonly dome: THREE.Mesh;
  private readonly shadowTarget = new THREE.Object3D();
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {
    scene.background = new THREE.Color(PALETTE.skyHorizon);
    scene.fog = new THREE.Fog(PALETTE.fog, 120, 700);
    const hemi = new THREE.HemisphereLight(SKY.fill.sky, SKY.fill.ground, SKY.fill.intensity);
    scene.add(hemi);
    this.sun = new THREE.DirectionalLight(SKY.sun.color, SKY.sun.intensity);
    this.sun.position.copy(SUN_OFFSET);
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
    this.sun.shadow.intensity = SKY.shadow;
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

/** The dome's radius (m) and its rings: 5° apart, so each stop sits on a ring. */
const DOME_RADIUS = 850;
const DOME_RINGS = 36;

/** A large inverted sphere with a vertex-colour gradient in three stops: sky for free. */
function buildSkyDome(): THREE.Mesh {
  const g = new THREE.SphereGeometry(DOME_RADIUS, 24, DOME_RINGS);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const elevation = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(pos.getY(i) / DOME_RADIUS, -1, 1)));
    skyColorAt(elevation, c);
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
