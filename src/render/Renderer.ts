/**
 * Three.js view of the sim: the frame. Builds the views from the sim's descriptors once, then every frame syncs the
 * player's car, interpolates what moves, updates each view in its order and draws. Reads sim state only. What is
 * drawn lives in the folders by what it is (docs/ARCHITECTURE.md, decision 97); this file keeps the order.
 */
import * as THREE from 'three';
import type { CarId, SimEvent, SimWorld } from '../sim';
import { CameraDirector } from './camera/CameraDirector';
import { ChaseCamera } from './camera/ChaseCamera';
import { GhostCar } from './cars/GhostCar';
import { PlayerCar } from './cars/PlayerCar';
import { Billboards } from './city/Billboards';
import { BreakerView } from './city/BreakerView';
import { CityView } from './city/CityView';
import { RampView } from './city/RampView';
import { SignalView } from './city/SignalView';
import { buildSkyline } from './city/skyline';
import { Effects } from './fx/Effects';
import { Smoke } from './fx/Smoke';
import { buildDonutShop } from './police/DonutShop';
import { HeliView } from './police/HeliView';
import { PoliceView } from './police/PoliceView';
import { RoadblockView } from './police/RoadblockView';
import { PropsView } from './props/PropsView';
import { AutoQuality, QUALITY, type QualityTier } from './quality';
import { Arrow } from './run/Arrow';
import { Coins } from './run/Coins';
import { HideoutView } from './run/HideoutView';
import { MarkerView } from './run/MarkerView';
import { ShapesView } from './shapes';
import { Sky } from './sky';
import { PedView } from './traffic/PedView';
import { TrafficView } from './traffic/TrafficView';

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  dpr: number;
  width: number;
  height: number;
  /** UNMASKED_RENDERER_WEBGL when available (tells software GL from a real GPU). */
  glRenderer: string;
}

const MAX_DPR = 1.5;

/**
 * A whole-buffer update re-specifies the buffer's storage (`bufferData`, the
 * driver "orphans" the old one) instead of writing into it (`bufferSubData`).
 * three.js rewrites every per-frame instanced attribute (traffic, peds,
 * markers, particles) in full with `bufferSubData`; on Chrome's ANGLE/D3D11
 * path a write into a buffer the GPU is still reading made the GPU process
 * wait for it, 0.3–1.7 s at random on the MX330: the M4 and M5 single long
 * frames (M5.1 trace: the stall was inside one `glBufferSubData` of the
 * frame's first flush, the page's main thread idle). Measured by alternating
 * runs: long frames over 250 ms in 6 of 8 runs without, 0 of 9 with. Range
 * updates (`updateRanges`) keep `bufferSubData`.
 */
function orphanWholeBufferUpdates(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
  const sub = gl.bufferSubData.bind(gl) as (...args: unknown[]) => void;
  const data = gl.bufferData.bind(gl) as (target: number, src: AllowSharedBufferSource, usage: number) => void;
  const patched = function (this: unknown, target: number, offset: number, src: AllowSharedBufferSource, srcOffset?: number, length?: number): void {
    if (offset === 0 && srcOffset === undefined && length === undefined) data(target, src, gl.DYNAMIC_DRAW);
    else if (srcOffset === undefined) sub(target, offset, src);
    else if (length === undefined) sub(target, offset, src, srcOffset);
    else sub(target, offset, src, srcOffset, length);
  };
  (gl as unknown as { bufferSubData: typeof patched }).bufferSubData = patched;
}

