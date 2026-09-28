/**
 * The clouds (docs/M8.9_PLAN.md R13, slice 18): low-poly clouds in the world's style, each a few flattened icosahedra,
 * flat-shaded and lit per face. The sky's function lights a face by where it looks (`skyAt` of its normal: the tops the
 * sky's violet, the sides the horizon's rose and slate); the sun lights the faces turned to it, so the clouds away from
 * the sun show gold faces; a warm light from the haze below lights the undersides; toward the sun the light through the
 * thin rims burns on the faces at a grazing angle to the eye, round a darker body; toward the horizon the haze takes
 * them. Banks low round the whole horizon, thicker on the sun's side, and a few long streaks higher in its half.
 *
 * The clouds ride with the camera as the dome does and swing slowly to and fro about the vertical (the light follows
 * their world normals). They write depth to hide each other, then clear it after their draw, so the world, drawn after,
 * is never hidden by them: they are infinitely far. One draw.
 */
import * as THREE from 'three';
import { mulberry32 } from '../sim';
import { skyAt, skyDirection, skyGlsl, sunBearing, sunDiscDirection } from './sky';

/** The clouds: their layout (°, m), their light (colours sRGB hex) and their drift (°, s). */
export const CLOUDS = {
  seed: 0x5c1d,
  distance: [640, 780],
  /** Banks round the horizon: how many in the sun's half and in the other, their base's elevations, their widths (m). */
  banks: { sun: 8, away: 6, low: 3, high: 8, top: 12, width: [120, 250], puffs: [3, 6] },
  /**
   * Streaks in the sun's half: how many, how far each side of its bearing (°), their elevations, and their tone: the share
   * of the sky's and the haze's light they take (thin, they hold less; their rims toward the sun burn as the banks').
   */
  streaks: { count: 4, spread: 70, low: 13, high: 19, tone: 0.5 },
  /** Puffs wider than this (m) get the rounder icosahedron (80 faces, the rest 20). */
  round: 50,
  light: {
    /** How much of the sky's light a face takes, by where it looks. */
    ambient: 0.8,
    sun: { color: 0xffb47c, strength: 0.95 },
    under: { color: 0xff9c72, strength: 0.3 },
    /** The rims toward the sun: colour, strength, how grazing (a power of 1 − facing), how near the sun (a power of μ). */
    rim: { color: 0xffd9a0, strength: 1.6, graze: 3, near: 10 },
    /** The haze: the share of the sky's colour everywhere, and more under `top`° (up to `low` at the horizon). */
    haze: { base: 0.12, low: 0.55, top: 10 },
  },
  /** The drift: a swing of `swing`° each way about the vertical, once every `period` s. */
  drift: { swing: 12, period: 1200 },
} as const;

export interface Puff {
  /** The centre's place from the eye (m). */
  x: number; y: number; z: number;
  /** The half-extents along the bank's right, up and toward axes (m), and the frame's yaw (radians). */
  sx: number; sy: number; sz: number; yaw: number;
  kind: 'bank' | 'streak';
}

const range = (rnd: () => number, [a, b]: readonly [number, number]): number => a + rnd() * (b - a);

