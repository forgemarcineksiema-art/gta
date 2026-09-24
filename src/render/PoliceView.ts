/** Police fittings share the traffic transforms; all light comes from vertex colour. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_PRESETS, PALETTE, type CarId, type SimWorld } from '../sim';
import { AgentState } from '../sim/traffic/Traffic';
import { CAR_PROFILES } from './carProfiles';
import type { CarMesh } from './carMesh';
import { buildTrafficGeometry } from './trafficMesh';

/** A box fitting in metres above the ground, mirrored on -x where the part comes in pairs. */
interface Fitting {
  w: number; h: number; d: number;
  x: number; y: number; z: number;
}

/** Everything that makes one car class read as a pursuit unit. */
interface LiveryStyle {
  /** Belt-height flank band: its vertical slice and the z spans left blue between the white doors. */
  band: { y0: number; y1: number; zones: ReadonlyArray<readonly [number, number]> };
  frontBumper: Fitting;
  rearBumper: Fitting;
  mirror: Fitting;
  /** Housing is painted with the details, the two lenses are the flashing pair. */
  bar: { housing: Fitting; lens: Fitting };
  /** The band's paint (policeBlue unless said); a single centred red lens instead of the pair. */
  bandColor?: number;
  singleLens?: boolean;
}

const POLICE_HALF_BASE = CAR_PRESETS.police.wheelBase * 0.5;
const SPORTS_HALF_BASE = CAR_PRESETS.sports.wheelBase * 0.5;

/** Patrol saloon: band under the square shoulder, 0.9 m x 0.12 m bar across the roof at the B pillar. */
const POLICE_LIVERY: LiveryStyle = {
  // White door panels interrupt the belt stripe, leaving blue shoulders and the B pillar.
  band: { y0: 0.82, y1: 0.94, zones: [[-POLICE_HALF_BASE, -1.02], [-0.56, -0.44], [0.58, POLICE_HALF_BASE]] },
  frontBumper: { w: 1.67, h: 0.1, d: 0.14, x: 0, y: 0.42, z: 2.3 },
  rearBumper: { w: 1.67, h: 0.1, d: 0.14, x: 0, y: 0.46, z: -2.3 },
  mirror: { w: 0.19, h: 0.11, d: 0.14, x: 1.14, y: 1.07, z: 0.56 },
  bar: {
    housing: { w: 0.9, h: 0.03, d: 0.26, x: 0, y: 1.505, z: -0.5 },
    lens: { w: 0.4, h: 0.09, d: 0.24, x: 0.225, y: 1.565, z: -0.5 },
  },
};

/** Interceptor: the same two colours on the wedge, the band riding the shoulder, no roof bar
 *  but a low-profile bar half sunk into the boot deck behind the rear window, read from behind. */
const SPORTS_LIVERY: LiveryStyle = {
  // A coupe has one long door per side: blue front wing, white door, blue rear quarter.
  band: { y0: 0.63, y1: 0.75, zones: [[-SPORTS_HALF_BASE, -0.62], [0.66, SPORTS_HALF_BASE]] },
  frontBumper: { w: 1.56, h: 0.08, d: 0.12, x: 0, y: 0.325, z: 2.1 },
  rearBumper: { w: 1.6, h: 0.08, d: 0.12, x: 0, y: 0.375, z: -2.1 },
  mirror: { w: 0.17, h: 0.09, d: 0.13, x: 1.1, y: 0.87, z: 0.5 },
  bar: {
    housing: { w: 1.0, h: 0.03, d: 0.22, x: 0, y: 0.895, z: -1.65 },
    lens: { w: 0.44, h: 0.05, d: 0.2, x: 0.24, y: 0.935, z: -1.65 },
  },
};

const HEAVY_HALF_BASE = CAR_PRESETS.heavy.wheelBase * 0.5;

