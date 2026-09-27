/** M8.10 slice 6a: the highway all the way round: its decks, its overpasses, its tunnel (docs/M8.10_PLAN.md). */
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../../../src/sim';
import { Island, PLUMB_TILT } from '../../../src/sim/island/Island';
import { HALF_WIDTH } from '../../../src/sim/island/ground';
import { DECK } from '../../../src/sim/island/structures';

/** The first thing a ray meets going down from (x, top, z): its height, or null. */
const down = (world: RAPIER.World, x: number, top: number, z: number): number | null => {
  const hit = world.castRay(new RAPIER.Ray({ x, y: top, z }, { x: PLUMB_TILT, y: -1, z: PLUMB_TILT }), 200, true);
  return hit ? top - hit.timeOfImpact : null;
};

describe('M8.10 slice 6a: the highway all the way round', () => {
  beforeAll(async () => { await initPhysics(); });

  it('6a.1 the decks carry the highway: the viaduct, the bay bridge and the overpasses, each piece at its lanes\' height', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const island = new Island(world);
    world.step();
    const decks = island.structures.filter((s) => s.kind !== 'tunnel');
    expect(decks.map((s) => s.kind).sort()).toEqual(['bridge', 'overpass', 'overpass', 'overpass', 'overpass', 'overpass', 'viaduct']);
    for (const s of decks) s.pieces.forEach((p, k) => {
      island.sync(p.x, p.z, true);
      world.step();
      const y = down(world, p.x, p.y + 20, p.z);
      expect(y, `${s.kind} at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).not.toBeNull();
      // its two first and last pieces rise off the ground at its abutments
      const end = k <= 1 || k >= s.pieces.length - 2;
      expect(Math.abs((y ?? 0) - p.y), `${s.kind} at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).toBeLessThan(end ? 0.15 : 0.05);
    });
  });

  it('6a.2 a road passing under an overpass runs at least 5 m below its deck', () => {
    const island = new Island(new RAPIER.World({ x: 0, y: -9.81, z: 0 }));
    for (const s of island.structures.filter((q) => q.kind === 'overpass')) {
      const mid = s.pieces[Math.floor(s.pieces.length / 2)];
      if (!mid) throw new Error('an empty overpass');
      expect(mid.y - island.heightAt(mid.x, mid.z), `overpass at ${mid.x.toFixed(0)}, ${mid.z.toFixed(0)}`).toBeGreaterThan(5);
    }
  });

  it('6a.3 in the tunnel the floor carries the car and the hill\'s ground lies below it; the hill is whole above', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const island = new Island(world);
    const tunnel = island.structures.find((s) => s.kind === 'tunnel');
    expect(tunnel).toBeDefined();
    const pieces = tunnel?.pieces ?? [];
    pieces.forEach((p, k) => {
      island.sync(p.x, p.z, true);
      world.step();
      // (the first and last pieces reach out over their mouths, where the ground meets the floor: dug under them, the ground
      // fell away before the floor's edge, a dip that threw the cars going in and coming out)
      const end = k === 0 || k === pieces.length - 1;
      expect(island.heightAt(p.x, p.z), 'the ground under the floor').toBeLessThan(end ? p.y + 0.01 : p.y - 1);
      const y = down(world, p.x, p.y + 2, p.z);
      expect(Math.abs((y ?? 0) - p.y), `floor at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).toBeLessThan(0.05);
      // above the roof, the lid: a ray from over the hill meets the hill's surface, not the tunnel
      expect(down(world, p.x, p.y + 80, p.z) ?? 0, 'the lid').toBeGreaterThan(p.y + DECK.clear);
    });
  });

  it('6a.5 outside the tunnel\'s mouths the physics\' ground is the road the player sees: no trench before its floor', () => {
    const island = new Island(new RAPIER.World({ x: 0, y: -9.81, z: 0 }));
    const pieces = island.structures.find((s) => s.kind === 'tunnel')?.pieces ?? [];
    const first = pieces[0], last = pieces[pieces.length - 1];
    if (!first || !last) throw new Error('no tunnel');
    // out of each mouth along the highway, where a car drives up to the floor's first piece (the trench once reached 17 m out)
    for (const [p, sign] of [[first, -1], [last, 1]] as const) {
      const fx = Math.sin(p.yaw) * sign, fz = Math.cos(p.yaw) * sign;
      for (let k = 0.5; k <= 25; k += 1.5) {
        const x = p.x + fx * (p.length / 2 + k), z = p.z + fz * (p.length / 2 + k);
        expect(island.ground.surfaceHeight(x, z) - island.heightAt(x, z), `${k} m out of the mouth at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).toBeLessThan(0.01);
      }
    }
  });

  it('6a.6 the highway meets its tunnel and its decks on curves: no piece turns 1.5 % off the one before, no step or crease where each meets the ground', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const island = new Island(world);
    let worst = 0;
    for (const s of island.structures.filter((q) => q.kind !== 'overpass')) {
      s.pieces.forEach((p, k) => {
        const prev = s.pieces[k - 1];
        if (prev) worst = Math.max(worst, Math.abs(Math.tan(p.pitch) - Math.tan(prev.pitch)));
      });
      // along the highway's line through each end, a metre a step from 8 m in to 12 m out: the physics' top climbs or falls
      // by less than 10 cm a step (a mouth stood 0.44 m over the road before it) and its grade turns by 2 % a metre at most
      for (const [p, sign] of [[s.pieces[0], -1], [s.pieces[s.pieces.length - 1], 1]] as const) {
        if (!p) throw new Error('an empty structure');
        island.sync(p.x, p.z, true);
        world.step();
        const fx = Math.sin(p.yaw) * sign, fz = Math.cos(p.yaw) * sign, tops: number[] = [];
        for (let k = -8; k <= 12; k++) {
          const along = p.length / 2 + k, x = p.x + fx * along, z = p.z + fz * along;
          tops.push(down(world, x, p.y - Math.tan(p.pitch) * along * sign + 3, z) ?? NaN);
        }
        const where = `${s.kind} end at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`;
        for (let k = 1; k < tops.length; k++) {
          expect(Math.abs((tops[k] as number) - (tops[k - 1] as number)), where).toBeLessThan(0.1);
          if (k > 1) expect(Math.abs((tops[k] as number) - 2 * (tops[k - 1] as number) + (tops[k - 2] as number)), where).toBeLessThan(0.02);
        }
      }
    }
    expect(worst).toBeLessThan(0.015);
  });

  it('6a.7 the lighthouse road has a van\'s headroom under the bay bridge\'s ramp: it dips under it, and past its foot\'s curve the ramp runs on its straight line', () => {
    const island = new Island(new RAPIER.World({ x: 0, y: -9.81, z: 0 }));
    const bridge = island.structures.find((s) => s.kind === 'bridge')?.pieces ?? [];
    let under = 0, least = Infinity;
    island.network.graph.lanes.forEach((lane, li) => {
      if (island.network.laneRoad[li] !== 'lighthouse-road') return;
      for (const q of lane.points) for (const p of bridge) {
        const dx = q.x - p.x, dz = q.z - p.z, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), along = dx * fx + dz * fz;
        if (Math.abs(along) > p.length / 2 || Math.abs(dx * fz - dz * fx) > DECK.half) continue;
        under++;
        least = Math.min(least, p.y + Math.tan(p.pitch) * along - DECK.depth - (q.y ?? 0));
      }
    });
    expect(under).toBeGreaterThan(4);
    // (1.66 m at its lowest before it dipped: over the lane nearest the abutment at the deck's edge; now down to 1 m over
    // the sea there)
    expect(least).toBeGreaterThan(2.6);
  });

  it('6a.8 the tunnel\'s lid lies where the hill is drawn, past its trench\'s edge: along the serpentine over it, the wheels\' ground within 5 cm of the road', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const island = new Island(world), g = island.ground;
    const pieces = island.structures.find((s) => s.kind === 'tunnel')?.pieces ?? [];
    let checked = 0, worst = 0, sx = Infinity, sz = Infinity, at = '';
    island.network.graph.lanes.forEach((lane, li) => {
      if (island.network.laneRoad[li] !== 'serpentine') return;
      for (let k = 0; k + 1 < lane.points.length; k++) {
        const a = lane.points[k] as { x: number; z: number }, b = lane.points[k + 1] as { x: number; z: number }, n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
        for (let i = 0; i < n; i++) {
          const x = a.x + ((b.x - a.x) * i) / n, z = a.z + ((b.z - a.z) * i) / n;
          // over the lid: within 26 m of the tunnel's line, its trench (23 m) and the old lid's edge (24 m) where the ditch was
          if (!pieces.some((p) => { const dx = x - p.x, dz = z - p.z, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw); return Math.abs(dx * fx + dz * fz) <= p.length / 2 && Math.abs(dx * fz - dz * fx) < 26; })) continue;
          if (Math.hypot(x - sx, z - sz) > 60) { island.sync(x, z, true); world.step(); sx = x; sz = z; }
          const s = g.surfaceHeight(x, z), top = down(world, x, s + 2, z);
          if (Math.abs((top ?? -99) - s) > worst) { worst = Math.abs((top ?? -99) - s); at = `${x.toFixed(1)}, ${z.toFixed(1)}: ${((top ?? -99) - s).toFixed(3)}`; }
          checked++;
        }
      }
    });
    expect(checked).toBeGreaterThan(200);
    expect(worst, at).toBeLessThan(0.05);
  });

  it('6a.9 over an overpass the ground is the road beneath\'s: across each passing road\'s carriageway under the deck, level with its middle', () => {
    const island = new Island(new RAPIER.World({ x: 0, y: -9.81, z: 0 })), g = island.ground;
    const decks = island.structures.filter((s) => s.kind === 'overpass').flatMap((s) => s.pieces);
    let checked = 0, worst = 0;
    for (const r of g.roads) {
      if (r.cls === 'highway') continue;
      const hw = HALF_WIDTH[r.cls];
      r.pts.forEach((p, k) => {
        if (!decks.some((d) => Math.hypot(d.x - p[0], d.z - p[1]) < 8)) return;
        const q = r.pts[Math.min(r.pts.length - 1, k + 1)] as [number, number], o = r.pts[Math.max(0, k - 1)] as [number, number];
        const tx = q[0] - o[0], tz = q[1] - o[1], l = Math.hypot(tx, tz) || 1, mid = g.surfaceHeight(p[0], p[1]);
        for (const f of [-1, -0.5, 0.5, 1]) {
          worst = Math.max(worst, Math.abs(g.surfaceHeight(p[0] - (tz / l) * hw * f, p[1] + (tx / l) * hw * f) - mid));
          checked++;
        }
      });
    }
    expect(checked).toBeGreaterThan(20);
    // (the quay's sweep rose 2.2 m across under the south overpass: the highway's bank over its outer lane)
    expect(worst).toBeLessThan(0.1);
  });

  it('6a.10 at each of the tunnel\'s mouths the wheels\' ground is the road the player sees across the whole carriageway (the west one\'s sides stood 0.24 m off it)', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const island = new Island(world), g = island.ground;
    const pieces = island.structures.find((s) => s.kind === 'tunnel')?.pieces ?? [];
    let worst = 0, at = '';
    for (const [p, sign] of [[pieces[0], -1], [pieces[pieces.length - 1], 1]] as const) {
      if (!p) throw new Error('no tunnel');
      island.sync(p.x, p.z, true);
      world.step();
      // across the carriageway on each side of the mouth's line (the floor's end), 0.3 m in and 0.3 m out
      const fx = Math.sin(p.yaw) * sign, fz = Math.cos(p.yaw) * sign, rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
      for (const along of [p.length / 2 - 0.3, p.length / 2 + 0.3]) for (let o = -18; o <= 18; o += 2) {
        const x = p.x + fx * along + rx * o, z = p.z + fz * along + rz * o, s = g.surfaceHeight(x, z), miss = Math.abs((down(world, x, s + 3, z) ?? -99) - s);
        if (miss > worst) { worst = miss; at = `${x.toFixed(0)}, ${z.toFixed(0)}`; }
      }
    }
    expect(worst, at).toBeLessThan(0.05);
  });

  // 6a.4 (a car across the viaduct and the bay bridge) is a long pin: drive.long.test.ts
});
