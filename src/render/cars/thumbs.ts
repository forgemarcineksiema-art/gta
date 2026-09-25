/**
 * The garage's pictures (docs/M8.9_PLAN.md R10): every card's picture from one atlas of `THUMBS.w` × `THUMBS.h`
 * cells, drawn at the session's first door, `THUMBS.perFrame` cells a frame while the wall is up, kept for the
 * session (a respray draws its car again); never while the run drives. A car in its paint, three-quarters from the
 * front; the car's kit on a grey car (a topper, wheels, a spoiler, a stance); the driver's effects as swatches in
 * their shapes (neon, a flame, smoke) and the horn as a speaker. The wall draws its cards from the atlas (`ui` reads
 * it through its `Pictures` shape); the queue is pure and pinned.
 */
import * as THREE from 'three';
import { BODY_IDS, KIT, bodySpec, bodyTuning, type BodyId, type SimWorld } from '../../sim';
import { GLYPHS } from '../../sim/glyphs';
import { BODY_PROFILES } from './bodyProfiles';
import { buildBikeMesh } from './bikeMesh';
import { buildCarMesh, restHeight, wheelGeometry, type CarMesh } from './carMesh';
import { spoilerGeometry, topperGeometry } from './kitMesh';

export const THUMBS = {
  /** A cell, CSS px (drawn at twice the size and scaled down: the edges smooth). */
  w: 160,
  h: 100,
  cols: 10,
  /** Cells drawn a frame while the wall is up. */
  perFrame: 3,
  /** The picture's camera: its vertical fov (degrees) and its bearing off the car's nose (rad). */
  fov: 30,
  bearing: 0.62,
  /** The grey car the car's kit is shown on. */
  grey: 0x8f8d99,
} as const;

/** Every picture's key: a body per `BODY_IDS` (`body:<id>`), a kit item per `KIT` (`kit:<id>`). */
export function thumbKeys(): string[] {
  return [...BODY_IDS.map((id) => `body:${id}`), ...KIT.map((k) => `kit:${k.id}`)];
}

/**
 * Which cells are drawn when (pure): nothing before the first door nor while the run drives; from the first door,
 * `perFrame` a frame while the wall is up, each once, in order; a cell asked again (a respray) goes first.
 */
export class ThumbQueue {
  readonly keys: readonly string[];
  /** Per cell: how many times it has been drawn (0: not yet). */
  readonly version: Uint16Array;
  private readonly index = new Map<string, number>();
  private readonly pending: number[] = [];
  private started = false;

  constructor(keys: readonly string[] = thumbKeys()) {
    this.keys = keys;
    this.version = new Uint16Array(keys.length);
    keys.forEach((k, i) => this.index.set(k, i));
  }

  /** A key's cell, -1 for none. */
  cellOf(key: string): number {
    return this.index.get(key) ?? -1;
  }

  /** The cells to draw this frame into `out`: none while the wall is down; up to `perFrame` while it is up. */
  next(wallUp: boolean, out: number[]): number {
    out.length = 0;
    if (!wallUp) return 0;
    if (!this.started) {
      this.started = true;
      for (let i = 0; i < this.keys.length; i++) this.pending.push(i);
    }
    while (out.length < THUMBS.perFrame && this.pending.length > 0) out.push(this.pending.shift() as number);
    return out.length;
  }

  /** A cell drawn. */
  drawn(cell: number): void {
    this.version[cell] = (this.version[cell] as number) + 1;
  }

  /** A cell to draw again (its car resprayed): first in line, once. */
  redo(cell: number): void {
    if (cell < 0 || !this.started || this.pending.includes(cell)) return;
    this.pending.unshift(cell);
  }

  /** Cells still to draw. */
  get waiting(): number {
    return this.started ? this.pending.length : this.keys.length;
  }
}

