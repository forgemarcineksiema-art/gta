/**
 * The island's static coin lines (M8.10 slice 15, the grid's `placeCoins`): an arc over every jump and a line into
 * every verge's and street's billboard (a landing's is flown through at the end of its jump's arc), each coin over the
 * ground under it, by the island chunk it lies in (`Coins.layChunk`).
 */
import { BALANCE } from '../balance';
import { COIN_HEIGHT, layoutCoins, type ArcLanding, type CoinPoint, type GroundAt } from '../city/coins';
import type { BillboardDesc } from '../city/collectibles';
import { projectOnLane, type RoadGraph } from '../city/roads';
import type { StaticDesc } from '../scene';
import { CHUNKS_X, CHUNKS_Z, Island } from './Island';
import { designKmh } from './jumps';
import { canalBed } from './shapes/works';

/** A gate's lane: running along the way through the panel, within this far of it (m: a verge's panel stands 17 m off the highway's lane, some past a lane's end in a merge). */
const GATE_REACH = 30;

export function islandCoinLines(island: Island, graph: RoadGraph, chunkOf: (x: number, z: number) => number): Map<number, CoinPoint[]> {
  const ground = (x: number, z: number): number => island.ground.surfaceHeight(x, z);
  const lines: CoinPoint[][] = [layoutCoins(island.jumps, ground, arcLanding(island))];
  island.billboards.forEach((b, id) => {
    const kind = island.stuntSites.billboards[id]?.kind;
    if (kind === undefined || kind === 'landing') return;
    const line = gateLine(graph, b, kind === 'verge', ground);
    if (line) lines.push(line);
  });
  const out = new Map<number, CoinPoint[]>();
  for (const line of lines) {
    for (const p of line) {
      const k = chunkOf(p.x, p.z);
      let list = out.get(k);
      if (!list) out.set(k, (list = []));
      list.push(p);
    }
  }
  return out;
}

/**
 * The line into a billboard on the island (the grid's `gateLine`, read on its curving lanes): `gateCoins` coins along
 * the way a car drives through the panel, swerving off the nearest lane on the ground running that way beside it (the
 * street's by its pavement, the highway's by its verge) onto the panel, the cap on it; null with no lane beside it.
 */
function gateLine(graph: RoadGraph, b: BillboardDesc, verge: boolean, ground: GroundAt): CoinPoint[] | null {
  const c = BALANCE.coin, n = c.gateCoins, heading = verge ? b.yaw + Math.PI / 2 : b.yaw;
  const hit: { x: number; z: number; yaw: number; y?: number } = { x: 0, z: 0, yaw: 0 };
  let best = GATE_REACH * GATE_REACH, lx = 0, lz = 0, dir = 0;
  for (const lane of graph.lanes) {
    if (lane.special || !!lane.highway !== verge) continue;
    const d = projectOnLane(lane, b.x, b.z, hit);
    if (d >= best) continue;
    const cos = Math.cos(hit.yaw - heading);
    if (Math.abs(cos) < 0.9 || Math.abs((hit.y ?? 0) - ground(hit.x, hit.z)) > 0.3) continue;
    best = d; lx = hit.x; lz = hit.z; dir = cos > 0 ? 1 : -1;
  }
  if (dir === 0) return null;
  // along the lane's way into the panel; the lane's offset from the panel, square to it
  const fx = Math.sin(heading) * dir, fz = Math.cos(heading) * dir, dot = (lx - b.x) * fx + (lz - b.z) * fz;
  const ox = lx - b.x - fx * dot, oz = lz - b.z - fz * dot;
  // the run twice as long as the swerve at least (a verge's panel, far off its lane, drawn out; a street's at the pitch)
  const span = Math.max(n * c.pitch, 2 * Math.hypot(ox, oz)), out: CoinPoint[] = [];
  for (let k = 0; k < n; k++) {
    const t = k / n, w = 1 - t * t * (3 - 2 * t), along = -span * (n - k) / n;
    const x = b.x + fx * along + ox * w, z = b.z + fz * along + oz * w;
    out.push({ x, y: ground(x, z) + COIN_HEIGHT, z, lane: -1, value: c.value, phase: k });
  }
  out.push({ x: b.x, y: ground(b.x, b.z) + COIN_HEIGHT, z: b.z, lane: -1, value: c.cap, phase: n });
  return out;
}

/**
 * The island's arcs' landings (the third bug hunt): each jump flown at the speed it is built for (`designKmh`: the
 * mega-ramp's at 200 km/h, not the grid's 27 m/s into the sea), down onto the highest solid under the flight or the
 * ground with the canal dug in it: over the drawn ground alone the caps lay on the sea floor under a pier, inside an
 * office block under its roof, in the air over the dug canal.
 */
export function arcLanding(island: Island): ArcLanding {
  const solids = new Map<number, StaticDesc[]>();
  const near = (index: number): StaticDesc[] => {
    let list = solids.get(index);
    if (!list) solids.set(index, (list = island.solids(index).filter((s) => !s.farOnly)));
    return list;
  };
  return {
    speed: (jd) => designKmh(jd.id) / 3.6,
    land: (x, z, below) => {
      let top = Math.min(island.ground.surfaceHeight(x, z), canalBed(x, z));
      const [ci, cj] = Island.chunkOf(x, z);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= CHUNKS_X || j >= CHUNKS_Z) continue;
          for (const s of near(Island.chunkIndex(i, j))) {
            const t = topOf(s, x, z);
            if (t > top && t <= below) top = t;
          }
        }
      }
      return top;
    },
  };
}

/** The height of a solid's top over (x, z), -Infinity off it: a box's (a gable's) top face however it leans, a prism's top. */
function topOf(s: StaticDesc, x: number, z: number): number {
  const sh = s.shape;
  if (sh.kind === 'prism') return inside(sh.points, x, z) ? sh.y1 : -Infinity;
  if (sh.kind !== 'box' && sh.kind !== 'gable') return -Infinity;
  const p = s.position, q = s.rotation;
  // the box's up axis; a wall's side is no floor
  const ux = 2 * (q.x * q.y - q.w * q.z), uy = 1 - 2 * (q.x * q.x + q.z * q.z), uz = 2 * (q.y * q.z + q.w * q.x);
  if (uy < 0.3) return -Infinity;
  const cx = p.x + ux * sh.hy, cy = p.y + uy * sh.hy, cz = p.z + uz * sh.hy;
  const y = cy - (ux * (x - cx) + uz * (z - cz)) / uy;
  const dx = x - cx, dy = y - cy, dz = z - cz;
  const along = dx * (1 - 2 * (q.y * q.y + q.z * q.z)) + dy * 2 * (q.x * q.y + q.w * q.z) + dz * 2 * (q.x * q.z - q.w * q.y);
  const across = dx * 2 * (q.x * q.z + q.w * q.y) + dy * 2 * (q.y * q.z - q.w * q.x) + dz * (1 - 2 * (q.x * q.x + q.y * q.y));
  return Math.abs(along) <= sh.hx && Math.abs(across) <= sh.hz ? y : -Infinity;
}

/** Whether (x, z) is inside a convex polygon (any winding). */
function inside(pts: ReadonlyArray<{ x: number; z: number }>, x: number, z: number): boolean {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as { x: number; z: number }, b = pts[(i + 1) % pts.length] as { x: number; z: number };
    const c = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
    if (c === 0) continue;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}
