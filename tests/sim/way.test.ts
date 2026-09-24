/**
 * The way (docs/M8.7_PLAN.md slice 0, D1–D2; DESIGN.md §20.3 rules 2–3): the goal holds and is the ring nearest by
 * road; the field leads every lane to the goal by the shortest road; a car put off the route has its route from
 * there at once; a goal that moves is followed; a delivery's route is the lane path its limit came from. The way
 * reads the probe, so most pins move the probe (not the car) and step the way alone.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { lanePathTo, pointTarget } from '../../src/sim/jobs/place';
import type { JobDef, SimWorld } from '../../src/sim';
import type { Lane } from '../../src/sim/city/roads';
import { createWorld, run, runUntil } from './helpers';

const CITY = { map: 'city', seed: 42, traffic: 0, peds: 0, record: false } as const;

/** The probe on a lane, `s` m along it, facing its way. */
function onLane(sim: SimWorld, lane: number, s: number): void {
  const lanes = sim.traffic!.lanes;
  const pose = { x: 0, z: 0, yaw: 0 };
  lanes.positionAt(lane, s, 0, pose);
  sim.probe.x = pose.x;
  sim.probe.z = pose.z;
  sim.probe.yaw = pose.yaw;
  sim.probe.y = lanes.heightAt(lane, s) + 0.5;
}

/**
 * A second, plain reading of the road (the test's own Dijkstra over the lanes and their links): the metres from
 * `s` along `from` to every lane's end, and to its start round a loop for `from` itself.
 */
function roadFrom(sim: SimWorld, from: number, s: number): (lane: number, at: number) => number {
  const graph = sim.city!.graph, lanes = sim.traffic!.lanes, n = graph.lanes.length;
  const end = new Array<number>(n).fill(Infinity), done = new Array<boolean>(n).fill(false);
  end[from] = (lanes.length[from] as number) - s;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (end[i] as number) < (u < 0 ? Infinity : end[u] as number)) u = i;
    if (u < 0 || end[u] === Infinity) break;
    done[u] = true;
    for (const v of (graph.lanes[u] as Lane).next) {
      end[v] = Math.min(end[v] as number, (end[u] as number) + lanes.connectionLength(u, v) + (lanes.length[v] as number));
    }
  }
  let loop = Infinity;
  for (let p = 0; p < n; p++) if ((graph.lanes[p] as Lane).next.includes(from)) loop = Math.min(loop, (end[p] as number) + lanes.connectionLength(p, from));
  return (lane, at) => lane === from ? (at >= s ? at - s : loop + at) : (end[lane] as number) - (lanes.length[lane] as number) + at;
}

/** Live rings (as the goal line counts them) and their road metres from the probe's lane by `roadFrom`. */
function roadToRings(sim: SimWorld, lane: number, s: number): Map<number, number> {
  const way = sim.way!, road = roadFrom(sim, lane, s), out = new Map<number, number>();
  for (const d of sim.jobs.defs) {
    if (d.kind === 'fare' || !sim.jobs.live(d)) continue;
    const r = way.reachOfRing(d.id)!;
    let best = Infinity;
    for (let k = 0; k < r.count; k++) best = Math.min(best, road(r.lanes[k] as number, r.s[k] as number) + (r.leg[k] as number));
    out.set(d.id, best);
  }
  return out;
}

