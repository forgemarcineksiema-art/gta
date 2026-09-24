/**
 * Heading-up radar minimap on a 2D canvas: roads from the road graph cached as
 * world-space paths, district tints, landmark glyphs that clamp to the rim when
 * out of range, the car arrow and a rotating compass. Reads sim state only.
 * Repaints at most every `MINIMAP.repaintMs` and never while nothing moved, so
 * a parked or paused game costs no canvas work. The maths is in `minimapModel`.
 */
import { BALANCE, CITY_HALF, DISTRICTS, PALETTE, districtAt, type SimWorld } from '../sim';
import { LANDMARKS } from '../sim/city/City';
import { MINIMAP, advance, buildRoadLayers, clampToRim, project, yawFromQuat, type MinimapState, type Vec2 } from './minimapModel';

export type MarkerKind = 'tower' | 'tank' | 'glasshouse' | 'hotel' | 'garage' | 'job' | 'cache' | 'camera' | 'breaker';
/** A point of interest on the map. `local` markers show only inside the circle (the job rings: sixteen chevrons on the rim would be noise). */
export interface MinimapMarker { x: number; z: number; kind: MarkerKind; color: string; yaw?: number; local?: boolean }

/** The job rings by kind (the marker's own colours, docs/STYLE.md). */
export const RIVAL = hex(PALETTE.carLime);
export const JOB_COLORS = { delivery: hex(PALETTE.carOrange), order: hex(PALETTE.carMagenta), escape: hex(PALETTE.policeBlue), trial: hex(PALETTE.coin), race: hex(PALETTE.carLime), rage: hex(PALETTE.carRed), mayhem: hex(PALETTE.carWhite), fare: hex(PALETTE.coin), duel: hex(PALETTE.carBlue) } as const;

export const FONT = "'Segoe UI', 'Helvetica Neue', Arial, system-ui, sans-serif";
export const INK = '#f7f3ea';
export const DARK = 'rgba(22, 14, 40, 0.92)';
export const ACCENT = '#ffd23f';
export const CACHE_COLOR = hex(PALETTE.coin);
/** The police on the radar (DESIGN.md §13.9): lit blue in a chase, grey on the beat; the search disc. */
export const UNIT_LIT = '#3b82ff';
export const UNIT_BEAT = '#9d9da8';
export const SEARCH_FILL = 'rgba(59, 130, 246, 0.22)';
export const SEARCH_EDGE = 'rgba(59, 130, 246, 0.7)';
export const LOOP = '#ffe9a8';
export const GRID = 'rgba(247, 243, 234, 0.85)';
const RIM = 'rgba(255, 210, 63, 0.45)';
const PANEL = 0x160e28;
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

