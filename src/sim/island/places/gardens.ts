/**
 * Palm Gardens' places (M8.10 slice 10, docs/M8.10_PLAN.md): the botanic garden (the Glasshouse on its terrace, the
 * grid's landmark moved to the top of its hill; its trees and palms and its flower beds along the loop), the golf's
 * flags, the beach's boardwalk (a timber deck level with the beach road's pavement, the wheels' ground) and its palms,
 * and the back gardens' shortcuts: a way between two houses from one ring of streets to the next, the gardens' fences
 * across it as props, ready for the props (slice 7b: a fence breaks at 30 km/h). The paths, the golf's grass and sand,
 * the dunes and the jumps are the ground's (`shapes/gardens.ts`). Statics at their heights in the island's chunks;
 * nothing moves.
 */
import { Architecture } from '../../city/architecture';
import type { PropSpot } from '../../city/props';
import { ACCENTS, CITY_COLORS, ISLAND_COLORS, PALETTE } from '../../palette';
import type { StaticDesc } from '../../scene';
import type { P2 } from '../geom';
import type { IslandFill } from '../fill';
import { HALF_WIDTH, type Ground } from '../ground';
import { GARDEN, RINGS } from '../plan';
import { BEACH_JUMP, BOARDWALK, GLASSHOUSE, GREENS, PATH, boardwalkRuns, gardenTrees, humpAt } from '../shapes/gardens';
import { KERB, PAVEMENT, ROAD_LIFT } from '../surfaces';
import type { Place, PlaceContext } from './place';

/** A back garden's shortcut: from the carriageway's edge of one ring of streets to the next's. */
export interface Shortcut { from: P2; to: P2 }
/** The Gardens' running part: nothing moves; it holds the shortcuts and the fences' spots for the props. */
export interface GardensPlace extends Place { readonly shortcuts: readonly Shortcut[]; readonly fences: readonly PropSpot[] }

/**
 * The rings of streets round the botanic garden, from the parkway out: their radii and half widths (m). The crescents
 * are the districts' streets' (`streets.ts`: 255 and 340, side streets).
 */
const RINGS_OUT: ReadonlyArray<{ r: number; hw: number }> = [
  { r: (RINGS.find((g) => g.id === 'parkway') ?? { r: 170 }).r, hw: HALF_WIDTH.avenue },
  { r: 255, hw: HALF_WIDTH.side }, { r: 340, hw: HALF_WIDTH.side },
];
/**
 * The shortcuts (m): a car's way clear of every house by `clear` either side, the ways at least `apart` apart along the
 * inner ring, at most `most` between two rings; the fences a panel every 2 m across the way, at the houses' back lines.
 */
const SHORTCUT = { clear: 2.6, apart: 45, most: 8, step: 0.006, wide: 3.1 } as const;
/** The beach's palms: off the boardwalk's sea edge, one every so far along it, clear of its dune and the slipway (m). */
const BEACH_PALMS = { out: 4.5, every: 24 } as const;

export function gardensPlaces(ctx: PlaceContext): Place[] {
  glasshouse(ctx);
  garden(ctx);
  flags(ctx);
  boardwalk(ctx);
  const { shortcuts, fences } = backGardenShortcuts(ctx.ground, ctx.fill);
  const place: GardensPlace = { id: 'gardens', shortcuts, fences };
  return [place];
}

/** Statics built about the origin at `start` onward, moved to (x, z) turned by `yaw` and lifted by `y`. */
function settle(kit: Architecture, start: number, x: number, z: number, yaw: number, y: number): void {
  kit.rotateFrom(start, x, z, yaw);
  for (let i = start; i < kit.statics.length; i++) (kit.statics[i] as StaticDesc).position.y += y;
}

/**
 * The Glasshouse, the grid's Palm Gardens landmark moved to the island: a hall of glass bays under a stepped glass dome
 * in the district's pink, and its slim beacon mast, on the terrace over the hill's top.
 */
