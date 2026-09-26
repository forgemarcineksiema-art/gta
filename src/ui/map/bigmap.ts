/**
 * The full-screen map (M5.5 slice 15; DESIGN.md §6.5): held on a key, north up
 * and west to the left like the radar's compass, the whole island with its
 * roads and districts, the landmarks, the doors, the jobs (or the running
 * job's target), the day's caches, the speed cameras, the cover (the covered
 * streets and the overpasses' decks) and the pursuit: the units, the
 * helicopter, the search, a race's rivals. The game runs on under it. It
 * repaints at most every `REPAINT_MS` while shown and costs nothing hidden.
 * Reads sim state only; the radar's paths, colours and glyphs are shared
 * (docs/M8.9_PLAN.md R6): the rings' badges 12 px with their pictograms, the
 * route 6 px, the player's ink arrow; the key lists only what is on the map
 * now; each district's name sits clear of every icon.
 */
import { BALANCE, BreakerState, CITY_HALF, DISTRICTS, PALETTE, SEA, type BreakerDesc, type JobKind, type SimWorld } from '../../sim';
import { LANDMARKS, cityFootprints } from '../../sim/city/City';
import { COVER } from '../../sim/city/covers';
import { KIND_GLYPH, glyphIndex, glyphOf, goalGlyph } from '../../sim/glyphs';
import { BLOCK, HIGHWAY_HALF, OVERPASS, OVERPASS_NODES } from '../../sim/city/roads';
import {
  CACHE_COLOR, DARK, FONT, GLYPH_KINDS, GRID, HIGHWAY, INK, LOOP, RIVAL, ROUTE, SEARCH_EDGE, SEARCH_FILL, UNIT_BEAT, UNIT_LIT, WATER,
  drawArrow, drawBadge, drawGlyph, drawHeli, fillIsland, hex, type MapPaths, type MarkerKind,
} from './minimap';
import { SIGNALS } from '../../sim/palette';
import { cssAlpha } from '../colors';
import { fontReady } from '../fonts';
import { label, labelAria, relabel, t } from '../lang';
import { MINIMAP, bigMapProject, bigMapScale, clearSpot, mapHalf, yawFromQuat, type Box, type Vec2 } from './minimapModel';

/** Repaint cadence while shown, ms: the units move, the map need not be smoother than the radar. */
const REPAINT_MS = 66;
/** The way's route on the full map, px (M8.7 D3; M8.9 R6), on a 2 px dark edge; a click within `PICK_PX` of a ring's badge picks it (D7). */
const ROUTE_PX = 6;
const PICK_PX = 14;
const GLYPH = 7;
/** A ring's badge, px (radius: 12 across, M8.9 R6), the goal's a quarter larger. */
const RING_R = 6;
const GOAL_R = 7.5;
/**
 * The cover on the map: where the helicopter cannot see (DESIGN.md §13.10); a scaffold tower that brings down on the
 * chasers (M5.5 slice 18); a speed camera. None is money, the way, trouble or the police: ink (M8.9 R1).
 */
const COVER_COLOR = cssAlpha(SIGNALS.ink, 0.55);
const CAMERA_COLOR = INK;
const BREAKER_COLOR = INK;
/** The island's ground (M7 slice 12): the built blocks a shade darker than their district, the parks green, the shallows light. */
const BLOCK_FILL = 'rgba(28, 27, 34, 0.16)';
const PARK_FILL = hex(PALETTE.grass);
const SHALLOWS_FILL = 'rgba(255, 255, 255, 0.2)';
/** The placed jobs' kinds, in the legend's order (fares have no marker: a hailer waves the taxi down). */
const LEGEND_JOBS: ReadonlyArray<[JobKind, string]> = [
  ['delivery', 'DELIVERY'], ['order', 'STEAL TO ORDER'], ['escape', 'ESCAPE'], ['trial', 'TIME TRIAL'],
  ['race', 'STREET RACE'], ['rage', 'TAKEDOWN RAGE'], ['mayhem', 'MAYHEM'], ['duel', 'RIVAL'],
];