describe('the way', () => {
  it('M8.7 0.1 following the route from forty places, the goal never comes back to a ring it left, and changes less than the straight line does', async () => {
    const sim = await createWorld(CITY);
    try {
      const way = sim.way!, lanes = sim.traffic!.lanes;
      let drives = 0, backs = 0, changes = 0, lineChanges = 0;
      for (let start = 0; start < lanes.laneCount && drives < 40; start += 5) {
        if ((lanes.length[start] as number) < 80) continue;
        drives++;
        way.release();
        const seen: number[] = [];
        let line = -2, lane = start, s = 10;
        // a driver who follows the route for 800 m or to the goal, 5 m a step at 65 km/h
        for (let m = 0; m <= 800 && lane >= 0; m += 5) {
          onLane(sim, lane, s);
          way.step(5 / 18);
          const id = way.goal.id;
          if (seen.length > 0 && seen[seen.length - 1] !== id) { changes++; if (seen.includes(id)) backs++; }
          if (seen[seen.length - 1] !== id) seen.push(id);
          // the old rule over the same drive: the nearest live ring by straight line
          let near = -1, nearD = Infinity;
          for (const d of sim.jobs.defs) {
            if (d.kind === 'fare' || !sim.jobs.live(d)) continue;
            const dd = (d.x - sim.probe.x) ** 2 + (d.z - sim.probe.z) ** 2;
            if (dd < nearD) { nearD = dd; near = d.id; }
          }
          if (line !== -2 && near !== line) lineChanges++;
          line = near;
          // arrived: on one of the goal's lanes, past its point
          const r = way.reachOfRing(id);
          let arrived = false;
          for (let k = 0; r && k < r.count; k++) if (r.lanes[k] === lane && s >= (r.s[k] as number)) arrived = true;
          if (arrived) break;
          s += 5;
          if (s > (lanes.length[lane] as number)) { lane = way.fieldNext[lane] as number; s = 0; }
        }
      }
      console.info(`forty drives along the route: the goal changed ${changes} times and came back ${backs}; the straight line changed ${lineChanges} times`);
      expect(drives).toBe(40);
      expect(backs).toBe(0);
      expect(changes).toBeLessThan(lineChanges);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.7 0.2 a fresh goal is the ring nearest by road, and in places that is not the nearest by line', async () => {
    const sim = await createWorld(CITY);
    try {
      const way = sim.way!, lanes = sim.traffic!.lanes;
      let places = 0, differ = 0;
      for (let lane = 0; lane < lanes.laneCount; lane += 4) {
        const s = (lanes.length[lane] as number) / 2;
        onLane(sim, lane, s);
        way.release();
        way.step(BALANCE.way.routeEvery);
        expect(way.carLane).toBe(lane);
        const road = roadToRings(sim, lane, s);
        let best = -1, bestD = Infinity, line = -1, lineD = Infinity;
        for (const [id, d] of road) {
          if (d < bestD) { bestD = d; best = id; }
          const def = sim.jobs.defs.find((j) => j.id === id) as JobDef;
          const dd = Math.hypot(def.x - sim.probe.x, def.z - sim.probe.z);
          if (dd < lineD) { lineD = dd; line = id; }
        }
        expect(way.goal.kind).toBe('take');
        expect(way.goal.id).toBe(best);
        expect(way.ringDistance(best)).toBeCloseTo(bestD, 3);
        places++;
        if (best !== line) differ++;
      }
      console.info(`${places} places: the road's nearest ring differs from the line's at ${differ}`);
      expect(places).toBeGreaterThan(40);
      expect(differ).toBeGreaterThan(0);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.7 0.3 the field for every ring: the shortest road from every lane (a plain Dijkstra agrees), and the next lanes add up to it', async () => {
    const sim = await createWorld(CITY);
    try {
      const way = sim.way!, lanes = sim.traffic!.lanes, graph = sim.city!.graph, n = lanes.laneCount;
      let rings = 0;
      for (const d of sim.jobs.defs) {
        if (d.kind === 'fare' || !sim.jobs.live(d)) continue;
        const r = way.reachOfRing(d.id)!;
        // the probe on the ring's own lane at the ring: nothing is nearer
        onLane(sim, r.lanes[0] as number, r.s[0] as number);
        way.release();
        way.step(BALANCE.way.routeEvery);
        if (way.goal.id !== d.id) continue;
        rings++;
        // the plain reverse Dijkstra from the same lanes
        const ref = new Array<number>(n).fill(Infinity), done = new Array<boolean>(n).fill(false);
        for (let k = 0; k < r.count; k++) ref[r.lanes[k] as number] = Math.min(ref[r.lanes[k] as number] as number, (r.s[k] as number) + (r.leg[k] as number));
        for (;;) {
          let u = -1;
          for (let i = 0; i < n; i++) if (!done[i] && (ref[i] as number) < (u < 0 ? Infinity : ref[u] as number)) u = i;
          if (u < 0 || ref[u] === Infinity) break;
          done[u] = true;
          for (let p = 0; p < n; p++) {
            if (!(graph.lanes[p] as Lane).next.includes(u)) continue;
            ref[p] = Math.min(ref[p] as number, (lanes.length[p] as number) + lanes.connectionLength(p, u) + (ref[u] as number));
          }
        }
        for (let u = 0; u < n; u++) {
          const got = way.fieldDistance[u] as number;
          if ((ref[u] as number) === Infinity) { expect(got).toBe(Infinity); continue; }
          expect(Math.abs(got - (ref[u] as number))).toBeLessThan(0.01);
          // the next lanes lead to the goal and add up to the distance
          let sum = 0, lane = u;
          for (let guard = 0; guard < n && (way.fieldNext[lane] as number) >= 0; guard++) {
            const next = way.fieldNext[lane] as number;
            sum += (lanes.length[lane] as number) + lanes.connectionLength(lane, next);
            lane = next;
          }
          expect(way.fieldNext[lane]).toBe(-1);
          expect(Math.abs(sum + (way.fieldDistance[lane] as number) - got)).toBeLessThan(0.01);
        }
      }
      console.info(`the field checked for ${rings} rings over ${n} lanes`);
      expect(rings).toBeGreaterThan(20);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.7 0.4 a car put on a lane off the route has its route from there at once; the serial counts leaving it, not driving it', async () => {
    const sim = await createWorld(CITY);
    try {
      const way = sim.way!, lanes = sim.traffic!.lanes;
      let checked = 0;
      for (let lane = 0; lane < lanes.laneCount && checked < 10; lane += 7) {
        const opposite = lanes.uturn(lane);
        if (opposite < 0 || (lanes.length[lane] as number) < 100) continue;
        onLane(sim, lane, 20);
        way.release();
        way.step(BALANCE.way.routeEvery);
        if (!(way.count > 1)) continue;
        // the lanes the route takes, by the field
        const onRoute = new Set<number>([lane]);
        for (let l = way.fieldNext[lane] as number, g = 0; l >= 0 && g < 400; l = way.fieldNext[l] as number, g++) onRoute.add(l);
        if (onRoute.has(opposite)) continue;
        // driving on along it: the serial stands
        const serial = way.serial, goal = way.goal.id;
        onLane(sim, lane, 40);
        way.step(BALANCE.way.routeEvery);
        expect(way.serial).toBe(serial);
        // turned round onto the other lane: a route from there within one rebuild, the serial bumped once
        const pose = { x: 0, z: 0, yaw: 0 };
        lanes.positionAt(lane, 40, 0, pose);
        const across = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
        lanes.project(opposite, pose.x, pose.z, across);
        onLane(sim, opposite, across.s);
        way.step(BALANCE.way.routeEvery);
        if (way.goal.id !== goal) continue;
        expect(way.carLane).toBe(opposite);
        expect(way.serial).toBe(serial + 1);
        expect(way.count).toBeGreaterThan(1);
        expect(way.points[0]).toBeCloseTo(sim.probe.x, 3);
        expect(way.points[1]).toBeCloseTo(sim.probe.z, 3);
        expect(Number.isFinite(way.length)).toBe(true);
        checked++;
      }
      expect(checked).toBeGreaterThanOrEqual(5);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.7 0.5 hunting a wanted car, the goal is the car and the route is laid again as it drives', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    try {
      const d = sim.jobs.defs.find((j) => j.kind === 'order') as JobDef;
      sim.city!.sync(d.x, d.z, true);
      sim.vehicle.teleport({ x: d.x, y: 0.8, z: d.z }, d.yaw);
      expect(runUntil(sim, 10, (s) => s.jobs.state === 'hunting' && s.jobs.wantedAgent >= 0)).toBeGreaterThan(0);
      const way = sim.way!, traffic = sim.traffic!;
      let worst = 0, lays = 0, lastX = way.laidX, lastZ = way.laidZ;
      run(sim, 8, (_t, _c, s) => {
        const w = s.jobs.wantedAgent;
        if (w < 0) return;
        expect(way.goal.kind).toBe('job');
        expect(way.goal.x).toBeCloseTo(traffic.x[w] as number, 3);
        worst = Math.max(worst, Math.hypot(way.goal.x - way.laidX, way.goal.z - way.laidZ));
        if (way.laidX !== lastX || way.laidZ !== lastZ) { lays++; lastX = way.laidX; lastZ = way.laidZ; }
      });
      console.info(`hunting 8 s: the field laid ${lays} times, at most ${worst.toFixed(1)} m behind the car`);
      expect(lays).toBeGreaterThan(0);
      // moveReplan metres plus a second of the car's cruise
      expect(worst).toBeLessThan(BALANCE.way.moveReplan + 20);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.7 0.6 a delivery\'s route is never longer than the lane path its limit came from, bar the walks on and off the lanes', async () => {
    const sim = await createWorld(CITY);
    try {
      const way = sim.way!, city = sim.city!, lanes = sim.traffic!.lanes;
      let worst = 0, n = 0;
      for (const d of sim.jobs.defs) {
        if (d.kind !== 'delivery') continue;
        // the last one dropped before the car leaves its ring, so it does not start again
        sim.jobs.abandon();
        city.sync(d.x, d.z, true);
        sim.vehicle.teleport({ x: d.x, y: 0.8, z: d.z }, d.yaw);
        run(sim, 0.3);
        expect(sim.jobs.active).toBe(d.id);
        run(sim, BALANCE.way.routeEvery);
        const path = lanePathTo(city, lanes, sim.probe.x, sim.probe.z, pointTarget(city, d.targetX, d.targetZ));
        // the route may be far shorter (it starts on the lane the car faces, the path on the nearest of all)
        worst = Math.max(worst, way.length - path.length);
        n++;
      }
      console.info(`${n} deliveries: the route is at most ${worst.toFixed(1)} m longer than the lane path`);
      expect(n).toBe(BALANCE.jobs.counts.delivery);
      expect(worst).toBeLessThan(80);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.7 1.1 the route runs on the road: from the car, along lanes, to the goal', async () => {
    const sim = await createWorld(CITY);
    try {
      const way = sim.way!, lanes = sim.traffic!.lanes, city = sim.city!;
      let routes = 0;
      for (let lane = 0; lane < lanes.laneCount; lane += 6) {
        onLane(sim, lane, (lanes.length[lane] as number) / 2);
        way.release();
        way.step(BALANCE.way.routeEvery);
        if (way.count < 3) continue;
        routes++;
        expect([way.points[0], way.points[1]]).toEqual([Math.fround(sim.probe.x), Math.fround(sim.probe.z)]);
        expect([way.points[way.count * 2 - 2], way.points[way.count * 2 - 1]]).toEqual([Math.fround(way.goal.x), Math.fround(way.goal.z)]);
        for (let k = 1; k < way.count - 1; k++) {
          const x = way.points[k * 2] as number, z = way.points[k * 2 + 1] as number;
          const near = city.nearestLane(x, z);
          const proj = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
          lanes.project(near, x, z, proj);
          expect(proj.dist).toBeLessThan(0.5);
        }
      }
      expect(routes).toBeGreaterThan(20);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.7 1.4 the cold open: its ring is the goal and the route is there from its first second', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    try {
      sim.coldOpen.start();
      run(sim, 1);
      const way = sim.way!;
      expect(way.goal.id).toBe(sim.coldOpen.job);
      expect(way.count).toBeGreaterThan(1);
      expect(Number.isFinite(way.length)).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);
});
