/**
 * The airfield drawn (M8.10 slice 12): nothing of it moves; its standing things are the island's statics. Here the
 * runway's paint, the sim's marks as one mesh of flat quads, pulled toward the eye a notch past the roads' surfaces (the
 * runway-link's strip runs along the runway's middle) so the paint lies on both. Reads the sim, never writes it.
 */
import * as THREE from 'three';
import type { Island } from '../../../sim/island/Island';
import type { AirfieldPlace } from '../../../sim/island/places/airfield';
import type { PlaceView } from './index';

export function airfieldViews(group: THREE.Group, island: Island): PlaceView[] {
  const place = island.places.find((p): p is AirfieldPlace => p.id === 'airfield');
  if (!place || place.marks.length === 0) return [];
  const pos = new Float32Array(place.marks.length * 18), col = new Float32Array(place.marks.length * 18), c = new THREE.Color();
  place.marks.forEach((m, k) => {
    const cos = Math.cos(m.yaw), sin = Math.sin(m.yaw);
    // the corners: local x across, local z along (turned by the yaw as the sim's statics are)
    const corner = (u: number, v: number): [number, number, number] => [m.x + cos * u + sin * v, m.y, m.z - sin * u + cos * v];
    const a = corner(-m.hx, -m.hz), b = corner(m.hx, -m.hz), d = corner(m.hx, m.hz), e = corner(-m.hx, m.hz);
    // two triangles facing up
    pos.set([...a, ...e, ...d, ...a, ...d, ...b], k * 18);
    c.setHex(m.colour);
    for (let v = 0; v < 6; v++) col.set([c.r, c.g, c.b], k * 18 + v * 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2.5, polygonOffsetUnits: -5 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  group.add(mesh);
  return [{ dispose: () => { geometry.dispose(); material.dispose(); mesh.removeFromParent(); } }];
}
