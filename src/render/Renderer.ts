/**
 * Three.js view of the sim. Builds meshes from the sim's descriptors once, then
 * every frame interpolates dynamic transforms and draws. Reads sim state only.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, type DynamicDesc, type GhostPose, type ShapeDesc, type SimWorld, type StaticDesc } from '../sim';
import { ChaseCamera } from './ChaseCamera';
import { CAR_PROFILES } from './carProfiles';
import { Sparks } from './Sparks';
import { SpeedLines } from './SpeedLines';
import { buildCarMesh, type CarMesh } from './carMesh';
import { CityView, QUALITY, type QualityTier } from './CityView';
import { SHADOW_HALF, SUN_OFFSET, stableShadowTarget } from './shadows';
import { gableGeometry } from './geometry';
import { buildSkyline } from './skyline';

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
  private readonly car: CarMesh;
  private readonly ghost: CarMesh;
  private readonly ghostPose: GhostPose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
  private readonly sun: THREE.DirectionalLight;
  private readonly speedLines: SpeedLines;
  private readonly sparks: Sparks;
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
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 1700);
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
    if (sim.city) this.scene.add(buildSkyline(sim.city));
    if (sim.statics.length) this.buildStatics(sim.statics);
    this.setQuality(this.quality);
    if (this.cityView) {
      const p = sim.vehicle.body.translation();
      this.cityView.sync(p.x, p.z, this.quality, true);
    }
    for (const d of sim.dynamics) this.addDynamic(d);
    const profile = CAR_PROFILES[sim.carId];
    this.car = buildCarMesh(sim.vehicle.tuning, profile);
    this.scene.add(this.car.root);
    for (const w of this.car.wheels) this.scene.add(w);
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

    this.resize();
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

  render(alpha: number, dt: number): void {
    this.applyTransforms(alpha);
    const tm = this.sim.vehicle.telemetry;
    const carPos = this.car.root.position;
    // A fixed step can clear the sim's respawn flag before the next render frame.
    const snap = this.sim.respawned || this.lastCarPos.distanceToSquared(carPos) > 80 * 80;
    this.lastCarPos.copy(carPos);
    this.cityView?.sync(carPos.x, carPos.z, this.quality, snap);
    if (this.cityView && dt > 0 && dt <= 0.25) this.adaptQuality(dt);
    this.carVel.set(tm.vx, tm.vy, tm.vz);

    this.chase.update(this.car.root, this.carVel, tm, dt, snap);
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

    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
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
    this.renderer.dispose();
  }

  private setQuality(tier: QualityTier): void {
    this.quality = tier;
    if (!this.sim.city) return;
    const q = QUALITY[tier];
    this.scene.fog = new THREE.Fog(PALETTE.fog, q.near, q.far);
    this.sun.shadow.mapSize.set(q.shadow, q.shadow);
    this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
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
