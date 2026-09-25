/**
 * The rivals on the car model (M8.8 slice 22), long: a duel's race run with the player kept 25 m behind its rival, so
 * the rival drives its physical car the whole way, against the same race with the rival on its lane; and the race
 * duels at three seeds with no rival's car on its roof. Run at the gate (`npm run verify:gate`).
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { RIVALS } from '../../src/sim/board/rivals';
import { CHAIN_ALL } from '../../src/sim/run/goal';
import { createWorld, run } from './helpers';

/** A duel's race from its kerb with the player 25 m behind the first rival; its finish time and its car's least upness. */
async function race(level: number, seed: number, physical: boolean): Promise<{ time: number; minUp: number }> {
  const sim: SimWorld = await createWorld({ map: 'city', seed, traffic: 1, peds: 0, record: false });
  try {
    sim.police!.dispatching = false;
    sim.run.chain = CHAIN_ALL;
    // the rivals before it beaten, its ring open now
    sim.board.beaten = (1 << level) - 1;
    sim.board.force = true;
    const d = sim.jobs.defs.find((k) => k.kind === 'duel' && k.level === level)!;
    const lx = Math.cos(d.yaw), lz = -Math.sin(d.yaw);
    sim.city?.sync(d.x - lx * 3, d.z - lz * 3, true);
    sim.vehicle.teleport({ x: d.x - lx * 3, y: 0.8, z: d.z - lz * 3 }, d.yaw);
    sim.vehicle.setVelocity(0, 0, 0);
    run(sim, 0.3);
    if (!physical) sim.jobs.race.physical = false;
    const traffic = sim.traffic!, agent = sim.jobs.race.rivals[0]!;
    let time = -1, minUp = 1;
    for (let i = 0; i < 240 * 60 && time < 0; i++) {
      const yaw = traffic.yaw[agent] as number, fx = Math.sin(yaw), fz = Math.cos(yaw), v = traffic.speed[agent] as number;
      sim.vehicle.teleport({ x: (traffic.x[agent] as number) - fx * 25, y: (traffic.y[agent] as number) + 0.8, z: (traffic.z[agent] as number) - fz * 25 }, yaw);
      sim.vehicle.setVelocity(fx * v, 0, fz * v);
      sim.step();
      const car = sim.ai!.carOf(agent);
      if (car) {
        const r = car.body.rotation();
        minUp = Math.min(minUp, 1 - 2 * (r.x * r.x + r.z * r.z));
      }
      if (sim.jobs.race.placeOf[0] !== 0) time = i / 60;
    }
    return { time, minUp };
  } finally { sim.dispose(); }
}

describe('M8.8 slice 22: the rivals on the car model (long)', () => {
  it('M8.8 22.2 #10\'s race at seed 42 finishes with a physical rival within 15 % of the lane rival\'s time', async () => {
    const lane = await race(0, 42, false), physical = await race(0, 42, true);
    console.log(`[rival] #10 at seed 42: lane ${lane.time.toFixed(1)} s, physical ${physical.time.toFixed(1)} s`);
    expect(lane.time).toBeGreaterThan(0);
    expect(physical.time).toBeGreaterThan(0);
    expect(Math.abs(physical.time - lane.time) / lane.time).toBeLessThan(0.15);
  }, 600_000);

  it('M8.8 22.3 no rival flips at a junction in 20 races', async () => {
    const levels = RIVALS.map((r, k) => (r.format === 'race' ? k : -1)).filter((k) => k >= 0);
    let races = 0, flips = 0;
    const lines: string[] = [];
    for (const seed of [42, 7, 123]) {
      for (const level of levels) {
        if (races === 20) break;
        const r = await race(level, seed, true);
        races++;
        if (r.minUp < 0.3) flips++;
        lines.push(`#${10 - level} seed ${seed}: ${r.time.toFixed(1)} s, least up ${r.minUp.toFixed(2)}`);
      }
    }
    console.log(`[rival] ${lines.join('\n  ')}`);
    expect(races).toBe(20);
    expect(flips).toBe(0);
  }, 3_600_000);
});
