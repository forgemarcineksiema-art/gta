import * as THREE from 'three';
import type { City } from '../sim';
import { cityGeometry } from './CityView';

/**
 * Landmark silhouettes that stay readable through the haze: the same fog colour,
 * but fading over three times the fog distance and never past 82 %, so the tower, the
 * chimney, the mast and the hotel sign place the player from any district.
 * Up close the silhouettes sit just inside the real chunk geometry.
 */
export function buildSkyline(city: City): THREE.Mesh {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );',
      'float fogFactor = 0.82 * smoothstep( fogNear, fogFar * 3.0, vFogDepth );',
    );
  };
  material.customProgramCacheKey = () => 'skyline-far-fog-v1';
  const mesh = new THREE.Mesh(cityGeometry(city.landmarkSilhouettes()), material);
  mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false;
  mesh.castShadow = false; mesh.receiveShadow = false;
  return mesh;
}
