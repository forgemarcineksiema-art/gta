/**
 * The street furniture (M8, docs/DESIGN.md §16, docs/M8_PLAN.md D7): every lamp post, street tree, bin and bench
 * is a prop with a mass, a restitution and, when it is anchored, a base that holds up to a break impulse. This
 * module is the catalogue (`PROP_TYPES`, the numbers the pins read) and where the props stand (`chunkProps`).
 *
 * Two lines on every footway, clear of the walkers' band down its middle (2.25 ± 0.9 m from the road edge): the
 * kerb line 0.7 m from the road edge (lamp posts, saplings, bins) and the frontage line from 3.7 m (benches);
 * then each place's own (the parks, the promenade). Slots fall on one rhythm per street, measured from its
 * junction for a grid street and from its first junction for an authored road, so both halves of a block's side
 * and every stretch of a curve keep one pitch. The kinds and the gaps come from the chunk's own random stream,
 * never the stream that places the buildings, so the buildings, the billboards and the coins stay where they are.
 * What may not hold a prop (the lanes, the walkers' band, the job rings, the doors' approaches, the billboards'
 * lines, the ramps, the junctions' corners, the overpasses, the cold open's route) is the context's to say.
 */
import { mulberry32 } from '../random';

export type PropKind =
  | 'lamp' | 'sapling' | 'hydrant' | 'bin' | 'meter' | 'bench' | 'newsbox'   // everywhere (by district's rules)
  | 'table' | 'chair' | 'shelter' | 'kiosk'                                   // Crown Heights
  | 'pallet' | 'barrel' | 'crate' | 'cone' | 'barrier' | 'tyres'              // Sunset Works
  | 'fruitStand' | 'flamingo' | 'gnome' | 'fence' | 'letterbox'               // Palm Gardens
  | 'deckchair' | 'parasol' | 'fishStall' | 'lobsterPot';                     // Coral Quay
export type PropMaterial = 'metal' | 'glass' | 'wood' | 'plastic' | 'fruit' | 'paper' | 'ceramic';
export type PropShape = { kind: 'box'; hx: number; hy: number; hz: number } | { kind: 'cylinder'; radius: number; halfHeight: number };

export interface PropType {
  /** The chain's word: 'LAMP POST'. */
  name: string;
  /** kg */
  mass: number;
  /** N·s; 0 = loose. */
  breakImpulse: number;
  restitution: number;
  /** The collider and the contact radius; it stands on the ground (its centre `halfHeight` or `hy` up). */
  shape: PropShape;
  /** m above the ground. */
  comHeight: number;
  material: PropMaterial;
  /** The skill chain. */
  points: number;
  /** The sticker price: CITY DAMAGE and mayhem. */
  bill: number;
  /** Points per smash, before the sight factor. */
  heat: number;
  /** Tank fraction per smash. */
  boost: number;
  /** Casts shadows, drawn in the far level. */
  tall: boolean;
}

const box = (hx: number, hy: number, hz: number): PropShape => ({ kind: 'box', hx, hy, hz });
const cyl = (radius: number, halfHeight: number): PropShape => ({ kind: 'cylinder', radius, halfHeight });

/**
 * The catalogue, one row a kind (docs/M8_PLAN.md §3.3). Shapes are the things' real sizes: a lamp post's steel
 * pole 8 m, its weight low on the base; a sapling a staked trunk; a bus shelter 3.2 × 1.4 m of glass and steel.
 */
