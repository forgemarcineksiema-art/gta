/**
 * M8.10 slice 15: the finds on the island (docs/M8.10_PLAN.md §1.4): the coins over their roads, the day's caches, the
 * hidden cars and the fleet's finds where the plan puts them, the slipways and the sea trial on its buoys, the mayhem
 * zones' markets, and the street furniture kept off what the world places.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BALANCE, CHAIN_ALL, HIDDEN_CARS, bodySpec, clearControls, type SimWorld } from '../../../src/sim';
import { COIN_HEIGHT, ISLAND_COIN_CHUNKS, gateLine } from '../../../src/sim/city/coins';
import { BILLBOARD_WIDTH } from '../../../src/sim/city/collectibles';
import { propFootprint } from '../../../src/sim/city/props';
import { projectOnLane } from '../../../src/sim/city/roads';
import { SEA, SLIPWAY } from '../../../src/sim/city/sea';
import { inLot } from '../../../src/sim/island/fill';
import { CHUNKS_X, CHUNKS_Z, Island } from '../../../src/sim/island/Island';
import { STALLS } from '../../../src/sim/island/market';
import { BUOYS, JOBS, STASH } from '../../../src/sim/island/plan';
import { CAR_PARK } from '../../../src/sim/island/shapes/crown';
import { rampAt, slipwayHead, trialRing } from '../../../src/sim/island/slipways';
import { PAVEMENT } from '../../../src/sim/island/surfaces';
import { createWorld, upness } from '../helpers';

/** The street furniture's rings round a hidden car and a slipway's head (SimWorld's, the grid's numbers). */
const PARKED_CAR_RING = 3.5;

