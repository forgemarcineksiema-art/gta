/**
 * Job markers and their signs (docs/STYLE.md, markers; docs/M5_PLAN.md slices 1–2; M8.7 slice 3, DESIGN.md §20.3
 * rules 5–6): draws what `signs.ts` chooses. A flat ring on the road where a job is taken; a round sign 1.4 m
 * across, always turned to the camera, its face, its rim and its kind's pictogram (`sim/glyphs.ts`, extruded 3 cm),
 * on a steel pole or floating over a car, a walker or a door; a zone job's edge in the way's cyan; a taken ring lit
 * cyan for `FLASH` s. Unlit, like signals: they read in the towers' shade.
 *
 * All instanced: the rings, the poles, the faces, the rims, and one mesh per pictogram, hidden while none is drawn
 * (four draw calls and one per pictogram in sight). Reads sim state only; no allocation per frame.
 */
import * as THREE from 'three';
import { BALANCE, FIXED_DT, type SimWorld } from '../../sim';
import { GLYPHS, GLYPH_ORDER, digitSlot, glyphIndex, numberGlyphs, type GlyphShape } from '../../sim/glyphs';
import { SIGN_COLORS, SIGN_Y, collectSigns, newRingList, newSignList, type SignView } from './signs';

/** The way's cyan a taken ring lights in for `FLASH` s, growing by `FLASH_GROW` (M8.7 D8); a zone's edge wears it too. */
const CYAN = 0x2bd1ff;
const FLASH = 0.4;
const FLASH_GROW = 0.35;
/** The sign: its face's radius, the rim's inner radius and its reach past the face, the pictogram's square, its depth (m). */
const RADIUS = 0.7;
const RIM_IN = 0.62;
const RIM_OUT = 0.76;
const GLYPH_SIZE = 0.84;
const DEPTH = 0.03;
const POLE = 0x6d6d78;

/** A state's colours, the open ones for anything unknown. */
function stateColours(state: number): { face: number; rim: number; glyph: number; ring: number } {
  return (SIGN_COLORS[state] ?? SIGN_COLORS[0]) as { face: number; rim: number; glyph: number; ring: number };
}

/** A glyph's shapes, the unit square (y down) centred on the sign, y up, standing just in front of its face. */
function glyphGeometry(shapes: readonly GlyphShape[]): THREE.BufferGeometry {
  const at = (pts: readonly number[]): THREE.Vector2[] => {
    const out: THREE.Vector2[] = [];
    for (let i = 0; i < pts.length; i += 2) out.push(new THREE.Vector2(((pts[i] as number) - 0.5) * GLYPH_SIZE, (0.5 - (pts[i + 1] as number)) * GLYPH_SIZE));
    return out;
  };
  const list = shapes.map((s) => {
    const shape = new THREE.Shape(at(s.outer));
    for (const h of s.holes ?? []) shape.holes.push(new THREE.Path(at(h)));
    return shape;
  });
  return new THREE.ExtrudeGeometry(list, { depth: DEPTH, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, 0.012);
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number, scene: THREE.Scene, colours: boolean): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // allocate the colour attribute up front
  if (colours) for (let i = 0; i < capacity; i++) mesh.setColorAt(i, new THREE.Color(0xffffff));
  scene.add(mesh);
  return mesh;
}

export class MarkerView {
  private readonly rings: THREE.InstancedMesh;
  private readonly poles: THREE.InstancedMesh;
  private readonly faces: THREE.InstancedMesh;
  private readonly rims: THREE.InstancedMesh;
  private readonly glyphs: THREE.InstancedMesh[];
  private readonly glyphCount: Int32Array;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly material: THREE.MeshBasicMaterial;
  private readonly poleMaterial: THREE.MeshBasicMaterial;
  private readonly signs;
  private readonly ringList;
  /** A zone job's edge on the ground (M5.5 slice 12): a thin ring its radius round the marker. */
  private readonly zone: THREE.Mesh;
  /** The jobs' state last frame, and the taken ring's flash. */
  private lastState = '';
  private flashX = 0;
  private flashZ = 0;
  private flashUntil = -1;
  /** Each digit's place on a sign, by the number's length (1 or 2) and the digit; a rival's number's digits (0..10). */
  private readonly digitLocal: THREE.Matrix4[][];
  private readonly numbers: number[][];
  private readonly view: SignView = { x: 0, z: 0, dirX: 0, dirZ: 1 };
  private sim: SimWorld | null = null;
  private alpha = 0;
  private readonly color = new THREE.Color();
  private readonly m = new THREE.Matrix4();
  private readonly md = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qIdentity = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly carAt = (agent: number, out: { x: number; z: number }): boolean => {
    const sim = this.sim, traffic = sim?.traffic;
    if (!sim || !traffic) return false;
    const slot = traffic.slot[agent] as number, tb = sim.transforms, a = this.alpha;
    out.x = (tb.prevPos[slot * 3] as number) + ((tb.currPos[slot * 3] as number) - (tb.prevPos[slot * 3] as number)) * a;
    out.z = (tb.prevPos[slot * 3 + 2] as number) + ((tb.currPos[slot * 3 + 2] as number) - (tb.prevPos[slot * 3 + 2] as number)) * a;
    return true;
  };

