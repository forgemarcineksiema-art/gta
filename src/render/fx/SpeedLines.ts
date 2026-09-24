/**
 * Peripheral speed lines: the way arcade racers convey speed and boost.
 *
 * A fullscreen additive pass draws short streaks that rush outward from the
 * screen's periphery. The centre of the frame, where the road is, is masked
 * out, so nothing ever sits in front of the car. Streaks are grouped in random
 * angular sectors with their own phase and pace, so the effect reads as wind,
 * not as a starburst. Intensity rises with speed from ~100 km/h and jumps
 * under boost, where the tint leans cyan. One draw call, no geometry updates.
 */
import * as THREE from 'three';
import { PALETTE, type VehicleTelemetry } from '../../sim';

const SPEED_START = 27; // m/s (~97 km/h)
const SPEED_FULL = 60; // m/s (~216 km/h)

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uAspect;
  uniform vec3 uTint;

  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

  float layer(float a, float r, float sectors, float seed, float pace) {
    float s = floor(a * sectors);
    float h = hash(s + seed);
    float h2 = hash(s * 1.7 + seed + 3.0);
    // a soft strip inside each sector, most sectors empty
    float within = fract(a * sectors);
    float width = 0.28 + 0.4 * h2;
    float strip = smoothstep(0.0, 0.5 * width, within) * smoothstep(width, 0.5 * width, within);
    strip *= step(0.45, h); // 55% of sectors carry a streak
    // dashes moving outward, each sector at its own pace and phase
    float along = fract(r * (2.5 + 2.0 * h2) - uTime * pace * (0.8 + 0.7 * h) + h);
    float dash = smoothstep(0.0, 0.25, along) * smoothstep(0.98, 0.7, along);
    return strip * dash * (0.5 + 0.5 * h2);
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(p);
    float a = atan(p.y, p.x) / 6.28318530718 + 0.5; // 0..1 around the frame
    float lines = layer(a, r, 96.0, 0.0, 2.6) + 0.7 * layer(a, r, 150.0, 11.0, 3.4);
    // periphery only: nothing below r = 0.42 (the road), full strength at the corners
    float mask = smoothstep(0.36, 0.82, r);
    float alpha = clamp(lines * mask * uIntensity, 0.0, 1.0);
    gl_FragColor = vec4(uTint * alpha, alpha);
  }
`;

export class SpeedLines {
  readonly object: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly tintCruise = new THREE.Color(PALETTE.fog).lerp(new THREE.Color(0xffffff), 0.75);
  private readonly tintBoost = new THREE.Color(PALETTE.carBlue).lerp(new THREE.Color(0xffffff), 0.35);
  private boostMix = 0;
  private intensity = 0;
  private time = 0;

  constructor() {
    // one triangle covering clip space
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uIntensity: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uTint: { value: new THREE.Color() },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.object = new THREE.Mesh(g, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 100;
    this.object.visible = false;
  }

  update(tm: VehicleTelemetry, speed: number, aspect: number, dt: number): void {
    const s = Math.max(0, Math.min(1, (speed - SPEED_START) / (SPEED_FULL - SPEED_START)));
    const target = Math.min(1, s * 0.65 + (tm.boosting ? 0.4 : 0));
    this.intensity += (target - this.intensity) * Math.min(1, dt * 5);
    this.boostMix += ((tm.boosting ? 1 : 0) - this.boostMix) * Math.min(1, dt * 6);
    this.object.visible = this.intensity > 0.01;
    if (!this.object.visible) return;
    this.time += dt * (0.6 + s * 1.4 + this.boostMix * 0.8);
    const u = this.material.uniforms;
    (u.uIntensity as THREE.IUniform<number>).value = this.intensity;
    (u.uTime as THREE.IUniform<number>).value = this.time;
    (u.uAspect as THREE.IUniform<number>).value = aspect;
    (u.uTint as THREE.IUniform<THREE.Color>).value.copy(this.tintCruise).lerp(this.tintBoost, this.boostMix * 0.7);
  }
}
