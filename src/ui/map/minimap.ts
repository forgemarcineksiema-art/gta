/**
 * Heading-up radar minimap on a 2D canvas: roads from the road graph cached as
 * world-space paths, district tints, the car arrow and a rotating compass. It
 * answers three questions (docs/M8.9_PLAN.md R6): where to go (the route, the
 * goal's badge, the rings as dots), where the police are (the units, the
 * search, the helicopter, a race's rivals), where to bank (the nearest garage,
 * while the bag holds money or the line says BANK IT or BUY). The landmarks,
 * the other garages, the far caches, the cameras, the cover and the breakers
 * are the full map's. Reads sim state only. Repaints at most every
 * `MINIMAP.repaintMs` and never while nothing moved, so a parked or paused game
 * costs no canvas work. The maths is in `minimapModel`.
 */
import { BALANCE, CITY_HALF, DISTRICTS, PALETTE, districtAt, type JobDef, type SimWorld } from '../../sim';
import { GLYPHS, GLYPH_ORDER, NO_GLYPH, digitSlot, glyphOf, goalGlyph, numberGlyphs, type GlyphId } from '../../sim/glyphs';
import { SIGNALS } from '../../sim/palette';
import { INK as INK_COLOR, MONEY, OFF, POLICE, TROUBLE, WAY, cssAlpha } from '../colors';
import { FONT_STACK, fontReady } from '../fonts';
import { labelAria, relabel, t } from '../lang';
import {
  MINIMAP, advance, buildRoadLayers, clampToRim, drawInShare, garageShown, nearestDoor, project, radarMarks, radarScale, routeStop, yawFromQuat,
  type MinimapState, type RadarState, type Vec2,
} from './minimapModel';

export type MarkerKind = 'tower' | 'tank' | 'glasshouse' | 'hotel' | 'garage' | 'job' | 'cache' | 'camera' | 'breaker';
/**
 * A point of interest on the map. `local` markers show only inside the circle (the job rings: sixteen chevrons on the
 * rim would be noise). A job's ring is a badge: its `glyph` (`sim/glyphs.ts`) and its `state` (0 open, 2 closed).
 */
export interface MinimapMarker { x: number; z: number; kind: MarkerKind; color: string; yaw?: number; local?: boolean; glyph?: number; state?: number }

/**
 * One colour, one meaning on the maps (docs/M8.9_PLAN.md R1, `ui/colors.ts`): a race's rivals are trouble (red); the
 * player, a garage, a landmark, a camera are ink; money (a cache) yellow; the way (the route, the goal) cyan; the police
 * blue, grey on the beat; a closed ring grey.
 */
export const RIVAL = TROUBLE;

/** The maps write in the screen's typeface (M8.9 R2), once it is in (`fontReady`). */
export const FONT = FONT_STACK;
export const INK = INK_COLOR;
export const DARK = cssAlpha(SIGNALS.outline, 0.92);
export const CACHE_COLOR = MONEY;
/** The police on the radar (DESIGN.md §13.9): lit blue in a chase, grey on the beat; the search disc. */
export const UNIT_LIT = POLICE;
export const UNIT_BEAT = OFF;
export const SEARCH_FILL = cssAlpha(SIGNALS.police, 0.22);
export const SEARCH_EDGE = cssAlpha(SIGNALS.police, 0.7);
/**
 * The roads (M8.9 R6): the streets mid-grey on the dark ground, the authored loop and the highway wider and pale (no
 * yellow: yellow is money); the route's cyan is the brightest line of the disc.
 */
export const LOOP = cssAlpha(SIGNALS.ink, 0.6);
export const HIGHWAY = LOOP;
/** The way's cyan (DESIGN.md §20.3 rule 6): the route and the goal's ring, and nothing else on the maps. */
export const ROUTE = WAY;
/** A closed ring's grey: the police on the player (M8.7 D9); its pictogram's slate. */
export const CLOSED = OFF;
export const SLATE = '#4a4a55';
export const GRID = cssAlpha(SIGNALS.ink, 0.4);
const RIM = cssAlpha(SIGNALS.ink, 0.45);
const PANEL = SIGNALS.outline;
export const WATER = rgba(mix(PALETTE.water, PANEL, 0.3), 0.96);
const ISLAND = rgba(PANEL, 0.9);
const TINT_ALPHA = 0.22;
export const GLYPH_KINDS: readonly MarkerKind[] = ['tower', 'tank', 'glasshouse', 'hotel'];

export function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}
export function rgba(c: number, a: number): string {
  return `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${a})`;
}
/** `t` of colour `a` over colour `b`, per channel. */
function mix(a: number, b: number, t: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const v = Math.round(((a >> shift) & 255) * t + ((b >> shift) & 255) * (1 - t));
    out |= v << shift;
  }
  return out;
}
function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