function glasshouse(ctx: PlaceContext): void {
  const g = GLASSHOUSE, list = ctx.statics(g.x, g.z), kit = new Architecture(list), start = list.length;
  const accent = ACCENTS.gardens, box = kit.box.bind(kit), cylinder = kit.cylinder.bind(kit);
  box(0, 5, 0, g.half, 5, g.half, accent, 'building');
  for (const side of [-1, 1]) for (const bay of [-12, -6, 0, 6, 12]) {
    box(side * (g.half + 0.08), 5.3, bay, 0.01, 3.8, 2.5, CITY_COLORS.windowLight, 'decor', side > 0 ? 'x+' : 'x-');
    box(bay, 5.3, side * (g.half + 0.08), 2.5, 3.8, 0.01, CITY_COLORS.windowLight, 'decor', side > 0 ? 'z+' : 'z-');
  }
  box(-(g.half + 0.1), 1.4, 0, 0.01, 1.2, 1.2, CITY_COLORS.shop, 'decor', 'x-');
  cylinder(0, 12, 0, 17, 2, PALETTE.glass);
  cylinder(0, 15, 0, 12, 1, PALETTE.glass);
  cylinder(0, 17, 0, 6, 1, accent);
  // the beacon mast on the terrace, so the low glasshouse marks its district from afar
  cylinder(22, 23, 16, 0.7, 23, CITY_COLORS.trim);
  box(22, 47.5, 16, 1.6, 1.6, 1.6, accent);
  box(22, 0.8, 16, 2.5, 1.2, 2.5, CITY_COLORS.stone, 'building');
  settle(kit, start, g.x, g.z, 0, ctx.ground.surfaceHeight(g.x, g.z));
}

/** The botanic garden's trees and palms, and its flower beds along the loop's outer side. */
function garden(ctx: PlaceContext): void {
  for (const t of gardenTrees()) {
    const list = ctx.statics(t.x, t.z), kit = new Architecture(list), start = list.length;
    kit.tree(0, 0, t.palm);
    settle(kit, start, t.x, t.z, 0, ctx.ground.surfaceHeight(t.x, t.z));
    if (t.palm) ctx.fill.palms.push({ x: t.x, z: t.z });
  }
  const colours = [ACCENTS.gardens, PALETTE.carWhite, CITY_COLORS.peach];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + Math.PI / 12;
    // none where the loop meets the two straight paths (north and south)
    if (Math.abs(Math.cos(a)) < 0.42) continue;
    const r = PATH.loop + PATH.half + 4, x = GARDEN.x + Math.cos(a) * r, z = GARDEN.z + Math.sin(a) * r;
    const list = ctx.statics(x, z), kit = new Architecture(list), start = list.length;
    // a low clipped border, the flowers heaped in it
    kit.box(0, 0.05, 0, 2.4, 0.3, 1, CITY_COLORS.hedge);
    kit.box(0, 0.3, 0, 2.1, 0.18, 0.75, colours[k % colours.length] as number);
    settle(kit, start, x, z, -a - Math.PI / 2, ctx.ground.surfaceHeight(x, z));
  }
}

/** A flag on each green: a white pole and the Gardens' pink pennant. */
function flags(ctx: PlaceContext): void {
  for (const g of GREENS) {
    const list = ctx.statics(g.x, g.z), kit = new Architecture(list), start = list.length;
    kit.cylinder(0, 1.25, 0, 0.05, 1.25, PALETTE.carWhite, 6);
    kit.box(0.42, 2.2, 0, 0.4, 0.26, 0.02, ACCENTS.gardens);
    settle(kit, start, g.x, g.z, 0, ctx.ground.surfaceHeight(g.x, g.z));
  }
}

/**
 * The boardwalk: a timber deck along the beach road's sea side, its road edge on the pavement's, its top level with
 * the pavement or a hand over the sand, solid down to the sand; each piece pitched to its ends' heights, the wheels'
 * ground ('kerb'). Palms along its sea edge on the sand.
 */
