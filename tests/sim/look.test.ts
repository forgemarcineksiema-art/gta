import RAPIER from '@dimforge/rapier3d-compat';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../../src/sim';
import { AVENUE_LANDMARKS, City, chunkCoord, cityFootprints, districtAt } from '../../src/sim/city/City';
import { DROP_OFF_LOTS, dropOffFor, hideoutSign } from '../../src/sim/city/cover';
import { buildRoadMarkings } from '../../src/sim/city/markings';
import { BLOCK, CITY_HALF, HIGHWAY_HALF, ROAD_HALF, SPECIAL_ROADS, buildRoadGraph } from '../../src/sim/city/roads';
import type { StaticDesc } from '../../src/sim/scene';

/** FNV-1a over a string: the layout's fingerprint. */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

/**
 * The city's layout at a seed without its heights and colours: every collider's footprint (the buildings' and
 * the kerbs'), every billboard and every coin, chunk by chunk.
 */
function layout(city: City): number {
  const parts: string[] = [];
  const f = (v: number): string => v.toFixed(3);
  for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
    const chunk = city.generate(cx, cz);
    for (const st of chunk.statics) {
      if (st.tag !== 'building' && st.tag !== 'kerb') continue;
      const s = st.shape;
      if (s.kind === 'prism') parts.push(`p${s.points.map((pt) => `${f(pt.x)},${f(pt.z)}`).join(';')}`);
      else if (s.kind === 'box') parts.push(`b${f(st.position.x)},${f(st.position.z)},${f(s.hx)},${f(s.hz)},${st.rotation.y.toFixed(5)},${st.rotation.w.toFixed(5)}`);
      else parts.push(`${s.kind}${f(st.position.x)},${f(st.position.z)}`);
    }
    for (const b of chunk.billboards) parts.push(`B${b.id},${f(b.x)},${f(b.z)},${b.yaw.toFixed(4)}`);
    for (const c of chunk.coins) parts.push(`C${f(c.x)},${f(c.z)}`);
  }
  return fnv(parts.join('|'));
}

const yawOf = (st: StaticDesc): number => 2 * Math.atan2(st.rotation.y, st.rotation.w);

/** A face static's outward normal in the world (the renderer's rotation about +Y). */
function faceNormal(st: StaticDesc): { x: number; z: number } | null {
  const f = st.face;
  if (!f || f === 'top' || f === 'bottom') return null;
  const lx = f === 'x+' ? 1 : f === 'x-' ? -1 : 0, lz = f === 'z+' ? 1 : f === 'z-' ? -1 : 0;
  const yaw = yawOf(st), c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: c * lx + s * lz, z: -s * lx + c * lz };
}

/** Where a segment from `a` to `b` enters a static's volume, or false (boxes by their yaw, the rest by their bounds). */
function blocks(st: StaticDesc, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): boolean {
  const s = st.shape, p = st.position;
  let hx: number, hy: number, hz: number, yaw = 0;
  if ((s.kind === 'box' || s.kind === 'gable') && st.rotation.x === 0 && st.rotation.z === 0) { hx = s.hx; hy = s.hy; hz = s.hz; yaw = yawOf(st); }
  else if (s.kind === 'box' || s.kind === 'gable') { hx = hy = hz = Math.hypot(s.hx, s.hy, s.hz); }
  else if (s.kind === 'cylinder') { hx = hz = s.radius; hy = s.halfHeight; }
  else if (s.kind === 'prism') {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const pt of s.points) { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); minZ = Math.min(minZ, pt.z); maxZ = Math.max(maxZ, pt.z); }
    return slab({ x: a.x - (minX + maxX) / 2, y: a.y - (s.y0 + s.y1) / 2, z: a.z - (minZ + maxZ) / 2 }, { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, (maxX - minX) / 2, (s.y1 - s.y0) / 2, (maxZ - minZ) / 2);
  } else return false;
  // into the static's frame: undo the yaw (local +Z is (sin yaw, cos yaw))
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const local = (x: number, z: number): { x: number; z: number } => ({ x: c * x - sn * z, z: sn * x + c * z });
  const o = local(a.x - p.x, a.z - p.z), d = local(b.x - a.x, b.z - a.z);
  return slab({ x: o.x, y: a.y - p.y, z: o.z }, { x: d.x, y: b.y - a.y, z: d.z }, hx, hy, hz);
}

/** Segment o + t d (t in 0..1) against the box |x| < hx, |y| < hy, |z| < hz. */
function slab(o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number }, hx: number, hy: number, hz: number): boolean {
  let t0 = 0, t1 = 1;
  for (const [oo, dd, h] of [[o.x, d.x, hx], [o.y, d.y, hy], [o.z, d.z, hz]] as const) {
    if (Math.abs(dd) < 1e-12) { if (Math.abs(oo) >= h) return false; continue; }
    let ta = (-h - oo) / dd, tb = (h - oo) / dd;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 >= t1) return false;
  }
  return true;
}

