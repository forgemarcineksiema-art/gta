import { it } from 'vitest';
import { placeJobs, fenceTargets } from '../../src/sim/jobs/place';
import { unpackDescriptor } from '../../src/sim/jobs/catalog';
import { districtAt } from '../../src/sim';
import { createWorld } from '../sim/helpers';
it('placement', async () => {
  for (const seed of [42, 7, 123]) {
    const sim = await createWorld({ map: 'city', seed, traffic: 0, peds: 0, record: false });
    const t0 = performance.now();
    const defs = placeJobs(sim.city!, seed, sim.traffic!.lanes);
    const t1 = performance.now();
    console.log(`SEED ${seed}: ${defs.length} defs in ${(t1 - t0).toFixed(0)} ms; fences`, fenceTargets(sim.city!).map((f) => `${f.x.toFixed(0)},${f.z.toFixed(0)}`).join(' '));
    for (const d of defs) console.log(`  ${d.id} ${d.kind} (${d.x.toFixed(0)},${d.z.toFixed(0)}) ${districtAt(d.x, d.z).id} -> (${d.targetX.toFixed(0)},${d.targetZ.toFixed(0)}) pay ${d.payout} limit ${d.limitSeconds} lvl ${d.level} ${d.descriptor >= 0 ? JSON.stringify(unpackDescriptor(d.descriptor)) : ''}`);
    sim.dispose();
  }
});
