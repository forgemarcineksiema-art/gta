/**
 * The sea (M8.8 slice 19): two slipways through Coral Quay's seawall down to a surface only the hovercraft's rays meet.
 * The hovercraft goes down one, 150 m out and back up; a car stops at its top (the gate); no other car's ray meets
 * the water; the sea's edge holds the hovercraft in, and the full map follows it out there. The heat at sea and the
 * sea trial (slice 20): the units stay ashore and lose a hovercraft out of their sight, the helicopter does not; the
 * trial runs buoy to buoy, the way by road to its ring and then by the buoys.
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { CITY_HALF } from '../../src/sim/city/roads';
import { BALANCE } from '../../src/sim/balance';
import { SEA, SEA_TRIAL, SLIPWAYS, slipwayTop } from '../../src/sim/city/sea';
import { BODY_IDS, bodyTuning } from '../../src/sim/traffic/bodies';
import { mapHalf } from '../../src/ui/map/minimapModel';
import { createWorld, run } from './helpers';

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Flies the craft at the next point of `route` at `speed` km/h (`arrive`: slowing onto it), as a hovercraft is flown:
 * the nose where the push has to go (the velocity wanted there less the velocity it has), the fan on when the nose is
 * round to it; true while points remain.
 */
function autopilot(sim: SimWorld, route: ReadonlyArray<readonly [number, number]>, state: { k: number }, speed: number, arrive = true): boolean {
  const c = sim.controls;
  const point = route[state.k];
  if (!point) { c.throttle = 0; c.steer = 0; return false; }
  const p = sim.vehicle.body.translation(), r = sim.vehicle.body.rotation(), tm = sim.vehicle.telemetry;
  const dx = point[0] - p.x, dz = point[1] - p.z, d = Math.hypot(dx, dz);
  if (d < 8) { state.k++; return true; }
  const yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x));
  // slowing onto the point it is to stop at, flat out past one it only has to pass
  const want = (speed / 3.6) * (arrive && state.k === route.length - 1 ? Math.min(1, d / 30) : 1);
  const px = (dx / d) * want - tm.vx, pz = (dz / d) * want - tm.vz;
  const err = wrap(Math.atan2(px, pz) - yaw);
  c.steer = Math.max(-1, Math.min(1, -2 * err));
  c.handbrake = Math.abs(err) > 1.5 ? 1 : 0;
  c.throttle = Math.cos(err) > 0.7 ? Math.min(1, Math.hypot(px, pz) / 3) : 0;
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

