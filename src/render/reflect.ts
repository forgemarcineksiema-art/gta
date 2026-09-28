/**
 * The world reflects the sky (docs/M8.9_PLAN.md R13, slice 19): hooks on the materials that are there, no texture and no
 * new draw; each takes its own copy of the sky's function (`skyGlsl`), so a material without fog (the garage's pictures)
 * has it too.
 *
 * - **The sea**: its plane stays; per pixel a triangle grid over the water whose corners ride one swell (three trains
 *   at deep water's speed, slice 21), so each facet's normal is the sheet's own and its neighbours tilt as it does:
 *   rolling faces, no checkerboard. The facet is lit by its normal, shows the sky where it reflects (by Fresnel) over
 *   the water's own colour, and flashes where it mirrors the sun: a path of light on the water toward it. The colour
 *   by the depth under it (`SeaDepth`, the ground's readings): pale over the sand at the edge, turquoise in the
 *   shallows, blue in the deep; foam at the shore, its wash rising and falling, a breaker's line running in. Far off,
 *   where a facet is under a few pixels, the tilt fades out and the path becomes a band on the sun's bearing that
 *   twinkles by facet.
 * - **The glass**: the buildings' glazing (`cityLook`'s third byte, glow.ts) and the cars' glass (their one glass
 *   colour) take the sky of the reflected ray by Fresnel, a lit window less, and a glint where it mirrors the sun.
 * - **The ground's sheen**: every ground and road face, at a grazing angle, reflects a broad warm lobe of the sun, so
 *   the road ahead shines when it runs into the sun (a dielectric's specular is the same on asphalt and grass; it shows
 *   on the dark road).
 */
import * as THREE from 'three';
import { PALETTE } from '../sim';
import { skyGlsl, sunDiscDirection } from './sky';

export const SEA_LOOK = {
  /** The facets' triangular grid (m, a side) and how much each one's own shade differs (±, of the water's colour). */
  facet: 2.6, shade: 0.05,
  /**
   * The swell the facets' corners ride: three trains, each its heading (° from +Z toward +X), wavelength (m), height
   * (m, an amplitude) and phase; each moves at deep water's speed (ω² = g k). Under 1.5 m of water it calms to `calm`.
   */
  waves: [
    { heading: 30, length: 16, height: 0.28, phase: 0 },
    { heading: 74, length: 9.5, height: 0.14, phase: 2.1 },
    { heading: -12, length: 6.8, height: 0.08, phase: 4.4 },
  ],
  calm: 0.35,
  /** How much the facet's own normal lights it and sets its Fresnel (0 the calm plane's, 1 the facet's). */
  light: 0.7, facetFresnel: 0.45,
  /** Fresnel's reflectance straight down (water's 0.02). */
  f0: 0.02,
  /**
   * The water's colour by the depth under it (m): thin over the sand (`shoal`) to `shoalTo`, the shallows' turquoise,
   * the deep's blue from `deepFrom` to `deepTo`.
   */
  colour: { shoal: PALETTE.waterShoal, shallow: PALETTE.waterShallow, deep: PALETTE.waterDeep, shoalTo: 0.7, deepFrom: 0.5, deepTo: 3.2 },
  /**
   * The foam, in lines by the distance from the shore (m: the depth over the bed's slope, the slope no less than
   * `flat`), none deeper than `deepest` m: its colour; the edge's band `edge` m wide at the water's line; the swash's
   * line surging to `reach` m out (its least and most) and back every `period` s, `swash` m wide; a breaker's line
   * running in from `line.from` m out every `line.every` s, `line.width` m wide, none deeper than `line.deepest`; each
   * broken by the foam's own triangles (`fine` m, a side).
   */
  foam: {
    colour: PALETTE.foam, flat: 0.015, deepest: 0.6, edge: 0.35, reach: [0.8, 2.4], swash: 0.4, period: 6.5,
    line: { from: 13, every: 8.5, width: 0.8, deepest: 1.3 }, fine: 1.1,
  },
  /** A facet's flash where it mirrors the sun: colour, strength (past the screen's white), sharpness (a cosine's power). */
  glint: { color: 0xfff0c8, strength: 6, sharp: 1600 },
  /** Far off (m): the tilt fades out between these, and the band on the sun's bearing comes in. */
  far: [120, 420],
  /** The far band: strength, sharpness across the bearing, the share of its facets lit at a time. */
  band: { strength: 1.4, sharp: 300, lit: 0.4 },
} as const;

