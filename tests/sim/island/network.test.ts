/** M8.10 slice 4: the island's main road network as the grid's `RoadGraph` (docs/M8.10_PLAN.md). */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Lane } from '../../../src/sim/city/roads';
import { Ground, MAX_GRADE } from '../../../src/sim/island/ground';
import { buildNetwork, onTheGround, type IslandNetwork } from '../../../src/sim/island/network';

describe('M8.10 slice 4: the main network', () => {
  let ground: Ground, net: IslandNetwork;
  beforeAll(() => { ground = new Ground(); net = buildNetwork(ground); });

  const lengthOf = (l: Lane): number => l.points.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - (l.points[i] as { x: number }).x, p.z - (l.points[i] as { z: number }).z), 0);

  it('4.1 every lane has a next', () => {
    const { lanes } = net.graph;
    expect(lanes.length).toBeGreaterThan(80);
    for (const l of lanes) expect(l.next.length, `lane ${l.id}`).toBeGreaterThan(0);
  });

  it('4.2 the graph is strongly connected', () => {
    const { lanes } = net.graph;
    const reach = (edges: (id: number) => number[]): number => {
      const seen = new Set([0]), todo = [0];
      while (todo.length) for (const n of edges(todo.pop() as number)) if (!seen.has(n)) { seen.add(n); todo.push(n); }
      return seen.size;
    };
    const back = lanes.map(() => [] as number[]);
    for (const l of lanes) for (const n of l.next) (back[n] as number[]).push(l.id);
    expect(reach((id) => (lanes[id] as Lane).next)).toBe(lanes.length);
    expect(reach((id) => back[id] as number[])).toBe(lanes.length);
  });

  it('4.3 no node of degree one: every road\'s end is a junction', () => {
    const { nodes, lanes } = net.graph;
    for (const n of nodes) {
      const roads = new Set(lanes.filter((l) => l.from === n.id || l.to === n.id).map((l) => `${Math.min(l.from, l.to)}-${Math.max(l.from, l.to)}`));
      expect(roads.size + (lanes.some((l) => l.from === n.id && l.to === n.id) ? 1 : 0), `node ${n.id} at ${n.x.toFixed(0)}, ${n.z.toFixed(0)}`).toBeGreaterThan(1);
    }
  });

  it('4.4 every lane\'s grade within its class\'s, away from the junctions', () => {
    const { nodes } = net.graph;
    // a crossing's box blends two roads' surfaces (up to +8 % on Crown's hill) until slice 6 lays each box flat
    const nearNode = (p: { x: number; z: number }): boolean => nodes.some((n) => Math.hypot(n.x - p.x, n.z - p.z) < 30);
    for (const l of net.graph.lanes) {
      const cls = l.highway ? 'highway' : null;
      let steepest = 0;
      // over 5 m at least, as the profiles are held (every 6 m)
      for (let i = 0, j = 1; j < l.points.length; j++) {
        const a = l.points[i] as { x: number; z: number; y?: number }, b = l.points[j] as { x: number; z: number; y?: number };
        const run = Math.hypot(b.x - a.x, b.z - a.z);
        if (run < 5) continue;
        if (!nearNode(a) && !nearNode(b)) steepest = Math.max(steepest, Math.abs((b.y ?? 0) - (a.y ?? 0)) / run);
        i = j;
      }
      // the steepest class is dirt's; the highway its own
      expect(steepest, `lane ${l.id}`).toBeLessThan((cls ? MAX_GRADE.highway : MAX_GRADE.dirt) + 0.02);
    }
  });

  it('4.5 the highway\'s lanes make one loop of 5–6 km', () => {
    const { lanes } = net.graph;
    const start = lanes.find((l) => l.highway && l.offset === 4) as Lane;
    let lane = start, total = 0;
    for (let k = 0; k < 400; k++) {
      total += lengthOf(lane) + 40;
      const next = lane.next.map((id) => lanes[id] as Lane).find((n) => n.highway && n.offset === lane.offset && n.to !== lane.from);
      expect(next, `lane ${lane.id}`).toBeDefined();
      lane = next as Lane;
      if (lane === start) break;
    }
    expect(lane).toBe(start);
    expect(total).toBeGreaterThan(5000);
    expect(total).toBeLessThan(6000);
  });

  it('4.6 a lane\'s height is the ground\'s within 5 cm where it runs on the ground', () => {
    let checked = 0, off = 0;
    for (const l of net.graph.lanes) for (const p of l.points) {
      // off the ground: the highway in its tunnel under the hill and on its decks over the water
      if (!onTheGround(net, l, p.x, p.z)) { off++; continue; }
      expect(Math.abs((p.y ?? 0) - ground.height(p.x, p.z)), `lane ${l.id}`).toBeLessThan(0.05);
      checked++;
    }
    expect(checked).toBeGreaterThan(3000);
    expect(off).toBeGreaterThan(300);
  });
});