  constructor(scene: THREE.Scene, sim: SimWorld, private readonly camera: THREE.Camera | null = null) {
    const capacity = Math.max(8, sim.jobs.defs.length + 8);
    this.signs = newSignList(capacity);
    this.ringList = newRingList(capacity);
    const r = BALANCE.jobs.markerRadius;
    const ringGeometry = new THREE.RingGeometry(r - 0.45, r, 24).rotateX(-Math.PI / 2).translate(0, 0.08, 0);
    const poleGeometry = new THREE.CylinderGeometry(0.07, 0.07, SIGN_Y, 6).translate(0, SIGN_Y / 2, 0);
    const faceGeometry = new THREE.CircleGeometry(RADIUS, 24);
    const rimGeometry = new THREE.RingGeometry(RIM_IN, RIM_OUT, 24).translate(0, 0, 0.006);
    this.geometries.push(ringGeometry, poleGeometry, faceGeometry, rimGeometry);
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.poleMaterial = new THREE.MeshBasicMaterial({ color: POLE });
    this.rings = instanced(ringGeometry, this.material, capacity + 1, scene, true);
    this.poles = instanced(poleGeometry, this.poleMaterial, capacity, scene, false);
    this.faces = instanced(faceGeometry, this.material, capacity, scene, true);
    this.rims = instanced(rimGeometry, this.material, capacity, scene, true);
    this.glyphs = GLYPH_ORDER.map((id) => {
      const g = glyphGeometry(GLYPHS[id]);
      this.geometries.push(g);
      // a digit can stand twice on one sign (10)
      return instanced(g, this.material, id.startsWith('d') ? capacity * 2 : capacity, scene, true);
    });
    this.glyphCount = new Int32Array(GLYPH_ORDER.length);
    this.numbers = Array.from({ length: 11 }, (_, n) => numberGlyphs(n).map(glyphIndex));
    this.digitLocal = [1, 2].map((count) => Array.from({ length: count }, (_, i) => {
      const slot = digitSlot(i, count);
      return new THREE.Matrix4().makeTranslation((slot.cx - 0.5) * GLYPH_SIZE, 0, 0).multiply(new THREE.Matrix4().makeScale(slot.sx, 1, 1));
    }));
    this.zone = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 128).rotateX(-Math.PI / 2).translate(0, 0.09, 0),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.7, depthWrite: false }));
    this.zone.visible = false;
    this.zone.frustumCulled = false;
    scene.add(this.zone);
  }

  update(sim: SimWorld, alpha: number): void {
    const jobs = sim.jobs;
    this.sim = sim;
    this.alpha = alpha;
    const time = sim.time + alpha * FIXED_DT;
    // a job taken: its ring lights up where it was
    if (this.lastState === 'idle' && jobs.state !== 'idle') {
      const d = jobs.defOf(jobs.active);
      if (d && d.kind !== 'fare') {
        this.flashX = d.x;
        this.flashZ = d.z;
        this.flashUntil = sim.time + FLASH;
      }
    }
    this.lastState = jobs.state;
    const cam = this.camera;
    let view: SignView | null = null;
    if (cam) {
      cam.getWorldDirection(this.dir);
      this.view.x = cam.position.x;
      this.view.z = cam.position.z;
      this.view.dirX = this.dir.x;
      this.view.dirZ = this.dir.z;
      view = this.view;
    }
    const signs = this.signs, rings = this.ringList;
    collectSigns(sim, time, view, this.carAt, signs, rings);

    // the rings on the road, and the one just taken
    let n = 0;
    for (let i = 0; i < rings.count; i++) {
      this.put(this.rings, n, rings.x[i] as number, 0, rings.z[i] as number, rings.scale[i] as number, this.qIdentity);
      this.rings.setColorAt(n, this.color.setHex(stateColours(rings.state[i] as number).ring));
      n++;
    }
    const flash = this.flashUntil - sim.time;
    if (flash > 0) {
      this.put(this.rings, n, this.flashX, 0, this.flashZ, 1 + FLASH_GROW * (1 - flash / FLASH), this.qIdentity);
      this.rings.setColorAt(n, this.color.setHex(CYAN));
      n++;
    }
    this.finish(this.rings, n);

    // a zone job's edge
    const running = jobs.running;
    const zone = running !== null && jobs.state === 'active' && (running.kind === 'rage' || running.kind === 'mayhem');
    if (this.zone.visible !== zone) this.zone.visible = zone;
    if (zone && running) {
      this.zone.position.set(running.x, 0, running.z);
      this.zone.scale.setScalar(BALANCE.jobs.zone.radius);
    }

    // the signs: each turned to the camera about the vertical
    this.glyphCount.fill(0);
    let poles = 0;
    for (let i = 0; i < signs.count; i++) {
      const x = signs.x[i] as number, y = signs.y[i] as number, z = signs.z[i] as number;
      const colours = stateColours(signs.state[i] as number);
      const yaw = cam ? Math.atan2(cam.position.x - x, cam.position.z - z) : 0;
      this.q.setFromAxisAngle(this.up, yaw);
      this.put(this.faces, i, x, y, z, 1, this.q);
      this.faces.setColorAt(i, this.color.setHex(colours.face));
      this.rims.setMatrixAt(i, this.m);
      this.rims.setColorAt(i, this.color.setHex(colours.rim));
      if (signs.pole[i] === 1) this.put(this.poles, poles++, x, 0, z, 1, this.qIdentity);
      const glyph = signs.glyph[i] as number;
      this.color.setHex(colours.glyph);
      if (glyph >= 0) {
        this.put(this.glyphs[glyph] as THREE.InstancedMesh, this.glyphCount[glyph] as number, x, y, z, 1, this.q);
        (this.glyphs[glyph] as THREE.InstancedMesh).setColorAt(this.glyphCount[glyph] as number, this.color);
        this.glyphCount[glyph] = (this.glyphCount[glyph] as number) + 1;
      } else {
        // a rival's poster number: its digits side by side
        const digits = this.numbers[Math.min(-glyph, 10)] as number[];
        const places = this.digitLocal[Math.min(digits.length, 2) - 1] as THREE.Matrix4[];
        this.p.set(x, y, z);
        this.s.set(1, 1, 1);
        this.m.compose(this.p, this.q, this.s);
        for (let k = 0; k < digits.length && k < 2; k++) {
          const g = digits[k] as number;
          const mesh = this.glyphs[g] as THREE.InstancedMesh;
          const at = this.glyphCount[g] as number;
          if (at >= mesh.instanceMatrix.count) continue;
          this.md.multiplyMatrices(this.m, places[k] as THREE.Matrix4);
          mesh.setMatrixAt(at, this.md);
          mesh.setColorAt(at, this.color);
          this.glyphCount[g] = at + 1;
        }
      }
    }
    this.finish(this.faces, signs.count);
    this.finish(this.rims, signs.count);
    this.finish(this.poles, poles);
    for (let g = 0; g < this.glyphs.length; g++) this.finish(this.glyphs[g] as THREE.InstancedMesh, this.glyphCount[g] as number);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    this.material.dispose();
    this.poleMaterial.dispose();
    for (const mesh of [this.rings, this.poles, this.faces, this.rims, ...this.glyphs]) mesh.dispose();
  }

  /** A mesh's count for this frame; hidden while it draws nothing (no draw call). */
  private finish(mesh: THREE.InstancedMesh, count: number): void {
    if (mesh.count !== count) mesh.count = count;
    const show = count > 0;
    if (mesh.visible !== show) mesh.visible = show;
    if (show) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private put(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, scale: number, q: THREE.Quaternion): void {
    this.p.set(x, y, z);
    this.s.set(scale, 1, scale);
    this.m.compose(this.p, q, this.s);
    mesh.setMatrixAt(i, this.m);
  }
}
