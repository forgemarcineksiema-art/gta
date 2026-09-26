/**
 * The island drawn (M8.10 slices 2–3, 6): the ground a chunk at a time (`GroundView`); the roads' surfaces a chunk (the
 * sim's strips, junctions, pavements and paint); the paved places as slabs; the highway's structures (decks with
 * railings and piers, the tunnel's walls, roof and portals); the coast's things: bollards along the quays, a parapet
 * along the cliffs and the Quay's bay, boulders along the rocks, the spit and the causeway; the sea. The places' statics
 * (the Crown Tower and the rest, slices 8–12) are drawn with the buildings. Reads the sim's island, never writes it.
 */
import * as THREE from 'three';
import { ISLAND_COLORS, PALETTE, PROP_KINDS, PropState, SEA, type PropKind, type Props, type StaticDesc } from '../../sim';
import { APRON, type CoastKind } from '../../sim/island/ground';
import { CHUNK, CHUNKS_X, CHUNKS_Z, CHUNK_X0, CHUNK_Z0, Island } from '../../sim/island/Island';
import { DECK, type Piece } from '../../sim/island/structures';
import { PLACES } from '../../sim/island/plan';
import { shoreOpen } from '../../sim/island/shapes';
import { atSlipway } from '../../sim/island/slipways';
import { BUILD_SLICE, DETAIL_FAR, DETAIL_NEAR, GeometryBuild, cityGeometry, type PropRanges } from '../city/CityView';
import { SHADOW_HALF } from '../shadows';
import { propStatics } from '../props/propMesh';
import { lightCity } from '../city/glow';
import { fadeRoadPaint } from '../city/roadPaint';
import { QUALITY, type QualityTier } from '../quality';
import { blockStatics, isEnvelope, ofBuilding, spread } from './blocks';
import { GroundView, MOUTH, chunkSphere } from './GroundView';
import { placeViews, type PlaceView } from './places';

/** The paved places' slabs: this far over the ground, under the roads' strips; a quad about this big (m). */
const PAVE_LIFT = 0.035;
const PAVE_CELL = 8;
/** The chunks within this of the car are built at the start; the rest a few columns a frame (m). */
const SNAP_REACH = 400;
/** The buildings and the roads' surfaces of the chunks within this of the car are built at the start (m); the rest, the nearest first, `BUILD_SLICE` statics a frame. */
const SNAP_BUILT = 150;
/** The standing props are drawn in the chunks whose middles are within this of the car (m), by the quality's tier. */
const PROP_SIGHT: Readonly<Record<QualityTier, number>> = { low: 200, high: 420 };
/**
 * A quarter is drawn while its nearest building is within the fog's end and this (m): past the fog's end a thing off the
 * view's middle is still short of it in depth, the fog's measure.
 */
const PAST_FOG = 50;
/** A quarter casts while its nearest building is within the shadows' box's corner (m). */
const CASTING = SHADOW_HALF * Math.SQRT2;
/** Its buildings are blocks (`blocks.ts`) from its nearest this far, by the quality's tier (m); back to the far level 30 m in. */
const BLOCK: Readonly<Record<QualityTier, number>> = { low: 140, high: 280 };
/** A statics' run that follows a building's envelope and stands on its footprint (within this, m) is the building's. */
const OWN = 3;
/** A chunk whose middle is this much further than its reach loses its meshes, made again when it comes back (m). */
const KEEP = CHUNK;
/** A quarter's placeholder while its level is built (never disposed). */
const EMPTY = new THREE.BufferGeometry();
EMPTY.userData['shadowVertices'] = 0;

/**
 * A chunk's quarter of buildings (M8.10 slice 18, the grid's parts): its statics (each building's whole), the ground
 * they cover, its three levels as built (0 the near with the facades' frames and sills, 1 the far without, both
 * `GeometryBuild`'s; 2 the blocks), the level its distance wants, and whether it is in sight.
 */
interface Part { k: number; mesh: THREE.Mesh; statics: StaticDesc[]; x0: number; x1: number; z0: number; z1: number; levels: Array<THREE.BufferGeometry | null>; level: number; seen: boolean }

