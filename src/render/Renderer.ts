/**
 * Three.js view of the sim. Builds meshes from the sim's descriptors once, then
 * every frame interpolates dynamic transforms and draws. Reads sim state only.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_IDS, CAR_PRESETS, GARAGE, KIT, PALETTE, PROP_KINDS, PROP_TYPES, SWAP, bodySpec, bodyTuning, isShell, type BodyId, type CarId, type DynamicDesc, type GhostPose, type PropKind, type ShapeDesc, type SimWorld, type StaticDesc } from '../sim';
import { ChaseCamera, sideCutEye } from './ChaseCamera';
import { SignalView } from './SignalView';
import { BreakerView } from './BreakerView';
import { buildDonutShop } from './DonutShop';
import { CAR_PROFILES } from './carProfiles';
import { BODY_PROFILES } from './bodyProfiles';
import { Sparks } from './Sparks';
import { SpeedLines } from './SpeedLines';
import { buildCarMesh, restHeight, wheelGeometry, type CarMesh } from './carMesh';
import { buildFlame, buildNeon, setNeonColours, spoilerGeometry, topperGeometry } from './kitMesh';
import { CityView, QUALITY, type QualityTier } from './CityView';
import { PropsView } from './PropsView';
import { propParts } from './propMesh';
import { SHADOW_HALF, SUN_OFFSET, stableShadowTarget } from './shadows';
import { AUTO_QUALITY, qualityStep } from './quality';
import { gableGeometry, prismGeometry } from './geometry';
import { buildSkyline } from './skyline';
import { TrafficView, lowriderBounce } from './TrafficView';
import { PedView } from './PedView';
import { PoliceView } from './PoliceView';
import { HeliView } from './HeliView';
import { Billboards } from './Billboards';
import { Debris } from './Debris';
import { Smoke } from './Smoke';
import { SkidMarks } from './SkidMarks';
import { HideoutView } from './HideoutView';
import { Coins } from './Coins';
import { MarkerView } from './MarkerView';
import { Arrow } from './Arrow';
import { RoadblockView } from './RoadblockView';
import { RampView } from './RampView';
import { AgentState } from '../sim/traffic/Traffic';
import type { SimEvent } from '../sim';

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  dpr: number;
  width: number;
  height: number;
  /** UNMASKED_RENDERER_WEBGL when available (tells software GL from a real GPU). */
  glRenderer: string;
}

interface DynamicView {
  object: THREE.Object3D;
  slot: number;
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
  quality: QualityTier = 'low';
  private qualityElapsed = 0;
  private qualityFrames = 0;
  private qualityTotal = 0;
  /** Frames of the window that missed their vsync (M8.6 slice 5). */
  private qualityMissed = 0;
  private qualityCooldown = 3;
  /** Automatic tier switches this session (M7 slice 5: two and it settles). */
  private tierSwitches = 0;
  private resolutionScale = 1;
  private qualityLocked: boolean;
  /** `?quality=` fixed the tier: the settings row leaves it. */
  private readonly qualityFixed: boolean;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly chase: ChaseCamera;
  readonly stats: RenderStats = { drawCalls: 0, triangles: 0, dpr: 1, width: 0, height: 0, glRenderer: '' };
  private readonly sim: SimWorld;
  private readonly dynamics: DynamicView[] = [];
  /** One mesh per class; `car` is the visible one and follows `sim.carBody` (car-swap). */
  private readonly cars: Record<CarId, CarMesh>;
  /** The city's bodies the player has taken (or is next to): built on first need, kept (M5.5 slice 19). */
  private readonly bodyCars = new Map<BodyId, CarMesh>();
  private car: CarMesh;
  private carId: CarId;
  private bodyId: BodyId;
  /** The paint last put on a taken body's mesh. */
  private shownPaint = -1;
  private readonly ghost: CarMesh;
  private readonly ghostPose: GhostPose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
  private readonly sun: THREE.DirectionalLight;
  private readonly speedLines: SpeedLines;
  private readonly sparks: Sparks;
  private readonly debris: Debris;
  private readonly smoke = new Smoke();
  /** The tyres' marks on the ground (M7 slice 4), and the clock they fade by (stopped while paused). */
  private readonly skid: SkidMarks;
  private elapsed = 0;
  private eventSeq = 0;
  /** The garage's serial last applied to the player's meshes (the resprays). */
  private garageSerial = -1;
  /** The topper worn (the driver's kit, M6), on the roof of the car the player drives: a holder for the one shown. */
  private readonly topper = new THREE.Group();
  /** The topper shown, by kit id ('' none), and each one built so far. */
  private topperId = '';
  private readonly topperMeshes = new Map<string, THREE.Mesh>();
  private readonly topperMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  /** The rest of the kit on the car (M6 slice 7): the neon under it, a flame at each exhaust, the tyre smoke's rate. */
  private readonly neon = buildNeon();
  private readonly flames: THREE.Mesh[] = [buildFlame(), buildFlame()];
  private neonId = -2;
  private flameId = -2;
  private tyreAcc = 0;
  private tyreSide = 0;
  /** The car's kit on the car shown (M6 slice 8): the wheels', spoiler's and stance's items, the spoiler's mesh, the stance's lift. */
  private wheelsId = -2;
  private spoilerId = -2;
  private stanceId = -2;
  private kitBody: BodyId | '' = '';
  private readonly spoiler = new THREE.Mesh(new THREE.BufferGeometry(), this.topperMaterial);
  private stanceY = 0;
  /** Wheel geometries built for a style, by body and style, and each shown car's own. */
  private readonly wheelGeoms = new Map<string, THREE.BufferGeometry>();
  /** Each shown body's roof height above its origin, for the topper and the camera's fit. */
  private readonly roofY: Partial<Record<BodyId, number>>;
  private smokeAcc = 0;
  private fireAcc = 0;
  private readonly wreckSmokeAcc: Float32Array;
  private readonly tmpFwd = new THREE.Vector3();
  private readonly onEvent = (e: SimEvent): void => this.handleEvent(e);
  private readonly tmpPos = new THREE.Vector3();
  /** The takedown whose side cut is on screen, -1 when none; the cut's eye, reused. */
  private sideCut = -1;
  private readonly cutEye = { x: 0, y: 0, z: 0 };
  /** The traffic lights' lamps (M5.5 slice 17). */
  private readonly signalView: SignalView | null;
  /** The pursuit breakers (M5.5 slice 18). */
  private readonly breakerView: BreakerView | null;
  /** The last damage's contact in the car's frame: where the wreck caves in. */
  private readonly lastDent = new THREE.Vector3(0, 0.5, 2);
  private readonly lastCarPos = new THREE.Vector3(Infinity, Infinity, Infinity);
  private readonly carVel = new THREE.Vector3();
  private readonly sky: THREE.Mesh;
  private readonly tmpQa = new THREE.Quaternion();
  private readonly tmpQb = new THREE.Quaternion();
  private readonly shadowTarget = new THREE.Object3D();

