/**
 * The donut shop (M5.5 slice 18): a pink kiosk with a serving window and a
 * striped awning, and over it on a pole a giant donut standing on its edge,
 * iced pink on its upper half with a few sprinkles. One merged mesh, static,
 * facing the street it stands on (north, +Z).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DONUT_SHOP, PALETTE } from '../sim';

export function buildDonutShop(): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, color: number | ((x: number, y: number, z: number) => number)): void => {
    const geo = g.index ? g.toNonIndexed() : g;
    const pos = geo.getAttribute('position'), n = pos.count, col = new Float32Array(n * 3), c = new THREE.Color();
    for (let t = 0; t + 2 < n; t += 3) {
      // a face's colour from its centroid (the icing, the sprinkles), or one colour for the whole part
      const hex = typeof color === 'number' ? color
        : color((pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3, (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3);
      c.setHex(hex);
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (t + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.deleteAttribute('uv');
    parts.push(geo);
  };
  // the kiosk: pink walls, the window toward the street, the counter, an awning in stripes
  add(new THREE.BoxGeometry(4.2, 2.8, 3).translate(0, 1.4, 0), PALETTE.iceCream);
  add(new THREE.BoxGeometry(3.2, 1, 0.05).translate(0, 1.6, 1.53), 0x294653);
  add(new THREE.BoxGeometry(3.4, 0.08, 0.4).translate(0, 1.05, 1.7), PALETTE.lightGrey);
  for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(0.72, 0.06, 1.1).translate(-1.8 + k * 0.72, 2.45, 2), k % 2 ? PALETTE.carWhite : PALETTE.iceCream);
  add(new THREE.BoxGeometry(4.3, 0.12, 3.1).translate(0, 2.86, 0), PALETTE.carWhite);
  // the pole and the donut on its edge, facing the street
  add(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 8).translate(0, 5, -0.8), PALETTE.steel);
  const donut = new THREE.TorusGeometry(1.45, 0.62, 8, 18).translate(0, 8.3, -0.8);
  add(donut, (x, y, z) => {
    const up = y > 8.3 - 0.1;
    // a few sprinkles in the icing: faces picked by their position
    const sprinkle = up && Math.abs(Math.sin(x * 7.1 + z * 13.7 + y * 3.3)) > 0.93;
    return sprinkle ? (Math.sin(x * 11) > 0 ? PALETTE.coin : PALETTE.carBlue) : up ? PALETTE.iceCream : PALETTE.wafer;
  });
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.name = 'donut-shop';
  mesh.position.set(DONUT_SHOP.x, 0, DONUT_SHOP.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
