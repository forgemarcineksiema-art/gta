/** M8.10 slice 14: the island's first minute, its route (docs/M8.10_PLAN.md §1.4). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SimWorld } from '../../../src/sim';
import { toDropOff } from '../../../src/sim/city/cover';
import type { Island } from '../../../src/sim/island/Island';
import { FIRST_MINUTE_STEPS, RINGS } from '../../../src/sim/island/plan';
import { firstMinuteRoute, type FirstMinuteRoute } from '../../../src/sim/run/firstMinute';
import { createWorld } from '../helpers';

describe('M8.10 slice 14: the first minute', () => {
  let sim: SimWorld, route: FirstMinuteRoute | null;
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => {
    sim = await createWorld({ map: 'island', seed: 42, traffic: 0, peds: 0, record: false });
    const hotel = sim.run.dropOffs.find((d) => d.name === 'hotel');
    route = hotel ? firstMinuteRoute((sim.island as Island).network.graph, hotel) : null;
  }, 60_000);
  afterAll(() => sim.dispose());

  it('14.3 the route: 1.5 km or less on joined lanes, past each step\'s place, into the hotel\'s garage', () => {
    expect(route).not.toBeNull();
    if (!route) return;
    const graph = (sim.island as Island).network.graph, samples = route.samples, last = samples[samples.length - 1];
    const length = last?.s ?? 0;
    expect(length).toBeGreaterThan(900);
    expect(length).toBeLessThan(1500);
    // each lane runs on into the next
    for (let k = 0; k + 1 < route.lanes.length; k++) expect(graph.lanes[route.lanes[k] as number]?.next).toContain(route.lanes[k + 1]);
    // each step at its place, in order (the takedown's is the roundabout's middle: the route goes round it on its ring)
    const circus = RINGS.find((r) => r.id === 'circus') as (typeof RINGS)[number];
    let s = -1;
    for (const st of FIRST_MINUTE_STEPS) {
      const at = route.steps[st.step], q = samples.find((p) => p.s === at);
      expect(at, st.step).toBeGreaterThanOrEqual(s);
      expect(Math.hypot((q?.x ?? 0) - st.at[0], (q?.z ?? 0) - st.at[1]), `${st.step}'s place`).toBeLessThan(st.step === 'takedown' ? circus.r + 8 : 25);
      s = at;
    }
    // it ends inside the hotel's garage, past its door
    const hotel = sim.run.dropOffs.find((d) => d.name === 'hotel');
    expect(hotel).toBeDefined();
    if (!hotel || !last) return;
    const local = toDropOff(hotel, last.x, last.z, { along: 0, across: 0 });
    expect(Math.abs(local.along)).toBeLessThan(hotel.entry.along);
    expect(Math.abs(local.across)).toBeLessThan(hotel.entry.across);
    expect(route.entryS).toBeGreaterThan(length - 60);
  });
});