/** Police van (slice 7): the band along the box under the belt, broken at the door seams, a wide bar on the roof. */
const HEAVY_LIVERY: LiveryStyle = {
  band: { y0: 0.94, y1: 1.07, zones: [[-HEAVY_HALF_BASE - 0.9, 0.12], [0.28, 0.98], [1.12, HEAVY_HALF_BASE + 0.9]] },
  frontBumper: { w: 1.9, h: 0.1, d: 0.14, x: 0, y: 0.5, z: 2.74 },
  rearBumper: { w: 1.9, h: 0.1, d: 0.14, x: 0, y: 0.52, z: -2.74 },
  mirror: { w: 0.2, h: 0.14, d: 0.14, x: 1.08, y: 1.25, z: 1.0 },
  bar: {
    housing: { w: 1.3, h: 0.04, d: 0.3, x: 0, y: 2.23, z: 0.5 },
    lens: { w: 0.55, h: 0.1, d: 0.26, x: 0.33, y: 2.3, z: 0.5 },
  },
};

/** The Chief (slice 7): the interceptor's body in ink with a carOrange band and one red lens. */
const CHIEF_LIVERY: LiveryStyle = { ...SPORTS_LIVERY, bandColor: PALETTE.carOrange, singleLens: true };

/** One kit per liveried class; anything else wearing `traffic.police` renders plain. The Chief has its own. */
const LIVERIES: ReadonlyArray<readonly [CarId, LiveryStyle]> = [['police', POLICE_LIVERY], ['sports', SPORTS_LIVERY], ['heavy', HEAVY_LIVERY]];

/** Instanced meshes plus the packed-instance bookkeeping for one liveried class. */
interface LiveryKit {
  readonly details: THREE.InstancedMesh;
  readonly flashing: THREE.InstancedMesh;
  readonly unlit: THREE.InstancedMesh;
  readonly packed: Int16Array;
  readonly wrecked: Uint8Array;
  n: number;
  on: number;
  off: number;
  repaint: boolean;
}

export class PoliceView {
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly lensMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  private readonly kits: LiveryKit[] = [];
  private readonly kitOf: Partial<Record<CarId, LiveryKit>> = {};
  private readonly chiefKit: LiveryKit;
  private readonly playerDetails: THREE.Mesh;
  private readonly playerLenses: THREE.Mesh;
  private readonly playerPositions: Float32Array;
  private readonly live: Uint8Array;
  private readonly position = new THREE.Vector3();
  private readonly qa = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private phase = -1;
  private playerStage = -1;
  /** The player's own bar: -1 dark, else the phase it was last lit at (lit while the disguise holds). */
  private playerLit = -1;

  constructor(scene: THREE.Scene, private readonly sim: SimWorld, player: CarMesh) {
    const capacity = sim.traffic?.capacity ?? 1;
    this.live = new Uint8Array(capacity);
    const kitFor = (id: CarId, style: LiveryStyle, count: number): LiveryKit => {
      const source = buildTrafficGeometry(CAR_PROFILES[id], CAR_PRESETS[id]);
      const kit: LiveryKit = {
        details: this.instances(scene, buildDetails(source, 0, style), this.material, count),
        flashing: this.instances(scene, buildLenses(style.bar.lens, style.singleLens), this.lensMaterial, count),
        unlit: this.instances(scene, buildLenses(style.bar.lens, style.singleLens), this.lensMaterial, count),
        packed: new Int16Array(count).fill(-1),
        wrecked: new Uint8Array(count),
        n: 0, on: 0, off: 0, repaint: false,
      };
      source.dispose();
      this.kits.push(kit);
      return kit;
    };
    for (const [id, style] of LIVERIES) this.kitOf[id] = kitFor(id, style, capacity);
    this.chiefKit = kitFor('sports', CHIEF_LIVERY, 1);

    // Player bodies are authored relative to the sprung chassis, traffic to the ground.
    const t = sim.carId === 'police' ? sim.vehicle.tuning : CAR_PRESETS.police;
    const y0 = t.wheelRadius + t.suspensionRestLength - t.mass * (9.81 + t.extraGravity) / (4 * t.suspensionStiffness) - t.suspensionAttachY;
    const body = player.root.getObjectByName('body-and-trim') as THREE.Mesh;
    this.playerDetails = new THREE.Mesh(buildDetails(body.geometry, y0, POLICE_LIVERY), this.material.clone());
    this.playerPositions = new Float32Array(this.playerDetails.geometry.getAttribute('position').array);
    this.playerLenses = new THREE.Mesh(buildLenses(POLICE_LIVERY.bar.lens).translate(0, -y0, 0), this.lensMaterial);
    player.root.add(this.playerDetails, this.playerLenses);
  }