/** A row of the key (docs/M8.9_PLAN.md R6): the player, a job kind, or a kind of mark. */
export type LegendItem = 'you' | JobKind | 'garage' | 'cache' | 'camera' | 'breaker' | 'cover' | 'cops' | 'heli';

/** What is on the map now, for the key. */
export interface LegendState {
  jobs: ReadonlySet<JobKind>;
  caches: boolean;
  cameras: boolean;
  breakers: boolean;
  cover: boolean;
  cops: boolean;
  heli: boolean;
}

/** The key's rows: only the kinds on the map now (the player and the garages always are). */
export function legendItems(s: LegendState): LegendItem[] {
  const out: LegendItem[] = ['you'];
  for (const [kind] of LEGEND_JOBS) if (s.jobs.has(kind)) out.push(kind);
  out.push('garage');
  if (s.caches) out.push('cache');
  if (s.cameras) out.push('camera');
  if (s.breakers) out.push('breaker');
  if (s.cover) out.push('cover');
  if (s.cops) out.push('cops');
  if (s.heli) out.push('heli');
  return out;
}

/** What is on the map now: the rings shown and the goal's kind, the day's caches, the standing breakers, the pursuit. */
export function legendState(sim: SimWorld): LegendState {
  const jobs = new Set<JobKind>();
  const j = sim.jobs;
  if (!j.running && j.state === 'idle') for (const d of j.defs) if (d.kind !== 'fare' && j.shown(d)) jobs.add(d.kind);
  const goal = sim.way?.goal;
  const def = goal && goal.hasTarget && goal.id >= 0 ? j.defOf(goal.id) : null;
  if (def && def.kind !== 'fare') jobs.add(def.kind);
  const caches = sim.caches;
  let cache = false;
  if (caches) for (let k = 0; k < caches.today.length; k++) if (caches.found[k] !== 1) { cache = true; break; }
  const breakers = sim.breakers;
  let breaker = false;
  if (breakers) for (let k = 0; k < breakers.descs.length; k++) if (breakers.state[k] === BreakerState.Standing) { breaker = true; break; }
  let cops = false;
  const police = sim.police;
  if (police) for (let u = 0; u < police.units.length; u++) if ((police.units[u] as number) >= 0) { cops = true; break; }
  return {
    jobs, caches: cache, cameras: (sim.cameras?.descs.length ?? 0) > 0, breakers: breaker, cover: (sim.city?.covers.length ?? 0) > 0, cops,
    heli: !!police?.heli.active,
  };
}

/** The map's half extent: the island's, out to the player at sea (M8.8 slice 19). */
function halfOf(sim: SimWorld): number {
  return mapHalf(sim.probe.x, sim.probe.z, CITY_HALF, SEA.limit);
}

/**
 * The icons' boxes on a map `size` px across (docs/M8.9_PLAN.md R6): the landmarks, the garages, the cameras, the
 * standing breakers, the day's caches, the rings shown and the goal's badge. The districts' names keep clear of them.
 */
export function mapIcons(sim: SimWorld, size: number): Box[] {
  const s = bigMapScale(size, halfOf(sim));
  const out: Box[] = [];
  const tmp: Vec2 = { x: 0, y: 0 };
  const put = (x: number, z: number, r: number): void => {
    bigMapProject(tmp, x, z, size, s);
    out.push({ x: tmp.x, y: tmp.y, hw: r, hh: r });
  };
  for (const l of LANDMARKS) put(l.x, l.z, GLYPH * 1.3);
  for (const d of sim.run.dropOffs) put(d.door.x, d.door.z, GLYPH * 1.2);
  for (const cam of sim.cameras?.descs ?? []) put(cam.x, cam.z, GLYPH * 0.8);
  const breakers = sim.breakers;
  if (breakers) for (let k = 0; k < breakers.descs.length; k++) {
    if (breakers.state[k] !== BreakerState.Standing) continue;
    const d = breakers.descs[k] as BreakerDesc;
    put(d.x, d.z, GLYPH * 0.9);
  }
  const caches = sim.caches;
  if (caches) for (let k = 0; k < caches.today.length; k++) {
    if (caches.found[k] === 1) continue;
    const spot = caches.spots[caches.today[k] as number];
    if (spot) put(spot.x, spot.z, GLYPH * 0.7);
  }
  const jobs = sim.jobs;
  if (!jobs.running && jobs.state === 'idle') for (const d of jobs.defs) if (jobs.shown(d)) put(d.x, d.z, RING_R + 1);
  const goal = sim.way?.goal;
  if (goal && goal.hasTarget) put(goal.x, goal.z, GOAL_R + 2);
  return out;
}

