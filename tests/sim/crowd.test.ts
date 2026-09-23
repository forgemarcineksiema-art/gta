/**
 * Pedestrians with bodies (M5.5 slice 20, docs/DESIGN.md §13.11): each one
 * is dressed for the district it appears in (the silhouette's shares and the
 * district's clothes), and its gait runs with the distance walked and stands
 * still while it dives.
 */
import { describe, expect, it } from 'vitest';
import { PED_TINTS } from '../../src/sim/palette';
import { CROWD_LOOKS, PedLook, PedPose, type Pedestrians } from '../../src/sim/traffic/Pedestrians';
import { PEDS } from '../../src/sim/traffic/tuning';
import { createWorld, run } from './helpers';

/** A point well inside each district (the four quadrants round the centre). */
const POINTS: Record<string, readonly [number, number]> = {
  crown: [-420, -420], foundry: [420, -420], gardens: [-420, 420], marina: [420, 420],
};

describe('pedestrians with bodies', () => {
  it('20.2 dressed by the district: the silhouettes\' shares, the district\'s clothes', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const peds = sim.peds as Pedestrians;
      for (const [district, [x, z]] of Object.entries(POINTS)) {
        const looks = new Array<number>(CROWD_LOOKS).fill(0);
        const n = 400;
        for (let k = 0; k < n; k++) {
          const i = peds.spawnAt(x, z, 0, PedPose.Fist);
          expect(i).toBeGreaterThanOrEqual(0);
          expect(PED_TINTS[district]).toContain(peds.tint[i]);
          looks[peds.look[i] as number] = (looks[peds.look[i] as number] as number) + 1;
          peds.active[i] = 0;
        }
        const shares = PEDS.looks[district] as readonly number[];
        const total = shares.reduce((a, b) => a + b, 0);
        for (let l = 0; l < CROWD_LOOKS; l++) expect(Math.abs((looks[l] as number) / n - (shares[l] as number) / total), `${district} look ${l}`).toBeLessThan(0.07);
      }
      // the Works are the workers', the Gardens the old men's
      expect(PEDS.looks.foundry![PedLook.Worker]).toBeGreaterThan(0.5);
      expect(PEDS.looks.gardens![PedLook.Old]).toBeGreaterThan(0.4);
    } finally { sim.dispose(); }
  }, 60_000);

  it('20.3 the gait runs with the distance walked and stands still in a dive', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 1, record: false });
    try {
      const peds = sim.peds as Pedestrians;
      run(sim, 3);
      let walker = -1;
      for (let i = 0; i < peds.capacity; i++) if (peds.active[i] && peds.pose[i] === PedPose.Walk && (peds.lane[i] as number) >= 0) { walker = i; break; }
      expect(walker).toBeGreaterThanOrEqual(0);
      const g0 = peds.gait[walker] as number;
      run(sim, 2);
      expect(peds.pose[walker]).toBe(PedPose.Walk);
      expect((peds.gait[walker] as number) - g0).toBeCloseTo((peds.speed[walker] as number) * 2, 1);
      // in a dive the legs keep still
      peds.pose[walker] = PedPose.Dive;
      peds.poseFor[walker] = 0;
      const g1 = peds.gait[walker] as number;
      run(sim, 0.3);
      expect(peds.gait[walker]).toBe(g1);
    } finally { sim.dispose(); }
  }, 60_000);
});
