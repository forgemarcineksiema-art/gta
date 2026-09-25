/**
 * The sky, the fog and the light (docs/STYLE.md; docs/M8.9_PLAN.md R8–R9, the golden hour): a vertex-coloured dome in
 * three stops that rides with the camera so the horizon never comes closer, a hemisphere fill, and a low warm sun whose
 * one shadow map follows the car on a texel grid (shadows.ts). The quality tier sets the fog's reach and the shadow
 * map's size.
 *
 * The golden hour (M8.9 slice 2): the sun low (32°, `SUN_OFFSET`), warm and strong; the fill a lavender sky over a warm
 * ground's bounce, so a sunlit face glows warm and a shaded one goes violet; the sky hot peach at the horizon, rose a
 * few degrees up and deep violet from 15° up, so the frame's top, where the HUD's words sit, is dark enough to read
 * them; the fog and the background are the horizon's colour, so the far city dissolves into it.
 *
 * The sun as seen and the clouds (slice 4): the sun's disc and halo on the light's bearing, low in the warm band (the
 * light itself stands higher, so the streets are not all in shade), the dome warmer on the sun's side, and a dozen flat
 * clouds lit orange from below in the sun's half of the sky. All ride with the camera; two draws.
 */
import * as THREE from 'three';
import { PALETTE, mulberry32 } from '../sim';
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
  /** The dome's warmth toward the sun: its colour, strength, how tight (a cosine's power) and how high it fades (°). */
  glow: { color: 0xffcf9a, strength: 0.6, power: 5, fade: 40 },
} as const;

/** The sun as seen: on the light's bearing, `elevation`° up, its disc and halo `distance` m out (m). */
export const SUN_DISC = { elevation: 9, distance: 800, radius: 24, halo: 130 } as const;

/** The clouds: how many, how far (m), how far each side of the sun's bearing (°), between which elevations (°). */
export const CLOUDS = { count: 12, distance: 700, spread: 80, low: 8, high: 25, seed: 0x5c1d } as const;

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

/** The light's bearing about the vertical (radians; 0 is +Z). */
export function sunBearing(): number {
  return Math.atan2(SUN_OFFSET.x, SUN_OFFSET.z);
}

/** A unit direction at a bearing (radians) and an elevation (degrees). */
function direction(bearing: number, elevation: number, out: THREE.Vector3): THREE.Vector3 {
  const e = THREE.MathUtils.degToRad(elevation);
  return out.set(Math.sin(bearing) * Math.cos(e), Math.sin(e), Math.cos(bearing) * Math.cos(e));
}

/** Where the sun is seen from the camera: the light's bearing, `SUN_DISC.elevation` up. */
export function sunDiscDirection(out: THREE.Vector3): THREE.Vector3 {
  return direction(sunBearing(), SUN_DISC.elevation, out);
}

export interface CloudPlace { bearing: number; elevation: number; width: number; height: number }

/** The clouds' places: seeded, the same sky every time, in the sun's half and between `CLOUDS.low` and `CLOUDS.high`. */
export function cloudLayout(): CloudPlace[] {
  const rnd = mulberry32(CLOUDS.seed), out: CloudPlace[] = [];
  const spread = THREE.MathUtils.degToRad(CLOUDS.spread);
  for (let i = 0; i < CLOUDS.count; i++) {
    // spread evenly across the arc, jittered, so they never pile up
    const slot = (i + 0.2 + rnd() * 0.6) / CLOUDS.count;
    out.push({
      bearing: sunBearing() + (slot * 2 - 1) * spread,
      elevation: CLOUDS.low + rnd() * (CLOUDS.high - CLOUDS.low),
      width: 90 + rnd() * 110,
      height: 12 + rnd() * 12,
    });
  }
  return out;
}

export class Sky {
  readonly sun: THREE.DirectionalLight;
  private readonly dome: THREE.Mesh;
  private readonly disc: THREE.Mesh;
  private readonly clouds: THREE.Mesh;
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
    this.disc = buildSunDisc();
    this.clouds = buildClouds();
    scene.add(this.dome, this.clouds, this.disc);
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
    // the sky rides with the camera so the horizon, the sun and the clouds never come closer
    this.dome.position.copy(eye);
    this.disc.position.copy(eye);
    this.clouds.position.copy(eye);
  }
}

