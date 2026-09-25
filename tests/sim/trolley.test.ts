/**
 * The rocket trolley (M8.8 slice 13): a walking pace on the throttle alone; the rocket is the boost, 0–100 in 4–4.5 s
 * and 180–195 km/h flat out; its meter fills by itself in 4 s, and no other car's does; it waits on a corner of the
 * Crown Tower's plaza. Its steering at 100 km/h against every other body is the long pin (bodies.long 13.2).
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import { STASH_SPOTS } from '../../src/sim/city/stash';
import { LANDMARKS, districtAt } from '../../src/sim/city/City';
import { GROUPS_TERRAIN } from '../../src/sim/collision';
import { BODY_IDS, bodyTuning } from '../../src/sim/traffic/bodies';
import { createWorld, kmh, run, runUntil } from './helpers';

describe('M8.8 slice 13: the rocket trolley', () => {
  it('M8.8 13.1 a walk on the throttle; on the rocket 0-100 in 4-4.5 s and 180-195 km/h flat out', async () => {
    const sim = await createWorld({ spawn: 'straight', body: 'trolley' });
    try {
      run(sim, 1);
      let walk = 0;
      run(sim, 4, (_t, c, s) => { c.throttle = 1; walk = Math.max(walk, kmh(s)); });
      expect(walk).toBeGreaterThan(3);
      expect(walk).toBeLessThan(8);
    } finally { sim.dispose(); }
    const rocket = await createWorld({ spawn: 'straight', body: 'trolley' });
    try {
      run(rocket, 1);
      // on the rocket: the meter held full
      const burn = (_t: number, c: { throttle: number; boost: number }, s: typeof rocket): void => { c.throttle = 1; c.boost = 1; s.vehicle.boostMeter = 1; };
      const t = runUntil(rocket, 10, (s) => kmh(s) >= 100, burn);
      expect(t).toBeGreaterThan(4);
      expect(t).toBeLessThan(4.5);
      let top = 0;
      run(rocket, 20, (tick, c, s) => {
        burn(tick, c, s);
        top = Math.max(top, kmh(s));
        const p = s.vehicle.body.translation();
        if (p.z > 500) s.vehicle.body.setTranslation({ x: p.x, y: p.y, z: p.z - 500 }, true);
      });
      expect(top).toBeGreaterThan(180);
      expect(top).toBeLessThan(195);
    } finally { rocket.dispose(); }
  }, 60_000);

  it('M8.8 13.3 its meter fills from empty in 4 s by itself, and no other car\'s does', async () => {
    const sim = await createWorld({ spawn: 'lot', body: 'trolley' });
    try {
      run(sim, 1);
      sim.vehicle.boostMeter = 0;
      const t = runUntil(sim, 6, (s) => s.vehicle.boostMeter >= 0.999);
      expect(t).toBeGreaterThan(3.9);
      expect(t).toBeLessThan(4.1);
    } finally { sim.dispose(); }
    for (const id of BODY_IDS) if (id !== 'trolley') expect(bodyTuning(id).boostRegen, id).toBe(0);
  }, 60_000);

  it('M8.8 13.4 it waits on a corner of the Crown Tower\'s plaza, clear of everything', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const spot = STASH_SPOTS.trolley;
      const tower = LANDMARKS.find((l) => l.district === 'crown')!;
      expect(districtAt(spot.x, spot.z).id).toBe('crown');
      expect(Math.max(Math.abs(spot.x - tower.x), Math.abs(spot.z - tower.z))).toBeLessThan(24);
      sim.city!.sync(spot.x, spot.z, true);
      run(sim, 0.1);
      let hits = 0;
      sim.world.intersectionsWithShape({ x: spot.x, y: 1.1, z: spot.z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Cuboid(0.9, 0.9, 1.1), (col) => {
        if ((col.collisionGroups() >>> 16) !== (GROUPS_TERRAIN >>> 16)) hits++;
        return true;
      });
      expect(hits).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);
});