/** The level a quarter whose nearest building is `d` off wants, from the one it has (the grid's hysteresis: 30 m). */
function levelAt(d: number, was: number, block: number, snap: boolean): number {
  const hold = DETAIL_FAR - DETAIL_NEAR;
  const b0 = snap || was >= 1 ? DETAIL_NEAR : DETAIL_FAR, b1 = snap || was >= 2 ? block : block + hold;
  return d >= b1 ? 2 : d >= b0 ? 1 : 0;
}
/** The coast's things (m): bollards along a quay, a parapet's height and thickness, boulders along the rocks. */
const BOLLARD = { every: 10, radius: 0.22, height: 0.7, inset: 0.35 } as const;
const PARAPET = { height: 0.9, half: 0.3, inset: 0.35 } as const;
const BOULDER = { every: 4.5, min: 0.9, max: 2.6 } as const;

/** A mesh whose shadow draws only its shadow casters, the first `shadowVertices` of its geometry (the grid's). */
function shadowPrefix(mesh: THREE.Mesh): void {
  mesh.onBeforeShadow = () => { mesh.geometry.setDrawRange(0, (mesh.geometry.userData['shadowVertices'] as number | undefined) ?? Infinity); };
  mesh.onAfterShadow = () => { mesh.geometry.setDrawRange(0, Infinity); };
}

/** How far chunk `k`'s nearest edge is from (x, z), 0 inside it (m). */
function edge(k: number, x: number, z: number): number {
  const x0 = CHUNK_X0 + (k % CHUNKS_X) * CHUNK, z0 = CHUNK_Z0 + Math.floor(k / CHUNKS_X) * CHUNK;
  return Math.hypot(Math.max(x0 - x, 0, x - x0 - CHUNK), Math.max(z0 - z, 0, z - z0 - CHUNK));
}

/** How far chunk `k`'s middle is from (x, z) (m). */
function far(k: number, x: number, z: number): number {
  return Math.hypot(CHUNK_X0 + ((k % CHUNKS_X) + 0.5) * CHUNK - x, CHUNK_Z0 + (Math.floor(k / CHUNKS_X) + 0.5) * CHUNK - z);
}

