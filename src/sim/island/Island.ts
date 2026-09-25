/**
 * The island for driving (M8.10 slice 2, docs/M8.10_PLAN.md): the ground as a height field a chunk at a time round the
 * car, the coast as the island's wall, the sea's surface for the hovercraft, the spawns and the highway's loop as its
 * track. What the grid's `City` gives the rest of the sim comes to the island slice by slice; until the switch it is
 * `?map=island`.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS_PROP, GROUPS_SOLID, GROUPS_TERRAIN, GROUPS_WATER } from '../collision';
import type { SpawnPoint } from '../playground';
import { SEA } from '../city/sea';
import type { SurfaceReader } from '../city/surface';
import type { RoadPoint } from '../city/roads';
import type { TrackDef, TrackSample } from '../track';
import type { P2 } from './geom';
import { GRASS } from '../city/surface';
import { PROP_LINES, chunkProps, type PropDesc, type PropPlace } from '../city/props';
import { FOOT, Ground, HALF_WIDTH, type CoastKind, type GroundProbe } from './ground';
import { buildNetwork } from './network';
import { DECK, structures, type Piece, type Structure } from './structures';
import { PAVEMENT, roadSurfaces, type RoadSurfaces } from './surfaces';
import { fillIsland, inLot, type IslandFill } from './fill';
import { buildPlaces, type Place } from './places';
import { buildServices, serviceSpots, siteRect, type ServiceSite } from './services';
import type { StaticDesc } from '../scene';
import { BOUNDS, CIRCUS, highwayLoop } from './plan';

/** A chunk of the ground: its side (m) and the height field's cell (m). The chunks cover the plan's bounds. */
export const CHUNK = 250;
export const FIELD = 2;
const CELLS = CHUNK / FIELD;
export const CHUNKS_X = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / CHUNK);
export const CHUNKS_Z = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / CHUNK);
/** The chunks' first corner: the bounds widened to whole chunks round the origin. */
export const CHUNK_X0 = -(CHUNKS_X * CHUNK) / 2;
export const CHUNK_Z0 = -(CHUNKS_Z * CHUNK) / 2;
/**
 * The island's wall (m): its height over the land at a steep edge (or over the sea at a beach), its half thickness,
 * pieces about `piece` long. At a steep edge it stands on the land just behind the line; at a beach `shallows` out in
 * the water, a hand deep, so a car wades into the surf before it meets it.
 */
const WALL = { height: 4, half: 0.5, piece: 24, shallows: 6 } as const;
/**
 * The lean a plumb ray takes on the island (Vehicle.plumbTilt): Rapier's height field misses a ray cast exactly straight
 * down (measured: most such rays pass through), and a lean this small moves nothing.
 */
export const PLUMB_TILT = 1e-4;
/** The heights of the chunks round the physics ring are worked out ahead, this many columns a step (126 heights each). */
export const PREFETCH_COLUMNS = 4;
/** The props' random stream's seed (the grid's world seed's role). */
const PROP_SEED = 42;
/** A Works lot's setback (fill.ts's rule) and the grid's pavement's width, which the grid's yards are laid from (m). */
const FOUNDRY_SETBACK = 7;
const GRID_PAVEMENT = 4.5;