export const PROP_TYPES: Readonly<Record<PropKind, PropType>> = {
  lamp: { name: 'LAMP POST', mass: 140, breakImpulse: 700, restitution: 0.1, shape: cyl(0.12, 4), comHeight: 3.2, material: 'metal', points: 80, bill: 1200, heat: 3, boost: 0.04, tall: true },
  sapling: { name: 'TREE', mass: 60, breakImpulse: 400, restitution: 0.1, shape: cyl(0.15, 2.2), comHeight: 2.2, material: 'wood', points: 40, bill: 300, heat: 1, boost: 0.02, tall: true },
  hydrant: { name: 'HYDRANT', mass: 110, breakImpulse: 900, restitution: 0.1, shape: cyl(0.2, 0.4), comHeight: 0.35, material: 'metal', points: 100, bill: 900, heat: 3, boost: 0.04, tall: false },
  bin: { name: 'BIN', mass: 25, breakImpulse: 0, restitution: 0.3, shape: cyl(0.3, 0.5), comHeight: 0.45, material: 'plastic', points: 20, bill: 80, heat: 1, boost: 0.01, tall: false },
  meter: { name: 'PARKING METER', mass: 30, breakImpulse: 150, restitution: 0.2, shape: cyl(0.1, 0.7), comHeight: 0.8, material: 'metal', points: 40, bill: 400, heat: 2, boost: 0.02, tall: false },
  bench: { name: 'BENCH', mass: 45, breakImpulse: 0, restitution: 0.2, shape: box(0.9, 0.4, 0.3), comHeight: 0.4, material: 'wood', points: 40, bill: 250, heat: 1, boost: 0.02, tall: false },
  newsbox: { name: 'NEWSPAPER BOX', mass: 35, breakImpulse: 0, restitution: 0.3, shape: box(0.25, 0.55, 0.25), comHeight: 0.5, material: 'paper', points: 30, bill: 150, heat: 1, boost: 0.01, tall: false },
  table: { name: 'CAFÉ TABLE', mass: 20, breakImpulse: 0, restitution: 0.3, shape: cyl(0.4, 0.38), comHeight: 0.6, material: 'metal', points: 30, bill: 120, heat: 1, boost: 0.01, tall: true },
  chair: { name: 'CHAIR', mass: 6, breakImpulse: 0, restitution: 0.4, shape: box(0.22, 0.42, 0.22), comHeight: 0.45, material: 'plastic', points: 10, bill: 40, heat: 0, boost: 0.005, tall: false },
  shelter: { name: 'BUS SHELTER', mass: 250, breakImpulse: 1500, restitution: 0.1, shape: box(1.6, 1.25, 0.6), comHeight: 1.3, material: 'glass', points: 150, bill: 2500, heat: 4, boost: 0.06, tall: true },
  kiosk: { name: 'NEWSSTAND', mass: 400, breakImpulse: 3000, restitution: 0.1, shape: box(1.2, 1.3, 0.8), comHeight: 1.2, material: 'paper', points: 200, bill: 3000, heat: 5, boost: 0.08, tall: true },
  pallet: { name: 'PALLET', mass: 20, breakImpulse: 0, restitution: 0.3, shape: box(0.6, 0.07, 0.5), comHeight: 0.07, material: 'wood', points: 15, bill: 30, heat: 0, boost: 0.005, tall: false },
  barrel: { name: 'BARREL', mass: 60, breakImpulse: 0, restitution: 0.3, shape: cyl(0.29, 0.44), comHeight: 0.44, material: 'metal', points: 30, bill: 100, heat: 1, boost: 0.01, tall: false },
  crate: { name: 'CRATE', mass: 30, breakImpulse: 0, restitution: 0.3, shape: box(0.4, 0.4, 0.4), comHeight: 0.4, material: 'wood', points: 20, bill: 60, heat: 0, boost: 0.01, tall: false },
  cone: { name: 'CONE', mass: 4, breakImpulse: 0, restitution: 0.5, shape: cyl(0.18, 0.36), comHeight: 0.2, material: 'plastic', points: 10, bill: 20, heat: 0, boost: 0.005, tall: false },
  barrier: { name: 'BARRIER', mass: 15, breakImpulse: 0, restitution: 0.3, shape: box(0.9, 0.5, 0.2), comHeight: 0.5, material: 'plastic', points: 15, bill: 60, heat: 1, boost: 0.005, tall: false },
  tyres: { name: 'TYRES', mass: 40, breakImpulse: 0, restitution: 0.6, shape: cyl(0.33, 0.45), comHeight: 0.45, material: 'plastic', points: 20, bill: 50, heat: 0, boost: 0.01, tall: false },
  fruitStand: { name: 'FRUIT STAND', mass: 80, breakImpulse: 0, restitution: 0.2, shape: box(1.0, 0.5, 0.5), comHeight: 0.6, material: 'fruit', points: 80, bill: 600, heat: 1, boost: 0.02, tall: false },
  flamingo: { name: 'FLAMINGO', mass: 2, breakImpulse: 0, restitution: 0.5, shape: box(0.1, 0.45, 0.15), comHeight: 0.55, material: 'plastic', points: 15, bill: 25, heat: 0, boost: 0.005, tall: false },
  gnome: { name: 'GNOME', mass: 5, breakImpulse: 0, restitution: 0.4, shape: cyl(0.12, 0.2), comHeight: 0.15, material: 'ceramic', points: 25, bill: 50, heat: 0, boost: 0.005, tall: false },
  fence: { name: 'FENCE', mass: 15, breakImpulse: 0, restitution: 0.2, shape: box(1.0, 0.5, 0.04), comHeight: 0.5, material: 'wood', points: 15, bill: 80, heat: 0, boost: 0.005, tall: false },
  letterbox: { name: 'LETTERBOX', mass: 12, breakImpulse: 80, restitution: 0.2, shape: box(0.15, 0.6, 0.2), comHeight: 0.9, material: 'metal', points: 20, bill: 90, heat: 1, boost: 0.005, tall: false },
  deckchair: { name: 'DECKCHAIR', mass: 8, breakImpulse: 0, restitution: 0.3, shape: box(0.3, 0.4, 0.6), comHeight: 0.35, material: 'wood', points: 15, bill: 60, heat: 0, boost: 0.005, tall: false },
  parasol: { name: 'PARASOL', mass: 6, breakImpulse: 0, restitution: 0.3, shape: cyl(0.1, 1.1), comHeight: 1.2, material: 'plastic', points: 15, bill: 40, heat: 0, boost: 0.005, tall: true },
  fishStall: { name: 'FISH STALL', mass: 70, breakImpulse: 0, restitution: 0.2, shape: box(1.1, 0.55, 0.5), comHeight: 0.6, material: 'wood', points: 60, bill: 500, heat: 1, boost: 0.02, tall: false },
  lobsterPot: { name: 'LOBSTER POT', mass: 10, breakImpulse: 0, restitution: 0.4, shape: box(0.35, 0.25, 0.25), comHeight: 0.25, material: 'wood', points: 10, bill: 30, heat: 0, boost: 0.005, tall: false },
};

