/** Police fittings share the traffic transforms; all light comes from vertex colour. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_PRESETS, PALETTE, type SimWorld } from '../sim';
import { AgentState } from '../sim/traffic/Traffic';
import { CAR_PROFILES } from './carProfiles';
import type { CarMesh } from './carMesh';
import { buildTrafficGeometry } from './trafficMesh';

export class PoliceView {
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly lensMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  private readonly details: THREE.InstancedMesh;
  private readonly flashing: THREE.InstancedMesh;
  private readonly unlit: THREE.InstancedMesh;
  private readonly playerDetails: THREE.Mesh;
  private readonly playerLenses: THREE.Mesh;
  private readonly playerPositions: Float32Array;
  private readonly live: Uint8Array;
  private readonly packed: Int16Array;
  private readonly wrecked: Uint8Array;
  private readonly position = new THREE.Vector3();
  private readonly qa = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private phase = -1;
  private playerStage = -1;

  constructor(scene: THREE.Scene, private readonly sim: SimWorld, player: CarMesh) {
    const capacity = sim.traffic?.capacity ?? 1;
    this.live = new Uint8Array(capacity);
    this.packed = new Int16Array(capacity).fill(-1);
    this.wrecked = new Uint8Array(capacity);
    const source = buildTrafficGeometry(CAR_PROFILES.police, CAR_PRESETS.police);
    this.details = this.instances(scene, buildDetails(source, 0), this.material, capacity);
    source.dispose();
    this.flashing = this.instances(scene, buildLenses(), this.lensMaterial, capacity);
    this.unlit = this.instances(scene, buildLenses(), this.lensMaterial, capacity);

    // Player bodies are authored relative to the sprung chassis, traffic to the ground.
    const t = sim.carId === 'police' ? sim.vehicle.tuning : CAR_PRESETS.police;
    const y0 = t.wheelRadius + t.suspensionRestLength - t.mass * (9.81 + t.extraGravity) / (4 * t.suspensionStiffness) - t.suspensionAttachY;
    const body = player.root.getObjectByName('body-and-trim') as THREE.Mesh;
    this.playerDetails = new THREE.Mesh(buildDetails(body.geometry, y0), this.material.clone());
    this.playerPositions = new Float32Array(this.playerDetails.geometry.getAttribute('position').array);
    this.playerLenses = new THREE.Mesh(buildLenses().translate(0, -y0, 0), this.lensMaterial);
    player.root.add(this.playerDetails, this.playerLenses);
  }

  private instances(scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
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
      const colors = this.flashing.geometry.getAttribute('color') as THREE.BufferAttribute;
      const positions = this.flashing.geometry.getAttribute('position');
      for (let i = 0; i < colors.count; i++) {
        const left = positions.getX(i) < 0;
        this.color.setHex(left === (phase === 0) ? (left ? PALETTE.policeBlue : PALETTE.carRed) : PALETTE.charcoal);
        colors.setXYZ(i, this.color.r, this.color.g, this.color.b);
      }
      colors.needsUpdate = true;
      this.phase = phase;
    }
    const tb = sim.transforms;
    let n = 0, on = 0, off = 0, repaint = false;
    // Wrecks retain their livery even after leaving the active unit list.
    for (let i = 0; i < traffic.capacity; i++) {
      if (!traffic.police[i] || traffic.state[i] === AgentState.Free) continue;
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
      this.details.setMatrixAt(n, this.matrix);
      const wrecked = traffic.state[i] === AgentState.Wrecked ? 1 : 0;
      if (this.packed[n] !== i || this.wrecked[n] !== wrecked) {
        this.color.setHex(wrecked ? PALETTE.charcoal : PALETTE.policeWhite);
        this.details.setColorAt(n, this.color);
        this.packed[n] = i;
        this.wrecked[n] = wrecked;
        repaint = true;
      }
      if (enabled && this.live[i] && !wrecked) this.flashing.setMatrixAt(on++, this.matrix);
      else this.unlit.setMatrixAt(off++, this.matrix);
      n++;
    }
    this.packed.fill(-1, n);
    this.details.count = n;
    this.flashing.count = on;
    this.unlit.count = off;
    if (n) this.details.instanceMatrix.needsUpdate = true;
    if (on) this.flashing.instanceMatrix.needsUpdate = true;
    if (off) this.unlit.instanceMatrix.needsUpdate = true;
    if (repaint && this.details.instanceColor) this.details.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.details.geometry.dispose();
    this.flashing.geometry.dispose();
    this.unlit.geometry.dispose();
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

function buildLenses(): THREE.BufferGeometry {
  return merge([
    box(0.4, 0.09, 0.24, -0.225, 1.565, -0.5, PALETTE.charcoal),
    box(0.4, 0.09, 0.24, 0.225, 1.565, -0.5, PALETTE.charcoal),
  ]);
}

type Vertex = [number, number, number];

/** Clip paint to the actual side triangles rather than laying a flat slab across a twisted loft. */
function buildDetails(source: THREE.BufferGeometry, y0: number): THREE.BufferGeometry {
  const positions = source.getAttribute('position'), normals = source.getAttribute('normal');
  const pos: number[] = [], col: number[] = [];
  const blue = new THREE.Color(PALETTE.policeBlue);
  const halfBase = CAR_PRESETS.police.wheelBase * 0.5;
  // White door panels interrupt the belt stripe, leaving blue shoulders and the B pillar.
  const bands = [[-halfBase, -1.02], [-0.56, -0.44], [0.58, halfBase]];
  for (let i = 0; i < positions.count; i += 3) {
    const nx = normals.getX(i);
    if (Math.abs(nx) < 0.8) continue;
    for (const band of bands) {
      let polygon: Vertex[] = [];
      for (let k = i; k < i + 3; k++) polygon.push([positions.getX(k), positions.getY(k) + y0, positions.getZ(k)]);
      polygon = clip(polygon, 1, 0.82, true);
      polygon = clip(polygon, 1, 0.94, false);
      polygon = clip(polygon, 2, band[0] as number, true);
      polygon = clip(polygon, 2, band[1] as number, false);
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
  return merge([
    band,
    box(0.9, 0.03, 0.26, 0, 1.505 - y0, -0.5, PALETTE.ink),
    box(1.67, 0.1, 0.14, 0, 0.42 - y0, 2.3, PALETTE.ink),
    box(1.67, 0.1, 0.14, 0, 0.46 - y0, -2.3, PALETTE.ink),
    box(0.19, 0.11, 0.14, -1.14, 1.07 - y0, 0.56, PALETTE.ink),
    box(0.19, 0.11, 0.14, 1.14, 1.07 - y0, 0.56, PALETTE.ink),
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
