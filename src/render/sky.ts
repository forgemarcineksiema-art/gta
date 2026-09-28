/**
 * The sky, the fog and the light (docs/STYLE.md; docs/M8.9_PLAN.md R8–R9, the golden hour; R13, the atmosphere): a dome
 * that rides with the camera so the horizon never comes closer, a hemisphere fill, and a low warm sun whose one shadow
 * map follows the car on a texel grid (shadows.ts). The quality tier sets the fog's reach and the shadow map's size.
 *
 * The golden hour (M8.9 slice 2): the sun low (32°, `SUN_OFFSET`), warm and strong; the fill a lavender sky over a warm
 * ground's bounce, so a sunlit face glows warm and a shaded one goes violet; the sky hot peach at the horizon, rose a
 * few degrees up and deep violet from 15° up, so the frame's top, where the HUD's words sit, is dark enough to read
 * them; the fog and the background are the horizon's colour, so the far city dissolves into it.
 *
 * The sky per pixel (slice 16, R13): the sky is one function of a direction, `skyAt`, written once in GLSL for the dome
 * and the fog and mirrored here in TypeScript for the pins. The stops on smooth curves; toward the sun a wide glow over
 * the haze and a tight one round the disc (two Henyey–Greenstein lobes, so neither has an edge); away from it the
 * evening's arch, a cool slate band at the horizon under a rose one a few degrees up. The dome draws it with the sun's
 * disc (a hot core, a darker limb) and three's dither against banding; the fog takes it without the disc, so the far
 * city dissolves into the sky's colour where it stands. The sun is seen on the light's bearing but low in the warm band
 * (the light itself stands higher, so the streets are not all in shade). A dozen flat clouds lit orange from below in
 * the sun's half of the sky (slice 4). All ride with the camera; two draws.
 */
import * as THREE from 'three';
import { PALETTE, mulberry32 } from '../sim';
import { SHADOW_HALF, SUN_OFFSET, stableShadowTarget } from './shadows';

/** The light and the sky (colours sRGB hex; elevations and angles in degrees over the horizon). */
export const SKY = {
  sun: { color: PALETTE.sun, intensity: 2.4 },
  fill: { sky: 0xa8a4ec, ground: 0xb08a6c, intensity: 1.5 },
  shadow: 0.85,
  stops: [
    { at: 0, color: PALETTE.skyHorizon },
    { at: 5, color: PALETTE.skyMid },
    { at: 15, color: PALETTE.skyTop },
  ],
  /**
   * Toward the sun: the haze's wide glow, mixed in and fading by `fade`° up, and the tight glow round the disc, added.
   * `g` is each lobe's Henyey–Greenstein asymmetry (the nearer 1, the tighter), normalised to 1 at the sun.
   */
  wide: { color: 0xffbd78, strength: 0.65, g: 0.6, fade: 35 },
  tight: { color: 0xffae52, strength: 0.6, g: 0.9 },
  /**
   * Away from the sun, the evening's arch: `from` how far round (0 the sun's bearing, 1 the opposite one) it begins; the
   * rose band's colour, peak, width (a Gaussian's, °) and strength; the slate band's colour, top and strength.
   */
  arch: { from: 0.3, rose: 0xf5a9b8, peak: 6, width: 3, roseStrength: 0.7, slate: 0x7f86b8, slateTop: 4, slateStrength: 0.75 },
  /** The sun's disc: its angular radius, the core's and the rim's colour, how much darker its limb. */
  disc: { radius: 1.72, core: 0xfffaea, rim: 0xffe2a8, limb: 0.15 },
} as const;

/** The sun as seen: on the light's bearing, `elevation`° up. */
export const SUN_DISC = { elevation: 9 } as const;

/** The clouds: how many, how far (m), how far each side of the sun's bearing (°), between which elevations (°). */
export const CLOUDS = { count: 12, distance: 700, spread: 80, low: 8, high: 25, seed: 0x5c1d } as const;

/** The light's bearing about the vertical (radians; 0 is +Z). */
export function sunBearing(): number {
  return Math.atan2(SUN_OFFSET.x, SUN_OFFSET.z);
}

/** A unit direction at a bearing (radians) and an elevation (degrees). */
export function skyDirection(bearing: number, elevation: number, out: THREE.Vector3): THREE.Vector3 {
  const e = THREE.MathUtils.degToRad(elevation);
  return out.set(Math.sin(bearing) * Math.cos(e), Math.sin(e), Math.cos(bearing) * Math.cos(e));
}