export class Thumbs {
  /** The atlas: `cols` cells a row. */
  readonly canvas: HTMLCanvasElement;
  readonly queue = new ThumbQueue();
  /** Bumps with every cell drawn: the wall draws its cards again. */
  serial = 0;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scratch: HTMLCanvasElement;
  private readonly scratchCtx: CanvasRenderingContext2D;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(THUMBS.fov, THUMBS.w / THUMBS.h, 0.1, 100);
  private readonly pixels: Uint8Array;
  private readonly image: ImageData;
  private readonly grey: CarMesh;
  private readonly greyWheels: THREE.BufferGeometry;
  private readonly kitMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly extra = new THREE.Mesh(new THREE.BufferGeometry(), this.kitMaterial);
  private readonly cells: number[] = [];
  private readonly paints = new Map<BodyId, number>();
  private garageSerial = -1;
  private readonly clear = new THREE.Color();

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly sim: SimWorld) {
    const rows = Math.ceil(this.queue.keys.length / THUMBS.cols);
    this.canvas = document.createElement('canvas');
    this.canvas.width = THUMBS.cols * THUMBS.w;
    this.canvas.height = rows * THUMBS.h;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    const w2 = THUMBS.w * 2, h2 = THUMBS.h * 2;
    this.scratch = document.createElement('canvas');
    this.scratch.width = w2;
    this.scratch.height = h2;
    this.scratchCtx = this.scratch.getContext('2d') as CanvasRenderingContext2D;
    this.target = new THREE.WebGLRenderTarget(w2, h2);
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.pixels = new Uint8Array(w2 * h2 * 4);
    this.image = new ImageData(w2, h2);
    this.scene.add(new THREE.HemisphereLight(0xd8d4ff, 0x6a5a50, 1.8));
    const sun = new THREE.DirectionalLight(0xffe2bc, 2.6);
    sun.position.set(4, 7, 5);
    this.scene.add(sun);
    this.grey = buildCarMesh(bodyTuning('muscle'), BODY_PROFILES.muscle, THUMBS.grey);
    this.greyWheels = (this.grey.wheels[0]?.children[0] as THREE.Mesh | undefined)?.geometry ?? new THREE.BufferGeometry();
  }

  /** A cell's size and the atlas' columns: where a cell stands. */
  readonly cellW = THUMBS.w;
  readonly cellH = THUMBS.h;
  readonly cols = THUMBS.cols;

  /** A key's cell, its place in the atlas and its version: the wall's `Pictures`. */
  cellOf(key: string): number {
    return this.queue.cellOf(key);
  }

  version(cell: number): number {
    return this.queue.version[cell] ?? 0;
  }

  /** While the wall is up (`wallUp`): up to `perFrame` pictures; a respray draws its car again. Never while the run drives. */
  step(wallUp: boolean): void {
    const garage = this.sim.garage;
    if (garage.serial !== this.garageSerial) {
      this.garageSerial = garage.serial;
      for (const id of BODY_IDS) {
        const paint = garage.paintOf(id), was = this.paints.get(id);
        if (was !== undefined && was !== paint) this.queue.redo(this.queue.cellOf(`body:${id}`));
      }
    }
    if (this.queue.next(wallUp, this.cells) === 0) return;
    const before = this.renderer.getRenderTarget();
    this.renderer.getClearColor(this.clear);
    const alpha = this.renderer.getClearAlpha();
    for (const cell of this.cells) {
      this.draw(cell);
      this.queue.drawn(cell);
    }
    this.renderer.setRenderTarget(before);
    this.renderer.setClearColor(this.clear, alpha);
    this.serial++;
  }

  private draw(cell: number): void {
    const key = this.queue.keys[cell] ?? '';
    const x = (cell % THUMBS.cols) * THUMBS.w, y = Math.floor(cell / THUMBS.cols) * THUMBS.h;
    this.ctx.clearRect(x, y, THUMBS.w, THUMBS.h);
    if (key.startsWith('body:')) {
      const id = key.slice(5) as BodyId;
      const paint = this.sim.garage.paintOf(id);
      this.paints.set(id, paint);
      // built for its picture and let go: the atlas keeps the picture, a respray builds it again; a bike is a bike
      const t = bodyTuning(id);
      const car = t.twoWheel > 0 ? buildBikeMesh(t, paint) : buildCarMesh(t, BODY_PROFILES[id], paint);
      this.shoot(car, id, x, y);
      dispose(car);
      return;
    }
    const k = KIT.find((item) => `kit:${item.id}` === key);
    if (!k) return;
    if (k.slot === 'neon' || k.slot === 'flame' || k.slot === 'smoke' || k.slot === 'horn') {
      swatch(this.ctx, k.slot, k.colour, k.colour2 ?? k.colour, x, y);
      return;
    }
    // the car's kit and a topper: on the grey car
    const car = this.grey, t = bodyTuning('muscle'), profile = BODY_PROFILES.muscle;
    let lift = 0;
    this.extra.visible = false;
    if (k.slot === 'topper') {
      this.extra.geometry = topperGeometry(k.id);
      this.extra.position.set(0, car.roofY - 0.02, -0.2);
      this.extra.visible = true;
    } else if (k.slot === 'spoiler') {
      const kind = ({ spoilerLip: 'lip', spoilerWing: 'wing', spoilerGiant: 'giant' } as Record<string, 'lip' | 'wing' | 'giant'>)[k.id];
      if (kind) {
        const S = profile.sections, deck = S[S.length - 2] ?? S[S.length - 1], tail = S[S.length - 1];
        this.extra.geometry = spoilerGeometry(kind, bodySpec('muscle').halfWidth * 1.7);
        this.extra.position.set(0, (deck ? deck.roof : 0.9) - restHeight(t), (tail ? tail.z : -2.3) + 0.3);
        this.extra.visible = true;
      }
    } else if (k.slot === 'stance') {
      lift = k.id === 'stanceLow' ? -0.06 : k.id === 'stanceHigh' ? 0.1 : 0;
    }
    let wheels: THREE.BufferGeometry | null = null;
    if (k.slot === 'wheels') {
      const style = ({ wheelStar: 'star', wheelDish: 'dish', wheelWire: 'wire', wheelDisc: 'disc' } as Record<string, string>)[k.id] ?? '';
      wheels = wheelGeometry(t, style);
      for (const w of car.wheels) w.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry = wheels as THREE.BufferGeometry; });
    }
    car.root.add(this.extra);
    this.shoot(car, 'muscle', x, y, lift);
    car.root.remove(this.extra);
    if (this.extra.visible) this.extra.geometry.dispose();
    this.extra.geometry = new THREE.BufferGeometry();
    if (wheels) {
      for (const w of car.wheels) w.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry = this.greyWheels; });
      wheels.dispose();
    }
  }

  /** The car three-quarters from the front, filling its cell, drawn at twice the size into the atlas. */
  private shoot(car: CarMesh, id: BodyId, x: number, y: number, lift = 0): void {
    const t = bodyTuning(id), spec = bodySpec(id);
    car.root.position.set(0, restHeight(t) + lift, 0);
    car.root.rotation.set(0, 0, 0);
    car.wheels.forEach((w, i) => {
      w.position.set((i % 2 === 1 ? -1 : 1) * (t.trackWidth / 2), t.wheelRadius, (i < 2 ? 1 : -1) * (t.wheelBase / 2));
      w.rotation.set(0, 0, 0);
    });
    this.scene.add(car.root, ...car.wheels);
    const radius = Math.hypot(spec.halfLength, spec.halfWidth);
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(THUMBS.fov) / 2) * (THUMBS.w / THUMBS.h));
    const d = radius / Math.sin(half * 0.92);
    const height = car.roofY + restHeight(t);
    this.camera.position.set(Math.sin(THUMBS.bearing) * d, height * 0.9 + 0.6, Math.cos(THUMBS.bearing) * d);
    this.camera.lookAt(0, height * 0.42, 0);
    this.renderer.setRenderTarget(this.target);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, this.target.width, this.target.height, this.pixels);
    this.scene.remove(car.root, ...car.wheels);
    // the target's rows run bottom up
    const w = this.target.width, h = this.target.height, data = this.image.data;
    for (let row = 0; row < h; row++) data.set(this.pixels.subarray((h - 1 - row) * w * 4, (h - row) * w * 4), row * w * 4);
    this.scratchCtx.putImageData(this.image, 0, 0);
    this.ctx.drawImage(this.scratch, 0, 0, w, h, x, y, THUMBS.w, THUMBS.h);
  }
}