function boardwalk(ctx: PlaceContext): void {
  const g = ctx.ground, half = BOARDWALK.half;
  // the deck's top at a point of its middle line, `nx, nz` toward the road: the pavement's outer top beside it, or
  // over the sand under it
  const top = (x: number, z: number, nx: number, nz: number): number => {
    const edge = g.surfaceHeight(x + nx * (half + 0.3), z + nz * (half + 0.3)) + ROAD_LIFT + KERB;
    let sand = -Infinity;
    for (const o of [-half, 0, half]) sand = Math.max(sand, g.surfaceHeight(x + nx * o, z + nz * o) + 0.12);
    return Math.max(edge, sand);
  };
  const foot = (x: number, z: number, nx: number, nz: number): number => Math.min(...[-half, 0, half].map((o) => g.surfaceHeight(x + nx * o, z + nz * o)));
  let sinceLast = BEACH_PALMS.every / 2;
  for (const run of boardwalkRuns()) {
    for (let i = 0; i + 1 < run.length; i++) {
      const a = run[i] as P2, b = run[i + 1] as P2, dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      // toward the road: the world's +Z side of the way
      let nx = -dz / len, nz = dx / len;
      if (nz < 0) { nx = -nx; nz = -nz; }
      const ha = top(a[0], a[1], nx, nz), hb = top(b[0], b[1], nx, nz);
      const low = Math.min(foot(a[0], a[1], nx, nz), foot(b[0], b[1], nx, nz), foot((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, nx, nz));
      const hy = Math.max(0.15, (Math.min(ha, hb) - low + 0.2) / 2);
      ctx.statics((a[0] + b[0]) / 2, (a[1] + b[1]) / 2).push(deck(a, b, ha, hb, half, hy));
      // a palm on the sand off its sea edge every so often
      sinceLast += len;
      if (sinceLast < BEACH_PALMS.every) continue;
      const px = (a[0] + b[0]) / 2 - nx * (half + BEACH_PALMS.out), pz = (a[1] + b[1]) / 2 - nz * (half + BEACH_PALMS.out);
      if (!g.onLand(px, pz) || humpAt(BEACH_JUMP, px, pz) > 0 || Math.hypot(px - BEACH_JUMP.x, pz - BEACH_JUMP.z) < BEACH_JUMP.top + BEACH_JUMP.ramp + 4) continue;
      sinceLast = 0;
      const list = ctx.statics(px, pz), kit = new Architecture(list), start = list.length;
      kit.tree(0, 0, true);
      settle(kit, start, px, pz, 0, g.surfaceHeight(px, pz));
      ctx.fill.palms.push({ x: px, z: pz });
    }
  }
}

/** One piece of the deck from `a` to `b`, its top's middle line at heights `ha`, `hb`, `hy` its half thickness. */
function deck(a: P2, b: P2, ha: number, hb: number, half: number, hy: number): StaticDesc {
  const dx = b[0] - a[0], dz = b[1] - a[1], run = Math.hypot(dx, dz), fx = dx / run, fz = dz / run;
  const angle = Math.atan2(hb - ha, run), yaw = Math.atan2(dx, dz);
  // turned to the way (about +Y), then its nose up by the climb (about its own +X)
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(-angle / 2), sp = Math.sin(-angle / 2);
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, my = (ha + hb) / 2;
  return {
    shape: { kind: 'box', hx: half, hy, hz: Math.hypot(run, hb - ha) / 2 + 0.05 },
    // its middle half its thickness under its top's middle, along its own down
    position: { x: mx + fx * hy * Math.sin(angle), y: my - hy * Math.cos(angle), z: mz + fz * hy * Math.sin(angle) },
    rotation: { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp },
    color: ISLAND_COLORS.timber, tag: 'kerb',
  };
}

/**
 * The back gardens' shortcuts: between each two rings of streets round the botanic garden, the ways straight out from
 * one's carriageway to the next's that pass every house by `clear` m or more (and every palm), no road on them, the
 * clearest first and `apart` m apart; across each, the two rows' back fences (fence panels every 2 m), for the props.
 */
export function backGardenShortcuts(ground: Ground, fill: IslandFill): { shortcuts: Shortcut[]; fences: PropSpot[] } {
  const shortcuts: Shortcut[] = [], fences: PropSpot[] = [];
  const polar = (x: number, z: number): { a: number; r: number } => ({ a: Math.atan2(z - GARDEN.z, x - GARDEN.x), r: Math.hypot(x - GARDEN.x, z - GARDEN.z) });
  // each house's corners about the garden's middle
  const houses = fill.lots.filter((l) => l.district === 'gardens').map((l) => {
    const c = Math.cos(l.yaw), s = Math.sin(l.yaw);
    const corners = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([u, v]) => [l.x + c * l.hx * (u as number) + s * l.hz * (v as number) - GARDEN.x, l.z - s * l.hx * (u as number) + c * l.hz * (v as number) - GARDEN.z] as const);
    return { l, corners, ...polar(l.x, l.z) };
  });
  const palms = fill.palms.map((p) => ({ x: p.x - GARDEN.x, z: p.z - GARDEN.z, ...polar(p.x, p.z) }));
  const turn = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const on = (r: number, a: number): [number, number] => [GARDEN.x + Math.cos(a) * r, GARDEN.z + Math.sin(a) * r];
  for (let k = 0; k + 1 < RINGS_OUT.length; k++) {
    const inner = RINGS_OUT[k] as { r: number; hw: number }, outer = RINGS_OUT[k + 1] as { r: number; hw: number };
    const r0 = inner.r + inner.hw + 0.5, r1 = outer.r - outer.hw - 0.5;
    const near = houses.filter((h) => h.r > inner.r && h.r < outer.r);
    const trees = palms.filter((p) => p.r > r0 && p.r < r1);
    // the houses and the palms by the bearing they lie within 0.2 rad of (houses) or 6 m of (palms)
    const BIN = 0.05, bins = Math.ceil((2 * Math.PI) / BIN), binOf = (a: number): number => ((Math.floor((a + Math.PI) / BIN) % bins) + bins) % bins;
    const houseBins: Array<typeof near> = Array.from({ length: bins }, () => []), palmBins: Array<typeof trees> = Array.from({ length: bins }, () => []);
    for (const h of near) for (let b = h.a - 0.2 - BIN; b <= h.a + 0.2 + BIN; b += BIN / 2) { const list = houseBins[binOf(b)] as typeof near; if (!list.includes(h)) list.push(h); }
    for (const p of trees) { const w = 6 / p.r + BIN; for (let b = p.a - w; b <= p.a + w; b += BIN / 2) { const list = palmBins[binOf(b)] as typeof trees; if (!list.includes(p)) list.push(p); } }
    const found: Array<{ a: number; clear: number }> = [];
    for (let a = -Math.PI; a < Math.PI; a += SHORTCUT.step) {
      // the way's line from the garden's middle: a house its line crosses blocks it, else its nearest corner is its
      // clearance (a palm's trunk likewise)
      const ux = Math.cos(a), uz = Math.sin(a), bin = binOf(a);
      let clear = Infinity;
      for (const h of houseBins[bin] as typeof near) {
        if (turn(h.a, a) > 0.2) continue;
        let lo = Infinity, hi = -Infinity;
        for (const [cx, cz] of h.corners) { const d = cx * uz - cz * ux; lo = Math.min(lo, d); hi = Math.max(hi, d); }
        clear = Math.min(clear, lo < 0 && hi > 0 ? 0 : Math.min(Math.abs(lo), Math.abs(hi)));
      }
      for (const p of palmBins[bin] as typeof trees) if (turn(p.a, a) * p.r < 6) clear = Math.min(clear, Math.abs(p.x * uz - p.z * ux) - 0.4);
      if (clear < SHORTCUT.clear) continue;
      // both rings there, and no other road on the way
      const [ix, iz] = on(inner.r, a), [ox, oz] = on(outer.r, a);
      if (!ground.nearOtherRoad(ix, iz, -1, -inner.hw + 1) || !ground.nearOtherRoad(ox, oz, -1, -outer.hw + 1)) continue;
      for (let r = r0 + PAVEMENT + 1; r < r1 - PAVEMENT - 1 && clear >= SHORTCUT.clear; r += 4) {
        const [x, z] = on(r, a);
        if (ground.nearOtherRoad(x, z, -1, 3)) clear = 0;
      }
      if (clear >= SHORTCUT.clear) found.push({ a, clear });
    }
    found.sort((p, q) => q.clear - p.clear || p.a - q.a);
    const kept: Array<{ a: number; clear: number }> = [];
    for (const f of found) {
      if (kept.length >= SHORTCUT.most) break;
      if (kept.some((q) => turn(q.a, f.a) * r0 < SHORTCUT.apart)) continue;
      kept.push(f);
    }
    for (const { a, clear } of kept.sort((p, q) => p.a - q.a)) {
      shortcuts.push({ from: on(r0, a), to: on(r1, a) });
      // the rows' back lines by the way: the inner row's houses' far sides, the outer row's near sides
      const mid = (r0 + r1) / 2;
      let back0 = -Infinity, back1 = Infinity;
      for (const h of near) {
        if (turn(h.a, a) * h.r > 25) continue;
        const c = Math.cos(h.l.yaw), s = Math.sin(h.l.yaw);
        const corners = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([u, v]) => Math.hypot(h.l.x + c * h.l.hx * (u as number) + s * h.l.hz * (v as number) - GARDEN.x, h.l.z - s * h.l.hx * (u as number) + c * h.l.hz * (v as number) - GARDEN.z));
        if (h.r < mid) back0 = Math.max(back0, ...corners);
        else back1 = Math.min(back1, ...corners);
      }
      const lines = back0 + 2 < back1 && back0 > r0 && back1 < r1 ? [back0 + 0.6, back1 - 0.6] : [mid - 4, mid + 4];
      const yaw = Math.atan2(Math.cos(a), Math.sin(a)), px = Math.cos(yaw), pz = -Math.sin(yaw);
      const panels = clear >= SHORTCUT.wide ? [-2, 0, 2] : [-1, 1];
      for (const r of lines) {
        const [x, z] = on(r, a);
        for (const o of panels) fences.push({ kind: 'fence', x: x + px * o, z: z + pz * o, yaw });
      }
    }
  }
  return { shortcuts, fences };
}