/** Where the sun is seen from the camera: the light's bearing, `SUN_DISC.elevation` up. */
export function sunDiscDirection(out: THREE.Vector3): THREE.Vector3 {
  return skyDirection(sunBearing(), SUN_DISC.elevation, out);
}

const linear = (hex: number): THREE.Color => new THREE.Color(hex);
const STOP = SKY.stops.map((s) => linear(s.color));
const WIDE = linear(SKY.wide.color), TIGHT = linear(SKY.tight.color);
const ROSE = linear(SKY.arch.rose), SLATE = linear(SKY.arch.slate);
const SUN_DIR = sunDiscDirection(new THREE.Vector3());
const SUN_FLAT = new THREE.Vector2(SUN_DIR.x, SUN_DIR.z).normalize();

const smoothstep = (a: number, b: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** A Henyey–Greenstein lobe normalised to 1 at the sun, of the cosine `mu` between a direction and the sun. */
function lobe(g: number, mu: number): number {
  return ((1 - g) * (1 - g) / (1 + g * g - 2 * g * mu)) ** 1.5;
}

/**
 * The sky's colour in a direction (unit; linear colour), without the disc: the stops by elevation, the arch away from
 * the sun, the glows toward it. The mirror of the GLSL `skyAt` (`skyGlsl`), term for term.
 */
export function skyAt(d: THREE.Vector3, out: THREE.Color): THREE.Color {
  const [s0, s1, s2] = SKY.stops;
  const e = Math.max(0, THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(d.y, -1, 1))));
  out.copy(STOP[0] as THREE.Color).lerp(STOP[1] as THREE.Color, smoothstep(s0.at, s1.at, e));
  out.lerp(STOP[2] as THREE.Color, smoothstep(s1.at, s2.at, e));
  const across = Math.hypot(d.x, d.z);
  const cosAz = across > 1e-4 ? (d.x * SUN_FLAT.x + d.z * SUN_FLAT.y) / across : 0;
  const a = SKY.arch, away = smoothstep(a.from, 1, 0.5 - 0.5 * cosAz);
  out.lerp(ROSE, a.roseStrength * away * Math.exp(-(((e - a.peak) / a.width) ** 2)));
  out.lerp(SLATE, a.slateStrength * away * (1 - smoothstep(0, a.slateTop, e)));
  const mu = d.dot(SUN_DIR);
  out.lerp(WIDE, SKY.wide.strength * lobe(SKY.wide.g, mu) * (1 - smoothstep(0, SKY.wide.fade, e)));
  const t = SKY.tight.strength * lobe(SKY.tight.g, mu);
  return out.setRGB(out.r + TIGHT.r * t, out.g + TIGHT.g * t, out.b + TIGHT.b * t);
}

const v3 = (c: THREE.Color): string => `vec3( ${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)} )`;
const f1 = (x: number): string => x.toFixed(4);

/** The GLSL of `skyAt( vec3 d )`, the one source the dome and the fog both splice in (slice 16, pin 16.3). */
export function skyGlsl(): string {
  const [s0, s1, s2] = SKY.stops, a = SKY.arch;
  const lobeGlsl = (g: number): string => `pow( ${f1((1 - g) * (1 - g))} / ( ${f1(1 + g * g)} - ${f1(2 * g)} * mu ), 1.5 )`;
  return `
  vec3 skyAt( vec3 d ) {
    float e = max( 0.0, degrees( asin( clamp( d.y, -1.0, 1.0 ) ) ) );
    vec3 c = mix( ${v3(STOP[0] as THREE.Color)}, ${v3(STOP[1] as THREE.Color)}, smoothstep( ${f1(s0.at)}, ${f1(s1.at)}, e ) );
    c = mix( c, ${v3(STOP[2] as THREE.Color)}, smoothstep( ${f1(s1.at)}, ${f1(s2.at)}, e ) );
    float across = length( d.xz );
    float cosAz = across > 1e-4 ? dot( d.xz / across, vec2( ${f1(SUN_FLAT.x)}, ${f1(SUN_FLAT.y)} ) ) : 0.0;
    float away = smoothstep( ${f1(a.from)}, 1.0, 0.5 - 0.5 * cosAz );
    float rose = ( e - ${f1(a.peak)} ) / ${f1(a.width)};
    c = mix( c, ${v3(ROSE)}, ${f1(a.roseStrength)} * away * exp( - rose * rose ) );
    c = mix( c, ${v3(SLATE)}, ${f1(a.slateStrength)} * away * ( 1.0 - smoothstep( 0.0, ${f1(a.slateTop)}, e ) ) );
    float mu = dot( d, vec3( ${SUN_DIR.x.toFixed(5)}, ${SUN_DIR.y.toFixed(5)}, ${SUN_DIR.z.toFixed(5)} ) );
    c = mix( c, ${v3(WIDE)}, ${f1(SKY.wide.strength)} * ${lobeGlsl(SKY.wide.g)} * ( 1.0 - smoothstep( 0.0, ${f1(SKY.wide.fade)}, e ) ) );
    return c + ${v3(TIGHT)} * ( ${f1(SKY.tight.strength)} * ${lobeGlsl(SKY.tight.g)} );
  }`;
}

