/**
 * The island drawn (M8.10 slices 2–3): the ground a chunk at a time (`GroundView`); the graded roads as strips on it,
 * each hung with a skirt so no gap shows under its edge; the paved places as slabs; the coast's things: bollards along
 * the quays, a parapet along the cliffs and the Quay's bay, boulders along the rocks, the spit and the causeway; the
 * sea; the Crown Tower on the summit as the one landmark for now. Reads the sim's island, never writes it.
 */
import * as THREE from 'three';
import { ISLAND_COLORS, PALETTE, SEA } from '../../sim';
import { APRON, HALF_WIDTH, type CoastKind } from '../../sim/island/ground';
import { CHUNK, type Island } from '../../sim/island/Island';
import { PLACES } from '../../sim/island/plan';
import { QUALITY, type QualityTier } from '../quality';
import { GroundView } from './GroundView';

/** Road strips sit this far over the ground so the two never fight, their skirts hang this far under their edges (m). */
const LIFT = 0.1;
const ROAD_SKIRT = 0.8;
/** The paved places' slabs: this far over the ground, under the roads' strips; a quad about this big (m). */
const PAVE_LIFT = 0.09;
const PAVE_CELL = 8;
/** The chunks within this of the car are built at the start; the rest a few columns a frame (m). */
const SNAP_REACH = 400;
/** The coast's things (m): bollards along a quay, a parapet's height and thickness, boulders along the rocks. */
const BOLLARD = { every: 10, radius: 0.22, height: 0.7, inset: 0.35 } as const;
const PARAPET = { height: 0.9, half: 0.3, inset: 0.35 } as const;
const BOULDER = { every: 4.5, min: 0.9, max: 2.6 } as const;