  private instances(scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    // three issues a draw call for an instanced mesh of no instances: an empty one is hidden (the M7 gate's A/B)
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  }

  update(alpha: number): void {
    const sim = this.sim, traffic = sim.traffic;
    const stage = sim.life.state.stage;
    if (sim.carId === 'police' && stage !== this.playerStage) {
      (this.playerDetails.material as THREE.MeshLambertMaterial).color.setHex(PALETTE.policeWhite).lerp(this.color.setHex(PALETTE.graphite), Math.min(0.85, stage * 0.25));
      const positions = this.playerDetails.geometry.getAttribute('position') as THREE.BufferAttribute;
      // The final four boxes are front/rear bumpers and mirrors, matching body damage.
      const first = positions.count - 4 * 36;
      for (let i = first; i < positions.count; i++) {
        const part = Math.floor((i - first) / 36);
        if (stage >= Math.min(3, part + 1)) positions.setXYZ(i, 0, 0, 0);
        else positions.setXYZ(i, this.playerPositions[i * 3] as number, this.playerPositions[i * 3 + 1] as number, this.playerPositions[i * 3 + 2] as number);
      }
      positions.needsUpdate = true;
      this.playerStage = stage;
    }
    // in a police car nobody has seen misbehave, the player drives with the lights on: the disguise, visible
    const lit = sim.carId === 'police' && sim.pursuit.disguised ? Math.floor(sim.time * 4) % 2 : -1;
    if (lit !== this.playerLit) {
      if (lit < 0) this.darken(this.playerLenses.geometry);
      else this.relight(this.playerLenses.geometry, lit);
      this.playerLit = lit;
    }
    if (!traffic) return;
    this.live.fill(0);
    const units = sim.police?.units;
    if (units) for (let k = 0; k < units.length; k++) {
      const id = units[k] as number;
      if (id >= 0) this.live[id] = 1;
    }
    const enabled = sim.pursuit.state !== 'idle';
    // Each lens has a full on/off cycle twice per second; the two sides alternate.
    const phase = Math.floor(sim.time * 4) % 2;
    if (phase !== this.phase) {
      for (let k = 0; k < this.kits.length; k++) this.relight((this.kits[k] as LiveryKit).flashing.geometry, phase);
      this.phase = phase;
    }
    for (let k = 0; k < this.kits.length; k++) {
      const kit = this.kits[k] as LiveryKit;
      kit.n = 0; kit.on = 0; kit.off = 0; kit.repaint = false;
    }
    const tb = sim.transforms;
    // Wrecks retain their livery even after leaving the active unit list.
    for (let i = 0; i < traffic.capacity; i++) {
      if (!traffic.police[i] || traffic.state[i] === AgentState.Free) continue;
      const kit = i === sim.police?.chief ? this.chiefKit : this.kitOf[traffic.kindOf(i)];
      if (!kit || kit.n >= kit.packed.length) continue;
      const slot = traffic.slot[i] as number, p = slot * 3, r = slot * 4;
      this.position.set(
        THREE.MathUtils.lerp(tb.prevPos[p] as number, tb.currPos[p] as number, alpha),
        THREE.MathUtils.lerp(tb.prevPos[p + 1] as number, tb.currPos[p + 1] as number, alpha),
        THREE.MathUtils.lerp(tb.prevPos[p + 2] as number, tb.currPos[p + 2] as number, alpha),
      );
      // Match TrafficView's normalized linear interpolation exactly.
      this.qa.set(
        THREE.MathUtils.lerp(tb.prevRot[r] as number, tb.currRot[r] as number, alpha),
        THREE.MathUtils.lerp(tb.prevRot[r + 1] as number, tb.currRot[r + 1] as number, alpha),
        THREE.MathUtils.lerp(tb.prevRot[r + 2] as number, tb.currRot[r + 2] as number, alpha),
        THREE.MathUtils.lerp(tb.prevRot[r + 3] as number, tb.currRot[r + 3] as number, alpha),
      ).normalize();
      this.matrix.compose(this.position, this.qa, this.scale);
      const n = kit.n;
      kit.details.setMatrixAt(n, this.matrix);
      const wrecked = traffic.state[i] === AgentState.Wrecked ? 1 : 0;
      if (kit.packed[n] !== i || kit.wrecked[n] !== wrecked) {
        this.color.setHex(wrecked ? PALETTE.charcoal : PALETTE.policeWhite);
        kit.details.setColorAt(n, this.color);
        kit.packed[n] = i;
        kit.wrecked[n] = wrecked;
        kit.repaint = true;
      }
      // a unit in the chase, or a parked patrol or roadblock car with its bar on
      if ((enabled && this.live[i] || traffic.lights[i] === 1) && !wrecked) kit.flashing.setMatrixAt(kit.on++, this.matrix);
      else kit.unlit.setMatrixAt(kit.off++, this.matrix);
      kit.n = n + 1;
    }
    for (let k = 0; k < this.kits.length; k++) {
      const kit = this.kits[k] as LiveryKit;
      kit.packed.fill(-1, kit.n);
      kit.details.count = kit.n;
      kit.flashing.count = kit.on;
      kit.unlit.count = kit.off;
      if (kit.details.visible !== kit.n > 0) kit.details.visible = kit.n > 0;
      if (kit.flashing.visible !== kit.on > 0) kit.flashing.visible = kit.on > 0;
      if (kit.unlit.visible !== kit.off > 0) kit.unlit.visible = kit.off > 0;
      if (kit.n) kit.details.instanceMatrix.needsUpdate = true;
      if (kit.on) kit.flashing.instanceMatrix.needsUpdate = true;
      if (kit.off) kit.unlit.instanceMatrix.needsUpdate = true;
      if (kit.repaint && kit.details.instanceColor) kit.details.instanceColor.needsUpdate = true;
    }
  }