describe('the city\'s look and the big map (M7 slices 11–12)', () => {
  let world: RAPIER.World, city: City;
  beforeAll(async () => { await initPhysics(); world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); city = new City(world, 42); });
  afterAll(() => world.free());
  const frontageRoads = SPECIAL_ROADS.filter((r) => r.kind !== 'service');

  it('M7 11.1 the same city at seed 42 otherwise; every avenue has one landmark and its corner lots are shops on both streets', () => {
    // every collider footprint, billboard and coin where it was before the slice
    expect(layout(city)).toBe(2338173748);
    expect(frontageRoads).toHaveLength(4);
    const signs: StaticDesc[] = [];
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) signs.push(...city.generate(cx, cz).statics.filter((st) => st.tag === 'sign'));
    for (const road of frontageRoads) {
      const lots = city.frontage(road);
      const landmarks = lots.filter((l) => l.landmark);
      expect(landmarks, road.name).toHaveLength(1);
      const lm = landmarks[0]!;
      expect(AVENUE_LANDMARKS[road.name]).toBeDefined();
      // its roof sign stands on its lot, in its own colour
      const own = signs.filter((st) => Math.hypot(st.position.x - lm.px, st.position.z - lm.pz) < Math.max(lm.width, lm.depth) + 1);
      expect(own, road.name).toHaveLength(1);
      expect(own[0]?.color).toBe(AVENUE_LANDMARKS[road.name]?.sign);
      // the corners: the first and the last lot of each side
      // the chunk that emits a lot: its segment's
      const emitter = (segment: number) => {
        const a = road.centre[segment]!, b = road.centre[segment + 1]!;
        return city.generate(chunkCoord((a.x + b.x) / 2), chunkCoord((a.z + b.z) / 2));
      };
      expect(lots.filter((l) => l.turn !== 0), road.name).toHaveLength(4);
      for (const side of [1, -1]) {
        const row = lots.filter((l) => l.side === side);
        expect(row.length, `${road.name} ${side}`).toBeGreaterThanOrEqual(2);
        for (const [lot, node] of [[row[0]!, road.centre[0]!], [row[row.length - 1]!, road.centre[road.centre.length - 1]!]] as const) {
          expect(lot.turn).not.toBe(0);
          expect(lot.landmark).toBe(false);
          // the turned face looks toward its junction
          const toward = { x: Math.cos(lot.yaw) * lot.turn, z: -Math.sin(lot.yaw) * lot.turn };
          expect(toward.x * (node.x - lot.px) + toward.z * (node.z - lot.pz)).toBeGreaterThan(0);
          // and has a shop's ground floor, as the face on the road does: a bay over 3 m wide on each
          const bays = emitter(lot.segment).statics.filter((st) => st.tag === 'glazing' && st.position.y < 3.5 && st.shape.kind === 'box'
            && Math.max(st.shape.hx, st.shape.hz) > 1.5 && Math.hypot(st.position.x - lot.px, st.position.z - lot.pz) < Math.hypot(lot.width, lot.depth) + 1);
          const facing = (dir: { x: number; z: number }): number => bays.filter((st) => { const n = faceNormal(st); return n !== null && n.x * dir.x + n.z * dir.z > 0.99; }).length;
          expect(facing(toward), `${road.name} corner at ${lot.along.toFixed(0)}`).toBeGreaterThan(0);
          expect(facing({ x: -Math.sin(lot.yaw), z: -Math.cos(lot.yaw) })).toBeGreaterThan(0);
        }
      }
      // a lot in the middle of a row keeps its blank party walls: no bay looks along the road
      const plain = lots.find((l) => l.turn === 0 && !l.landmark)!;
      const along = { x: Math.cos(plain.yaw), z: -Math.sin(plain.yaw) };
      const sideBays = emitter(plain.segment).statics.filter((st) => st.tag === 'glazing' && st.position.y < 3.5 && st.shape.kind === 'box' && Math.max(st.shape.hx, st.shape.hz) > 1.5
        && Math.hypot(st.position.x - plain.px, st.position.z - plain.pz) < Math.hypot(plain.width, plain.depth) + 1
        && Math.abs((faceNormal(st)?.x ?? 0) * along.x + (faceNormal(st)?.z ?? 0) * along.z) > 0.99);
      expect(sideBays, road.name).toHaveLength(0);
    }
  });

  it('M7 11.2 the parkway gives way within 5 m of its merge at both junctions, where no stop line stands', () => {
    const plan = buildRoadMarkings(buildRoadGraph(), districtAt);
    const parkway = plan.approaches.filter((a) => a.road === 'Garden Parkway');
    expect(parkway).toHaveLength(2);
    const lines = [...plan.chunks.values()].flat().filter((m) => m.tag === 'paint-giveway');
    const road = SPECIAL_ROADS.find((r) => r.name === 'Garden Parkway')!;
    for (const a of parkway) {
      expect(a.stop).toBeNull();
      expect(a.merge).not.toBeNull();
      expect(a.giveWay).not.toBeNull();
      expect(a.giveWay! - a.merge!).toBeGreaterThanOrEqual(0);
      expect(a.giveWay! - a.merge!).toBeLessThanOrEqual(5);
      // its dashes stand where it says, across the approach half, a whole double row
      const node = a.end ? road.centre[road.centre.length - 1]! : road.centre[0]!;
      const near = lines.filter((m) => Math.hypot(m.position.x - node.x, m.position.z - node.z) < a.giveWay! + 12 && Math.hypot(m.position.x - node.x, m.position.z - node.z) > a.giveWay! - 30);
      expect(near.length).toBeGreaterThanOrEqual(16);
      expect(near.length % 2).toBe(0);
    }
    expect(lines.filter((m) => m.color !== 0xd4d0bf && m.color !== 0x9e9b94)).toHaveLength(0);
  });

  it('M7 12.1 the big map\'s footprints: parks and blocks inside the island, the shallows outside the shore, no block on a road', () => {
    const fp = cityFootprints(city);
    expect(fp.blocks.length).toBeGreaterThan(100);
    expect(fp.parks.length).toBeGreaterThan(20);
    expect(fp.water.length).toBeGreaterThan(0);
    for (const r of [...fp.blocks, ...fp.parks]) {
      expect(Math.abs(r.x) + r.hx).toBeLessThanOrEqual(CITY_HALF + 1e-6);
      expect(Math.abs(r.z) + r.hz).toBeLessThanOrEqual(CITY_HALF + 1e-6);
    }
    for (const poly of fp.water) for (const pt of poly) expect(Math.max(Math.abs(pt.x), Math.abs(pt.z))).toBeGreaterThanOrEqual(CITY_HALF - 1e-6);
    for (const r of fp.blocks) {
      // off every grid carriageway and its pavement
      for (const [c, h] of [[r.x, r.hx], [r.z, r.hz]] as const) {
        const line = Math.round(c / BLOCK) * BLOCK, near = Math.abs(line) === 3 * BLOCK ? HIGHWAY_HALF : ROAD_HALF;
        expect(Math.abs(c - line) - h).toBeGreaterThanOrEqual(near + 4.5 - 1e-6);
      }
      // and off every authored road: its centreline's samples are all further than its half width from the block
      for (const road of SPECIAL_ROADS) for (const pt of road.centre) {
        const dx = Math.max(0, Math.abs(pt.x - r.x) - r.hx), dz = Math.max(0, Math.abs(pt.z - r.z) - r.hz);
        expect(Math.hypot(dx, dz), road.name).toBeGreaterThan(road.halfWidth);
      }
    }
    // the same object again: built once
    expect(cityFootprints(city)).toBe(fp);
  });

  it('M7 11.3 each drop-off\'s lit sign is seen from the highway where its street meets it: a ray clear of every static', () => {
    for (const lot of DROP_OFF_LOTS) {
      const site = dropOffFor(lot), sign = hideoutSign(site);
      // the street the door faces, followed to the ring at its nearer end; the eye 1.5 m over the ring's city-side lane
      const alongZ = lot.ox === 40;
      const line = alongZ ? lot.cx * BLOCK : lot.cz * BLOCK;
      const end = Math.sign(alongZ ? sign.z : sign.x) * 3 * BLOCK;
      const eye = alongZ ? { x: line, y: 1.5, z: end - Math.sign(end) * 4 } : { x: end - Math.sign(end) * 4, y: 1.5, z: line };
      const target = { x: sign.x, y: sign.y, z: sign.z };
      let hit: StaticDesc | null = null;
      for (let cz = -3; cz <= 3 && !hit; cz++) for (let cx = -3; cx <= 3 && !hit; cx++) {
        // only the chunks the ray's square passes over
        const x0 = cx * BLOCK - BLOCK / 2 - 40, x1 = cx * BLOCK + BLOCK / 2 + 40, z0 = cz * BLOCK - BLOCK / 2 - 40, z1 = cz * BLOCK + BLOCK / 2 + 40;
        if (Math.max(eye.x, target.x) < x0 || Math.min(eye.x, target.x) > x1 || Math.max(eye.z, target.z) < z0 || Math.min(eye.z, target.z) > z1) continue;
        for (const st of city.generate(cx, cz).statics) if (blocks(st, eye, target)) { hit = st; break; }
      }
      expect(hit === null ? null : `${hit.tag} at ${hit.position.x.toFixed(1)},${hit.position.y.toFixed(1)},${hit.position.z.toFixed(1)}`, lot.name).toBeNull();
      // the same ray to the garage's own back wall is stopped by its walls: the test sees what stands in the way
      const home = city.generate(chunkCoord(site.x), chunkCoord(site.z)).statics;
      const back = { x: site.x + Math.sin(site.yaw) * 9, y: 3, z: site.z + Math.cos(site.yaw) * 9 };
      expect(home.some((st) => blocks(st, eye, back)), lot.name).toBe(true);
      // a sign over the street, not in it: its pole on the pavement, clear of the billboards there
      const chunk = city.generate(chunkCoord(sign.poleX), chunkCoord(sign.poleZ));
      for (const b of chunk.billboards) expect(Math.hypot(b.x - sign.poleX, b.z - sign.poleZ), lot.name).toBeGreaterThan(b.width / 2 + 1);
    }
  });
});