describe('M8.10 slice 15: the finds', () => {
  let sim: SimWorld, island: Island;
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => {
    sim = await createWorld({ map: 'island', seed: 42, traffic: 0, peds: 0, record: false });
    island = sim.island as Island;
    if (sim.police) sim.police.dispatching = false;
  }, 60_000);
  afterAll(() => sim.dispose());

  const ground = (x: number, z: number): number => island.ground.surfaceHeight(x, z);
  /** The props of the chunks round (x, z). */
  const propsNear = (x: number, z: number): ReturnType<Island['props']> => {
    const [ci, cj] = Island.chunkOf(x, z), out: ReturnType<Island['props']> = [];
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) if (i >= 0 && j >= 0 && i < CHUNKS_X && j < CHUNKS_Z) out.push(...island.props(Island.chunkIndex(i, j)));
    return out;
  };

  it('15.1 the counts: sixty cache spots, the eight hidden cars and finds, two slipways, the sea trial on the plan\'s eleven buoys', () => {
    const spots = sim.caches?.spots ?? [];
    expect(spots.length).toBe(60);
    // the farthest-point order keeps them apart (the grid's rule; the island's streets hold sixty at 127 m and more)
    let gap = Infinity;
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) gap = Math.min(gap, Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z));
    expect(gap).toBeGreaterThan(120);
    expect(Object.keys(sim.stash.spots).sort()).toEqual([...HIDDEN_CARS].sort());
    expect(island.slipways.map((s) => s.kind)).toEqual(['quay', 'beach']);
    const trial = sim.jobs.defs.filter((d) => d.hover);
    expect(trial.length).toBe(1);
    expect(trial[0]?.route?.map((b) => [b.x, b.z])).toEqual(BUOYS.map((b) => [b[0], b[1]]));
    // a buoy drawn on the sea's surface at each
    for (const [x, z] of BUOYS) {
      const list = island.statics(Island.chunkIndex(...Island.chunkOf(x, z)));
      expect(list.some((st) => st.position.x === x && st.position.z === z && Math.abs(st.position.y - (SEA.level + 0.35)) < 1e-6), `a buoy at ${x}, ${z}`).toBe(true);
    }
  });

  it('15.2 each on land, or on the water where it belongs: the finds on clear ground, the trolley on the car park\'s roof, the hovercraft at the marina\'s slipway facing the water; the ramps from the shore under the sea; the trial\'s ring ashore, its buoys and finish afloat', () => {
    for (const id of HIDDEN_CARS) {
      const s = sim.stash.spots[id], spec = bodySpec(id), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const x = s.x + fz * spec.halfWidth * a + fx * spec.halfLength * b, z = s.z - fx * spec.halfWidth * a + fz * spec.halfLength * b;
        const at = `the ${id} at ${x.toFixed(0)}, ${z.toFixed(0)}`;
        expect(island.ground.onLand(x, z), at).toBe(true);
        expect(island.fill.lots.some((l) => inLot(l, x, z, 0)), at).toBe(false);
        if (id !== 'trolley') expect(island.ground.nearOtherRoad(x, z, -1, PAVEMENT), at).toBe(false);
      }
      if (id === 'trolley') {
        // in a bay over the roof's core, level with the roof (the car park's four decks up), facing the lane to its jump
        const P = CAR_PARK;
        expect(s.y).toBeCloseTo(P.floor + P.decks * P.rise, 6);
        expect(s.x - spec.halfLength).toBeGreaterThan(P.core.x0);
        expect(s.x + spec.halfLength).toBeLessThan(P.core.x1);
        expect(s.z).toBeGreaterThan(P.ramps.z0);
        expect(s.z).toBeLessThan(P.ramps.z1);
        expect(s.yaw).toBeCloseTo(Math.PI / 2, 6);
      } else {
        expect(s.y, id).toBeUndefined();
        expect(Math.hypot(s.x - STASH[id][0], s.z - STASH[id][1]), `the ${id} off its plan spot`).toBeLessThan(10);
      }
    }
    // the hovercraft behind the sea trial's ring on the marina's slipway, its bow to the water a few lengths ahead
    const marina = island.slipways[0]!, hover = sim.stash.spots.hover, ring = trialRing(marina);
    expect(Math.hypot(hover.x - ring.x, hover.z - ring.z)).toBeGreaterThan(BALANCE.jobs.markerRadius + bodySpec('hover').halfLength);
    expect(Math.cos(hover.yaw - Math.atan2(marina.nx, marina.nz))).toBeGreaterThan(0.999);
    let water = Infinity;
    for (let d = 0; d < 30; d += 0.5) if (!island.ground.onLand(hover.x + Math.sin(hover.yaw) * d, hover.z + Math.cos(hover.yaw) * d)) { water = d; break; }
    expect(water).toBeLessThan(20);
    // each ramp from its head on the shore, flush with it, down at a grade a hovercraft climbs, to its foot in the sea
    for (const s of island.slipways) {
      const head = slipwayHead(s), p = s.profile, first = p[0]!, last = p[p.length - 1]!;
      expect(island.ground.onLand(head.x, head.z), s.kind).toBe(true);
      expect(Math.abs(first.y - ground(head.x, head.z)), `the ${s.kind}'s head`).toBeLessThan(0.1);
      expect(island.ground.onLand(s.x + s.nx * last.along, s.z + s.nz * last.along), s.kind).toBe(false);
      expect(last.y).toBeLessThan(SEA.level - 0.1);
      for (let i = 0; i + 1 < p.length; i++) {
        const a = p[i]!, b = p[i + 1]!;
        expect(b.y, `the ${s.kind}'s ramp at ${a.along.toFixed(0)}`).toBeLessThanOrEqual(a.y + 1e-6);
        expect((a.y - b.y) / (b.along - a.along), `the ${s.kind}'s ramp at ${a.along.toFixed(0)}`).toBeLessThan(0.26);
      }
      // the quay's ramp is flat to its edge, then runs down over the water
      if (s.kind === 'quay') expect(rampAt(s, s.line)).toBeCloseTo(first.y, 6);
    }
    // the trial's ring ashore at the marina's top, its buoys and its finish on the water
    const trial = sim.jobs.defs.find((d) => d.hover)!;
    expect(island.ground.onLand(trial.x, trial.z)).toBe(true);
    expect(Math.hypot(trial.x - ring.x, trial.z - ring.z)).toBeLessThan(1e-6);
    for (const b of [...trial.route!, { x: trial.targetX, z: trial.targetZ }]) expect(island.ground.onLand(b.x, b.z), `${b.x}, ${b.z}`).toBe(false);
    // shown only to a hovercraft
    expect(sim.jobs.shown(trial)).toBe(false);
  });

  it('15.2 coins over their roads: the day\'s caches, a job\'s route over the hills to its cap, a wreck\'s spill on its own level; an island chunk\'s line picked at its height only', () => {
    const coins = sim.coins!, lanes = sim.traffic!.lanes;
    sim.step();
    // the caches: thirty runs of eight and a cap, each coin its height over the road under it, some high on the hill
    const caches = coins.extra.filter((c) => c.lane === -4);
    expect(caches.length).toBe(BALANCE.coin.cache.perDay * (BALANCE.coin.cache.run + 1));
    let worst = 0;
    for (const c of caches) worst = Math.max(worst, Math.abs(c.y - COIN_HEIGHT - ground(c.x, c.z)));
    expect(worst).toBeLessThan(0.15);
    expect(Math.max(...caches.map((c) => c.y))).toBeGreaterThan(15);
    // a delivery from a street on Crown's hill down to the hotel's garage: its route's coins, each over its road
    const hotel = sim.run.dropOffs.find((d) => d.name === 'hotel')!;
    const from = island.nearestLane(380, 300, ground(380, 300)), pose = { x: 0, z: 0, yaw: 0, y: 0 };
    lanes.positionAt(from, 10, 0, pose);
    const fx = Math.sin(hotel.yaw), fz = Math.cos(hotel.yaw), tx = hotel.door.x + fx * BALANCE.jobs.markerRadius, tz = hotel.door.z + fz * BALANCE.jobs.markerRadius;
    const id = sim.jobs.add({ kind: 'delivery', x: pose.x, z: pose.z, yaw: pose.yaw, targetX: tx, targetZ: tz, payout: 1000, limitSeconds: 600, heat: 0 });
    island.sync(pose.x, pose.z, true);
    sim.vehicle.teleport({ x: pose.x, y: (pose.y ?? 0) + 1, z: pose.z }, pose.yaw);
    for (let i = 0; i < 20 && sim.jobs.active !== id; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
    expect(sim.jobs.active).toBe(id);
    const route = coins.extra.filter((c) => c.lane === -5);
    expect(route.length).toBeGreaterThan(20);
    const runs = route.slice(0, -1), cap = route[route.length - 1]!;
    worst = 0;
    for (const c of runs) worst = Math.max(worst, Math.abs(c.y - COIN_HEIGHT - ground(c.x, c.z)));
    expect(worst).toBeLessThan(0.15);
    expect(Math.max(...runs.map((c) => c.y)) - Math.min(...runs.map((c) => c.y))).toBeGreaterThan(10);
    expect([cap.x, cap.z]).toEqual([tx, tz]);
    expect(Math.abs(cap.y - COIN_HEIGHT - (hotel.y ?? 0))).toBeLessThan(0.5);
    sim.jobs.abandon();
    sim.jobs.remove(id);
    // a wreck on the street under the highway's deck spills its coins on the street, not on the deck over it
    const graph = sim.traffic!.streets.graph, decks = graph.lanes.filter((l) => l.highway).flatMap((l) => l.points);
    let under: { x: number; y: number; z: number; yaw: number } | null = null;
    for (const lane of graph.lanes) {
      if (lane.highway || under) continue;
      for (const p of lane.points) {
        if (!decks.some((h) => Math.hypot(h.x - p.x, h.z - p.z) < 4 && (h.y ?? 0) - (p.y ?? 0) > 5)) continue;
        under = { x: p.x, y: p.y ?? 0, z: p.z, yaw: lane.yaw };
        break;
      }
    }
    expect(under).not.toBeNull();
    const w = under!;
    island.sync(w.x, w.z, true);
    coins.spill(w.x, w.z, w.yaw, 1200, sim.events, w.y + 0.6);
    for (let k = 0; k < coins.spillTtl.length; k++) {
      expect(Math.abs((coins.spillY[k] as number) - COIN_HEIGHT - ground(coins.spillX[k] as number, coins.spillZ[k] as number)), `spill ${k}`).toBeLessThan(0.2);
    }
    coins.spillTtl.fill(0);
    // a gate line through a panel beside a street on the hill, laid as an island chunk's: over the ground, picked by a
    // car at its height, not by one on the level under it
    const street = sim.traffic!.streets.graph.lanes.find((l) => !l.highway && lanes.length[l.id]! > 60 && (l.points[0]!.y ?? 0) > 20)!;
    const at = { x: 0, z: 0, yaw: 0, y: 0 };
    lanes.positionAt(street.id, 40, 10, at);
    const line = gateLine(sim.traffic!.streets.graph, { id: 0, x: at.x, z: at.z, yaw: at.yaw, width: BILLBOARD_WIDTH, height: 3, bottom: 2.4, paint: 0 }, ground);
    expect(line).not.toBeNull();
    for (const c of line!) expect(Math.abs(c.y - COIN_HEIGHT - ground(c.x, c.z))).toBeLessThan(1e-9);
    const index = Island.chunkIndex(...Island.chunkOf(at.x, at.z));
    // (every island chunk has its ids' room)
    expect(CHUNKS_X * CHUNKS_Z).toBeLessThanOrEqual(ISLAND_COIN_CHUNKS);
    coins.layChunk(index, line!);
    const coin = coins.chunks.get(index)![0]!, probe = { ...sim.probe, x: coin.x, z: coin.z, yaw: 0, speed: 0 };
    expect(coins.step({ ...probe, y: coin.y - 8.5 }, 0, sim.events)).toBe(0);
    expect(coins.picked[coin.id]).toBe(0);
    expect(coins.step({ ...probe, y: coin.y - 0.5 }, 0, sim.events)).toBe(coin.value);
    expect(coins.picked[coin.id]).toBe(1);
    coins.chunks.delete(index);
  });

  it('15.2 an island trial\'s coins over its road: the serpentine\'s down its hairpins and the highway\'s over its decks on their lanes, the canal\'s over its floor', () => {
    const coins = sim.coins!, graph = sim.traffic!.streets.graph, hit: { x: number; z: number; yaw: number; y?: number } = { x: 0, z: 0, yaw: 0 };
    sim.run.chain = CHAIN_ALL;
    for (const id of [17, 18, 20]) {
      const d = sim.jobs.defs.find((q) => q.id === id)!;
      island.sync(d.x, d.z, true);
      sim.vehicle.teleport({ x: d.x, y: island.standAt(d.x, d.z) + 0.9, z: d.z }, d.yaw);
      sim.vehicle.setVelocity(0, 0, 0);
      for (let i = 0; i < 60 && sim.jobs.active !== id; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
      expect(sim.jobs.active, `#${id}`).toBe(id);
      const route = coins.extra.filter((c) => c.lane === -5), runs = route.slice(0, -1);
      expect(runs.length, `#${id}`).toBeGreaterThan(30);
      let over = 0;
      for (const c of runs) {
        const at = `#${id}'s coin at ${c.x.toFixed(0)}, ${c.z.toFixed(0)}`;
        over = Math.max(over, c.y - COIN_HEIGHT - ground(c.x, c.z));
        if (id === 20) { expect(Math.abs(c.y - COIN_HEIGHT - ground(c.x, c.z)), at).toBeLessThan(0.15); continue; }
        // on a lane, at its height
        projectOnLane(graph.lanes[island.nearestLane(c.x, c.z, c.y - COIN_HEIGHT)]!, c.x, c.z, hit, c.y - COIN_HEIGHT);
        expect(Math.hypot(hit.x - c.x, hit.z - c.z), at).toBeLessThan(0.5);
        expect(Math.abs((hit.y ?? 0) + COIN_HEIGHT - c.y), at).toBeLessThan(0.15);
      }
      // the serpentine's down the hill; the highway's up on the viaduct and the bridge
      if (id === 17) expect(Math.max(...runs.map((c) => c.y)) - Math.min(...runs.map((c) => c.y))).toBeGreaterThan(20);
      if (id === 18) expect(over).toBeGreaterThan(8);
      sim.jobs.abandon();
    }
  });

  it('15.2 the street furniture keeps off the hidden cars and the slipways\' heads; the mayhem zones\' markets stand at the kerb round their rings', () => {
    for (const id of HIDDEN_CARS) {
      const s = sim.stash.spots[id];
      if (s.y !== undefined) continue;
      for (const p of propsNear(s.x, s.z)) expect(Math.hypot(p.x - s.x, p.z - s.z), `a ${p.kind} by the ${id}`).toBeGreaterThan(PARKED_CAR_RING);
    }
    for (const s of island.slipways) {
      const head = slipwayHead(s);
      for (const p of propsNear(head.x, head.z)) expect(Math.hypot(p.x - head.x, p.z - head.z), `a ${p.kind} by the ${s.kind}'s slipway`).toBeGreaterThan(SLIPWAY.clear);
    }
    // the plan's mayhem zones (the jobs' rings stand at them): twelve stalls round each, a crate between each two, each
    // at the kerb facing the pavement, clear of the carriageway and of the walkers' band
    const zones = JOBS.filter((j) => j.kind === 'mayhem').map((j) => ({ x: j.at[0], z: j.at[1] }));
    island.setPropKeepOut([], () => ({ samples: [], spots: [] }), zones);
    const probe = { h: 0, steep: 0, steepKind: -1, road: Infinity, surface: 0 as const };
    for (const zone of zones) {
      // the market's own: at the kerb (the district's stalls stand on the frontage line past the pavement)
      const kerb = propsNear(zone.x, zone.z).filter((p) => Math.hypot(p.x - zone.x, p.z - zone.z) < STALLS.reach + 30
        && Math.abs(island.ground.probe(p.x, p.z, probe).road - STALLS.kerb) < 0.05);
      const stalls = kerb.filter((p) => p.kind === 'fruitStand' || p.kind === 'fishStall');
      expect(stalls.length, `the market at ${zone.x}, ${zone.z}`).toBe(STALLS.units);
      expect(kerb.filter((p) => p.kind === 'crate').length).toBeGreaterThanOrEqual(STALLS.units - STALLS.legs);
      for (const p of stalls) {
        // its front toward the pavement (its +Z away from the road), its far side short of the walkers' band
        const f = propFootprint(p.kind), c = Math.cos(p.yaw), s = Math.sin(p.yaw);
        const out = island.ground.probe(p.x + s * f.hz, p.z + c * f.hz, probe).road;
        expect(out).toBeGreaterThan(STALLS.kerb);
        expect(out).toBeLessThan(1.35);
      }
    }
  });

  it('15.2 a find is taken where it waits and driven off its spot: each stands at its height, a swap finds it for good, it drives on upright', () => {
    const traffic = sim.traffic!;
    for (const id of HIDDEN_CARS) {
      const k = HIDDEN_CARS.indexOf(id), s = sim.stash.spots[id], spec = bodySpec(id), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      const floor = s.y ?? ground(s.x, s.z);
      // the garage's car pulled up behind it, else ahead of it, else beside it (the trolley's roof has the ramp's hole behind)
      const reach = Math.min(5.8, spec.halfLength + 3.1);
      const sides: Array<[number, number]> = id === 'trolley' ? [[0, 3.2], [0, -3.2]] : [[-reach, 0], [reach, 0], [0, 3.2], [0, -3.2]];
      let taken = false;
      for (const [along, across] of sides) {
        const x = s.x + fx * along + fz * across, z = s.z + fz * along - fx * across;
        island.sync(x, z, true);
        sim.vehicle.teleport({ x, y: floor + 1, z }, s.yaw);
        sim.vehicle.setVelocity(0, 0, 0);
        for (let i = 0; i < 30; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
        const a = sim.stash.agents[k] as number;
        expect(a, id).toBeGreaterThanOrEqual(0);
        expect(traffic.bodyOf(a)).toBe(id);
        // standing at its own height: the ground's, or the roof's
        expect(Math.abs((traffic.y[a] as number) - floor), id).toBeLessThan(0.1);
        const p = sim.vehicle.body.translation();
        if (sim.life.state.swapCandidate !== a || Math.hypot(p.x - x, p.z - z) > 1) continue;
        clearControls(sim.controls);
        sim.controls.swap = true;
        sim.step();
        for (let i = 0; i < 2; i++) { clearControls(sim.controls); sim.step(); }
        taken = true;
        break;
      }
      expect(taken, id).toBe(true);
      expect(sim.carBody).toBe(id);
      expect(sim.stash.found.has(id)).toBe(true);
      // in it at its spot's height (not dropped from over it), then on under its own power (the trolley's a walk; the
      // monster truck, taken at the car's ride height, first settles on its tall springs)
      const p0 = { ...sim.vehicle.body.translation() };
      expect(Math.abs(p0.y - floor), `the ${id}'s height`).toBeLessThan(1.5);
      for (let i = 0; i < 3 * 60; i++) { clearControls(sim.controls); sim.controls.throttle = 1; sim.step(); }
      const p1 = sim.vehicle.body.translation();
      expect(Math.hypot(p1.x - p0.x, p1.z - p0.z), `the ${id} driven`).toBeGreaterThan(1);
      expect(upness(sim), id).toBeGreaterThan(0.8);
      expect(sim.life.state.wrecked, id).toBe(false);
      expect(Math.abs(p1.y - p0.y), `the ${id} on its level`).toBeLessThan(3);
      // back to the garage's car
      sim.garage.select('muscle');
      sim.garage.applyToVehicle();
    }
  });

  it('15.2 the marina\'s gate stops a car at the slipway\'s top; the hovercraft goes down each ramp and out on the water, and back up the marina\'s', () => {
    const marina = island.slipways[0]!;
    const put = (along: number, s = marina): void => {
      const x = s.x + s.nx * along, z = s.z + s.nz * along;
      island.sync(x, z, true);
      sim.vehicle.teleport({ x, y: rampAt(s, along) + 1, z }, Math.atan2(s.nx, s.nz));
      sim.vehicle.setVelocity(0, 0, 0);
    };
    // a car from between the parked hovercraft and the ramp, flat out at the sea: it stays on the quay
    sim.setBody('muscle');
    put(marina.line - 5);
    const top = rampAt(marina, marina.line);
    let low = Infinity, ashore = true;
    for (let i = 0; i < 4 * 60; i++) {
      clearControls(sim.controls);
      sim.controls.throttle = 1;
      sim.step();
      const p = sim.vehicle.body.translation();
      low = Math.min(low, p.y);
      ashore &&= island.ground.onLand(p.x, p.z);
    }
    expect(ashore).toBe(true);
    expect(low).toBeGreaterThan(top);
    // the hovercraft, down each slipway, through its gate and out on the sea
    sim.setBody('hover');
    for (const s of island.slipways) {
      // (the marina's boardwalk crosses the bay 48 m out: the run ends short of it)
      const foot = s.profile[s.profile.length - 1]!.along;
      put(s.profile[0]!.along + 1, s);
      let afloat = 0, far = -Infinity;
      for (let i = 0; i < 10 * 60 && far < foot + 10; i++) {
        clearControls(sim.controls);
        sim.controls.throttle = 1;
        sim.step();
        const p = sim.vehicle.body.translation();
        far = Math.max(far, (p.x - s.x) * s.nx + (p.z - s.z) * s.nz);
        if (!island.ground.onLand(p.x, p.z) && Math.abs(p.y - (SEA.level + 0.35)) < 0.2) afloat++;
      }
      expect(far, `out past the ${s.kind}'s gate`).toBeGreaterThan(foot + 10);
      expect(afloat, `afloat off the ${s.kind}'s slipway`).toBeGreaterThan(30);
    }
    // and back up the marina's, from the water onto the quay
    const foot = marina.profile[marina.profile.length - 1]!.along, x = marina.x + marina.nx * (foot + 8), z = marina.z + marina.nz * (foot + 8);
    island.sync(x, z, true);
    sim.vehicle.teleport({ x, y: SEA.level + 0.6, z }, Math.atan2(-marina.nx, -marina.nz));
    sim.vehicle.setVelocity(0, 0, 0);
    let along = Infinity;
    for (let i = 0; i < 12 * 60 && along > marina.line - 1; i++) {
      clearControls(sim.controls);
      sim.controls.throttle = 1;
      sim.step();
      const p = sim.vehicle.body.translation();
      along = (p.x - marina.x) * marina.nx + (p.z - marina.z) * marina.nz;
    }
    expect(along).toBeLessThan(marina.line - 1);
    expect(sim.vehicle.body.translation().y).toBeGreaterThan(rampAt(marina, marina.line));
    sim.setBody('muscle');
  });
});