/** Every kind in the catalogue's order: a kind's index (the renderer's instanced meshes, a packed event). */
export const PROP_KINDS = Object.keys(PROP_TYPES) as readonly PropKind[];

/** Half extents of a kind's footprint along its own x (across its face) and z (toward the road it faces). */
export function propFootprint(kind: PropKind): { hx: number; hz: number } {
  const s = PROP_TYPES[kind].shape;
  return s.kind === 'box' ? { hx: s.hx, hz: s.hz } : { hx: s.radius, hz: s.radius };
}

/** The radius of a kind's footprint's bounding circle: a round one's own, a box's to its corners. */
export function propRadius(kind: PropKind): number {
  const s = PROP_TYPES[kind].shape;
  return s.kind === 'box' ? Math.hypot(s.hx, s.hz) : s.radius;
}

/** The prop's height: what the shape stands up to. */
export function propHeight(kind: PropKind): number {
  const s = PROP_TYPES[kind].shape;
  return 2 * (s.kind === 'box' ? s.hy : s.halfHeight);
}

/** One placed prop. `yaw` turns its local +Z (its face: the lamp's arm, the bench's seat) toward the road. */
export interface PropDesc { id: number; kind: PropKind; x: number; z: number; yaw: number }

/** Ids: chunk index × PROPS_PER_CHUNK + the prop's place in its chunk's list. */
export const PROPS_PER_CHUNK = 256;

export type StreetKind = 'grid' | 'avenue' | 'quay' | 'parkway' | 'service';

/**
 * A straight stretch of footway beside a road: its road edge at the start, the unit way along the road and the
 * unit way from the road across the footway, its length, and how far along the street its start lies (the
 * street's rhythm).
 */
export interface FootwayRun {
  x: number; z: number;
  dx: number; dz: number;
  nx: number; nz: number;
  length: number;
  along: number;
  district: string;
  street: StreetKind;
  /** The entrances of the buildings behind it (their paths meet the footway here): the frontage line keeps clear. */
  entrances: ReadonlyArray<{ x: number; z: number }>;
}

