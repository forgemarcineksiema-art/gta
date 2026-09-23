/**
 * Job markers (docs/STYLE.md, markers; docs/M5_PLAN.md slices 1–2): a flat
 * ring on the road with a beacon post at its centre, coloured by kind
 * (delivery `carOrange`, order `carMagenta`, escape `policeBlue`), unlit so it
 * reads in the towers' shade, pulsing ±8 % in scale. All the generator's
 * markers are resident as two instanced meshes (rings, beacons): sixteen
 * instances cost two draw calls, and `count` is the live number so hidden
 * slots are not submitted.
 *
 * While a job runs the other markers hide; its target gets a ring and a
 * beacon that pulse harder, and an order's wanted car carries a ring under it
 * while it is within `ringRange` and in front of the camera. Reads sim state
 * only; no allocation per frame.
 */
import * as THREE from 'three';
import { BALANCE, FIXED_DT, PALETTE, type JobDef, type SimWorld } from '../sim';

const PULSE_HZ = 1.2;
const PULSE = 0.08;
const TARGET_PULSE = 0.16;

export const KIND_COLORS: Record<JobDef['kind'], number> = {
  delivery: PALETTE.carOrange,
  order: PALETTE.carMagenta,
  escape: PALETTE.policeBlue,
  // the time trial follows a coin line: the coin's gold
  trial: PALETTE.coin,
  // the street race: the racing lime
  race: PALETTE.carLime,
  // the zones: rage red, mayhem white
  rage: PALETTE.carRed,
  mayhem: PALETTE.carWhite,
  // a fare's mark: the taxi's yellow
  fare: PALETTE.coin,
};

export class MarkerView {
  private readonly rings: THREE.InstancedMesh;
  private readonly beacons: THREE.InstancedMesh;
  private readonly ringGeometry: THREE.BufferGeometry;
  private readonly beaconGeometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly capacity: number;
  private serial = -1;
  /** Idle markers shown (the first `idleCount` instances). */
  private idleCount = 0;
  private readonly idleX: Float32Array;
  private readonly idleZ: Float32Array;
  private readonly color = new THREE.Color();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly t = { x: 0, z: 0 };
  private targetKind: JobDef['kind'] = 'delivery';
  /** A zone job's edge on the ground (M5.5 slice 12): a thin ring its radius round the marker. */
  private readonly zone: THREE.Mesh;