/** The clouds' puffs: seeded, the same sky every time. */
export function cloudPuffs(): Puff[] {
  const rnd = mulberry32(CLOUDS.seed), out: Puff[] = [], b = CLOUDS.banks, sun = sunBearing();
  const bank = (bearing: number): void => {
    const width = range(rnd, b.width), base = range(rnd, [b.low, b.high]), d = range(rnd, CLOUDS.distance);
    const k = b.puffs[0] + Math.floor(rnd() * (b.puffs[1] - b.puffs[0] + 1));
    const centre = skyDirection(bearing, base, new THREE.Vector3()).multiplyScalar(d);
    for (let i = 0; i < k; i++) {
      const t = k === 1 ? 0.5 : i / (k - 1), middle = 1 - Math.abs(2 * t - 1);
      const r = width * (0.16 + 0.12 * middle) * (0.85 + 0.3 * rnd());
      const along = (t - 0.5) * width * 0.8 + (rnd() - 0.5) * r * 0.4;
      const lift = r * 0.55 * 0.5 + r * 0.25 * middle;
      const deep = (rnd() - 0.5) * r * 0.6;
      out.push({
        x: centre.x + Math.cos(bearing) * along + Math.sin(bearing) * deep,
        y: centre.y + lift,
        z: centre.z - Math.sin(bearing) * along + Math.cos(bearing) * deep,
        sx: r * 1.15, sy: r * 0.55, sz: r * 0.9, yaw: bearing, kind: 'bank',
      });
    }
  };
  // the banks spread evenly round each half, jittered, so they never pile up
  for (let i = 0; i < b.sun; i++) bank(sun + ((i + 0.2 + rnd() * 0.6) / b.sun - 0.5) * Math.PI);
  for (let i = 0; i < b.away; i++) bank(sun + Math.PI + ((i + 0.2 + rnd() * 0.6) / b.away - 0.5) * Math.PI);
  const s = CLOUDS.streaks;
  for (let i = 0; i < s.count; i++) {
    const bearing = sun + (((i + 0.2 + rnd() * 0.6) / s.count) * 2 - 1) * THREE.MathUtils.degToRad(s.spread);
    const e = range(rnd, [s.low, s.high]), d = range(rnd, CLOUDS.distance);
    const centre = skyDirection(bearing, e, new THREE.Vector3()).multiplyScalar(d);
    const k = 2 + Math.floor(rnd() * 2);
    for (let j = 0; j < k; j++) {
      const r = 30 + rnd() * 15, along = (j - (k - 1) / 2) * r * 4.2;
      out.push({
        x: centre.x + Math.cos(bearing) * along, y: centre.y + (rnd() - 0.5) * r * 0.3, z: centre.z - Math.sin(bearing) * along,
        sx: r * 3.2, sy: r * 0.18, sz: r * 1.1, yaw: bearing, kind: 'streak',
      });
    }
  }
  return out;
}

/** The clouds' geometry: each puff an icosahedron scaled into its frame, every face with its own flat normal. */
export function cloudGeometry(puffs: readonly Puff[] = cloudPuffs()): THREE.BufferGeometry {
  const positions: number[] = [], normals: number[] = [], tones: number[] = [];
  const shapes = [new THREE.IcosahedronGeometry(1, 0), new THREE.IcosahedronGeometry(1, 1)];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
  for (const p of puffs) {
    const shape = shapes[Math.max(p.sx, p.sz) / (p.kind === 'bank' ? 1.15 : 3.2) > CLOUDS.round ? 1 : 0] as THREE.IcosahedronGeometry;
    const pos = shape.getAttribute('position');
    // the frame: right is square to the bearing on the ground, up is up, toward is the bearing
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    const place = (i: number, out: THREE.Vector3): THREE.Vector3 => {
      const lx = pos.getX(i) * p.sx, ly = pos.getY(i) * p.sy, lz = pos.getZ(i) * p.sz;
      return out.set(p.x + cy * lx + sy * lz, p.y + ly, p.z - sy * lx + cy * lz);
    };
    for (let i = 0; i < pos.count; i += 3) {
      place(i, a); place(i + 1, b); place(i + 2, c);
      n.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      for (let k = 0; k < 3; k++) { normals.push(n.x, n.y, n.z); tones.push(p.kind === 'streak' ? CLOUDS.streaks.tone : 1); }
    }
  }
  for (const s of shapes) s.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('cloudTone', new THREE.Float32BufferAttribute(tones, 1));
  return g;
}

const lin = (hex: number): THREE.Color => new THREE.Color(hex);
const v3 = (c: THREE.Color | THREE.Vector3): string =>
  c instanceof THREE.Color ? `vec3( ${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)} )` : `vec3( ${c.x.toFixed(5)}, ${c.y.toFixed(5)}, ${c.z.toFixed(5)} )`;
const f = (x: number): string => x.toFixed(4);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * A cloud face's colour (linear, before the tone curve) for its world normal `n` seen along `v` (unit, from the eye), of
 * a puff of `tone` (the banks 1): the mirror of the fragment shader, term for term.
 */