export class Island {
  readonly ground = new Ground();
  /** What the wheels read (M8.10 slice 3): the ground's cover at a point. */
  readonly surface: SurfaceReader = { at: (x, z) => this.ground.surface(x, z) };
  readonly spawns: SpawnPoint[];
  /** The highway's loop as the bot's and the lap timer's track. */
  readonly route: TrackDef;
  /** The main roads' lanes (M8.10 slice 4): the grid's `RoadGraph`, for the traffic, the police, the bot and the way. */
  readonly network = buildNetwork(this.ground);
  /** The highway's structures (M8.10 slice 6a): the viaduct, the bay bridge, the overpasses, the tunnel. */
  readonly structures: Structure[] = structures((this.network.lines[0] as { pts: RoadPoint[] }).pts, highwayLoop(6).span);
  /** The roads' surfaces (M8.10 slice 6b): the strips, the junctions, the pavements and their kerbs, the paint, the bays. */
  readonly surfaces: RoadSurfaces = roadSurfaces(this.ground, this.network.graph, (x, z) => { const [i, j] = Island.chunkOf(x, z); return Island.chunkIndex(i, j); });
  /** The drive-throughs (M8.10 slice 16): their sites, beside their roads; the sim's `Services` serves the car in their bays. */
  readonly services: ServiceSite[] = serviceSpots(this.ground);
  /** The lots, their buildings and the palms (M8.10 slice 7a), off the drive-throughs' sites. */
  readonly fill: IslandFill = fillIsland(this.ground, this.surfaces, (x, z) => { const [i, j] = Island.chunkOf(x, z); return Island.chunkIndex(i, j); }, this.services.map(siteRect));
  /** Each district's places (M8.10 slices 8–12): their statics in `fill.chunks`, the ones that move stepped here. */
  readonly places: Place[];
  /** The chunks with a height field in the physics, by index. */
  readonly active = new Map<number, RAPIER.Collider>();
  /** Each physics chunk's kerbs, buildings and trunks, with its height field. */
  private readonly chunkColliders = new Map<number, RAPIER.Collider[]>();
  /** The props' runtime's hooks (M8.10 slice 7b): a chunk's props known and its posts made as it loads; its posts freed. */
  onPropsLoad: ((index: number) => void) | null = null;
  onPropsUnload: ((index: number) => void) | null = null;
  private readonly propLists = new Map<number, PropDesc[]>();
  private readonly junctionReaches = new Map<object, number>();
  private readonly probeScratch: GroundProbe = { h: 0, steep: 0, steepKind: -1, road: Infinity, surface: GRASS };
  loaded = 0;
  unloaded = 0;
  /** Chunks whose heights were worked out when the ring needed them, not ahead (the start's ring, or a prefetch late). */
  late = 0;
  /** Heights worked out, all told (the prefetch's bound a step is `PREFETCH_COLUMNS` columns of them). */
  worked = 0;
  private cx = Number.NaN;
  private cz = Number.NaN;
  /** The ring's chunks the physics wants; whether this step built one. */
  private readonly want = new Set<number>();
  private built = false;
  /** Each chunk's heights once worked out (the ground never changes): 64 kB a chunk. */
  private readonly heights = new Map<number, Float32Array>();
  /** The chunk whose heights are being worked out ahead, and how many of its columns are done. */
  private ahead: { index: number; done: number; h: Float32Array } | null = null;
  private readonly scratch = { x: 0, y: 0, z: 0, yaw: 0 };