/** A car mesh's geometries and materials freed (its wheels share one geometry and one material). */
function dispose(car: CarMesh): void {
  const seen = new Set<unknown>();
  for (const o of [car.root, ...car.wheels]) {
    o.traverse((m) => {
      if (!(m instanceof THREE.Mesh)) return;
      const mesh = m as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
      const materials: THREE.Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const r of [mesh.geometry, ...materials]) {
        if (seen.has(r)) continue;
        seen.add(r);
        r.dispose();
      }
    });
  }
}

/** A driver's effect as a swatch in its shape, in its colour (a neon's two): the neon's glow, the flame, the smoke's puff, the horn's speaker. */
function swatch(c: CanvasRenderingContext2D, slot: 'neon' | 'flame' | 'smoke' | 'horn', colour: number, colour2: number, x: number, y: number): void {
  const css = (v: number, a = 1): string => `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
  const cx = x + THUMBS.w / 2, cy = y + THUMBS.h / 2;
  c.save();
  if (slot === 'neon') {
    const g = c.createLinearGradient(cx - 55, 0, cx + 55, 0);
    g.addColorStop(0, css(colour));
    g.addColorStop(1, css(colour2));
    c.shadowColor = css(colour, 0.9);
    c.shadowBlur = 18;
    c.fillStyle = g;
    c.beginPath();
    c.roundRect(cx - 55, cy - 5, 110, 10, 5);
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255, 255, 255, 0.75)';
    c.fillRect(cx - 50, cy - 1.5, 100, 3);
  } else if (slot === 'flame') {
    const size = 70;
    c.translate(cx - size / 2, cy - size / 2);
    c.fillStyle = css(colour);
    for (const shape of GLYPHS.flame) {
      c.beginPath();
      for (const pts of [shape.outer, ...(shape.holes ?? [])]) {
        for (let i = 0; i < pts.length; i += 2) {
          if (i === 0) c.moveTo((pts[i] as number) * size, (pts[i + 1] as number) * size);
          else c.lineTo((pts[i] as number) * size, (pts[i + 1] as number) * size);
        }
        c.closePath();
      }
      c.fill('evenodd');
    }
  } else if (slot === 'smoke') {
    c.fillStyle = css(colour, 0.7);
    for (const [dx, dy, r] of [[-26, 8, 20], [0, -4, 26], [26, 6, 21], [-8, 16, 18], [14, 18, 16]] as const) {
      c.beginPath();
      c.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
      c.fill();
    }
  } else {
    // a speaker: its box, its cone, two waves
    c.fillStyle = css(colour);
    c.strokeStyle = css(colour);
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(cx - 40, cy - 12);
    c.lineTo(cx - 24, cy - 12);
    c.lineTo(cx - 4, cy - 30);
    c.lineTo(cx - 4, cy + 30);
    c.lineTo(cx - 24, cy + 12);
    c.lineTo(cx - 40, cy + 12);
    c.closePath();
    c.fill();
    for (const r of [16, 30]) {
      c.beginPath();
      c.arc(cx + 2, cy, r, -Math.PI / 4, Math.PI / 4);
      c.stroke();
    }
  }
  c.restore();
}
