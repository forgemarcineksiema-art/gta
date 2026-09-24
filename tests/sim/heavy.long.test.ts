/**
 * Levels 4 and 5 (docs/M4_PLAN.md slice 7): the roster's heavies and the
 * Chief, the van's shove across the road, the Chief's PIT on a straight, and
 * the Chief kept through the chase and replaced after a wreck. The body pool
 * at level 5 (7.5) is police.long.test.ts's pin, which now runs with them.
 * Long (M7 slice 0): moved out of the quick verify's minute; `npm run verify:gate` runs it.
 */
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../src/sim/palette';
import { POLICE } from '../../src/sim/police/tuning';
import type { SimWorld } from '../../src/sim';
import type { Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run, runUntil } from './helpers';

/** The first long highway lane on the inner offset (or the one matching `pick`). */
function highwayLane(sim: SimWorld, pick: (l: { x0: number; z0: number; x1: number; z1: number }) => boolean = () => true): number {
  const lanes = (sim.traffic as Traffic).lanes;
  for (let i = 0; i < lanes.laneCount; i++) {
    const l = sim.city!.graph.lanes[i]!;
    if (l.highway && l.offset === 4 && (lanes.length[i] as number) > 170 && pick(l)) return i;
  }
  throw new Error('no highway lane');
}

