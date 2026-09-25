/** M8.10 slice 10: Palm Gardens (docs/M8.10_PLAN.md): the botanic garden, the golf, the dunes, the beach, the back gardens. */
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { ASPHALT, DIRT, GRASS, SAND, SEA, clearControls, type SimWorld } from '../../../src/sim';
import { PROP_KINDS, type PropDesc, type PropSpot } from '../../../src/sim/city/props';
import type { P2 } from '../../../src/sim/island/geom';
import { Island, PLUMB_TILT } from '../../../src/sim/island/Island';
import type { GardensPlace } from '../../../src/sim/island/places/gardens';
import { BLEND, HALF_WIDTH, MAX_GRADE, SHOULDER } from '../../../src/sim/island/ground';
import { GARDEN } from '../../../src/sim/island/plan';
import {
  BOARDWALK, BUNKERS, CREST, FAIRWAYS, GLASSHOUSE, GREENS, PATH, POND, TEES, boardwalkRuns, gardenDunes, gardenPaths, humpAt,
} from '../../../src/sim/island/shapes/gardens';
import { KERB, ROAD_LIFT } from '../../../src/sim/island/surfaces';
import { PropState } from '../../../src/sim/props/Props';
import { createWorld } from '../helpers';

describe('M8.10 slice 10: Palm Gardens', () => {
  let sim: SimWorld;
  let island: Island;
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => {
    sim = await createWorld({ map: 'island', traffic: 0, peds: 0 });
    island = sim.island as Island;
  }, 60_000);

  it('10.1 the golf\'s and the beach\'s surfaces: fairways, greens and tees of grass, bunkers of sand in their hollows, the pond under the sea\'s level, the dunes\' sand raised, the beach\'s sand, the boardwalk\'s deck', () => {
    const g = island.ground;
    for (const f of FAIRWAYS) for (const t of [0.2, 0.8]) expect(g.surface(f.ax + (f.bx - f.ax) * t, f.az + (f.bz - f.az) * t), 'a fairway').toBe(GRASS);
    for (const o of GREENS) expect(g.surface(o.x, o.z), 'a green').toBe(GRASS);
    for (const t of TEES) expect(g.surface(t.x, t.z), 'a tee').toBe(GRASS);
    for (const b of BUNKERS) {
      expect(g.surface(b.x, b.z), 'a bunker').toBe(SAND);
      expect(g.surfaceHeight(b.x + b.rx + 2, b.z) - g.surfaceHeight(b.x, b.z), 'a bunker\'s hollow').toBeGreaterThan(0.5);
    }
    // the pond: water deep enough to drown a car in its middle, its rim on dry land
    expect(g.surfaceHeight(POND.x, POND.z)).toBeLessThan(SEA.level - 1.5);
    expect(g.surfaceHeight(POND.x + POND.rx + 1, POND.z)).toBeGreaterThan(SEA.level + 1);
    expect(g.onLand(POND.x, POND.z)).toBe(true);
    // the dunes: sand, each over the ground round it
    const { dunes } = gardenDunes();
    expect(dunes.length).toBeGreaterThanOrEqual(12);
    for (const d of dunes) {
      expect(g.surface(d.x, d.z), 'a dune').toBe(SAND);
      const round = Math.min(...[0, 1, 2, 3].map((k) => g.surfaceHeight(d.x + Math.cos(k * 1.57) * (d.r + 1), d.z + Math.sin(k * 1.57) * (d.r + 1))));
      expect(g.surfaceHeight(d.x, d.z) - round, `a dune at ${d.x.toFixed(0)}, ${d.z.toFixed(0)}`).toBeGreaterThan(0.6);
    }
    // the golf's rough stays grass (slice 3's known point), the beach sand
    expect(g.surface(700, -620)).toBe(GRASS);
    for (const x of [-200, 0, 150, 350]) expect(g.surface(x, -780), `the beach at ${x}`).toBe(SAND);
    // the boardwalk: a deck the wheels ride over the sand, level with the beach road's pavement or a hand over the sand
    const world = sim.world;
    let decks = 0;
    for (const run of boardwalkRuns()) for (let i = 2; i + 2 < run.length; i += 12) {
      const [x, z] = run[i] as P2;
      island.sync(x, z, true);
      world.step();
      const hit = world.castRay(new RAPIER.Ray({ x, y: 30, z }, { x: PLUMB_TILT, y: -1, z: PLUMB_TILT }), 60, true);
      expect(hit, `the deck at ${x.toFixed(0)}, ${z.toFixed(0)}`).not.toBeNull();
      const top = 30 - (hit?.timeOfImpact ?? 0), sand = g.surfaceHeight(x, z);
      expect(top - sand, `the deck over the sand at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeGreaterThan(0.1);
      // toward the road (+Z) its edge meets the pavement's top
      const pavement = g.surfaceHeight(x, z + BOARDWALK.half + 0.3) + ROAD_LIFT + KERB;
      expect(top - pavement, `the deck by the pavement at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeGreaterThan(-0.05);
      decks++;
    }
    expect(decks).toBeGreaterThanOrEqual(6);
  });

  it('10.2 every back fence\'s panel stands as a prop at its spot, and one breaks at 30 km/h', () => {
    const gardens = island.places.find((p) => p.id === 'gardens') as GardensPlace;
    expect(gardens.fences.length).toBeGreaterThan(20);
    const at = (s: PropSpot): PropDesc | undefined => {
      const [i, j] = Island.chunkOf(s.x, s.z);
      return island.props(Island.chunkIndex(i, j)).find((p) => p.kind === 'fence' && Math.hypot(p.x - s.x, p.z - s.z) < 0.01);
    };
    for (const s of gardens.fences) expect(at(s), `a fence at ${s.x.toFixed(0)}, ${s.z.toFixed(0)}`).toBeDefined();
    // the car along a shortcut at 30 km/h into a panel: the panel goes
    const spot = gardens.fences[0] as PropSpot, fence = at(spot) as PropDesc, fx = Math.sin(spot.yaw), fz = Math.cos(spot.yaw);
    const x = spot.x - fx * 10, z = spot.z - fz * 10;
    island.sync(x, z, true);
    sim.vehicle.teleport({ x, y: island.ground.surfaceHeight(x, z) + 0.8, z }, spot.yaw);
    for (let i = 0; i < 24; i++) { clearControls(sim.controls); sim.controls.brake = 1; sim.step(); }
    expect(sim.props?.state[fence.id]).toBe(PropState.Standing);
    const v = 30 / 3.6, lv = { x: 0, y: 0, z: 0 };
    let knocked = false;
    for (let i = 0; i < 120 && !knocked; i++) {
      clearControls(sim.controls);
      sim.vehicle.setVelocity(fx * v, sim.vehicle.body.linvel(lv).y, fz * v);
      sim.step();
      knocked = sim.props?.state[fence.id] !== PropState.Standing;
    }
    expect(knocked).toBe(true);
  });

  it('10.3 the garden\'s paths join the parkway at both ends: gravel end to end, a car\'s grade but on the crest, nothing standing on them', () => {
    const g = island.ground, paths = gardenPaths();
    expect(paths.map((p) => p.id).sort()).toEqual(['crest', 'loop', 'south']);
    for (const p of paths) {
      // gravel all along, and a dirt track's grade between points 2 m apart but over the crest's hump and down the
      // parkway's bank (its carriageway level across, cut into the hill)
      const bank = 170 - HALF_WIDTH.avenue - SHOULDER - BLEND;
      for (let i = 0; i + 1 < p.pts.length; i++) {
        const [x, z] = p.pts[i] as P2, [bx, bz] = p.pts[i + 1] as P2, r = Math.hypot(x - GARDEN.x, z - GARDEN.z);
        if (r < PATH.end - 1.5) expect(g.surface(x, z), `${p.id} at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBe(DIRT);
        const grade = Math.abs(g.surfaceHeight(bx, bz) - g.surfaceHeight(x, z)) / Math.hypot(bx - x, bz - z);
        const most = humpAt(CREST, x, z) > 0 || humpAt(CREST, bx, bz) > 0 ? 0.45 : r > bank ? 0.25 : MAX_GRADE.dirt;
        expect(grade, `${p.id}'s grade at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeLessThan(most);
      }
      if (p.closed) continue;
      // both ends on the parkway: a metre past each, the parkway's carriageway
      for (const [end, inner] of [[p.pts[0], p.pts[1]], [p.pts[p.pts.length - 1], p.pts[p.pts.length - 2]]] as Array<[P2, P2]>) {
        const dx = end[0] - inner[0], dz = end[1] - inner[1], l = Math.hypot(dx, dz);
        expect(Math.hypot(end[0] - GARDEN.x, end[1] - GARDEN.z)).toBeGreaterThan(PATH.end - 1.5);
        expect(g.surface(end[0] + (dx / l) * 1.5, end[1] + (dz / l) * 1.5), `${p.id}'s end at ${end[0].toFixed(0)}, ${end[1].toFixed(0)}`).toBe(ASPHALT);
      }
    }
    // the loop meets both straight paths
    for (const dz of [PATH.chord, -PATH.chord]) expect(g.surface(GARDEN.x, GARDEN.z + dz)).toBe(DIRT);
    // no trunk and no wall on a path
    const onPath = (x: number, z: number, pad: number): boolean => {
      const r = Math.hypot(x - GARDEN.x, z - GARDEN.z);
      return Math.abs(r - PATH.loop) < PATH.half + pad || (r < PATH.end && Math.abs(Math.abs(z - GARDEN.z) - PATH.chord) < PATH.half + pad);
    };
    let solids = 0;
    for (const list of island.fill.chunks.values()) for (const st of list) {
      if (st.tag !== 'trunk' && st.tag !== 'building') continue;
      if (Math.hypot(st.position.x - GARDEN.x, st.position.z - GARDEN.z) > PATH.end) continue;
      solids++;
      const reach = st.shape.kind === 'box' ? Math.hypot(st.shape.hx, st.shape.hz) : st.shape.kind === 'cylinder' ? st.shape.radius : 0;
      expect(onPath(st.position.x, st.position.z, reach + 0.5), `a ${st.tag} at ${st.position.x.toFixed(0)}, ${st.position.z.toFixed(0)}`).toBe(false);
    }
    expect(solids).toBeGreaterThan(50);
  });

  it('10.4 the Glasshouse on its terrace over the hill: the terrace level and paved, over the garden round it, the hall solid on it', () => {
    const g = island.ground, top = g.surfaceHeight(GLASSHOUSE.x, GLASSHOUSE.z);
    for (let k = 0; k < 8; k++) {
      const x = GLASSHOUSE.x + Math.cos(k * 0.785) * 26, z = GLASSHOUSE.z + Math.sin(k * 0.785) * 26;
      expect(Math.abs(g.surfaceHeight(x, z) - top), 'the terrace level').toBeLessThan(0.05);
      expect(g.surface(x, z)).toBe(ASPHALT);
      expect(top - g.surfaceHeight(GLASSHOUSE.x + Math.cos(k * 0.785) * 70, GLASSHOUSE.z + Math.sin(k * 0.785) * 70), 'over the garden').toBeGreaterThan(1.5);
    }
    const hall = [...island.fill.chunks.values()].flat().find((st) => st.tag === 'building' && st.shape.kind === 'box' && st.shape.hx === GLASSHOUSE.half && Math.hypot(st.position.x - GLASSHOUSE.x, st.position.z - GLASSHOUSE.z) < 0.01);
    expect(hall).toBeDefined();
    if (hall?.shape.kind === 'box') expect(Math.abs(hall.position.y - hall.shape.hy - top)).toBeLessThan(0.01);
  });

  it('10.6 the back gardens\' shortcuts: ways from one ring of streets to the next, clear of the houses, the gardens\' fences across each', () => {
    const place = island.places.find((p) => p.id === 'gardens') as GardensPlace | undefined;
    expect(place).toBeDefined();
    const { shortcuts, fences } = place as GardensPlace;
    console.log(`10.6 ${shortcuts.length} shortcuts, ${fences.length} fences`);
    expect(shortcuts.length).toBeGreaterThanOrEqual(6);
    const g = island.ground, gardens = island.fill.lots.filter((l) => l.district === 'gardens');
    for (const s of shortcuts) {
      const dx = s.to[0] - s.from[0], dz = s.to[1] - s.from[1], l = Math.hypot(dx, dz);
      // each end at a street's carriageway
      for (const [x, z, sign] of [[s.from[0], s.from[1], -1], [s.to[0], s.to[1], 1]] as const) expect(g.surface(x + (dx / l) * sign, z + (dz / l) * sign)).toBe(ASPHALT);
      // clear of every house by 2.5 m along it
      for (let d = 0; d <= l; d += 1) {
        const x = s.from[0] + (dx / l) * d, z = s.from[1] + (dz / l) * d;
        for (const h of gardens) {
          if (Math.hypot(h.x - x, h.z - z) > 30) continue;
          const rx = x - h.x, rz = z - h.z, c = Math.cos(h.yaw), sn = Math.sin(h.yaw);
          const u = Math.abs(rx * c - rz * sn) - h.hx, v = Math.abs(rx * sn + rz * c) - h.hz;
          expect(Math.hypot(Math.max(0, u), Math.max(0, v)), `a way at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeGreaterThan(2.5);
        }
      }
      // two fences across it, each of two panels or more on its line
      const mine = fences.filter((f) => { const t = ((f.x - s.from[0]) * dx + (f.z - s.from[1]) * dz) / l; return t > 0 && t < l && Math.abs((f.x - s.from[0]) * dz - (f.z - s.from[1]) * dx) / l < 3; });
      expect(mine.length, 'a way\'s fences').toBeGreaterThanOrEqual(4);
    }
    for (const f of fences) expect(PROP_KINDS.includes(f.kind), f.kind).toBe(true);
  });
});
