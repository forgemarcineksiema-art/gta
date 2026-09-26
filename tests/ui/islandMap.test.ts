/** M8.10 slice 17: the island on the radar and the full map (docs/M8.10_PLAN.md). */
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../../src/sim';
import { Island } from '../../src/sim/island/Island';
import { inPolygon } from '../../src/sim/island/geom';
import { PLACES, causeway, coastline, districtOf, islet, onLand } from '../../src/sim/island/plan';
import { islandMapShape, rectCorners, type IslandMapShape } from '../../src/ui/map/islandShape';
import { bigMapProject, bigMapScale, mapHalf } from '../../src/ui/map/minimapModel';

describe('M8.10 slice 17: the island\'s map', () => {
  let island: Island, shape: IslandMapShape;
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => { await initPhysics(); island = new Island(new RAPIER.World({ x: 0, y: -9.81, z: 0 })); shape = islandMapShape(island); }, 60_000);

  it('17.1 the full map\'s footprints from the plan: the land, the basin, the districts, the blocks, every road, the decks, the landmarks', () => {
    // the land is the plan's three shores; the basin's water inside the coast
    expect(shape.land.map((p) => p.length)).toEqual([coastline().length, causeway().length, islet().length]);
    expect(shape.water).toHaveLength(1);
    // each district's tint over its own land, its name on it
    expect(shape.districts.map((d) => d.id).sort()).toEqual(['crown', 'foundry', 'gardens', 'marina']);
    for (const d of shape.districts) {
      expect(onLand(d.anchor[0], d.anchor[1]) && districtOf(d.anchor[0], d.anchor[1]) === d.id, `${d.id}'s name`).toBe(true);
      let own = 0;
      for (const [x0, z0, x1, z1] of d.runs) if (districtOf((x0 + x1) / 2, (z0 + z1) / 2) === d.id) own++;
      expect(own / d.runs.length, `${d.id}'s tint`).toBeGreaterThan(0.95);
    }
    // a land point every 50 m, 20 m in from every shore and district's edge (the tint's cells are 20 m), is under its
    // district's tint
    const round = [[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20], [20, 20], [-20, -20], [20, -20], [-20, 20]] as const;
    for (let x = -1100; x <= 1100; x += 50) for (let z = -950; z <= 950; z += 50) {
      if (!round.every(([dx, dz]) => onLand(x + dx, z + dz) && districtOf(x + dx, z + dz) === districtOf(x, z))) continue;
      const d = shape.districts.find((q) => q.id === districtOf(x, z));
      expect(d?.runs.some(([x0, z0, x1, z1]) => x >= x0 && x < x1 && z >= z0 && z < z1), `the tint at ${x}, ${z}`).toBe(true);
    }
    // every lot a block, turned as it stands
    expect(shape.blocks).toHaveLength(island.fill.lots.length);
    const lot = island.fill.lots[0];
    if (lot) expect(inPolygon(lot.x + 0.1, lot.z + 0.1, rectCorners(shape.blocks[0] as (typeof shape.blocks)[number]))).toBe(true);
    // every road the ground graded: the streets and the others, the highway's loop whole, its decks as cover
    expect(shape.streets.length + shape.roads.length).toBe(island.ground.roads.filter((r) => r.cls !== 'highway').length);
    expect(shape.streets.length).toBeGreaterThan(30);
    expect(shape.highway.closed).toBe(true);
    expect(shape.highway.pts.length).toBeGreaterThan(500);
    expect(shape.decks.length).toBeGreaterThan(10);
    // the landmarks at their places
    expect(shape.landmarks.map((l) => l.kind)).toEqual(['tower', 'tank', 'glasshouse', 'hotel']);
    expect(shape.landmarks[3]).toMatchObject({ x: PLACES.hotel.x, z: PLACES.hotel.z });
  });

  it('17.2 the projection covers the island and its causeway', () => {
    const size = 600, half = mapHalf(0, 0, shape.half, 60), s = bigMapScale(size, half), out = { x: 0, y: 0 };
    for (const poly of shape.land) for (const [x, z] of poly) {
      bigMapProject(out, x, z, size, s);
      expect(out.x >= 0 && out.x <= size && out.y >= 0 && out.y <= size, `the shore at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBe(true);
    }
    // the causeway's far edge is on the map, not at its rim: the map reaches past it
    const far = Math.max(...causeway().map((p) => Math.abs(p[0])));
    expect(shape.half).toBeGreaterThan(far + 20);
  });
});
