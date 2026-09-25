/** M8.10 slice 8, the long pin: the bot drives the multi-storey car park's ramps up to its roof (docs/M8.10_PLAN.md). */
import { describe, expect, it } from 'vitest';
import { CITY_BOT_TUNING, TrackBot } from '../../../src/app/trackBot';
import type { TrackSample } from '../../../src/sim';
import type { Island } from '../../../src/sim/island/Island';
import type { CrownPlace } from '../../../src/sim/island/places/crown';
import { CAR_PARK } from '../../../src/sim/island/shapes/crown';
import { createWorld } from '../helpers';

/**
 * The way up, a sample every 3 m: from the forecourt in at the door of the east lane, north under the first deck, round
 * the north end onto the first ramp (the west lane, southward), round the south end onto the next (the east lane,
 * northward), and so on to the roof; round its north end into its west lane.
 */
function wayUp(): TrackSample[] {
  const P = CAR_PARK, [a, b] = P.lanes, mid = (a + b) / 2, r = (b - a) / 2, pts: Array<[number, number]> = [];
  const line = (x: number, z0: number, z1: number): void => { const n = Math.ceil(Math.abs(z1 - z0) / 3); for (let i = 0; i < n; i++) pts.push([x, z0 + ((z1 - z0) * i) / n]); };
  const turn = (zc: number, north: boolean): void => {
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * Math.PI;
      pts.push(north ? [mid - r * Math.cos(t), zc + r * Math.sin(t)] : [mid + r * Math.cos(t), zc - r * Math.sin(t)]);
    }
  };
  line(a, 146, P.ramps.z1);
  for (let k = 0; k < P.decks; k++) {
    if (k % 2 === 0) { turn(P.ramps.z1, true); line(b, P.ramps.z1, P.ramps.z0); turn(P.ramps.z0, false); }
    else line(a, P.ramps.z0, P.ramps.z1);
  }
  turn(P.ramps.z1, true);
  line(b, P.ramps.z1, P.ramps.z0 + 6);
  let s = 0;
  return pts.map((p, i) => {
    const prev = pts[Math.max(0, i - 1)] as [number, number], next = pts[Math.min(pts.length - 1, i + 1)] as [number, number];
    const yaw = Math.atan2(next[0] - prev[0], next[1] - prev[1]);
    const before = Math.atan2(p[0] - prev[0], p[1] - prev[1]), after = Math.atan2(next[0] - p[0], next[1] - p[1]);
    const out = { x: p[0], z: p[1], yaw, curvature: i > 0 && i < pts.length - 1 ? Math.atan2(Math.sin(after - before), Math.cos(after - before)) / 3 : 0, s };
    s += Math.hypot(next[0] - p[0], next[1] - p[1]);
    return out;
  });
}

describe('M8.10 slice 8: the car park', () => {
  it('8.1 the bot drives the car park\'s ramps round its core up to the roof', async () => {
    const sim = await createWorld({ map: 'island', traffic: 0, peds: 0 });
    const island = sim.island as Island, crown = island.places.find((p) => p.id === 'crown') as CrownPlace;
    const path = wayUp(), first = path[0] as TrackSample;
    island.sync(first.x, first.z, true);
    sim.vehicle.teleport({ x: first.x, y: island.heightAt(first.x, first.z) + 0.8, z: first.z }, first.yaw);
    const bot = new TrackBot('muscle', { ...CITY_BOT_TUNING, vMax: 11 });
    bot.setPath(path);
    let top = -Infinity, onRoof = false;
    for (let i = 0; i < 60 * 90 && !onRoof; i++) {
      bot.drive(sim, sim.controls, 1 / 60);
      sim.step();
      const p = sim.vehicle.body.translation();
      top = Math.max(top, p.y);
      // on the roof's west lane, past the way up's last turn
      onRoof = p.y > crown.carParkRoof && p.x > CAR_PARK.core.x1 && p.z < CAR_PARK.ramps.z1 - 4 && sim.vehicle.telemetry.groundedWheels >= 3;
    }
    expect(bot.resets).toBe(0);
    expect(top).toBeGreaterThan(crown.carParkRoof);
    expect(onRoof).toBe(true);
  }, 240_000);
});