  constructor(canvas: HTMLCanvasElement, sim: SimWorld, quality?: QualityTier) {
    this.sim = sim;
    this.qualityLocked = quality !== undefined;
    this.qualityFixed = quality !== undefined;
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

    // sky, fog, lights (docs/STYLE.md: late golden hour)
    this.scene.background = new THREE.Color(PALETTE.skyHorizon);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 120, 700);
    const hemi = new THREE.HemisphereLight(0xe5e4f4, 0x777184, 1.35);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(PALETTE.sun, 1.8);
    this.sun.position.set(-60, 70, -40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 700;
    const s = SHADOW_HALF;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.18;
    this.sun.shadow.intensity = 0.72;
    this.sun.target = this.shadowTarget;
    this.scene.add(this.sun, this.shadowTarget);
    this.sky = buildSkyDome();
    this.scene.add(this.sky);

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
    if (sim.statics.length) this.buildStatics(sim.statics);
    this.setQuality(this.quality);
    if (this.cityView) {
      const p = sim.vehicle.body.translation();
      this.cityView.sync(p.x, p.z, this.quality, true);
    }
    for (const d of sim.dynamics) this.addDynamic(d);
    const profile = CAR_PROFILES[sim.carId];
    const cars: Partial<Record<CarId, CarMesh>> = {};
    for (const id of CAR_IDS) {
      const mesh = buildCarMesh(id === sim.carId ? sim.vehicle.tuning : CAR_PRESETS[id], CAR_PROFILES[id]);
      this.scene.add(mesh.root);
      for (const w of mesh.wheels) this.scene.add(w);
      const visible = id === sim.carId;
      mesh.root.visible = visible;
      for (const w of mesh.wheels) w.visible = visible;
      cars[id] = mesh;
    }
    this.cars = cars as Record<CarId, CarMesh>;
    this.carId = sim.carId;
    this.bodyId = sim.carId;
    this.car = this.cars[sim.carId];
    this.roofY = {};
    for (const id of CAR_IDS) this.roofY[id] = roofOf(this.cars[id]);
    this.car.root.add(this.topper);
    this.topper.position.set(0, (this.roofY[sim.carId] ?? 1.2) - 0.02, -0.2);
    this.fitKit(sim.carId);
    this.policeView = new PoliceView(this.scene, sim, this.cars.police);
    this.heliView = sim.police ? new HeliView(this.scene, sim) : null;
    // the best-lap ghost: the same car, translucent, no shadow, wheels carried by the body
    this.ghost = buildCarMesh(sim.vehicle.tuning, profile, PALETTE.carBlue);
    this.ghost.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = (o.material as THREE.Material).clone();
        m.transparent = true;
        m.opacity = 0.35;
        m.depthWrite = false;
        o.material = m;
        o.castShadow = false;
      }
    });
    for (const w of this.ghost.wheels) {
      w.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const m = (o.material as THREE.Material).clone();
          m.transparent = true;
          m.opacity = 0.35;
          m.depthWrite = false;
          o.material = m;
          o.castShadow = false;
        }
      });
      this.ghost.root.add(w);
    }
    this.ghost.root.visible = false;
    this.scene.add(this.ghost.root);

    this.speedLines = new SpeedLines();
    this.scene.add(this.speedLines.object);
    this.sparks = new Sparks();
    this.scene.add(this.sparks.object);
    this.scene.add(this.sparks.heads);
    this.debris = new Debris(this.scene);
    this.scene.add(this.smoke.object);
    this.skid = new SkidMarks(this.scene);
    this.wreckSmokeAcc = new Float32Array(sim.traffic?.capacity ?? 1);

    this.resize();
    // Effects (speed lines, sparks, ghost) first appear mid-drive; compiling their
    // programs lazily cost a 60 ms frame. Parallel compile off the critical path.
    void this.renderer.compileAsync(this.scene, this.camera).catch(() => undefined);
  }

  private buildStatics(statics: StaticDesc[]): void {
    const geometries: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3(1, 1, 1);
    const color = new THREE.Color();
    for (const st of statics) {
      if (st.collisionOnly) continue;
      const g = geometryFor(st.shape);
      q.set(st.rotation.x, st.rotation.y, st.rotation.z, st.rotation.w);
      p.set(st.position.x, st.position.y, st.position.z);
      m.compose(p, q, sc);
      g.applyMatrix4(m);
      color.setHex(st.color);
      const n = g.getAttribute('position').count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometries.push(g);
    }
    const merged = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  private addDynamic(d: DynamicDesc): void {
    const ball = d.shape.kind === 'ball';
    const g = d.shape.kind === 'ball' ? beachBall(d.shape.radius) : geometryFor(d.shape);
    const mesh = new THREE.Mesh(g, ball ? new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }) : new THREE.MeshLambertMaterial({ color: d.color, flatShading: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.dynamics.push({ object: mesh, slot: d.slot });
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.sim.city ? QUALITY[this.quality].dpr : MAX_DPR) * this.resolutionScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.smoke.setViewport(h * dpr, this.camera.fov);
    this.stats.dpr = dpr;
    this.stats.width = w;
    this.stats.height = h;
  }

  /** Interpolate every dynamic object at `alpha` (0 = previous step, 1 = current). */
  private applyTransforms(alpha: number): void {
    const tb = this.sim.transforms;
    const apply = (obj: THREE.Object3D, slot: number) => {
      const p = slot * 3;
      const r = slot * 4;
      obj.position.set(
        lerp(tb.prevPos[p] as number, tb.currPos[p] as number, alpha),
        lerp(tb.prevPos[p + 1] as number, tb.currPos[p + 1] as number, alpha),
        lerp(tb.prevPos[p + 2] as number, tb.currPos[p + 2] as number, alpha),
      );
      this.tmpQa.set(tb.prevRot[r] as number, tb.prevRot[r + 1] as number, tb.prevRot[r + 2] as number, tb.prevRot[r + 3] as number);
      this.tmpQb.set(tb.currRot[r] as number, tb.currRot[r + 1] as number, tb.currRot[r + 2] as number, tb.currRot[r + 3] as number);
      obj.quaternion.slerpQuaternions(this.tmpQa, this.tmpQb, alpha);
    };
    for (const d of this.dynamics) apply(d.object, d.slot);
    apply(this.car.root, this.sim.vehicle.slot);
    // the stance (M6 slice 8): the body over its wheels, drawn only
    this.car.root.position.y += this.stanceY;
    // Neon Niko's lowrider bounces on its hydraulics at a standstill (M6 slice 5): the body only, drawn
    if (this.sim.carBody === 'lowrider') this.car.root.position.y += lowriderBounce(this.sim.time, this.sim.probe.speed, 0);
    const wheels = this.sim.vehicle.wheels;
    for (let i = 0; i < 4; i++) {
      const w = this.car.wheels[i];
      const ws = wheels[i];
      if (w && ws) apply(w, ws.slot);
    }
  }

  /** Car-swap: show the new class's mesh where the old one was and whip the camera onto it. */
  /** The class whose mesh is shown (for the e2e swap check). */
  get visibleCar(): CarId {
    return this.carId;
  }

  /** The body's shown mesh: a class's own, or a city body's, built hidden the first time it is needed. */
  private meshFor(body: BodyId): CarMesh {
    if (isShell(body)) return this.cars[body];
    let mesh = this.bodyCars.get(body);
    if (!mesh) {
      // built in a colour no fixed part uses, so a respray finds the paint alone (a white truck keeps a white box)
      mesh = buildCarMesh(bodyTuning(body), BODY_PROFILES[body], SENTINEL_PAINT);
      mesh.root.visible = false;
      this.scene.add(mesh.root);
      for (const w of mesh.wheels) {
        w.visible = false;
        this.scene.add(w);
      }
      this.roofY[body] = roofOf(mesh);
      this.bodyCars.set(body, mesh);
    }
    return mesh;
  }

  /**
   * The neon, the boost's flames and the tyre smoke (M6 slice 7), on whichever car the player drives: the neon
   * sized to the body's footprint on the ground under it, the flames at the tail while the boost burns, the smoke
   * off the rear tyres in a drift. Colours from the kit; the flame and the smoke have their own when none is worn.
   */
  private syncKit(): void {
    const kit = this.sim.kit;
    const neon = kit.worn('neon'), flame = kit.worn('flame');
    if (neon !== this.neonId) {
      this.neonId = neon;
      const item = neon >= 0 ? KIT[neon] : undefined;
      this.neon.visible = item !== undefined;
      if (item) setNeonColours(this.neon, item.colour, item.colour2 ?? item.colour);
    }
    if (flame !== this.flameId) {
      this.flameId = flame;
      const colour = flame >= 0 ? (KIT[flame]?.colour ?? PALETTE.carOrange) : PALETTE.carOrange;
      for (const f of this.flames) (f.material as THREE.MeshBasicMaterial).color.setHex(colour);
    }
    this.syncCarKit();
    const tm = this.sim.vehicle.telemetry;
    const burning = tm.boosting && !this.sim.life.state.wrecked;
    for (let k = 0; k < this.flames.length; k++) {
      const f = this.flames[k] as THREE.Mesh;
      if (f.visible !== burning) f.visible = burning;
      if (burning) f.scale.set(1, 1, 0.75 + 0.35 * Math.abs(Math.sin(this.sim.time * 37 + k * 1.7)));
    }
  }

  /** The car's kit on the car shown: its wheels restyled, a spoiler on its boot, its stance; stock on a car taken on the road. */
  private syncCarKit(): void {
    const kit = this.sim.kit, body = this.sim.carBody;
    const wheels = kit.worn('wheels'), spoiler = kit.worn('spoiler'), stance = kit.worn('stance');
    if (body !== this.kitBody) {
      this.kitBody = body;
      this.wheelsId = -2;
      this.spoilerId = -2;
      this.stanceId = -2;
    }
    if (wheels !== this.wheelsId) {
      this.wheelsId = wheels;
      const style = wheels >= 0 ? ({ wheelStar: 'star', wheelDish: 'dish', wheelWire: 'wire', wheelDisc: 'disc' } as Record<string, string>)[KIT[wheels]?.id ?? ''] ?? '' : '';
      const profile = BODY_PROFILES[body];
      const key = `${body}:${style || 'own'}`;
      let g = this.wheelGeoms.get(key);
      if (!g) {
        g = wheelGeometry(this.sim.vehicle.tuning, style || (profile.wheelStyle ?? profile.name));
        this.wheelGeoms.set(key, g);
      }
      for (const w of this.car.wheels) w.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry = g; });
    }
    if (spoiler !== this.spoilerId) {
      this.spoilerId = spoiler;
      const kind = ({ spoilerLip: 'lip', spoilerWing: 'wing', spoilerGiant: 'giant' } as Record<string, 'lip' | 'wing' | 'giant'>)[KIT[spoiler]?.id ?? ''];
      this.spoiler.geometry.dispose();
      this.spoiler.visible = kind !== undefined;
      if (kind) {
        const spec = bodySpec(body), profile = BODY_PROFILES[body], S = profile.sections;
        const deck = S[S.length - 2] ?? S[S.length - 1];
        const tail = S[S.length - 1];
        this.spoiler.geometry = spoilerGeometry(kind, spec.halfWidth * 1.7);
        this.car.root.add(this.spoiler);
        this.spoiler.position.set(0, (deck ? deck.roof : 0.9) - restHeight(bodyTuning(body)), (tail ? tail.z : -spec.halfLength) + 0.3);
        this.spoiler.castShadow = true;
      } else {
        this.spoiler.geometry = new THREE.BufferGeometry();
      }
    }
    if (stance !== this.stanceId) {
      this.stanceId = stance;
      const id = KIT[stance]?.id ?? '';
      this.stanceY = id === 'stanceLow' ? -0.06 : id === 'stanceHigh' ? 0.1 : 0;
      this.neon.position.y = -restHeight(bodyTuning(body)) + 0.035 - this.stanceY;
    }
  }

  /** Seats the neon and the flames on a newly shown car: its footprint, its ground, its tail. */
  private fitKit(body: BodyId): void {
    const spec = bodySpec(body), t = bodyTuning(body), profile = BODY_PROFILES[body];
    const ground = -restHeight(t);
    this.car.root.add(this.neon);
    this.neon.position.set(0, ground + 0.035 - this.stanceY, 0);
    this.neon.scale.set(spec.halfWidth * 2 + 0.5, 1, spec.halfLength * 2 + 0.4);
    const tail = profile.sections[profile.sections.length - 1];
    const tz = tail ? tail.z : -spec.halfLength, ty = (tail ? tail.floor : 0.35) + ground + 0.06;
    for (let k = 0; k < this.flames.length; k++) {
      const f = this.flames[k] as THREE.Mesh;
      this.car.root.add(f);
      f.position.set(k === 0 ? 0.36 : -0.36, ty, tz - 0.05);
    }
  }

  /** A drift's tyre smoke off the rear wheels, in the kit's colour (a pale grey when none is worn). */
  private emitTyreSmoke(dt: number): void {
    const tm = this.sim.vehicle.telemetry;
    if (!tm.drifting || tm.groundedWheels < 2 || this.sim.probe.speed < 6) { this.tyreAcc = 0; return; }
    const worn = this.sim.kit.worn('smoke');
    const colour = worn >= 0 ? (KIT[worn]?.colour ?? -1) : -1;
    const car = this.car.root;
    this.tmpFwd.set(0, 0, 1).applyQuaternion(car.quaternion);
    this.tyreAcc += 28 * dt;
    while (this.tyreAcc >= 1) {
      this.tyreAcc -= 1;
      // the rear wheels are the two behind the car's middle; one then the other
      this.tyreSide = 1 - this.tyreSide;
      let seen = 0;
      for (const w of this.car.wheels) {
        const behind = (w.position.x - car.position.x) * this.tmpFwd.x + (w.position.z - car.position.z) * this.tmpFwd.z < 0;
        if (!behind) continue;
        if (seen++ !== this.tyreSide) continue;
        this.smoke.emit('tyre', w.position.x, w.position.y - 0.1, w.position.z, this.carVel.x, this.carVel.z, 1, colour);
      }
    }
  }

  /** The topper worn now on the roof: built the first time it is worn, one child of the holder at a time. */
  private syncTopper(): void {
    const worn = this.sim.kit.worn('topper');
    const id = worn >= 0 ? (KIT[worn]?.id ?? '') : '';
    if (id === this.topperId) return;
    this.topperId = id;
    this.topper.clear();
    if (!id) return;
    let mesh = this.topperMeshes.get(id);
    if (!mesh) {
      mesh = new THREE.Mesh(topperGeometry(id), this.topperMaterial);
      mesh.name = `topper-${id}`;
      mesh.castShadow = true;
      this.topperMeshes.set(id, mesh);
    }
    this.topper.add(mesh);
  }

  private syncCar(): void {
    const sim = this.sim;
    const body = sim.carBody;
    // a car next to the player may be taken: its body's mesh is ready before the swap, not built on it
    const candidate = sim.life.state.swapCandidate;
    if (candidate >= 0 && sim.traffic) this.meshFor(sim.traffic.bodyOf(candidate));
    if (body !== this.bodyId) {
      const old = this.car;
      old.root.visible = false;
      for (const w of old.wheels) w.visible = false;
      this.car = this.meshFor(body);
      this.car.root.visible = true;
      for (const w of this.car.wheels) w.visible = true;
      this.car.setDamage(0);
      this.bodyId = body;
      this.fitKit(body);
      this.shownPaint = -1;
      // the topper is the player's: it moves to the new car's roof
      this.car.root.add(this.topper);
      const roof = this.roofY[body] ?? 1.2;
      this.topper.position.set(0, roof - 0.02, -0.2);
      this.chase.whip(SWAP.whipSeconds);
      // a bus needs the camera further back and higher to see past it
      const spec = bodySpec(body);
      this.chase.fit(Math.max(0, spec.halfLength - 2.7) * 1.1, Math.max(0, roof - 2.3) * 0.9);
    }
    this.carId = sim.carId;
    if (!isShell(body) && sim.carPaint !== this.shownPaint) {
      this.car.setPaint(sim.carPaint);
      this.shownPaint = sim.carPaint;
    }
  }

  render(alpha: number, dt: number): void {
    if (this.sim.garage.serial !== this.garageSerial) {
      // a respray on the wall shows on the car behind the door at once
      this.garageSerial = this.sim.garage.serial;
      for (const id of CAR_IDS) this.cars[id].setPaint(this.sim.garage.paintOf(id));
    }
    this.syncCar();
    this.syncTopper();
    this.syncKit();
    this.applyTransforms(alpha);
    // the camera where the last frame left it and the car where this one puts it: a car between them is thinned
    this.trafficView?.update(this.sim.transforms, alpha, dt, this.camera.position, this.car.root.position);
    this.pedView?.update(this.sim.transforms, alpha);
    this.propsView?.update(this.sim, alpha, this.elapsed);
    this.policeView.update(alpha, this.trafficView?.fade ?? null);
    this.heliView?.update(dt);
    const tm = this.sim.vehicle.telemetry;
    const carPos = this.car.root.position;
    // A fixed step can clear the sim's respawn flag before the next render frame.
    const snap = this.sim.respawned || this.lastCarPos.distanceToSquared(carPos) > 80 * 80;
    this.lastCarPos.copy(carPos);
    this.cityView?.sync(carPos.x, carPos.z, this.quality, snap);
    if (this.cityView && dt > 0 && dt <= 0.25) this.adaptQuality(dt);
    this.carVel.set(tm.vx, tm.vy, tm.vz);

    this.syncDoorCamera();
    this.chase.update(this.car.root, this.carVel, tm, dt, snap);
    this.hideoutView?.update(this.sim);
    this.coinsView?.update(this.sim, dt, this.car.root.position);
    this.markerView.update(this.sim, alpha);
    this.arrow.update(this.sim, carPos.x, carPos.y, carPos.z);
    this.roadblockView?.update(this.sim);
    this.signalView?.update(this.sim);
    this.breakerView?.update(this.sim);
    this.car.update(tm);
    // the sweeper's brushes turn while it moves (M7 slice 13)
    this.car.spin(dt, tm.speed);
    // ghost of the best lap
    if (this.sim.ghostPose(this.ghostPose)) {
      const g = this.ghostPose;
      this.ghost.root.visible = true;
      this.ghost.root.position.set(g.x, g.y, g.z);
      this.ghost.root.quaternion.set(g.qx, g.qy, g.qz, g.qw);
      this.placeGhostWheels();
    } else {
      this.ghost.root.visible = false;
    }
    // Fixed coverage and a texel-aligned light basis avoid speed-dependent shadow jumps.
    stableShadowTarget(carPos, this.sun.shadow.mapSize.x, this.tmpPos);
    this.shadowTarget.position.copy(this.tmpPos);
    this.sun.position.copy(this.tmpPos).add(SUN_OFFSET);
    // the sky dome rides with the camera so the horizon never comes closer
    this.sky.position.copy(this.camera.position);
    this.speedLines.update(tm, Math.hypot(this.carVel.x, this.carVel.z), this.camera.aspect, dt);
    this.sparks.update(tm, this.carVel, dt);
    this.eventSeq = this.sim.events.readFrom(this.eventSeq, this.onEvent);
    this.syncFocus();
    this.car.setDamage(this.sim.life.state.stage);
    this.emitSmoke(dt);
    this.emitTyreSmoke(dt);
    this.elapsed += dt;
    this.skid.update(this.sim, this.elapsed);
    if (this.billboards && this.sim.collectibles) this.billboards.update(this.sim.collectibles);
    this.debris.update(dt);
    this.smoke.update(dt);

    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
  }

  /** Sim events with a visible consequence: parts fly off, a wreck bursts. */
  private handleEvent(e: SimEvent): void {
    const car = this.car.root;
    const paint = this.sim.carPaint;
    if (e.kind === 'damage' || e.kind === 'wrecked') this.crumple(e);
    if (e.kind === 'damage') {
      this.tmpFwd.set(0, 0, 1).applyQuaternion(car.quaternion);
      const front = e.value === 1;
      const along = front ? 2.2 : e.value === 2 ? -2.2 : 0;
      this.tmpPos.copy(car.position).addScaledVector(this.tmpFwd, along);
      // thrown back off the car: its own velocity less 4 m/s along the nose, a little up, with spin
      const vx = this.carVel.x - this.tmpFwd.x * 4, vz = this.carVel.z - this.tmpFwd.z * 4;
      if (e.value <= 2) this.debris.spawn(this.tmpPos.x, this.tmpPos.y + 0.3, this.tmpPos.z, vx, 2.5, vz, 1.7, 0.09, 0.14, front ? PALETTE.silver : PALETTE.charcoal);
      else this.debris.burst(this.tmpPos.x, this.tmpPos.y + 0.9, this.tmpPos.z, vx, 1.5, vz, 3, 0.3, paint, 2.5);
    } else if (e.kind === 'wrecked') {
      this.debris.burst(e.x, e.y + 0.8, e.z, this.carVel.x * 0.5, 4, this.carVel.z * 0.5, 8, 0.45, paint, 4);
      for (let k = 0; k < 24; k++) this.smoke.emit(k % 3 ? 'fire' : 'dark', e.x, e.y + 0.9, e.z, this.carVel.x, this.carVel.z);
    } else if (e.kind === 'takedown' || e.kind === 'takedownTraffic') {
      const tint = e.target >= 0 && this.sim.traffic ? (this.sim.traffic.paint[e.target] as number) : PALETTE.charcoal;
      this.debris.burst(e.x, e.y + 0.6, e.z, 0, 3, 0, e.kind === 'takedownTraffic' ? 10 : 6, 0.4, tint, 4);
      for (let k = 0; k < 16; k++) this.smoke.emit(k % 2 ? 'fire' : 'dark', e.x, e.y + 0.8, e.z);
    } else if (e.kind === 'breaker') {
      // the tower comes down: boards and poles over the street, dust, a jolt
      this.debris.burst(e.x, e.y, e.z, this.carVel.x * 0.3, 3, this.carVel.z * 0.3, 16, 0.5, PALETTE.sand, 5);
      this.debris.burst(e.x, e.y * 0.6, e.z, 0, 2, 0, 8, 0.3, PALETTE.steel, 4);
      this.chase.kick(0.3);
    } else if (e.kind === 'smash') {
      // a prop knocked down (M8 slice 5): what its material throws from where it stood, with the knock's way; sparks off metal
      const props = this.sim.props, k = props ? props.kind[e.target] ?? 255 : 255;
      if (k !== 255) {
        const kind = PROP_KINDS[k] as PropKind, material = PROP_TYPES[kind].material;
        this.debris.smash(material, e.x, Math.min(e.y, 1.2), e.z, this.carVel.x * 0.6, this.carVel.z * 0.6, propParts(kind)[0]?.color ?? PALETTE.steel);
        if (material === 'metal') this.sparks.burst(e.x, 0.5, e.z, 24);
      }
    } else if (e.kind === 'billboard') {
      // planks in the panel's paint fly on with the car, and the camera takes a jolt
      const tint = this.billboards?.descOf(e.target)?.paint ?? PALETTE.charcoal;
      this.debris.burst(e.x, e.y, e.z, this.carVel.x * 0.6, 4, this.carVel.z * 0.6, 14, 0.5, tint, 5);
      this.debris.burst(e.x, e.y - 1, e.z, this.carVel.x * 0.4, 3, this.carVel.z * 0.4, 6, 0.25, PALETTE.steel, 3);
      this.chase.kick(0.35);
    }
  }

  /**
   * The crumple (M5.5 slice 16): each damage stage dents the shell where the hit landed, deeper stage by stage;
   * the wreck caves it in there and squashes the roof. Render only; a fresh car restores the shell.
   */
  private crumple(e: SimEvent): void {
    const car = this.car;
    car.root.updateMatrixWorld();
    if (e.kind === 'damage') {
      this.tmpPos.set(e.x, e.y, e.z);
      car.root.worldToLocal(this.tmpPos);
      this.lastDent.copy(this.tmpPos);
      car.dent(this.tmpPos.x, this.tmpPos.y, this.tmpPos.z, 0.8 + 0.15 * e.value, 0.05 + 0.03 * e.value);
    } else {
      car.dent(this.lastDent.x, this.lastDent.y, this.lastDent.z, 1.5, 0.3);
      car.dent(0, car.roofY, 0, 1.4, 0.22);
    }
  }

  /**
   * The takedown camera while the slow motion runs: a cut to a low side view across the wreck (M5.5 slice 17)
   * when a side has a clear line to it, else a look at it from the chase; released as soon as it ends or is skipped.
   */
  private syncFocus(): void {
    const life = this.sim.life.state;
    const traffic = this.sim.traffic;
    if (life.slowMo > 0 && life.slowMoTarget >= 0 && traffic) {
      const i = life.slowMoTarget;
      const wx = traffic.x[i] as number, wz = traffic.z[i] as number, wy = (traffic.y[i] as number) + 0.8;
      if (this.sideCut !== i && !this.chase.cutting && this.sim.run.state === 'running' && this.cutToSide(wx, wy, wz)) this.sideCut = i;
      if (this.sideCut !== i) this.chase.focus(wx, 0.8, wz, 0.2);
    } else {
      if (this.chase.focusing) this.chase.release();
      if (this.sideCut >= 0) {
        this.sideCut = -1;
        this.chase.releaseCut();
      }
    }
  }

  /** The side cut: the eye on the travel's left or right with a clear line to the wreck, looking past it at the car. */
  private cutToSide(wx: number, wy: number, wz: number): boolean {
    const car = this.car.root.position;
    let dx = this.carVel.x, dz = this.carVel.z;
    if (Math.hypot(dx, dz) < 1) { dx = wx - car.x; dz = wz - car.z; }
    const n = Math.hypot(dx, dz);
    if (n < 1e-3) return false;
    dx /= n; dz /= n;
    for (const side of [1, -1]) {
      const eye = sideCutEye(this.cutEye, wx, wy, wz, dx, dz, side);
      if (this.sim.clearFraction(eye.x, eye.y, eye.z, wx, wy, wz) < 0.99) continue;
      this.chase.cut(eye.x, eye.y, eye.z, wx + (car.x - wx) * 0.35, wy, wz + (car.z - wz) * 0.35);
      return true;
    }
    return false;
  }

  /**
   * The door race and the shut door are seen from inside the garage: a held cut
   * from the back corner, past the car and out through the opening, so the
   * cruisers are heard arriving and the door is seen coming down. Released the
   * moment the run is driving again (a bail-out, busted, the door opened).
   */
  private syncDoorCamera(): void {
    const run = this.sim.run;
    const site = run.dropOff >= 0 && (run.state === 'closing' || run.state === 'door') ? run.dropOffs[run.dropOff] : undefined;
    if (!site) {
      this.chase.releaseCut();
      return;
    }
    if (this.chase.cutting) return;
    const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw);
    // 1.2 m off the back wall, 4.5 m to the right, looking at the middle of the opening
    const along = GARAGE.depth / 2 - 1.2, across = 4.5, doorAlong = -GARAGE.depth / 2;
    this.chase.cut(
      site.x + fx * along - fz * across, 3.2, site.z + fz * along + fx * across,
      site.x + fx * doorAlong, 1.4, site.z + fz * doorAlong,
    );
  }

  /** Smoke and fire on the player's bonnet by damage stage, and dark smoke from wrecked traffic nearby. */
  private emitSmoke(dt: number): void {
    const stage = this.sim.life.state.stage;
    if (stage >= 2) {
      const car = this.car.root;
      this.tmpFwd.set(0, 0, 1).applyQuaternion(car.quaternion);
      this.tmpPos.copy(car.position).addScaledVector(this.tmpFwd, 1.5);
      const y = this.tmpPos.y + 0.85;
      // The same leak spread through more air at speed: half as dense at 36 km/h, a quarter at 108.
      const density = 1 / (1 + Math.hypot(this.carVel.x, this.carVel.z) / 10);
      this.smokeAcc += (stage === 2 ? 10 : 24) * dt;
      while (this.smokeAcc >= 1) { this.smokeAcc -= 1; this.smoke.emit(stage === 2 ? 'smoke' : 'dark', this.tmpPos.x, y, this.tmpPos.z, this.carVel.x, this.carVel.z, density); }
      if (stage >= 3) {
        this.fireAcc += (stage === 3 ? 20 : 25) * dt;
        while (this.fireAcc >= 1) { this.fireAcc -= 1; this.smoke.emit('fire', this.tmpPos.x, y, this.tmpPos.z, this.carVel.x, this.carVel.z, Math.max(0.5, density)); }
      }
    } else { this.smokeAcc = 0; this.fireAcc = 0; }
    const traffic = this.sim.traffic;
    if (!traffic) return;
    const px = this.car.root.position.x, pz = this.car.root.position.z;
    for (let i = 0; i < traffic.capacity; i++) {
      if (traffic.state[i] !== AgentState.Wrecked) { this.wreckSmokeAcc[i] = 0; continue; }
      const dx = (traffic.x[i] as number) - px, dz = (traffic.z[i] as number) - pz;
      if (dx * dx + dz * dz > 120 * 120) continue;
      this.wreckSmokeAcc[i] = (this.wreckSmokeAcc[i] as number) + 10 * dt;
      while ((this.wreckSmokeAcc[i] as number) >= 1) {
        this.wreckSmokeAcc[i] = (this.wreckSmokeAcc[i] as number) - 1;
        this.smoke.emit('dark', traffic.x[i] as number, 1.1, traffic.z[i] as number);
      }
    }
  }

  /** Ghost wheels ride at their static positions relative to the ghost body. */
  private placeGhostWheels(): void {
    const t = this.sim.vehicle.tuning;
    const wheels = this.sim.vehicle.wheels;
    for (let i = 0; i < 4; i++) {
      const w = this.ghost.wheels[i];
      const ws = wheels[i];
      if (!w || !ws) continue;
      const drop = t.suspensionRestLength - (t.mass * (9.81 + t.extraGravity)) / 4 / t.suspensionStiffness;
      w.position.set(ws.local.x, ws.local.y - drop, ws.local.z);
      w.quaternion.identity();
    }
  }

  dispose(): void {
    this.skid.dispose();
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
    if (this.qualityFixed) return;
    this.qualityLocked = mode !== 'auto';
    if (mode !== 'auto' && mode !== this.quality) this.setQuality(mode);
    this.qualityCooldown = 3;
    this.qualityElapsed = 0; this.qualityFrames = 0; this.qualityTotal = 0; this.qualityMissed = 0;
  }

  private setQuality(tier: QualityTier): void {
    this.quality = tier;
    if (!this.sim.city) return;
    const q = QUALITY[tier];
    this.scene.fog = new THREE.Fog(PALETTE.fog, q.near, q.far);
    this.sun.shadow.mapSize.set(q.shadow, q.shadow);
    this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    this.pedView?.setShadows(tier === 'high');
    this.resize();
  }

  /**
   * Start conservatively, benchmark real frames, then use hysteresis and dynamic resolution. A tier switch reallocates
   * the drawing buffer and the shadow map, a hitch each time: the tier settles after two switches in a session (up
   * and back down on a machine near the line would otherwise flip every 15 s, M7 slice 5); the resolution still moves.
   */
  private adaptQuality(dt: number): void {
    if (this.qualityLocked) return;
    if (this.qualityCooldown > 0) { this.qualityCooldown -= dt; return; }
    this.qualityElapsed += dt; this.qualityFrames++; this.qualityTotal += dt;
    if (dt > AUTO_QUALITY.missed) this.qualityMissed++;
    if (this.qualityElapsed < AUTO_QUALITY.window) return;
    const step = qualityStep(this.qualityTotal * 1000 / this.qualityFrames, this.qualityMissed / this.qualityFrames, this.quality, this.tierSwitches >= 2, this.resolutionScale);
    if (step === 'low' || step === 'high') { this.setQuality(step); this.qualityCooldown = 15; this.tierSwitches++; }
    else if (step === 'down') { this.resolutionScale = Math.max(AUTO_QUALITY.minScale, this.resolutionScale - 0.1); this.resize(); }
    else if (step === 'up') { this.resolutionScale = Math.min(1, this.resolutionScale + 0.05); this.resize(); }
    this.qualityElapsed = 0; this.qualityFrames = 0; this.qualityTotal = 0; this.qualityMissed = 0;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function geometryFor(shape: ShapeDesc): THREE.BufferGeometry {
  switch (shape.kind) {
    case 'box':
      return new THREE.BoxGeometry(shape.hx * 2, shape.hy * 2, shape.hz * 2);
    case 'gable':
      return gableGeometry().scale(shape.hx, shape.hy, shape.hz);
    case 'prism':
      return prismGeometry(shape.points, shape.y0, shape.y1);
    case 'cylinder':
      return new THREE.CylinderGeometry(shape.radius, shape.radius, shape.halfHeight * 2, 10);
    case 'wheel': {
      const g = new THREE.CylinderGeometry(shape.radius, shape.radius, shape.width, 12);
      g.rotateZ(Math.PI / 2);
      return g;
    }
    case 'ball':
      return new THREE.IcosahedronGeometry(shape.radius, 1);
  }
}

/** The giant ball (M5.5 slice 16): a beach ball, six gores in the palette's loud colours and white caps, flat-shaded. */
function beachBall(radius: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, 2);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const gores = [PALETTE.carRed, PALETTE.coin, PALETTE.carBlue, PALETTE.carWhite, PALETTE.carLime, PALETTE.carOrange].map((h) => new THREE.Color(h));
  const cap = new THREE.Color(PALETTE.carWhite);
  for (let t = 0; t + 2 < pos.count; t += 3) {
    // the face's centroid picks its gore by longitude, or the cap near a pole
    const cx = pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2);
    const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
    const cz = pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2);
    const gore = Math.floor((Math.atan2(cx, cz) / (Math.PI * 2) + 1) * 6) % 6;
    const c = Math.abs(cy) > radius * 0.8 ? cap : (gores[gore] as THREE.Color);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (t + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** A large inverted sphere with a vertex-colour gradient: sky for free. */
function buildSkyDome(): THREE.Mesh {
  const g = new THREE.SphereGeometry(850, 24, 12);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(PALETTE.skyTop);
  const horizon = new THREE.Color(PALETTE.skyHorizon);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 850;
    const t = Math.pow(Math.max(0, y), 0.55);
    c.copy(horizon).lerp(top, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

/** A colour no fixed part of a body uses: a taken body's mesh is built in it and resprayed at once. */
const SENTINEL_PAINT = 0x808182;

function roofOf(mesh: CarMesh): number {
  const body = mesh.root.getObjectByName('body-and-trim') as THREE.Mesh | undefined;
  body?.geometry.computeBoundingBox();
  return body?.geometry.boundingBox?.max.y ?? 1.2;
}