export function cloudLight(n: THREE.Vector3, v: THREE.Vector3, out: THREE.Color, tone = 1): THREE.Color {
  const L = CLOUDS.light, sun = sunDiscDirection(new THREE.Vector3()), tmp = new THREE.Color();
  skyAt(n, out).multiplyScalar(L.ambient);
  out.add(tmp.copy(lin(L.sun.color)).multiplyScalar(L.sun.strength * Math.max(0, n.dot(sun))));
  out.add(tmp.copy(lin(L.under.color)).multiplyScalar(L.under.strength * Math.max(0, -n.y)));
  out.multiplyScalar(tone);
  const facing = Math.max(0, -n.dot(v)), mu = Math.max(0, v.dot(sun));
  out.add(tmp.copy(lin(L.rim.color)).multiplyScalar(L.rim.strength * (1 - facing) ** L.rim.graze * mu ** L.rim.near));
  const e = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(v.y, -1, 1)));
  return out.lerp(skyAt(v, tmp).multiplyScalar(tone), L.haze.base + L.haze.low * (1 - smoothstep(0, L.haze.top, e)));
}

const VERTEX = /* glsl */ `
  attribute float cloudTone;
  varying vec3 vCloudDir;
  varying vec3 vCloudNormal;
  varying float vCloudTone;
  void main() {
    vCloudTone = cloudTone;
    vCloudDir = mat3( modelMatrix ) * position;
    vCloudNormal = mat3( modelMatrix ) * normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

/** The clouds' fragment: `cloudLight` in GLSL, then three's tone mapping, colour space and dither. */
export function cloudFragment(): string {
  const L = CLOUDS.light, sun = sunDiscDirection(new THREE.Vector3());
  return /* glsl */ `
  #include <common>
  #include <dithering_pars_fragment>
  varying vec3 vCloudDir;
  varying vec3 vCloudNormal;
  varying float vCloudTone;
  ${skyGlsl()}
  void main() {
    vec3 v = normalize( vCloudDir ), n = normalize( vCloudNormal ), sun = ${v3(sun)};
    vec3 c = skyAt( n ) * ${f(L.ambient)};
    c += ${v3(lin(L.sun.color))} * ( ${f(L.sun.strength)} * max( 0.0, dot( n, sun ) ) );
    c += ${v3(lin(L.under.color))} * ( ${f(L.under.strength)} * max( 0.0, - n.y ) );
    c *= vCloudTone;
    float facing = max( 0.0, - dot( n, v ) ), mu = max( 0.0, dot( v, sun ) );
    c += ${v3(lin(L.rim.color))} * ( ${f(L.rim.strength)} * pow( 1.0 - facing, ${f(L.rim.graze)} ) * pow( mu, ${f(L.rim.near)} ) );
    float e = degrees( asin( clamp( v.y, -1.0, 1.0 ) ) );
    c = mix( c, skyAt( v ) * vCloudTone, ${f(L.haze.base)} + ${f(L.haze.low)} * ( 1.0 - smoothstep( 0.0, ${f(L.haze.top)}, e ) ) );
    gl_FragColor = vec4( c, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;
}

/** The drift's swing about the vertical at `t` s (radians). */
export function cloudDrift(t: number): number {
  const d = CLOUDS.drift;
  return THREE.MathUtils.degToRad(d.swing) * Math.sin((2 * Math.PI * t) / d.period);
}

export class Clouds {
  readonly mesh: THREE.Mesh;
  private t = 0;

  constructor(scene: THREE.Scene) {
    const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: cloudFragment(), dithering: true });
    this.mesh = new THREE.Mesh(cloudGeometry(), material);
    this.mesh.frustumCulled = false;
    // after the dome, before the world; their depth only among themselves (the world is never behind them)
    this.mesh.renderOrder = -9;
    this.mesh.onAfterRender = (renderer) => renderer.clearDepth();
    scene.add(this.mesh);
  }

  /** Ride with the camera and drift (`dt` s of the world's time). */
  update(eye: THREE.Vector3, dt: number): void {
    this.t += dt;
    this.mesh.position.copy(eye);
    this.mesh.rotation.y = cloudDrift(this.t);
  }
}
