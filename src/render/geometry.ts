import * as THREE from 'three';

/** Unit triangular prism, ridge along X, bottom at -1 and ridge at +1. */
export function gableGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -1,-1,-1, -1,1,0, 1,1,0,   -1,-1,-1, 1,1,0, 1,-1,-1,
    -1,1,0, -1,-1,1, 1,-1,1,  -1,1,0, 1,-1,1, 1,1,0,
    -1,-1,1, -1,-1,-1, 1,-1,-1, -1,-1,1, 1,-1,-1, 1,-1,1,
    -1,-1,-1, -1,-1,1, -1,1,0, 1,-1,1, 1,-1,-1, 1,1,0,
  ], 3));
  g.computeVertexNormals();
  return g;
}
