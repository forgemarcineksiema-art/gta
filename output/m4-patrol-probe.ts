import { initPhysics, SimWorld } from '../src/sim/SimWorld';
import { TrackBot, CITY_BOT_TUNING } from '../src/app/trackBot';

await initPhysics();
const sim = new SimWorld({ map: 'city', seed: 42, heat: 20, record: false });
const bot = new TrackBot('muscle', CITY_BOT_TUNING);
let activeSteps = 0;
let lostSteps = 0;
let firstPatrol = -1;
let maxUnits = 0;
const start = performance.now();
try {
  for (let tick = 0; tick < 120 * 60; tick++) {
    bot.drive(sim, sim.controls, 1 / 60);
    sim.step();
    if (sim.pursuit.state === 'active' || sim.pursuit.state === 'detected') activeSteps++;
    if (sim.pursuit.state === 'lost') lostSteps++;
    const units = sim.police?.count ?? 0;
    if (units > 0 && firstPatrol < 0) firstPatrol = sim.time;
    maxUnits = Math.max(maxUnits, units);
  }
  console.log(JSON.stringify({ seconds: sim.time, pursuitSeconds: activeSteps / 60, cooldownSeconds: lostSteps / 60,
    escapes: sim.pursuit.escapes, escapesPerMinute: sim.pursuit.escapes / 2,
    ramsReceived: sim.police?.ramsReceived, firstPatrolSeconds: firstPatrol, maxUnits,
    heat: sim.heat.points, resets: bot.resets, nan: sim.hasNaN(), nodeStepMeanMs: (performance.now() - start) / 7200 }, null, 2));
} finally { sim.dispose(); }