/** The districts' names' font on a map `size` px across, px. */
export function nameFontPx(size: number): number {
  return Math.max(11, Math.round(size / 34));
}

/** Each district's name's box, clear of every icon (`width` measures a name at `nameFontPx`). */
export function namePlaces(sim: SimWorld, size: number, width: (name: string) => number, icons: readonly Box[] = mapIcons(sim, size)): Box[] {
  const s = bigMapScale(size, halfOf(sim));
  const font = nameFontPx(size);
  const tmp: Vec2 = { x: 0, y: 0 };
  return DISTRICTS.map((d, i) => {
    bigMapProject(tmp, i % 2 ? CITY_HALF / 2 : -CITY_HALF / 2, i >= 2 ? CITY_HALF / 2 : -CITY_HALF / 2, size, s);
    return clearSpot(tmp.x, tmp.y, width(t(d.name)) / 2 + 3, font * 0.6, icons, size, font * 0.75, size / 5, { x: 0, y: 0, hw: 0, hh: 0 });
  });
}

/** BILLBOARDS 12/50 · JUMPS 3/20 · CACHES 4/30: the hunts the map shows (the day's caches only when drawn). */
export function huntsLine(sim: SimWorld): string {
  const parts: string[] = [];
  const c = sim.collectibles, j = sim.jumps, k = sim.caches;
  if (c) parts.push(t('BILLBOARDS {n}/{of}', { n: c.smashedCount, of: c.total }));
  if (j) parts.push(t('JUMPS {n}/{of}', { n: j.foundCount, of: j.descs.length }));
  if (k && k.today.length > 0) parts.push(t('CACHES {n}/{of}', { n: k.count, of: k.total }));
  return parts.join(' · ');
}

function el(tag: string, className: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text) e.textContent = text;
  return e;
}

export class BigMap {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly keyHint: HTMLElement;
  /** The hold key's label, kept to say the hint again in a new language. */
  private keyLabel = 'TAB';
  /** The three hunts' counts (DESIGN.md §17.2): off the driving screen, here and on the wall's GOALS page. */
  private readonly hunts: HTMLElement;
  private huntsText = '';
  /** The key (M8.9 R6): its rows, written again when what is on the map changes. */
  private readonly legendBox: HTMLElement;
  private legendKey = '';
  /** The covered streets and the overpasses' decks as world rectangles (centre and half extents). */
  private readonly coverRects: Array<{ x: number; z: number; hx: number; hz: number }> = [];
  /** The island's blocks, parks and shallows (`cityFootprints`), built the first time the map is shown. */
  private ground: { blocks: Path2D; parks: Path2D; shallows: Path2D } | null = null;
  private shown = false;
  private size = 0;
  private dpr = 1;
  private measure = true;
  private lastPaint = -Infinity;
  private readonly tmp: Vec2 = { x: 0, y: 0 };
  private readonly onResize = (): void => { this.measure = true; };

  /** The player's pick (M8.7 D7): a click on a ring's badge makes it the goal, a click elsewhere lets it go (-1). */
  onPick: ((id: number) => void) | null = null;
  private simRef: SimWorld | null = null;