export class Renderer {
  readonly cityView: CityView | null;
  readonly billboards: Billboards | null;
  readonly trafficView: TrafficView | null;
  readonly pedView: PedView | null;
  readonly policeView: PoliceView;
  private readonly heliView: HeliView | null;
  /** The street furniture that is down (M8). */
  private readonly propsView: PropsView | null;
  readonly hideoutView: HideoutView | null;
  readonly coinsView: Coins | null;
  readonly markerView: MarkerView;
  readonly arrow: Arrow;
  readonly roadblockView: RoadblockView | null;
  readonly rampView: RampView | null;
  /** The traffic lights' lamps (M5.5 slice 17). */
  private readonly signalView: SignalView | null;
  /** The pursuit breakers (M5.5 slice 18). */
  private readonly breakerView: BreakerView | null;
  quality: QualityTier = 'low';
  private readonly auto: AutoQuality;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly chase: ChaseCamera;
  readonly stats: RenderStats = { drawCalls: 0, triangles: 0, dpr: 1, width: 0, height: 0, glRenderer: '' };
  private readonly sim: SimWorld;
  private readonly director: CameraDirector;
  private readonly sky: Sky;
  private readonly shapes: ShapesView;
  private readonly player: PlayerCar;
  private readonly ghost: GhostCar;
  /** Made first: every resize sizes the smoke's points, the first one inside the first quality set. */
  private readonly smoke = new Smoke();
  private readonly fx: Effects;
  /** The clock the skid marks fade by and a knocked hydrant's water moves on (stopped while paused). */
  private elapsed = 0;
  private eventSeq = 0;
  private readonly onEvent = (e: SimEvent): void => this.handleEvent(e);
  private readonly lastCarPos = new THREE.Vector3(Infinity, Infinity, Infinity);
  private readonly carVel = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, sim: SimWorld, quality?: QualityTier) {
    this.sim = sim;
    this.auto = new AutoQuality(quality !== undefined);
    this.quality = quality ?? 'low';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;
    orphanWholeBufferUpdates(this.renderer.getContext());
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
      this.stats.glRenderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    } catch {
      this.stats.glRenderer = 'unknown';
    }

    // Far enough for the skyline layer across the whole 1.6 km island.
    // Near 0.6 m doubles depth precision over 0.3 m; the chase camera never comes closer than 3 m.
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.6, 1700);
    this.chase = new ChaseCamera(this.camera);
    // the occlusion rule reads the world's solid statics (a query; the sim is not written)
    this.chase.occluder = (ax, ay, az, bx, by, bz) => sim.clearFraction(ax, ay, az, bx, by, bz);
    this.director = new CameraDirector(this.chase, sim);
    this.sky = new Sky(this.scene);

    this.cityView = sim.city ? new CityView(this.scene, sim.city, sim.props) : null;
    this.propsView = sim.props ? new PropsView(this.scene, sim) : null;
    this.billboards = sim.collectibles ? new Billboards(this.scene) : null;
    this.coinsView = sim.coins ? new Coins(this.scene) : null;
    if (this.cityView) {
      const boards = this.billboards, coins = this.coinsView;
      this.cityView.onChunk = (chunk) => {
        boards?.add(chunk.billboards);
        coins?.add(chunk.coins, sim);
      };
    }
    this.trafficView = sim.traffic && (sim.trafficDensity > 0 || sim.police) ? new TrafficView(this.scene, sim.traffic, sim.trafficDensity > 0) : null;
    this.pedView = sim.peds && sim.pedsDensity > 0 ? new PedView(this.scene, sim.peds) : null;
    this.hideoutView = sim.run.dropOffs.length > 0 ? new HideoutView(this.scene, sim) : null;
    this.markerView = new MarkerView(this.scene, sim, this.camera);
    this.arrow = new Arrow(this.scene, this.camera);
    this.roadblockView = sim.roadblocks ? new RoadblockView(this.scene) : null;
    this.signalView = sim.city && sim.traffic ? new SignalView(this.scene, sim) : null;
    this.breakerView = sim.breakers ? new BreakerView(this.scene, sim.breakers.descs.length) : null;
    if (sim.donuts) this.scene.add(buildDonutShop());
    this.rampView = sim.jumps ? new RampView(this.scene, sim) : null;
    if (sim.city) this.scene.add(buildSkyline(sim.city));
    this.shapes = new ShapesView(this.scene, sim.statics);
    this.setQuality(this.quality);
    if (this.cityView) {
      const p = sim.vehicle.body.translation();
      this.cityView.sync(p.x, p.z, this.quality, true);
    }
    for (const d of sim.dynamics) this.shapes.addDynamic(d);
    this.player = new PlayerCar(this.scene, sim);
    this.policeView = new PoliceView(this.scene, sim, this.player.classes.police);
    this.heliView = sim.police ? new HeliView(this.scene, sim) : null;
    this.ghost = new GhostCar(this.scene, sim);
    this.fx = new Effects(this.scene, sim, this.smoke, this.billboards);

    this.resize();
    // Effects (speed lines, sparks, ghost) first appear mid-drive; compiling their
    // programs lazily cost a 60 ms frame. Parallel compile off the critical path.
    void this.renderer.compileAsync(this.scene, this.camera).catch(() => undefined);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.sim.city ? QUALITY[this.quality].dpr : MAX_DPR) * this.auto.scale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.smoke.setViewport(h * dpr, this.camera.fov);
    this.stats.dpr = dpr;
    this.stats.width = w;
    this.stats.height = h;
  }

  /** The class whose mesh is shown (for the e2e swap check). */
  get visibleCar(): CarId {
    return this.player.visibleCar;
  }

  render(alpha: number, dt: number): void {
    const sim = this.sim;
    if (this.player.sync()) this.director.onSwap(sim.carBody, this.player.roof);
    this.shapes.update(sim.transforms, alpha);
    this.player.place(alpha);
    const car = this.player.mesh.root;
    const carPos = car.position;
    // the camera where the last frame left it and the car where this one puts it: a car between them is thinned
    this.trafficView?.update(sim.transforms, alpha, dt, this.camera.position, carPos);
    this.pedView?.update(sim.transforms, alpha);
    this.propsView?.update(sim, alpha, this.elapsed);
    this.policeView.update(alpha, this.trafficView?.fade ?? null);
    this.heliView?.update(dt);
    const tm = sim.vehicle.telemetry;
    // A fixed step can clear the sim's respawn flag before the next render frame.
    const snap = sim.respawned || this.lastCarPos.distanceToSquared(carPos) > 80 * 80;
    this.lastCarPos.copy(carPos);
    this.cityView?.sync(carPos.x, carPos.z, this.quality, snap);
    if (this.cityView && dt > 0 && dt <= 0.25) this.adaptQuality(dt);
    this.carVel.set(tm.vx, tm.vy, tm.vz);

    this.director.syncDoor();
    this.chase.update(car, this.carVel, tm, dt, snap);
    this.hideoutView?.update(sim);
    this.coinsView?.update(sim, dt, carPos);
    this.markerView.update(sim, alpha);
    this.arrow.update(sim, carPos.x, carPos.y, carPos.z);
    this.roadblockView?.update(sim);
    this.signalView?.update(sim);
    this.breakerView?.update(sim);
    this.player.update(tm, dt);
    this.ghost.update();
    this.sky.update(carPos, this.camera.position);
    this.fx.drive(tm, this.carVel, this.camera.aspect, dt);
    this.eventSeq = sim.events.readFrom(this.eventSeq, this.onEvent);
    this.director.syncFocus(carPos, this.carVel);
    this.player.mesh.setDamage(sim.life.state.stage);
    this.fx.emitSmoke(dt, car, this.carVel);
    this.player.emitTyreSmoke(dt, this.smoke, this.carVel);
    this.elapsed += dt;
    if (this.billboards && sim.collectibles) this.billboards.update(sim.collectibles);
    this.fx.update(dt, this.elapsed);

    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
  }

  /** Sim events with a visible consequence: the car crumples, parts fly off, a wreck bursts, the camera takes a jolt. */
  private handleEvent(e: SimEvent): void {
    if (e.kind === 'damage' || e.kind === 'wrecked') this.player.crumple(e);
    const jolt = this.fx.onEvent(e, this.player.mesh.root, this.carVel);
    if (jolt > 0) this.chase.kick(jolt);
  }

  dispose(): void {
    this.fx.dispose();
    this.cityView?.dispose();
    this.policeView.dispose();
    this.hideoutView?.dispose();
    this.coinsView?.dispose();
    this.markerView.dispose();
    this.roadblockView?.dispose();
    this.rampView?.dispose();
    this.renderer.dispose();
  }

  /**
   * The settings' QUALITY row (M7 slice 3): AUTO lets the frame cost choose, LOW and HIGH hold that tier. A tier the
   * URL fixed (`?quality=`, the tests) stays.
   */
  setQualityMode(mode: 'auto' | QualityTier): void {
    if (!this.auto.setMode(mode)) return;
    if (mode !== 'auto' && mode !== this.quality) this.setQuality(mode);
  }

  private setQuality(tier: QualityTier): void {
    this.quality = tier;
    if (!this.sim.city) return;
    this.sky.setTier(QUALITY[tier]);
    this.pedView?.setShadows(tier === 'high');
    this.resize();
  }

  /** The automatic quality (quality.ts) reads the frames; a tier it asks for is set here, a resolution scale applied. */
  private adaptQuality(dt: number): void {
    const step = this.auto.frame(dt, this.quality);
    if (step === 'low' || step === 'high') this.setQuality(step);
    else if (step === 'down' || step === 'up') this.resize();
  }
}
