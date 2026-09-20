/**
 * Three.js view of the sim. Builds meshes from the sim's descriptors once, then
 * every frame interpolates dynamic transforms and draws. Reads sim state only.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, type DynamicDesc, type ShapeDesc, type SimWorld, type StaticDesc } from '../sim';
import { ChaseCamera } from './ChaseCamera';
import { SpeedStreaks } from './SpeedStreaks';
import { buildCarMesh, type CarMesh } from './carMesh';

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
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly chase: ChaseCamera;
  readonly stats: RenderStats = { drawCalls: 0, triangles: 0, dpr: 1, width: 0, height: 0, glRenderer: '' };
  private readonly sim: SimWorld;
  private readonly dynamics: DynamicView[] = [];
  private readonly car: CarMesh;
  private readonly sun: THREE.DirectionalLight;
  private readonly streaks: SpeedStreaks;
  private readonly tmpPos = new THREE.Vector3();
  private readonly carVel = new THREE.Vector3();
  private readonly sky: THREE.Mesh;
  private readonly tmpQa = new THREE.Quaternion();
  private readonly tmpQb = new THREE.Quaternion();
  private readonly shadowTarget = new THREE.Object3D();

  constructor(canvas: HTMLCanvasElement, sim: SimWorld) {
    this.sim = sim;
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

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 900);
    this.chase = new ChaseCamera(this.camera);

    // sky, fog, lights (docs/STYLE.md: late golden hour)
    this.scene.background = new THREE.Color(PALETTE.skyHorizon);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 120, 700);
    const hemi = new THREE.HemisphereLight(0xffd9b8, 0x5a4a6e, 0.9);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(PALETTE.sun, 2.2);
    this.sun.position.set(-60, 70, -40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 260;
    const s = 60;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.sun.target = this.shadowTarget;
    this.scene.add(this.sun, this.shadowTarget);
    this.sky = buildSkyDome();
    this.scene.add(this.sky);

    this.buildStatics(sim.statics);
    for (const d of sim.dynamics) this.addDynamic(d);
    this.car = buildCarMesh(sim.vehicle.tuning);
    this.scene.add(this.car.root);
    for (const w of this.car.wheels) this.scene.add(w);

    this.streaks = new SpeedStreaks();
    this.scene.add(this.streaks.object);

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
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
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
    this.carVel.set(tm.vx, tm.vy, tm.vz);

    this.chase.update(this.car.root, this.carVel, tm, dt, this.sim.respawned);
    this.car.update(tm);
    // shadow frustum follows the car and widens with speed so fast driving keeps shadowed ground ahead
    const speed = Math.abs(tm.speed);
    const half = 40 + Math.min(60, speed * 1.2);
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - half) > 2) {
      sc.left = -half;
      sc.right = half;
      sc.top = half;
      sc.bottom = -half;
      sc.updateProjectionMatrix();
    }
    this.tmpPos.copy(carPos);
    this.shadowTarget.position.copy(this.tmpPos);
    this.sun.position.set(this.tmpPos.x - 60, this.tmpPos.y + 90, this.tmpPos.z - 40);
    // the sky dome rides with the camera so the horizon never comes closer
    this.sky.position.copy(this.camera.position);
    this.streaks.update(this.camera.position, carPos, this.carVel, tm, dt);

    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function geometryFor(shape: ShapeDesc): THREE.BufferGeometry {
  switch (shape.kind) {
    case 'box':
      return new THREE.BoxGeometry(shape.hx * 2, shape.hy * 2, shape.hz * 2);
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
