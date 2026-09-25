/** M8.10 slice 12, the long pin: the hovercraft from the marina to the islet (docs/M8.10_PLAN.md). LONG=1. */
import { describe, expect, it } from 'vitest';
import { SAND, SEA } from '../../../src/sim';
import { inPolygon } from '../../../src/sim/island/geom';
import { islet } from '../../../src/sim/island/plan';
import { createWorld } from '../helpers';
import { flyTo } from './seaRoute';

describe('M8.10 slice 12: the islet by sea', () => {
  it('12.3 (long) the hovercraft from the marina out of the bay under its bridge, round the lighthouse\'s spit and up the islet\'s beach', async () => {
    const sim = await createWorld({ map: 'island', traffic: 0, peds: 0, body: 'hover' });
    try {
      // world axes: the bay's water off the marina's piers, its mouth, past the spit's end, up the east coast's sea
      const route = [[-560, -520], [-640, -660], [-690, -790], [-820, -840], [-930, -820], [-1000, -600], [-1045, -450], [-1035, -360]] as const;
      const end = flyTo(sim, route, 150);
      expect(end.arrived).toBe(true);
      expect(sim.respawned).toBe(false);
      expect(inPolygon(end.x, end.z, islet())).toBe(true);
      expect(sim.island?.surface.at(end.x, end.z)).toBe(SAND);
      expect(end.y).toBeGreaterThan(SEA.level + 1);
    } finally { sim.dispose(); }
  }, 300_000);
});
