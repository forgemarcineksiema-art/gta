/**
 * The world reflects the sky (docs/M8.9_PLAN.md R13, slice 19): hooks on the materials that are there, no texture and no
 * new draw; each takes its own copy of the sky's function (`skyGlsl`), so a material without fog (the garage's pictures)
 * has it too.
 *
 * - **The sea**: its plane stays and is lit as before; per pixel a triangle grid over the water gives each facet a
 *   normal that tilts in time, and the facet shows the sky where it reflects (by Fresnel) over the water's own colour,
 *   and flashes where it mirrors the sun: a path of light on the water toward it. Far off, where a facet is under a
 *   pixel, the tilt fades out and the path becomes a band on the sun's bearing that twinkles by facet.
 * - **The glass**: the buildings' glazing (`cityLook`'s third byte, glow.ts) and the cars' glass (their one glass
 *   colour) take the sky of the reflected ray by Fresnel, a lit window less, and a glint where it mirrors the sun.
 * - **The ground's sheen**: every ground and road face, at a grazing angle, reflects a broad warm lobe of the sun, so
 *   the road ahead shines when it runs into the sun (a dielectric's specular is the same on asphalt and grass; it shows
 *   on the dark road).
 */
import * as THREE from 'three';
import { skyGlsl, sunDiscDirection } from './sky';

export const SEA_LOOK = {
  /**
   * The facets' triangular grid (m, a side), their tilt (a normal's horizontal part), how fast they rock (rad/s) and how
   * much each one's own shade differs (±, of the water's colour).
   */
  facet: 2.4, tilt: 0.07, speed: 0.9, shade: 0.07,
  /** Fresnel's reflectance straight down (water's 0.02). */
  f0: 0.02,
  /** A facet's flash where it mirrors the sun: colour, strength (past the screen's white), sharpness (a cosine's power). */
  glint: { color: 0xfff0c8, strength: 6, sharp: 1600 },
  /** Far off (m): the tilt fades out between these, and the band on the sun's bearing comes in. */
  far: [120, 420],
  /** The far band: strength, sharpness across the bearing, the share of its facets lit at a time. */
  band: { strength: 1.4, sharp: 300, lit: 0.4 },
} as const;

/** The sea's clock (s of the world's time), shared by every sea material; the renderer moves it. */
export const SEA_TIME = { value: 0 };

/** Schlick's Fresnel for the cosine between a facet's normal and the eye (the shader's own sum, for the pins). */
export function seaFresnel(cosine: number): number {
  return SEA_LOOK.f0 + (1 - SEA_LOOK.f0) * (1 - THREE.MathUtils.clamp(cosine, 0, 1)) ** 5;
}

/** A facet's flash for the angle (°) between its mirror direction and the sun (the shader's own sum, for the pins). */
export function seaGlint(angle: number): number {
  return Math.max(0, Math.cos(THREE.MathUtils.degToRad(angle))) ** SEA_LOOK.glint.sharp;
}

const f = (x: number): string => x.toFixed(4);
const v3 = (x: number, y: number, z: number): string => `vec3( ${x.toFixed(5)}, ${y.toFixed(5)}, ${z.toFixed(5)} )`;

