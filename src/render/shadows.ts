import * as THREE from 'three';

export const SHADOW_HALF = 140;
/**
 * The sun's place from the car (m): its bearing as since M2, low at the golden hour, 32° over the horizon (M8.9 R8; it
 * was 51°, a midday angle; at 25° the streets sat in their buildings' shade and read as night). The long shadows past
 * the map's half extent fade out (`fadeShadowEdges`).
 */
export const SUN_OFFSET = new THREE.Vector3(-180, 135, -120);
const direction = SUN_OFFSET.clone().normalize();
const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
const up = direction.clone().cross(right).normalize();

/** Quantise in light space: driving doesn't slide the shadow texel grid over facades. */
export function stableShadowTarget(position: THREE.Vector3, resolution: number, out: THREE.Vector3): void {
  const texel = SHADOW_HALF * 2 / resolution;
  const x = position.dot(right), y = position.dot(up);
  out.copy(position).addScaledVector(right, Math.round(x / texel) * texel - x)
    .addScaledVector(up, Math.round(y / texel) * texel - y);
}

/**
 * Whether a box (its world bounds) reaches into the shadow map round `(tx, ty, tz)`, its light-space square grown by
 * `margin` (m): what casts into the map. On the ground the map reaches ±140 m across the sun's bearing and ±265 m along
 * it (the low sun, M8.9 R8), so a distance from the car is the wrong test both ways (M8.10: the island's quarters).
 */
export function inShadowBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tx: number, ty: number, tz: number, margin = 0): boolean {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let c = 0; c < 8; c++) {
    const dx = ((c & 1) !== 0 ? x1 : x0) - tx, dy = ((c & 2) !== 0 ? y1 : y0) - ty, dz = ((c & 4) !== 0 ? z1 : z0) - tz;
    const u = dx * right.x + dy * right.y + dz * right.z, v = dx * up.x + dy * up.y + dz * up.z;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u);
    v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const h = SHADOW_HALF + margin;
  return u1 >= -h && u0 <= h && v1 >= -h && v0 <= h;
}

/** A single shadow map must fade out before its finite edge crosses visible buildings. */
export function fadeShadowEdges(material: THREE.Material): void {
  material.onBeforeCompile = (shader) => {
    // Patch the PCF getShadow branch only; the project uses one directional PCF map.
    const source = THREE.ShaderChunk.shadowmap_pars_fragment.replace(
      'return mix( 1.0, shadow, shadowIntensity );',
      `vec2 edge = min( shadowCoord.xy, vec2( 1.0 ) - shadowCoord.xy );
       float coverage = smoothstep( 0.025, 0.20, min( edge.x, edge.y ) );
       return mix( 1.0, shadow, shadowIntensity * coverage );`,
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', source);
  };
  material.customProgramCacheKey = () => 'city-shadow-edge-fade-v1';
}
