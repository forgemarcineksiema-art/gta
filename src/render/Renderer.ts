/**
 * Three.js view of the sim. Builds meshes from the sim's descriptors once, then
 * every frame interpolates dynamic transforms and draws. Reads sim state only.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_IDS, CAR_PRESETS, GARAGE, PALETTE, SWAP, type CarId, type DynamicDesc, type GhostPose, type ShapeDesc, type SimWorld, type StaticDesc } from '../sim';
import { ChaseCamera } from './ChaseCamera';
import { CAR_PROFILES } from './carProfiles';
import { Sparks } from './Sparks';
import { SpeedLines } from './SpeedLines';
import { buildCarMesh, type CarMesh } from './carMesh';
import { CityView, QUALITY, type QualityTier } from './CityView';
import { SHADOW_HALF, SUN_OFFSET, stableShadowTarget } from './shadows';
import { gableGeometry, prismGeometry } from './geometry';
import { buildSkyline } from './skyline';
import { TrafficView } from './TrafficView';
import { PedView } from './PedView';
import { PoliceView } from './PoliceView';
import { Billboards } from './Billboards';
import { Debris } from './Debris';
import { Smoke } from './Smoke';
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

export class Renderer {
  readonly cityView: CityView | null;
  readonly billboards: Billboards | null;
  readonly trafficView: TrafficView | null;
  readonly pedView: PedView | null;
  readonly policeView: PoliceView;
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
  private qualityCooldown = 3;
  private resolutionScale = 1;
  private readonly qualityLocked: boolean;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly chase: ChaseCamera;
  readonly stats: RenderStats = { drawCalls: 0, triangles: 0, dpr: 1, width: 0, height: 0, glRenderer: '' };
  private readonly sim: SimWorld;
  private readonly dynamics: DynamicView[] = [];
  /** One mesh per class; `car` is the visible one and follows `sim.carId` (car-swap). */
  private readonly cars: Record<CarId, CarMesh>;
  private car: CarMesh;
  private carId: CarId;
  private readonly ghost: CarMesh;
  private readonly ghostPose: GhostPose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
  private readonly sun: THREE.DirectionalLight;
  private readonly speedLines: SpeedLines;
  private readonly sparks: Sparks;
  private readonly debris: Debris;
  private readonly smoke = new Smoke();
  private eventSeq = 0;
  private smokeAcc = 0;
  private fireAcc = 0;
  private readonly wreckSmokeAcc: Float32Array;
  private readonly tmpFwd = new THREE.Vector3();
  private readonly onEvent = (e: SimEvent): void => this.handleEvent(e);
  private readonly tmpPos = new THREE.Vector3();
  private readonly lastCarPos = new THREE.Vector3(Infinity, Infinity, Infinity);
  private readonly carVel = new THREE.Vector3();
  private readonly sky: THREE.Mesh;
  private readonly tmpQa = new THREE.Quaternion();
  private readonly tmpQb = new THREE.Quaternion();
  private readonly shadowTarget = new THREE.Object3D();

  constructor(canvas: HTMLCanvasElement, sim: SimWorld, quality?: QualityTier) {
    this.sim = sim;
    this.qualityLocked = quality !== undefined;
    this.quality = quality ?? 'low';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;
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

    this.cityView = sim.city ? new CityView(this.scene, sim.city) : null;
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
    this.car = this.cars[sim.carId];
    this.policeView = new PoliceView(this.scene, sim, this.cars.police);
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
    const g = geometryFor(d.shape);
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: d.color, flatShading: true }));
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

  private syncCar(): void {
    const id = this.sim.carId;
    if (id === this.carId) return;
    const old = this.car;
    old.root.visible = false;
    for (const w of old.wheels) w.visible = false;
    this.car = this.cars[id];
    this.car.root.visible = true;
    for (const w of this.car.wheels) w.visible = true;
    this.car.setDamage(0);
    this.carId = id;
    this.chase.whip(SWAP.whipSeconds);
  }

  render(alpha: number, dt: number): void {
    this.syncCar();
    this.applyTransforms(alpha);
    this.trafficView?.update(this.sim.transforms, alpha);
    this.pedView?.update(this.sim.transforms, alpha);
    this.policeView.update(alpha);
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
    this.car.update(tm);
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
    const paint = CAR_PROFILES[this.sim.carId].paint;
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
    } else if (e.kind === 'billboard') {
      // planks in the panel's paint fly on with the car, and the camera takes a jolt
      const tint = this.billboards?.descOf(e.target)?.paint ?? PALETTE.charcoal;
      this.debris.burst(e.x, e.y, e.z, this.carVel.x * 0.6, 4, this.carVel.z * 0.6, 14, 0.5, tint, 5);
      this.debris.burst(e.x, e.y - 1, e.z, this.carVel.x * 0.4, 3, this.carVel.z * 0.4, 6, 0.25, PALETTE.steel, 3);
      this.chase.kick(0.35);
    }
  }

  /** The takedown camera looks at the wreck while the slow motion runs; released as soon as it ends or is skipped. */
  private syncFocus(): void {
    const life = this.sim.life.state;
    const traffic = this.sim.traffic;
    if (life.slowMo > 0 && life.slowMoTarget >= 0 && traffic) {
      const i = life.slowMoTarget;
      this.chase.focus(traffic.x[i] as number, 0.8, traffic.z[i] as number, 0.2);
    } else if (this.chase.focusing) {
      this.chase.release();
    }
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
    this.cityView?.dispose();
    this.policeView.dispose();
    this.hideoutView?.dispose();
    this.coinsView?.dispose();
    this.markerView.dispose();
    this.roadblockView?.dispose();
    this.rampView?.dispose();
    this.renderer.dispose();
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

  /** Start conservatively, benchmark real frames, then use hysteresis and dynamic resolution. */
  private adaptQuality(dt: number): void {
    if (this.qualityLocked) return;
    if (this.qualityCooldown > 0) { this.qualityCooldown -= dt; return; }
    this.qualityElapsed += dt; this.qualityFrames++; this.qualityTotal += dt;
    if (this.qualityElapsed < 3) return;
    const ms = this.qualityTotal * 1000 / this.qualityFrames;
    if (ms > 24 && this.quality === 'high') { this.setQuality('low'); this.qualityCooldown = 15; }
    else if (ms > 27 && this.resolutionScale > 0.65) { this.resolutionScale = Math.max(0.65, this.resolutionScale - 0.1); this.resize(); }
    else if (ms < 18 && this.resolutionScale < 1) { this.resolutionScale = Math.min(1, this.resolutionScale + 0.05); this.resize(); }
    else if (ms < 17.2 && this.quality === 'low') { this.setQuality('high'); this.qualityCooldown = 15; }
    this.qualityElapsed = 0; this.qualityFrames = 0; this.qualityTotal = 0;
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
  }
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