describe('M8.8 slice 20: the heat at sea, the sea trial', () => {
  it('M8.8 20.1 at heat 3 a hovercraft out beyond the units\' sight escapes by the cooldown', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: BALANCE.heatThresholds[2] as number, body: 'hover' });
    try {
      const s = SLIPWAYS[0]!;
      sim.city!.sync(s.x, s.z - 12, true);
      sim.vehicle.teleport({ x: s.x, y: 1, z: s.z - 15 }, 0);
      run(sim, 0.5);
      sim.pursuit.force(5);
      const seq = sim.events.sequence;
      // down the slipway and 170 m out, then still
      const route = [[s.x, s.z + 12], [s.x, s.z + 170]] as const, state = { k: 0 };
      let units = 0;
      for (let i = 0; i < 90 * 60; i++) {
        if (!autopilot(sim, route, state, 40)) sim.controls.throttle = 0;
        sim.step();
        units = Math.max(units, sim.police!.count);
        if (i > 60 && sim.pursuit.state === 'idle') break;
      }
      let escapes = 0;
      sim.events.readFrom(seq, (e) => { if (e.kind === 'escape' && e.target !== 1) escapes++; });
      expect(units).toBeGreaterThan(0);
      expect(escapes).toBe(1);
      expect(sim.run.state).not.toBe('busted');
    } finally { sim.dispose(); }
  }, 120_000);

  it('M8.8 20.2 at heat 4 the helicopter keeps a hovercraft at sea seen', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false, heat: BALANCE.heatThresholds[3] as number, body: 'hover' });
    try {
      const s = SLIPWAYS[0]!;
      sim.city!.sync(s.x, s.z - 12, true);
      sim.vehicle.teleport({ x: s.x + 120, y: SEA.level + 0.6, z: CITY_HALF + 150 }, 0);
      run(sim, 0.5);
      sim.pursuit.force(3);
      const seq = sim.events.sequence;
      let seen = 0;
      run(sim, 20);
      run(sim, 40, (_t, _c, st) => { if (st.pursuit.visible) seen++; });
      let escapes = 0;
      sim.events.readFrom(seq, (e) => { if (e.kind === 'escape') escapes++; });
      expect(sim.police!.heli.active).toBe(true);
      expect(escapes).toBe(0);
      expect(seen / (40 * 60)).toBeGreaterThan(0.9);
    } finally { sim.dispose(); }
  }, 120_000);

  it('M8.8 20.3 the sea trial finishes past its buoys, in order, and pays a medal; a shortcut to its finish does not', async () => {
    const trialOf = (sim: SimWorld) => sim.jobs.defs.find((d) => d.route)!;
    // a car never sees its ring; the hovercraft does
    const car = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, reveal: true });
    try {
      expect(car.jobs.shown(trialOf(car))).toBe(false);
    } finally { car.dispose(); }
    for (const shortcut of [true, false]) {
      const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, reveal: true, body: 'hover' });
      try {
        sim.police!.dispatching = false;
        const d = trialOf(sim);
        expect(sim.jobs.shown(d)).toBe(true);
        sim.city!.sync(d.x, d.z, true);
        sim.vehicle.teleport({ x: d.x, y: 1, z: d.z }, 0);
        run(sim, 0.5);
        expect(sim.jobs.active).toBe(d.id);
        expect(sim.jobs.state).toBe('active');
        const seq = sim.events.sequence;
        if (shortcut) {
          // at the finish with no buoy passed: it runs on
          sim.vehicle.teleport({ x: d.targetX, y: SEA.level + 0.6, z: d.targetZ }, 0);
          run(sim, 2);
          expect(sim.jobs.state).toBe('active');
          continue;
        }
        // down the slipway, then at the buoy the trial counts next, then the finish
        const off = [[d.x, d.z + 20] as const], state = { k: 0 };
        for (let i = 0; i < 120 * 60 && sim.jobs.state === 'active'; i++) {
          const next = SEA_TRIAL.buoys[sim.jobs.buoy] ?? { x: d.targetX, z: d.targetZ };
          if (state.k < 1) autopilot(sim, off, state, 60);
          else {
            // flown flat out on the boost, its meter held: the pin is the trial's rules, not the pilot's time
            autopilot(sim, [[next.x, next.z]], { k: 0 }, 110, sim.jobs.buoy >= SEA_TRIAL.buoys.length);
            sim.controls.boost = sim.controls.throttle > 0.9 ? 1 : 0;
            sim.vehicle.boostMeter = 1;
          }
          sim.step();
        }
        let paid = 0;
        sim.events.readFrom(seq, (e) => { if (e.kind === 'jobDone') paid = e.value; });
        expect(sim.jobs.state).toBe('done');
        expect(sim.jobs.buoy).toBe(SEA_TRIAL.buoys.length);
        expect(sim.jobs.lastMedal).toBeGreaterThanOrEqual(1);
        expect(paid).toBeGreaterThanOrEqual(BALANCE.jobs.trial.pay[sim.jobs.lastMedal - 1] as number);
      } finally { sim.dispose(); }
    }
  }, 180_000);

  it('M8.8 20.4 the way to the sea trial runs by road to its ring at the slipway, then along the buoys', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, reveal: true, body: 'hover' });
    try {
      sim.police!.dispatching = false;
      const d = sim.jobs.defs.find((j) => j.route)!;
      const top = slipwayTop(SLIPWAYS[0]!);
      expect([d.x, d.z]).toEqual([top.x, top.z]);
      // from a street 300 m inland, the trial picked on the map
      const from = { x: 468, z: 480 };
      sim.city!.sync(from.x, from.z, true);
      const lane = sim.city!.nearestLane(from.x, from.z, 0);
      const pose = { x: 0, z: 0, yaw: 0 };
      sim.traffic!.lanes.positionAt(lane, 5, 0, pose);
      sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
      sim.way!.pick(d.id);
      run(sim, 2);
      const way = sim.way!;
      expect(way.goal.id).toBe(d.id);
      const last = way.count - 1;
      expect(way.points[last * 2]).toBeCloseTo(d.x, 3);
      expect(way.points[last * 2 + 1]).toBeCloseTo(d.z, 3);
      // by road: longer than the crow flies, through more than a couple of points
      expect(way.length).toBeGreaterThan(Math.hypot(d.x - pose.x, d.z - pose.z) * 1.1);
      expect(way.count).toBeGreaterThan(3);
      // taken: the line is the buoys', in order, to the finish
      sim.vehicle.teleport({ x: d.x, y: 1, z: d.z }, 0);
      run(sim, 1);
      expect(sim.jobs.active).toBe(d.id);
      expect(way.count).toBe(SEA_TRIAL.buoys.length + 2);
      SEA_TRIAL.buoys.forEach((b, k) => {
        expect(way.points[(k + 1) * 2]).toBeCloseTo(b.x, 3);
        expect(way.points[(k + 1) * 2 + 1]).toBeCloseTo(b.z, 3);
      });
      expect(way.points[(way.count - 1) * 2]).toBeCloseTo(d.targetX, 3);
    } finally { sim.dispose(); }
  }, 60_000);
});