  constructor(parent: HTMLElement, sim: SimWorld, private readonly paths: MapPaths) {
    this.root = el('div', 'bigmap');
    const head = el('div', 'bigmap__head');
    this.keyHint = el('span', 'bigmap__hint', t('HOLD {key}', { key: this.keyLabel }));
    this.hunts = el('span', 'bigmap__hunts');
    head.append(label(el('span', 'bigmap__title'), 'MAP'), this.keyHint, this.hunts);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bigmap__canvas';
    this.canvas.setAttribute('role', 'img');
    labelAria(this.canvas, 'Map of the island, north up. The white arrow is your car.');
    const body = el('div', 'bigmap__body');
    this.legendBox = el('div', 'bigmap__legend');
    body.append(this.canvas, this.legendBox);
    this.canvas.addEventListener('pointerdown', (e) => this.pick(e));
    this.root.append(head, body);
    parent.appendChild(this.root);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context');
    this.ctx = ctx;
    for (const c of sim.city?.covers ?? []) {
      const along = COVER.length / 2, across = COVER.half;
      this.coverRects.push(c.axis === 'x' ? { x: c.x, z: c.z, hx: along, hz: across } : { x: c.x, z: c.z, hx: across, hz: along });
    }
    if (sim.city) {
      for (const [gx, gz] of OVERPASS_NODES) {
        // the ring runs along X on the north and south sides: the deck is long in X there
        const alongX = Math.abs(gz) === 3;
        this.coverRects.push({ x: gx * BLOCK, z: gz * BLOCK, hx: alongX ? OVERPASS.deck : HIGHWAY_HALF, hz: alongX ? HIGHWAY_HALF : OVERPASS.deck });
      }
    }
    window.addEventListener('resize', this.onResize);
  }

  /** The hold key's label in the title bar. */
  setKey(key: string): void {
    this.keyLabel = key;
    this.keyHint.textContent = t('HOLD {key}', { key });
  }

  /** The language changed (DESIGN.md §19): the title, the key and the hint said again; the names on the next paint. */
  relabel(): void {
    relabel(this.root);
    this.setKey(this.keyLabel);
    this.huntsText = '';
    this.legendKey = '';
    this.lastPaint = -Infinity;
  }

  /** A click on the map: the shown ring whose badge is within `PICK_PX` of it, else none. */
  private pick(e: PointerEvent): void {
    const sim = this.simRef;
    if (!sim || !this.onPick || !this.shown) return;
    const box = this.canvas.getBoundingClientRect();
    const x = e.clientX - box.left, y = e.clientY - box.top;
    const s = bigMapScale(this.size, halfOf(sim));
    let best = -1, bestD = PICK_PX * PICK_PX;
    for (const d of sim.jobs.defs) {
      if (d.kind === 'fare' || !sim.jobs.shown(d)) continue;
      const p = this.at(d.x, d.z, s);
      const dd = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (dd < bestD) { bestD = dd; best = d.id; }
    }
    this.onPick(best);
    e.preventDefault();
  }

  setVisible(v: boolean): void {
    if (v === this.shown) return;
    this.shown = v;
    this.root.classList.toggle('is-visible', v);
    if (v) {
      this.measure = true;
      this.lastPaint = -Infinity;
    }
  }

  get visible(): boolean {
    return this.shown;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
  }

  update(sim: SimWorld, now: number): void {
    this.simRef = sim;
    if (!this.shown) return;
    if (this.measure) {
      this.measure = false;
      this.resize(this.canvas.clientWidth);
    }
    if (this.size <= 0 || now - this.lastPaint < REPAINT_MS) return;
    this.lastPaint = now;
    this.paint(sim);
    // at the repaint's cadence: a string only while the map is held
    const text = huntsLine(sim);
    if (text !== this.huntsText) {
      this.huntsText = text;
      this.hunts.textContent = text;
    }
    const items = legendItems(legendState(sim));
    const key = items.join();
    if (key !== this.legendKey) {
      this.legendKey = key;
      this.fillLegend(items);
    }
  }