/** The sea's clock (s of the world's time), shared by every sea material; the renderer moves it. */
export const SEA_TIME = { value: 0 };

/**
 * The depth under the water as the sea's map keeps it (`SeaDepth`): a byte a point, `(depth + above) × scale`, so
 * from `above` m over the water (the land at the edge) to about 5.4 m deep; where the map has none it is `deep`.
 */
export const SEA_DEPTH = { above: 1, scale: 40, deep: 5 } as const;

/** A depth (m, negative over the water) as the map's byte. */
export function seaDepthByte(depth: number): number {
  return THREE.MathUtils.clamp(Math.round((depth + SEA_DEPTH.above) * SEA_DEPTH.scale), 0, 255);
}

/** The map's byte as a depth (m), as the shader reads it. */
export function seaDepthOf(byte: number): number {
  return byte / SEA_DEPTH.scale - SEA_DEPTH.above;
}

/** Schlick's Fresnel for the cosine between a facet's normal and the eye (the shader's own sum, for the pins). */
export function seaFresnel(cosine: number): number {
  return SEA_LOOK.f0 + (1 - SEA_LOOK.f0) * (1 - THREE.MathUtils.clamp(cosine, 0, 1)) ** 5;
}

/** A facet's flash for the angle (°) between its mirror direction and the sun (the shader's own sum, for the pins). */
export function seaGlint(angle: number): number {
  return Math.max(0, Math.cos(THREE.MathUtils.degToRad(angle))) ** SEA_LOOK.glint.sharp;
}

/** Each train of the swell: its wavenumber along X and Z (rad/m), its angular speed (deep water's, rad/s), height, phase. */
export const SEA_TRAINS = SEA_LOOK.waves.map((w) => {
  const k = (2 * Math.PI) / w.length, h = THREE.MathUtils.degToRad(w.heading);
  return { kx: k * Math.sin(h), kz: k * Math.cos(h), omega: Math.sqrt(9.81 * k), height: w.height, phase: w.phase };
});

/** The swell's height at (x, z) at `t` s (m): the shader's own sum. */
export function seaSwell(x: number, z: number, t: number): number {
  let y = 0;
  for (const w of SEA_TRAINS) y += w.height * Math.sin(w.kx * x + w.kz * z - w.omega * t + w.phase);
  return y;
}

/** The skew of the triangular grid (the simplex's): into it and back. */
const F2 = (Math.sqrt(3) - 1) / 2;
const G2 = (3 - Math.sqrt(3)) / 6;

/**
 * The facet over (x, z) at `t` s: its three corners on the swell scaled by `amp` (1 the whole swell), its normal (unit,
 * up) into `out`: the shader's own sum.
 */
export function seaFacetNormal(x: number, z: number, t: number, amp: number, out: THREE.Vector3): THREE.Vector3 {
  const s = SEA_LOOK.facet, qx = x / s, qz = z / s, sk = (qx + qz) * F2;
  const cx = Math.floor(qx + sk), cz = Math.floor(qz + sk), un = (cx + cz) * G2;
  const up = qx - cx + un >= qz - cz + un ? 1 : 0;
  const c0x = (cx - un) * s, c0z = (cz - un) * s;
  const c1x = (cx + up - (cx + cz + 1) * G2) * s, c1z = (cz + 1 - up - (cx + cz + 1) * G2) * s;
  const c2x = (cx + 1 - (cx + cz + 2) * G2) * s, c2z = (cz + 1 - (cx + cz + 2) * G2) * s;
  const y0 = seaSwell(c0x, c0z, t) * amp, y1 = seaSwell(c1x, c1z, t) * amp, y2 = seaSwell(c2x, c2z, t) * amp;
  const e = new THREE.Vector3(c2x - c0x, y2 - y0, c2z - c0z), g = new THREE.Vector3(c1x - c0x, y1 - y0, c1z - c0z);
  out.crossVectors(e, g).normalize();
  if (out.y < 0) out.negate();
  return out;
}

/** The water's own colour (linear) over `depth` m of water, before its foam: the shader's own blend. */
export function seaWater(depth: number, out: THREE.Color): THREE.Color {
  const c = SEA_LOOK.colour, s = THREE.MathUtils.smoothstep;
  out.set(c.shoal).lerp(new THREE.Color(c.shallow), s(depth, 0, c.shoalTo));
  return out.lerp(new THREE.Color(c.deep), s(depth, c.deepFrom, c.deepTo));
}