  constructor(scene: THREE.Scene, sim: SimWorld, private readonly camera: THREE.Camera | null = null) {
    const r = BALANCE.jobs.markerRadius;
    this.ringGeometry = new THREE.RingGeometry(r - 0.45, r, 24).rotateX(-Math.PI / 2).translate(0, 0.08, 0);
    const h = BALANCE.jobs.beaconHeight;
    this.beaconGeometry = new THREE.CylinderGeometry(0.18, 0.18, h, 6).translate(0, h / 2, 0);
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.zone = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 128).rotateX(-Math.PI / 2).translate(0, 0.09, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
    this.zone.visible = false;
    this.zone.frustumCulled = false;
    scene.add(this.zone);
    // every def, plus the running job's target and the wanted car
    // and a fare's hailer, and a few fares' defs over the placed ones
    this.capacity = Math.max(4, sim.jobs.defs.length + 6);
    this.idleX = new Float32Array(this.capacity);
    this.idleZ = new Float32Array(this.capacity);
    this.rings = new THREE.InstancedMesh(this.ringGeometry, this.material, this.capacity);
    this.beacons = new THREE.InstancedMesh(this.beaconGeometry, this.material, this.capacity);
    for (const mesh of [this.rings, this.beacons]) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // allocate the colour attribute up front
      for (let i = 0; i < this.capacity; i++) mesh.setColorAt(i, this.color.setHex(PALETTE.carOrange));
      scene.add(mesh);
    }
  }

  update(sim: SimWorld, alpha: number): void {
    const jobs = sim.jobs;
    if (jobs.serial !== this.serial) this.rebuild(sim);
    const phase = Math.sin((sim.time + alpha * FIXED_DT) * PULSE_HZ * Math.PI * 2);
    const pulse = 1 + PULSE * phase;
    let n = 0;
    for (let i = 0; i < this.idleCount; i++) {
      this.put(this.rings, n, this.idleX[i] as number, this.idleZ[i] as number, pulse, 1);
      this.put(this.beacons, n, this.idleX[i] as number, this.idleZ[i] as number, 1, 1);
      n++;
    }
    let beacons = n;
    const running = jobs.running;
    const zone = running !== null && jobs.state === 'active' && (running.kind === 'rage' || running.kind === 'mayhem');
    if (this.zone.visible !== zone) this.zone.visible = zone;
    if (zone && running) {
      this.zone.position.set(running.x, 0, running.z);
      this.zone.scale.setScalar(BALANCE.jobs.zone.radius);
      (this.zone.material as THREE.MeshBasicMaterial).color.setHex(KIND_COLORS[running.kind]);
    }
    if (running && jobs.state === 'active' && running.kind !== 'escape' && !zone) {
      // the drop-off or the fence: where to stop (instance 0, tinted at the rebuild)
      this.put(this.rings, n, running.targetX, running.targetZ, 1 + TARGET_PULSE * phase, 1);
      this.put(this.beacons, beacons, running.targetX, running.targetZ, 1, 1);
      n++;
      beacons++;
    } else if (running && jobs.state === 'hunting' && jobs.wantedAgent >= 0 && this.wantedPose(sim, jobs.wantedAgent, alpha)) {
      this.put(this.rings, n, this.t.x, this.t.z, 0.8 + 0.1 * phase, 1);
      n++;
    }
    // a pedestrian hailing the taxi (M5.5 slice 13): a yellow beacon over them
    const hailer = sim.fares.hailer, peds = sim.peds;
    if (hailer >= 0 && peds && beacons < this.capacity) {
      this.put(this.beacons, beacons, peds.x[hailer] as number, peds.z[hailer] as number, 1, 1);
      this.beacons.setColorAt(beacons, this.color.setHex(PALETTE.coin));
      if (this.beacons.instanceColor) this.beacons.instanceColor.needsUpdate = true;
      beacons++;
    }
    if (this.rings.count !== n) this.rings.count = n;
    if (this.beacons.count !== beacons) this.beacons.count = beacons;
    if (n > 0) this.rings.instanceMatrix.needsUpdate = true;
    if (beacons > 0) this.beacons.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.ringGeometry.dispose();
    this.beaconGeometry.dispose();
    this.material.dispose();
    this.rings.dispose();
    this.beacons.dispose();
  }

  /** The idle set changed: the live markers in their kind's colour, or none while a job runs. */
  private rebuild(sim: SimWorld): void {
    const jobs = sim.jobs;
    this.serial = jobs.serial;
    this.idleCount = 0;
    if (jobs.state === 'idle') {
      for (const d of jobs.defs) {
        if (!jobs.live(d) || this.idleCount >= this.capacity - 2) continue;
        this.idleX[this.idleCount] = d.x;
        this.idleZ[this.idleCount] = d.z;
        this.tint(this.idleCount, KIND_COLORS[d.kind]);
        this.idleCount++;
      }
    }
    const running = jobs.running;
    if (running) this.targetKind = running.kind;
    this.tint(this.idleCount, KIND_COLORS[this.targetKind]);
  }

  private tint(i: number, hex: number): void {
    this.color.setHex(hex);
    this.rings.setColorAt(i, this.color);
    this.beacons.setColorAt(i, this.color);
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    if (this.beacons.instanceColor) this.beacons.instanceColor.needsUpdate = true;
  }

  private put(mesh: THREE.InstancedMesh, i: number, x: number, z: number, scale: number, height: number): void {
    this.p.set(x, 0, z);
    this.s.set(scale, height, scale);
    this.m.compose(this.p, this.q, this.s);
    mesh.setMatrixAt(i, this.m);
  }

  /** The wanted car's interpolated position, when it is close enough and in front of the camera. */
  private wantedPose(sim: SimWorld, agent: number, alpha: number): boolean {
    const traffic = sim.traffic;
    if (!traffic) return false;
    const slot = traffic.slot[agent] as number;
    const tb = sim.transforms;
    const x = (tb.prevPos[slot * 3] as number) + ((tb.currPos[slot * 3] as number) - (tb.prevPos[slot * 3] as number)) * alpha;
    const z = (tb.prevPos[slot * 3 + 2] as number) + ((tb.currPos[slot * 3 + 2] as number) - (tb.prevPos[slot * 3 + 2] as number)) * alpha;
    const p = sim.probe;
    const range = BALANCE.jobs.order.ringRange;
    if ((x - p.x) ** 2 + (z - p.z) ** 2 > range * range) return false;
    const cam = this.camera;
    if (cam) {
      // in front of the camera: the ring is a sighting aid, not a radar
      cam.getWorldDirection(this.p);
      if ((x - cam.position.x) * this.p.x + (z - cam.position.z) * this.p.z < 0) return false;
    }
    this.t.x = x;
    this.t.z = z;
    return true;
  }
}