  private darken(geometry: THREE.BufferGeometry): void {
    const colors = geometry.getAttribute('color') as THREE.BufferAttribute;
    this.color.setHex(PALETTE.charcoal);
    for (let i = 0; i < colors.count; i++) colors.setXYZ(i, this.color.r, this.color.g, this.color.b);
    colors.needsUpdate = true;
  }

  /** Rewrite the lens colours in place, once per phase change; off is charcoal on both sides. */
  private relight(geometry: THREE.BufferGeometry, phase: number): void {
    const colors = geometry.getAttribute('color') as THREE.BufferAttribute;
    const positions = geometry.getAttribute('position');
    // a single centred lens (the Chief's) is red on one phase and dark on the other
    let single = true;
    for (let i = 0; i < positions.count && single; i++) if (Math.abs(positions.getX(i)) > 0.3) single = false;
    for (let i = 0; i < colors.count; i++) {
      const left = positions.getX(i) < 0;
      if (single) {
        this.color.setHex(phase === 0 ? PALETTE.carRed : PALETTE.charcoal);
        colors.setXYZ(i, this.color.r, this.color.g, this.color.b);
        continue;
      }
      this.color.setHex(left === (phase === 0) ? (left ? PALETTE.policeBlue : PALETTE.carRed) : PALETTE.charcoal);
      colors.setXYZ(i, this.color.r, this.color.g, this.color.b);
    }
    colors.needsUpdate = true;
  }

