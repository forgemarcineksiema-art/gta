/**
 * The ground under the wheels (M8.8 slice 9): the island's 2 m cells read asphalt, grass or dirt from the city's flat
 * ground statics, the topmost deciding; every lane is asphalt (the traffic never leaves it); a lawn costs a road car
 * at least a third on its 0–100. The playground has no map: the car pins there stand as they were (cars.test).
 */
import { describe, expect, it } from 'vitest';
import { ASPHALT, DIRT, GRASS } from '../../src/sim/city/surface';
import { createWorld, fullThrottle, kmh, run, runUntil } from './helpers';

describe('M8.8 slice 9: grass and dirt', () => {
  it('M8.8 9.1 known points read their surface, and every lane reads asphalt', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const city = sim.city!;
      for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) city.chunk(cx, cz);
      const at = (x: number, z: number): number => city.surface.at(x, z);
      // the Crown's corner edge park: its lawn, and the paved path through its middle over it
      expect(at(-705, -723)).toBe(GRASS);
      expect(at(-715, -715)).toBe(ASPHALT);
      // a Palm Gardens quarter: the soil between its houses; the open quarter north of it a lawn
      expect(at(-514.5, 64.5)).toBe(DIRT);
      expect(at(-514.5, 160.5)).toBe(GRASS);
      // a lane at every 3 m of every road
      let off = 0;
      for (const lane of city.graph.lanes) {
        for (let k = 0; k + 1 < lane.points.length; k++) {
          const a = lane.points[k]!, b = lane.points[k + 1]!;
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          for (let s = 0; s < len; s += 3) if (at(a.x + (b.x - a.x) * s / len, a.z + (b.z - a.z) * s / len) !== ASPHALT) off++;
        }
      }
      expect(off).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 9.2 on a lawn the muscle car\'s 0-100 is at least 30 % slower than on the road', async () => {
    const times: number[] = [];
    for (const ground of [ASPHALT, GRASS] as const) {
      const sim = await createWorld({ spawn: 'straight', car: 'muscle' });
      try {
        sim.vehicle.ground = { at: () => ground };
        run(sim, 1);
        times.push(runUntil(sim, 30, (s) => kmh(s) >= 100, fullThrottle));
        expect(sim.vehicle.wheels.every((w) => w.surface === ground)).toBe(true);
      } finally { sim.dispose(); }
    }
    const [road, lawn] = times as [number, number];
    expect(road).toBeGreaterThan(0);
    expect(lawn).toBeGreaterThan(road * 1.3);
  }, 60_000);
});
