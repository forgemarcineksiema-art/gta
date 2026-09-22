import { initPhysics, SimWorld } from '../src/sim/SimWorld';
import { AgentState } from '../src/sim/traffic/Traffic';
import { TrackBot, CITY_BOT_TUNING } from '../src/app/trackBot';

await initPhysics();
const rows: Record<string, unknown>[] = [];
for (const level of [1, 2, 5]) {
  const sim = new SimWorld({ map: 'city', seed: 42, heat: level * 20, record: false });
  const bot = new TrackBot('muscle', CITY_BOT_TUNING);
  const traffic = sim.traffic!;
  let maxUnits = 0, maxPoliceBodies = 0, minCivilianBodies = 99, interceptors = 0, chaseSteps = 0, starved = 0, starts = 0, prev = 'idle';
  const start = performance.now();
  try {
    for (let tick = 0; tick < 90 * 60; tick++) {
      bot.drive(sim, sim.controls, 1 / 60);
      sim.step();
      const police = sim.police!;
      if (prev === 'idle' && sim.pursuit.state !== 'idle') starts++;
      prev = sim.pursuit.state;
      maxUnits = Math.max(maxUnits, police.count);
      let interceptorsNow = 0;
      for (const agent of police.units) if (agent >= 0 && traffic.kindOf(agent) === 'sports') interceptorsNow++;
      interceptors = Math.max(interceptors, interceptorsNow);
      const policeBodies = traffic.policeBodies();
      maxPoliceBodies = Math.max(maxPoliceBodies, policeBodies);
      if (sim.pursuit.state === 'active') {
        chaseSteps++;
        let civilian = 0;
        for (let i = 0; i < traffic.capacity; i++) {
          if (traffic.police[i] === 1 || !traffic.hasBody(i)) continue;
          civilian++;
        }
        minCivilianBodies = Math.min(minCivilianBodies, civilian);
        if (traffic.count(AgentState.Kinematic) + traffic.count(AgentState.Physical) < 10) starved++;
      }
    }
    rows.push({ level, budget: sim.police!.budget, maxUnits, interceptors, maxPoliceBodies, minCivilianBodies, starts,
      chaseSeconds: chaseSteps / 60, escapes: sim.pursuit.escapes, rams: sim.police!.ramsReceived, starvedSteps: starved,
      guardHops: traffic.guardHops, towed: traffic.towedAway, resets: bot.resets, nan: sim.hasNaN(),
      stepMeanMs: (performance.now() - start) / (90 * 60) });
  } finally { sim.dispose(); }
}
console.log(JSON.stringify(rows, null, 2));
