/** M8.10 slice 7b: the street furniture along the island's pavements, on the grid's rules and runtime (docs/M8.10_PLAN.md). */
import RAPIER from '@dimforge/rapier3d-compat';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROP_TYPES, PropState, clearControls, type SimWorld } from '../../../src/sim';
import { districtAt } from '../../../src/sim/city/City';
import { QUERY_NOT_PROP } from '../../../src/sim/collision';
import { CHUNKS_X, CHUNKS_Z, Island, PLUMB_TILT } from '../../../src/sim/island/Island';
import { districtOf } from '../../../src/sim/island/plan';
import { createWorld } from '../helpers';

describe('M8.10 slice 7b: the props on the island', () => {
  let sim: SimWorld, island: Island;
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => { sim = await createWorld({ map: 'island', traffic: 0, peds: 0 }); island = sim.island as Island; }, 60_000);
  afterAll(() => sim.dispose());

  it('7.5 each district\'s props within a fifth of the grid\'s, by the same rules (the Works\' at least 70 %: its port, canal and railway take the ground its streets had on the grid)', async () => {
    const isle: Record<string, number> = {}, grid: Record<string, number> = {};
    for (let k = 0; k < CHUNKS_X * CHUNKS_Z; k++) for (const p of island.props(k)) isle[districtOf(p.x, p.z)] = (isle[districtOf(p.x, p.z)] ?? 0) + 1;
    const city = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) for (const p of city.city?.props(cx, cz) ?? []) grid[districtAt(p.x, p.z).id] = (grid[districtAt(p.x, p.z).id] ?? 0) + 1;
    } finally { city.dispose(); }
    console.log('7.5 island', JSON.stringify(isle), 'grid', JSON.stringify(grid));
    for (const d of ['crown', 'foundry', 'gardens', 'marina']) {
      expect(isle[d] ?? 0, d).toBeGreaterThan((d === 'foundry' ? 0.7 : 0.8) * (grid[d] ?? 0));
      expect(isle[d] ?? 0, d).toBeLessThan(1.2 * (grid[d] ?? 0));
    }
  }, 120_000);

  it('7.6 a prop stands on its pavement or its ground, and a car knocks a loose one over', () => {
    const [ci, cj] = Island.chunkOf(island.spawns[0]?.position.x ?? 0, island.spawns[0]?.position.z ?? 0);
    // the chunks round the start are in the physics: their props are the sim's
    const props = sim.props;
    expect(props).not.toBeNull();
    if (!props) return;
    // (the physics' queries see the colliders after a step)
    for (let i = 0; i < 3; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
    let checked = 0;
    // the start's own chunk: its neighbours' kerbs are in the physics too
    for (let dj = 0; dj <= 0; dj++) for (let di = 0; di <= 0; di++) {
      for (const p of island.props(Island.chunkIndex(ci + di, cj + dj))) {
        expect(props.kind[p.id]).not.toBe(255);
        // one past the pavement stands on the drawn ground (its height the ground's own); one on it, on its kerb's slab
        if (Math.abs((props.base[p.id] as number) - island.ground.surfaceHeight(p.x, p.z)) < 1e-3) continue;
        const top = (props.base[p.id] as number) + 3;
        const hit = sim.world.castRay(new RAPIER.Ray({ x: p.x, y: top, z: p.z }, { x: PLUMB_TILT, y: -1, z: PLUMB_TILT }), 10, true, undefined, QUERY_NOT_PROP);
        expect(hit, `a ${p.kind} at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).not.toBeNull();
        if (hit) expect(Math.abs(top - hit.timeOfImpact - (props.base[p.id] as number)), `a ${p.kind} at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).toBeLessThan(0.03);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
    // a loose one: the car 8 m before it, driving at it at 40 km/h
    const target = [0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => island.props(Island.chunkIndex(ci + (n % 3) - 1, cj + Math.floor(n / 3) - 1)))
      .find((p) => PROP_TYPES[p.kind].breakImpulse === 0 && PROP_TYPES[p.kind].mass < 200);
    expect(target).toBeDefined();
    if (!target) return;
    const yaw = target.yaw + Math.PI, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const x0 = target.x - fx * 8, z0 = target.z - fz * 8;
    island.sync(x0, z0, true);
    sim.vehicle.teleport({ x: x0, y: island.standAt(x0, z0) + 0.9, z: z0 }, yaw);
    sim.vehicle.setVelocity(fx * 11, 0, fz * 11);
    for (let i = 0; i < 90 && props.state[target.id] === PropState.Standing; i++) { clearControls(sim.controls); sim.controls.throttle = 0.4; sim.step(); }
    expect(props.state[target.id], `a ${target.kind}`).not.toBe(PropState.Standing);
  });
});