  constructor(readonly world: RAPIER.World) {
    this.walls();
    // the sea's surface for the hovercraft's rays, and the world's edge beyond it
    const hx = (BOUNDS.x1 - BOUNDS.x0) / 2, hz = (BOUNDS.z1 - BOUNDS.z0) / 2;
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 0.5, hz).setTranslation(0, SEA.level - 0.5, 0).setCollisionGroups(GROUPS_WATER));
    for (const [x, z, sx, sz] of [[BOUNDS.x0, 0, 1, hz], [BOUNDS.x1, 0, 1, hz], [0, BOUNDS.z0, hx, 1], [0, BOUNDS.z1, hx, 1]] as const) {
      world.createCollider(RAPIER.ColliderDesc.cuboid(sx, 6, sz).setTranslation(x, 2, z).setCollisionGroups(GROUPS_SOLID).setRestitution(0.5));
    }
    this.spawns = this.spawnPoints();
    this.route = this.highwayTrack();
    this.structureColliders();
    const chunks = this.fill.chunks;
    const statics = (x: number, z: number): StaticDesc[] => {
      const [i, j] = Island.chunkOf(x, z), key = Island.chunkIndex(i, j);
      let list = chunks.get(key);
      if (!list) { list = []; chunks.set(key, list); }
      return list;
    };
    this.places = buildPlaces({ ground: this.ground, network: this.network, surfaces: this.surfaces, fill: this.fill, world, statics });
    // the drive-throughs (slice 16): fuel, repair, paint
    buildServices(this.ground, this.services, statics);
  }

  /** Run the places that move (a train, a barrier, a wheel), a fixed step. */
  step(dt: number): void {
    for (const p of this.places) p.step?.(dt);
  }

  /**
   * A chunk's props (M8.10 slice 7b), by its index: the grid's rules (`chunkProps`) along the footway runs that start in
   * it, their frontage lines kept clear of the doors of the lots behind them; worked out once, when first asked.
   */
  props(index: number): PropDesc[] {
    let list = this.propLists.get(index);
    if (list) return list;
    const i = index % CHUNKS_X, j = Math.floor(index / CHUNKS_X);
    const x0 = CHUNK_X0 + i * CHUNK, z0 = CHUNK_Z0 + j * CHUNK;
    const runs = this.surfaces.footways.filter((r) => r.x >= x0 && r.x < x0 + CHUNK && r.z >= z0 && r.z < z0 + CHUNK).map((r) => {
      // a lot's door: its street face's middle, where its path meets the footway
      const entrances = this.fill.lots.filter((l) => Math.hypot(l.x - r.x, l.z - r.z) < r.length + 60).map((l) => ({ x: l.x - Math.sin(l.yaw) * l.hz, z: l.z - Math.cos(l.yaw) * l.hz }))
        .filter((e) => { const u = (e.x - r.x) * r.dx + (e.z - r.z) * r.dz, v = (e.x - r.x) * r.nx + (e.z - r.z) * r.nz; return u >= 0 && u <= r.length && v > 0 && v < PAVEMENT + 8; });
      return { ...r, entrances };
    });
    // a Works shed's front is a yard (its barrels, pallets, crates, tyres), as the grid's: its place at the road's edge
    // in front of the lot, set back as the grid's wider pavement had it
    const places: PropPlace[] = this.fill.lots.filter((l) => l.district === 'foundry').flatMap((l): PropPlace[] => {
      const fx = Math.sin(l.yaw), fz = Math.cos(l.yaw), back = l.hz + FOUNDRY_SETBACK + PAVEMENT + GRID_PAVEMENT - PAVEMENT;
      const x = l.x - fx * back, z = l.z - fz * back;
      return x >= x0 && x < x0 + CHUNK && z >= z0 && z < z0 + CHUNK ? [{ kind: 'yard', x, z, dx: Math.cos(l.yaw), dz: -Math.sin(l.yaw), half: l.hx, nx: fx, nz: fz }] : [];
    });
    list = chunkProps(i, j, { seed: PROP_SEED, runs, places, blocked: (x, z, yaw, hx, hz) => this.propBlocked(x, z, yaw, hx, hz) }, index);
    this.propLists.set(index, list);
    return list;
  }

  /** Where a prop stands: on its pavement (the top of the kerb's slab the wheels ride there) or on the ground past it. */
  standAt(x: number, z: number): number {
    const [i, j] = Island.chunkOf(x, z);
    // where two pieces overlap (a bend's outer side), the higher: what a wheel or a ray meets first
    let top = -Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      for (const p of this.surfaces.kerbs.get(Island.chunkIndex(i + di, j + dj)) ?? []) {
        const dx = x - p.x, dz = z - p.z, s = Math.sin(p.yaw), c = Math.cos(p.yaw);
        const along = dx * s + dz * c, across = dx * c - dz * s;
        if (Math.abs(across) <= PAVEMENT / 2 && Math.abs(along) <= p.length / 2 + 0.2) top = Math.max(top, p.y + Math.tan(p.pitch) * along);
      }
    }
    return Number.isFinite(top) ? top : this.ground.surfaceHeight(x, z);
  }

  /**
   * Whether a prop's footprint (its middle, the way its +Z faces, half extents) stands where nothing may: a
   * carriageway, a junction, a lot, the water, or the walkers' band down the pavement.
   */
  private propBlocked(x: number, z: number, yaw: number, hx: number, hz: number): boolean {
    const c = Math.cos(yaw), s = Math.sin(yaw), p = this.probeScratch;
    for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const px = x + c * hx * a + s * hz * b, pz = z - s * hx * a + c * hz * b;
      if (!this.ground.onLand(px, pz) || this.ground.nearOtherRoad(px, pz, -1, 0.2)) return true;
      this.ground.probe(px, pz, p);
      if (p.road > PROP_LINES.walkers.middle - PROP_LINES.walkers.half && p.road < PROP_LINES.walkers.middle + PROP_LINES.walkers.half) return true;
    }
    for (const jn of this.surfaces.junctions) if (Math.hypot(jn.x - x, jn.z - z) < this.junctionReach(jn)) return true;
    return this.fill.lots.some((l) => Math.hypot(l.x - x, l.z - z) < Math.hypot(l.hx, l.hz) + 2 && inLot(l, x, z, Math.max(hx, hz) + 0.3));
  }

  /** How far a junction's box reaches from its middle (its rim's farthest point). */
  private junctionReach(jn: { x: number; z: number; rim: ReadonlyArray<{ x: number; z: number }> }): number {
    let r = this.junctionReaches.get(jn);
    if (r === undefined) {
      r = Math.max(...jn.rim.map((q) => Math.hypot(q.x - jn.x, q.z - jn.z)));
      this.junctionReaches.set(jn, r);
    }
    return r;
  }

  /** A chunk's index from its column and row, and a point's chunk. */
  static chunkIndex(i: number, j: number): number {
    return j * CHUNKS_X + i;
  }
  static chunkOf(x: number, z: number): [number, number] {
    return [Math.max(0, Math.min(CHUNKS_X - 1, Math.floor((x - CHUNK_X0) / CHUNK))), Math.max(0, Math.min(CHUNKS_Z - 1, Math.floor((z - CHUNK_Z0) / CHUNK)))];
  }

  /**
   * Keep the 3×3 chunks round (x, z) in the physics: a chunk's height field built as it enters (the chunk under the car
   * at once, the ring's others one a step), freed as it leaves. `force` builds the whole ring now (the start, a jump).
   */
  sync(x: number, z: number, force = false): void {
    const [ci, cj] = Island.chunkOf(x, z);
    if (force || ci !== this.cx || cj !== this.cz) {
      this.cx = ci;
      this.cz = cj;
      this.want.clear();
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= CHUNKS_X || j >= CHUNKS_Z) continue;
        this.want.add(Island.chunkIndex(i, j));
      }
      for (const [k, collider] of this.active) {
        if (this.want.has(k)) continue;
        this.world.removeCollider(collider, false);
        for (const c of this.chunkColliders.get(k) ?? []) this.world.removeCollider(c, false);
        this.chunkColliders.delete(k);
        this.onPropsUnload?.(k);
        this.active.delete(k);
        this.unloaded++;
      }
      this.load(Island.chunkIndex(ci, cj));
    }
    for (const k of this.want) {
      if (this.active.has(k)) continue;
      this.load(k);
      if (!force) break;
    }
  }

  private load(k: number): void {
    if (this.active.has(k)) return;
    this.active.set(k, this.buildChunk(k % CHUNKS_X, Math.floor(k / CHUNKS_X)));
    // the pavements' kerbs: a slab under each piece of the band, its top the pavement's, climbed by the wheels
    const colliders = (this.surfaces.kerbs.get(k) ?? []).map((p) => this.slab(p, PAVEMENT / 2, 0.5, p.length / 2 + 0.2, 0, -0.5, 0, GROUPS_TERRAIN));
    // the chunk's statics by their tags, as the grid's: a building's (and a place's wall) solid, a kerb's (a ramp's
    // deck, a floor) the wheels' ground, a tree's trunk in the props' group
    for (const st of this.fill.chunks.get(k) ?? []) {
      const p = st.position, s = st.shape;
      if (st.tag === 'trunk' && s.kind === 'cylinder') {
        colliders.push(this.world.createCollider(RAPIER.ColliderDesc.cylinder(s.halfHeight, s.radius).setTranslation(p.x, p.y, p.z).setFriction(1).setRestitution(1).setCollisionGroups(GROUPS_PROP)));
        continue;
      }
      if (st.tag !== 'building' && st.tag !== 'kerb') continue;
      const wall = st.tag === 'building';
      let desc: RAPIER.ColliderDesc | null = null;
      if (s.kind === 'box') desc = RAPIER.ColliderDesc.cuboid(s.hx, s.hy, s.hz).setTranslation(p.x, p.y, p.z).setRotation(st.rotation);
      else if (s.kind === 'prism') {
        const hull = new Float32Array(s.points.length * 6);
        s.points.forEach((q, i) => { hull.set([q.x, s.y0, q.z], i * 3); hull.set([q.x, s.y1, q.z], (s.points.length + i) * 3); });
        desc = RAPIER.ColliderDesc.convexHull(hull);
      }
      if (desc) colliders.push(this.world.createCollider(desc.setFriction(1).setRestitution(wall ? 1 : 0).setCollisionGroups(wall ? GROUPS_SOLID : GROUPS_TERRAIN)));
    }
    this.chunkColliders.set(k, colliders);
    this.onPropsLoad?.(k);
    this.loaded++;
    this.built = true;
  }

  /** Work out a chunk's heights from column `from` up to (not including) `to`, into `h`. */
  private columns(index: number, h: Float32Array, from: number, to: number): void {
    const x0 = CHUNK_X0 + (index % CHUNKS_X) * CHUNK, z0 = CHUNK_Z0 + Math.floor(index / CHUNKS_X) * CHUNK, n = CELLS + 1;
    for (let col = from; col < to; col++) for (let row = 0; row < n; row++) h[row + col * n] = this.ground.height(x0 + col * FIELD, z0 + row * FIELD);
    this.worked += Math.max(0, to - from) * n;
  }

  /** A chunk's heights: (CELLS + 1)² every `FIELD` m, column-major, the rows along z and the columns along x. */
  chunkHeights(i: number, j: number): Float32Array {
    const index = Island.chunkIndex(i, j);
    let h = this.heights.get(index);
    if (!h) {
      h = new Float32Array((CELLS + 1) * (CELLS + 1));
      const done = this.ahead?.index === index ? this.ahead.done : 0;
      if (done > 0 && this.ahead) h.set(this.ahead.h.subarray(0, done * (CELLS + 1)));
      this.columns(index, h, done, CELLS + 1);
      this.heights.set(index, h);
      this.late++;
      if (this.ahead?.index === index) this.ahead = null;
    }
    return h;
  }

  /**
   * Work out the heights of the chunks round the physics ring ahead of the car, `PREFETCH_COLUMNS` columns a step, the
   * nearest missing chunk of the 5×5 round (x, z) first, so a chunk that enters the ring finds them done.
   */
  prefetch(x: number, z: number): void {
    // a step that built a height field works nothing out ahead
    if (this.built) {
      this.built = false;
      return;
    }
    if (!this.ahead) {
      const [ci, cj] = Island.chunkOf(x, z);
      let best = -1, bestD = Infinity;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= CHUNKS_X || j >= CHUNKS_Z) continue;
        const index = Island.chunkIndex(i, j);
        if (this.heights.has(index)) continue;
        const d = Math.hypot(CHUNK_X0 + (i + 0.5) * CHUNK - x, CHUNK_Z0 + (j + 0.5) * CHUNK - z);
        if (d < bestD) { bestD = d; best = index; }
      }
      if (best < 0) return;
      this.ahead = { index: best, done: 0, h: new Float32Array((CELLS + 1) * (CELLS + 1)) };
    }
    const a = this.ahead, to = Math.min(CELLS + 1, a.done + PREFETCH_COLUMNS);
    this.columns(a.index, a.h, a.done, to);
    a.done = to;
    if (a.done === CELLS + 1) {
      this.heights.set(a.index, a.h);
      this.ahead = null;
    }
  }

  /** A chunk's height field, centred on the chunk, from its heights (worked out now if the prefetch has not). */
  buildChunk(i: number, j: number): RAPIER.Collider {
    const x0 = CHUNK_X0 + i * CHUNK, z0 = CHUNK_Z0 + j * CHUNK;
    const h = this.chunkHeights(i, j);
    const desc = RAPIER.ColliderDesc.heightfield(CELLS, CELLS, h, { x: CHUNK, y: 1, z: CHUNK })
      .setTranslation(x0 + CHUNK / 2, 0, z0 + CHUNK / 2)
      .setFriction(1)
      .setCollisionGroups(GROUPS_TERRAIN);
    return this.world.createCollider(desc);
  }

  /** The ground's height at a point. */
  heightAt(x: number, z: number): number {
    return this.ground.height(x, z);
  }

  /** Where a car put back on the road goes: the nearest graded road, its height, its heading (written into `out`). */
  nearestRoad(x: number, z: number, out: SpawnPoint): SpawnPoint {
    const p = this.scratch;
    this.ground.nearestRoad(x, z, p);
    out.position.x = p.x;
    out.position.y = p.y + 1;
    out.position.z = p.z;
    out.yaw = p.yaw;
    return out;
  }

  /**
   * The island's wall along every shore (the coast, the basin's quays, the causeway's and the islet's), a piece a stretch
   * of one kind: at a steep edge on the land just behind its line, `WALL.height` over the land's top; at a beach out in
   * the shallows, `WALL.height` over the sea; none where a road on the ground crosses the shore.
   */
  private walls(): void {
    const roads = this.ground.roads;
    const crossed = (x: number, z: number): boolean => roads.some((r) => r.pts.some((p) => Math.hypot(p[0] - x, p[1] - z) < HALF_WIDTH[r.cls] + 4));
    for (const line of this.ground.coasts) {
      const pts = line.pts, n = pts.length, segs = line.closed ? n : n - 1;
      let from = 0;
      while (from < segs) {
        const kind = line.kinds[from] ?? 'rocks';
        let to = from, run = 0;
        while (to < segs && (line.kinds[to] ?? 'rocks') === kind && run < WALL.piece) {
          const a = pts[to] as P2, b = pts[(to + 1) % n] as P2;
          run += Math.hypot(b[0] - a[0], b[1] - a[1]);
          to++;
        }
        this.wallPiece(pts[from] as P2, pts[to % n] as P2, kind, line.land, crossed);
        from = to;
      }
    }
  }

  /** One piece of the wall from `a` to `b` along a shore of `kind`, its land on the `land` side. */
  private wallPiece(a: P2, b: P2, kind: CoastKind, land: 1 | -1, crossed: (x: number, z: number) => boolean): void {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 0.5) return;
    // toward the land
    const nx = (-dz / len) * land, nz = (dx / len) * land;
    const beach = kind === 'beach';
    const off = beach ? -WALL.shallows : WALL.half;
    const mx = (a[0] + b[0]) / 2 + nx * off, mz = (a[1] + b[1]) / 2 + nz * off;
    if (crossed(mx, mz)) return;
    let top: number = SEA.level;
    if (!beach) for (const f of [0, 0.5, 1]) top = Math.max(top, this.ground.height(a[0] + dx * f + nx * 1.5, a[1] + dz * f + nz * 1.5));
    top += WALL.height;
    const bottom = FOOT - 2, yaw = Math.atan2(dx, dz);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(WALL.half, (top - bottom) / 2, len / 2 + 0.3)
      .setTranslation(mx, (top + bottom) / 2, mz)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setCollisionGroups(GROUPS_SOLID).setRestitution(0.5));
  }

  /**
   * The structures' colliders: a deck's slab (the wheels' ground) and its railings; the tunnel's floor, walls and roof,
   * the lid over its trench at the hill's surface (the roof's top at least), a face over each mouth up to the hill.
   */
  /** A box `hx, hy, hz` (half) at a piece's local offset, turned with it (`flat`: its heading only). */
  private slab(p: Piece, hx: number, hy: number, hz: number, ox: number, oy: number, oz: number, groups: number, flat = false): RAPIER.Collider {
    const pitch = flat ? 0 : p.pitch;
    // the piece's frame: its climb (+Z turned up: a turn about +X by −pitch), then its heading about +Y
    const a = -pitch, y1 = oy * Math.cos(a) - oz * Math.sin(a), z1 = oy * Math.sin(a) + oz * Math.cos(a);
    const x2 = ox * Math.cos(p.yaw) + z1 * Math.sin(p.yaw), z2 = z1 * Math.cos(p.yaw) - ox * Math.sin(p.yaw);
    const cy = Math.cos(p.yaw / 2), sy = Math.sin(p.yaw / 2), cp = Math.cos(a / 2), sp = Math.sin(a / 2);
    return this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(p.x + x2, p.y + y1, p.z + z2)
      .setRotation({ x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp }).setCollisionGroups(groups));
  }

  private structureColliders(): void {
    const put = (p: Piece, hx: number, hy: number, hz: number, ox: number, oy: number, oz: number, groups: number, flat = false): void => {
      this.slab(p, hx, hy, hz, ox, oy, oz, groups, flat);
    };
    for (const s of this.structures) {
      for (const p of s.pieces) {
        const half = p.length / 2 + 0.25;
        put(p, DECK.half, DECK.depth / 2, half, 0, -DECK.depth / 2, 0, GROUPS_TERRAIN);
        if (s.kind !== 'tunnel') {
          for (const side of [-1, 1]) put(p, 0.15, DECK.railing / 2, half, side * (DECK.half - 0.15), DECK.railing / 2, 0, GROUPS_SOLID);
          continue;
        }
        for (const side of [-1, 1]) put(p, 0.5, DECK.clear / 2, half, side * (DECK.half + 0.5), DECK.clear / 2, 0, GROUPS_SOLID);
        put(p, DECK.half + 1, 0.5, half, 0, DECK.clear + 0.5, 0, GROUPS_SOLID);
        const lid = Math.max(this.ground.surfaceHeight(p.x, p.z), p.y + DECK.clear + 1);
        put({ ...p, y: lid }, DECK.half + 4, 0.5, half, 0, -0.5, 0, GROUPS_TERRAIN, true);
      }
      if (s.kind !== 'tunnel') continue;
      // a face over each mouth, from the roof up to the hill there
      for (const [p, sign] of [[s.pieces[0], 1], [s.pieces[s.pieces.length - 1], -1]] as const) {
        if (!p) continue;
        const mx = p.x + Math.sin(p.yaw) * sign * (p.length / 2), mz = p.z + Math.cos(p.yaw) * sign * (p.length / 2);
        const roof = p.y + DECK.clear + 1, hill = this.ground.surfaceHeight(mx, mz);
        if (hill > roof + 0.5) put({ ...p, x: mx, y: roof, z: mz }, DECK.half + 4, (hill - roof) / 2, 0.5, 0, (hill - roof) / 2, 0, GROUPS_SOLID, true);
      }
    }
  }

  /** The spawns: the first minute's start at the summit, facing down Crown Avenue; the port, the beach, the runway. */
  private spawnPoints(): SpawnPoint[] {
    const at = (name: string, x: number, z: number, toX: number, toZ: number): SpawnPoint => ({
      name, position: { x, y: this.ground.height(x, z) + 1, z }, yaw: Math.atan2(toX - x, toZ - z),
    });
    // world axes (+X west, +Z north): the summit's ring's south-east point, facing the centre down Crown Avenue
    return [
      at('island', 400, 347, CIRCUS.x, CIRCUS.z),
      at('port', -180, 520, CIRCUS.x, CIRCUS.z),
      at('beach', 300, -752, 0, -752),
      at('runway', -1025, 480, -1025, 0),
    ];
  }

  /** The highway's loop sampled every 3 m, as the grid's route is. */
  private highwayTrack(): TrackDef {
    const pts: P2[] = highwayLoop(3).pts;
    const samples: TrackSample[] = [];
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i] as P2, prev = pts[(i + pts.length - 1) % pts.length] as P2, next = pts[(i + 1) % pts.length] as P2;
      const a = Math.atan2(p[0] - prev[0], p[1] - prev[1]), b = Math.atan2(next[0] - p[0], next[1] - p[1]);
      samples.push({ x: p[0], z: p[1], yaw: Math.atan2(next[0] - prev[0], next[1] - prev[1]), curvature: Math.atan2(Math.sin(b - a), Math.cos(b - a)) / 3, s });
      s += Math.hypot(next[0] - p[0], next[1] - p[1]);
    }
    const first = samples[0] as TrackSample;
    return { samples, gates: [], origin: { x: 0, z: 0 }, width: 2 * HALF_WIDTH.highway, length: s, start: { x: first.x, z: first.z, yaw: first.yaw } };
  }
}