/**
 * The island in world-space paths (metres), built once: the grid streets merged into whole lines across the
 * island (10 subpaths instead of 60 segments), the perimeter highway as one closed rectangle, the authored roads
 * on their centrelines, the island and the district tints. The radar and the full-screen map stroke the same ones.
 */
export interface MapPaths {
  gridLines: Array<{ path: Path2D; axis: 'x' | 'z'; at: number }>;
  highwayPath: Path2D;
  highwayRing: number;
  specialPaths: Array<{ path: Path2D; width: number; minX: number; maxX: number; minZ: number; maxZ: number }>;
  islandPath: Path2D;
  districtFills: Array<{ path: Path2D; fill: string }>;
  gridWidth: number;
  highwayWidth: number;
}

export function buildMapPaths(sim: SimWorld): MapPaths {
  const layers = sim.city ? buildRoadLayers(sim.city.graph) : null;
  const out: MapPaths = {
    gridLines: [], highwayPath: new Path2D(), highwayRing: 0, specialPaths: [], islandPath: new Path2D(), districtFills: [],
    gridWidth: layers?.gridWidth ?? 24, highwayWidth: layers?.highwayWidth ?? 38,
  };
  if (layers) {
    const lines = new Map<string, { axis: 'x' | 'z'; at: number; min: number; max: number }>();
    for (const s of layers.grid) {
      const axis = s.x0 === s.x1 ? 'x' : 'z';
      const at = axis === 'x' ? s.x0 : s.z0;
      const a = axis === 'x' ? s.z0 : s.x0, b = axis === 'x' ? s.z1 : s.x1;
      const key = `${axis}${at}`;
      const line = lines.get(key) ?? { axis, at, min: Infinity, max: -Infinity };
      line.min = Math.min(line.min, a, b);
      line.max = Math.max(line.max, a, b);
      lines.set(key, line);
    }
    for (const line of lines.values()) {
      const path = new Path2D();
      if (line.axis === 'x') { path.moveTo(line.at, line.min); path.lineTo(line.at, line.max); }
      else { path.moveTo(line.min, line.at); path.lineTo(line.max, line.at); }
      out.gridLines.push({ path, axis: line.axis, at: line.at });
    }
    for (const s of layers.highway) out.highwayRing = Math.max(out.highwayRing, Math.abs(s.x0), Math.abs(s.x1), Math.abs(s.z0), Math.abs(s.z1));
    if (out.highwayRing > 0) out.highwayPath.rect(-out.highwayRing, -out.highwayRing, out.highwayRing * 2, out.highwayRing * 2);
    for (const road of layers.special) {
      const path = new Path2D();
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      road.points.forEach((p, i) => {
        if (i === 0) path.moveTo(p.x, p.z); else path.lineTo(p.x, p.z);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
      });
      out.specialPaths.push({ path, width: road.width, minX, maxX, minZ, maxZ });
    }
  }
  out.islandPath.rect(-CITY_HALF, -CITY_HALF, CITY_HALF * 2, CITY_HALF * 2);
  for (const [i, d] of DISTRICTS.entries()) {
    const path = new Path2D();
    path.rect(i % 2 ? 0 : -CITY_HALF, i >= 2 ? 0 : -CITY_HALF, CITY_HALF, CITY_HALF);
    out.districtFills.push({ path, fill: rgba(d.color, TINT_ALPHA) });
  }
  return out;
}

/** The island under the roads: water, the island panel, the district tints (in world space). */
export function fillIsland(c: CanvasRenderingContext2D, paths: MapPaths): void {
  c.fillStyle = ISLAND;
  c.fill(paths.islandPath);
  for (const d of paths.districtFills) { c.fillStyle = d.fill; c.fill(d.path); }
}