  dispose(): void {
    for (const kit of this.kits) {
      kit.details.geometry.dispose();
      kit.flashing.geometry.dispose();
      kit.unlit.geometry.dispose();
    }
    this.playerDetails.geometry.dispose();
    this.playerLenses.geometry.dispose();
    (this.playerDetails.material as THREE.Material).dispose();
    this.material.dispose();
    this.lensMaterial.dispose();
  }
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  geometry.deleteAttribute('uv');
  geometry.translate(x, y, z);
  const color = new THREE.Color(hex);
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const result = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return result;
}

function fitting(f: Fitting, side: number, y0: number, hex: number): THREE.BufferGeometry {
  return box(f.w, f.h, f.d, side * f.x, f.y - y0, f.z, hex);
}

function buildLenses(lens: Fitting, single = false): THREE.BufferGeometry {
  if (single) return merge([box(lens.w, lens.h, lens.d, 0, lens.y, lens.z, PALETTE.charcoal)]);
  return merge([fitting(lens, -1, 0, PALETTE.charcoal), fitting(lens, 1, 0, PALETTE.charcoal)]);
}

type Vertex = [number, number, number];

/** Clip paint to the actual side triangles rather than laying a flat slab across a twisted loft. */
function buildDetails(source: THREE.BufferGeometry, y0: number, style: LiveryStyle): THREE.BufferGeometry {
  const positions = source.getAttribute('position'), normals = source.getAttribute('normal');
  const pos: number[] = [], col: number[] = [];
  const blue = new THREE.Color(style.bandColor ?? PALETTE.policeBlue);
  const { y0: low, y1: high, zones } = style.band;
  for (let i = 0; i < positions.count; i += 3) {
    const nx = normals.getX(i);
    if (Math.abs(nx) < 0.8) continue;
    for (const zone of zones) {
      let polygon: Vertex[] = [];
      for (let k = i; k < i + 3; k++) polygon.push([positions.getX(k), positions.getY(k) + y0, positions.getZ(k)]);
      polygon = clip(polygon, 1, low, true);
      polygon = clip(polygon, 1, high, false);
      polygon = clip(polygon, 2, zone[0], true);
      polygon = clip(polygon, 2, zone[1], false);
      for (let k = 1; k + 1 < polygon.length; k++) for (const vertex of [polygon[0], polygon[k], polygon[k + 1]] as Vertex[]) {
        pos.push(vertex[0] + Math.sign(nx) * 0.012, vertex[1] - y0, vertex[2]);
        col.push(blue.r, blue.g, blue.b);
      }
    }
  }
  const band = new THREE.BufferGeometry();
  band.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  band.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  band.computeVertexNormals();
  // Player damage removes the last four boxes in this order: front bumper, rear bumper, both mirrors.
  return merge([
    band,
    fitting(style.bar.housing, 1, y0, PALETTE.ink),
    fitting(style.frontBumper, 1, y0, PALETTE.ink),
    fitting(style.rearBumper, 1, y0, PALETTE.ink),
    fitting(style.mirror, -1, y0, PALETTE.ink),
    fitting(style.mirror, 1, y0, PALETTE.ink),
  ]);
}

function clip(input: Vertex[], axis: 1 | 2, edge: number, above: boolean): Vertex[] {
  const out: Vertex[] = [];
  for (let i = 0; i < input.length; i++) {
    const a = input[i] as Vertex, b = input[(i + 1) % input.length] as Vertex;
    const da = (a[axis] - edge) * (above ? 1 : -1), db = (b[axis] - edge) * (above ? 1 : -1);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}
