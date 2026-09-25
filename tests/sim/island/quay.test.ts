/**
 * M8.10 slice 11: Coral Quay (docs/M8.10_PLAN.md): the stadium's oval a closed loop of lanes, the marina's gap cleared
 * at 80 km/h (and not at 40), the giant duck afloat and pushed by the hovercraft; the reef under the bay's surface (R2),
 * the stands' concourse covered.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEA, clearControls, type SimWorld } from '../../../src/sim';
import type { Lane } from '../../../src/sim/city/roads';
import { GROUP_DEFAULT, interactionGroups } from '../../../src/sim/collision';
import type { Island } from '../../../src/sim/island/Island';
import { DUCK, quayPlace, type QuayPlace } from '../../../src/sim/island/places/quay';
import { PLACES, districtOf, onLand } from '../../../src/sim/island/plan';
import { DECKS, OVAL, REEF, REEF_TOP, STADIUM_LEVEL, STANDS } from '../../../src/sim/island/shapes/quay';
import { createWorld } from '../helpers';

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const yawOf = (sim: SimWorld): number => { const q = sim.vehicle.body.rotation(); return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)); };

describe('M8.10 slice 11: Coral Quay', () => {
  let sim: SimWorld, island: Island, quay: QuayPlace;
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => {
    sim = await createWorld({ map: 'island', traffic: 0, peds: 0 });
    island = sim.island as Island;
    quay = quayPlace(island.places) as QuayPlace;
  }, 60_000);
  afterAll(() => sim.dispose());

  it('11.1 the stadium\'s oval is a closed loop of lanes on its level floor, the tunnel in and out of it', () => {
    const { lanes } = island.network.graph, road = island.network.laneRoad;
    const length = (l: Lane): number => l.points.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - (l.points[i] as { x: number }).x, p.z - (l.points[i] as { z: number }).z), 0);
    const oval = lanes.filter((l) => road[l.id] === 'stadium-oval');
    expect(oval.length).toBeGreaterThan(0);
    // the ellipse's length (Ramanujan's), less the lanes' insets at its one junction
    const a = OVAL.r, b = OVAL.rz, perimeter = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    for (const start of oval) {
      let lane = start, total = 0;
      for (let k = 0; k <= oval.length; k++) {
        total += length(lane);
        const next = lane.next.map((id) => lanes[id] as Lane).filter((n) => road[n.id] === 'stadium-oval');
        expect(next.length, `lane ${lane.id}`).toBe(1);
        lane = next[0] as Lane;
        if (lane === start) break;
      }
      expect(lane).toBe(start);
      expect(total).toBeGreaterThan(perimeter * 0.9);
      expect(total).toBeLessThan(perimeter * 1.02);
    }
    // on the line of the oval, one way round, on the stadium's floor
    for (const l of oval) for (const p of l.points) {
      expect(Math.abs(Math.hypot((p.x - OVAL.x) / a, (p.z - OVAL.z) / b) - 1)).toBeLessThan(0.02);
      expect(Math.abs((p.y ?? 0) - STADIUM_LEVEL)).toBeLessThan(0.05);
    }
    // the tunnel: a lane in from the Quay's street onto the oval, a lane out off it
    const tunnel = lanes.filter((l) => road[l.id] === 'stadium-tunnel');
    expect(tunnel.length).toBe(2);
    expect(tunnel.some((t) => t.next.some((id) => road[id] === 'stadium-oval'))).toBe(true);
    expect(oval.some((o) => o.next.some((id) => road[id] === 'stadium-tunnel'))).toBe(true);
    expect(tunnel.every((t) => t.next.length > 0)).toBe(true);
  });

  it('11.2 the piers\' gap clears at 80 km/h onto the far boards; at 40 the car falls in', () => {
    const gap = quay.gap;
    // along the boardwalk toward the gap: the sketch's east, the world's −x
    const jump = (kmh: number): { landed: boolean; fell: boolean; lowest: number; speed: number } => {
      const x0 = gap.x0 + 110;
      island.sync(x0, gap.z, true);
      sim.vehicle.teleport({ x: x0, y: gap.y + 1.4, z: gap.z }, -Math.PI / 2);
      for (let i = 0; i < 30; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
      let lowest = Infinity, speed = 0, landed = false, fell = false;
      for (let i = 0; i < 60 * 14; i++) {
        const p = sim.vehicle.body.translation();
        if (p.x > gap.x0) speed = sim.vehicle.telemetry.speedKmh;
        // past the far lip: never under its boards, and down on them with its wheels
        if (p.x < gap.x0) lowest = Math.min(lowest, p.y);
        if (p.y < gap.y - 2) { fell = true; break; }
        if (p.x < gap.x1 - 25 && sim.vehicle.telemetry.groundedWheels >= 3) { landed = true; break; }
        // hold the boardwalk's line, the speed to the one asked, straight across the gap
        const aim = Math.atan2(-20, gap.z - p.z);
        clearControls(sim.controls);
        sim.controls.steer = p.x > gap.x0 + 2 ? Math.max(-1, Math.min(1, -2.5 * wrap(aim - yawOf(sim)))) : 0;
        sim.controls.throttle = sim.vehicle.telemetry.speedKmh < kmh ? 1 : 0;
        sim.step();
      }
      return { landed, fell, lowest, speed };
    };
    const fast = jump(80);
    console.log(`11.2 at ${fast.speed.toFixed(0)} km/h: landed ${fast.landed}, lowest ${(fast.lowest - gap.y).toFixed(2)} m over the boards`);
    expect(fast.speed).toBeGreaterThan(76);
    expect(fast.speed).toBeLessThan(84);
    expect(fast.fell).toBe(false);
    expect(fast.landed).toBe(true);
    expect(fast.lowest).toBeGreaterThan(gap.y);
    const slow = jump(40);
    expect(slow.fell).toBe(true);
    // the gap is over the water
    expect(onLand((gap.x0 + gap.x1) / 2, gap.z)).toBe(false);
    // and every deck is driven onto from the land: at a bumper's height along it from its land end out over the water,
    // nothing solid across it (the island's wall opens there)
    const ends = DECKS.flatMap((d): Array<[number, number, number, number]> => {
      const out: Array<[number, number, number, number]> = [];
      if (onLand(d.ax, d.az) && !onLand(d.bx, d.bz)) out.push([d.ax, d.az, d.bx - d.ax, d.bz - d.az]);
      if (onLand(d.bx, d.bz) && !onLand(d.ax, d.az)) out.push([d.bx, d.bz, d.ax - d.bx, d.az - d.bz]);
      return out;
    });
    expect(ends.length).toBe(7);
    for (const [x, z, dx, dz] of ends) {
      const l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
      island.sync(x, z, true);
      sim.world.step();
      const y = island.ground.surfaceHeight(x, z) + 0.7;
      const hit = sim.world.castRay(new RAPIER.Ray({ x: x + ux, y, z: z + uz }, { x: ux, y: 0, z: uz }), 25, true, undefined, interactionGroups(0xffff, GROUP_DEFAULT));
      expect(hit, `the deck from ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeNull();
    }
    // between the first two piers the quay keeps its wall (the sketch's (495, 362), out to the bay: the world's −z)
    island.sync(-495, -362, true);
    sim.world.step();
    const wall = sim.world.castRay(new RAPIER.Ray({ x: -495, y: island.ground.surfaceHeight(-495, -362) + 0.7, z: -362 }, { x: 0, y: 0, z: -1 }), 25, true, undefined, interactionGroups(0xffff, GROUP_DEFAULT));
    expect(wall).not.toBeNull();
  });

  it('11.3 the duck floats where it was left, and moves when the hovercraft pushes it', () => {
    const d = quay.duck, float = SEA.level + DUCK.float;
    // alone for five seconds (the car away on the marina)
    sim.vehicle.teleport({ x: quay.gap.x0 + 60, y: quay.gap.y + 0.9, z: quay.gap.z }, -Math.PI / 2);
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < 300; i++) {
      clearControls(sim.controls); sim.controls.brake = 1; sim.step();
      low = Math.min(low, d.y); high = Math.max(high, d.y);
    }
    expect(low).toBeGreaterThan(float - 0.4);
    expect(high).toBeLessThan(float + 0.4);
    expect(Math.hypot(d.x - d.home.x, d.z - d.home.z)).toBeLessThan(0.5);
    // the hovercraft from 45 m off, flown at it
    sim.setBody('hover');
    const from = { x: d.x + 45, z: d.z };
    island.sync(from.x, from.z, true);
    sim.vehicle.teleport({ x: from.x, y: SEA.level + 1.2, z: from.z }, -Math.PI / 2);
    const start = { x: d.x, z: d.z };
    let moved = 0, hit = -1;
    low = Infinity; high = -Infinity;
    for (let i = 0; i < 60 * 15 && moved < 4; i++) {
      const p = sim.vehicle.body.translation(), tm = sim.vehicle.telemetry;
      // the nose where the push has to go (the hovercraft slides: the velocity wanted less the one it has)
      const dx = d.x - p.x, dz = d.z - p.z, l = Math.hypot(dx, dz) || 1, want = 12;
      const err = wrap(Math.atan2((dx / l) * want - tm.vx, (dz / l) * want - tm.vz) - yawOf(sim));
      clearControls(sim.controls);
      sim.controls.steer = Math.max(-1, Math.min(1, -2 * err));
      sim.controls.throttle = Math.cos(err) > 0.7 ? 1 : 0;
      sim.step();
      moved = Math.hypot(d.x - start.x, d.z - start.z);
      if (hit < 0 && moved > 0.2) hit = i;
      low = Math.min(low, d.y); high = Math.max(high, d.y);
    }
    console.log(`11.3 pushed ${moved.toFixed(1)} m (${(hit / 60).toFixed(1)} s in), afloat between ${(low - float).toFixed(2)} and ${(high - float).toFixed(2)} m`);
    expect(moved).toBeGreaterThan(4);
    // pushed away from the hovercraft's side, and still afloat
    expect(d.x - start.x).toBeLessThan(0);
    expect(low).toBeGreaterThan(float - 1.5);
    expect(high).toBeLessThan(float + 1.5);
    sim.setBody('muscle');
  });

  it('11.4 R2: the reef in Coral Quay\'s bay, raised off its floor and under the sea (a car on it is under the water)', () => {
    const g = island.ground, floor = g.surfaceHeight(PLACES.duck.x, PLACES.duck.z);
    expect(REEF.length).toBeGreaterThan(4);
    for (const p of REEF) {
      expect(onLand(p.x, p.z)).toBe(false);
      expect(districtOf(p.x, p.z)).toBe('marina');
      const top = g.surfaceHeight(p.x, p.z);
      expect(top).toBeCloseTo(REEF_TOP, 1);
      expect(top).toBeGreaterThan(floor + 1.5);
      // a car standing on it (its middle half a metre over it) is under the sea as the island has it
      expect(top + 0.5).toBeLessThan(SEA.level - 0.9);
    }
    // the duck's water is clear of it
    expect(REEF.every((p) => Math.hypot(p.x - PLACES.duck.x, p.z - PLACES.duck.z) > p.r + 20)).toBe(true);
  });

  it('11.5 under the stands a car is covered: a solid overhead all round the concourse, and the wheels read a paved floor', () => {
    const world = sim.world;
    island.sync(OVAL.x, OVAL.z, true);
    world.step();
    let covered = 0, checked = 0;
    for (let k = 0; k < 24; k++) {
      const t = (2 * Math.PI * (k + 0.5)) / 24, c = Math.cos(t), s = Math.sin(t), nx = OVAL.rz * c, nz = OVAL.r * s, nl = Math.hypot(nx, nz);
      // halfway through the concourse, a car's roof over the floor
      const d = (STANDS.front + STANDS.back) / 2, x = OVAL.x + OVAL.r * c + (nx / nl) * d, z = OVAL.z + OVAL.rz * s + (nz / nl) * d;
      if (x > OVAL.x + OVAL.r && Math.abs(z - OVAL.z) < 14) continue;
      checked++;
      const hit = world.castRay(new RAPIER.Ray({ x, y: STADIUM_LEVEL + 1.6, z }, { x: 0, y: 1, z: 0 }), 30, true);
      if (hit && hit.timeOfImpact > 1.5) covered++;
      expect(island.surface.at(x, z), `${x.toFixed(0)}, ${z.toFixed(0)}`).toBe(0);
    }
    expect(checked).toBeGreaterThan(20);
    expect(covered).toBe(checked);
    // the plan's cover site is under the north stand
    const site = { x: PLACES.stadium.x, z: PLACES.stadium.z + 68 };
    const hit = world.castRay(new RAPIER.Ray({ x: site.x, y: STADIUM_LEVEL + 1.6, z: site.z }, { x: 0, y: 1, z: 0 }), 30, true);
    expect(hit).not.toBeNull();
  });
});
