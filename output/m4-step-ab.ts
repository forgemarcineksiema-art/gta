import { initPhysics, SimWorld } from '../src/sim/SimWorld';
import { TrackBot, CITY_BOT_TUNING } from '../src/app/trackBot';

await initPhysics();
const rows: Record<string, unknown>[] = [];
for (const heat of [0, 40, 100]) {
  for (const pass of [1, 2]) {
    const sim = new SimWorld({ map: 'city', seed: 42, heat, record: false });
    const bot = new TrackBot('muscle', CITY_BOT_TUNING);
    const samples: number[] = [];
    try {
      for (let tick = 0; tick < 60 * 60; tick++) {
        bot.drive(sim, sim.controls, 1 / 60);
        const t0 = performance.now();
        sim.step();
        samples.push(performance.now() - t0);
      }
      samples.sort((a, b) => a - b);
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      rows.push({ heat, pass, units: sim.police?.count, meanMs: +mean.toFixed(3),
        p50: +(samples[Math.floor(samples.length * 0.5)] as number).toFixed(3),
        p95: +(samples[Math.floor(samples.length * 0.95)] as number).toFixed(3),
        max: +(samples[samples.length - 1] as number).toFixed(3) });
    } finally { sim.dispose(); }
  }
}
console.table(rows);