/** Four distinct shapes so the landmarks read without colour: the tower, the water tank, the glasshouse, the hotel slab; and the jobs, caches, garages and cameras. */
export function drawGlyph(c: CanvasRenderingContext2D, kind: MarkerKind, x: number, y: number, g: number, color: string): void {
  c.beginPath();
  switch (kind) {
    case 'tower':
      c.moveTo(x, y - g * 1.3);
      c.lineTo(x + g * 0.8, y + g * 0.9);
      c.lineTo(x - g * 0.8, y + g * 0.9);
      c.closePath();
      break;
    case 'tank':
      c.rect(x - g * 0.16, y, g * 0.32, g * 1.1);
      c.moveTo(x + g * 0.72, y - g * 0.3);
      c.arc(x, y - g * 0.3, g * 0.72, 0, Math.PI * 2);
      break;
    case 'glasshouse':
      c.moveTo(x, y - g);
      c.lineTo(x + g, y);
      c.lineTo(x, y + g);
      c.lineTo(x - g, y);
      c.closePath();
      break;
    case 'hotel':
      c.rect(x - g * 0.9, y - g * 0.55, g * 1.8, g * 1.1);
      break;
    case 'job':
      // a ring, the marker's own shape on the road
      c.arc(x, y, g * 0.85, 0, Math.PI * 2);
      c.moveTo(x + g * 0.4, y);
      c.arc(x, y, g * 0.4, 0, Math.PI * 2, true);
      break;
    case 'cache':
      // a gold dot: a coin on the map
      c.arc(x, y, g * 0.45, 0, Math.PI * 2);
      break;
    case 'camera':
      // a speed camera: a box with its lens
      c.rect(x - g * 0.8, y - g * 0.5, g * 1.6, g);
      c.moveTo(x + g * 0.3, y);
      c.arc(x, y, g * 0.3, 0, Math.PI * 2, true);
      break;
    case 'breaker':
      // a pursuit breaker: a scaffold tower, tall and narrow
      c.rect(x - g * 0.4, y - g * 1.1, g * 0.8, g * 2.2);
      break;
    case 'garage':
      // a garage front: a pitched outline with the door as the dark band across its foot
      c.moveTo(x - g * 0.9, y + g * 0.8);
      c.lineTo(x - g * 0.9, y - g * 0.3);
      c.lineTo(x, y - g);
      c.lineTo(x + g * 0.9, y - g * 0.3);
      c.lineTo(x + g * 0.9, y + g * 0.8);
      c.closePath();
      break;
  }
  c.lineJoin = 'round';
  c.lineWidth = 2;
  c.strokeStyle = DARK;
  c.stroke();
  c.fillStyle = color;
  c.fill();
  if (kind === 'garage') {
    c.fillStyle = DARK;
    c.fillRect(x - g * 0.55, y + g * 0.05, g * 1.1, g * 0.75);
  }
}

/** A rival's poster number's digits by the number (0..10), made once. */
const NUMBERS: readonly (readonly GlyphId[])[] = Array.from({ length: 11 }, (_, n) => numberGlyphs(n));

