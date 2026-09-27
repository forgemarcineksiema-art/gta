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

/** The tunnel's line as its shade reads it: this many points at most (the vertex shader's loop). */
const TUNNEL_POINTS = 16;

/**
 * The tunnel's inside out of the sun (the M8.10 second bug hunt): the shadow map reaches ±140 m across the sun's bearing
 * and the tunnel runs along it, so from about 90 m ahead its road read as open air under the hill. A vertex inside, by
 * the tunnel's line (`pts`, `floor` its heights) within `half` m of it and `clear` m over its floor, takes the sun
 * off: the sky's light stays, as under the roof by the car. Chained after `fadeShadowEdges` (its return is patched).
 */
export function shadeTunnel(material: THREE.Material, line: { pts: ReadonlyArray<readonly [number, number]>; floor: readonly number[] } | null, half: number, clear: number): void {
  if (!line || line.pts.length < 2) return;
  const n = Math.min(TUNNEL_POINTS, line.pts.length), pts: THREE.Vector3[] = [];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let k = 0; k < TUNNEL_POINTS; k++) {
    const i = Math.round(Math.min(k, n - 1) * (line.pts.length - 1) / (n - 1)), p = line.pts[i] as readonly [number, number];
    pts.push(new THREE.Vector3(p[0], line.floor[i] ?? 0, p[1]));
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
  }
  const uniforms = {
    tunnelPts: { value: pts }, tunnelCount: { value: n },
    tunnelBox: { value: new THREE.Vector4(x0 - half - 2, z0 - half - 2, x1 + half + 2, z1 + half + 2) }, tunnelSize: { value: new THREE.Vector2(half, clear) },
  };
  const previous = material.onBeforeCompile.bind(material), cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `uniform vec3 tunnelPts[${TUNNEL_POINTS}];
      uniform int tunnelCount;
      uniform vec4 tunnelBox;
      uniform vec2 tunnelSize;
      varying float vTunnel;
      ${shader.vertexShader}`.replace('#include <project_vertex>', `#include <project_vertex>
      vTunnel = 0.0;
      {
        vec3 w = (modelMatrix * vec4(transformed, 1.0)).xyz;
        if (w.x > tunnelBox.x && w.x < tunnelBox.z && w.z > tunnelBox.y && w.z < tunnelBox.w) {
          float best = 1e9, floorY = 0.0;
          bool past = false;
          for (int k = 0; k < ${TUNNEL_POINTS - 1}; k++) {
            if (k + 1 >= tunnelCount) break;
            vec3 a = tunnelPts[k], b = tunnelPts[k + 1];
            vec2 ab = b.xz - a.xz;
            float t = dot(w.xz - a.xz, ab) / max(dot(ab, ab), 1e-6), tc = clamp(t, 0.0, 1.0);
            float d = length(w.xz - (a.xz + ab * tc));
            // nearest past either mouth is outside
            if (d < best) { best = d; floorY = mix(a.y, b.y, tc); past = (k == 0 && t < 0.0) || (k + 2 >= tunnelCount && t > 1.0); }
          }
          if (!past) vTunnel = (1.0 - smoothstep(tunnelSize.x - 0.5, tunnelSize.x + 1.0, best)) * (1.0 - smoothstep(tunnelSize.y + 1.0, tunnelSize.y + 2.0, w.y - floorY));
        }
      }`);
    shader.fragmentShader = `varying float vTunnel;
      ${shader.fragmentShader}`.replace('return mix( 1.0, shadow, shadowIntensity * coverage );', 'return mix( 1.0, shadow, shadowIntensity * coverage ) * ( 1.0 - vTunnel );');
  };
  material.customProgramCacheKey = () => `${cacheKey}-tunnel-shade-v1`;
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
