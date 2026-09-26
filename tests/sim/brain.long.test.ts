/**
 * The arrest across the city (docs/history/M4_PLAN.md slice 3c), with traffic and
 * pedestrians on: a player who stops at heat 2 is boxed and busted within
 * 20 s wherever it happens, the units arrive braking (never at chase speed)
 * and none of them writes itself off on the player. Long: four worlds with
 * the full traffic pool.
 */
import { describe, expect, it } from 'vitest';
import { AgentState } from '../../src/sim/traffic/Traffic';
import { createWorld } from './helpers';

describe('the arrest', () => {
  it('3c.5 a player stopped at heat 2 is boxed and busted in under 20 s, gently, with no police wreck', async () => {
    for (const [seed, spawn] of [[42, 'crown'], [7, 'foundry'], [123, 'gardens'], [42, 'marina']] as const) {
      const sim = await createWorld({ map: 'city', seed, traffic: 1, peds: 1, record: false, heat: 40, spawn });
      const traffic = sim.traffic!;
      try {
        let busted = -1, fastest = 0, wrecks = 0;
        const wasWreck = new Uint8Array(traffic.capacity);
        for (let i = 0; i < 20 * 60 && busted < 0; i++) {
          sim.step();
          for (let a = 0; a < traffic.capacity; a++) {
            if (traffic.police[a] !== 1) continue;
            const wreck = traffic.state[a] === AgentState.Wrecked ? 1 : 0;
            if (wreck && !wasWreck[a]) wrecks++;
            wasWreck[a] = wreck;
            if (wreck || traffic.state[a] === AgentState.Free) continue;
            // how fast a unit is going when it gets within a car length and a half of the player
            if (Math.hypot((traffic.x[a] as number) - sim.probe.x, (traffic.z[a] as number) - sim.probe.z) < 8) fastest = Math.max(fastest, traffic.speed[a] as number);
          }
          if (sim.run.state === 'busted') busted = i / 60;
        }
        console.log(`[arrest] ${spawn} seed ${seed}: busted at ${busted.toFixed(1)} s, fastest unit within 8 m ${fastest.toFixed(1)} m/s, police wrecks ${wrecks}`);
        expect(busted).toBeGreaterThan(0);
        expect(fastest).toBeLessThan(9);
        expect(wrecks).toBe(0);
      } finally { sim.dispose(); }
    }
  }, 180_000);
});
