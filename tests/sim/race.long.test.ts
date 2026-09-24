/**
 * Street races (M5.5 slice 11, DESIGN.md §4): four races, 1.2–2 km each by lane
 * path; starting one puts three rivals on the road just ahead; they race the
 * shortest way to the finish in the driving mode, rubber-banded to the player;
 * the player's place over the line pays 6,000 / 2,500 / 1,000, fourth fails.
 * Long (M7 slice 0): moved out of the quick verify's minute; `npm run verify:gate` runs it.
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { BALANCE } from '../../src/sim/balance';
import { lanePathTo, pointTarget } from '../../src/sim/jobs/place';
import type { JobDef } from '../../src/sim/jobs/catalog';
import { laneAt, laneLength } from '../../src/sim/city/route';
import type { Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld, run, runUntil } from './helpers';

/** A short race of our own: from a street lane's start to a point 350 m on (two lanes on, straight through). */
function shortRace(sim: SimWorld): JobDef {
  const traffic = sim.traffic as Traffic;
  const graph = sim.city!.graph;
  for (const lane of graph.lanes) {
    if (lane.highway || lane.special || lane.points.length !== 2 || laneLength(lane) < 170) continue;
    const on = lane.next.find((n) => traffic.lanes.straightThrough(lane.id, n) && !graph.lanes[n]!.special && !graph.lanes[n]!.highway);
    if (on === undefined) continue;
    const start = laneAt(lane, 20), end = laneAt(graph.lanes[on]!, 120);
    const id = sim.jobs.add({ kind: 'race', x: start.x, z: start.z, yaw: start.yaw, targetX: end.x, targetZ: end.z, payout: 6000, limitSeconds: 120, heat: 0 });
    return sim.jobs.defOf(id)!;
  }
  throw new Error('no street for a race');
}

function start(sim: SimWorld, d: JobDef): void {
  sim.city?.sync(d.x, d.z, true);
  sim.vehicle.teleport({ x: d.x, y: 0.8, z: d.z }, d.yaw);
  sim.vehicle.setVelocity(0, 0, 0);
  run(sim, 0.1, (_t, c) => { c.brake = 1; });
}

describe('street races', () => {
  it('11.1 four races, 1.2–2 km by lane path, first place paying 6,000', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const races = sim.jobs.defs.filter((d) => d.kind === 'race');
      expect(races.length).toBe(4);
      for (const d of races) {
        const p = lanePathTo(sim.city!, sim.traffic!.lanes, d.x, d.z, pointTarget(sim.city!, d.targetX, d.targetZ));
        expect(p.length).toBeGreaterThanOrEqual(BALANCE.jobs.race.minPath - 30);
        expect(p.length).toBeLessThanOrEqual(BALANCE.jobs.race.maxPath + 30);
        expect(d.payout).toBe(6000);
      }
    } finally { sim.dispose(); }
  }, 60_000);

  it('11.2 three rivals start just ahead and race the way to the finish, easing off while they lead a stopped player', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic;
      const d = shortRace(sim);
      start(sim, d);
      expect(sim.jobs.state).toBe('active');
      const rivals = Array.from(sim.jobs.race.rivals);
      expect(rivals.every((a) => a >= 0 && traffic.isRacer(a))).toBe(true);
      for (const a of rivals) {
        const ahead = ((traffic.x[a] as number) - d.x) * Math.sin(d.yaw) + ((traffic.z[a] as number) - d.z) * Math.cos(d.yaw);
        expect(ahead).toBeGreaterThan(0);
        expect(ahead).toBeLessThan(BALANCE.jobs.race.gridAhead * 3 + 5);
      }
      // the player stays put: the rivals race on, eased off, and all three get home
      let fastest = 0;
      const t = runUntil(sim, 60, () => sim.jobs.race.finished === 3, (_t, c, s) => {
        c.brake = 1;
        for (const a of rivals) if (s.traffic!.isRacer(a)) fastest = Math.max(fastest, s.traffic!.speed[a] as number);
      });
      expect(t).toBeGreaterThan(0);
      // never above the band's high end at the street limit (a little margin for the plan's step)
      expect(fastest).toBeLessThanOrEqual(14 * BALANCE.jobs.race.pace * (BALANCE.jobs.race.band[1] as number) + 0.5);
      expect(Array.from(sim.jobs.race.placeOf).sort()).toEqual([1, 2, 3]);
      // home, they drive on as traffic
      expect(rivals.every((a) => !traffic.isRacer(a))).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);

  it('11.3 the place over the line pays: first 6,000, third 1,000; fourth pays nothing and fails', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const d = shortRace(sim);
      const cross = (): number => {
        const seq = sim.events.sequence;
        sim.vehicle.teleport({ x: d.targetX, y: 0.8, z: d.targetZ }, d.yaw);
        run(sim, 2 / 60);
        let paid = -1;
        sim.events.readFrom(seq, (e) => { if (e.kind === 'jobDone') paid = e.value; });
        return paid;
      };
      // straight over the line: first
      start(sim, d);
      expect(cross()).toBe(6000);
      expect(sim.jobs.lastPlace).toBe(1);
      // two home before the player: third
      run(sim, BALANCE.jobs.holdSeconds + 0.2);
      sim.vehicle.teleport({ x: d.x + 40, y: 0.8, z: d.z + 40 }, 0);
      run(sim, 0.1);
      start(sim, d);
      expect(runUntil(sim, 60, () => sim.jobs.race.finished >= 2, (_t, c) => { c.brake = 1; })).toBeGreaterThan(0);
      if (sim.jobs.race.finished === 2) {
        expect(cross()).toBe(1000);
        expect(sim.jobs.lastPlace).toBe(3);
      }
      // all three home first: fourth, nothing, failed
      run(sim, BALANCE.jobs.holdSeconds + 0.2);
      sim.vehicle.teleport({ x: d.x + 40, y: 0.8, z: d.z + 40 }, 0);
      run(sim, 0.1);
      start(sim, d);
      expect(runUntil(sim, 60, () => sim.jobs.race.finished === 3, (_t, c) => { c.brake = 1; })).toBeGreaterThan(0);
      expect(cross()).toBe(-1);
      expect(sim.jobs.state).toBe('failed');
    } finally { sim.dispose(); }
  }, 60_000);
});
