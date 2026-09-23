/**
 * Smashable billboards: the M3 collectible. Placement is part of chunk
 * generation (`placeBillboards`, called last in `City.generate`) with a fixed
 * quota per chunk and a clearance check against the chunk's own statics, so
 * the island always has exactly BILLBOARD_TOTAL of them and boot generates
 * nothing extra. They are pass-through triggers: `Collectibles.step` tests
 * the player's footprint against the panels of the generated chunks around
 * the player; the renderer draws them as its own instanced mesh and hides
 * the smashed ones. State is per session; the M5 save will carry it.
 */
import { CITY_COLORS, PALETTE } from '../palette';
import type { StaticDesc } from '../scene';
import type { PlayerProbe } from '../traffic/Traffic';
import type { City } from './City';

export interface BillboardDesc {
  /** Stable id: chunk index (0..48) × 4 + slot. */
  id: number;
  x: number;
  z: number;
  /** Heading of the panel's normal. Both faces are painted: a gate is driven through from either side. */
  yaw: number;
  width: number;
  height: number;
  /** Bottom edge above the ground, m. */
  bottom: number;
  paint: number;
}

export const BILLBOARD_TOTAL = 50;
/** The footway gate's panel width; the instanced geometry is built at this width and scaled per instance. */
export const BILLBOARD_WIDTH = 5;
/** The highway verge panels are wider, as roadside billboards are. */
export const ROADSIDE_WIDTH = 8;
export const BILLBOARD_HEIGHT = 2.5;
export const BILLBOARD_BOTTOM = 2.5;
const SLOTS_PER_CHUNK = 4;
const PAINTS = [PALETTE.carLime, PALETTE.carMagenta, PALETTE.carOrange, PALETTE.carBlue, CITY_COLORS.chalk];
/** Metres of clear ground the panel's footprint needs from any static taller than a metre, along its normal. */
const CLEARANCE = 1;
/** The same past the panel's ends: a gate sits between the kerb and the frontage, which can be 5.8 m apart. */
const SIDE_CLEARANCE = 0.3;
/** Metres of run-out on both sides of the panel: a car through it at speed needs room before the next wall. */
const RUN_OUT = 10;
/** The run-out only needs to be clear up to car height; awnings and cornices above it do not matter. */
const CAR_CLEARANCE = 2.2;
/** Metres the posts keep from an authored road's edge (its frontage row and cut pavements). */
const CORRIDOR_CLEARANCE = 6.5;
const BLOCK = 225;
/** A footway gate's centre: posts 0.5 m inside the panel's ends stand 0.6 m off the kerb and on the footway's back edge. */
const PAVEMENT_SLOT = 14.6;
/** The highway verge slot: 10 m outside the outer kerb line (675 + 19 + 10). */
const VERGE = 704;

export function chunkIndex(cx: number, cz: number): number {
  return (cz + 3) * 7 + (cx + 3);
}

/** Directed candidate slot: position, the heading of the panel's normal and its width. */
interface Slot { x: number; z: number; yaw: number; width: number }

/**
 * Perimeter chunks own the highway segment leaving their node in the cyclic
 * direction (+z on the west edge, +x on the north, -z on the east, -x on the
 * south; the corners follow the edge that continues the cycle), which maps the
 * 24 chunks one-to-one onto the 24 segments. The slot sits 62 m along it on
 * the outer verge, in the gap between the two edge parks, facing the road.
 * Interior chunks put one gate across a footway, 93 m from their junction,
 * driven through along the street (the frontage row leaves no run-out behind
 * a roadside panel): the street trees stand at 57 and 106 m and the lamps at
 * 36 and 80 m, so 81–105 m is the one stretch with the run-out clear. The
 * centre chunk gets two.
 */
