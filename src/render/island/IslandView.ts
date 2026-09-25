/**
 * The island drawn (M8.10 slices 2–3, 6): the ground a chunk at a time (`GroundView`); the roads' surfaces a chunk (the
 * sim's strips, junctions, pavements and paint); the paved places as slabs; the highway's structures (decks with
 * railings and piers, the tunnel's walls, roof and portals); the coast's things: bollards along the quays, a parapet
 * along the cliffs and the Quay's bay, boulders along the rocks, the spit and the causeway; the sea; the Crown Tower on
 * the summit as the one landmark for now. Reads the sim's island, never writes it.
 */
import * as THREE from 'three';
import { ISLAND_COLORS, PALETTE, SEA } from '../../sim';
import { APRON, type CoastKind } from '../../sim/island/ground';
import { CHUNK, CHUNKS_X, CHUNK_X0, CHUNK_Z0, type Island } from '../../sim/island/Island';
import { DECK, type Piece } from '../../sim/island/structures';
import { PLACES } from '../../sim/island/plan';
import { cityGeometry } from '../city/CityView';
import { lightCity } from '../city/glow';
import { fadeRoadPaint } from '../city/roadPaint';
import { QUALITY, type QualityTier } from '../quality';
import { GroundView, MOUTH } from './GroundView';
import { placeViews, type PlaceView } from './places';

