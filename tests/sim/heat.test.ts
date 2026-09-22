import { describe, expect, it } from 'vitest';
import { EventLog } from '../../src/sim/events';
import { Heat } from '../../src/sim/heat/Heat';
import { createWorld } from './helpers';

describe('heat ratchet', () => {
  it('consumes each crime once, crosses thresholds and never decays or overflows', () => {
    const events = new EventLog();
    const heat = new Heat(events, null);
    for (let i = 0; i < 5; i++) events.push('takedown', 0.3, 0, 0, 0);
    heat.step();
    expect(heat.points).toBe(20);
    expect(heat.level).toBe(1);
    events.push('escape', 1, 0, 0, 0);
    events.push('respawn', 0, 0, 0, 0);
    for (let i = 0; i < 600; i++) heat.step();
    heat.add(-20);
    expect(heat.points).toBe(20);
    heat.add(100);
    expect(heat.points).toBe(100);
    expect(heat.level).toBe(5);
    heat.reset();
    heat.step();
    expect(heat.points).toBe(0);
    expect(heat.level).toBe(0);
    events.push('billboard', 0.3, 0, 0, 0);
    heat.step();
    expect(heat.points).toBe(2);
  });

  it('charges police takedowns more than civilian takedowns', async () => {
    const sim = await createWorld({ map: 'city', traffic: 0, peds: 0 });
    try {
      const traffic = sim.traffic!;
      const agent = traffic.spawnAt(0, 60, 'police');
      traffic.police[agent] = 1;
      traffic.wreck(agent);
      sim.events.push('takedownTraffic', 0.3, 0, 0, 0, agent);
      sim.heat.step();
      expect(sim.heat.points).toBe(10);
      sim.events.push('takedown', 0.3, 0, 0, 0, -1);
      sim.heat.step();
      expect(sim.heat.points).toBe(14);
    } finally { sim.dispose(); }
  });
});