/** How far from the shore (m) water `depth` m deep over a bed of `slope` (rise over run) is: the foam's measure. */
export function seaShore(depth: number, slope: number): number {
  return depth / Math.max(slope, SEA_LOOK.foam.flat);
}

/**
 * Whether the water is foam over `depth` m, a bed of `slope`, at `t` s (the shader's own test): `fine` the foam's
 * triangle's own number (0..1, 0.5 where its triangles are under a few pixels), `phase` the shore's own (rad).
 */
export function seaFoam(depth: number, slope: number, t: number, fine: number, phase: number): boolean {
  const fm = SEA_LOOK.foam, out = seaShore(depth, slope), width = 0.3 + fine;
  const reach = THREE.MathUtils.lerp(fm.reach[0], fm.reach[1], 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / fm.period + phase));
  if (depth <= fm.deepest && (out <= fm.edge * width || Math.abs(out - reach) <= fm.swash * width)) return true;
  const cycle = (((t / fm.line.every + phase / (2 * Math.PI)) % 1) + 1) % 1, at = fm.line.from * (1 - cycle);
  return fine >= 0.3 && depth <= fm.line.deepest && Math.abs(out - at) <= fm.line.width * width;
}

const f = (x: number): string => x.toFixed(4);
const v3 = (x: number, y: number, z: number): string => `vec3( ${x.toFixed(5)}, ${y.toFixed(5)}, ${z.toFixed(5)} )`;
const rgb = (hex: number): string => {
  const c = new THREE.Color(hex);
  return v3(c.r, c.g, c.b);
};

/** The sea's fragment head: its clock, its place, the depth's map and the box it covers, the sky and the swell. */
function seaHead(): string {
  const sum = SEA_TRAINS.map((w) => `${f(w.height)} * sin( dot( vec2( ${f(w.kx)}, ${f(w.kz)} ), p ) - ${f(w.omega)} * seaTime + ${f(w.phase)} )`).join('\n      + ');
  return `uniform float seaTime;
uniform sampler2D seaDepthMap;
uniform vec4 seaDepthBox;
varying vec3 vSeaPos;
${skyGlsl('seaSky')}
float seaSwell( vec2 p ) {
  return ${sum};
}
float seaHash( vec2 cell, float up, float salt ) {
  return fract( sin( dot( cell, vec2( 127.1, 311.7 ) ) + up * 17.31 + salt ) * 43758.5453 );
}`;
}

/**
 * The surface's block, where the material's colour is read (before the light): the depth under the water, the facet
 * on the swell, the foam, and the colour they make; its values are the later blocks'.
 */