export class IslandView {
  private readonly group = new THREE.Group();
  private readonly ground: GroundView;
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene, private readonly island: Island) {
    scene.add(this.group);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ color: PALETTE.water }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = SEA.level;
    this.group.add(sea);
    this.ground = new GroundView(island);
    this.group.add(this.ground.group);
    this.group.add(this.roads());
    this.group.add(this.paving());
    this.group.add(...this.coast());
    this.group.add(this.tower());
  }

  /** Build the ground's chunks within sight of (x, z), a few columns a frame (the near ones at once when `snap`). */
  sync(x: number, z: number, quality: QualityTier, snap = false): void {
    const reach = QUALITY[quality].far + CHUNK * 0.75;
    if (snap) this.ground.sync(x, z, Math.min(reach, SNAP_REACH), true);
    this.ground.sync(x, z, reach);
  }

  dispose(): void {
    this.ground.dispose();
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        (o.geometry as THREE.BufferGeometry).dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }

  /**
   * The graded roads as strips a hair over the ground (its heights at their edges and middle, so they lie on it where
   * two roads blend), each edge hung with a skirt: asphalt, the taxiways' concrete, the quarry's dirt.
   */
  private roads(): THREE.Mesh {
    const pos: number[] = [], col: number[] = [];
    const c = this.color, ground = this.island.ground;
    const quad = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number): void => {
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
      for (let v = 0; v < 6; v++) col.push(c.r, c.g, c.b);
    };
    for (const road of ground.roads) {
      const n = road.pts.length, last = road.closed ? n : n - 1, hw = HALF_WIDTH[road.cls];
      // a cross-section: the left edge, the middle, the right edge, each on the ground
      const section = (k: number): number[] => {
        const p = road.pts[(k + n) % n] as readonly [number, number];
        const prev = road.pts[road.closed ? (k - 1 + n) % n : Math.max(0, k - 1)] as readonly [number, number];
        const next = road.pts[road.closed ? (k + 1) % n : Math.min(n - 1, k + 1)] as readonly [number, number];
        const tx = next[0] - prev[0], tz = next[1] - prev[1], l = Math.hypot(tx, tz) || 1;
        const nx = -tz / l, nz = tx / l;
        const out: number[] = [];
        for (const s of [1, 0, -1]) {
          const x = p[0] + nx * hw * s, z = p[1] + nz * hw * s;
          out.push(x, ground.height(x, z) + LIFT, z);
        }
        return out;
      };
      c.setHex(road.cls === 'dirt' ? ISLAND_COLORS.dirt : road.cls === 'taxiway' ? PALETTE.concrete : PALETTE.asphalt);
      let a = section(0);
      for (let k = 0; k < last; k++) {
        const b = section(k + 1);
        const [l0x, l0y, l0z, m0x, m0y, m0z, r0x, r0y, r0z] = a as [number, number, number, number, number, number, number, number, number];
        const [l1x, l1y, l1z, m1x, m1y, m1z, r1x, r1y, r1z] = b as [number, number, number, number, number, number, number, number, number];
        // the two halves of the strip, facing up (the left edge is left of the way the road runs)
        quad(l0x, l0y, l0z, l1x, l1y, l1z, m1x, m1y, m1z, m0x, m0y, m0z);
        quad(m0x, m0y, m0z, m1x, m1y, m1z, r1x, r1y, r1z, r0x, r0y, r0z);
        // the skirts under the edges, facing out
        quad(l0x, l0y, l0z, l0x, l0y - ROAD_SKIRT, l0z, l1x, l1y - ROAD_SKIRT, l1z, l1x, l1y, l1z);
        quad(r1x, r1y, r1z, r1x, r1y - ROAD_SKIRT, r1z, r0x, r0y - ROAD_SKIRT, r0z, r0x, r0y, r0z);
        a = b;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -3 }));
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * The paved places as slabs a hair over the ground (the ground's mesh follows too coarsely for their edges): the
   * runway, the yards, the lots and the hangars' aprons, the summit's plaza, the port's aprons behind its quays.
   */
  private paving(): THREE.Mesh {
    const ground = this.island.ground, pos: number[] = [], col: number[] = [];
    const c = this.color;
    // a grid of quads over (u, v) in [0, 1]², each corner put on the ground by `at`
    const sheet = (hex: number, nu: number, nv: number, at: (u: number, v: number) => readonly [number, number]): void => {
      c.setHex(hex);
      const corner = (u: number, v: number): [number, number, number] => {
        const [x, z] = at(u / nu, v / nv);
        return [x, ground.height(x, z) + PAVE_LIFT, z];
      };
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const a = corner(i, j), b = corner(i + 1, j), d = corner(i, j + 1), e = corner(i + 1, j + 1);
        pos.push(...a, ...d, ...e, ...a, ...e, ...b);
        for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
      }
    };
    const rect = (r: { x0: number; z0: number; x1: number; z1: number }, hex: number): void => {
      sheet(hex, Math.max(1, Math.ceil((r.x1 - r.x0) / PAVE_CELL)), Math.max(1, Math.ceil((r.z1 - r.z0) / PAVE_CELL)), (u, v) => [r.x0 + (r.x1 - r.x0) * u, r.z0 + (r.z1 - r.z0) * v]);
    };
    rect(PLACES.runway, PALETTE.asphalt);
    for (const r of [PLACES.railYard, PLACES.carPark, PLACES.headquarters, PLACES.donutShop, ...PLACES.containerYards, ...PLACES.hangars]) rect(r, ISLAND_COLORS.paving);
    const plaza = PLACES.summitPlaza;
    sheet(ISLAND_COLORS.paving, Math.ceil((2 * Math.PI * plaza.r) / PAVE_CELL), Math.ceil(plaza.r / PAVE_CELL), (u, v) => [plaza.x + Math.cos(u * 2 * Math.PI) * plaza.r * v, plaza.z + Math.sin(u * 2 * Math.PI) * plaza.r * v]);
    // the port's aprons: a band behind each quay's line, from its edge in
    for (const line of ground.coasts) {
      const n = line.pts.length, segs = line.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        if (line.kinds[i] !== 'quay') continue;
        const a = line.pts[i] as readonly [number, number], b = line.pts[(i + 1) % n] as readonly [number, number];
        const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
        const nx = (-dz / l) * line.land, nz = (dx / l) * line.land;
        sheet(ISLAND_COLORS.paving, 1, 3, (u, v) => {
          const s = 0.05 + (APRON - 0.05) * v;
          return [a[0] + dx * u + nx * s, a[1] + dz * u + nz * s];
        });
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -1 }));
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * The coast's things along the shores: bollards on the quays' edges, a parapet on the cliffs' and the bay's, boulders
   * along the rocks, the spit and the causeway; each where the island's wall stands, so they read as what stops a car.
   */
  private coast(): THREE.Object3D[] {
    const ground = this.island.ground;
    const bollards: THREE.Matrix4[] = [], boulders: THREE.Matrix4[] = [];
    const parapet: number[] = [];
    let seed = 7;
    const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const line of ground.coasts) {
      const pts = line.pts, n = pts.length, segs = line.closed ? n : n - 1;
      let carry = 0;
      for (let i = 0; i < segs; i++) {
        const a = pts[i] as readonly [number, number], b = pts[(i + 1) % n] as readonly [number, number];
        const kind: CoastKind = line.kinds[i] ?? 'rocks';
        const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
        if (len < 0.01) continue;
        // toward the land
        const nx = (-dz / len) * line.land, nz = (dx / len) * line.land;
        if (kind === 'cliff' || kind === 'bay') {
          // a parapet just behind the edge: its two long faces and its top, on the land's height at each end
          const ha = ground.height(a[0] + nx * 2, a[1] + nz * 2), hb = ground.height(b[0] + nx * 2, b[1] + nz * 2);
          const o = PARAPET.inset, w = PARAPET.half, t = PARAPET.height;
          const ax0 = a[0] + nx * (o - w), az0 = a[1] + nz * (o - w), ax1 = a[0] + nx * (o + w), az1 = a[1] + nz * (o + w);
          const bx0 = b[0] + nx * (o - w), bz0 = b[1] + nz * (o - w), bx1 = b[0] + nx * (o + w), bz1 = b[1] + nz * (o + w);
          parapet.push(
            // the sea side, the land side, the top (each two triangles)
            ax0, ha - 0.3, az0, bx0, hb - 0.3, bz0, bx0, hb + t, bz0, ax0, ha - 0.3, az0, bx0, hb + t, bz0, ax0, ha + t, az0,
            bx1, hb - 0.3, bz1, ax1, ha - 0.3, az1, ax1, ha + t, az1, bx1, hb - 0.3, bz1, ax1, ha + t, az1, bx1, hb + t, bz1,
            ax0, ha + t, az0, bx0, hb + t, bz0, bx1, hb + t, bz1, ax0, ha + t, az0, bx1, hb + t, bz1, ax1, ha + t, az1,
          );
        }
        const every = kind === 'quay' ? BOLLARD.every : kind === 'rocks' || kind === 'spit' ? BOULDER.every : 0;
        if (every === 0) continue;
        for (let d = carry; d < len; d += every) {
          const x = a[0] + (dx / len) * d, z = a[1] + (dz / len) * d;
          if (kind === 'quay') {
            const bx = x + nx * BOLLARD.inset, bz = z + nz * BOLLARD.inset;
            p.set(bx, ground.height(bx, bz), bz);
            bollards.push(m.compose(p, q.identity(), s.set(1, 1, 1)).clone());
          } else {
            // a boulder or two, from just behind the edge (on the land) out into the water (at the foot of its face)
            for (let k = rnd() < 0.5 ? 1 : 2; k > 0; k--) {
              const out = -2.5 + rnd() * 3.3, bx = x + nx * out + (rnd() - 0.5) * 2, bz = z + nz * out + (rnd() - 0.5) * 2;
              const size = BOULDER.min + rnd() * (BOULDER.max - BOULDER.min);
              p.set(bx, (out < 0 ? SEA.level - 0.4 : ground.height(bx, bz)) + size * 0.1, bz);
              q.setFromAxisAngle(up, rnd() * Math.PI * 2);
              boulders.push(m.compose(p, q, s.set(size * (0.9 + rnd() * 0.4), size * (0.6 + rnd() * 0.3), size * (0.9 + rnd() * 0.4))).clone());
            }
          }
        }
        carry = (every - ((len - carry) % every)) % every;
      }
    }
    const out: THREE.Object3D[] = [];
    const instanced = (geometry: THREE.BufferGeometry, colour: number, list: THREE.Matrix4[]): void => {
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: colour, flatShading: true }), list.length);
      list.forEach((mat, k) => mesh.setMatrixAt(k, mat));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      out.push(mesh);
    };
    const bollard = new THREE.CylinderGeometry(BOLLARD.radius * 0.8, BOLLARD.radius, BOLLARD.height, 7);
    bollard.translate(0, BOLLARD.height / 2, 0);
    instanced(bollard, PALETTE.charcoal, bollards);
    instanced(new THREE.IcosahedronGeometry(0.5, 0), ISLAND_COLORS.rock, boulders);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(parapet, 3));
    geometry.computeVertexNormals();
    const wall = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: PALETTE.kerb, flatShading: true, side: THREE.DoubleSide }));
    wall.castShadow = true;
    wall.receiveShadow = true;
    out.push(wall);
    return out;
  }

  /** The Crown Tower on the summit: until the summit's plaza is built (slice 8), the island's one landmark. */
  private tower(): THREE.Group {
    const g = new THREE.Group();
    const base = this.island.heightAt(PLACES.towerTop.x, PLACES.towerTop.z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(28, 94, 28), new THREE.MeshLambertMaterial({ color: 0xd8cbb0, flatShading: true }));
    body.position.set(PLACES.towerTop.x, base + 47, PLACES.towerTop.z);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshLambertMaterial({ color: 0xf5cd75, flatShading: true }));
    crown.position.set(PLACES.towerTop.x, base + 100, PLACES.towerTop.z);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.8, 18, 0.8), new THREE.MeshLambertMaterial({ color: 0xf5cd75 }));
    mast.position.set(PLACES.towerTop.x, base + 115, PLACES.towerTop.z);
    body.castShadow = true;
    g.add(body, crown, mast);
    return g;
  }
}
