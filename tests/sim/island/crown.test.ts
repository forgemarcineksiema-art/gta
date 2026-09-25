/** M8.10 slice 8: Crown Heights' places (docs/M8.10_PLAN.md). */
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { clearControls, initPhysics } from '../../../src/sim';
import { DIRT } from '../../../src/sim/city/surface';
import { SEA } from '../../../src/sim/city/sea';
import { distanceToPolyline, inPolygon, type P2 } from '../../../src/sim/island/geom';
import { HALF_WIDTH } from '../../../src/sim/island/ground';
import { Island, PLUMB_TILT } from '../../../src/sim/island/Island';
import { footprint } from '../../../src/sim/island/fill';
import { PLACES } from '../../../src/sim/island/plan';
import type { CrownPlace } from '../../../src/sim/island/places/crown';
import { ARCADE, CAR_PARK, HIDEOUT, HQ, LANDING, PIT, type Box } from '../../../src/sim/island/shapes/crown';
import { DECK } from '../../../src/sim/island/structures';
import { PAVEMENT } from '../../../src/sim/island/surfaces';
import { createWorld } from '../helpers';

const crownOf = (island: Island): CrownPlace => island.places.find((p) => p.id === 'crown') as CrownPlace;

describe('M8.10 slice 8: Crown Heights', () => {
  let world: RAPIER.World, island: Island;
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => {
    await initPhysics();
    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    island = new Island(world);
  }, 120_000);

  it('8.2 off the car park\'s roof at 90 km/h the car clears the z 140 street and lands on the roof across it', async () => {
    const sim = await createWorld({ map: 'island', traffic: 0, peds: 0 });
    const isl = sim.island as Island, crown = crownOf(isl), kick = crown.jumps.roof;
    // 25 m before the kicker's foot in the roof's west lane, heading for its lip at 25 m/s
    const fx = Math.sin(kick.yaw), fz = Math.cos(kick.yaw), back = kick.length + 25;
    const x0 = kick.x - fx * back, z0 = kick.z - fz * back;
    isl.sync(x0, z0, true);
    sim.vehicle.teleport({ x: x0, y: crown.carParkRoof + 0.6, z: z0 }, kick.yaw);
    sim.vehicle.body.setLinvel({ x: fx * 25, y: 0, z: fz * 25 }, true);
    const street = isl.ground.surfaceHeight(kick.x, 140);
    let flew = false, lowOverStreet = Infinity, landed: { x: number; y: number; z: number } | null = null;
    for (let i = 0; i < 60 * 5 && !landed; i++) {
      clearControls(sim.controls);
      sim.controls.throttle = 1;
      sim.step();
      const p = sim.vehicle.body.translation(), air = sim.vehicle.telemetry.groundedWheels === 0;
      if (air && p.z < kick.z) flew = true;
      if (flew && p.z < CAR_PARK.z0 && p.z > 128) lowOverStreet = Math.min(lowOverStreet, p.y);
      if (flew && !air) landed = { x: p.x, y: p.y, z: p.z };
    }
    expect(flew).toBe(true);
    expect(lowOverStreet - street).toBeGreaterThan(3);
    expect(landed).not.toBeNull();
    // on the landing block's roof, past the street's far pavement, not on the ground under it
    expect(landed?.z ?? 999).toBeLessThan(LANDING.z1);
    expect(landed?.z ?? 0).toBeGreaterThan(LANDING.z0);
    expect(Math.abs((landed?.y ?? 0) - crown.landingRoof)).toBeLessThan(1.5);
  }, 120_000);

  it('8.3 the quarry reads dirt, its pit stepped into benches, its floor 10 m or more under its eastern rim', () => {
    const q = PLACES.quarry as readonly P2[], ring = [...q, q[0] as P2], g = island.ground;
    let checked = 0;
    for (let x = 600; x <= 792; x += 6) for (let z = 430; z <= 608; z += 6) {
      if (!inPolygon(x, z, q) || distanceToPolyline(x, z, ring) < 6) continue;
      expect(g.surface(x, z), `${x}, ${z}`).toBe(DIRT);
      checked++;
    }
    expect(checked).toBeGreaterThan(400);
    // across the pit from its eastern rim to its floor: a fall of 10 m or more, in steps (flat benches between faces)
    const hs: number[] = [];
    for (let x = 612; x <= 740; x += 1) hs.push(g.surfaceHeight(x, 545));
    expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThan(10);
    const levels = new Set<number>();
    for (let i = 0; i + 4 < hs.length; i++) {
      const run = hs.slice(i, i + 5), level = Math.round((run[0] as number) / PIT.step) * PIT.step;
      if (run.every((h) => Math.abs(h - level) < 0.3)) levels.add(level);
    }
    expect(levels.size).toBeGreaterThanOrEqual(3);
  });

  it('8.4 the tower\'s top is seen from the pleasure pier: the ground cuts no line from it', () => {
    const top = crownOf(island).towerTop, pier = PLACES.pleasurePier, g = island.ground;
    let least = Infinity;
    for (const x of [pier.x0, (pier.x0 + pier.x1) / 2, pier.x1]) {
      const z = (pier.z0 + pier.z1) / 2, eye = Math.max(g.surfaceHeight(x, z), SEA.level) + 3;
      const d = Math.hypot(top.x - x, top.z - z);
      for (let s = 4; s < d - 4; s += 4) {
        const t = s / d, lx = x + (top.x - x) * t, lz = z + (top.z - z) * t, ly = eye + (top.y - eye) * t;
        least = Math.min(least, ly - g.surfaceHeight(lx, lz));
      }
    }
    expect(least).toBeGreaterThan(1);
    // the tower stands over the island: its top 150 m or more over the sea
    expect(top.y).toBeGreaterThan(150);
  });

  it('8.5 the serpentine\'s hairpins bank, and its ground in the physics is the drawn road all down the hill', () => {
    const g = island.ground, serp = g.roads.find((r) => r.id === 'serpentine');
    if (!serp?.bank) throw new Error('the serpentine banks nowhere');
    // its steepest cross-fall, measured across its carriageway at that point
    let k = 0;
    serp.bank.forEach((b, i) => { if (Math.abs(b) > Math.abs(serp.bank?.[k] ?? 0)) k = i; });
    const bank = serp.bank[k] as number, a = serp.pts[k - 1] as P2, b = serp.pts[k + 1] as P2, p = serp.pts[k] as P2;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]), rx = -(b[1] - a[1]) / l, rz = (b[0] - a[0]) / l, hw = HALF_WIDTH.serpentine - 1;
    expect(Math.abs(bank)).toBeGreaterThan(0.06);
    const fall = (g.surfaceHeight(p[0] + rx * hw, p[1] + rz * hw) - g.surfaceHeight(p[0] - rx * hw, p[1] - rz * hw)) / (2 * hw);
    expect(Math.abs(fall - bank)).toBeLessThan(0.02);
    // the physics' ground (the tunnel's lid where it crosses the tunnel) under its middle, all down
    const tunnel = island.structures.find((s) => s.kind === 'tunnel');
    let worst = 0, cover = Infinity;
    for (const [x, z] of serp.pts) {
      island.sync(x, z, true);
      world.step();
      const hit = world.castRay(new RAPIER.Ray({ x, y: 150, z }, { x: PLUMB_TILT, y: -1, z: PLUMB_TILT }), 250, true);
      const drawn = g.surfaceHeight(x, z);
      worst = Math.max(worst, Math.abs((hit ? 150 - hit.timeOfImpact : -99) - drawn));
      for (const piece of tunnel?.pieces ?? []) if (Math.hypot(piece.x - x, piece.z - z) < DECK.half + 2) cover = Math.min(cover, drawn - (piece.y + DECK.clear + 1));
    }
    expect(worst).toBeLessThan(0.25);
    // over the tunnel's roof, not into it
    expect(cover).toBeGreaterThan(0.8);
  }, 60_000);

  it('8.6 the places stand clear of every road and its pavements, on land, and no lot of the fill stands in them', () => {
    const g = island.ground;
    const garage: Box = { x0: HIDEOUT.x - 10, x1: HIDEOUT.x + 10, z0: HIDEOUT.z - 7, z1: HIDEOUT.z + 7 };
    const boxes: Array<[string, Box]> = [['car park', CAR_PARK], ['landing', LANDING], ['headquarters', HQ.building], ['yard', HQ.yard], ['hideout', garage]];
    for (const [name, b] of boxes) {
      for (let x = b.x0; x <= b.x1 + 1e-6; x += (b.x1 - b.x0) / 8) for (let z = b.z0; z <= b.z1 + 1e-6; z += (b.z1 - b.z0) / 8) {
        expect(g.onLand(x, z), `${name} at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBe(true);
        expect(g.nearOtherRoad(x, z, -1, PAVEMENT), `${name} at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBe(false);
      }
      for (const lot of island.fill.lots) {
        const inside = footprint(lot).some(([x, z]) => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1);
        expect(inside, `a lot in the ${name}`).toBe(false);
      }
    }
    // the arcade's columns on the pavements, off the carriageway
    for (let z = ARCADE.z0; z <= ARCADE.z1; z += (ARCADE.z1 - ARCADE.z0) / ARCADE.bays) for (const side of [-1, 1]) {
      expect(g.nearOtherRoad(ARCADE.x + side * ARCADE.column, z, -1, 0)).toBe(false);
      expect(g.nearOtherRoad(ARCADE.x + side * ARCADE.column, z, -1, PAVEMENT)).toBe(true);
    }
    // the hideout's door on its street's pavement: the garage's floor at the street's height
    const door = crownOf(island).hideout.door;
    expect(Math.abs(g.surfaceHeight(door.x - 3, door.z) - HIDEOUT.floor)).toBeLessThan(0.4);
  });
});