function candidateSlots(cx: number, cz: number, out: Slot[]): number {
  out.length = 0;
  const x0 = cx * BLOCK;
  const z0 = cz * BLOCK;
  const perimeter = Math.abs(cx) === 3 || Math.abs(cz) === 3;
  if (perimeter) {
    let dx = 0, dz = 0;
    if (cx === -3 && cz !== 3) dz = 1;
    else if (cz === 3 && cx !== 3) dx = 1;
    else if (cx === 3 && cz !== -3) dz = -1;
    else dx = -1;
    // the outer side of the edge the owned segment runs along (a corner chunk sits on two edges)
    const ox = dz !== 0 ? Math.sign(cx) : 0;
    const oz = dx !== 0 ? Math.sign(cz) : 0;
    const yaw = Math.atan2(-ox, -oz); // the panel faces inward, toward the carriageway
    // past 134 m: the overpasses' ramps (M5.5 slice 8) wall off the first four slots of the four segments they lift
    for (const along of [62, 66, 58, 108, 150, 160, 170]) {
      out.push({ x: ox !== 0 ? ox * VERGE : x0 + dx * along, z: oz !== 0 ? oz * VERGE : z0 + dz * along, yaw, width: ROADSIDE_WIDTH });
    }
    return 1;
  }
  const alongs = [93, 92, 94];
  // gates: the panel runs across the footway, its normal along the street
  for (const side of [1, -1]) for (const along of alongs) out.push({ x: x0 + side * PAVEMENT_SLOT, z: z0 + along, yaw: 0, width: BILLBOARD_WIDTH });
  for (const side of [1, -1]) for (const along of alongs) out.push({ x: x0 + along, z: z0 + side * PAVEMENT_SLOT, yaw: Math.PI / 2, width: BILLBOARD_WIDTH });
  if (cx === 0 && cz === 0) {
    // the centre chunk's second billboard starts on the other street
    const first = out.splice(0, alongs.length * 2);
    out.push(...first);
    return 2;
  }
  return 1;
}

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

/**
 * Axis-aligned footprint the panel itself must keep clear up to its top: the
 * panel plus CLEARANCE along its normal and SIDE_CLEARANCE past its ends. All
 * slots face an axis, so no rotation is needed.
 */
export function panelFootprint(slot: { x: number; z: number; yaw: number; width: number }): Box {
  return footprint(slot, 0.15 + CLEARANCE);
}

/**
 * The footprint a car through the panel sweeps: the panel plus RUN_OUT along
 * its normal on both sides, to be clear up to car height. (For a roadside
 * panel the near side is the road itself, which is flat and passes.)
 */
export function runOutFootprint(slot: { x: number; z: number; yaw: number; width: number }): Box {
  return footprint(slot, 0.15 + CLEARANCE + RUN_OUT);
}

function footprint(slot: { x: number; z: number; yaw: number; width: number }, halfDepth: number): Box {
  const alongX = Math.abs(Math.sin(slot.yaw)) < 0.5; // the normal points along z, the panel runs along x
  const hw = slot.width / 2 + SIDE_CLEARANCE;
  return alongX
    ? { minX: slot.x - hw, maxX: slot.x + hw, minZ: slot.z - halfDepth, maxZ: slot.z + halfDepth }
    : { minX: slot.x - halfDepth, maxX: slot.x + halfDepth, minZ: slot.z - hw, maxZ: slot.z + hw };
}

/** The panel's top: what its own footprint must be clear up to. */
export const PANEL_TOP = BILLBOARD_BOTTOM + BILLBOARD_HEIGHT;
/** Car height: what the run-out must be clear up to. */
export const CAR_TOP = CAR_CLEARANCE;

/**
 * Conservative world-space footprint of a static that reaches above a metre
 * and starts below `maxBottom` (a cornice at 13 m overhangs the footway
 * without touching a panel, an awning at 2.6 m clears a car). Null for the
 * rest.
 */
export function tallFootprint(st: StaticDesc, maxBottom = PANEL_TOP): Box | null {
  const s = st.shape;
  const p = st.position;
  const panelTop = maxBottom;
  let hx = 0, hz = 0, top = 0, bottom = 0;
  if (s.kind === 'box' || s.kind === 'gable') {
    // the AABB of a yawed box: |cos| hx + |sin| hz on x, |sin| hx + |cos| hz on z
    const yaw = 2 * Math.atan2(st.rotation.y, st.rotation.w);
    const c = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
    hx = c * s.hx + sn * s.hz;
    hz = sn * s.hx + c * s.hz;
    top = p.y + s.hy;
    bottom = p.y - s.hy;
  } else if (s.kind === 'cylinder') {
    hx = s.radius; hz = s.radius; top = p.y + s.halfHeight; bottom = p.y - s.halfHeight;
  } else if (s.kind === 'prism') {
    if (s.y1 <= 1 || s.y0 >= panelTop) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const pt of s.points) { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); minZ = Math.min(minZ, pt.z); maxZ = Math.max(maxZ, pt.z); }
    return { minX, maxX, minZ, maxZ };
  } else {
    return null;
  }
  if (top <= 1 || bottom >= panelTop) return null;
  return { minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz };
}