/** The paved places' slabs: this far over the ground, under the roads' strips; a quad about this big (m). */
const PAVE_LIFT = 0.035;
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
  /** The roads' surfaces' meshes and the buildings' by chunk. */
  private readonly surfaceChunks = new Map<number, THREE.Mesh>();
  private readonly buildingChunks = new Map<number, THREE.Mesh>();
  /** The places that move (slices 8–12). */
  private readonly views: PlaceView[];

  constructor(scene: THREE.Scene, private readonly island: Island) {
    scene.add(this.group);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ color: PALETTE.water }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = SEA.level;
    this.group.add(sea);
    this.ground = new GroundView(island);
    this.group.add(this.ground.group);
    this.group.add(this.surfaces());
    this.group.add(this.buildings());
    this.group.add(this.paving());
    this.group.add(this.structures());
    this.group.add(...this.coast());
    this.group.add(this.tower());
    this.views = placeViews(this.group, island);
  }

  /** The places that move, each frame (`alpha` the fixed step's fraction, `dt` the frame's seconds). */
  update(alpha: number, dt: number): void {
    for (const v of this.views) v.update?.(alpha, dt);
  }

  /** Build the ground's chunks within sight of (x, z), a few columns a frame (the near ones at once when `snap`). */
  sync(x: number, z: number, quality: QualityTier, snap = false): void {
    const reach = QUALITY[quality].far + CHUNK * 0.75;
    if (snap) this.ground.sync(x, z, Math.min(reach, SNAP_REACH), true);
    this.ground.sync(x, z, reach);
    for (const list of [this.surfaceChunks, this.buildingChunks]) for (const [k, mesh] of list) {
      const i = k % CHUNKS_X, j = Math.floor(k / CHUNKS_X);
      mesh.visible = Math.hypot(CHUNK_X0 + (i + 0.5) * CHUNK - x, CHUNK_Z0 + (j + 0.5) * CHUNK - z) < reach;
    }
  }

  /** The lots' buildings, their plinths and the palms (the sim's fill, slice 7a), a mesh a chunk in the grid's kit. */
  private buildings(): THREE.Group {
    const g = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    fadeRoadPaint(material);
    lightCity(material);
    for (const [k, list] of this.island.fill.chunks) {
      const mesh = new THREE.Mesh(cityGeometry(list), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.buildingChunks.set(k, mesh);
      g.add(mesh);
    }
    return g;
  }

  dispose(): void {
    for (const v of this.views) v.dispose?.();
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
   * The roads' surfaces (the sim's, slice 6b), a mesh a chunk: the strips a hair over the ground, the junctions, the
   * pavements on their kerbs, the paint; each chunk shown within sight as the ground's are.
   */
  private surfaces(): THREE.Group {
    const g = new THREE.Group(), c = this.color;
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -3 });
    for (const [k, chunk] of this.island.surfaces.chunks) {
      const col = new Float32Array(chunk.positions.length);
      chunk.colors.forEach((hex, t) => {
        c.setHex(hex);
        for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], t * 9 + v * 3);
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(chunk.positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.surfaceChunks.set(k, mesh);
      g.add(mesh);
    }
    return g;
  }

  /**
   * The highway's structures (slice 6a): each deck a concrete slab under an asphalt top with its railings, on piers down
   * to the ground or the sea's floor (the viaduct's, the bridge's); the tunnel's floor, walls and roof, and a face over
   * each mouth up past the hill's cut edge.
   */
  private structures(): THREE.Mesh {
    const pos: number[] = [], col: number[] = [], c = this.color;
    const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const unit = box.getAttribute('position') as THREE.BufferAttribute;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    // a box `hx, hy, hz` (half) at the piece's local offset, turned with it (`flat`: its heading only)
    const put = (p: Piece, hx: number, hy: number, hz: number, ox: number, oy: number, oz: number, hex: number, flat = false): void => {
      e.set(flat ? 0 : -p.pitch, p.yaw, 0, 'YXZ');
      q.setFromEuler(e);
      v.set(ox, oy, oz).applyQuaternion(q).add(s.set(p.x, p.y, p.z));
      m.compose(v, q, s.set(hx * 2, hy * 2, hz * 2));
      c.setHex(hex);
      for (let i = 0; i < unit.count; i++) {
        v.fromBufferAttribute(unit, i).applyMatrix4(m);
        pos.push(v.x, v.y, v.z);
        col.push(c.r, c.g, c.b);
      }
    };
    const ground = this.island.ground;
    for (const st of this.island.structures) {
      st.pieces.forEach((p, k) => {
        const half = p.length / 2 + 0.25;
        put(p, DECK.half, DECK.depth / 2, half, 0, -DECK.depth / 2 - 0.02, 0, PALETTE.concrete);
        put(p, DECK.half - 0.4, 0.02, half, 0, 0, 0, PALETTE.asphalt);
        if (st.kind === 'tunnel') {
          for (const side of [-1, 1]) put(p, 0.5, DECK.clear / 2, half, side * (DECK.half + 0.5), DECK.clear / 2, 0, ISLAND_COLORS.quayWall);
          put(p, DECK.half + 1, 0.5, half, 0, DECK.clear + 0.5, 0, PALETTE.charcoal);
          return;
        }
        for (const side of [-1, 1]) put(p, 0.15, DECK.railing / 2, half, side * (DECK.half - 0.15), DECK.railing / 2, 0, PALETTE.kerb);
        // piers every fifth piece under the long decks, down to the ground or the sea's floor
        if ((st.kind === 'viaduct' || st.kind === 'bridge') && k % 5 === 2) {
          const foot = Math.min(ground.surfaceHeight(p.x, p.z), p.y - DECK.depth), tall = p.y - DECK.depth - foot;
          if (tall > 0.5) for (const side of [-1, 1]) put({ ...p, y: foot }, 1.2, tall / 2, 1.2, side * (DECK.half - 5), tall / 2, 0, PALETTE.concrete, true);
        }
      });
      if (st.kind !== 'tunnel') continue;
      // a face over each mouth, from the roof up past the hill where its cut edge is (the ground is cut back inside)
      for (const [p, sign] of [[st.pieces[0], 1], [st.pieces[st.pieces.length - 1], -1]] as const) {
        if (!p) continue;
        const ux = Math.sin(p.yaw) * sign, uz = Math.cos(p.yaw) * sign;
        const mx = p.x + ux * (p.length / 2), mz = p.z + uz * (p.length / 2);
        const roof = p.y + DECK.clear + 1, hill = ground.surfaceHeight(mx + ux * MOUTH, mz + uz * MOUTH) + 1;
        if (hill > roof) put({ ...p, x: mx, y: roof, z: mz }, DECK.half + 4, (hill - roof) / 2, 0.8, 0, (hill - roof) / 2, 0, PALETTE.concrete, true);
      }
    }
    box.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.castShadow = true;
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
        return [x, ground.surfaceHeight(x, z) + PAVE_LIFT, z];
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
