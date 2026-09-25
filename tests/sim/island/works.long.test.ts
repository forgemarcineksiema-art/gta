/** M8.10 slice 9, the long pin (LONG=1): the dry canal driven end to end (docs/M8.10_PLAN.md). */
import { describe, expect, it } from 'vitest';
import { clearControls } from '../../../src/sim';
import type { Island } from '../../../src/sim/island/Island';
import { isWorks, type WorksPlace } from '../../../src/sim/island/places/works';
import { CANAL, canalLength, canalStation, floorAt, pointAt } from '../../../src/sim/island/shapes/works';
import { createWorld } from '../helpers';

describe('M8.10 slice 9: Sunset Works, the long pins', () => {
  it('9.1 the canal is driven end to end: down its west ramp, along its floor under the five bridges, up its ramp at the sea', async () => {
    const sim = await createWorld({ map: 'island', traffic: 0, peds: 0 });
    const island = sim.island as Island, works = island.places.find(isWorks) as WorksPlace;
    const length = canalLength(), p = { x: 0, z: 0 }, q = { x: 0, z: 0 }, st = { d: 0, s: 0, past: 0 };
    // on the west ramp's top, facing down the canal
    pointAt(4, p);
    pointAt(12, q);
    island.sync(p.x, p.z, true);
    sim.vehicle.teleport({ x: p.x, y: island.heightAt(p.x, p.z) + 0.8, z: p.z }, Math.atan2(q.x - p.x, q.z - p.z));
    for (let i = 0; i < 30; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
    const under = new Set<string>();
    let steps = 0, grounded = 0, widest = 0, highest = 0, resets = 0, end = 0;
    for (let i = 0; i < 60 * 120; i++) {
      const pos = sim.vehicle.body.translation(), rot = sim.vehicle.body.rotation();
      canalStation(pos.x, pos.z, st);
      if (st.s > length - 4) { end = st.s; break; }
      // steer for the centreline 14 m ahead, about 55 km/h
      pointAt(Math.min(length, st.s + 14), q);
      const yaw = Math.atan2(2 * (rot.w * rot.y + rot.x * rot.z), 1 - 2 * (rot.y * rot.y + rot.x * rot.x));
      let err = Math.atan2(q.x - pos.x, q.z - pos.z) - yaw;
      err = Math.atan2(Math.sin(err), Math.cos(err));
      clearControls(sim.controls);
      sim.controls.steer = Math.max(-1, Math.min(1, -err * 2.5));
      const kmh = sim.vehicle.telemetry.speedKmh;
      sim.controls.throttle = kmh < 55 ? 1 : 0;
      sim.controls.brake = kmh > 65 ? 0.5 : 0;
      sim.step();
      if (sim.respawned) resets++;
      // between the ramps: on the floor, inside its width, never up on a bank
      if (st.s > CANAL.rampWest && st.s < length - CANAL.rampEast) {
        steps++;
        if (sim.vehicle.telemetry.groundedWheels >= 3) grounded++;
        widest = Math.max(widest, st.d);
        highest = Math.max(highest, pos.y - floorAt(st.s));
      }
      for (const b of works.bridges) if (Math.hypot(b.x - pos.x, b.z - pos.z) < 4 && pos.y < b.underside) under.add(b.road);
    }
    console.log(`9.1 ${end.toFixed(0)} of ${length.toFixed(0)} m, ${under.size} bridges passed under, off the middle ${widest.toFixed(1)} m, over the floor ${highest.toFixed(2)} m, grounded ${(grounded / Math.max(1, steps)).toFixed(3)}`);
    expect(resets).toBe(0);
    expect(end).toBeGreaterThan(length - 4);
    expect(under.size).toBe(5);
    expect(widest).toBeLessThan(CANAL.floorHalf - 1);
    expect(highest).toBeLessThan(1.5);
    expect(grounded / Math.max(1, steps)).toBeGreaterThan(0.95);
  }, 240_000);
});
