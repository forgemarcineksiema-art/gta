/**
 * M8.10 slice 14: the jobs, the rivals and the way on the island (docs/M8.10_PLAN.md §1.4). The plan's 28 rings at
 * kerb corners seen from two streets, their ends on the network and their ways the plan's words name, the zones round
 * their places, the eleven rivals in their bays; the way, the race, the AI cars, the escort, the fares and the teaser on
 * the island's roads and heights; the rings drawn on its ground. One world, the state-changing checks last.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BALANCE, CHAIN_ALL, PedPose, RIVALS, clearControls, type JobDef, type SimWorld } from '../../../src/sim';
import { alongLane } from '../../../src/sim/city/route';
import { projectOnLane, type Lane } from '../../../src/sim/city/roads';
import { Island, PLUMB_TILT } from '../../../src/sim/island/Island';
import { HALF_WIDTH } from '../../../src/sim/island/ground';
import { Blockers, CORNER_OUT, RING_GAP, cornerFault, kerbCorners, pathTo, pathsFrom, ringGround, startsNear } from '../../../src/sim/island/jobs';
import type { CrownPlace } from '../../../src/sim/island/places/crown';
import { JOBS, PLACES, RIVAL_RINGS, districtOf } from '../../../src/sim/island/plan';
import { canalLength, inCanal, pointAt } from '../../../src/sim/island/shapes/works';
import { DECK } from '../../../src/sim/island/structures';
import type { P2 } from '../../../src/sim/island/geom';
import type { Traffic } from '../../../src/sim/traffic/Traffic';
import * as THREE from 'three';
import { collectSigns, newRingList, newSignList } from '../../../src/render/run/signs';
import { MarkerView } from '../../../src/render/run/MarkerView';
import { createWorld, run } from '../helpers';

/** A road's nearest point to (x, z): its distance and heading (rad, mod π). */
function onRoad(pts: readonly P2[], closed: boolean, x: number, z: number): { d: number; yaw: number } {
  let best = { d: Infinity, yaw: 0 };
  const n = pts.length, last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = pts[i] as P2, b = pts[(i + 1) % n] as P2, dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < best.d) best = { d, yaw: Math.atan2(dx, dz) };
  }
  return best;
}

