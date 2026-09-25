/**
 * The traffic lights (M5.5 slice 17): a pole and a head on each corner of a
 * lit crossing, and three lamps on each head's face toward the traffic it
 * serves, lit by the crossing's phase. Two instanced meshes (the lamps unlit,
 * so they glow); the colours are written only when a light changes. On the
 * island (M8.10 slice 13) a pole stands at each arriving way's right kerb, on
 * its pavement's height.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, type SimWorld } from '../../sim';
import { SIGNAL, signalPoles, type SignalPole } from '../../sim/city/signals';

const RED = new THREE.Color(0xff3b30);
const AMBER = new THREE.Color(0xffb020);
const GREEN = new THREE.Color(0x3fe07a);
const DARK = new THREE.Color(0x2b2a33);
const LAMP = 0.22;
/** An island pole stands this far back from where its way arrives (m). */
const BACK = 2;

/** A pole: the grid's, with the height it stands at. */
type Pole = SignalPole & { y: number };

export class SignalView {
  private readonly mesh: THREE.InstancedMesh;
  private readonly posts: THREE.InstancedMesh;
  private readonly nodes: readonly number[];
  private readonly poles: Pole[][];
  /** Each crossing's first lamp's index (its poles' lamps follow, three a pole). */
  private readonly first: Int32Array;
  /** The phase last drawn per crossing. */
  private readonly shown: Int8Array;

  constructor(scene: THREE.Scene, sim: SimWorld) {
    const traffic = sim.traffic;
    this.nodes = traffic ? traffic.signalNodes : [];
    this.poles = this.nodes.map((id) => (traffic ? polesOf(sim, id) : []));
    // the pole and its head, one geometry in two colours
    const pole = new THREE.BoxGeometry(0.18, SIGNAL.poleHeight, 0.18).translate(0, SIGNAL.poleHeight / 2, 0);
    const head = new THREE.BoxGeometry(SIGNAL.headHalfWidth * 2, SIGNAL.headHalf * 2, SIGNAL.headHalfWidth * 2).translate(0, SIGNAL.poleHeight + SIGNAL.headHalf, 0);
    paint(pole, 0x686678);
    paint(head, PALETTE.ink);
    const post = mergeGeometries([pole, head], false);
    pole.dispose();
    head.dispose();
    const total = this.poles.reduce((n, p) => n + p.length, 0);
    this.posts = new THREE.InstancedMesh(post, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), Math.max(1, total));
    this.posts.name = 'signal-posts';
    this.posts.castShadow = true;
    let p0 = 0;
    const pm = new THREE.Matrix4();
    for (const poles of this.poles) for (const p of poles) this.posts.setMatrixAt(p0++, pm.makeTranslation(p.x, p.y, p.z));
    this.posts.count = p0;
    this.posts.visible = p0 > 0;
    this.posts.frustumCulled = false;
    scene.add(this.posts);
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(LAMP, LAMP, LAMP), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, total * 3));
    this.mesh.name = 'signal-lamps';
    const m = new THREE.Matrix4();
    let k = 0;
    this.first = new Int32Array(this.poles.length);
    this.poles.forEach((poles, n) => {
      this.first[n] = k;
      for (const p of poles) {
        for (let lamp = 0; lamp < 3; lamp++) {
          // red on top, amber, green at the bottom, standing proud of the head's face
          const y = p.y + SIGNAL.poleHeight + SIGNAL.headHalf + (1 - lamp) * 0.34;
          const out = SIGNAL.headHalfWidth + LAMP / 2 - 0.04;
          m.makeTranslation(p.x + p.fx * out, y, p.z + p.fz * out);
          this.mesh.setMatrixAt(k, m);
          this.mesh.setColorAt(k, DARK);
          k++;
        }
      }
    });
    this.mesh.count = k;
    this.mesh.visible = k > 0;
    this.mesh.frustumCulled = false;
    this.shown = new Int8Array(this.nodes.length).fill(-2);
    scene.add(this.mesh);
  }

  update(sim: SimWorld): void {
    const traffic = sim.traffic;
    if (!traffic || this.nodes.length === 0) return;
    let dirty = false;
    for (let n = 0; n < this.nodes.length; n++) {
      const phase = traffic.signalPhase(this.nodes[n] as number);
      if (phase === this.shown[n]) continue;
      this.shown[n] = phase;
      dirty = true;
      const poles = this.poles[n] as Pole[];
      for (let q = 0; q < poles.length; q++) {
        const axis = (poles[q] as Pole).axis;
        const green = phase === axis * 3, amber = phase === axis * 3 + 1;
        const base = (this.first[n] as number) + q * 3;
        this.mesh.setColorAt(base, green || amber ? DARK : RED);
        this.mesh.setColorAt(base + 1, amber ? AMBER : DARK);
        this.mesh.setColorAt(base + 2, green ? GREEN : DARK);
      }
    }
    if (dirty && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** A lit crossing's poles: the grid's four corners; on the island one at each arriving way's right kerb. */
function polesOf(sim: SimWorld, id: number): Pole[] {
  const traffic = sim.traffic, island = sim.island;
  const graph = traffic?.streets.graph;
  const node = graph?.nodes[id];
  if (!traffic || !graph || !node) return [];
  if (!island) return signalPoles(node.x, node.z).map((p) => ({ ...p, y: 0 }));
  const out: Pole[] = [];
  for (const l of graph.lanes) {
    if (l.to !== id) continue;
    const kerb = traffic.streets.footway(l) - 1.5 + SIGNAL.inset;
    if (!Number.isFinite(kerb)) continue;
    // the way it arrives, its right (−cos, sin of its heading), back from the line
    const fx = Math.sin(l.yaw), fz = Math.cos(l.yaw), rx = -Math.cos(l.yaw), rz = Math.sin(l.yaw);
    const x = l.x1 + rx * kerb - fx * BACK, z = l.z1 + rz * kerb - fz * BACK;
    out.push({ x, y: island.standAt(x, z), z, axis: traffic.axisOf(l.id) === 1 ? 1 : 0, fx: -fx, fz: -fz });
  }
  return out;
}

/** A flat vertex colour over a whole geometry. */
function paint(g: THREE.BufferGeometry, hex: number): void {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
