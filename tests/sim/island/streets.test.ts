/** M8.10 slice 5: the districts' own streets, joined to the network (docs/M8.10_PLAN.md). */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Lane } from '../../../src/sim/city/roads';
import { Ground, MAX_GRADE, junctionsOn, plateau } from '../../../src/sim/island/ground';
import { buildNetwork, type IslandNetwork } from '../../../src/sim/island/network';
import type { DistrictId } from '../../../src/sim/island/plan';
import { STREET_KM, districtStreets } from '../../../src/sim/island/streets';

describe('M8.10 slice 5: the districts\' streets', () => {
  let ground: Ground, net: IslandNetwork;
  // the island's build takes seconds, more under a full run's load
  beforeAll(() => { ground = new Ground(); net = buildNetwork(ground); }, 60_000);
  const district = (id: string): DistrictId | null => (/^(crown|foundry|gardens|marina)-street-/.exec(id)?.[1] as DistrictId | undefined) ?? null;

  it('5.1 no dead end on the whole network', () => {
    const { nodes, lanes } = net.graph;
    for (const n of nodes) {
      const roads = new Set(lanes.filter((l) => l.from === n.id || l.to === n.id).map((l) => `${Math.min(l.from, l.to)}-${Math.max(l.from, l.to)}`));
      expect(roads.size, `node at ${n.x.toFixed(0)}, ${n.z.toFixed(0)}`).toBeGreaterThan(1);
    }
    expect(net.laneRoad.filter((id) => district(id) !== null).length).toBeGreaterThan(100);
  });

  it('5.2 the streets\' grades within 16 % in Crown Heights and 8 % elsewhere (a Crown street between two main roads further apart in height than that allows: its least grade, never over 25 %)', () => {
    let streets = 0;
    const within = { crown: 0, all: 0 };
    for (const r of ground.roads) {
      const d = district(r.id);
      if (!d) continue;
      streets++;
      expect(MAX_GRADE[r.cls]).toBe(d === 'crown' ? 0.16 : 0.08);
      for (let i = 1; i < r.pts.length; i++) {
        const run = Math.hypot((r.pts[i] as readonly number[])[0] as number - ((r.pts[i - 1] as readonly number[])[0] as number), (r.pts[i] as readonly number[])[1] as number - ((r.pts[i - 1] as readonly number[])[1] as number));
        if (run < 0.5) continue;
        const grade = Math.abs((r.h[i] as number) - (r.h[i - 1] as number)) / run;
        if (d === 'crown') {
          expect(grade, r.id).toBeLessThan(0.25);
          within.all += run;
          if (grade < 0.165) within.crown += run;
        } else expect(grade, r.id).toBeLessThan(0.085);
      }
    }
    expect(streets).toBeGreaterThan(40);
    expect(within.crown / within.all).toBeGreaterThan(0.85);
  });

  it('5.3 Crown\'s crossings flat within 2 %, 12 m each way (less where the next is nearer; a T on a main road is not one)', () => {
    const { junctions } = districtStreets();
    let checked = 0;
    for (const r of ground.roads) {
      if (district(r.id) !== 'crown') continue;
      const on = junctionsOn(r.pts, junctions);
      for (let q = 0; q < on.length; q++) {
        const [bi, j] = on[q] as [number, number];
        if (ground.crossingOnMain[j] === 1) continue;
        const m = plateau(on, q);
        for (let k = Math.max(0, bi - m); k < Math.min(r.pts.length - 1, bi + m); k++) {
          const run = Math.hypot((r.pts[k + 1] as readonly number[])[0] as number - ((r.pts[k] as readonly number[])[0] as number), (r.pts[k + 1] as readonly number[])[1] as number - ((r.pts[k] as readonly number[])[1] as number));
          if (run > 0.5) expect(Math.abs((r.h[k + 1] as number) - (r.h[k] as number)) / run, r.id).toBeLessThan(0.02);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('5.4 the network with the streets stays strongly connected', () => {
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

  it('5.5 each district\'s street length within a fifth of the plan\'s', () => {
    const km = new Map<DistrictId, number>();
    for (const r of districtStreets().roads) {
      const d = district(r.id) as DistrictId;
      let l = 0;
      for (let i = 1; i < r.points.length; i++) l += Math.hypot((r.points[i] as readonly number[])[0] as number - ((r.points[i - 1] as readonly number[])[0] as number), (r.points[i] as readonly number[])[1] as number - ((r.points[i - 1] as readonly number[])[1] as number));
      km.set(d, (km.get(d) ?? 0) + l / 1000);
    }
    for (const d of Object.keys(STREET_KM) as DistrictId[]) {
      expect(km.get(d) ?? 0, d).toBeGreaterThan(STREET_KM[d] * 0.8);
      expect(km.get(d) ?? 0, d).toBeLessThan(STREET_KM[d] * 1.2);
    }
  });
});
