import * as THREE from 'three';

export const SHADOW_HALF = 140;
export const SUN_OFFSET = new THREE.Vector3(-180, 270, -120);
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