function overlaps(a: { minX: number; maxX: number; minZ: number; maxZ: number }, b: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

const slots: Slot[] = [];

/**
 * Place this chunk's billboards against the statics generated so far.
 * `roadClearance` is the chunk's distance-to-authored-road-edge function.
 * A slot is taken when nothing taller than a metre comes within CLEARANCE of
 * the panel footprint and the posts are CORRIDOR_CLEARANCE clear of any
 * authored road. If no slot passes, the first one is used anyway: the unit
 * test then fails and says which chunk needs another slot.
 */
export function placeBillboards(cx: number, cz: number, statics: readonly StaticDesc[], roadClearance: (x: number, z: number) => number): BillboardDesc[] {
  const quota = candidateSlots(cx, cz, slots);
  const index = chunkIndex(cx, cz);
  const out: BillboardDesc[] = [];
  const used: Slot[] = [];
  for (let k = 0; k < slots.length && out.length < quota; k++) {
    const slot = slots[k] as Slot;
    const box = panelFootprint(slot);
    const sweep = runOutFootprint(slot);
    let clear = roadClearance(slot.x, slot.z) >= CORRIDOR_CLEARANCE;
    for (let i = 0; clear && i < statics.length; i++) {
      const st = statics[i] as StaticDesc;
      const tall = tallFootprint(st, PANEL_TOP);
      if (tall && overlaps(box, tall)) { clear = false; break; }
      const low = tallFootprint(st, CAR_TOP);
      if (low && overlaps(sweep, low)) clear = false;
    }
    for (const u of used) if (clear && overlaps(sweep, runOutFootprint(u))) clear = false;
    if (!clear) continue;
    used.push(slot);
    out.push(describe(index, out.length, slot));
  }
  while (out.length < quota) {
    const slot = slots[out.length] as Slot;
    used.push(slot);
    out.push(describe(index, out.length, slot));
  }
  return out;
}

function describe(index: number, slotIndex: number, slot: Slot): BillboardDesc {
  return {
    id: index * SLOTS_PER_CHUNK + slotIndex,
    x: slot.x,
    z: slot.z,
    yaw: slot.yaw,
    width: slot.width,
    height: BILLBOARD_HEIGHT,
    bottom: BILLBOARD_BOTTOM,
    paint: PAINTS[(index + slotIndex) % PAINTS.length] as number,
  };
}

export class Collectibles {
  readonly smashed = new Uint8Array(49 * SLOTS_PER_CHUNK);
  smashedCount = 0;
  readonly total = BILLBOARD_TOTAL;

  constructor(private readonly city: City) {}

  /** The descriptor of a billboard id among the generated chunks, or null. */
  descOf(id: number): BillboardDesc | null {
    for (const entry of this.city.active.values()) {
      for (const b of entry.chunk.billboards) if (b.id === id) return b;
    }
    return null;
  }

  /** Returns the id smashed this step or -1: the player's footprint against the panels of the loaded chunks around it. */
  step(player: PlayerProbe, minSpeed: number): number {
    if (player.speed < minSpeed) return -1;
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    const rx = -fz;
    const rz = fx;
    for (const entry of this.city.active.values()) {
      const boards = entry.chunk.billboards;
      for (let b = 0; b < boards.length; b++) {
        const board = boards[b] as BillboardDesc;
        if (this.smashed[board.id]) continue;
        const dx = board.x - player.x;
        const dz = board.z - player.z;
        if (dx * dx + dz * dz > 20 * 20) continue;
        // five points along the panel, each tested against the chassis footprint with a small margin
        const ax = Math.cos(board.yaw), az = -Math.sin(board.yaw); // along the panel = left of its normal
        const pitch = board.width / 4;
        for (let k = -2; k <= 2; k++) {
          const px = board.x + ax * k * pitch - player.x;
          const pz = board.z + az * k * pitch - player.z;
          const along = px * fx + pz * fz;
          const side = px * rx + pz * rz;
          if (Math.abs(along) <= player.halfLength + 0.3 && Math.abs(side) <= player.halfWidth + 0.3) {
            this.smashed[board.id] = 1;
            this.smashedCount++;
            return board.id;
          }
        }
      }
    }
    return -1;
  }
}