/** A glyph (`sim/glyphs.ts`: an index, or minus a rival's number) filled `size` px across round (x, y), each shape even-odd. */
export function drawOutline(c: CanvasRenderingContext2D, glyph: number, x: number, y: number, size: number, color: string): void {
  if (glyph === NO_GLYPH) return;
  c.fillStyle = color;
  const ids = glyph >= 0 ? null : NUMBERS[Math.min(-glyph, 10)];
  const count = ids ? ids.length : 1;
  for (let k = 0; k < count; k++) {
    const id = ids ? ids[k] as GlyphId : GLYPH_ORDER[glyph] as GlyphId;
    const slot = digitSlot(k, count);
    for (const shape of GLYPHS[id]) {
      c.beginPath();
      for (const pts of [shape.outer, ...(shape.holes ?? [])]) {
        for (let i = 0; i < pts.length; i += 2) {
          const px = x + (slot.cx + ((pts[i] as number) - 0.5) * slot.sx - 0.5) * size, py = y + ((pts[i + 1] as number) - 0.5) * size;
          if (i === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.closePath();
      }
      c.fill('evenodd');
    }
  }
}

/**
 * A job's badge on the maps (M8.7 D5–D6): a disc with its pictogram. Open: ink with a dark edge; the goal (1): in a
 * cyan ring with a dark edge outside it; closed (2): grey, its pictogram slate.
 */
export function drawBadge(c: CanvasRenderingContext2D, glyph: number, x: number, y: number, r: number, state: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = state === 2 ? CLOSED : INK;
  c.fill();
  c.lineWidth = state === 1 ? 3 : 1.5;
  c.strokeStyle = state === 1 ? ROUTE : DARK;
  c.stroke();
  if (state === 1) {
    c.beginPath();
    c.arc(x, y, r + 2, 0, Math.PI * 2);
    c.lineWidth = 1.5;
    c.strokeStyle = DARK;
    c.stroke();
  }
  drawOutline(c, glyph, x, y, r * 1.35, state === 2 ? SLATE : DARK);
}

/** An open or closed ring on the radar (M8.9 R6): a dot, ink or grey, with a dark edge. */
export function ringDot(c: CanvasRenderingContext2D, x: number, y: number, r: number, closed: boolean): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = closed ? CLOSED : INK;
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = DARK;
  c.stroke();
}

/** An arrow at a screen point, turned `angle` from screen up: the player's in ink, a race rival's in red. */
export function drawArrow(c: CanvasRenderingContext2D, x: number, y: number, angle: number, a: number, color: string = INK): void {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.beginPath();
  c.moveTo(0, -a);
  c.lineTo(a * 0.66, a * 0.66);
  c.lineTo(0, a * 0.38);
  c.lineTo(-a * 0.66, a * 0.66);
  c.closePath();
  c.lineJoin = 'round';
  c.lineWidth = 2.5;
  c.strokeStyle = DARK;
  c.stroke();
  // the player in ink (yellow is money since M8.9)
  c.fillStyle = color;
  c.fill();
  c.restore();
}

/** The helicopter: a square with a cross for its rotor. */
export function drawHeli(c: CanvasRenderingContext2D, x: number, y: number): void {
  c.fillStyle = UNIT_LIT;
  c.strokeStyle = DARK;
  c.lineWidth = 1.5;
  c.fillRect(x - 4.5, y - 4.5, 9, 9);
  c.strokeRect(x - 4.5, y - 4.5, 9, 9);
  c.beginPath();
  c.moveTo(x - 8, y); c.lineTo(x + 8, y);
  c.moveTo(x, y - 8); c.lineTo(x, y + 8);
  c.stroke();
}

export class Minimap {
  private readonly wrap: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly label: HTMLElement;
  private readonly landmark: HTMLElement;
  private readonly observer: ResizeObserver | null = null;
  /** World-space paths built once; one transform per repaint draws the visible ones. The full-screen map shares them. */
  readonly paths: MapPaths;
  private markers: readonly MinimapMarker[];
  /** Markers set from outside (none by default); the rings and the caches are appended when they change. */
  private base: readonly MinimapMarker[];
  /** The garages' doors: the nearest one's house is on the rim while there is money to bank (M8.9 R6). */
  private readonly doors: ReadonlyArray<{ x: number; z: number }>;
  /** What the last paint drew, as `RADAR` bits (the model's), and the state it read. */
  private drawnMask = 0;
  private readonly radar: RadarState = {
    route: false, goal: false, rings: 0, zone: false, units: 0, search: false, heli: false, rivals: 0, bag: 0, goalKind: 'none', goalAtGarage: false, cachesNear: 0,
  };
  private jobSerial = -1;
  /** A def by id for the goal's badge (bound once). */
  private readonly defOf = (id: number): JobDef | null => this.sim?.jobs.defOf(id) ?? null;
  /** The police on the player when the rings were last listed (they are drawn grey, closed). */
  private closedRings = false;
  private cacheSerial = -1;
  private sim: SimWorld | null = null;
  /** The way's route last seen (its serial, when it changed, its length) and where the draw-in stops (M8.7 D3). */
  private routeSerial = -1;
  private routeChanged = -Infinity;
  private routeLength = NaN;
  private paintNow = 0;
  private readonly stop = { count: 0, x: 0, z: 0 };
  private readonly state: MinimapState = { heading: 0, radiusM: MINIMAP.radiusMinM };
  private readonly tmp: Vec2 = { x: 0, y: 0 };
  /** CSS size of the (square) canvas and the backing-store ratio. */
  private size = 0;
  private dpr = 1;
  private primed = false;
  /** The settings' RADAR row (M7 slice 3): north up instead of the way the car goes. */
  northUp = false;
  private measure = true;
  private dirty = true;
  private lastX = 0;
  private lastZ = 0;
  private paintedX = Infinity;
  private paintedZ = Infinity;
  private paintedYaw = Infinity;
  private paintedHeading = Infinity;
  private paintedRadius = Infinity;
  private lastPaint = -Infinity;
  private district = '';
  /** The corners' radar and place bits (DESIGN.md §17.2): the circle off the screen behind a door, the names on their moment. */
  private shown = true;
  private placeShown = true;
  private readonly onResize = (): void => { this.measure = true; };

  constructor(parent: HTMLElement, sim: SimWorld) {
    this.wrap = el('div', 'minimap');
    this.label = el('div', 'minimap__district');
    this.landmark = el('div', 'minimap__landmark');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap__canvas';
    this.canvas.setAttribute('role', 'img');
    labelAria(this.canvas, 'Radar map. Up is your direction of travel. The white arrow is your car; the cyan line is the way to your goal.');
    this.wrap.append(this.label, this.landmark, this.canvas);
    parent.appendChild(this.wrap);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context');
    this.ctx = ctx;

    this.paths = buildMapPaths(sim);
    // the landmarks and the other garages are the full map's (M8.9 R6)
    this.base = [];
    this.doors = sim.run.dropOffs.map((d) => ({ x: d.door.x, z: d.door.z }));
    this.markers = this.base;

    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(this.onResize);
      this.observer.observe(this.canvas);
    }
    window.addEventListener('resize', this.onResize);
  }

  /** What the last paint drew, as `RADAR` bits (`minimapModel.ts`). */
  get drawn(): number {
    return this.drawnMask;
  }

  /** Replace the points of interest (none by default). */
  setMarkers(markers: readonly MinimapMarker[]): void {
    this.base = markers;
    this.markers = markers;
    this.jobSerial = -1;
    this.dirty = true;
  }

  dispose(): void {
    this.observer?.disconnect();
    window.removeEventListener('resize', this.onResize);
    this.wrap.remove();
  }

  /** Behind a shut door and on the busted card the radar goes, and nothing is painted meanwhile. */
  setVisible(v: boolean): void {
    if (v === this.shown) return;
    this.shown = v;
    this.wrap.classList.toggle('is-hidden', !v);
    if (v) {
      this.measure = true;
      this.dirty = true;
    }
  }

  /** The district's and the landmark's names over the circle: shown for a few seconds on a change, then faded (the circle stays put). */
  setPlaceVisible(v: boolean): void {
    if (v === this.placeShown) return;
    this.placeShown = v;
    this.wrap.classList.toggle('is-quiet', !v);
  }

  /** The language changed (DESIGN.md §19): the names written again on the next update. */
  relabel(): void {
    relabel(this.wrap);
    this.district = '';
  }

  /** Call every frame; paints at most every `repaintMs` and only when something moved. */
  update(sim: SimWorld, dt: number, now: number): void {
    this.sim = sim;
    if (!this.shown) return;
    // units move on their own: while any is on the map the radar repaints at its own cadence
    if (sim.police && sim.police.count > 0) this.dirty = true;
    // the nearest garage comes and goes with the bag
    if ((sim.run.bag > 0) !== (this.radar.bag > 0)) this.dirty = true;
    if (this.measure) {
      this.measure = false;
      this.resize(this.canvas.clientWidth);
    }
    const p = sim.transforms.currPos, q = sim.transforms.currRot, i = sim.vehicle.slot;
    const x = p[i * 3] as number, z = p[i * 3 + 2] as number;
    const yaw = yawFromQuat(q[i * 4] as number, q[i * 4 + 1] as number, q[i * 4 + 2] as number, q[i * 4 + 3] as number);
    const tm = sim.vehicle.telemetry;
    const jx = x - this.lastX, jz = z - this.lastZ;
    // A fixed step can clear the respawn flag before this frame: the jump test catches it.
    const snap = !this.primed || sim.respawned || jx * jx + jz * jz > MINIMAP.snapJumpM * MINIMAP.snapJumpM;
    this.primed = true;
    this.lastX = x;
    this.lastZ = z;
    advance(this.state, dt, yaw, tm.vx, tm.vz, tm.speed, snap, this.northUp);
    const jobs = sim.jobs;
    const caches = sim.caches;
    const cacheSerial = caches ? caches.serial : 0;
    const closed = sim.pursuit.state !== 'idle' && !sim.coldOpen.active;
    if (jobs.serial !== this.jobSerial || cacheSerial !== this.cacheSerial || closed !== this.closedRings) {
      this.closedRings = closed;
      // the live rings while no job runs (inside the circle only, as dots; the goal's badge is the way's); the day's
      // caches still to find as gold dots, only near (M5.5; M8.9 R6)
      this.jobSerial = jobs.serial;
      this.cacheSerial = cacheSerial;
      const running = jobs.running;
      const dots: MinimapMarker[] = [];
      if (caches) {
        for (let k = 0; k < caches.today.length; k++) {
          if (caches.found[k] === 1) continue;
          const spot = caches.spots[caches.today[k] as number];
          if (spot) dots.push({ x: spot.x, z: spot.z, kind: 'cache', color: CACHE_COLOR, local: true });
        }
      }
      if (running) {
        this.markers = [...this.base, ...dots];
      } else {
        const live = jobs.state === 'idle' ? jobs.defs.filter((d) => jobs.shown(d)) : [];
        this.markers = [...this.base, ...dots, ...live.map((d): MinimapMarker => ({ x: d.x, z: d.z, kind: 'job', color: '', local: true, glyph: glyphOf(d), state: closed ? 2 : 0 }))];
      }
      this.dirty = true;
    }
    // the way's route: drawn in when it changes, painted again when it moves
    const way = sim.way;
    if (way) {
      if (way.serial !== this.routeSerial) {
        this.routeSerial = way.serial;
        this.routeChanged = now;
      }
      if (now - this.routeChanged < MINIMAP.drawInMs) this.dirty = true;
      if (way.length !== this.routeLength && !(Number.isNaN(way.length) && Number.isNaN(this.routeLength))) {
        this.routeLength = way.length;
        this.dirty = true;
      }
    }

    const d = districtAt(x, z);
    if (d.id !== this.district) {
      this.district = d.id;
      this.label.textContent = t(d.name);
      this.landmark.textContent = t(d.landmark);
      this.label.style.color = hex(d.color);
    }

    if (this.size <= 0) return;
    const moved = snap
      || Math.abs(x - this.paintedX) > 0.05 || Math.abs(z - this.paintedZ) > 0.05
      || Math.abs(yaw - this.paintedYaw) > 0.002
      || Math.abs(this.state.heading - this.paintedHeading) > 0.0005
      || Math.abs(this.state.radiusM - this.paintedRadius) > 0.1;
    if (!this.dirty && !moved) return;
    if (!this.dirty && !snap && now - this.lastPaint < MINIMAP.repaintMs) return;
    this.paintNow = now;
    this.paint(x, z, yaw);
    this.dirty = false;
    this.lastPaint = now;
    this.paintedX = x;
    this.paintedZ = z;
    this.paintedYaw = yaw;
    this.paintedHeading = this.state.heading;
    this.paintedRadius = this.state.radiusM;
  }

  private resize(cssPx: number): void {
    if (cssPx <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.max(1, Math.round(cssPx * dpr));
    if (px === this.canvas.width && cssPx === this.size && dpr === this.dpr) return;
    this.size = cssPx;
    this.dpr = dpr;
    // Setting the size resets every canvas state; paint() sets all of it again.
    this.canvas.width = px;
    this.canvas.height = px;
    this.dirty = true;
  }

  private paint(x: number, z: number, yaw: number): void {
    const c = this.ctx;
    const size = this.size, R = size / 2;
    const ccx = R, ccy = R;
    const px = ccx, py = ccy + R * MINIMAP.playerOffset;
    const h = this.state.heading;
    const s = R / this.state.radiusM;
    // The square is painted whole; the CSS border-radius clips it to the circle on
    // the compositor, which is far cheaper than an anti-aliased canvas clip.
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = WATER;
    c.fillRect(0, 0, size, size);

    // World space: metres, direction of travel up, +X (west) to the left.
    c.save();
    c.translate(px, py);
    c.rotate(h);
    c.scale(-s, -s);
    c.translate(-x, -z);
    fillIsland(c, this.paths);
    const paths = this.paths;
    const minW = MINIMAP.minRoadPx / s;
    const casing = (MINIMAP.casingPx * 2) / s;
    const gridW = Math.max(paths.gridWidth, minW);
    const highW = Math.max(paths.highwayWidth, minW);
    // Only paths within reach of the visible disc are stroked (casing pass, then fills).
    const reach = this.state.radiusM + casing;
    const highwayVisible = paths.highwayRing > 0 && Math.max(Math.abs(x), Math.abs(z)) >= paths.highwayRing - reach - highW / 2;
    const k = radarScale(size);
    const st = this.radar;
    c.strokeStyle = DARK;
    this.strokeGrid(x, z, reach + gridW / 2, gridW + casing);
    if (highwayVisible) { c.lineWidth = highW + casing; c.stroke(paths.highwayPath); }
    this.strokeSpecials(x, z, reach, casing, minW);
    c.strokeStyle = GRID;
    this.strokeGrid(x, z, reach + gridW / 2, gridW);
    c.strokeStyle = LOOP;
    this.strokeSpecials(x, z, reach, 0, minW);
    if (highwayVisible) {
      c.lineCap = 'butt';
      c.lineJoin = 'miter';
      c.strokeStyle = HIGHWAY;
      c.lineWidth = highW;
      c.stroke(paths.highwayPath);
    }
    // a zone job's edge (M5.5 slice 12) round its middle (its target: the grid's ring, the island's place)
    const zoneJob = this.sim?.jobs.running;
    st.zone = !!zoneJob && this.sim?.jobs.state === 'active' && (zoneJob.kind === 'rage' || zoneJob.kind === 'mayhem');
    if (zoneJob && st.zone) {
      c.beginPath();
      c.arc(zoneJob.targetX, zoneJob.targetZ, BALANCE.jobs.zone.radius, 0, Math.PI * 2);
      c.lineWidth = 3 / s;
      c.strokeStyle = ROUTE;
      c.stroke();
    }
    // the search: where they last saw you, growing as they look (get away from it)
    const pursuit = this.sim?.pursuit;
    st.search = !!pursuit && pursuit.state === 'lost';
    if (pursuit && st.search) {
      c.beginPath();
      c.arc(pursuit.lastX, pursuit.lastZ, pursuit.searchRadius, 0, Math.PI * 2);
      c.fillStyle = SEARCH_FILL;
      c.fill();
      c.lineWidth = 2 / s;
      c.strokeStyle = SEARCH_EDGE;
      c.stroke();
    }
    // the way's route (M8.7 D3): over the roads, under the rings, the units and the car
    const way = this.sim?.way;
    st.route = !!way && way.count > 1;
    if (way && st.route) {
      const pts = way.points, stop = this.stop;
      routeStop(pts, way.count, drawInShare(this.paintNow - this.routeChanged), stop);
      c.beginPath();
      c.moveTo(pts[0] as number, pts[1] as number);
      for (let k = 1; k < stop.count; k++) c.lineTo(pts[k * 2] as number, pts[k * 2 + 1] as number);
      c.lineTo(stop.x, stop.z);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = DARK;
      c.lineWidth = ((MINIMAP.routePx + MINIMAP.routeEdgePx * 2) * k) / s;
      c.stroke();
      c.strokeStyle = ROUTE;
      c.lineWidth = (MINIMAP.routePx * k) / s;
      c.stroke();
    }
    c.restore();

    // Screen space from here: glyphs stay upright, every size the disc's scale's (M8.9 R6: 720p's, 0.85 at 800×450).
    const rimR = R - MINIMAP.rimInset * k;
    const near2 = MINIMAP.cacheNearM * MINIMAP.cacheNearM;
    st.rings = 0;
    st.cachesNear = 0;
    for (const m of this.markers) {
      // a cache only near: beyond it, the full map's
      if (m.kind === 'cache' && (m.x - x) ** 2 + (m.z - z) ** 2 > near2) continue;
      project(this.tmp, m.x, m.z, x, z, h, s, px, py);
      if (m.local && (this.tmp.x - ccx) ** 2 + (this.tmp.y - ccy) ** 2 > rimR * rimR) continue;
      const clamped = clampToRim(this.tmp, px, py, this.tmp.x, this.tmp.y, ccx, ccy, rimR);
      if (m.kind === 'job') {
        // a ring is a dot: ink open, grey closed (its pictogram is the full map's and the sign's)
        ringDot(c, this.tmp.x, this.tmp.y, MINIMAP.ringPx * k, m.state === 2);
        st.rings++;
      } else {
        drawGlyph(c, m.kind, this.tmp.x, this.tmp.y, (m.kind === 'cache' ? 6.5 : MINIMAP.glyphPx) * k * (clamped ? 0.75 : 1), m.color);
        if (m.kind === 'cache') st.cachesNear++;
      }
      if (clamped) this.chevron(this.tmp.x, this.tmp.y, Math.atan2(this.tmp.x - px, py - this.tmp.y), m.color, k);
    }

    // where to bank: the nearest garage's house, on the rim when away, while there is money to bank
    const sim = this.sim;
    const goal = way?.goal ?? null;
    const door = nearestDoor(this.doors, x, z);
    st.bag = sim?.run.bag ?? 0;
    st.goalKind = goal?.kind ?? 'none';
    // the goal at a garage's door says it already (its badge is the house)
    st.goalAtGarage = !!goal && goal.hasTarget && goal.door >= 0;
    const d = this.doors[door];
    if (d && garageShown(st.bag, st.goalKind) && !st.goalAtGarage) {
      project(this.tmp, d.x, d.z, x, z, h, s, px, py);
      const clamped = clampToRim(this.tmp, px, py, this.tmp.x, this.tmp.y, ccx, ccy, rimR);
      drawGlyph(c, 'garage', this.tmp.x, this.tmp.y, MINIMAP.glyphPx * k * (clamped ? 0.85 : 1), INK);
      if (clamped) this.chevron(this.tmp.x, this.tmp.y, Math.atan2(this.tmp.x - px, py - this.tmp.y), INK, k);
    }

    // the goal's badge (M8.7 D3): white in a cyan ring at the route's end, on the rim with a chevron when past it
    st.goal = !!goal && goal.hasTarget;
    if (goal && st.goal) {
      project(this.tmp, goal.x, goal.z, x, z, h, s, px, py);
      const clamped = clampToRim(this.tmp, px, py, this.tmp.x, this.tmp.y, ccx, ccy, rimR);
      drawBadge(c, goalGlyph(goal, this.defOf), this.tmp.x, this.tmp.y, MINIMAP.goalPx * k, 1);
      if (clamped) this.chevron(this.tmp.x, this.tmp.y, Math.atan2(this.tmp.x - px, py - this.tmp.y), ROUTE, k);
    }

    // the police: every unit inside the circle, blue in a chase and flashing red and blue while they see the player
    // (the stars' light bar), grey on the beat
    st.units = 0;
    st.rivals = 0;
    st.heli = false;
    const police = sim?.police, traffic = sim?.traffic;
    if (sim && police && traffic) {
      const state = sim.pursuit.state;
      const flash = state === 'active' && Math.floor(this.paintNow / 250) % 2 === 1;
      c.fillStyle = state === 'idle' ? UNIT_BEAT : flash ? RIVAL : UNIT_LIT;
      c.strokeStyle = DARK;
      c.lineWidth = 1.5;
      for (let u = 0; u < police.units.length; u++) {
        const agent = police.units[u] as number;
        if (agent < 0) continue;
        project(this.tmp, traffic.x[agent] as number, traffic.z[agent] as number, x, z, h, s, px, py);
        if ((this.tmp.x - ccx) ** 2 + (this.tmp.y - ccy) ** 2 > rimR * rimR) continue;
        c.beginPath();
        c.arc(this.tmp.x, this.tmp.y, MINIMAP.unitPx * k, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        st.units++;
      }
      // a street race's rivals (M5.5 slice 11): small red arrows the way they drive; none for the Ghost (M6)
      const rivals = sim.jobs.race.running && !sim.jobs.race.hidden ? sim.jobs.race.rivals : null;
      if (rivals) {
        for (let r = 0; r < rivals.length; r++) {
          const agent = rivals[r] as number;
          if (agent < 0) continue;
          project(this.tmp, traffic.x[agent] as number, traffic.z[agent] as number, x, z, h, s, px, py);
          if ((this.tmp.x - ccx) ** 2 + (this.tmp.y - ccy) ** 2 > rimR * rimR) continue;
          drawArrow(c, this.tmp.x, this.tmp.y, -((traffic.yaw[agent] as number) - h), MINIMAP.rivalPx * k, RIVAL);
          st.rivals++;
        }
      }
      // the helicopter (M5.5 slice 9): a square with a cross for its rotor, clamped to the rim when away
      const heli = police.heli;
      if (heli.active) {
        project(this.tmp, heli.x, heli.z, x, z, h, s, px, py);
        clampToRim(this.tmp, px, py, this.tmp.x, this.tmp.y, ccx, ccy, rimR - 6 * k);
        drawHeli(c, this.tmp.x, this.tmp.y);
        st.heli = true;
      }
    }

    drawArrow(c, px, py, -(yaw - h), MINIMAP.arrowPx * k);
    this.drawnMask = radarMarks(st);

    // Compass: a world direction with yaw phi sits at screen angle h - phi, so N, E, S, W are at h + q * 90 deg.
    c.font = `800 ${Math.round(11 * k)}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let q = 0; q < 4; q++) {
      const ang = h + (q * Math.PI) / 2;
      const sx = Math.sin(ang), cy = Math.cos(ang);
      if (q === 0) {
        // the N in Rubik or not at all: a canvas does not redraw when the face arrives
        if (!fontReady()) continue;
        const nx = ccx + sx * (R - 9), ny = ccy - cy * (R - 9);
        c.lineWidth = 3;
        c.strokeStyle = DARK;
        c.strokeText('N', nx, ny);
        c.fillStyle = INK;
        c.fillText('N', nx, ny);
      } else {
        c.beginPath();
        c.moveTo(ccx + sx * (R - 3), ccy - cy * (R - 3));
        c.lineTo(ccx + sx * (R - 8), ccy - cy * (R - 8));
        c.lineWidth = 2;
        c.strokeStyle = INK;
        c.stroke();
      }
    }

    c.beginPath();
    c.arc(ccx, ccy, R - 1, 0, Math.PI * 2);
    c.lineWidth = 2;
    c.strokeStyle = RIM;
    c.stroke();
  }

  /** Grid lines within `reach` of the car; butt caps, since every end sits under the highway ring. */
  private strokeGrid(x: number, z: number, reach: number, width: number): void {
    const c = this.ctx;
    c.lineCap = 'butt';
    c.lineJoin = 'miter';
    c.lineWidth = width;
    for (const line of this.paths.gridLines) {
      if (Math.abs((line.axis === 'x' ? x : z) - line.at) <= reach) c.stroke(line.path);
    }
  }

  /** Authored polylines whose bounds touch the visible disc; round joins for the curves. */
  private strokeSpecials(x: number, z: number, reach: number, extra: number, minW: number): void {
    const c = this.ctx;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const p of this.paths.specialPaths) {
      const w = Math.max(p.width, minW);
      const margin = reach + w;
      if (x + margin < p.minX || x - margin > p.maxX || z + margin < p.minZ || z - margin > p.maxZ) continue;
      c.lineWidth = w + extra;
      c.stroke(p.path);
    }
  }

  /** A small chevron outside a clamped glyph, pointing along the bearing from the car; `k` the disc's scale. */
  private chevron(x: number, y: number, angle: number, color: string, k: number): void {
    const c = this.ctx;
    const g = MINIMAP.glyphPx * k;
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.beginPath();
    c.moveTo(0, -g * 1.6);
    c.lineTo(g * 0.5, -g);
    c.lineTo(-g * 0.5, -g);
    c.closePath();
    c.lineJoin = 'round';
    c.lineWidth = 2;
    c.strokeStyle = DARK;
    c.stroke();
    c.fillStyle = color;
    c.fill();
    c.restore();
  }
}