export class Sky {
  readonly sun: THREE.DirectionalLight;
  private readonly dome: THREE.Mesh;
  private readonly clouds: THREE.Mesh;
  private readonly shadowTarget = new THREE.Object3D();
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {
    skyFog();
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
    this.clouds = buildClouds();
    scene.add(this.dome, this.clouds);
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
    this.clouds.position.copy(eye);
  }
}

/**
 * The fog in the sky's colour where the fogged thing stands in the view (the third bug hunt; slice 16): every fogged
 * fragment takes `skyAt` of its direction from the eye, the glows and the arch included, the disc not; at the horizon
 * square to the sun that is the fog's own colour. Three's fog chunks are patched once, before a material compiles.
 */
function skyFog(): void {
  const chunk = THREE.ShaderChunk as Record<string, string>;
  if ((chunk['fog_pars_fragment'] ?? '').includes('fogSky(')) return;
  chunk['fog_pars_vertex'] = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogDir;
#endif`;
  chunk['fog_vertex'] = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogDir = transpose( mat3( viewMatrix ) ) * mvPosition.xyz;
#endif`;
  chunk['fog_pars_fragment'] = `${chunk['fog_pars_fragment'] ?? ''}
#ifdef USE_FOG
  varying vec3 vFogDir;
  ${skyGlsl()}
  vec3 fogSky( vec3 d ) { return skyAt( d ); }
#endif`;
  chunk['fog_fragment'] = (chunk['fog_fragment'] ?? '').replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );',
    'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogSky( normalize( vFogDir ) ), fogFactor );');
}

/** The dome's radius (m). */
const DOME_RADIUS = 850;

const DOME_VERTEX = /* glsl */ `
  varying vec3 vSkyDir;
  void main() {
    vSkyDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

/** The dome's fragment: `skyAt`, the disc over it, then three's tone mapping, colour space and dither. */
export function domeFragment(): string {
  const disc = SKY.disc;
  return /* glsl */ `
  #include <common>
  #include <dithering_pars_fragment>
  varying vec3 vSkyDir;
  ${skyGlsl()}
  void main() {
    vec3 d = normalize( vSkyDir );
    vec3 c = skyAt( d );
    vec3 sunDir = vec3( ${SUN_DIR.x.toFixed(5)}, ${SUN_DIR.y.toFixed(5)}, ${SUN_DIR.z.toFixed(5)} );
    float r = degrees( asin( min( 1.0, length( cross( d, sunDir ) ) ) ) ) / ${f1(disc.radius)};
    float edge = ( 1.0 - smoothstep( 0.94, 1.0, r ) ) * step( 0.0, dot( d, sunDir ) );
    float limb = 1.0 - ${f1(disc.limb)} * ( 1.0 - sqrt( max( 0.0, 1.0 - r * r ) ) );
    c = mix( c, mix( ${v3(linear(disc.core))}, ${v3(linear(disc.rim))}, min( 1.0, r * r ) ) * limb, edge );
    gl_FragColor = vec4( c, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;
}

/** A large inverted sphere drawing `skyAt` per pixel, and the sun's disc on it. */
function buildSkyDome(): THREE.Mesh {
  const g = new THREE.SphereGeometry(DOME_RADIUS, 32, 16);
  const material = new THREE.ShaderMaterial({
    vertexShader: DOME_VERTEX, fragmentShader: domeFragment(), side: THREE.BackSide, depthWrite: false, dithering: true,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
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

/** The clouds: flat octagons facing the camera, warm on their underside, violet on top; one mesh. */
function buildClouds(): THREE.Mesh {
  const positions: number[] = [], colors: number[] = [];
  const under = new THREE.Color(0xffa98a), top = new THREE.Color(0x6e5f9e), mid = new THREE.Color();
  const d = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Vector3();
  const sides = 8;
  for (const cloud of cloudLayout()) {
    skyDirection(cloud.bearing, cloud.elevation, d);
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
