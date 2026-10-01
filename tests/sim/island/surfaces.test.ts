/** M8.10 slice 6b: the roads' surfaces, the junctions, the pavements and the paint (docs/M8.10_PLAN.md). */
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { PALETTE, initPhysics } from '../../../src/sim';
import { CHUNK, CHUNKS_X, CHUNKS_Z, CHUNK_X0, CHUNK_Z0, Island, PLUMB_TILT } from '../../../src/sim/island/Island';
import { HALF_WIDTH } from '../../../src/sim/island/ground';
import { KERB, PAINT_LIFT, PAVEMENT, ROAD_LIFT, fanFaces, heightOn, onStrip, surfaceChunk, surfaceIndex, type RimPoint, type Strip } from '../../../src/sim/island/surfaces';
import { GroundView } from '../../../src/render/island/GroundView';

describe('M8.10 slice 6b: the roads\' surfaces', () => {
  let island: Island, world: RAPIER.World;
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => { await initPhysics(); world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); island = new Island(world); }, 60_000);

  it('6.1 a strip lies on the ground: 4 cm over it at its points, within 10 cm between them (all but a few in a thousand)', () => {
    const g = island.ground, p = { x: 0, y: 0, z: 0 };
    let checked = 0, worst = 0, under = 0, off = 0;
    for (const st of island.surfaces.strips) for (let k = 0; k + 1 < st.s.length; k++) {
      if (!st.drawn[k]) continue;
      for (const t of [0, 0.5]) for (const f of [-1, -0.5, 0, 0.5, 1]) {
        const s = (st.s[k] as number) + t * ((st.s[k + 1] as number) - (st.s[k] as number));
        onStrip(st, s, f * st.hw, p);
        const h = g.surfaceHeight(p.x, p.z);
        // (the tunnel's dug ground is under its own floor)
        if (Math.abs(g.height(p.x, p.z) - h) > 0.01) continue;
        const over = p.y - h;
        // its points across each section
        if (t === 0) expect(Math.abs(over - ROAD_LIFT), `${st.id} at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).toBeLessThan(1e-4);
        worst = Math.max(worst, Math.abs(over));
        if (over < 0) under++;
        // between them the ground may bend within a span (where two roads meet it eases over a few metres)
        if (over < -0.1 || over > 0.1 + ROAD_LIFT) off++;
        checked++;
      }
    }
    console.log(`6.1 ${checked} points, the most off ${worst.toFixed(2)} m, ${under} under, ${off} more than 10 cm off`);
    expect(checked).toBeGreaterThan(40000);
    expect(off / checked).toBeLessThan(0.002);
    expect(under / checked).toBeLessThan(0.01);
  });

  it('6.2 each junction\'s rim meets its arms\' strips where their drawn stretches end', () => {
    const { junctions, strips } = island.surfaces;
    console.log(`6.2 ${junctions.length} junctions of ${island.network.graph.nodes.length} nodes`);
    expect(junctions.length).toBeGreaterThan(100);
    // (an arm's section's points; the kerbs' between them are the junction's own)
    for (const j of junctions) for (const r of j.rim) {
      if (r.strip < 0) continue;
      const st = strips[r.strip] as Strip, k = st.s.indexOf(r.s);
      expect(k, `${st.id}`).toBeGreaterThanOrEqual(0);
      // a drawn segment starts or ends there
      expect(st.drawn[k] === true || st.drawn[k - 1] === true, `${st.id} at ${r.x.toFixed(0)}, ${r.z.toFixed(0)}`).toBe(true);
      const on = k < st.s.length - 1 ? heightOn(st, k, 0, r.o) : heightOn(st, k - 1, 1, r.o);
      expect(Math.abs(on - r.y)).toBeLessThan(0.01);
    }
  });

  it('6.3 the paint lies on the strips, inside the carriageways, and every kind is there', () => {
    const { paint, strips, parking } = island.surfaces;
    const count: Record<string, number> = {};
    let centre = 0;
    for (const q of paint) {
      const st = strips[q.strip] as Strip, mid = q.s.reduce((a, b) => a + b, 0) / 4;
      count[q.kind] = (count[q.kind] ?? 0) + 1;
      for (let i = 0; i < 4; i++) {
        const s = q.s[i] as number, o = q.o[i] as number;
        expect(Math.abs(o), `${q.kind} on ${st.id}`).toBeLessThanOrEqual(st.hw + 1e-6);
        // the segment under the corner (at a section, the one toward the quad's middle)
        const after = st.s.findIndex((v) => v > s);
        let k = after < 0 ? st.s.length - 2 : Math.max(0, after - 1);
        if (k > 0 && st.s[k] === s && mid < s) k--;
        k = Math.min(k, st.drawn.length - 1);
        expect(st.drawn[k], `${q.kind} on ${st.id} at ${s.toFixed(1)}`).toBe(true);
        const t = ((s - (st.s[k] as number)) / ((st.s[k + 1] as number) - (st.s[k] as number)));
        const over = (q.y[i] as number) - heightOn(st, k, Math.max(0, Math.min(1, t)), o);
        expect(over).toBeGreaterThan(PAINT_LIFT - 1e-3);
        expect(over).toBeLessThan(PAINT_LIFT + 0.01);
      }
      if (q.kind === 'centre') centre += Math.abs((q.s[1] as number) - (q.s[0] as number));
    }
    console.log('6.3', JSON.stringify(count), `centre ${(centre / 1000).toFixed(1)} km, ${parking.length} bays`);
    expect(count.stop ?? 0).toBeGreaterThan(100);
    expect(count.zebra ?? 0).toBeGreaterThan(300);
    expect(count.arrow ?? 0).toBeGreaterThan(100);
    expect(count.edge ?? 0).toBeGreaterThan(200);
    expect(count.lane ?? 0).toBeGreaterThan(300);
    expect(centre).toBeGreaterThan(15000);
    expect(parking.length).toBeGreaterThan(150);
  });

  it('6.4 a chunk\'s ground and roads\' surfaces together under 12,000 triangles', () => {
    const view = new GroundView(island);
    let most = 0, surfaces = 0;
    for (const [k, c] of island.surfaceMeshes()) {
      const tris = c.colors.length + view.build(k % CHUNKS_X, Math.floor(k / CHUNKS_X)).triangles;
      most = Math.max(most, tris);
      surfaces = Math.max(surfaces, c.colors.length);
    }
    console.log(`6.4 the most a chunk ${most}, its surfaces' most ${surfaces}`);
    // (the junctions' corners, their kerbs and pavements and the paint laid on the road took Crown's densest chunk from
    // 9.9k to 11k: "Pierdol te trójkąty", Marcin, 2026-09-28; the frame's budget is the gate's)
    expect(most).toBeLessThan(12000);
  });

  it('6.5 a junction\'s box is its widest road\'s surface, and a pavement\'s kerb carries a wheel 14 cm over the road', () => {
    const g = island.ground, { junctions, strips } = island.surfaces;
    let checked = 0;
    for (const fan of junctions) {
      // at its node (the fan's middle is where its fan folds least, a few metres off it)
      const j = island.network.graph.nodes.reduce((a, b) => (Math.hypot(b.x - fan.x, b.z - fan.z) < Math.hypot(a.x - fan.x, a.z - fan.z) ? b : a));
      // (by the highway its surface holds sway past its own edge)
      if (g.highwayAt(j.x, j.z) !== null || g.roads.some((r) => r.cls === 'highway' && r.pts.some((q) => Math.hypot(q[0] - j.x, q[1] - j.z) < 40))) continue;
      const arms = [...new Set(fan.rim.map((r) => r.strip))].filter((i) => i >= 0).map((i) => strips[i] as Strip);
      const widest = Math.max(...arms.map((s) => s.hw)), top = arms.filter((s) => s.hw === widest);
      if (top.length !== 1) continue;
      const road = g.roads[(top[0] as Strip).road];
      if (!road) continue;
      // across the widest's carriageway at the node: its own profile, no other road's
      const n = road.pts.length;
      let bi = 0, bd = Infinity;
      road.pts.forEach((q, i) => { const d = Math.hypot(q[0] - j.x, q[1] - j.z); if (d < bd) { bd = d; bi = i; } });
      const a = road.pts[Math.max(0, bi - 1)] as [number, number], b = road.pts[Math.min(n - 1, bi + 1)] as [number, number];
      const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1, hw = HALF_WIDTH[road.cls];
      for (const f of [-0.9, -0.5, 0, 0.5, 0.9]) {
        const x = (road.pts[bi] as [number, number])[0] - (tz / l) * f * hw, z = (road.pts[bi] as [number, number])[1] + (tx / l) * f * hw;
        // the profile's height at the nearest point of that road
        let ph = Infinity, pd = Infinity;
        for (let i = 0; i + 1 < n; i++) {
          const p0 = road.pts[i] as [number, number], p1 = road.pts[i + 1] as [number, number], dx = p1[0] - p0[0], dz = p1[1] - p0[1];
          const t = Math.max(0, Math.min(1, ((x - p0[0]) * dx + (z - p0[1]) * dz) / (dx * dx + dz * dz || 1)));
          const d = Math.hypot(x - p0[0] - dx * t, z - p0[1] - dz * t);
          if (d < pd) { pd = d; ph = (road.h[i] as number) + ((road.h[i + 1] as number) - (road.h[i] as number)) * t; }
        }
        expect(Math.abs(g.surfaceHeight(x, z) - ph), `${road.id} at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeLessThan(0.05);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
    // a ray down onto a pavement lands on its kerb's top, 14 cm over the road's edge beside it
    const [ck, pieces] = [...island.surfaces.kerbs.entries()].sort((a, b) => b[1].length - a[1].length)[0] as [number, Array<{ x: number; y: number; z: number; yaw: number }>];
    island.sync(CHUNK_X0 + ((ck % CHUNKS_X) + 0.5) * CHUNK, CHUNK_Z0 + (Math.floor(ck / CHUNKS_X) + 0.5) * CHUNK, true);
    world.step();
    const down = (x: number, top: number, z: number): number | null => {
      const hit = world.castRay(new RAPIER.Ray({ x, y: top, z }, { x: PLUMB_TILT, y: -1, z: PLUMB_TILT }), 20, true);
      return hit ? top - hit.timeOfImpact : null;
    };
    expect(pieces.length).toBeGreaterThan(20);
    for (const p of pieces.slice(0, 40)) {
      expect(Math.abs((down(p.x, p.y + 5, p.z) ?? -99) - p.y), `a kerb at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).toBeLessThan(0.03);
    }
    expect(KERB).toBe(0.14);
  });

  it('6.6 a foot\'s height read from the kerbs\' cells is every kerb piece\'s: on the pavements, across their edges, off them', () => {
    const all = [...island.surfaces.kerbs.values()].flat();
    // every piece's highest top at a point, the slow way
    const slow = (x: number, z: number): number => {
      let top = -Infinity;
      for (const p of all) {
        const dx = x - p.x, dz = z - p.z, s = Math.sin(p.yaw), c = Math.cos(p.yaw), along = dx * s + dz * c, across = dx * c - dz * s;
        if (Math.abs(across) <= PAVEMENT / 2 && Math.abs(along) <= p.length / 2 + 0.2) top = Math.max(top, p.y + Math.tan(p.pitch) * along);
      }
      return Number.isFinite(top) ? top : island.ground.surfaceHeight(x, z);
    };
    let checked = 0;
    for (let k = 0; k < all.length; k += Math.max(1, Math.floor(all.length / 400))) {
      const p = all[k] as (typeof all)[number], s = Math.sin(p.yaw), c = Math.cos(p.yaw);
      for (const [along, across] of [[0, 0], [p.length / 2, PAVEMENT / 2 - 0.05], [-p.length / 2 - 0.1, -PAVEMENT / 2 + 0.05], [0, PAVEMENT / 2 + 0.3], [p.length / 3, -PAVEMENT]] as const) {
        const x = p.x + s * along + c * across, z = p.z + c * along - s * across;
        expect(island.standAt(x, z), `at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBeCloseTo(slow(x, z), 4);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1500);
  });

  it("18.4 a chunk's far level is its first triangles: the strips, the junctions, the skirts, the pavements' tops; the kerbs' faces and the paint after it", () => {
    const paint = new Set(island.surfaces.paint.map((p) => p.colour));
    let far = 0, all = 0, wrong = 0;
    for (const c of island.surfaceMeshes().values()) {
      expect(c.far).toBeGreaterThanOrEqual(0);
      expect(c.far).toBeLessThanOrEqual(c.colors.length);
      c.colors.forEach((colour, t) => { if ((colour === PALETTE.kerb || paint.has(colour)) !== t >= c.far) wrong++; });
      far += c.far;
      all += c.colors.length;
    }
    console.log(`18.4 the far level ${far} of ${all} triangles`);
    expect(wrong).toBe(0);
    expect(far / all).toBeLessThan(0.6);
  });

  it("18.5 a chunk's surfaces made alone are the chunk's made with the island's: its triangles in their order, its far level", () => {
    const chunkOf = (x: number, z: number): number => Island.chunkIndex(...Island.chunkOf(x, z));
    const all = island.surfaceMeshes(), index = surfaceIndex(island.surfaces, chunkOf);
    for (let k = 0; k < CHUNKS_X * CHUNKS_Z; k++) {
      const alone = surfaceChunk(island.surfaces, index, k, chunkOf), whole = all.get(k) ?? null;
      expect(alone === null, `chunk ${k}`).toBe(whole === null);
      if (!alone || !whole) continue;
      expect(alone.far, `chunk ${k}`).toBe(whole.far);
      expect(alone.colors, `chunk ${k}`).toEqual(whole.colors);
      expect(alone.positions, `chunk ${k}`).toEqual(whole.positions);
    }
  });

  it("6.7 the wheels ride on a junction as it is drawn: at its fan's faces' middles the physics' top is never 5 cm under it (between the height field's points a car sank up to 0.3 m into the steep crossings' asphalt)", () => {
    let faces = 0, worst = 0, at = '', sx = Infinity, sz = Infinity;
    for (const j of island.surfaces.junctions) {
      fanFaces(j, (ax, ay, az, bx, by, bz, cx, cy, cz) => {
        const x = (ax + bx + cx) / 3, y = (ay + by + cy) / 3 - ROAD_LIFT, z = (az + bz + cz) / 3;
        if (Math.hypot(x - sx, z - sz) > 60) { island.sync(x, z, true); world.step(); sx = x; sz = z; }
        const hit = world.castRay(new RAPIER.Ray({ x, y: y + 1, z }, { x: PLUMB_TILT, y: -1, z: PLUMB_TILT }), 3, true);
        const under = y - (hit ? y + 1 - hit.timeOfImpact : -Infinity);
        faces++;
        if (under > worst) { worst = under; at = `${x.toFixed(0)}, ${z.toFixed(0)}`; }
      });
    }
    expect(faces).toBeGreaterThan(5000);
    expect(worst, at).toBeLessThan(0.05);
  });

  it("6.8 a junction's box ends where its corners' curves do, and the pavements go round its corners (Marcin's stills, 2026-09-28: 15-50 m of bare asphalt, the corners cut across with the grass in them, the pavements stopped short)", () => {
    const { junctions, strips } = island.surfaces;
    const paved = new Set(['avenue', 'street', 'side']);
    let square = 0, worst = 0, corners = 0, round = 0;
    for (const j of junctions) {
      const n = j.rim.length;
      // the arms by their sections' middles, round the junction
      const arms = j.rim.filter((r) => r.strip >= 0 && r.o === 0).map((r) => ({ r, a: Math.atan2(r.z - j.z, r.x - j.x), hw: (strips[r.strip] as Strip).hw, cls: (strips[r.strip] as Strip).cls }));
      arms.sort((a, b) => a.a - b.a);
      const gaps = arms.map((a, i) => { let g = (arms[(i + 1) % arms.length] as (typeof arms)[number]).a - a.a; if (g <= 0) g += 2 * Math.PI; return (g * 180) / Math.PI; });
      // a crossing of four of the town's streets at right angles: each arm's strip starts within the widest other's half
      // width, the curve's 6 m and two (its start past the curve, the middle a metre or two off the node)
      if (arms.length === 4 && arms.every((a) => a.cls === 'street' || a.cls === 'side') && gaps.every((g) => g > 80 && g < 100)) {
        for (const a of arms) {
          const reach = Math.hypot(a.r.x - j.x, a.r.z - j.z) - Math.max(...arms.filter((b) => b !== a).map((b) => b.hw));
          worst = Math.max(worst, reach);
          square++;
        }
      }
      // every corner of two of the town's roads at 60–120°: its pavement goes round it
      for (const side of j.sides) {
        const a = j.rim[side.from] as RimPoint, b = j.rim[side.to] as RimPoint;
        if (a.strip < 0 || b.strip < 0 || !paved.has((strips[a.strip] as Strip).cls) || !paved.has((strips[b.strip] as Strip).cls)) continue;
        const ma = j.rim[(side.from - 2 + n) % n] as RimPoint, mb = j.rim[(side.to + 2) % n] as RimPoint;
        let gap = Math.atan2(mb.z - j.z, mb.x - j.x) - Math.atan2(ma.z - j.z, ma.x - j.x);
        if (gap <= 0) gap += 2 * Math.PI;
        if (gap < Math.PI / 3 || gap > (2 * Math.PI) / 3) continue;
        corners++;
        if (side.outer.length > 0 && side.q.length === 3) round++;
      }
    }
    console.log(`6.8 ${square} square arms, the furthest start ${worst.toFixed(1)} m past the other's half width; ${round} of ${corners} corners paved round`);
    expect(square).toBeGreaterThan(40);
    expect(worst).toBeLessThan(9);
    expect(corners).toBeGreaterThan(200);
    expect(round / corners).toBeGreaterThan(0.9);
  });

  it("6.9 the paint lies on the road over a crest: no quad's middle nor its edges' under the strip (laid flat, a zebra's stripes sank under Crown's crests but for their ends)", () => {
    const { paint, strips } = island.surfaces, p = { x: 0, y: 0, z: 0 };
    let worst = Infinity, at = '';
    for (const q of paint) {
      const st = strips[q.strip] as Strip;
      // the drawn quad is its triangles (a, b, c) and (a, c, d): the diagonal's middle and the edges' middles
      for (const [i, k] of [[0, 2], [0, 1], [1, 2], [2, 3], [3, 0]] as const) {
        const over = ((q.y[i] as number) + (q.y[k] as number)) / 2 - onStrip(st, ((q.s[i] as number) + (q.s[k] as number)) / 2, ((q.o[i] as number) + (q.o[k] as number)) / 2, p).y;
        if (over < worst) { worst = over; at = `${q.kind} on ${st.id} at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`; }
      }
    }
    console.log(`6.9 the paint ${(worst * 1000).toFixed(1)} mm over the road at the least (${at})`);
    expect(worst, at).toBeGreaterThan(0);
  });

  it("6.10 the view's ground stays under a junction's asphalt (the grass drew through Crown's crossings: Marcin's still, 2026-09-28)", () => {
    const view = new GroundView(island), cell = 2;
    // the fans' faces' middles and their edges' middles by chunk, with the fan's height there
    const samples = new Map<number, number[]>();
    for (const j of island.surfaces.junctions) fanFaces(j, (ax, ay, az, bx, by, bz, cx, cy, cz) => {
      for (const [x, y, z] of [[(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3], [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2], [(bx + cx) / 2, (by + cy) / 2, (bz + cz) / 2]] as const) {
        const k = Island.chunkIndex(...Island.chunkOf(x, z));
        let list = samples.get(k);
        if (!list) { list = []; samples.set(k, list); }
        list.push(x, y, z);
      }
    });
    let checked = 0, worst = -Infinity, at = '';
    for (const [k, list] of samples) {
      const i = k % CHUNKS_X, jj = Math.floor(k / CHUNKS_X), x0 = CHUNK_X0 + i * CHUNK, z0 = CHUNK_Z0 + jj * CHUNK, side = Math.ceil(CHUNK / cell);
      const mesh = view.build(i, jj), pos = mesh.positions, cells = new Map<number, number[]>();
      for (let t = 0; t < mesh.triangles; t++) {
        const o = t * 9;
        const tx0 = Math.min(pos[o] as number, pos[o + 3] as number, pos[o + 6] as number), tx1 = Math.max(pos[o] as number, pos[o + 3] as number, pos[o + 6] as number);
        const tz0 = Math.min(pos[o + 2] as number, pos[o + 5] as number, pos[o + 8] as number), tz1 = Math.max(pos[o + 2] as number, pos[o + 5] as number, pos[o + 8] as number);
        for (let a = Math.max(0, Math.floor((tx0 - x0) / cell)); a <= Math.min(side - 1, Math.floor((tx1 - x0) / cell)); a++) {
          for (let b = Math.max(0, Math.floor((tz0 - z0) / cell)); b <= Math.min(side - 1, Math.floor((tz1 - z0) / cell)); b++) {
            let c = cells.get(b * side + a);
            if (!c) { c = []; cells.set(b * side + a, c); }
            c.push(o);
          }
        }
      }
      for (let n = 0; n < list.length; n += 3) {
        const x = list[n] as number, y = list[n + 1] as number, z = list[n + 2] as number;
        let top = -Infinity;
        for (const o of cells.get(Math.floor((z - z0) / cell) * side + Math.floor((x - x0) / cell)) ?? []) {
          const x1 = pos[o] as number, z1 = pos[o + 2] as number, x2 = pos[o + 3] as number, z2 = pos[o + 5] as number, x3 = pos[o + 6] as number, z3 = pos[o + 8] as number;
          const d = (z2 - z3) * (x1 - x3) + (x3 - x2) * (z1 - z3);
          if (Math.abs(d) < 1e-9) continue;
          const l1 = ((z2 - z3) * (x - x3) + (x3 - x2) * (z - z3)) / d, l2 = ((z3 - z1) * (x - x3) + (x1 - x3) * (z - z3)) / d, l3 = 1 - l1 - l2;
          if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
          top = Math.max(top, l1 * (pos[o + 1] as number) + l2 * (pos[o + 4] as number) + l3 * (pos[o + 7] as number));
        }
        if (!Number.isFinite(top)) continue;
        checked++;
        if (top - y > worst) { worst = top - y; at = `${x.toFixed(0)}, ${z.toFixed(0)}`; }
      }
    }
    console.log(`6.10 ${checked} points of the fans, the ground ${worst.toFixed(3)} m over them at the most (${at})`);
    expect(checked).toBeGreaterThan(20000);
    expect(worst, at).toBeLessThan(0);
  });
});
