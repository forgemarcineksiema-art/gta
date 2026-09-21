import type * as THREE from 'three';

/** Opaque paint blends into the same lit ground colour, with no extra draw pass. */
export function fadeRoadPaint(material: THREE.Material): void {
  const previous = material.onBeforeCompile.bind(material), cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.vertexShader = `attribute vec4 roadPaint;
      varying vec4 vRoadPaint;
      varying vec3 vRoadView;
      ${shader.vertexShader}`.replace('#include <project_vertex>', `#include <project_vertex>
      vRoadPaint = roadPaint;
      vRoadView = mvPosition.xyz;`);
    shader.fragmentShader = `varying vec4 vRoadPaint;
      varying vec3 vRoadView;
      ${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
      if (vRoadPaint.a > 0.0) {
        float end = vRoadPaint.a * 255.0 * sqrt(max(cameraPosition.y, 1.0) / 4.0);
        float fade = smoothstep(end * 0.5, end, length(vRoadView));
        diffuseColor.rgb = mix(diffuseColor.rgb, vRoadPaint.rgb, fade);
      }`);
  };
  material.customProgramCacheKey = () => `${cacheKey}-road-paint-v1`;
}