/** The fragment block, after the light and before the tone curve and the fog. */
export function seaBlock(): string {
  const s = SEA_LOOK, sun = sunDiscDirection(new THREE.Vector3()), flat = new THREE.Vector2(sun.x, sun.z).normalize();
  const glint = new THREE.Color(s.glint.color);
  return `{
      vec3 seaV = normalize( vSeaPos - cameraPosition );
      float seaNear = 1.0 - smoothstep( ${f(s.far[0])}, ${f(s.far[1])}, length( vSeaPos.xz - cameraPosition.xz ) );
      // a triangular grid (the simplex skew): equilateral facets, no squares
      vec2 seaQ = vSeaPos.xz / ${f(s.facet)};
      vec2 seaCell = floor( seaQ + ( seaQ.x + seaQ.y ) * 0.36603 );
      vec2 seaIn = seaQ - seaCell + ( seaCell.x + seaCell.y ) * 0.21132;
      float seaH = fract( sin( dot( seaCell, vec2( 127.1, 311.7 ) ) + step( seaIn.y, seaIn.x ) * 17.31 ) * 43758.5453 );
      float seaH2 = fract( seaH * 7.13 + 0.37 ), seaT = seaTime * ${f(s.speed)};
      vec2 seaTilt = ${f(s.tilt)} * seaNear * vec2( sin( seaT + seaH * 6.2832 ), cos( 0.8 * seaT + seaH2 * 6.2832 ) );
      vec3 seaN = normalize( vec3( seaTilt.x, 1.0, seaTilt.y ) );
      vec3 seaR = reflect( seaV, seaN );
      seaR.y = abs( seaR.y );
      // Fresnel by the calm surface, smooth with the distance; the facet tilts only the ray it reflects and its shade
      float seaF = ${f(s.f0)} + ${f(1 - s.f0)} * pow( 1.0 - clamp( - seaV.y, 0.0, 1.0 ), 5.0 );
      gl_FragColor.rgb *= 1.0 + ${f(s.shade)} * seaNear * ( 2.0 * seaH2 - 1.0 );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, seaSky( seaR ), seaF );
      float seaGlint = pow( max( 0.0, dot( seaR, ${v3(sun.x, sun.y, sun.z)} ) ), ${f(s.glint.sharp)} ) * seaNear;
      float seaAcross = max( 0.0, dot( normalize( seaV.xz ), vec2( ${f(flat.x)}, ${f(flat.y)} ) ) );
      float seaBand = pow( seaAcross, ${f(s.band.sharp)} ) * ( 1.0 - seaNear ) * step( ${f(1 - s.band.lit)}, fract( seaH + seaT * 0.5 ) );
      gl_FragColor.rgb += ${v3(glint.r, glint.g, glint.b)} * ( ${f(s.glint.strength)} * seaGlint + ${f(s.band.strength)} * seaBand );
    }`;
}

