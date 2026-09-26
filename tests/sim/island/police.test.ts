/**
 * M8.10 slice 15a: the police's places on the island (docs/M8.10_PLAN.md §1.4): the roadblock sites, the parked
 * patrols' kerbs, the cameras, the covers the helicopter cannot see into, the donut shop; each at its road's height.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BALANCE, clearControls, type SimWorld } from '../../../src/sim';
import type { CameraDesc } from '../../../src/sim/city/cameras';
import type { Chokepoint } from '../../../src/sim/city/cover';
import { laneAt } from '../../../src/sim/city/route';
import { QUERY_NOT_PROP } from '../../../src/sim/collision';
import { HALF_WIDTH } from '../../../src/sim/island/ground';
import { Island, PLUMB_TILT } from '../../../src/sim/island/Island';
import { islandChokepoints } from '../../../src/sim/island/police';
import { PLACES, type RoadClass } from '../../../src/sim/island/plan';
import { DECK } from '../../../src/sim/island/structures';
import { PAVEMENT } from '../../../src/sim/island/surfaces';
import { POLICE } from '../../../src/sim/police/tuning';
import { AgentState, type Traffic } from '../../../src/sim/traffic/Traffic';
import { CAR_PRESETS } from '../../../src/sim/vehicle/presets';
import { createWorld } from '../helpers';

describe('M8.10 slice 15a: the police\'s places', () => {
  let sim: SimWorld, island: Island, traffic: Traffic;
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => {
    sim = await createWorld({ map: 'island', seed: 42, traffic: 0, peds: 0, record: false, heat: 60 });
    island = sim.island as Island;
    traffic = sim.traffic as Traffic;
    (sim.police as { dispatching: boolean }).dispatching = false;
  }, 60_000);
  afterAll(() => sim.dispose());

  /** The car at (x, z) on the road's height `y`, facing `yaw`, braked for `steps` steps (the chase kept on when `chase`). */
  const put = (x: number, y: number, z: number, yaw: number, steps: number, chase = false): void => {
    island.sync(x, z, true);
    sim.vehicle.teleport({ x, y: y + 0.8, z }, yaw);
    for (let i = 0; i < steps; i++) {
      clearControls(sim.controls);
      sim.controls.brake = 1;
      if (chase) sim.pursuit.force();
      sim.step();
    }
  };
  /** The road class of a lane (its network line's). */
  const classOf = (lane: number): RoadClass => island.network.lines.find((l) => l.id === island.network.laneRoad[lane])?.cls ?? 'street';
  /** The top of whatever the physics has under (x, z) from `top` down: a deck, the tunnel's floor, the ground (a leaning ray). */
  const floorAt = (x: number, top: number, z: number): number => {
    const hit = sim.world.castRay(new RAPIER.Ray({ x, y: top, z }, { x: PLUMB_TILT, y: -1, z: PLUMB_TILT }), 60, true, undefined, QUERY_NOT_PROP);
    return hit ? top - hit.timeOfImpact : -Infinity;
  };

  it('15.1 the counts: six roadblock sites (every lane there each way, the roundabout\'s six avenues), ten cameras, thirteen covers; the day mans its share of each', () => {
    const cover = sim.cover!;
    const chokes = islandChokepoints(island);
    expect(cover.chokepoints.length).toBe(chokes.length);
    const graph = island.network.graph;
    for (let site = 0; site < 6; site++) {
      const here = chokes.filter((c) => c.site === site);
      const lanes = here.map((c) => graph.lanes[c.lane]!);
      if (site === 5) {
        // the roundabout: one on each avenue arriving at it
        expect(new Set(lanes.map((l) => island.network.laneRoad[l.id])).size, 'the roundabout\'s avenues').toBe(6);
      } else {
        // a tunnel's mouth, the bridge's ends, the viaduct's: the highway's four lanes, two each way
        expect(lanes.length, `site ${site}`).toBe(4);
        expect(lanes.every((l) => l.highway), `site ${site}`).toBe(true);
        const ways = here.map((c) => Math.cos(c.yaw - here[0]!.yaw));
        expect(ways.filter((c) => c > 0.5).length, `site ${site}`).toBe(2);
        expect(ways.filter((c) => c < -0.5).length, `site ${site}`).toBe(2);
      }
    }
    expect(sim.cameras!.descs.length).toBe(10);
    const kinds: Record<string, number> = {};
    for (const c of island.covers) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
    expect(island.covers.length).toBe(13);
    expect(kinds).toEqual({ tunnel: 1, viaduct: 1, bridge: 5, stadium: 1, carpark: 1, arcade: 1, pergola: 1, warehouse: 1, cranes: 1 });
    expect(cover.parkedJunctions.length).toBeGreaterThan(30);
    for (const p of cover.parkedJunctions) expect(Math.hypot(p.x - cover.hideout.x, p.z - cover.hideout.z)).toBeGreaterThanOrEqual(300);
    // the day's police: its share of each list, today's order over it
    sim.dailies.setDate('2026-09-26');
    const share = BALANCE.dailies.police, d = cover.daily;
    const manned = (a: Uint8Array): number => a.reduce((n, v) => n + v, 0);
    expect(manned(d.chokepoints)).toBe(Math.ceil(cover.chokepoints.length * share.chokepoints));
    expect(manned(d.parked)).toBe(Math.ceil(cover.parkedJunctions.length * share.parked));
    expect(manned(d.cameras)).toBe(Math.ceil(cover.cameraSites.length * share.cameras));
    expect([...d.order.chokepoints].sort((a, b) => a - b)).toEqual(cover.chokepoints.map((_, i) => i));
    sim.dailies.date = '';
    d.chokepoints.fill(1);
    d.parked.fill(1);
    d.cameras.fill(1);
  });

  it('15a.1 a roadblock\'s two cars stand across its lane on the road\'s surface: in the tunnel, on the decks, on the avenues, and stay there', () => {
    const rb = sim.roadblocks!;
    const chokes = islandChokepoints(island);
    for (let site = 0; site < 6; site++) {
      const c = chokes.find((k) => k.site === site) as Chokepoint;
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      // the player 60 m back on its lane, the chase on
      const back = laneAt(island.network.graph.lanes[c.lane]!, Math.max(0, c.s - 60));
      put(back.x, back.y, back.z, c.yaw, 3, true);
      rb.raise(c);
      expect(rb.active, `site ${site}`).toBe(1);
      expect(rb.y).toBe(c.y);
      for (const agent of rb.agents) {
        expect(agent, `site ${site}`).toBeGreaterThanOrEqual(0);
        const x = traffic.x[agent] as number, z = traffic.z[agent] as number;
        // across the lane: a half gap either side of its line, on its surface (a deck's, the tunnel's floor, the ground)
        const across = -(x - c.x) * fz + (z - c.z) * fx, along = (x - c.x) * fx + (z - c.z) * fz;
        expect(Math.abs(Math.abs(across) - POLICE.roadblock.gap / 2), `site ${site}`).toBeLessThan(0.05);
        expect(Math.abs(along)).toBeLessThan(0.05);
        expect(Math.abs((traffic.y[agent] as number) - c.y), `site ${site}'s car on its road`).toBeLessThan(0.01);
        expect(Math.abs(floorAt(x, c.y + 3, z) - c.y), `site ${site}'s road under its car`).toBeLessThan(0.1);
      }
      expect(Math.sign(-(traffic.x[rb.agents[0]]! - c.x) * fz + (traffic.z[rb.agents[0]]! - c.z) * fx)).not.toBe(Math.sign(-(traffic.x[rb.agents[1]]! - c.x) * fz + (traffic.z[rb.agents[1]]! - c.z) * fx));
      // a second with the player near: the cars, lent their bodies, stand where they were put
      for (let i = 0; i < 60; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.pursuit.force(); sim.step(); }
      expect(rb.active, `site ${site}`).toBe(1);
      for (const agent of rb.agents) {
        expect(traffic.state[agent]).toBe(AgentState.Parked);
        expect(traffic.hasBody(agent), `site ${site}'s car's body`).toBe(true);
        expect(Math.abs((traffic.y[agent] as number) - c.y), `site ${site}'s car after a second`).toBeLessThan(0.3);
      }
      rb.clear();
    }
  });

  it('15a.2 a parked patrol stands on its kerb at the ground\'s height, short of its junction, clear of the bays', () => {
    const police = sim.police!, cover = sim.cover!, half = CAR_PRESETS.police.chassisHalfExtents.x;
    // among Crown's streets under the summit, stopped
    const lane = island.network.graph.lanes[island.nearestLane(200, 250)]!, start = laneAt(lane, 5);
    put(start.x, start.y, start.z, lane.yaw0, 120);
    const live = Array.from(police.parked).filter((a) => a >= 0);
    expect(live.length).toBe(POLICE.parked.count);
    for (let k = 0; k < police.parked.length; k++) {
      const agent = police.parked[k]!, site = cover.parkedJunctions[police.parkedAt[k]!]!;
      const x = traffic.x[agent] as number, z = traffic.z[agent] as number;
      expect(Math.hypot(x - site.x, z - site.z)).toBeLessThan(0.05);
      expect(Math.abs((traffic.y[agent] as number) - island.ground.surfaceHeight(x, z)), `a patrol at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeLessThan(0.02);
      // its side a hand off the kerb, on the carriageway
      const l = island.network.graph.lanes[site.lane]!, hw = HALF_WIDTH[classOf(site.lane)];
      const kerb = hw - (l.offset + site.offset + half);
      expect(kerb).toBeGreaterThan(0.2);
      expect(kerb).toBeLessThan(0.6);
      expect(island.surfaces.parking.some((b) => Math.hypot(b.x - x, b.z - z) < 7), `a bay by the patrol at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBe(false);
    }
    // no place's kerb on a bay (the traffic's, the donut shop's) or before a garage's door or a drive-through
    const bays = [...island.surfaces.parking, ...(island.donutShop.bays ?? [])], doors = [...island.garages.map((d) => d.door), ...island.services];
    for (const p of cover.parkedJunctions) {
      expect(bays.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < 7), `a bay by the place at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).toBe(false);
      expect(doors.some((d) => Math.hypot(d.x - p.x, d.z - p.z) < 25), `a door by the place at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).toBe(false);
    }
  });

  it('15a.3 a camera flashes a car over its limit on its road and not one on the road under its deck; every pole stands on its verge, kerb or deck', () => {
    const g = island.ground, cams = sim.cameras!;
    for (const c of cams.descs) {
      const at = `the camera at ${c.x.toFixed(0)}, ${c.z.toFixed(0)}`;
      const onDeck = !g.onLand(c.x, c.z) || c.y - g.height(c.x, c.z) > 1.5;
      if (onDeck) {
        // inside the deck's railing, on its top
        expect(c.poleY, at).toBe(c.y);
        expect(Math.hypot(c.poleX - c.x, c.poleZ - c.z), at).toBeLessThan(DECK.half - 0.2);
      } else {
        expect(g.onLand(c.poleX, c.poleZ), at).toBe(true);
        expect(Math.abs(c.poleY - island.standAt(c.poleX, c.poleZ)), at).toBeLessThan(0.01);
        expect(g.nearOtherRoad(c.poleX, c.poleZ, -1, 0.2), at).toBe(false);
      }
      // its pole in the chunk's statics, standing on its foot
      const [i, j] = Island.chunkOf(c.poleX, c.poleZ);
      expect(island.statics(Island.chunkIndex(i, j)).some((st) => Math.abs(st.position.x - c.poleX) < 0.01 && Math.abs(st.position.z - c.poleZ) < 0.01 && Math.abs(st.position.y - (c.poleY + 3)) < 0.01), at).toBe(true);
    }
    // the east straight's, on the highway's deck over the taxiway
    const cam = cams.descs.find((c) => g.onLand(c.x, c.z) && c.y - g.height(c.x, c.z) > 4) as CameraDesc;
    expect(cam).toBeDefined();
    const flashes = (from: number): number => { let n = 0; sim.events.readFrom(from, (e) => { if (e.kind === 'camera' && e.target === cam.id) n++; }); return n; };
    const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), v = cam.limitMs + 40 / 3.6;
    const along = (): number => (sim.probe.x - cam.x) * fx + (sim.probe.z - cam.z) * fz;
    let lowest = Infinity;
    const drive = (x: number, y: number, z: number, seconds: number): number => {
      put(x, y, z, cam.yaw, 3);
      const from = sim.events.sequence;
      lowest = Infinity;
      for (let i = 0; i < seconds * 60; i++) {
        clearControls(sim.controls);
        sim.vehicle.setVelocity(fx * v, sim.vehicle.telemetry.vy, fz * v);
        sim.step();
        lowest = Math.min(lowest, cam.y - sim.probe.y);
      }
      return flashes(from);
    };
    // under the deck, across its line in the cut the taxiway passes in (from 9 m before to past it, 5 m under it or
    // more all the way): nothing
    expect(drive(cam.x - fx * 9, g.height(cam.x - fx * 9, cam.z - fz * 9), cam.z - fz * 9, 0.5)).toBe(0);
    expect(along()).toBeGreaterThan(3);
    expect(lowest).toBeGreaterThan(5);
    // on the deck, 40 over: one flash
    const on = { name: '', position: { x: 0, y: 0, z: 0 }, yaw: 0 };
    island.nearestRoad(cam.x - fx * 40 - fz * 4, cam.z - fz * 40 + fx * 4, on, cam.y + 0.5);
    expect(drive(on.position.x, on.position.y - 1, on.position.z, 2)).toBe(1);
  });

  it('15a.4 the helicopter loses a car under each of the thirteen covers and sees it on the open road beside', () => {
    const heli = sim.police!.heli, lanes = island.network.graph.lanes;
    /** The light overhead on the car where it stands: whether the aircraft sees it this step. */
    const sees = (): boolean => {
      heli.overhead(sim.probe);
      return heli.step(1 / 60, 4, true, true, sim.probe, sim.probe.x, sim.probe.z);
    };
    for (const c of island.covers) {
      put(c.spot.x, c.spot.y - 0.6, c.spot.z, 0, 20);
      expect(island.covered(sim.probe.x, sim.probe.y, sim.probe.z), `a car under the ${c.kind} at ${c.spot.x.toFixed(0)}, ${c.spot.z.toFixed(0)}`).toBe(true);
      expect(sees(), `the ${c.kind} at ${c.spot.x.toFixed(0)}, ${c.spot.z.toFixed(0)}`).toBe(false);
      // the nearest open road 60 m off or more: a lane's point on the drawn ground, under no cover, no structure near
      let best: { x: number; y: number; z: number; yaw: number } | null = null, bestD = Infinity;
      for (const l of lanes) for (const p of l.points) {
        const d = Math.hypot(p.x - c.spot.x, p.z - c.spot.z), y = p.y ?? 0;
        if (d < 60 || d > bestD || Math.abs(y - island.ground.surfaceHeight(p.x, p.z)) > 0.3 || island.covered(p.x, y + 0.6, p.z)) continue;
        if (island.structures.some((s) => s.pieces.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < DECK.half + 10))) continue;
        best = { x: p.x, y, z: p.z, yaw: l.yaw };
        bestD = d;
      }
      expect(best, `an open road by the ${c.kind}`).not.toBeNull();
      if (!best) continue;
      put(best.x, best.y, best.z, best.yaw, 20);
      expect(sees(), `the open road at ${best.x.toFixed(0)}, ${best.z.toFixed(0)} by the ${c.kind}`).toBe(true);
    }
  });

  it('15a.5 the donut shop by the roundabout: its kiosk behind the pavement facing its street, two cruisers in its bays at the kerb, on the ground', () => {
    const donuts = sim.donuts!, site = donuts.site, g = island.ground, plot = PLACES.donutShop;
    expect(donuts).not.toBeNull();
    expect(site.x > plot.x0 - 2 && site.x < plot.x1 + 2 && site.z > plot.z0 - 2 && site.z < plot.z1 + 2).toBe(true);
    // the kiosk off every road and pavement, on land, solid, its window toward the street
    const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw), rx = -fz, rz = fx;
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
      const x = site.x + rx * 2.1 * a + fx * 1.5 * b, z = site.z + rz * 2.1 * a + fz * 1.5 * b;
      expect(g.onLand(x, z)).toBe(true);
      expect(g.nearOtherRoad(x, z, -1, PAVEMENT)).toBe(false);
    }
    const front = { x: site.x + fx * 8, z: site.z + fz * 8 };
    expect(g.nearOtherRoad(front.x, front.z, -1, 0)).toBe(true);
    // the lane past it the units head for runs the bays' way
    const lane = island.network.graph.lanes[island.nearestLane(site.laneX, site.laneZ)]!;
    expect(Math.cos(lane.yaw - site.laneYaw)).toBeGreaterThan(0.9);
    // the bays: on the carriageway, at the kerb in front of it
    const bays = donuts.bays;
    expect(bays.length).toBe(2);
    const hw = HALF_WIDTH[classOf(lane.id)];
    for (const b of bays) {
      expect(Math.hypot(b.x - site.x, b.z - site.z)).toBeLessThan(12);
      const near = { x: 0, y: 0, z: 0, yaw: 0 }, d = g.nearestRoad(b.x, b.z, near);
      expect(d).toBeGreaterThan(hw - 2.5);
      expect(d + CAR_PRESETS.police.chassisHalfExtents.x).toBeLessThan(hw - 0.2);
    }
    // the player on its street 80 m off: the two cruisers stand in them, parked, on the ground
    put(site.laneX - Math.sin(site.laneYaw) * 80, g.surfaceHeight(site.laneX, site.laneZ), site.laneZ - Math.cos(site.laneYaw) * 80, site.laneYaw, 30);
    for (let k = 0; k < 2; k++) {
      const a = donuts.cruisers[k]!, b = bays[k]!;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(traffic.state[a]).toBe(AgentState.Parked);
      expect(traffic.police[a]).toBe(1);
      expect(Math.hypot((traffic.x[a] as number) - b.x, (traffic.z[a] as number) - b.z)).toBeLessThan(0.3);
      expect(Math.abs((traffic.y[a] as number) - g.surfaceHeight(b.x, b.z))).toBeLessThan(0.3);
    }
    // the kiosk is solid: a car on the street does not drive through it
    expect(sim.clearFraction(front.x, site.y + 1.2, front.z, site.x, site.y + 1.2, site.z)).toBeLessThan(1);
  });
});