describe('heavies and the Chief', () => {
  it('7.1 the roster: 6 at level 4 with 3 heavies and 2 interceptors; 8 at level 5 with 4 heavies, 3 interceptors and the Chief', async () => {
    for (const [level, heavies, interceptors] of [[4, 3, 2], [5, 4, 3]] as const) {
      const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: level * 20, spawn: 'highway' });
      const traffic = sim.traffic as Traffic;
      const police = sim.police!;
      try {
        // the ground roster: the level's budget less the helicopter's place (M5.5 slice 9)
        const ground = (POLICE.budget[level] as number) - (level >= POLICE.heli.fromLevel ? 1 : 0);
        expect(runUntil(sim, 10, (s) => s.police!.count === ground)).toBeGreaterThan(0);
        const live = Array.from(police.units).filter((a) => a >= 0);
        expect(live.length).toBe(ground);
        expect(live.filter((a) => traffic.kindOf(a) === 'heavy').length).toBe(heavies);
        expect(live.filter((a) => traffic.kindOf(a) === 'sports' && a !== police.chief).length).toBe(interceptors);
        if (level === 5) {
          expect(live).toContain(police.chief);
          expect(traffic.kindOf(police.chief)).toBe('sports');
          expect(traffic.paint[police.chief]).toBe(PALETTE.ink);
        } else {
          expect(police.chief).toBe(-1);
        }
      } finally { sim.dispose(); }
    }
  }, 60_000);

  it('7.2 a heavy from 25 m behind at 70 km/h shoves the car 3 m across and never stops it', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 80 });
    sim.police!.dispatching = false;
    const traffic = sim.traffic as Traffic;
    const lanes = traffic.lanes;
    try {
      const lane = highwayLane(sim);
      const pose = { x: 0, z: 0, yaw: 0 };
      lanes.positionAt(lane, 60, 0, pose);
      sim.city!.sync(pose.x, pose.z, true);
      sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
      const v = 70 / 3.6, fx = Math.sin(pose.yaw), fz = Math.cos(pose.yaw);
      run(sim, 0.5, (_t, _c, s) => s.vehicle.setVelocity(fx * v, s.vehicle.telemetry.vy, fz * v));
      const proj = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
      lanes.project(lane, sim.probe.x, sim.probe.z, proj);
      const unit = traffic.spawnPoliceAt(lane, Math.max(4, proj.s - 25), 'heavy', sim.probe, 0, -1, 4);
      expect(unit).toBeGreaterThanOrEqual(0);
      sim.police!.enlist(unit);
      const lateral0 = proj.lateral;
      let across = 0, contactAt = -1, speedAfter = -1;
      run(sim, 8, (_t, c, s) => {
        s.pursuit.force();
        // the player cruises at 70 km/h
        c.throttle = s.vehicle.telemetry.speedKmh < 70 ? 0.7 : 0;
        lanes.project(lane, s.probe.x, s.probe.z, proj);
        if (contactAt > 0) across = Math.max(across, Math.abs(proj.lateral - lateral0));
        if (contactAt < 0 && (traffic.playerDv[unit] as number) > POLICE.ramContactDv) contactAt = s.time;
        if (contactAt > 0 && speedAfter < 0 && s.time - contactAt >= 1) speedAfter = s.vehicle.telemetry.speedKmh;
      });
      expect(contactAt).toBeGreaterThan(0);
      expect(across).toBeGreaterThanOrEqual(3);
      expect(speedAfter).toBeGreaterThan(50);
      expect(sim.life.state.wrecked).toBe(false);
    } finally { sim.dispose(); }
  }, 60_000);

  it('7.3 the Chief\'s PIT on a straight at 120 km/h lands twice in a minute', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 100 });
    sim.police!.dispatching = false;
    const traffic = sim.traffic as Traffic;
    const lanes = traffic.lanes;
    try {
      // the north side eastbound from its corner: since the overpasses (M5.5 slice 8) its flat run ends 540 m on
      // at the ramp, so the minute is four passes of 14 s instead of two of 30
      const lane = highwayLane(sim, (l) => Math.abs(l.z0 + 671) < 1 && l.x1 > l.x0 && l.x0 < -600);
      let pits = 0;
      for (let pass = 0; pass < 4; pass++) {
        const pose = { x: 0, z: 0, yaw: 0 };
        lanes.positionAt(lane, 60, 0, pose);
        sim.city!.sync(pose.x, pose.z, true);
        sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
        const fx = Math.sin(pose.yaw), fz = Math.cos(pose.yaw), v = 120 / 3.6;
        run(sim, 0.3, (_t, _c, s) => s.vehicle.setVelocity(fx * v, s.vehicle.telemetry.vy, fz * v));
        const proj = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
        lanes.project(lane, sim.probe.x, sim.probe.z, proj);
        const chief = traffic.spawnPoliceAt(lane, Math.max(4, proj.s - 30), 'sports', sim.probe, 0, -1, 4, PALETTE.ink);
        sim.police!.enlist(chief);
        sim.police!.chief = chief;
        let contactAt = -10, landedAt = -10;
        run(sim, 14, (_t, _c, s) => {
          s.pursuit.force();
          s.vehicle.setVelocity(fx * v, s.vehicle.telemetry.vy, fz * v);
          if ((traffic.playerDv[chief] as number) > POLICE.ramContactDv) contactAt = s.time;
          // a PIT lands: contact on the rear quarter, then the tail swings (yaw rate 0.4 rad/s and up)
          if (s.time - contactAt < 1 && s.time - landedAt > 2 && Math.abs(s.vehicle.body.angvel().y) >= 0.4) {
            pits++;
            landedAt = s.time;
          }
          // a second after a spin, straight again on the lane, and on down the road
          if (landedAt > 0 && s.time - landedAt > 1 && s.time - landedAt < 1 + 1 / 60) {
            const p = s.vehicle.body.translation();
            lanes.project(lane, p.x, p.z, proj);
            s.vehicle.teleport({ x: proj.x, y: p.y, z: proj.z }, pose.yaw);
          }
        });
      }
      expect(pits).toBeGreaterThanOrEqual(2);
    } finally { sim.dispose(); }
  }, 120_000);

  it('7.4 the Chief stays through the chase, and after a wreck another comes on level 5 cadence times two, not sooner', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: 100, spawn: 'highway' });
    const traffic = sim.traffic as Traffic;
    const police = sim.police!;
    try {
      expect(runUntil(sim, 5, (s) => s.police!.chief >= 0)).toBeGreaterThan(0);
      const first = police.chief;
      // twenty seconds of chase: the same Chief (a busted card would reset the level; the car keeps moving)
      run(sim, 20, (_t, c, s) => {
        c.throttle = 1;
        if (s.run.state === 'busted') s.run.closeCard();
        if (s.heat.level < 5) s.heat.add(100);
      });
      if (sim.pursuit.state !== 'idle') expect(police.chief).toBe(first);
      traffic.wreck(police.chief);
      run(sim, 1 / 60);
      expect(police.chief).toBe(-1);
      // M5.5: the refill cadence is the level's (POLICE.refillSeconds), the Chief's that times its factor
      const wait = (POLICE.refillSeconds[5] as number) * POLICE.chief.reinforceFactor;
      const back = runUntil(sim, wait + 3, (s) => s.police!.chief >= 0, (_t, _c, s) => {
        if (s.run.state === 'busted') s.run.closeCard();
        if (s.heat.level < 5) s.heat.add(100);
      });
      expect(back).toBeGreaterThanOrEqual(wait - 0.1);
      expect(back).toBeLessThanOrEqual(wait + 3);
      expect(police.chief).not.toBe(first);
    } finally { sim.dispose(); }
  }, 60_000);
});