export function seaSurfaceBlock(): string {
  const s = SEA_LOOK, c = s.colour, fm = s.foam, d = SEA_DEPTH;
  return `
    vec3 seaV = normalize( vSeaPos - cameraPosition );
    float seaNear = 1.0 - smoothstep( ${f(s.far[0])}, ${f(s.far[1])}, length( vSeaPos.xz - cameraPosition.xz ) );
    // metres a pixel: a facet fades flat before it is under a few pixels (no shimmer far off)
    float seaPx = max( length( fwidth( vSeaPos.xz ) ), 1e-4 );
    float seaSharp = min( seaNear, smoothstep( 2.0, 5.0, ${f(s.facet)} / seaPx ) );
    // the depth under the water, from the ground's readings; deep where the map has none
    vec2 seaUv = ( vSeaPos.xz - seaDepthBox.xy ) * seaDepthBox.zw;
    float seaDepth = texture2D( seaDepthMap, seaUv ).r * ${f(255 / d.scale)} - ${f(d.above)};
    if ( any( lessThan( seaUv, vec2( 0.0 ) ) ) || any( greaterThan( seaUv, vec2( 1.0 ) ) ) ) seaDepth = ${f(d.deep)};
    // the facet: a triangle of the skewed grid, its corners on the swell (calmer in the shallows)
    vec2 seaQ = vSeaPos.xz / ${f(s.facet)};
    vec2 seaCell = floor( seaQ + ( seaQ.x + seaQ.y ) * ${f(F2)} );
    vec2 seaIn = seaQ - seaCell + ( seaCell.x + seaCell.y ) * ${f(G2)};
    float seaUp = step( seaIn.y, seaIn.x );
    vec2 seaC0 = ( seaCell - ( seaCell.x + seaCell.y ) * ${f(G2)} ) * ${f(s.facet)};
    vec2 seaC1 = ( seaCell + vec2( seaUp, 1.0 - seaUp ) - ( seaCell.x + seaCell.y + 1.0 ) * ${f(G2)} ) * ${f(s.facet)};
    vec2 seaC2 = ( seaCell + 1.0 - ( seaCell.x + seaCell.y + 2.0 ) * ${f(G2)} ) * ${f(s.facet)};
    float seaAmp = seaSharp * mix( ${f(s.calm)}, 1.0, smoothstep( 0.0, 1.5, seaDepth ) );
    float seaY0 = seaSwell( seaC0 ) * seaAmp, seaY1 = seaSwell( seaC1 ) * seaAmp, seaY2 = seaSwell( seaC2 ) * seaAmp;
    vec3 seaN = normalize( cross( vec3( seaC2.x - seaC0.x, seaY2 - seaY0, seaC2.y - seaC0.y ), vec3( seaC1.x - seaC0.x, seaY1 - seaY0, seaC1.y - seaC0.y ) ) );
    if ( seaN.y < 0.0 ) seaN = - seaN;
    float seaH = seaHash( seaCell, seaUp, 0.0 );
    // the foam's own finer triangles, which break its edges (their mean where they are under a few pixels)
    vec2 seaFq = vSeaPos.xz / ${f(fm.fine)};
    vec2 seaFc = floor( seaFq + ( seaFq.x + seaFq.y ) * ${f(F2)} );
    vec2 seaFi = seaFq - seaFc + ( seaFc.x + seaFc.y ) * ${f(G2)};
    float seaFineSharp = smoothstep( 2.0, 5.0, ${f(fm.fine)} / seaPx );
    float seaFine = mix( 0.5, seaHash( seaFc, step( seaFi.y, seaFi.x ), 5.3 ), seaFineSharp );
    // the distance from the shore: the depth over the bed's slope, read a point each way (a flat's the least slope)
    vec2 seaTx = 1.0 / vec2( textureSize( seaDepthMap, 0 ) );
    float seaDx = texture2D( seaDepthMap, seaUv + vec2( seaTx.x, 0.0 ) ).r - texture2D( seaDepthMap, seaUv - vec2( seaTx.x, 0.0 ) ).r;
    float seaDz = texture2D( seaDepthMap, seaUv + vec2( 0.0, seaTx.y ) ).r - texture2D( seaDepthMap, seaUv - vec2( 0.0, seaTx.y ) ).r;
    float seaSlope = length( vec2( seaDx * seaDepthBox.z / seaTx.x, seaDz * seaDepthBox.w / seaTx.y ) ) * ${f(255 / d.scale / 2)};
    float seaOut = seaDepth / max( seaSlope, ${f(fm.flat)} );
    // the wash at the shore rising and falling, and a breaker's line running in, each along the shore at its own time
    float seaPhase = 1.3 * sin( vSeaPos.x * 0.029 + vSeaPos.z * 0.013 ) + 1.1 * sin( vSeaPos.z * 0.037 - vSeaPos.x * 0.017 );
    float seaReach = mix( ${f(fm.reach[0])}, ${f(fm.reach[1])}, 0.5 + 0.5 * sin( ${f((2 * Math.PI) / fm.period)} * seaTime + seaPhase ) );
    float seaWidth = 0.3 + seaFine;
    float seaFoam = step( seaDepth, ${f(fm.deepest)} ) * max( step( seaOut, ${f(fm.edge)} * seaWidth ), step( abs( seaOut - seaReach ), ${f(fm.swash)} * seaWidth ) );
    float seaCycle = fract( seaTime / ${f(fm.line.every)} + seaPhase * ${f(1 / (2 * Math.PI))} );
    float seaLineAt = ${f(fm.line.from)} * ( 1.0 - seaCycle );
    float seaLine = step( abs( seaOut - seaLineAt ), ${f(fm.line.width)} * seaWidth ) * step( 0.3, seaFine ) * step( seaDepth, ${f(fm.line.deepest)} );
    seaFoam = max( seaFoam, seaLine * seaFineSharp );
    // the water's own colour by the depth: thin over the sand, the shallows, the deep; a facet's own shade
    vec3 seaWater = mix( ${rgb(c.shoal)}, ${rgb(c.shallow)}, smoothstep( 0.0, ${f(c.shoalTo)}, seaDepth ) );
    seaWater = mix( seaWater, ${rgb(c.deep)}, smoothstep( ${f(c.deepFrom)}, ${f(c.deepTo)}, seaDepth ) );
    seaWater *= 1.0 + ${f(s.shade)} * seaSharp * ( 2.0 * seaH - 1.0 );
    diffuseColor.rgb = mix( seaWater, ${rgb(fm.colour)}, seaFoam );`;
}

