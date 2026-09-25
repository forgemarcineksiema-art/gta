/**
 * The sea (M8.8 slice 19): two slipways through Coral Quay's seawall down to a surface only the hovercraft's rays meet.
 * The hovercraft goes down one, 150 m out and back up; a car stops at its top (the gate); no other car's ray meets
 * the water; the sea's edge holds the hovercraft in, and the full map follows it out there.
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { CITY_HALF } from '../../src/sim/city/roads';
import { SEA, SLIPWAYS } from '../../src/sim/city/sea';
import { BODY_IDS, bodyTuning } from '../../src/sim/traffic/bodies';
import { mapHalf } from '../../src/ui/map/minimapModel';
import { createWorld, kmh, run } from './helpers';

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Steers the car's course onto the next point of `route` at `speed` km/h; true while points remain. */
function autopilot(sim: SimWorld, route: ReadonlyArray<readonly [number, number]>, state: { k: number }, speed: number): boolean {
  const c = sim.controls;
  const point = route[state.k];
  if (!point) { c.throttle = 0; c.steer = 0; return false; }
  const p = sim.vehicle.body.translation(), r = sim.vehicle.body.rotation(), tm = sim.vehicle.telemetry;
  const dx = point[0] - p.x, dz = point[1] - p.z;
  if (Math.hypot(dx, dz) < 4) { state.k++; return true; }
  const yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x));
  const bearing = Math.atan2(dx, dz), v = Math.hypot(tm.vx, tm.vz);
  const course = v > 2 ? Math.atan2(tm.vx, tm.vz) : yaw;
  // the nose past the bearing by the slide, so the course comes onto it; behind it, one way round
  let err = wrap(bearing + wrap(bearing - course) * Math.min(1, v / 8) - yaw);
  if (Math.abs(err) > 2.5) err = Math.abs(err);
  c.steer = Math.max(-1, Math.min(1, -2 * err));
  c.handbrake = Math.abs(err) > 1.2 ? 1 : 0;
  c.throttle = Math.abs(err) > 0.6 ? 0.2 : kmh(sim) < speed ? 1 : 0;
  c.brake = 0;
  return true;
}

async function atSlipway(body: 'hover' | 'muscle'): Promise<SimWorld> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, body });
  sim.police!.dispatching = false;
  const s = SLIPWAYS[0]!;
  sim.city!.sync(s.x, s.z - 12, true);
  sim.vehicle.teleport({ x: s.x, y: 1, z: s.z - 15 }, 0);
  run(sim, 1);
  return sim;
}

describe('M8.8 slice 19: the slipways and the sea', () => {
  it('M8.8 19.1 the hovercraft drives down the south slipway, 150 m out, and back up it', async () => {
    const sim = await atSlipway('hover');
    try {
      const s = SLIPWAYS[0]!;
      const route = [[s.x, s.z + 12], [s.x, s.z + 152], [s.x, s.z + 12], [s.x, s.z - 18]] as const;
      const state = { k: 0 };
      let far = 0, onWater = 0;
      for (let i = 0; i < 120 * 60 && autopilot(sim, route, state, 30); i++) {
        sim.step();
        const p = sim.vehicle.body.translation();
        far = Math.max(far, p.z - CITY_HALF);
        // afloat: the cushion over the sea's surface, beyond the ramp's foot
        if (p.z > s.z + 12 && Math.abs(p.y - (SEA.level + 0.35)) < 0.1) onWater++;
      }
      expect(state.k).toBe(route.length);
      expect(far).toBeGreaterThan(150);
      expect(onWater).toBeGreaterThan(60 * 20);
      const p = sim.vehicle.body.translation();
      expect(p.z).toBeLessThan(CITY_HALF - 10);
      expect(p.y).toBeGreaterThan(0.2);
    } finally { sim.dispose(); }
  }, 120_000);

  it('M8.8 19.2 a muscle car stops at the slipway\'s top', async () => {
    const sim = await atSlipway('muscle');
    try {
      let reach = -Infinity;
      run(sim, 6, (_t, c, s) => {
        c.throttle = 1;
        reach = Math.max(reach, s.vehicle.body.translation().z);
      });
      expect(reach).toBeLessThan(CITY_HALF - 1);
      expect(sim.vehicle.body.translation().y).toBeGreaterThan(0.2);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.8 19.3 no car but the hovercraft has a ray that meets water', async () => {
    for (const id of BODY_IDS) expect(bodyTuning(id).hover, id).toBe(id === 'hover' ? 1 : 0);
    for (const body of ['hover', 'muscle'] as const) {
      const sim = await atSlipway(body);
      try {
        // out at sea, dropped on the water
        sim.vehicle.teleport({ x: 497, y: SEA.level + 0.6, z: CITY_HALF + 60 }, 0);
        let grounded = 0;
        // the telemetry read before a step is the last step's: the first one is from the promenade
        run(sim, 0.1);
        run(sim, 1, (_t, _c, s) => { grounded = Math.max(grounded, s.vehicle.telemetry.groundedWheels); });
        if (body === 'hover') {
          expect(grounded).toBe(4);
          expect(sim.vehicle.body.translation().y).toBeGreaterThan(SEA.level);
        } else {
          expect(grounded).toBe(0);
          expect(sim.vehicle.body.translation().y).toBeLessThan(SEA.level - 1);
        }
      } finally { sim.dispose(); }
    }
  }, 60_000);

  it('M8.8 19.4 the hovercraft cannot pass the sea\'s edge', async () => {
    const sim = await atSlipway('hover');
    try {
      const s = SLIPWAYS[0]!;
      sim.vehicle.teleport({ x: s.x, y: SEA.level + 0.6, z: CITY_HALF + 100 }, 0);
      let reach = 0;
      run(sim, 30, (_t, c, st) => {
        c.throttle = 1;
        c.boost = 1;
        st.vehicle.boostMeter = 1;
        reach = Math.max(reach, st.vehicle.body.translation().z);
      });
      expect(reach).toBeGreaterThan(CITY_HALF + SEA.limit - 10);
      expect(reach).toBeLessThan(CITY_HALF + SEA.limit);
      // the full map follows it out there; inland it is the island's own size
      expect(mapHalf(s.x, reach, CITY_HALF, SEA.limit)).toBeGreaterThanOrEqual(reach);
      expect(mapHalf(s.x, CITY_HALF - 100, CITY_HALF, SEA.limit)).toBe(CITY_HALF);
    } finally { sim.dispose(); }
  }, 60_000);
});
