/**
 * The full-screen map (M5.5 slice 15; DESIGN.md §6.5): held on a key, north up
 * and west to the left like the radar's compass, the whole island with its
 * roads and districts, the landmarks, the doors, the jobs (or the running
 * job's target), the day's caches, the speed cameras, the cover (the covered
 * streets and the overpasses' decks) and the pursuit: the units, the
 * helicopter, the search, a race's rivals. The game runs on under it. It
 * repaints at most every `REPAINT_MS` while shown and costs nothing hidden.
 * Reads sim state only; the radar's paths and glyphs are shared.
 */
import { BALANCE, BreakerState, CITY_HALF, DISTRICTS, PALETTE, type BreakerDesc, type JobKind, type SimWorld } from '../sim';
import { LANDMARKS, cityFootprints } from '../sim/city/City';
import { COVER } from '../sim/city/covers';
import { BLOCK, HIGHWAY_HALF, OVERPASS, OVERPASS_NODES } from '../sim/city/roads';
import {
  CACHE_COLOR, DARK, FONT, GLYPH_KINDS, GRID, INK, JOB_COLORS, LOOP, ACCENT, RIVAL, SEARCH_EDGE, SEARCH_FILL, UNIT_BEAT, UNIT_LIT, WATER,
  drawArrow, drawGlyph, drawHeli, fillIsland, hex, type MapPaths, type MarkerKind,
} from './minimap';
import { MINIMAP, bigMapProject, bigMapScale, yawFromQuat, type Vec2 } from './minimapModel';

/** Repaint cadence while shown, ms: the units move, the map need not be smoother than the radar. */
const REPAINT_MS = 66;
const GLYPH = 7;
/** The cover on the map: where the helicopter cannot see (DESIGN.md §13.10). */
const COVER_COLOR = 'rgba(126, 196, 214, 0.9)';
const CAMERA_COLOR = INK;
/** A scaffold tower that brings down on the chasers (M5.5 slice 18). */
const BREAKER_COLOR = hex(PALETTE.carOrange);
/** The island's ground (M7 slice 12): the built blocks a shade darker than their district, the parks green, the shallows light. */
const BLOCK_FILL = 'rgba(28, 27, 34, 0.16)';
const PARK_FILL = hex(PALETTE.grass);
const SHALLOWS_FILL = 'rgba(255, 255, 255, 0.2)';
/** The placed jobs' kinds, in the legend's order (fares have no marker: a hailer waves the taxi down). */
const LEGEND_JOBS: ReadonlyArray<[JobKind, string]> = [
  ['delivery', 'DELIVERY'], ['order', 'STEAL TO ORDER'], ['escape', 'ESCAPE'], ['trial', 'TIME TRIAL'],
  ['race', 'STREET RACE'], ['rage', 'TAKEDOWN RAGE'], ['mayhem', 'MAYHEM'], ['duel', 'RIVAL'],
];