describe('M8.10 slice 14: the jobs, the rivals and the way on the island', () => {
  let sim: SimWorld, island: Island, traffic: Traffic;
  const rings = (): JobDef[] => sim.jobs.defs.filter((d) => d.kind !== 'duel');
  const duels = (): JobDef[] => sim.jobs.defs.filter((d) => d.kind === 'duel');
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => {
    sim = await createWorld({ map: 'island', seed: 42, traffic: 0, peds: 0, record: false });
    island = sim.island as Island;
    traffic = sim.traffic as Traffic;
  }, 90_000);
  afterAll(() => sim.dispose());

  it('14b.1 the plan\'s 28 rings of seven kinds, ids 1 to 28 in its order; the 11 rivals from 29, the Chief last', () => {
    expect(rings().length).toBe(28);
    for (const [kind, n] of [['delivery', 6], ['order', 6], ['escape', 4], ['trial', 4], ['race', 4], ['rage', 2], ['mayhem', 2]] as const) {
      expect(rings().filter((d) => d.kind === kind).length, kind).toBe(n);
    }
    rings().forEach((d) => expect(d.kind, `#${d.id}`).toBe((JOBS[d.id - 1] as { kind: string }).kind));
    expect(duels().map((d) => d.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(duels().map((d) => d.id)).toEqual([29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);
    expect(new Set(sim.jobs.defs.map((d) => d.id)).size).toBe(39);
  });

  it('14.1 every ring at a kerb corner seen from two streets: past both carriageways, off every road and deck, nothing a car hits on the way in, near its plan point', () => {
    const r = BALANCE.jobs.markerRadius, blockers = new Blockers(island), corners = kerbCorners(island);
    for (const d of rings()) {
      const at = `#${d.id} ${d.kind} at ${d.x.toFixed(0)}, ${d.z.toFixed(0)}`;
      // the two streets: both carriageways `CORNER_OUT` m off it, their ways parting; every other road further
      const near = island.ground.roads.map((road) => ({ road, ...onRoad(road.pts, road.closed, d.x, d.z) }))
        .map((q) => ({ ...q, edge: q.d - HALF_WIDTH[q.road.cls] })).sort((a, b) => a.edge - b.edge);
      const [a, b] = near as [(typeof near)[number], (typeof near)[number]];
      expect(a.edge, at).toBeGreaterThan(r + 1);
      expect(b.edge, at).toBeLessThan(CORNER_OUT + 2);
      const part = Math.abs(Math.atan2(Math.sin(2 * (a.yaw - b.yaw)), Math.cos(2 * (a.yaw - b.yaw)))) / 2;
      expect(part, `${at}: its two streets part`).toBeGreaterThan((25 * Math.PI) / 180);
      // on the ground: off every deck (the viaduct, the bay bridge, the overpasses)
      for (const s of island.structures) {
        if (s.kind === 'tunnel') continue;
        for (const p of s.pieces) {
          const dx = d.x - p.x, dz = d.z - p.z, along = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw), across = dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw);
          expect(Math.abs(along) > p.length / 2 + r || Math.abs(across) > DECK.half + r, `${at}: over or under a deck`).toBe(true);
        }
      }
      // its kerb corner, clear (no lot, wall, trunk or raised slab on the ring or the way in), level enough
      const c = corners.find((q) => q.x === d.x && q.z === d.z);
      expect(c, at).toBeDefined();
      if (c) expect(cornerFault(island, blockers, c), at).toBeNull();
      // near its plan point (the nearest corner free of the rest, the escapes last)
      const [px, pz] = (JOBS[d.id - 1] as { at: P2 }).at;
      expect(Math.hypot(px - d.x, pz - d.z), at).toBeLessThan(d.kind === 'escape' || d.kind === 'rage' ? 350 : 140);
    }
    // apart
    const all = rings();
    for (const d of all) for (const e of all) if (d !== e) expect(Math.hypot(d.x - e.x, d.z - e.z), `#${d.id} and #${e.id}`).toBeGreaterThanOrEqual(RING_GAP);
  });

  it('14.2 every job\'s route is on the network: its end on a lane on the ground, a drive from its ring reaches it, the clocks and the pay from that drive', () => {
    const graph = traffic.streets.graph, lanes = traffic.lanes, hit: { x: number; z: number; yaw: number; y?: number } = { x: 0, z: 0, yaw: 0 };
    const scrapyard = island.garages.find((g) => g.name === 'scrapyard');
    for (const d of sim.jobs.defs) {
      const at = `#${d.id} ${d.kind}`;
      if (d.kind === 'escape' || d.kind === 'rage' || d.kind === 'mayhem' || (d.kind === 'duel' && d.level === 10) || d.route) continue;
      // the end: 4 m inside the scrapyard's door, else on a lane that runs on the ground there (no deck, no tunnel)
      const garage = scrapyard && Math.hypot(scrapyard.door.x - d.targetX, scrapyard.door.z - d.targetZ) < BALANCE.jobs.markerRadius + 0.01;
      let lane = -1;
      if (garage && scrapyard) lane = scrapyard.approachLane;
      else {
        let best = Infinity;
        for (const l of graph.lanes) {
          const dist = projectOnLane(l, d.targetX, d.targetZ, hit);
          if (dist < best && Math.abs((hit.y ?? 0) - island.ground.surfaceHeight(hit.x, hit.z)) < 0.6) { best = dist; lane = l.id; }
        }
        expect(Math.sqrt(best), `${at}: its end on a lane`).toBeLessThan(0.5);
        // a drop or a fence by a town's road, not the highway nor a ramp
        if (d.kind === 'delivery' || d.kind === 'order') expect(['highway', 'ramp'].includes(island.network.lines.find((q) => q.id === island.network.laneRoad[lane])?.cls ?? ''), at).toBe(false);
      }
      expect(lane, at).toBeGreaterThanOrEqual(0);
      const t = { lane, s: alongLane(graph.lanes[lane] as Lane, d.targetX, d.targetZ).s };
      // the drive: from the ring's roads (a rival's from its bay's lane)
      const starts = d.kind === 'duel' ? [(() => { const l = traffic.streets.nearestLane(d.x, d.z, traffic.streets.groundAt(d.x, d.z)); return { lane: l, s: alongLane(graph.lanes[l] as Lane, d.x, d.z).s }; })()]
        : startsNear(island, traffic.streets, d.x, d.z, 24);
      const p = pathTo(pathsFrom(graph, lanes, starts), lanes, t);
      expect(p.length, at).toBeLessThan(Infinity);
      expect(p.length, at).toBeGreaterThan(100);
      if (d.kind === 'delivery') {
        const c = BALANCE.jobs.delivery;
        expect(d.payout, at).toBe(Math.max(c.payoutMin, Math.min(c.payoutMax, Math.round(c.payoutPerKm * p.length / 1000 / 100) * 100)));
        expect(d.limitSeconds, at).toBe(Math.max(c.limitMin, Math.round(c.limitFactor * p.time)));
      }
      if (d.kind === 'trial') expect(d.limitSeconds, at).toBe(Math.round(p.length / (BALANCE.jobs.trial.speeds[0] as number)));
      if (d.kind === 'race') expect(d.limitSeconds, at).toBe(Math.round(p.length / BALANCE.jobs.race.limitSpeed));
      if (d.kind === 'duel') expect(d.limitSeconds, at).toBe(Math.round(p.length / BALANCE.board.limitSpeed));
    }
  });

  it('14.2 the trials\' ways: down the serpentine\'s hairpins, over the viaduct and the bay bridge, round the botanic garden, through the canal', () => {
    const trials = rings().filter((d) => d.kind === 'trial');
    const line = (id: string) => island.network.lines.find((l) => l.id === id) as { pts: Array<{ x: number; z: number }>; closed: boolean };
    const off = (id: string, x: number, z: number): number => { const l = line(id); return onRoad(l.pts.map((q) => [q.x, q.z] as P2), l.closed, x, z).d; };
    // the serpentine: its points on its line, the finish its lower end
    const serp = trials.find((d) => d.id === 17) as JobDef;
    expect(serp.route?.length ?? 0).toBeGreaterThan(8);
    for (const q of serp.route ?? []) expect(off('serpentine', q.x, q.z)).toBeLessThan(1);
    expect(off('serpentine', serp.targetX, serp.targetZ)).toBeLessThan(1);
    // the highway: its points on the loop, over the viaduct and the bay bridge
    const hwy = trials.find((d) => d.id === 18) as JobDef;
    for (const q of hwy.route ?? []) expect(off('highway', q.x, q.z)).toBeLessThan(1);
    for (const kind of ['viaduct', 'bridge'] as const) {
      const s = island.structures.find((q) => q.kind === kind);
      expect(s, kind).toBeDefined();
      const over = (hwy.route ?? []).some((q) => (s?.pieces ?? []).some((p) => Math.hypot(p.x - q.x, p.z - q.z) < 10));
      expect(over, `the highway trial over the ${kind}`).toBe(true);
    }
    // round the garden: on the parkway's lanes, its end the parkway's far side
    const garden = trials.find((d) => d.id === 19) as JobDef;
    expect(garden.route).toBeUndefined();
    expect(Math.abs(Math.hypot(garden.targetX - PLACES.glasshouse.x, garden.targetZ - PLACES.glasshouse.z) - 170)).toBeLessThan(8);
    // the canal: its points in the channel, the finish at its east end, the bronze clock on its length
    const canal = trials.find((d) => d.id === 20) as JobDef;
    expect(canal.route?.length ?? 0).toBeGreaterThan(5);
    for (const q of canal.route ?? []) expect(inCanal(q.x, q.z), `${q.x.toFixed(0)}, ${q.z.toFixed(0)}`).toBe(true);
    const end = pointAt(canalLength(), { x: 0, z: 0 });
    expect(Math.hypot(end.x - canal.targetX, end.z - canal.targetZ)).toBeLessThan(0.01);
    expect(canal.limitSeconds * (BALANCE.jobs.trial.speeds[0] as number)).toBeGreaterThan(canalLength());
    // a road's way's points close enough that the way's line follows its bends (the straight canal's further apart); the
    // bronze clock covers the way from the ring through them all
    for (const d of trials) {
      const pts = [{ x: d.x, z: d.z }, ...(d.route ?? []), { x: d.targetX, z: d.targetZ }];
      let length = 0;
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k] as { x: number; z: number }, b = pts[k + 1] as { x: number; z: number }, step = Math.hypot(b.x - a.x, b.z - a.z);
        if (k > 0) expect(step, `#${d.id}`).toBeLessThan(d.id === 20 ? 150 : 51);
        length += step;
      }
      expect(d.limitSeconds * (BALANCE.jobs.trial.speeds[0] as number), `#${d.id}`).toBeGreaterThan(length - 20);
    }
  });

  it('14b.2 the zones round their places: the container maze, the stadium\'s car park, the market street, the beach promenade; each ring inside its zone', () => {
    const R = BALANCE.jobs.zone.radius, yard = PLACES.containerYards[1];
    const zones = rings().filter((d) => d.kind === 'rage' || d.kind === 'mayhem');
    for (const d of zones) {
      const [px, pz] = (JOBS[d.id - 1] as { at: P2 }).at, at = `#${d.id} ${d.kind}`;
      expect(Math.hypot(d.targetX - d.x, d.targetZ - d.z), `${at}: its ring inside`).toBeLessThanOrEqual(0.85 * R + 0.01);
      // the plan's place, or moved toward a ring further out, by no more than the ring's excess
      expect(Math.hypot(d.targetX - px, d.targetZ - pz), at).toBeLessThanOrEqual(Math.max(0, Math.hypot(px - d.x, pz - d.z) - 0.85 * R) + 0.01);
    }
    // the maze's zone moved toward its ring, still over the east yard's containers; the rest at the plan's places
    const maze = zones.find((d) => d.id === 25) as JobDef;
    expect(maze.targetX > yard.x0 && maze.targetX < yard.x1 && maze.targetZ > yard.z0 && maze.targetZ < yard.z1, 'the rage in the container maze').toBe(true);
    for (const id of [26, 27, 28]) {
      const d = zones.find((q) => q.id === id) as JobDef, [px, pz] = (JOBS[id - 1] as { at: P2 }).at;
      expect(Math.hypot(d.targetX - px, d.targetZ - pz), `#${id}`).toBeLessThan(0.01);
    }
  });

  it('14b.3 the rivals: each in a bay of the streets on their turf (the Chief in the headquarters\' yard), their ends their places or, waiting at home, off with the bag', () => {
    const crown = island.places.find((p) => p.id === 'crown') as CrownPlace;
    for (const d of duels()) {
      const rival = RIVALS[d.level] as (typeof RIVALS)[number], at = `${rival.name}`;
      const plan = RIVAL_RINGS.find((q) => q.rival === d.level) as { at: P2 };
      if (d.level === 10) {
        expect(crown.bays.some((b) => Math.hypot(b.x - d.x, b.z - d.z) < 1e-6), at).toBe(true);
        expect(d.limitSeconds).toBe(0);
        continue;
      }
      // an exact bay (the traffic reserves it), on the turf, near the plan's point (the Gardens' side streets have none),
      // but Frank's: the Works' bay whose way home to the donut shop is nearest his band
      expect(traffic.streets.bays.some((b) => Math.hypot(b.x - d.x, b.z - d.z) < 1e-6), at).toBe(true);
      if (rival.turf !== 'highway') expect(districtOf(d.x, d.z), at).toBe(rival.turf);
      const shop = PLACES.donutShop;
      if (rival.target === 'donuts') expect(Math.hypot(d.targetX - (shop.x0 + shop.x1) / 2, d.targetZ - (shop.z0 + shop.z1) / 2), at).toBeLessThan(40);
      else expect(Math.hypot(plan.at[0] - d.x, plan.at[1] - d.z), at).toBeLessThan(250);
      const [lo, hi] = rival.path, length = d.limitSeconds * BALANCE.board.limitSpeed;
      // Granny races to the Glasshouse: its parkway
      if (rival.target === 'glasshouse') expect(island.network.laneRoad[traffic.streets.nearestLane(d.targetX, d.targetZ, traffic.streets.groundAt(d.targetX, d.targetZ))], at).toBe('parkway');
      // a race to a lane, and a hunt (home, or off with the bag from home): as far as the band says
      if (rival.target === 'lane' || rival.target === 'far') expect(length, at).toBeLessThan(hi + 400);
      if (rival.target === 'lane' || rival.target === 'far' || rival.format === 'hunt') expect(length, at).toBeGreaterThan(lo - 400);
    }
    // apart
    for (const a of duels()) for (const b of duels()) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(60);
  });

  it('14b.4 the way reaches every ring and door from the lanes at its ground, never a deck over it or the tunnel under it', () => {
    const way = sim.way;
    expect(way).not.toBeNull();
    if (!way) return;
    const graph = traffic.streets.graph, hit: { x: number; z: number; yaw: number; y?: number } = { x: 0, z: 0, yaw: 0 };
    for (const d of sim.jobs.defs) {
      const reach = way.reachOfRing(d.id);
      expect(reach?.count ?? 0, `#${d.id}`).toBeGreaterThan(0);
      if (!reach) continue;
      const ground = island.ground.surfaceHeight(d.x, d.z);
      for (let k = 0; k < reach.count; k++) {
        projectOnLane(graph.lanes[reach.lanes[k] as number] as Lane, d.x, d.z, hit);
        expect(Math.abs((hit.y ?? 0) - ground), `#${d.id}'s lane ${reach.lanes[k]}`).toBeLessThan(5);
      }
    }
    // the goal from the start: a ring, its route by the road
    run(sim, 1);
    expect(way.goal.hasTarget).toBe(true);
    expect(way.count).toBeGreaterThan(1);
    expect(way.length).toBeLessThan(Infinity);
  });

  it('14b.5 the rings drawn on the island\'s ground: each on the plane under it, over the ground at its middle and edge, and its sign\'s pole from there', () => {
    const signs = newSignList(64), list = newRingList(64);
    collectSigns(sim, 0, null, () => false, signs, list);
    expect(list.count).toBeGreaterThanOrEqual(28);
    const r = BALANCE.jobs.markerRadius, g = { y: 0, sx: 0, sz: 0, bent: 0 };
    for (let i = 0; i < list.count; i++) {
      const x = list.x[i] as number, z = list.z[i] as number, base = list.base[i] as number, sx = list.sx[i] as number, sz = list.sz[i] as number;
      ringGround(island, x, z, g);
      for (let k = 0; k <= 8; k++) {
        const a = (k * Math.PI) / 4, rr = k === 8 ? 0 : r, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
        const y = base + sx * (px - x) + sz * (pz - z), ground = island.ground.surfaceHeight(px, pz);
        expect(y - ground, `the ring at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeGreaterThanOrEqual(0.05);
        expect(y - ground, `the ring at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeLessThan(1);
      }
    }
    for (let i = 0; i < signs.count; i++) {
      const ground = island.ground.surfaceHeight(signs.x[i] as number, signs.z[i] as number);
      expect(Math.abs((signs.base[i] as number) - ground), `a sign at ${(signs.x[i] as number).toFixed(0)}`).toBeLessThan(1);
    }
    // the view draws them there: each ring's instance at its plane's height, turned to its slope
    const view = new MarkerView(new THREE.Scene(), sim);
    view.update(sim, 0);
    const mesh = (view as unknown as { rings: THREE.InstancedMesh }).rings, m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    expect(mesh.count).toBe(list.count);
    for (let i = 0; i < list.count; i++) {
      mesh.getMatrixAt(i, m);
      m.decompose(p, q, s);
      expect(p.y).toBeCloseTo(list.base[i] as number, 4);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q), n = new THREE.Vector3(-(list.sx[i] as number), 1, -(list.sz[i] as number)).normalize();
      expect(up.dot(n)).toBeGreaterThan(0.9999);
    }
  });

  it('14b.5 a zone\'s edge laid along the island\'s ground round its middle', () => {
    const rage = rings().find((d) => d.id === 26) as JobDef;
    put(rage.x, rage.z, rage.yaw);
    run(sim, 0.2);
    expect(sim.jobs.active).toBe(rage.id);
    const view = new MarkerView(new THREE.Scene(), sim);
    view.update(sim, 0);
    const band = (view as unknown as { zoneGround: THREE.Mesh }).zoneGround, flat = (view as unknown as { zone: THREE.Mesh }).zone;
    expect(band.visible).toBe(true);
    expect(flat.visible).toBe(false);
    const pos = band.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k += 7) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      expect(Math.abs(Math.hypot(x - rage.targetX, z - rage.targetZ) - BALANCE.jobs.zone.radius)).toBeLessThan(1.3);
      expect(y - island.ground.surfaceHeight(x, z)).toBeCloseTo(0.3, 3);
    }
    leave();
    view.update(sim, 0);
    expect(band.visible).toBe(false);
  });

  it('14b.6 the props keep off every ring and job\'s end', () => {
    const r = BALANCE.jobs.markerRadius;
    const ends = sim.jobs.defs.flatMap((d) => [{ x: d.x, z: d.z, r: d.kind === 'duel' ? BALANCE.board.ringRadius : r },
      ...(d.kind === 'escape' || d.kind === 'rage' || d.kind === 'mayhem' ? [] : [{ x: d.targetX, z: d.targetZ, r }])]);
    let checked = 0;
    for (const q of ends) {
      for (const index of new Set([-1, 0, 1].flatMap((dj) => [-1, 0, 1].map((di) => { const [i, j] = Island.chunkOf(q.x + di * 20, q.z + dj * 20); return Island.chunkIndex(i, j); })))) {
        for (const p of island.props(index)) {
          checked++;
          expect(Math.hypot(p.x - q.x, p.z - q.z), `a ${p.kind} in the ring at ${q.x.toFixed(0)}, ${q.z.toFixed(0)}`).toBeGreaterThanOrEqual(q.r);
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('14b.7 a street race\'s rivals on the island\'s road at its height; a rival\'s car on the car model on its ground; the Nephew\'s escort on the road', () => {
    const race = rings().find((d) => d.kind === 'race' && d.id === 22) as JobDef;
    put(race.x, race.z, race.yaw);
    run(sim, 0.2);
    expect(sim.jobs.active).toBe(race.id);
    expect(sim.jobs.race.count).toBe(3);
    for (let k = 0; k < 3; k++) {
      const a = sim.jobs.race.rivals[k] as number;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(Math.abs((traffic.y[a] as number) - island.ground.surfaceHeight(traffic.x[a] as number, traffic.z[a] as number))).toBeLessThan(0.6);
    }
    leave();
    // Granny's race: her car on the car model (a duel's), its plumb rays leaning on the island's ground
    duel(0);
    const granny = sim.jobs.race.rivals[0] as number;
    expect(granny).toBeGreaterThanOrEqual(0);
    const car = sim.ai?.carOf(granny);
    expect(car).toBeDefined();
    expect(car?.plumbTilt).toBe(PLUMB_TILT);
    const start = { x: traffic.x[granny] as number, z: traffic.z[granny] as number };
    for (let i = 0; i < 120; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
    const moved = Math.hypot((traffic.x[granny] as number) - start.x, (traffic.z[granny] as number) - start.z);
    expect(moved).toBeGreaterThan(5);
    const q = car?.body.rotation() ?? { x: 0, y: 0, z: 0, w: 1 };
    expect(1 - 2 * (q.x * q.x + q.z * q.z)).toBeGreaterThan(0.9);
    leave();
    // the Mayor's Nephew: two units on the island's road round the player at once
    duel(7);
    const near = (sim.police?.units ?? []).filter((a) => a >= 0 && traffic.police[a] === 1 && Math.hypot((traffic.x[a] as number) - sim.probe.x, (traffic.z[a] as number) - sim.probe.z) < 80);
    expect(near.length).toBeGreaterThanOrEqual(BALANCE.board.escort);
    for (const a of near) expect(Math.abs((traffic.y[a] as number) - island.ground.surfaceHeight(traffic.x[a] as number, traffic.z[a] as number))).toBeLessThan(0.6);
    leave();
  });

  it('14b.8 a fare on the island: the hailer hops in, the ride to a lane\'s middle on the ground 300-900 m on', () => {
    const peds = sim.peds;
    expect(peds).not.toBeNull();
    if (!peds) return;
    leave();
    sim.setBody('taxi');
    const d = rings().find((q) => q.kind === 'delivery') as JobDef;
    // a walker at the kerb beside a street, the taxi stopped by them
    const lane = traffic.streets.graph.lanes[traffic.streets.nearestLane(d.x, d.z, traffic.streets.groundAt(d.x, d.z))] as Lane;
    const mid = lane.points[Math.floor(lane.points.length / 2)] as { x: number; z: number };
    put(mid.x, mid.z, lane.yaw);
    const h = peds.spawnAt(mid.x + Math.cos(lane.yaw) * 3, mid.z - Math.sin(lane.yaw) * 3, 0, PedPose.Walk);
    expect(h).toBeGreaterThanOrEqual(0);
    peds.hail(h, 0);
    sim.fares.hailer = h;
    for (let i = 0; i < 10 && sim.fares.fare < 0; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
    const fare = sim.jobs.defOf(sim.fares.fare);
    expect(fare?.kind).toBe('fare');
    if (fare) {
      const t = traffic.streets.nearestLane(fare.targetX, fare.targetZ, traffic.streets.groundAt(fare.targetX, fare.targetZ));
      expect(t).toBeGreaterThanOrEqual(0);
      expect(fare.limitSeconds).toBeGreaterThan(20);
    }
    leave();
    sim.setBody('muscle');
  });

  it('14b.9 the board\'s teaser keeps to its district\'s own streets on the island', () => {
    const turf = (sim.board as unknown as { turf(id: string): Uint8Array | null }).turf.bind(sim.board);
    const graph = traffic.streets.graph;
    for (const id of ['crown', 'foundry', 'gardens', 'marina'] as const) {
      const lanes = turf(id);
      expect(lanes, id).not.toBeNull();
      let n = 0;
      for (let l = 0; l < graph.lanes.length; l++) {
        if (lanes?.[l] !== 1) continue;
        n++;
        const lane = graph.lanes[l] as Lane;
        for (const node of [graph.nodes[lane.from], graph.nodes[lane.to]]) expect(districtOf(node?.x ?? 0, node?.z ?? 0), id).toBe(id);
      }
      expect(n, id).toBeGreaterThan(8);
    }
  });

  /** The car stopped at (x, z) facing `yaw`. */
  function put(x: number, z: number, yaw: number): void {
    island.sync(x, z, true);
    sim.vehicle.teleport({ x, y: island.standAt(x, z) + 0.9, z }, yaw);
    sim.vehicle.setVelocity(0, 0, 0);
  }
  /** Out of every ring, the job dropped, the chase over. */
  function leave(): void {
    put(0, 50, 0);
    run(sim, 0.05);
    sim.jobs.abandon();
    sim.pursuit.reset();
    sim.heat.reset();
    sim.board.force = false;
    run(sim, 0.2);
  }
  /** Rival `i` next and ready, the player pulled up beside their bay: the duel running. */
  function duel(i: number): void {
    sim.police!.dispatching = false;
    sim.run.chain = CHAIN_ALL;
    sim.board.beaten = (1 << i) - 1;
    sim.board.force = true;
    const d = duels().find((q) => q.level === i) as JobDef;
    const lx = Math.cos(d.yaw), lz = -Math.sin(d.yaw);
    put(d.x - lx * 3, d.z - lz * 3, d.yaw);
    run(sim, 0.3);
    expect(sim.jobs.active).toBe(d.id);
  }
});