/** The player's arrow at a screen point, turned `angle` from screen up. */
export function drawArrow(c: CanvasRenderingContext2D, x: number, y: number, angle: number, a: number): void {
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
  c.fillStyle = ACCENT;
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
  /** The landmarks and drop-offs; idle job markers are appended when the jobs change. */
  private base: readonly MinimapMarker[];
  private jobSerial = -1;
  private cacheSerial = -1;
  private sim: SimWorld | null = null;
  /** The running job's target on the rim: the drop-off, the fence or the wanted car. Moved in place. */
  private readonly jobTarget: MinimapMarker = { x: 0, z: 0, kind: 'job', color: JOB_COLORS.delivery };
  private readonly jobPoint = { x: 0, z: 0 };
  private jobTargetShown = false;
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
  private readonly onResize = (): void => { this.measure = true; };

  constructor(parent: HTMLElement, sim: SimWorld) {
    this.wrap = el('div', 'minimap');
    this.label = el('div', 'minimap__district');
    this.landmark = el('div', 'minimap__landmark');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap__canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Radar map. Up is your direction of travel. The yellow arrow is your car.');
    this.wrap.append(this.label, this.landmark, this.canvas);
    parent.appendChild(this.wrap);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context');
    this.ctx = ctx;

    this.paths = buildMapPaths(sim);
    // the landmarks, then the three drop-offs: where a run can end is always on the rim
    this.base = [
      ...LANDMARKS.map((l, i): MinimapMarker => ({ x: l.x, z: l.z, kind: GLYPH_KINDS[i] ?? 'tower', color: hex(DISTRICTS[i]?.accent ?? 0xffffff) })),
      ...sim.run.dropOffs.map((d): MinimapMarker => ({ x: d.door.x, z: d.door.z, kind: 'garage', color: hex(PALETTE.carOrange) })),
    ];
    this.markers = this.base;

    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(this.onResize);
      this.observer.observe(this.canvas);
    }
    window.addEventListener('resize', this.onResize);
  }

  /** Replace the points of interest (landmarks by default). */
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

  /** Call every frame; paints at most every `repaintMs` and only when something moved. */
  update(sim: SimWorld, dt: number, now: number): void {
    this.sim = sim;
    // units move on their own: while any is on the map the radar repaints at its own cadence
    if (sim.police && sim.police.count > 0) this.dirty = true;
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
    if (jobs.serial !== this.jobSerial || cacheSerial !== this.cacheSerial) {
      // the live rings while no job runs (inside the circle only); the running job's target clamps to the rim;
      // the day's caches still to find as gold dots inside the circle (M5.5)
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
        this.markers = [...this.base, ...dots, this.jobTarget];
      } else {
        const live = jobs.state === 'idle' ? jobs.defs.filter((d) => jobs.live(d)) : [];
        this.markers = [...this.base, ...dots, ...live.map((d): MinimapMarker => ({ x: d.x, z: d.z, kind: 'job', color: JOB_COLORS[d.kind], local: true }))];
      }
      this.jobTargetShown = false;
      this.dirty = true;
    }
    if (jobs.running) {
      const shown = jobs.target(this.jobPoint);
      if (shown && (this.jobPoint.x !== this.jobTarget.x || this.jobPoint.z !== this.jobTarget.z)) {
        this.jobTarget.x = this.jobPoint.x;
        this.jobTarget.z = this.jobPoint.z;
        this.dirty = true;
      }
      if (shown !== this.jobTargetShown) {
        this.jobTargetShown = shown;
        this.dirty = true;
      }
    }

    const d = districtAt(x, z);
    if (d.id !== this.district) {
      this.district = d.id;
      this.label.textContent = d.name;
      this.landmark.textContent = d.landmark;
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
      c.strokeStyle = ACCENT;
      c.lineWidth = highW;
      c.stroke(paths.highwayPath);
    }
    // a zone job's edge (M5.5 slice 12)
    const zoneJob = this.sim?.jobs.running;
    if (zoneJob && this.sim?.jobs.state === 'active' && (zoneJob.kind === 'rage' || zoneJob.kind === 'mayhem')) {
      c.beginPath();
      c.arc(zoneJob.x, zoneJob.z, BALANCE.jobs.zone.radius, 0, Math.PI * 2);
      c.lineWidth = 3 / s;
      c.strokeStyle = JOB_COLORS[zoneJob.kind];
      c.stroke();
    }
    // the search: where they last saw you, growing as they look (get away from it)
    const pursuit = this.sim?.pursuit;
    if (pursuit && pursuit.state === 'lost') {
      c.beginPath();
      c.arc(pursuit.lastX, pursuit.lastZ, pursuit.searchRadius, 0, Math.PI * 2);
      c.fillStyle = SEARCH_FILL;
      c.fill();
      c.lineWidth = 2 / s;
      c.strokeStyle = SEARCH_EDGE;
      c.stroke();
    }
    c.restore();

    // Screen space from here: glyphs stay upright.
    const rimR = R - MINIMAP.rimInset;
    for (const m of this.markers) {
      if (m === this.jobTarget && !this.jobTargetShown) continue;
      project(this.tmp, m.x, m.z, x, z, h, s, px, py);
      if (m.local && (this.tmp.x - ccx) ** 2 + (this.tmp.y - ccy) ** 2 > rimR * rimR) continue;
      const clamped = clampToRim(this.tmp, px, py, this.tmp.x, this.tmp.y, ccx, ccy, rimR);
      drawGlyph(c, m.kind, this.tmp.x, this.tmp.y, clamped ? MINIMAP.glyphPx * 0.75 : MINIMAP.glyphPx, m.color);
      if (clamped) this.chevron(this.tmp.x, this.tmp.y, Math.atan2(this.tmp.x - px, py - this.tmp.y), m.color);
    }

    // the police: every unit inside the circle, lit in a chase
    const sim = this.sim;
    const police = sim?.police, traffic = sim?.traffic;
    if (sim && police && traffic) {
      const lit = sim.pursuit.state !== 'idle';
      c.fillStyle = lit ? UNIT_LIT : UNIT_BEAT;
      c.strokeStyle = DARK;
      c.lineWidth = 1.5;
      for (let u = 0; u < police.units.length; u++) {
        const agent = police.units[u] as number;
        if (agent < 0) continue;
        project(this.tmp, traffic.x[agent] as number, traffic.z[agent] as number, x, z, h, s, px, py);
        if ((this.tmp.x - ccx) ** 2 + (this.tmp.y - ccy) ** 2 > rimR * rimR) continue;
        c.beginPath();
        c.arc(this.tmp.x, this.tmp.y, 3.5, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
      // a street race's rivals (M5.5 slice 11): lime dots; none for the Ghost (M6)
      const rivals = sim.jobs.race.running && !sim.jobs.race.hidden ? sim.jobs.race.rivals : null;
      if (rivals) {
        c.fillStyle = RIVAL;
        for (let k = 0; k < rivals.length; k++) {
          const agent = rivals[k] as number;
          if (agent < 0) continue;
          project(this.tmp, traffic.x[agent] as number, traffic.z[agent] as number, x, z, h, s, px, py);
          if ((this.tmp.x - ccx) ** 2 + (this.tmp.y - ccy) ** 2 > rimR * rimR) continue;
          c.beginPath();
          c.arc(this.tmp.x, this.tmp.y, 3.5, 0, Math.PI * 2);
          c.fill();
          c.stroke();
        }
      }
      // the helicopter (M5.5 slice 9): a square with a cross for its rotor, clamped to the rim when away
      const heli = police.heli;
      if (heli.active) {
        project(this.tmp, heli.x, heli.z, x, z, h, s, px, py);
        clampToRim(this.tmp, px, py, this.tmp.x, this.tmp.y, ccx, ccy, rimR - 6);
        drawHeli(c, this.tmp.x, this.tmp.y);
      }
    }

    drawArrow(c, px, py, -(yaw - h), MINIMAP.arrowPx);

    // Compass: a world direction with yaw phi sits at screen angle h - phi, so N, E, S, W are at h + k * 90 deg.
    c.font = `800 11px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let k = 0; k < 4; k++) {
      const ang = h + (k * Math.PI) / 2;
      const sx = Math.sin(ang), cy = Math.cos(ang);
      if (k === 0) {
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

  /** A small chevron outside a clamped glyph, pointing along the bearing from the car. */
  private chevron(x: number, y: number, angle: number, color: string): void {
    const c = this.ctx;
    const g = MINIMAP.glyphPx;
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