  private resize(cssPx: number): void {
    if (cssPx <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.max(1, Math.round(cssPx * dpr));
    this.size = cssPx;
    this.dpr = dpr;
    if (px !== this.canvas.width) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
  }

  /** The key: one swatch per kind on the map now, drawn with the map's own glyphs. */
  private fillLegend(items: readonly LegendItem[]): void {
    const box = this.legendBox;
    box.replaceChildren();
    const item = (word: string, draw: (c: CanvasRenderingContext2D) => void): void => {
      const row = el('div', 'bigmap__item');
      const swatch = document.createElement('canvas');
      swatch.className = 'bigmap__swatch';
      swatch.width = 36;
      swatch.height = 36;
      const c = swatch.getContext('2d');
      if (c) {
        c.setTransform(2, 0, 0, 2, 0, 0);
        draw(c);
      }
      row.append(swatch, label(el('span', 'bigmap__word'), word));
      box.appendChild(row);
    };
    for (const it of items) {
      const job = LEGEND_JOBS.find(([kind]) => kind === it);
      // the job kinds by their pictograms (M8.7: no kind has a colour of its own)
      if (job) item(job[1], (c) => drawBadge(c, glyphIndex(KIND_GLYPH[job[0]]), 9, 9, 8, 0));
      else if (it === 'you') item('YOU', (c) => drawArrow(c, 9, 9, 0, 7));
      else if (it === 'garage') item('GARAGE', (c) => drawGlyph(c, 'garage', 9, 9, GLYPH, INK));
      else if (it === 'cache') item('CACHE', (c) => drawGlyph(c, 'cache', 9, 9, GLYPH * 1.4, CACHE_COLOR));
      else if (it === 'camera') item('SPEED CAMERA', (c) => drawGlyph(c, 'camera', 9, 9, GLYPH, CAMERA_COLOR));
      else if (it === 'breaker') item('PURSUIT BREAKER', (c) => drawGlyph(c, 'breaker', 9, 9, GLYPH * 0.8, BREAKER_COLOR));
      else if (it === 'cover') item('COVER', (c) => { c.fillStyle = COVER_COLOR; c.strokeStyle = DARK; c.lineWidth = 1.5; c.fillRect(3, 5, 12, 8); c.strokeRect(3, 5, 12, 8); });
      else if (it === 'cops') item('COPS', (c) => { this.unitDot(c, 9, 9, UNIT_LIT); });
      else if (it === 'heli') item('HELICOPTER', (c) => drawHeli(c, 9, 9));
    }
  }

  /** The footprints as paths, once (a few hundred rectangles; the city's lot plans, not its chunks). */
  private groundOf(sim: SimWorld): { blocks: Path2D; parks: Path2D; shallows: Path2D } | null {
    if (this.ground || !sim.city) return this.ground;
    const fp = cityFootprints(sim.city);
    const g = { blocks: new Path2D(), parks: new Path2D(), shallows: new Path2D() };
    for (const r of fp.blocks) g.blocks.rect(r.x - r.hx, r.z - r.hz, r.hx * 2, r.hz * 2);
    for (const r of fp.parks) g.parks.rect(r.x - r.hx, r.z - r.hz, r.hx * 2, r.hz * 2);
    for (const poly of fp.water) {
      poly.forEach((pt, k) => (k === 0 ? g.shallows.moveTo(pt.x, pt.z) : g.shallows.lineTo(pt.x, pt.z)));
      g.shallows.closePath();
    }
    this.ground = g;
    return g;
  }

  private unitDot(c: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    c.fillStyle = color;
    c.strokeStyle = DARK;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(x, y, 3.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }

  private at(x: number, z: number, s: number): Vec2 {
    return bigMapProject(this.tmp, x, z, this.size, s);
  }

  private glyphAt(kind: MarkerKind, x: number, z: number, s: number, g: number, color: string): void {
    const p = this.at(x, z, s);
    drawGlyph(this.ctx, kind, p.x, p.y, g, color);
  }

  private paint(sim: SimWorld): void {
    const c = this.ctx, size = this.size, paths = this.paths;
    const s = bigMapScale(size, halfOf(sim));
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = WATER;
    c.fillRect(0, 0, size, size);

    // World space: metres, north up, +X (west) to the left.
    c.save();
    c.translate(size / 2, size / 2);
    c.scale(-s, -s);
    const ground = this.groundOf(sim);
    if (ground) { c.fillStyle = SHALLOWS_FILL; c.fill(ground.shallows); }
    fillIsland(c, paths);
    // under the roads: the built blocks, then the parks
    if (ground) {
      c.fillStyle = BLOCK_FILL;
      c.fill(ground.blocks);
      c.fillStyle = PARK_FILL;
      c.fill(ground.parks);
    }
    const minW = MINIMAP.minRoadPx / s;
    const casing = (MINIMAP.casingPx * 2) / s;
    const gridW = Math.max(paths.gridWidth, minW);
    const highW = Math.max(paths.highwayWidth, minW);
    for (const pass of [0, 1]) {
      const extra = pass === 0 ? casing : 0;
      c.lineCap = 'butt';
      c.lineJoin = 'miter';
      c.strokeStyle = pass === 0 ? DARK : GRID;
      c.lineWidth = gridW + extra;
      for (const line of paths.gridLines) c.stroke(line.path);
      if (paths.highwayRing > 0) {
        c.strokeStyle = pass === 0 ? DARK : HIGHWAY;
        c.lineWidth = highW + extra;
        c.stroke(paths.highwayPath);
      }
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = pass === 0 ? DARK : LOOP;
      for (const p of paths.specialPaths) {
        c.lineWidth = Math.max(p.width, minW) + extra;
        c.stroke(p.path);
      }
    }
    // the cover: covered streets and the decks the highway lifts over the crossings
    c.fillStyle = COVER_COLOR;
    c.strokeStyle = DARK;
    c.lineWidth = 1.5 / s;
    for (const r of this.coverRects) {
      c.fillRect(r.x - r.hx, r.z - r.hz, r.hx * 2, r.hz * 2);
      c.strokeRect(r.x - r.hx, r.z - r.hz, r.hx * 2, r.hz * 2);
    }
    const jobs = sim.jobs, running = jobs.running;
    // a zone job's edge round its middle (its target: the grid's ring, the island's place)
    if (running && jobs.state === 'active' && (running.kind === 'rage' || running.kind === 'mayhem')) {
      c.beginPath();
      c.arc(running.targetX, running.targetZ, BALANCE.jobs.zone.radius, 0, Math.PI * 2);
      c.lineWidth = 3 / s;
      c.strokeStyle = ROUTE;
      c.stroke();
    }
    // the search: where they last saw you, growing as they look
    const pursuit = sim.pursuit;
    if (pursuit.state === 'lost') {
      c.beginPath();
      c.arc(pursuit.lastX, pursuit.lastZ, pursuit.searchRadius, 0, Math.PI * 2);
      c.fillStyle = SEARCH_FILL;
      c.fill();
      c.lineWidth = 2 / s;
      c.strokeStyle = SEARCH_EDGE;
      c.stroke();
    }
    // the way's whole route (M8.7 D3): cyan on a dark edge
    const way = sim.way;
    if (way && way.count > 1) {
      c.beginPath();
      c.moveTo(way.points[0] as number, way.points[1] as number);
      for (let k = 1; k < way.count; k++) c.lineTo(way.points[k * 2] as number, way.points[k * 2 + 1] as number);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = DARK;
      c.lineWidth = (ROUTE_PX + 4) / s;
      c.stroke();
      c.strokeStyle = ROUTE;
      c.lineWidth = ROUTE_PX / s;
      c.stroke();
    }
    c.restore();

    // Screen space from here: glyphs and words stay upright. The districts' names first, each clear of every icon
    c.font = `900 ${nameFontPx(size)}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    // measured and written in Rubik once it is in (M8.9 R2): a name placed by the fallback's width would sit wrong
    const places = fontReady() ? namePlaces(sim, size, (name) => c.measureText(name).width) : [];
    for (const [i, d] of DISTRICTS.entries()) {
      if (places.length === 0) break;
      const p = places[i] as Box;
      c.lineWidth = 3;
      c.strokeStyle = DARK;
      const name = t(d.name);
      c.strokeText(name, p.x, p.y);
      c.fillStyle = INK;
      c.fillText(name, p.x, p.y);
    }
    LANDMARKS.forEach((l, i) => this.glyphAt(GLYPH_KINDS[i] ?? 'tower', l.x, l.z, s, GLYPH, INK));
    for (const d of sim.run.dropOffs) this.glyphAt('garage', d.door.x, d.door.z, s, GLYPH * 1.2, INK);
    for (const cam of sim.cameras?.descs ?? []) this.glyphAt('camera', cam.x, cam.z, s, GLYPH * 0.8, CAMERA_COLOR);
    // the pursuit breakers still standing (M5.5 slice 18)
    const breakers = sim.breakers;
    if (breakers) for (let k = 0; k < breakers.descs.length; k++) {
      if (breakers.state[k] !== BreakerState.Standing) continue;
      const d = breakers.descs[k] as BreakerDesc;
      this.glyphAt('breaker', d.x, d.z, s, GLYPH * 0.8, BREAKER_COLOR);
    }
    const caches = sim.caches;
    if (caches) {
      for (let k = 0; k < caches.today.length; k++) {
        if (caches.found[k] === 1) continue;
        const spot = caches.spots[caches.today[k] as number];
        if (spot) this.glyphAt('cache', spot.x, spot.z, s, GLYPH, CACHE_COLOR);
      }
    }
    if (!running && jobs.state === 'idle') {
      // each ring by its pictogram, grey while the police are on the player: closed (M8.7 D9)
      const closed = pursuit.state !== 'idle' && !sim.coldOpen.active;
      for (const d of jobs.defs) {
        if (!jobs.shown(d)) continue;
        const p = this.at(d.x, d.z, s);
        drawBadge(c, glyphOf(d), p.x, p.y, RING_R, closed ? 2 : 0);
      }
    }
    // the goal's badge: where the route ends
    if (way && way.goal.hasTarget) {
      const g = this.at(way.goal.x, way.goal.z, s);
      drawBadge(c, goalGlyph(way.goal, (id: number) => jobs.defOf(id)), g.x, g.y, GOAL_R, 1);
    }
    // the pursuit's units, lit in a chase; a race's rivals; the helicopter
    const police = sim.police, traffic = sim.traffic;
    if (police && traffic) {
      const lit = pursuit.state !== 'idle';
      for (let u = 0; u < police.units.length; u++) {
        const agent = police.units[u] as number;
        if (agent < 0) continue;
        const p = this.at(traffic.x[agent] as number, traffic.z[agent] as number, s);
        this.unitDot(c, p.x, p.y, lit ? UNIT_LIT : UNIT_BEAT);
      }
      if (jobs.race.running && !jobs.race.hidden) {
        for (const agent of jobs.race.rivals) {
          if (agent < 0) continue;
          const p = this.at(traffic.x[agent] as number, traffic.z[agent] as number, s);
          drawArrow(c, p.x, p.y, -(traffic.yaw[agent] as number), MINIMAP.rivalPx, RIVAL);
        }
      }
      if (police.heli.active) {
        const p = this.at(police.heli.x, police.heli.z, s);
        drawHeli(c, p.x, p.y);
      }
    }
    // the player, last: always on top
    const pos = sim.transforms.currPos, q = sim.transforms.currRot, i = sim.vehicle.slot;
    const yaw = yawFromQuat(q[i * 4] as number, q[i * 4 + 1] as number, q[i * 4 + 2] as number, q[i * 4 + 3] as number);
    const me = this.at(pos[i * 3] as number, pos[i * 3 + 2] as number, s);
    drawArrow(c, me.x, me.y, -yaw, 10);
  }
}
