/**
 * The island's static coin lines (M8.10 slice 15, the grid's `placeCoins`): an arc over every jump and a line into
 * every verge's and street's billboard (a landing's is flown through at the end of its jump's arc), each coin over the
 * ground under it, by the island chunk it lies in (`Coins.layChunk`).
 */
import { BALANCE } from '../balance';
import { COIN_HEIGHT, layoutCoins, type CoinPoint, type GroundAt } from '../city/coins';
import type { BillboardDesc } from '../city/collectibles';
import { projectOnLane, type RoadGraph } from '../city/roads';
import type { Island } from './Island';

/** A gate's lane: running along the way through the panel, within this far of it (m: a verge's panel stands 17 m off the highway's lane, some past a lane's end in a merge). */
const GATE_REACH = 30;

export function islandCoinLines(island: Island, graph: RoadGraph, chunkOf: (x: number, z: number) => number): Map<number, CoinPoint[]> {
  const ground = (x: number, z: number): number => island.ground.surfaceHeight(x, z);
  const lines: CoinPoint[][] = [layoutCoins(island.jumps, ground)];
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
