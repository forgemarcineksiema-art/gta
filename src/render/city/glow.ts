/**
 * The city lit at dusk, with depth (docs/M8.9_PLAN.md R9, slice 3): a glow per vertex in the city's shared material,
 * added after the light and before the fog, so no new draw and no light: a quarter of the windows above the ground floor
 * warm-lit, six in ten shop windows on it, the lamp heads. And the facades darker at their foot, 0.8 at the ground to
 * 1 at 12 m, with a contact band in their lowest 0.4 m (0.7): the golden hour's light pools up on the buildings.
 *
 * Which window is lit is the window's place, so the same city lights the same windows every time. The geometry's
 * `cityLook` attribute (a byte of glow, a byte of "facade") is written by `CityView`; the material's hook is here.
 */
import * as THREE from 'three';

export const GLOW = {
  /** The windows' and lamps' warm light (sRGB). */
  color: 0xffc46b,
  /** The lit shares: windows above the ground floor, and the shop windows on it (a glazing panel under `shopTop` m). */
  upper: 0.25,
  shop: 0.6,
  shopTop: 4,
  /** How much of the glow colour each adds to the lit output (0..1). */
  window: 0.65,
  shopWindow: 0.75,
  lamp: 0.9,
} as const;

/** The facades' depth: the foot's shade, the height it reaches 1 at, the contact band's shade and top (m). */
export const DEPTH = { foot: 0.8, full: 12, band: 0.7, bandTop: 0.4 } as const;

/** The statics that are a building's face: darker at the foot. */
export const FACADE_TAGS: ReadonlySet<string> = new Set(['wall', 'glazing', 'trim', 'balcony-floor', 'balcony-parapet']);

/** A 32-bit mix (lowbias32). */
function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A window's draw in [0, 1) from its place to the decimetre: the same window, the same draw. */
export function windowHash(x: number, y: number, z: number): number {
  return mix(Math.round(x * 10) ^ mix(Math.round(y * 10) ^ mix(Math.round(z * 10) + 0x9e3779b9))) / 4294967296;
}

/** A glazing panel's glow at its centre: lit by its draw, the shops on the ground floor more often and brighter. */
export function windowGlow(x: number, y: number, z: number): number {
  const shop = y < GLOW.shopTop;
  return windowHash(x, y, z) < (shop ? GLOW.shop : GLOW.upper) ? (shop ? GLOW.shopWindow : GLOW.window) : 0;
}

/** A facade's shade at a height (m): the gradient times the contact band (the shader's own sums, for the pins). */
export function facadeShade(y: number): number {
  const t = Math.min(1, Math.max(0, y / DEPTH.full));
  const b = Math.min(1, Math.max(0, y / DEPTH.bandTop));
  const smooth = b * b * (3 - 2 * b);
  return (DEPTH.foot + (1 - DEPTH.foot) * t) * (DEPTH.band + (1 - DEPTH.band) * smooth);
}

const f = (v: number): string => v.toFixed(4);

/** The city material's hook: the glow and the facades' depth, chained after its other hooks. */
export function lightCity(material: THREE.Material): void {
  const previous = material.onBeforeCompile.bind(material), cacheKey = material.customProgramCacheKey();
  const glow = new THREE.Color(GLOW.color);
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.vertexShader = `attribute vec2 cityLook;
      varying vec2 vCityLook;
      varying float vCityY;
      ${shader.vertexShader}`.replace('#include <project_vertex>', `#include <project_vertex>
      vCityLook = cityLook;
      vCityY = (modelMatrix * vec4(transformed, 1.0)).y;`);
    shader.fragmentShader = `varying vec2 vCityLook;
      varying float vCityY;
      ${shader.fragmentShader}`.replace('#include <opaque_fragment>', `#include <opaque_fragment>
      float cityT = clamp(vCityY / ${f(DEPTH.full)}, 0.0, 1.0);
      float cityShade = (${f(DEPTH.foot)} + ${f(1 - DEPTH.foot)} * cityT) * mix(${f(DEPTH.band)}, 1.0, smoothstep(0.0, ${f(DEPTH.bandTop)}, vCityY));
      gl_FragColor.rgb = gl_FragColor.rgb * mix(1.0, cityShade, vCityLook.y) + vec3(${f(glow.r)}, ${f(glow.g)}, ${f(glow.b)}) * vCityLook.x;`);
  };
  material.customProgramCacheKey = () => `${cacheKey}-city-look-v1`;
}