/** A place with its own things: a park's path, the promenade along the seawall, a corner shop's terrace. */
export interface PropPlace {
  kind: 'park' | 'promenade' | 'terrace';
  /** Its centre and the way its length runs (a park's path, the promenade's wall), and its half length. */
  x: number; z: number;
  dx: number; dz: number;
  half: number;
  /** The way toward the side it faces: the promenade's sea (the park: either side of its path; a terrace: from the road). */
  nx: number; nz: number;
}

export interface PropContext {
  seed: number;
  runs: readonly FootwayRun[];
  places: readonly PropPlace[];
  /**
   * Whether a footprint (centre, yaw of its +Z, half extents across and along +Z) stands where nothing may: a
   * lane, the walkers' band, a ring, a door's approach, a billboard's line, a ramp, a junction's corner, an
   * overpass, a covered street, the cold open's route, or anything built that stands above the kerb.
   */
  blocked(x: number, z: number, yaw: number, hx: number, hz: number): boolean;
}

/** The lines and their rhythms (M8_PLAN D7). */
export const PROP_LINES = {
  /** The kerb line's distance from the road edge, and a slot every `pitch` m along the street. */
  kerb: { offset: 0.7, pitch: 9 },
  /** The frontage line starts this far from the road edge; a slot every `pitch` m. */
  frontage: { offset: 3.7, pitch: 12 },
  /** The walkers' band: its middle and half width from the road edge (Pedestrians' PAVEMENT_HALF). */
  walkers: { middle: 2.25, half: 0.9 },
  /** Kept from a junction's corner and between two props' footprints. */
  corner: 12,
  apart: 0.3,
  /** A frontage prop keeps this far from an entrance path's centre. */
  entrance: 2.5,
} as const;

/**
 * Chances of a slot's thing. The kerb's odd slots: a hydrant anywhere, a parking meter in Crown Heights and the
 * Works, else a bin; a Crown Heights run's middle odd slot may be a bus stop. The frontage's slots: a newsstand in
 * Crown Heights, a newspaper box there and on the Quay, else a bench.
 */
const CHANCE = { hydrant: 0.08, meter: 0.3, bin: 0.25, shelter: 0.6, kiosk: 0.07, newsbox: 0.15, bench: 0.12, parkBench: 0.8 } as const;
/**
 * A café terrace (M8 slice 3): a table either side of the shop's door, this far along from it and this far from the
 * road edge (the shop's front is 5.8 m out), a chair beside it either way.
 */
const TERRACE = { along: 5, out: 4.6, beside: 1.05 } as const;

/**
 * A chunk's props from its own random stream: the kerb line and the frontage line of every footway run it holds,
 * then its places. Each slot draws its numbers before it is tested, so a slot that cannot stand never moves the
 * ones after it. Ids in emission order.
 */