/** The dome's radius (m) and its rings: 5° apart, so each stop sits on a ring. */
const DOME_RADIUS = 850;
const DOME_RINGS = 36;

/** A large inverted sphere with a vertex-colour gradient in three stops, warmer toward the sun: sky for free. */
function buildSkyDome(): THREE.Mesh {
  const g = new THREE.SphereGeometry(DOME_RADIUS, 48, DOME_RINGS);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), glow = new THREE.Color(SKY.glow.color);
  const sun = sunDiscDirection(new THREE.Vector3()), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).divideScalar(DOME_RADIUS);
    const elevation = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(v.y, -1, 1)));
    skyColorAt(elevation, c);
    const toward = Math.max(0, v.dot(sun)) ** SKY.glow.power;
    const low = 1 - THREE.MathUtils.clamp(elevation / SKY.glow.fade, 0, 1);
    c.lerp(glow, SKY.glow.strength * toward * low);
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

/** The sun's disc and its halo: a fan and a ring facing the camera, added to the sky, fading to nothing at the halo's edge. */
function buildSunDisc(): THREE.Mesh {
  const n = 32, positions: number[] = [], colors: number[] = [];
  const dir = sunDiscDirection(new THREE.Vector3());
  const centre = dir.clone().multiplyScalar(SUN_DISC.distance);
  const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize(), up = dir.clone().cross(right).normalize();
  const core = new THREE.Color(0xfff4d6), rim = new THREE.Color(0xffd08a), haloIn = new THREE.Color(0x8a4a2a), black = new THREE.Color(0, 0, 0);
  const at = (r: number, k: number, out: THREE.Vector3): THREE.Vector3 => {
    const t = (k / n) * Math.PI * 2;
    return out.copy(centre).addScaledVector(right, Math.cos(t) * r).addScaledVector(up, Math.sin(t) * r);
  };
  const push = (p: THREE.Vector3, col: THREE.Color): void => { positions.push(p.x, p.y, p.z); colors.push(col.r, col.g, col.b); };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), a2 = new THREE.Vector3(), b2 = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    // the disc: a fan from its core
    push(centre, core); push(at(SUN_DISC.radius, k, a), rim); push(at(SUN_DISC.radius, k + 1, b), rim);
    // the halo: a ring from the disc's edge out to nothing
    at(SUN_DISC.radius, k, a); at(SUN_DISC.radius, k + 1, b); at(SUN_DISC.halo, k, a2); at(SUN_DISC.halo, k + 1, b2);
    push(a, haloIn); push(a2, black); push(b2, black);
    push(a, haloIn); push(b2, black); push(b, haloIn);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
  }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -8;
  return mesh;
}

/** The clouds: flat octagons facing the camera, warm on their underside, violet on top; one mesh. */
function buildClouds(): THREE.Mesh {
  const positions: number[] = [], colors: number[] = [];
  const under = new THREE.Color(0xffa98a), top = new THREE.Color(0x6e5f9e), mid = new THREE.Color();
  const d = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Vector3();
  const sides = 8;
  for (const cloud of cloudLayout()) {
    direction(cloud.bearing, cloud.elevation, d);
    c.copy(d).multiplyScalar(CLOUDS.distance);
    right.set(0, 1, 0).cross(d).normalize();
    up.copy(d).cross(right).normalize();
    mid.copy(under).lerp(top, 0.45);
    const ring = (k: number): [THREE.Vector3, THREE.Color] => {
      const t = (k / sides) * Math.PI * 2;
      const sy = Math.sin(t);
      p.copy(c).addScaledVector(right, Math.cos(t) * cloud.width / 2).addScaledVector(up, sy * cloud.height / 2);
      return [p.clone(), under.clone().lerp(top, (sy + 1) / 2)];
    };
    for (let k = 0; k < sides; k++) {
      const [pa, ca] = ring(k), [pb, cb] = ring(k + 1);
      positions.push(c.x, c.y, c.z, pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
      colors.push(mid.r, mid.g, mid.b, ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -9;
  return mesh;
}
