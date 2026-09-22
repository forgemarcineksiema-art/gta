import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_DT, SimWorld, initPhysics } from '../../src/sim';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { HIGHWAY_LANE_OFFSETS, buildRoadGraph, roadTour } from '../../src/sim/city/roads';

beforeAll(initPhysics);

describe('M2 city', () => {
  it('has connected directed lanes and a closed tour covering every lane', () => {
    const graph = buildRoadGraph(), tour = roadTour(graph);
    expect(graph.nodes).toHaveLength(49);
    // 84 grid edges: 60 street edges carry one lane per direction, the 24
    // perimeter edges carry two (M4 slice 0: real highway lanes, so a roadblock
    // has something to stand across). Each authored road adds two.
    expect(graph.lanes).toHaveLength(2 * 60 + 4 * 24 + 2 * graph.special.length);
    expect(graph.lanes.filter((l) => l.highway)).toHaveLength(96);
    for (const lane of graph.lanes) expect(HIGHWAY_LANE_OFFSETS.includes(lane.offset as 4 | 12)).toBe(lane.highway);
    expect(graph.special).toHaveLength(5);
    expect(new Set(tour).size).toBe(graph.lanes.length);
    for (let i = 0; i < tour.length; i++) {
      const a = graph.lanes[tour[i] as number], b = graph.lanes[tour[(i + 1) % tour.length] as number];
      expect(a?.to).toBe(b?.from);
      expect(a?.next).toContain(b?.id);
    }
    const seen = new Set<number>(), queue = [0];
    while (queue.length) {
      const id = queue.pop() as number;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const lane of graph.nodes[id]?.outgoing ?? []) queue.push(graph.lanes[lane]?.to ?? -1);
    }
    expect(seen.size).toBe(49);
  });

  it('regenerates identical geometry from a seed and bounds physics residency on revisits', () => {
    const sim = new SimWorld({ map: 'city', seed: 42 });
    try {
      const city = sim.city;
      expect(city).toBeTruthy();
      const original = JSON.stringify(city?.generate(-2, -2));
      const initial = sim.world.colliders.len();
      for (let lap = 0; lap < 3; lap++) for (const name of ['crown', 'foundry', 'marina', 'gardens', 'city']) {
        sim.spawnAt(name); sim.step();
        expect(city?.active.size).toBeLessThanOrEqual(25);
        expect(sim.world.colliders.len()).toBeLessThan(600);
        expect(sim.hasNaN()).toBe(false);
      }
      expect(JSON.stringify(city?.generate(-2, -2))).toBe(original);
      expect(city?.unloaded).toBeGreaterThan(0);
      // A reset to the same position doesn't create another set of colliders.
      const count = sim.world.colliders.len();
      sim.spawnAt('city'); sim.step(); expect(sim.world.colliders.len()).toBe(count);
      expect(initial).toBeGreaterThan(100);
    } finally { sim.dispose(); }
  });

  it('projects reset onto a nearby lane and restores collision residency after a teleport', () => {
    const sim = new SimWorld({ map: 'city' });
    try {
      const spawn = sim.nearestSpawn(4, 320);
      expect(spawn.position.z).toBe(320);
      expect(Math.abs(spawn.position.x)).toBe(4.5);
      sim.spawnAt('marina');
      expect(sim.city?.active.has('2,2')).toBe(true);
      sim.controls.reset = true;
      for (let i = 0; i < 120; i++) sim.step();
      expect(sim.vehicle.body.translation().x).toBeCloseTo(445.5, 1);
      expect(sim.vehicle.body.translation().z).toBeCloseTo(490, 1);
      expect(sim.vehicle.body.translation().y).toBeGreaterThan(0.2);
      expect(sim.vehicle.telemetry.groundedWheels).toBe(4);
    } finally { sim.dispose(); }
  });

  it('drives the whole road graph without resets, seam jumps or escaped bodies', () => {
    const sim = new SimWorld({ map: 'city', record: false, traffic: 0, peds: 0 });
    const bot = new TrackBot('muscle', CITY_BOT_TUNING);
    let maxY = 0, minY = Infinity, maxImpact = 0;
    try {
      for (let i = 0; i < 190_000 && !bot.tourComplete; i++) {
        bot.drive(sim, sim.controls, FIXED_DT); sim.step();
        if (i > 120) { const y = sim.transforms.currPos[sim.vehicle.slot * 3 + 1] as number; maxY = Math.max(maxY, y); minY = Math.min(minY, y); }
        maxImpact = Math.max(maxImpact, sim.vehicle.telemetry.impact);
        if (i % 600 === 0) {
          expect(sim.hasNaN()).toBe(false);
          expect(sim.city?.active.size).toBeLessThanOrEqual(25);
        }
      }
      console.log(`[city tour] lanes ${bot.visitedLanes.size}/${sim.city?.graph.lanes.length} time ${sim.time.toFixed(1)}s resets ${bot.resets} y ${minY.toFixed(3)}..${maxY.toFixed(3)} max impact ${maxImpact.toFixed(2)}`);
      expect(bot.resets).toBe(0);
      expect(bot.tourComplete).toBe(true);
      expect(minY).toBeGreaterThan(0.2);
      expect(maxY).toBeLessThan(1.2);
      expect(maxImpact).toBeLessThan(2);
    } finally { sim.dispose(); }
  }, 120_000);
});