export function chunkProps(cx: number, cz: number, ctx: PropContext): PropDesc[] {
  const rnd = mulberry32(ctx.seed ^ 0x51ab3e ^ Math.imul(cx + 41, 668265263) ^ Math.imul(cz + 47, 374761393));
  const index = (cz + 3) * 7 + (cx + 3);
  const out: PropDesc[] = [];
  const taken: Array<{ x: number; z: number; r: number }> = [];
  const put = (kind: PropKind, x: number, z: number, yaw: number): boolean => {
    if (out.length >= PROPS_PER_CHUNK) return false;
    const f = propFootprint(kind);
    const r = propRadius(kind);
    for (const t of taken) if (Math.hypot(t.x - x, t.z - z) < t.r + r + PROP_LINES.apart) return false;
    if (ctx.blocked(x, z, yaw, f.hx, f.hz)) return false;
    taken.push({ x, z, r });
    out.push({ id: index * PROPS_PER_CHUNK + out.length, kind, x, z, yaw });
    return true;
  };
  for (const run of ctx.runs) {
    // facing the road: local +Z along -n
    const yaw = Math.atan2(-run.nx, -run.nz);
    const kerb = PROP_LINES.kerb;
    const crown = run.district === 'crown', metered = crown || run.district === 'foundry';
    // a Crown Heights street's bus stop: the odd slot nearest the run's middle, some runs
    const stopDraw = rnd();
    const middle = Math.round((run.along + run.length / 2) / kerb.pitch);
    const stop = crown && run.length > 60 && stopDraw < CHANCE.shelter ? middle + (((middle % 2) + 2) % 2 === 0 ? 1 : 0) : NaN;
    for (let k = Math.ceil(run.along / kerb.pitch); k * kerb.pitch < run.along + run.length; k++) {
      const a = k * kerb.pitch - run.along;
      const chance = rnd(), jitter = (rnd() - 0.5) * 0.8;
      const phase = ((k % 4) + 4) % 4;
      let kind: PropKind | null;
      if (k === stop) kind = 'shelter';
      else if (phase === 0) kind = 'lamp';
      else if (phase === 2) kind = run.district === 'foundry' ? null : 'sapling';
      else if (chance < CHANCE.hydrant) kind = 'hydrant';
      else if (metered && chance < CHANCE.hydrant + CHANCE.meter) kind = 'meter';
      else kind = chance < CHANCE.hydrant + (metered ? CHANCE.meter : 0) + CHANCE.bin ? 'bin' : null;
      if (!kind) continue;
      const u = a + (kind === 'lamp' || kind === 'shelter' ? 0 : jitter);
      put(kind, run.x + run.dx * u + run.nx * kerb.offset, run.z + run.dz * u + run.nz * kerb.offset, yaw);
    }
    const front = PROP_LINES.frontage;
    for (let k = Math.ceil(run.along / front.pitch); k * front.pitch < run.along + run.length; k++) {
      const a = k * front.pitch - run.along;
      const chance = rnd(), jitter = (rnd() - 0.5) * 2;
      const kiosk = crown ? CHANCE.kiosk : 0, news = crown || run.district === 'marina' ? CHANCE.newsbox : 0;
      const kind: PropKind | null = chance < kiosk ? 'kiosk' : chance < kiosk + news ? 'newsbox' : chance < kiosk + news + CHANCE.bench ? 'bench' : null;
      if (!kind) continue;
      const f = propFootprint(kind);
      const u = a + jitter, out2 = front.offset + f.hz;
      const x = run.x + run.dx * u + run.nx * out2, z = run.z + run.dz * u + run.nz * out2;
      if (run.entrances.some((e) => Math.hypot(e.x - x, e.z - z) < PROP_LINES.entrance + f.hx)) continue;
      put(kind, x, z, yaw);
    }
  }
  for (const place of ctx.places) {
    if (place.kind === 'terrace') {
      // a table either side of the door, its umbrella over it; chairs beside it, and across it at some
      for (const side of [-1, 1]) {
        const u = side * TERRACE.along, tx = place.x + place.dx * u + place.nx * TERRACE.out, tz = place.z + place.dz * u + place.nz * TERRACE.out;
        if (!put('table', tx, tz, Math.atan2(-place.nx, -place.nz))) continue;
        for (const s of [-1, 1]) {
          const cx = tx + place.dx * s * TERRACE.beside, cz = tz + place.dz * s * TERRACE.beside;
          put('chair', cx, cz, Math.atan2(-place.dx * s, -place.dz * s));
        }
      }
    } else if (place.kind === 'park') {
      // two benches beside the path, facing it, a few metres either side of the middle
      for (const side of [1, -1]) {
        const chance = rnd(), shift = (rnd() - 0.5) * 6;
        if (chance >= CHANCE.parkBench) continue;
        const u = side * 6 + shift, off = 2.4;
        const x = place.x + place.dx * u + place.nx * side * off, z = place.z + place.dz * u + place.nz * side * off;
        put('bench', x, z, Math.atan2(-place.nx * side, -place.nz * side));
      }
    } else {
      // the promenade's benches, facing the sea, every 44 m of the wall
      for (let u = -place.half + 22; u < place.half; u += 44) {
        rnd();
        const off = 3.3;
        put('bench', place.x + place.dx * u - place.nx * off, place.z + place.dz * u - place.nz * off, Math.atan2(place.nx, place.nz));
      }
    }
  }
  return out;
}
