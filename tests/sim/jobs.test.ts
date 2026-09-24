/**
 * The jobs skeleton (docs/M4_PLAN.md slice 4): a delivery ring starts the
 * job and adds its heat once, arrival pays the payout with the time bonus
 * into the bag, the clock fails it, a second ring does nothing while one
 * runs, and abandon is silent. M5 slice 1: the generator's placement, the
 * delivery on a placed def, the way's goal during a job and between jobs (the bot
 * drives one, 1.7, in jobs.long.test.ts).
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import type { EventKind } from '../../src/sim/events';
import type { JobDef, SimWorld } from '../../src/sim';
import { lanePathTo, placeJobs, pointTarget } from '../../src/sim/jobs/place';
import { BLOCK, HIGHWAY_HALF, ROAD_HALF, distanceToPolyline, projectOnLane } from '../../src/sim/city/roads';
import { createWorld, run, runUntil } from './helpers';

/** Writes `src/sim/jobs/baked.ts` with the seed's placement (`npm run bake:jobs`). */
function writeBaked(seed: number, defs: readonly JobDef[]): void {
  const row = (d: JobDef): string => '    { ' + Object.entries(d).map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v}'` : String(v)}`).join(', ') + ' },';
  const text = [
    '/**',
    ' * The jobs\' placement for the shipping seed, baked so the boot does not generate the chunks `placeJobs`',
    ' * checks (M5.1). Written by `npm run bake:jobs`; jobs 1.1 fails when it drifts from the generator.',
    ' */',
    "import type { JobDef } from './catalog';",
    '',
    'export const BAKED_JOBS: Readonly<Record<number, readonly JobDef[]>> = {',
    `  ${seed}: [`,
    ...defs.map(row),
    '  ],',
    '};',
    '',
  ].join('\n');
  writeFileSync(new URL('../../src/sim/jobs/baked.ts', import.meta.url), text);
}

function count(sim: SimWorld, from: number, kind: EventKind): number {
  let n = 0;
  sim.events.readFrom(from, (e) => { if (e.kind === kind) n++; });
  return n;
}

// ---- M5 slice 1: placement, the delivery, the arrow and its idle target ----

/** Metres from a point to the nearest carriageway edge: the grid streets, the highway and the authored roads. */
function roadClearance(sim: SimWorld, x: number, z: number): number {
  let best = Infinity;
  for (let g = -3; g <= 3; g++) {
    const half = Math.abs(g) === 3 ? HIGHWAY_HALF : ROAD_HALF;
    best = Math.min(best, Math.abs(x - g * BLOCK) - half, Math.abs(z - g * BLOCK) - half);
  }
  for (const road of sim.city!.graph.special) best = Math.min(best, distanceToPolyline(road.centre, x, z) - road.halfWidth);
  return best;
}

/** Teleports the car onto a point, loads the chunks there, and steps once. */
function drop(sim: SimWorld, x: number, z: number, yaw = 0): void {
  sim.city?.sync(x, z, true);
  sim.vehicle.teleport({ x, y: 0.8, z }, yaw);
  sim.vehicle.setVelocity(0, 0, 0);
  sim.step();
}

async function placedWorld(): Promise<SimWorld> {
  return createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
}

function firstDelivery(sim: SimWorld): JobDef {
  return sim.jobs.defs.find((d) => d.kind === 'delivery')!;
}

