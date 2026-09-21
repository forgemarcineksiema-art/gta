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

/**
 * Extruded convex polygon in world coordinates: a top fan facing +Y and outward
 * side quads, no bottom. Winding is fixed here, so callers pass points in any order.
 */
export function prismGeometry(points: Array<{ x: number; z: number }>, y0: number, y1: number): THREE.BufferGeometry {
  const n = points.length;
  let ox = 0, oz = 0;
  for (const p of points) { ox += p.x / n; oz += p.z / n; }
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i] as { x: number; z: number }, b = points[(i + 1) % n] as { x: number; z: number };
    area += (a.x - ox) * (b.z - oz) - (b.x - ox) * (a.z - oz);
  }
  const pts = area > 0 ? [...points].reverse() : [...points];
  const pos: number[] = [], nor: number[] = [];
  const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, wx: number, wy: number, wz: number) => {
    // Emit with the winding whose geometric normal agrees with the wanted normal (wx, wy, wz).
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const flip = nx * wx + ny * wy + nz * wz < 0;
    pos.push(ax, ay, az);
    if (flip) pos.push(cx, cy, cz, bx, by, bz); else pos.push(bx, by, bz, cx, cy, cz);
    nor.push(wx, wy, wz, wx, wy, wz, wx, wy, wz);
  };
  for (let i = 0; i < n; i++) {
    const a = pts[i] as { x: number; z: number }, b = pts[(i + 1) % n] as { x: number; z: number };
    tri(ox, y1, oz, a.x, y1, a.z, b.x, y1, b.z, 0, 1, 0);
    const ex = b.x - a.x, ez = b.z - a.z, len = Math.hypot(ex, ez) || 1;
    let mx = ez / len, mz = -ex / len;
    if (mx * ((a.x + b.x) / 2 - ox) + mz * ((a.z + b.z) / 2 - oz) < 0) { mx = -mx; mz = -mz; }
    tri(a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z, mx, 0, mz);
    tri(a.x, y0, a.z, b.x, y1, b.z, a.x, y1, a.z, mx, 0, mz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
