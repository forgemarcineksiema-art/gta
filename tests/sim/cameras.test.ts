/**
 * Speed cameras (docs/M4_PLAN.md slice 6): ten, fixed, on the highway
 * straights and the Crown avenue, 200 m apart at least; a flash for the
 * km/h over the limit when the car crosses the line more than 20 over, once
 * per cooldown.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import type { CameraDesc } from '../../src/sim/city/cameras';
import { HIGHWAY_HALF } from '../../src/sim/city/roads';
import { POLICE } from '../../src/sim/police/tuning';
import type { SimWorld } from '../../src/sim';
import { createWorld, run } from './helpers';

/** Drive across a camera's line at `kmh` on its road, from 40 m before to 20 m past; returns the flashes seen. */
function cross(sim: SimWorld, cam: CameraDesc, kmh: number): Array<{ value: number; target: number }> {
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
  // the right-hand carriageway, 4 m off the centre line
  const rx = -fz * 4, rz = fx * 4;
  const x = cam.x - fx * 40 + rx, z = cam.z - fz * 40 + rz;
  sim.city?.sync(x, z, true);
  sim.vehicle.teleport({ x, y: 0.8, z }, cam.yaw);
  run(sim, 0.3, (_t, c) => { c.brake = 1; });
  const flashes: Array<{ value: number; target: number }> = [];
  let seq = sim.events.sequence;
  const v = kmh / 3.6;
  run(sim, 60 / v, (_t, _c, s) => {
    s.vehicle.setVelocity(fx * v, s.vehicle.telemetry.vy, fz * v);
    seq = s.events.readFrom(seq, (e) => { if (e.kind === 'camera') flashes.push({ value: e.value, target: e.target }); });
  });
  return flashes;
}

describe('speed cameras', () => {
  it('6.10 exactly ten, the same for any seed, on the highway and the avenue, none within 200 m of another', async () => {
    const descs: CameraDesc[][] = [];
    for (const seed of [42, 7]) {
      const sim = await createWorld({ map: 'city', seed, traffic: 0, peds: 0, record: false });
      try {
        descs.push(sim.cameras!.descs.map((d) => ({ ...d })));
        const cams = sim.cameras!.descs;
        expect(cams.length).toBe(POLICE.cameras.count);
        let highway = 0, avenue = 0;
        for (const c of cams) {
          if (c.halfWidth === HIGHWAY_HALF) highway++;
          else {
            const lane = sim.city!.graph.lanes[sim.city!.nearestLane(c.x, c.z)]!;
            expect(lane.special?.startsWith('Crown Diagonal')).toBe(true);
            avenue++;
          }
          for (const o of cams) if (o !== c) expect(Math.hypot(o.x - c.x, o.z - c.z)).toBeGreaterThanOrEqual(200);
          // its pole stands in a chunk, off the carriageway
          const chunk = sim.city!.generate(Math.round(c.poleX / 225), Math.round(c.poleZ / 225));
          expect(chunk.statics.some((st) => Math.abs(st.position.x - c.poleX) < 0.01 && Math.abs(st.position.z - c.poleZ) < 0.01)).toBe(true);
        }
        expect(highway).toBeGreaterThanOrEqual(6);
        expect(avenue).toBeGreaterThanOrEqual(3);
      } finally { sim.dispose(); }
    }
    expect(descs[1]).toEqual(descs[0]);
  }, 60_000);

  it('6.11 30 over the limit flashes once for 30; 10 over nothing; a second pass inside the cooldown nothing', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const cam = sim.cameras!.descs[0]!;
      const limit = cam.limitMs * 3.6;
      const bag = sim.run.bag, heat = sim.heat.points;
      const fast = cross(sim, cam, limit + 30);
      expect(fast.length).toBe(1);
      expect(Math.abs(fast[0]!.value - 30)).toBeLessThanOrEqual(1);
      expect(fast[0]!.target).toBe(cam.id);
      run(sim, 0.1);
      expect(sim.heat.points - heat).toBe(BALANCE.heat.camera);
      expect(sim.run.bag - bag).toBe(Math.round(BALANCE.bag.camera + BALANCE.bag.cameraPerKmh * fast[0]!.value));
      // a second camera, only 10 over: nothing
      const other = sim.cameras!.descs[1]!;
      expect(cross(sim, other, other.limitMs * 3.6 + 10).length).toBe(0);
      // the first again, fast, inside its cooldown: nothing
      expect(cross(sim, cam, limit + 30).length).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);
});