/** The light's normal: the facet's (a share of it, `SEA_LOOK.light`) in view space; the foam's the calm plane's. */
export function seaNormalBlock(): string {
  return `
    normal = normalize( mix( normal, ( viewMatrix * vec4( seaN, 0.0 ) ).xyz, ${f(SEA_LOOK.light)} * ( 1.0 - seaFoam ) ) );`;
}

/** The reflection's block, after the light and before the tone curve and the fog: the sky, the sun's flash, the far band. */
export function seaBlock(): string {
  const s = SEA_LOOK, sun = sunDiscDirection(new THREE.Vector3()), flat = new THREE.Vector2(sun.x, sun.z).normalize();
  const glint = new THREE.Color(s.glint.color);
  return `{
      vec3 seaR = reflect( seaV, seaN );
      seaR.y = abs( seaR.y );
      // Fresnel between the calm plane's and the facet's (the facet's alone flips at a grazing angle); none on foam
      float seaFc = ${f(s.f0)} + ${f(1 - s.f0)} * pow( 1.0 - clamp( - seaV.y, 0.0, 1.0 ), 5.0 );
      float seaFf = ${f(s.f0)} + ${f(1 - s.f0)} * pow( 1.0 - clamp( dot( seaN, - seaV ), 0.0, 1.0 ), 5.0 );
      float seaF = mix( seaFc, seaFf, ${f(s.facetFresnel)} ) * ( 1.0 - seaFoam );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, seaSky( seaR ), seaF );
      float seaGlint = pow( max( 0.0, dot( seaR, ${v3(sun.x, sun.y, sun.z)} ) ), ${f(s.glint.sharp)} ) * seaSharp * sunSeen * ( 1.0 - seaFoam );
      float seaAcross = max( 0.0, dot( normalize( seaV.xz ), vec2( ${f(flat.x)}, ${f(flat.y)} ) ) );
      float seaBand = pow( seaAcross, ${f(s.band.sharp)} ) * ( 1.0 - seaNear ) * sunSeen * step( ${f(1 - s.band.lit)}, fract( seaH + seaTime * 0.45 ) );
      gl_FragColor.rgb += ${v3(glint.r, glint.g, glint.b)} * ( ${f(s.glint.strength)} * seaGlint + ${f(s.band.strength)} * seaBand );
    }`;
}

/** The map of a sea with no ground's readings (the grid's): one deep point. */
const DEEP_MAP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
  t.needsUpdate = true;
  return t;
})();

/** Where the sea reads the depth under it: its map and the box it covers (x0, z0, 1 / width, 1 / depth; world metres). */
export interface SeaDepthSource { texture: THREE.Texture; box: THREE.Vector4 }

/**
 * The sea's hook on its material, after its others (the shadow's edge): the depth under it, the facets on the swell and
 * their light, the foam, the sky in them, the sun's path.
 */
export function lookOfTheSea(material: THREE.MeshLambertMaterial, depth?: SeaDepthSource): THREE.MeshLambertMaterial {
  const previous = material.onBeforeCompile.bind(material), cacheKey = material.customProgramCacheKey();
  const map = { value: depth?.texture ?? DEEP_MAP }, box = { value: depth?.box ?? new THREE.Vector4(0, 0, 1, 1) };
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms['seaTime'] = SEA_TIME;
    shader.uniforms['seaDepthMap'] = map;
    shader.uniforms['seaDepthBox'] = box;
    catchSunSeen(shader);
    shader.vertexShader = `varying vec3 vSeaPos;\n${shader.vertexShader}`.replace('#include <project_vertex>', `#include <project_vertex>
      vSeaPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`);
    shader.fragmentShader = `${seaHead()}\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>${seaSurfaceBlock()}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${seaNormalBlock()}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n    ${seaBlock()}`);
  };
  material.customProgramCacheKey = () => `${cacheKey}-sea-swell-v2`;
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
