/** M8.10 slice 3: what covers the island's ground, and the sea round it (docs/M8.10_PLAN.md). */
import { beforeAll, describe, expect, it } from 'vitest';
import { ASPHALT, CAR_PRESETS, DEFAULT_TUNING, DIRT, GRASS, SAND, SEA, clearControls, initPhysics, type SurfaceKind } from '../../../src/sim';
import type { Island } from '../../../src/sim/island/Island';
import { Ground } from '../../../src/sim/island/ground';
import { createWorld } from '../helpers';

describe('M8.10 slice 3: the ground\'s cover', () => {
  beforeAll(async () => { await initPhysics(); });

  it('3.2 the surface at known points: the beaches\' and the islet\'s sand, the golf\'s grass, the quarry\'s dirt, the paving, a dirt track paved where it meets a road', () => {
    const g = new Ground();
    // world axes (+X west, +Z north): the sketch's (x, z) is (-x, -z)
    const known: Array<[string, number, number, SurfaceKind]> = [
      ['the south beach, west', -100, -780, SAND],
      ['the south beach, east', 300, -780, SAND],
      ['the bay\'s beach', -345, -600, SAND],
      ['the islet', -1036, -355, SAND],
      ['the golf course', 700, -620, GRASS],
      ['a field by the centre', 300, 200, GRASS],
      ['the quarry', 700, 513, DIRT],
      ['a quarry track', 685, 565, DIRT],
      ['the highway', -320, -704, ASPHALT],
      ['the runway', -1025, 300, ASPHALT],
      ['the port\'s apron by the basin', -515, 650, ASPHALT],
    ];
    for (const [name, x, z, kind] of known) expect(g.surface(x, z), name).toBe(kind);
    // a road graded later reads the paving it is laid on: the dirt track's end on the paved road it meets
    const track = g.roads.find((r) => r.id === 'quarry-track-south');
    const end = track?.pts[0];
    expect(end).toBeDefined();
    if (end) expect(g.surface(end[0], end[1])).toBe(ASPHALT);
  });

  it('3.3 the sand in the surface table: a grip between dirt\'s and the road\'s, dirt\'s drag; the 4×4 at home on it', async () => {
    expect(DEFAULT_TUNING.sandGrip).toBe(0.85);
    expect(DEFAULT_TUNING.sandGrip).toBeGreaterThan(DEFAULT_TUNING.dirtGrip);
    expect(DEFAULT_TUNING.sandRoll).toBe(DEFAULT_TUNING.dirtRoll);
    expect(CAR_PRESETS.offroad.sandGrip).toBe(1);
    expect(CAR_PRESETS.offroad.sandRoll).toBe(CAR_PRESETS.offroad.dirtRoll);
    // and the wheels read it on the beach
    const sim = await createWorld({ map: 'island', traffic: 0, peds: 0 });
    const island = sim.island as Island;
    island.sync(-100, -780, true);
    sim.vehicle.teleport({ x: -100, y: island.heightAt(-100, -780) + 0.8, z: -780 }, Math.PI / 2);
    for (let i = 0; i < 40; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
    expect(sim.vehicle.wheels.filter((w) => w.grounded && w.surface === SAND).length).toBe(4);
  });

  it('3.5 a wheel on what is built over the ground reads the road\'s: the bay bridge\'s deck over the sea, a drive-through\'s floor on the grass', async () => {
    const sim = await createWorld({ map: 'island', traffic: 0, peds: 0 });
    const island = sim.island as Island;
    const on = (x: number, y: number, z: number, yaw: number): number => {
      island.sync(x, z, true);
      sim.vehicle.teleport({ x, y: y + 0.8, z }, yaw);
      for (let i = 0; i < 40; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
      return sim.vehicle.wheels.filter((w) => w.grounded && w.surface === ASPHALT).length;
    };
    const bridge = island.structures.find((s) => s.kind === 'bridge');
    const deck = bridge?.pieces[Math.floor(bridge.pieces.length / 2)];
    expect(deck).toBeDefined();
    if (deck) {
      expect(island.ground.onLand(deck.x, deck.z), 'the bridge over the sea').toBe(false);
      expect(on(deck.x, deck.y, deck.z, deck.yaw)).toBe(4);
    }
    const site = island.services.find((s) => s.kind === 'repair');
    expect(site).toBeDefined();
    if (site) {
      expect(island.ground.surface(site.x, site.z), 'the ground under the floor').toBe(GRASS);
      expect(on(site.x, site.y, site.z, site.yaw)).toBe(4);
    }
  });

  it('3.4 a car in the sea is put back on the nearest road within two seconds', async () => {
    const sim = await createWorld({ map: 'island', traffic: 0, peds: 0 });
    const island = sim.island as Island;
    // a hundred metres off the south beach, on the sea's floor
    island.sync(0, -900, true);
    sim.vehicle.teleport({ x: 0, y: island.heightAt(0, -900) + 0.6, z: -900 }, 0);
    let back = -1;
    for (let i = 0; i < 120 && back < 0; i++) {
      clearControls(sim.controls);
      sim.step();
      if (sim.respawned) back = i;
    }
    expect(back).toBeGreaterThan(0);
    const p = sim.vehicle.body.translation();
    expect(p.y).toBeGreaterThan(SEA.level);
    const road = { name: '', position: { x: 0, y: 0, z: 0 }, yaw: 0 };
    island.nearestRoad(p.x, p.z, road);
    expect(Math.hypot(road.position.x - p.x, road.position.z - p.z)).toBeLessThan(1);
  });
});
