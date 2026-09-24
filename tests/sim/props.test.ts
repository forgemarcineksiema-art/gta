/**
 * The city's props (M7 slice 0, D6): the stash's hidden cars and the rivals'
 * parked cars stand on records above the traffic's pool. The spawner never
 * takes one, the density never counts one, and a claim for a police unit
 * never frees one.
 */
import { describe, expect, it } from 'vitest';
import { PROP_RECORDS, AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run } from './helpers';

describe('props', () => {
  it('M7 0.2 props live above the pool: never spawned into, never counted, never claimed', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      expect(traffic.capacity).toBe(traffic.pool + PROP_RECORDS);
      const p = sim.probe;
      const a = traffic.spawnProp(p.x + 30, p.z, 0, 'roadster', AgentState.Parked, 0xff0000);
      expect(traffic.isProp(a)).toBe(true);
      // a minute of traffic filling its pool around the player: no record above the pool but the prop
      run(sim, 60, (_t, c) => { c.brake = 1; });
      for (let i = traffic.pool; i < traffic.capacity; i++) expect(traffic.state[i] === AgentState.Free || i === a).toBe(true);
      expect(traffic.state[a]).toBe(AgentState.Parked);
      // a claim when the pool is full frees a driving civilian, never the prop
      for (let k = 0; k < traffic.pool; k++) {
        const i = traffic.claim(p, 0, -1);
        if (i < 0) break;
        expect(traffic.isProp(i)).toBe(false);
        traffic.spawnAtPoint(p.x + 500 + k, p.z + 500, 0, 'sedan', AgentState.Abandoned);
      }
      expect(traffic.state[a]).toBe(AgentState.Parked);
      // every record above the pool but the prop is still free
      let props = 0;
      for (let i = traffic.pool; i < traffic.capacity; i++) if (traffic.state[i] !== AgentState.Free) props++;
      expect(props).toBe(1);
    } finally { sim.dispose(); }
  }, 60_000);
});