export class IslandView {
  private readonly group = new THREE.Group();
  private readonly ground: GroundView;
  private readonly color = new THREE.Color();
  /** The roads' surfaces' meshes by chunk and the buildings' quarters, made as they come in sight (`sync`); which chunks are made. */
  private readonly surfaceChunks = new Map<number, THREE.Mesh>();
  private readonly parts: Part[] = [];
  private readonly made = new Uint8Array(CHUNKS_X * CHUNKS_Z);
  /** The quarter's level being built a slice a frame. */
  private building: { part: Part; level: number; build: GeometryBuild } | null = null;
  /** The quality's tier the view was last synced for (the props' sight). */
  private tier: QualityTier = 'low';
  /** Per chunk: its roads' surfaces drawn with their detail (the kerbs' faces, the paint), near. */
  private readonly detail = new Uint8Array(CHUNKS_X * CHUNKS_Z);
  /** The highway's structures and the coast's things by chunk: their triangles as built, then their meshes. */
  private readonly extras = new Map<number, { pos: number[]; col: number[] }>();
  private readonly extraChunks = new Map<number, THREE.Mesh>();
  private readonly extraMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  private readonly surfaceGroup = new THREE.Group();
  private readonly buildingGroup = new THREE.Group();
  private readonly surfaceMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -3 });
  private readonly buildingMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  /** The places that move (slices 8–12). */
  private views: PlaceView[] = [];
  /** What is built after the first frame, one a frame (M8.10 slice 18: the start builds what its first frame needs). */
  private readonly later: Array<() => void> = [];
  private frames = 0;
  /** The standing props' meshes by chunk (slice 7b), and the props' serial they show. */
  private readonly propChunks = new Map<number, THREE.Mesh>();
  private readonly propMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private propSerial = -1;

  constructor(scene: THREE.Scene, private readonly island: Island) {
    scene.add(this.group);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ color: PALETTE.water }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = SEA.level;
    this.group.add(sea);
    this.ground = new GroundView(island);
    this.group.add(this.ground.group);
    fadeRoadPaint(this.buildingMaterial);
    lightCity(this.buildingMaterial);
    this.group.add(this.surfaceGroup, this.buildingGroup);
    this.later.push(
      () => { this.group.add(this.paving()); },
      () => { this.structures(); },
      () => { this.coast(); this.makeExtras(); },
      () => { this.views = placeViews(this.group, island); },
    );
  }

  /**
   * Each frame: the places that move (`alpha` the fixed step's fraction, `dt` the frame's seconds); the standing props
   * near (x, z), a chunk's built a frame, a knocked one's pieces collapsed and a healed one's rebuilt (slice 7b).
   */
  update(alpha: number, dt: number, props: Props | null = null, x = 0, z = 0): void {
    if (++this.frames > 1) this.later.shift()?.();
    for (const v of this.views) v.update?.(alpha, dt);
    if (!props) return;
    let built = false;
    for (let j = 0; j < CHUNKS_Z; j++) for (let i = 0; i < CHUNKS_X; i++) {
      const k = Island.chunkIndex(i, j), d = Math.hypot(CHUNK_X0 + (i + 0.5) * CHUNK - x, CHUNK_Z0 + (j + 0.5) * CHUNK - z);
      const mesh = this.propChunks.get(k), sight = PROP_SIGHT[this.tier];
      if (mesh) { mesh.visible = d < sight; mesh.castShadow = d < SHADOW_HALF + CHUNK * Math.SQRT1_2; continue; }
      if (built || d >= sight) continue;
      const list: StaticDesc[] = [];
      for (const p of this.island.props(k)) {
        const from = list.length, y = this.island.standAt(p.x, p.z);
        propStatics(p, list);
        for (let s = from; s < list.length; s++) (list[s] as StaticDesc).position.y += y;
      }
      const m = new THREE.Mesh(cityGeometry(list), this.propMaterial);
      m.castShadow = true;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      shadowPrefix(m);
      this.propChunks.set(k, m);
      this.group.add(m);
      this.applyProps(m.geometry, props);
      built = true;
    }
    if (props.serial !== this.propSerial) {
      this.propSerial = props.serial;
      for (const m of this.propChunks.values()) this.applyProps(m.geometry, props);
    }
  }

  /** A chunk's standing props as the sim has them: a knocked one's range collapsed, one standing again rebuilt (as the grid's). */
  private applyProps(geometry: THREE.BufferGeometry, props: Props): void {
    const ranges = geometry.userData['props'] as PropRanges | undefined;
    if (!ranges || ranges.ids.length === 0) return;
    let shown = geometry.userData['collapsed'] as Uint8Array | undefined;
    if (!shown) { shown = new Uint8Array(ranges.ids.length); geometry.userData['collapsed'] = shown; }
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute, pos = attr.array as Float32Array;
    let dirty = false;
    for (let k = 0; k < ranges.ids.length; k++) {
      const id = ranges.ids[k] as number, want = props.kind[id] !== 255 && props.state[id] !== PropState.Standing ? 1 : 0;
      if (want === shown[k]) continue;
      const start = ranges.start[k] as number, count = ranges.count[k] as number;
      if (want) {
        const x0 = pos[start * 3] as number, y0 = pos[start * 3 + 1] as number, z0 = pos[start * 3 + 2] as number;
        for (let v = start; v < start + count; v++) { pos[v * 3] = x0; pos[v * 3 + 1] = y0; pos[v * 3 + 2] = z0; }
      } else {
        const pieces: StaticDesc[] = [];
        propStatics({ id, kind: PROP_KINDS[props.kind[id] as number] as PropKind, x: props.x[id] as number, z: props.z[id] as number, yaw: props.yaw[id] as number }, pieces);
        for (const st of pieces) st.position.y += props.base[id] as number;
        const rebuilt = cityGeometry(pieces), src = rebuilt.getAttribute('position').array as Float32Array;
        pos.set(src.subarray(0, Math.min(src.length, count * 3)), start * 3);
        rebuilt.dispose();
      }
      shown[k] = want;
      attr.addUpdateRange(start * 3, count * 3);
      dirty = true;
    }
    if (dirty) attr.needsUpdate = true;
  }

  /**
   * Build the chunks within sight of (x, z): the ground's a few columns a frame, the buildings' and the roads' surfaces'
   * the nearest missing chunk a frame (M8.10 slice 18: the island's start builds only what is near); the near ones at
   * once when `snap`.
   */
  sync(x: number, z: number, quality: QualityTier, snap = false): void {
    this.tier = quality;
    const fog = QUALITY[quality].far, reach = fog + CHUNK * 0.75;
    if (snap) this.ground.sync(x, z, Math.min(reach, SNAP_REACH), true);
    this.ground.sync(x, z, reach);
    // the chunks in sight begun (their roads' surfaces, their quarters): the near ones at once when `snap`, else the
    // nearest missing one a frame; one far past its reach unmade
    if (snap) {
      const [ci, cj] = Island.chunkOf(x, z), here = Island.chunkIndex(ci, cj);
      for (let k = 0; k < this.made.length; k++) if (this.made[k] === 0 && (k === here || far(k, x, z) < Math.min(reach, SNAP_BUILT))) this.start(k);
    } else {
      let next = -1, best = reach;
      for (let k = 0; k < this.made.length; k++) {
        const d = far(k, x, z);
        if (this.made[k] === 1) { if (d > reach + KEEP) this.unmake(k); continue; }
        if (d < best) { best = d; next = k; }
      }
      if (next >= 0) this.start(next);
    }
    // a chunk's roads' surfaces shown inside the reach, their detail near (its nearest edge, the grid's hysteresis); the
    // structures and the coast's things shown inside the reach, casting inside the shadows'
    for (const [k, mesh] of this.surfaceChunks) {
      mesh.visible = far(k, x, z) < reach;
      const e = edge(k, x, z), was = this.detail[k] === 1, near = !snap && was ? e < DETAIL_FAR : e < DETAIL_NEAR;
      if (near === was) continue;
      this.detail[k] = near ? 1 : 0;
      mesh.geometry.setDrawRange(0, near ? Infinity : (mesh.geometry.userData['far'] as number));
    }
    const cast = SHADOW_HALF + CHUNK * Math.SQRT1_2;
    for (const [k, mesh] of this.extraChunks) {
      const d = far(k, x, z);
      mesh.visible = d < reach;
      mesh.castShadow = d < cast;
    }
    // each quarter by its nearest building: shown inside the fog, casting inside the shadows' box, its level by the
    // distance (the grid's hysteresis), its wanted level shown once built
    const block = BLOCK[quality];
    for (const p of this.parts) {
      const d = Math.hypot(Math.max(p.x0 - x, 0, x - p.x1), Math.max(p.z0 - z, 0, z - p.z1));
      p.seen = d < fog + PAST_FOG;
      p.mesh.visible = p.seen && p.mesh.geometry !== EMPTY;
      p.mesh.castShadow = d < CASTING;
      p.level = levelAt(d, p.level, block, snap);
      const want = p.levels[p.level];
      if (want && p.mesh.geometry !== want) p.mesh.geometry = want;
    }
    this.buildParts(x, z, snap);
  }

  /**
   * Build the level a shown quarter wants and has not: the nearest first, `BUILD_SLICE` statics a frame (the grid's
   * pace); every one within `SNAP_BUILT` now when `snap`.
   */
  private buildParts(x: number, z: number, snap: boolean): void {
    for (;;) {
      if (!this.building) {
        let best = snap ? SNAP_BUILT : Infinity, pick: Part | null = null;
        for (const p of this.parts) {
          if (!p.seen || p.levels[p.level]) continue;
          const d = Math.hypot(Math.max(p.x0 - x, 0, x - p.x1), Math.max(p.z0 - z, 0, z - p.z1));
          if (d < best) { best = d; pick = p; }
        }
        if (!pick) return;
        this.building = { part: pick, level: pick.level, build: new GeometryBuild(pick.level === 2 ? blockStatics(pick.statics) : pick.statics, pick.level === 0) };
      }
      const b = this.building;
      if (!b.build.step(snap ? Infinity : BUILD_SLICE)) return;
      const geometry = b.build.finish();
      b.part.levels[b.level] = geometry;
      if (b.part.level === b.level || b.part.mesh.geometry === EMPTY) {
        b.part.mesh.geometry = geometry;
        b.part.mesh.visible = b.part.seen;
      }
      this.building = null;
      if (!snap) return;
    }
  }

  /**
   * A chunk begun: its roads' surfaces now; its buildings (the sim's fill and the places, the grid's kit) in four
   * quarters, each building's pieces in its envelope's (so a building is at one level).
   */
  private start(k: number): void {
    this.made[k] = 1;
    const surface = this.surface(k);
    if (surface) {
      this.surfaceChunks.set(k, surface);
      this.surfaceGroup.add(surface);
    }
    const cx = CHUNK_X0 + ((k % CHUNKS_X) + 0.5) * CHUNK, cz = CHUNK_Z0 + (Math.floor(k / CHUNKS_X) + 0.5) * CHUNK;
    const quarterOf = (st: StaticDesc): number => (st.position.x < cx ? 0 : 1) + (st.position.z < cz ? 0 : 2);
    const quarters: StaticDesc[][] = [[], [], [], []];
    let env: StaticDesc | null = null, envQuarter = 0;
    for (const st of this.island.statics(k)) {
      if (isEnvelope(st)) { env = st; envQuarter = quarterOf(st); }
      (quarters[env && ofBuilding(env, st, OWN) ? envQuarter : quarterOf(st)] as StaticDesc[]).push(st);
    }
    for (const statics of quarters) {
      if (statics.length === 0) continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const st of statics) {
        const r = spread(st);
        x0 = Math.min(x0, st.position.x - r); x1 = Math.max(x1, st.position.x + r);
        z0 = Math.min(z0, st.position.z - r); z1 = Math.max(z1, st.position.z + r);
      }
      const mesh = new THREE.Mesh(EMPTY, this.buildingMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.visible = false;
      shadowPrefix(mesh);
      this.buildingGroup.add(mesh);
      this.parts.push({ k, mesh, statics, x0, x1, z0, z1, levels: [null, null, null], level: 2, seen: false });
    }
  }

  /** A chunk far past sight: its meshes freed (made again when it comes back). */
  private unmake(k: number): void {
    this.made[k] = 0;
    this.detail[k] = 0;
    const surface = this.surfaceChunks.get(k);
    if (surface) {
      surface.geometry.dispose();
      surface.removeFromParent();
      this.surfaceChunks.delete(k);
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i] as Part;
      if (p.k !== k) continue;
      if (this.building?.part === p) this.building = null;
      for (const g of p.levels) g?.dispose();
      p.mesh.removeFromParent();
      this.parts.splice(i, 1);
    }
  }

  dispose(): void {
    for (const v of this.views) v.dispose?.();
    for (const p of this.parts) for (const g of p.levels) g?.dispose();
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
   * A chunk's roads' surfaces (the sim's, slice 6b): the strips a hair over the ground, the junctions, the pavements on
   * their kerbs, the paint; null where none.
   */
  private surface(k: number): THREE.Mesh | null {
    const chunk = this.island.surfaceMeshes().get(k), c = this.color;
    if (!chunk) return null;
    const col = new Float32Array(chunk.positions.length);
    chunk.colors.forEach((hex, t) => {
      c.setHex(hex);
      for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], t * 9 + v * 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(chunk.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geometry.computeVertexNormals();
    // (its bound from the chunk's, not three's two passes over every vertex); drawn at its far level until near
    geometry.boundingSphere = chunkSphere(k);
    geometry.userData['far'] = chunk.far * 3;
    geometry.setDrawRange(0, chunk.far * 3);
    const mesh = new THREE.Mesh(geometry, this.surfaceMaterial);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  /** The bucket of the structures' and the coast's triangles of the chunk (x, z) is in. */
  private bucket(x: number, z: number): { pos: number[]; col: number[] } {
    const k = Island.chunkIndex(...Island.chunkOf(x, z));
    let b = this.extras.get(k);
    if (!b) { b = { pos: [], col: [] }; this.extras.set(k, b); }
    return b;
  }

  /** The structures' and the coast's meshes, one a chunk (shown and casting by the car's distance, `sync`). */
  private makeExtras(): void {
    for (const [k, b] of this.extras) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, this.extraMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.extraChunks.set(k, mesh);
      this.group.add(mesh);
    }
    this.extras.clear();
  }

  /**
   * The highway's structures (slice 6a), into their chunks' buckets: each deck a concrete slab under an asphalt top with
   * its railings, on piers down to the ground or the sea's floor (the viaduct's, the bridge's); the tunnel's floor, walls
   * and roof, and a face over each mouth up past the hill's cut edge.
   */
  private structures(): void {
    const c = this.color;
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
      const into = this.bucket(p.x, p.z);
      for (let i = 0; i < unit.count; i++) {
        v.fromBufferAttribute(unit, i).applyMatrix4(m);
        into.pos.push(v.x, v.y, v.z);
        into.col.push(c.r, c.g, c.b);
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
   * The coast's things along the shores, into their chunks' buckets: bollards on the quays' edges, a parapet on the
   * cliffs' and the bay's, boulders along the rocks, the spit and the causeway; each where the island's wall stands, so
   * they read as what stops a car.
   */
  private coast(): void {
    const ground = this.island.ground, c = this.color;
    const bollard = new THREE.CylinderGeometry(BOLLARD.radius * 0.8, BOLLARD.radius, BOLLARD.height, 7).translate(0, BOLLARD.height / 2, 0).toNonIndexed();
    const boulder = new THREE.IcosahedronGeometry(0.5, 0);
    // a unit's corners put by `m` into (x, z)'s bucket, in `hex`
    const place = (unit: THREE.BufferGeometry, hex: number, x: number, z: number): void => {
      const corners = unit.getAttribute('position') as THREE.BufferAttribute, into = this.bucket(x, z);
      c.setHex(hex);
      for (let i = 0; i < corners.count; i++) {
        p.fromBufferAttribute(corners, i).applyMatrix4(m);
        into.pos.push(p.x, p.y, p.z);
        into.col.push(c.r, c.g, c.b);
      }
    };
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
        // (no wall where a place's deck leaves the shore, nor what stands for it; a slipway's mouth is open to the eye, its
        // gate the hovercraft's: M8.10 slice 15)
        if (len < 0.01 || shoreOpen((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) || atSlipway(this.island.slipways, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
        // toward the land
        const nx = (-dz / len) * line.land, nz = (dx / len) * line.land;
        // none where a road crosses the shore (the taxiways' bridges, M8.10 slice 12), as the wall has none there
        const road = (x: number, z: number): boolean => ground.nearOtherRoad(x, z, -1, 3);
        if ((kind === 'cliff' || kind === 'bay') && !road((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) {
          // a parapet just behind the edge: its two long faces and its top, on the land's height at each end
          const ha = ground.height(a[0] + nx * 2, a[1] + nz * 2), hb = ground.height(b[0] + nx * 2, b[1] + nz * 2);
          const o = PARAPET.inset, w = PARAPET.half, t = PARAPET.height;
          const ax0 = a[0] + nx * (o - w), az0 = a[1] + nz * (o - w), ax1 = a[0] + nx * (o + w), az1 = a[1] + nz * (o + w);
          const bx0 = b[0] + nx * (o - w), bz0 = b[1] + nz * (o - w), bx1 = b[0] + nx * (o + w), bz1 = b[1] + nz * (o + w);
          const into = this.bucket((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
          c.setHex(PALETTE.kerb);
          for (let t = 0; t < 18; t++) into.col.push(c.r, c.g, c.b);
          into.pos.push(
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
          if (road(x, z)) continue;
          if (kind === 'quay') {
            const bx = x + nx * BOLLARD.inset, bz = z + nz * BOLLARD.inset;
            m.compose(p.set(bx, ground.height(bx, bz), bz), q.identity(), s.set(1, 1, 1));
            place(bollard, PALETTE.charcoal, bx, bz);
          } else {
            // a boulder or two, from just behind the edge (on the land) out into the water (at the foot of its face)
            for (let k = rnd() < 0.5 ? 1 : 2; k > 0; k--) {
              const out = -2.5 + rnd() * 3.3, bx = x + nx * out + (rnd() - 0.5) * 2, bz = z + nz * out + (rnd() - 0.5) * 2;
              const size = BOULDER.min + rnd() * (BOULDER.max - BOULDER.min);
              p.set(bx, (out < 0 ? SEA.level - 0.4 : ground.height(bx, bz)) + size * 0.1, bz);
              q.setFromAxisAngle(up, rnd() * Math.PI * 2);
              m.compose(p, q, s.set(size * (0.9 + rnd() * 0.4), size * (0.6 + rnd() * 0.3), size * (0.9 + rnd() * 0.4)));
              place(boulder, ISLAND_COLORS.rock, bx, bz);
            }
          }
        }
        carry = (every - ((len - carry) % every)) % every;
      }
    }
    bollard.dispose();
    boulder.dispose();
  }
}
