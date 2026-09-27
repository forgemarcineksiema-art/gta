import type * as THREE from 'three';

/**
 * The ground under the camera (m): the paint's fade reads the camera's height over it, not over the sea (the island's
 * hill would draw the lines four times as far from its summit, M8.10); the grid's 0. The renderer sets it each frame.
 */
export const PAINT_GROUND = { value: 0 };

/** Opaque paint blends into the same lit ground colour, with no extra draw pass. */
export function fadeRoadPaint(material: THREE.Material): void {
  const previous = material.onBeforeCompile.bind(material), cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms['roadPaintGround'] = PAINT_GROUND;
    shader.vertexShader = `attribute vec4 roadPaint;
      varying vec4 vRoadPaint;
      varying vec3 vRoadView;
      ${shader.vertexShader}`.replace('#include <project_vertex>', `#include <project_vertex>
      vRoadPaint = roadPaint;
      vRoadView = mvPosition.xyz;`);
    shader.fragmentShader = `varying vec4 vRoadPaint;
      varying vec3 vRoadView;
      uniform float roadPaintGround;
      ${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
      if (vRoadPaint.a > 0.0) {
        float end = vRoadPaint.a * 255.0 * sqrt(max(cameraPosition.y - roadPaintGround, 1.0) / 4.0);
        float fade = smoothstep(end * 0.5, end, length(vRoadView));
        diffuseColor.rgb = mix(diffuseColor.rgb, vRoadPaint.rgb, fade);
      }`);
  };
  material.customProgramCacheKey = () => `${cacheKey}-road-paint-v2`;
}