describe('jobs (M5 slice 1)', () => {
  it('1.1 placement: 39 defs (6/6/4/4/4/2/2 and the eleven rivals), deterministic, off the carriageway, 60 m apart, deliveries at least 400 m by path', async () => {
    const sim = await placedWorld();
    try {
      const defs = sim.jobs.defs;
      // the four time trials (M5.5 slice 10), the four street races (slice 11), two rage and two mayhem zones (12);
      // the wanted board's eleven (M6 slice 1: the ten rivals and the Chief, each waiting at a kerbside bay)
      expect(defs.length).toBe(39);
      expect(defs.filter((d) => d.kind === 'duel').map((d) => d.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const bays = sim.city!.roadMarkings.parking;
      for (const d of defs.filter((k) => k.kind === 'duel')) expect(bays.some((b) => Math.hypot(b.x - d.x, b.z - d.z) < 0.01)).toBe(true);
      expect(defs.filter((d) => d.kind === 'delivery').length).toBe(6);
      expect(defs.filter((d) => d.kind === 'order').length).toBe(6);
      expect(defs.filter((d) => d.kind === 'escape').length).toBe(4);
      expect(defs.filter((d) => d.kind === 'trial').length).toBe(4);
      expect(defs.filter((d) => d.kind === 'race').length).toBe(4);
      expect(defs.filter((d) => d.kind === 'rage').length).toBe(2);
      expect(defs.filter((d) => d.kind === 'mayhem').length).toBe(2);
      const placed = placeJobs(sim.city!, 42, sim.traffic!.lanes);
      if (process.env.npm_lifecycle_event === 'bake:jobs') writeBaked(42, placed);
      // the boot reads the baked table: `npm run bake:jobs` rewrites it when the generator moves
      else expect(JSON.stringify(placed)).toBe(JSON.stringify(defs));
      for (const d of defs) {
        // a rival's ring is round its car at the kerb, on the road by design
        if (d.kind !== 'duel') expect(roadClearance(sim, d.x, d.z)).toBeGreaterThanOrEqual(BALANCE.jobs.markerRadius + 1);
        for (const e of defs) if (e !== d) expect(Math.hypot(d.x - e.x, d.z - e.z)).toBeGreaterThanOrEqual(BALANCE.jobs.markerMinGap);
      }
      for (const d of defs.filter((k) => k.kind === 'delivery')) {
        const path = lanePathTo(sim.city!, sim.traffic!.lanes, d.x, d.z, pointTarget(sim.city!, d.targetX, d.targetZ));
        expect(path.length).toBeGreaterThanOrEqual(BALANCE.jobs.delivery.minPath);
        expect(d.limitSeconds).toBeGreaterThanOrEqual(BALANCE.jobs.delivery.limitMin);
        expect(d.payout).toBeGreaterThanOrEqual(BALANCE.jobs.delivery.payoutMin);
        expect(d.payout).toBeLessThanOrEqual(BALANCE.jobs.delivery.payoutMax);
      }
      expect(defs.filter((d) => d.kind === 'escape').map((d) => d.level)).toEqual(BALANCE.jobs.escape.levels);
    } finally { sim.dispose(); }
  });

  it('1.2 driving into a delivery ring starts it: active, one jobStart, heat +6 once, the clock at the limit', async () => {
    const sim = await placedWorld();
    try {
      const d = firstDelivery(sim);
      const seq = sim.events.sequence;
      drop(sim, d.x, d.z);
      expect(sim.jobs.state).toBe('active');
      expect(sim.jobs.active).toBe(d.id);
      expect(Math.abs(sim.jobs.remaining - d.limitSeconds)).toBeLessThanOrEqual(1 / 60 + 1e-9);
      run(sim, 1);
      expect(count(sim, seq, 'jobStart')).toBe(1);
      expect(sim.heat.points).toBe(BALANCE.jobs.delivery.heat);
    } finally { sim.dispose(); }
  });

  it('1.3 the target is the drop-off; the goal is the job and the route of the way ends on it (M8.7, no arrow)', async () => {
    const sim = await placedWorld();
    try {
      const d = firstDelivery(sim);
      drop(sim, d.x, d.z);
      const t = { x: 0, z: 0 };
      expect(sim.jobs.target(t)).toBe(true);
      expect(t.x).toBe(d.targetX);
      expect(t.z).toBe(d.targetZ);
      run(sim, 0.3);
      const way = sim.way!;
      expect(way.goal.kind).toBe('job');
      expect([way.goal.x, way.goal.z]).toEqual([d.targetX, d.targetZ]);
      expect(way.count).toBeGreaterThan(1);
      expect([way.points[way.count * 2 - 2], way.points[way.count * 2 - 1]]).toEqual([Math.fround(d.targetX), Math.fround(d.targetZ)]);
    } finally { sim.dispose(); }
  });

  it('1.4 arriving with 30 s left of 90 pays payout x (1 + 0.5 x 30/90) into the bag; idle after the hold', async () => {
    const sim = await placedWorld();
    try {
      const d = firstDelivery(sim);
      d.limitSeconds = 90;
      const seq = sim.events.sequence;
      drop(sim, d.x, d.z);
      expect(runUntil(sim, 90, (s) => s.jobs.remaining <= 30 + 1e-9)).toBeGreaterThan(0);
      const remaining = sim.jobs.remaining;
      const bag = sim.run.bag;
      drop(sim, d.targetX, d.targetZ, 0);
      const expected = d.payout * (1 + BALANCE.jobs.timeBonus * remaining / 90);
      expect(Math.abs(sim.run.bag - bag - expected)).toBeLessThanOrEqual(1);
      expect(count(sim, seq, 'jobDone')).toBe(1);
      expect(sim.jobs.state).toBe('done');
      run(sim, BALANCE.jobs.holdSeconds + 0.1);
      expect(sim.jobs.state).toBe('idle');
    } finally { sim.dispose(); }
  });

  it('1.5 the clock fails it: jobFailed, the bag unchanged, the heat kept', async () => {
    const sim = await placedWorld();
    try {
      const d = firstDelivery(sim);
      d.limitSeconds = 5;
      const seq = sim.events.sequence;
      drop(sim, d.x, d.z);
      const bag = sim.run.bag;
      expect(runUntil(sim, 6, (s) => s.jobs.state === 'failed')).toBeGreaterThan(0);
      expect(count(sim, seq, 'jobFailed')).toBe(1);
      expect(sim.run.bag).toBe(bag);
      expect(sim.heat.points).toBe(BALANCE.jobs.delivery.heat);
    } finally { sim.dispose(); }
  });

  it('1.6 another marker does nothing while one runs; abandon goes idle with no event', async () => {
    const sim = await placedWorld();
    try {
      const [a, b] = sim.jobs.defs.filter((d) => d.kind === 'delivery') as [JobDef, JobDef];
      drop(sim, a.x, a.z);
      expect(sim.jobs.active).toBe(a.id);
      const seq = sim.events.sequence;
      drop(sim, b.x, b.z);
      run(sim, 0.5);
      expect(sim.jobs.active).toBe(a.id);
      expect(count(sim, seq, 'jobStart')).toBe(0);
      const before = sim.events.sequence;
      sim.jobs.abandon();
      expect(sim.jobs.state).toBe('idle');
      expect(sim.jobs.active).toBe(-1);
      expect(sim.events.sequence).toBe(before);
    } finally { sim.dispose(); }
  });

  it('1.8 idle: the goal of the way, the ring nearest by road (M8.7 D1); above the door threshold a door; during a job its target', async () => {
    const sim = await placedWorld();
    try {
      run(sim, 0.1);
      const way = sim.way!;
      expect(way.goal.kind).toBe('take');
      const live = sim.jobs.defs.filter((d) => d.kind !== 'fare' && sim.jobs.live(d));
      const nearest = live.reduce((a, b) => (way.ringDistance(b.id) < way.ringDistance(a.id) ? b : a));
      expect(way.goal.id).toBe(nearest.id);
      expect([way.goal.x, way.goal.z]).toEqual([nearest.x, nearest.z]);
      sim.run.bag = BALANCE.offer.doorThreshold + 1;
      run(sim, 0.1);
      expect(way.goal.kind).toBe('bank');
      const door = sim.run.dropOffs[way.goal.door]!.door;
      expect([way.goal.x, way.goal.z]).toEqual([door.x, door.z]);
      const d = firstDelivery(sim);
      drop(sim, d.x, d.z);
      expect(way.goal.kind).toBe('job');
      expect([way.goal.x, way.goal.z]).toEqual([d.targetX, d.targetZ]);
    } finally { sim.dispose(); }
  });

  it('1.10 every marker has its coin ring: seven coins on the side facing the junction and a cap in front of the beacon', async () => {
    const sim = await placedWorld();
    try {
      // laid on the jobs' first step
      sim.step();
      const extra = sim.coins!.extra;
      // a rival's ring has none: it is there only while the board says so (M6)
      for (const d of sim.jobs.defs.filter((k) => k.kind !== 'duel')) {
        const ring = extra.filter((c) => Math.hypot(c.x - d.x, c.z - d.z) <= BALANCE.jobs.markerRadius + 0.01);
        expect(ring.length).toBe(8);
        expect(ring.filter((c) => c.value === BALANCE.coin.cap).length).toBe(1);
        // the half facing the junction: every coin is at most a right angle off the marker's facing
        for (const c of ring) {
          const along = (c.x - d.x) * Math.sin(d.yaw) + (c.z - d.z) * Math.cos(d.yaw);
          expect(along).toBeGreaterThan(-1e-6);
        }
      }
    } finally { sim.dispose(); }
  });
});

describe('jobs (M5.5 slice 1)', () => {
  it('1.3 a delivery lays its route\'s coins on the chain\'s lanes with the cap on the target, clears them at the end, and the clean line pays the tip', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    sim.police!.dispatching = false;
    try {
      const d = sim.jobs.defs.find((j) => j.kind === 'delivery')!;
      const coins = sim.coins!;
      const city = sim.city!;
      sim.city?.sync(d.x, d.z, true);
      sim.vehicle.teleport({ x: d.x, y: 0.8, z: d.z }, d.yaw);
      sim.vehicle.setVelocity(0, 0, 0);
      sim.step();
      expect(sim.jobs.state).toBe('active');
      const total = coins.routeTotal;
      expect(total).toBeGreaterThanOrEqual(20);
      expect(total).toBeLessThanOrEqual(120);
      const route = coins.extra.filter((c) => c.lane === -5);
      expect(route.length).toBe(total);
      const hit = { x: 0, z: 0, yaw: 0 };
      for (const c of route) {
        if (c.value === BALANCE.coin.cap) continue;
        const lane = city.graph.lanes[city.nearestLane(c.x, c.z)]!;
        expect(Math.sqrt(projectOnLane(lane, c.x, c.z, hit))).toBeLessThan(2.5);
        expect(c.value).toBe(BALANCE.coin.value);
      }
      const cap = route[route.length - 1]!;
      expect(cap.value).toBe(BALANCE.coin.cap);
      expect(Math.hypot(cap.x - d.targetX, cap.z - d.targetZ)).toBeLessThan(0.01);
      // every coin but the cap taken, then arrival: the cap is taken by arriving, the tip is paid
      for (const c of route) if (c.id !== cap.id) coins.take(c.id, sim.events);
      expect(coins.routePicked).toBe(total - 1);
      const remaining = sim.jobs.remaining;
      const bag = sim.run.bag;
      sim.vehicle.teleport({ x: d.targetX, y: 0.8, z: d.targetZ }, d.yaw);
      sim.step();
      expect(sim.jobs.state).toBe('done');
      expect(sim.jobs.lastTip).toBe(true);
      const base = Math.round(d.payout * (1 + BALANCE.jobs.timeBonus * (remaining - 1 / 60) / d.limitSeconds));
      expect(Math.abs(sim.run.bag - bag - (base + Math.round(d.payout * BALANCE.coin.route.tip)))).toBeLessThanOrEqual(Math.round(d.payout * BALANCE.jobs.timeBonus / d.limitSeconds / 60) + 1);
      expect(coins.routeTotal).toBe(0);
      expect(coins.extra.filter((c) => c.lane === -5).length).toBe(0);
      // the same delivery with a coin missed: no tip
      run(sim, BALANCE.jobs.holdSeconds + 0.2);
      sim.vehicle.teleport({ x: d.x + Math.sin(d.yaw) * 30, y: 0.8, z: d.z + Math.cos(d.yaw) * 30 }, d.yaw);
      run(sim, 0.2);
      sim.vehicle.teleport({ x: d.x, y: 0.8, z: d.z }, d.yaw);
      sim.step();
      expect(sim.jobs.state).toBe('active');
      const again = coins.extra.filter((c) => c.lane === -5);
      expect(again.length).toBe(total);
      for (const c of again.slice(0, again.length - 2)) coins.take(c.id, sim.events);
      const bag2 = sim.run.bag;
      sim.vehicle.teleport({ x: d.targetX, y: 0.8, z: d.targetZ }, d.yaw);
      sim.step();
      expect(sim.jobs.state).toBe('done');
      expect(sim.jobs.lastTip).toBe(false);
      expect(sim.run.bag - bag2).toBeLessThan(d.payout * (1 + BALANCE.jobs.timeBonus) + 1);
    } finally { sim.dispose(); }
  }, 60_000);
});
