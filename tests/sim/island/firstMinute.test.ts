/** M8.10 slice 14: the island's first minute, its route (docs/M8.10_PLAN.md §1.4). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BALANCE, type ColdOpenRoute, type SimWorld } from '../../../src/sim';
import { COIN_HEIGHT } from '../../../src/sim/city/coins';
import { toDropOff } from '../../../src/sim/city/cover';
import { Island } from '../../../src/sim/island/Island';
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

  it('14c.1 the cold open drives it: the van at its start rolling down Crown Avenue with the heat on, the muscle car ahead; through the billboard at its step, the marker at the delivery\'s, the job into the hotel\'s garage; its coins over the road, no prop on its way', () => {
    const co = sim.coldOpen, island = sim.island as Island;
    co.start();
    expect(co.active).toBe(true);
    const r = co.route as ColdOpenRoute, first = r.samples[0] as (typeof r.samples)[number], p = sim.vehicle.body.translation();
    expect(Math.hypot(p.x - first.x, p.z - first.z)).toBeLessThan(0.5);
    expect(sim.vehicle.body.linvel().x * Math.sin(first.yaw) + sim.vehicle.body.linvel().z * Math.cos(first.yaw)).toBeGreaterThan(BALANCE.coldOpen.startSpeed - 0.5);
    expect(sim.heat.points).toBeGreaterThanOrEqual(BALANCE.coldOpen.heat);
    expect(co.candidate).toBeGreaterThanOrEqual(0);
    expect(sim.traffic?.bodyOf(co.candidate)).toBe('muscle');
    // the gate: the billboard at its step, the route through its middle
    const step = (name: string): readonly [number, number] => (FIRST_MINUTE_STEPS.find((s) => s.step === name) as { at: readonly [number, number] }).at;
    expect(r.gate).not.toBeNull();
    const gate = r.gate as NonNullable<typeof r.gate>;
    expect(Math.hypot(gate.x - step('billboard')[0], gate.z - step('billboard')[1])).toBeLessThan(20);
    let through = Infinity;
    for (let k = 0; k + 1 < r.samples.length; k++) {
      const a = r.samples[k] as (typeof r.samples)[number], b = r.samples[k + 1] as (typeof r.samples)[number], dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((gate.x - a.x) * dx + (gate.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      through = Math.min(through, Math.hypot(gate.x - a.x - dx * t, gate.z - a.z - dz * t));
    }
    expect(through).toBeLessThan(0.3);
    // the marker at the delivery's step, its job's end four metres inside the hotel's garage
    expect(Math.hypot(co.markerX - step('delivery')[0], co.markerZ - step('delivery')[1])).toBeLessThan(40);
    const job = sim.jobs.defOf(co.job), hotel = sim.run.dropOffs.find((d) => d.name === 'hotel');
    expect(job?.kind).toBe('delivery');
    if (!job || !hotel) return;
    expect(Math.hypot(job.targetX - hotel.door.x, job.targetZ - hotel.door.z)).toBeCloseTo(BALANCE.jobs.markerRadius, 3);
    // its coins over the road the route runs on, the cap on the marker
    const coins = sim.coins?.extra.filter((q) => q.lane === -3) ?? [];
    expect(coins.length).toBeGreaterThan(40);
    for (const q of coins) expect(Math.abs(q.y - COIN_HEIGHT - island.ground.surfaceHeight(q.x, q.z)), `a coin at ${q.x.toFixed(0)}, ${q.z.toFixed(0)}`).toBeLessThan(0.15);
    expect(coins.some((q) => q.value === BALANCE.coin.cap && Math.hypot(q.x - co.markerX, q.z - co.markerZ) < 0.01)).toBe(true);
    // no prop where it drives (through the gate's strip, into the garage)
    for (const s of r.samples) {
      const [ci, cj] = Island.chunkOf(s.x, s.z);
      for (const q of island.props(Island.chunkIndex(ci, cj))) expect(Math.hypot(q.x - s.x, q.z - s.z), `a ${q.kind} on the route at ${s.s.toFixed(0)} m`).toBeGreaterThan(2);
    }
    co.skip();
  });
});