/** The sea's hook on its material: the facets, the sky in them, the sun's path. */
export function lookOfTheSea(material: THREE.MeshLambertMaterial): THREE.MeshLambertMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms['seaTime'] = SEA_TIME;
    shader.vertexShader = `varying vec3 vSeaPos;\n${shader.vertexShader}`.replace('#include <project_vertex>', `#include <project_vertex>
      vSeaPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`);
    shader.fragmentShader = `uniform float seaTime;\nvarying vec3 vSeaPos;\n${skyGlsl('seaSky')}\n${shader.fragmentShader}`
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n    ${seaBlock()}`);
  };
  material.customProgramCacheKey = () => 'sea-facets-v1';
  return material;
}

/**
 * The sun's share a fragment sees, its shadow's and the tunnel's (shadows.ts), caught as `sunSeen` from three's
 * directional light loop, so a sheen or a glint shows only where the sun reaches; once a shader (1 without a map).
 */
export function catchSunSeen(shader: { fragmentShader: string }): void {
  if (shader.fragmentShader.includes('float sunSeen')) return;
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const start = chunk.indexOf('directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap');
  if (start < 0) throw new Error("catchSunSeen: three's directional shadow line moved");
  const end = chunk.indexOf(';', start);
  const seen = chunk.slice(start + 'directLight.color *= '.length, end);
  const patched = `${chunk.slice(0, start)}sunSeen = ${seen};
    directLight.color *= sunSeen${chunk.slice(end)}`;
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', `float sunSeen = 1.0;
${patched}`);
}

/** The glass: Fresnel's reflectance straight on (stylised past real glass's 0.04), the glint's strength and sharpness. */
export const GLASS_LOOK = { f0: 0.2, glint: { strength: 2.5, sharp: 700 } } as const;

/** The glass's Fresnel for the cosine between its normal and the eye. */
export function glassFresnel(cosine: number): number {
  return GLASS_LOOK.f0 + (1 - GLASS_LOOK.f0) * (1 - THREE.MathUtils.clamp(cosine, 0, 1)) ** 5;
}

/**
 * The glass's block, in a lit material's fragment after the light (`normal` and `vViewPosition` in view space), where
 * `isGlass` (a GLSL expression) holds and `lit` (another, 0..1) is how lit the pane is: `glassSky` must be in the shader.
 */
export function glassBlock(isGlass: string, lit = '0.0'): string {
  const g = GLASS_LOOK, sun = sunDiscDirection(new THREE.Vector3()), glint = new THREE.Color(SEA_LOOK.glint.color);
  return `if ( ${isGlass} ) {
      vec3 glV = normalize( - vViewPosition );
      vec3 glR = inverseTransformDirection( reflect( glV, normal ), viewMatrix );
      float glF = ${f(g.f0)} + ${f(1 - g.f0)} * pow( 1.0 - clamp( dot( normal, - glV ), 0.0, 1.0 ), 5.0 );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, glassSky( glR ), glF * ( 1.0 - ${lit} ) );
      gl_FragColor.rgb += ${v3(glint.r, glint.g, glint.b)} * ( ${f(g.glint.strength)} * sunSeen * pow( max( 0.0, dot( glR, ${v3(sun.x, sun.y, sun.z)} ) ), ${f(g.glint.sharp)} ) );
    }`;
}

/** The ground's sheen: its strength and how broad its lobe round the sun's mirror direction (a cosine's power). */
export const SHEEN = { strength: 0.3, sharp: 10 } as const;

/** The sheen for the cosine to the eye and the angle (°) of the mirror direction off the sun (the shader's sums). */
export function groundSheen(cosine: number, angle: number): number {
  const toward = Math.max(0, Math.cos(THREE.MathUtils.degToRad(angle))) ** SHEEN.sharp;
  return SHEEN.strength * (1 - THREE.MathUtils.clamp(cosine, 0, 1)) ** 5 * toward;
}

/** The ground's sheen block, in a lit material's fragment after the light (`normal`, `vViewPosition`: view space). */
export function sheenBlock(): string {
  const sun = sunDiscDirection(new THREE.Vector3()), c = new THREE.Color(SEA_LOOK.glint.color);
  return `{
      vec3 shV = normalize( - vViewPosition );
      vec3 shR = inverseTransformDirection( reflect( shV, normal ), viewMatrix );
      float shGraze = pow( 1.0 - clamp( dot( normal, - shV ), 0.0, 1.0 ), 5.0 );
      float shToward = pow( max( 0.0, dot( shR, ${v3(sun.x, sun.y, sun.z)} ) ), ${f(SHEEN.sharp)} );
      gl_FragColor.rgb += ${v3(c.r, c.g, c.b)} * ( ${f(SHEEN.strength)} * sunSeen * shGraze * shToward );
    }`;
}

/** Chain a block after a material's light (before the tone curve and the fog), keeping its other hooks. */
export function afterLight(material: THREE.Material, key: string, block: string, head = ''): void {
  const previous = material.onBeforeCompile.bind(material), cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    catchSunSeen(shader);
    shader.fragmentShader = `${head}
${shader.fragmentShader}`.replace('#include <opaque_fragment>', `#include <opaque_fragment>
    ${block}`);
  };
  material.customProgramCacheKey = () => `${cacheKey}-${key}`;
}

/** The ground's and the roads' sheen on their material. */
export function sheen(material: THREE.Material): void {
  afterLight(material, 'sheen-v1', sheenBlock());
}

/** The cars' glass is their one glass colour (bodyMesh.ts, carMesh.ts): its linear value, the key the shader matches. */
export const CAR_GLASS = 0x294653;

/** The cars' glass on their material: the vertex colour that is exactly the glass's. */
export function carGlass(material: THREE.Material): void {
  const g = new THREE.Color(CAR_GLASS);
  afterLight(material, 'car-glass-v1', glassBlock(`all( lessThan( abs( vColor.rgb - ${v3(g.r, g.g, g.b)} ), vec3( 0.002 ) ) )`), skyGlsl('glassSky'));
}