/** BILLBOARDS 12/50 · JUMPS 3/20 · CACHES 4/30: the hunts the map shows (the day's caches only when drawn). */
export function huntsLine(sim: SimWorld): string {
  const parts: string[] = [];
  const c = sim.collectibles, j = sim.jumps, k = sim.caches;
  if (c) parts.push(`BILLBOARDS ${c.smashedCount}/${c.total}`);
  if (j) parts.push(`JUMPS ${j.foundCount}/${j.descs.length}`);
  if (k && k.today.length > 0) parts.push(`CACHES ${k.count}/${k.total}`);
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
  /** The three hunts' counts (DESIGN.md §17.2): off the driving screen, here and on the wall's GOALS page. */
  private readonly hunts: HTMLElement;
  private huntsText = '';
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
  private readonly jobPoint = { x: 0, z: 0 };
  private readonly onResize = (): void => { this.measure = true; };

  constructor(parent: HTMLElement, sim: SimWorld, private readonly paths: MapPaths) {
    this.root = el('div', 'bigmap');
    const head = el('div', 'bigmap__head');
    this.keyHint = el('span', 'bigmap__hint', 'HOLD TAB');
    this.hunts = el('span', 'bigmap__hunts');
    head.append(el('span', 'bigmap__title', 'MAP'), this.keyHint, this.hunts);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bigmap__canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Map of the island, north up. The yellow arrow is your car.');
    const body = el('div', 'bigmap__body');
    body.append(this.canvas, this.legend());
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
  setKey(label: string): void {
    this.keyHint.textContent = `HOLD ${label}`;
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

  /** The key: one swatch per thing on the map, drawn with the map's own glyphs. */
  private legend(): HTMLElement {
    const box = el('div', 'bigmap__legend');
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
      row.append(swatch, el('span', 'bigmap__word', word));
      box.appendChild(row);
    };
    item('YOU', (c) => drawArrow(c, 9, 9, 0, 7));
    for (const [kind, word] of LEGEND_JOBS) item(word, (c) => drawGlyph(c, 'job', 9, 9, GLYPH, JOB_COLORS[kind]));
    item('GARAGE', (c) => drawGlyph(c, 'garage', 9, 9, GLYPH, hex(PALETTE.carOrange)));
    item('CACHE', (c) => drawGlyph(c, 'cache', 9, 9, GLYPH * 1.4, CACHE_COLOR));
    item('SPEED CAMERA', (c) => drawGlyph(c, 'camera', 9, 9, GLYPH, CAMERA_COLOR));
    item('PURSUIT BREAKER', (c) => drawGlyph(c, 'breaker', 9, 9, GLYPH * 0.8, BREAKER_COLOR));
    item('COVER', (c) => { c.fillStyle = COVER_COLOR; c.strokeStyle = DARK; c.lineWidth = 1.5; c.fillRect(3, 5, 12, 8); c.strokeRect(3, 5, 12, 8); });
    item('COPS', (c) => { this.unitDot(c, 9, 9, UNIT_LIT); });
    item('HELICOPTER', (c) => drawHeli(c, 9, 9));
    return box;
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
    const s = bigMapScale(size, CITY_HALF);
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
        c.strokeStyle = pass === 0 ? DARK : ACCENT;
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
    // a zone job's edge
    if (running && jobs.state === 'active' && (running.kind === 'rage' || running.kind === 'mayhem')) {
      c.beginPath();
      c.arc(running.x, running.z, BALANCE.jobs.zone.radius, 0, Math.PI * 2);
      c.lineWidth = 3 / s;
      c.strokeStyle = JOB_COLORS[running.kind];
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
    c.restore();

    // Screen space from here: glyphs and words stay upright.
    c.font = `900 ${Math.max(11, Math.round(size / 34))}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    for (const [i, d] of DISTRICTS.entries()) {
      const p = this.at(i % 2 ? CITY_HALF / 2 : -CITY_HALF / 2, i >= 2 ? CITY_HALF / 2 : -CITY_HALF / 2, s);
      c.lineWidth = 3;
      c.strokeStyle = DARK;
      c.strokeText(d.name, p.x, p.y);
      c.fillStyle = hex(d.color);
      c.fillText(d.name, p.x, p.y);
    }
    LANDMARKS.forEach((l, i) => this.glyphAt(GLYPH_KINDS[i] ?? 'tower', l.x, l.z, s, GLYPH, hex(DISTRICTS[i]?.accent ?? 0xffffff)));
    for (const d of sim.run.dropOffs) this.glyphAt('garage', d.door.x, d.door.z, s, GLYPH * 1.2, hex(PALETTE.carOrange));
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
    if (running) {
      // the running job's target: where to go
      if (jobs.target(this.jobPoint)) this.glyphAt('job', this.jobPoint.x, this.jobPoint.z, s, GLYPH * 1.6, JOB_COLORS[running.kind]);
    } else if (jobs.state === 'idle') {
      for (const d of jobs.defs) if (jobs.live(d)) this.glyphAt('job', d.x, d.z, s, GLYPH, JOB_COLORS[d.kind]);
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
          this.unitDot(c, p.x, p.y, RIVAL);
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
    drawArrow(c, me.x, me.y, -yaw, MINIMAP.arrowPx);
  }
}
