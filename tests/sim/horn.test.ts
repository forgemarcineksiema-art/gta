/**
 * The horn as a verb (M6 slice 7, docs/DESIGN.md §14.4): H honks once a press;
 * a civilian ahead in the player's lane within reach moves toward its kerb for
 * a moment, one further on, one behind or a police unit does not, and a car
 * heeds it once a cooldown. The worn horn rides on the event for the sound;
 * every slot of the kit is worn into every car.
 */
import { describe, expect, it } from 'vitest';
import { KIT_INDEX, KIT_SLOTS, type SimWorld } from '../../src/sim';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { createWorld, run } from './helpers';

function world(): Promise<SimWorld> {
  return createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
}

/** A long straight lane near the player's spawn, and the player on it at `s`, facing its way. */
function onLane(sim: SimWorld, s: number): number {
  const traffic = sim.traffic as Traffic;
  let lane = -1;
  // a grid street's lane: one lane a direction (no parallel to change into), nothing authored, long enough
  const graph = sim.city!.graph.lanes;
  for (let l = 0; l < traffic.lanes.laneCount; l++) {
    const g = graph[l];
    if (!g || g.highway || g.special || traffic.parallel[l] !== -1 || (traffic.lanes.length[l] as number) < 150) continue;
    lane = l;
    break;
  }
  const pose = { x: 0, z: 0, yaw: 0 };
  traffic.lanes.positionAt(lane, s, 0, pose);
  sim.city?.sync(pose.x, pose.z, true);
  sim.vehicle.teleport({ x: pose.x, y: 0.8, z: pose.z }, pose.yaw);
  sim.vehicle.setVelocity(0, 0, 0);
  return lane;
}

describe('the horn', () => {
  it('M6 7.1 a car 20 m ahead in the lane moves aside for 2 s, one 40 m on or a unit does not; once a cooldown', async () => {
    const sim = await world();
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic;
      const honk = (): number => {
        let heeded = -1;
        const seq = sim.events.sequence;
        sim.controls.horn = true;
        sim.step();
        sim.events.readFrom(seq, (e) => { if (e.kind === 'horn') heeded = e.value; });
        return heeded;
      };
      // 40 m on: out of reach
      const lane = onLane(sim, 20);
      const far = traffic.spawnAt(lane, 62, 'hatch');
      expect(honk()).toBe(0);
      expect(traffic.hornLeft[far]).toBe(0);
      traffic.remove(far);
      // a unit: never
      const unit = traffic.spawnPoliceAt(lane, 38, 'police', sim.probe, 0, 1, 0, -1, true);
      expect(unit).toBeGreaterThanOrEqual(0);
      expect(honk()).toBe(0);
      traffic.remove(unit);
      // 20 m ahead: it moves toward its kerb for the moment, the big ones only hold their line
      const near = traffic.spawnAt(lane, 40, 'hatch');
      expect(honk()).toBe(1);
      expect(sim.controls.horn).toBe(false);
      expect(traffic.hornLeft[near]).toBeGreaterThan(TRAFFIC.horn.seconds - 0.1);
      run(sim, 1, (_t, c) => { c.brake = 1; });
      expect(traffic.shift[near]).toBeGreaterThan(TRAFFIC.horn.shift * 0.5);
      // honked again within its cooldown: not heeded again
      expect(honk()).toBe(0);
      run(sim, TRAFFIC.horn.seconds + 1, (_t, c) => { c.brake = 1; });
      expect(traffic.hornLeft[near]).toBe(0);
      expect(traffic.state[near]).not.toBe(AgentState.Free);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M6 7.2 the worn horn rides on the event', async () => {
    const sim = await world();
    try {
      sim.run.bank = 1e5;
      const kazoo = KIT_INDEX['kazoo'] as number;
      expect(sim.kit.buy(kazoo)).toBe('ok');
      let item = -9;
      const seq = sim.events.sequence;
      sim.controls.horn = true;
      sim.step();
      sim.events.readFrom(seq, (e) => { if (e.kind === 'horn') item = e.target; });
      expect(item).toBe(kazoo);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M6 7.3 every slot of the kit is worn into every car the player drives', async () => {
    const sim = await world();
    try {
      sim.run.bank = 1e6;
      const items = ['duck', 'neonCyan', 'goose', 'flameBlue', 'smokeRed'].map((id) => KIT_INDEX[id] as number);
      for (const i of items) expect(sim.kit.buy(i)).toBe('ok');
      for (const body of ['taxi', 'bus', 'bubble', 'partybus'] as const) {
        sim.garage.own(body);
        sim.garage.select(body);
        sim.garage.applyToVehicle();
        for (let s = 0; s < KIT_SLOTS.length; s++) expect(sim.kit.worn(KIT_SLOTS[s] as never), `${body} ${KIT_SLOTS[s]}`).toBe(items[s]);
      }
    } finally { sim.dispose(); }
  }, 60_000);
});
