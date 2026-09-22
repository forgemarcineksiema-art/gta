/**
 * Job markers (docs/STYLE.md, markers): a flat carOrange ring on the road
 * with a beacon post at its centre, one pair per idle job def, pulsing by
 * scale so it reads from down the street. Hidden while a job runs (its
 * target is a garage, which has its own look). Up to four markers; M5 turns
 * this into the instanced version for the generator's sixteen. Rebuilds only
 * when `sim.jobs.serial` changes. Reads sim state only.
 */
import * as THREE from 'three';
import { BALANCE, PALETTE, type SimWorld } from '../sim';

const SLOTS = 4;
const PULSE_HZ = 1.2;

export class MarkerView {
  private readonly markers: THREE.Group[] = [];
  private readonly ring: THREE.BufferGeometry;
  private readonly beacon: THREE.BufferGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private serial = -1;
  private time = 0;
  private count = 0;

  constructor(scene: THREE.Scene) {
    const r = BALANCE.jobs.markerRadius;
    this.ring = new THREE.RingGeometry(r - 0.45, r, 24).rotateX(-Math.PI / 2).translate(0, 0.08, 0);
    const h = BALANCE.jobs.beaconHeight;
    this.beacon = new THREE.CylinderGeometry(0.18, 0.18, h, 6).translate(0, h / 2, 0);
    // unlit: a marker is a signal, not a surface, and must read in the shade of the towers
    this.material = new THREE.MeshBasicMaterial({ color: PALETTE.carOrange });
    for (let i = 0; i < SLOTS; i++) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(this.ring, this.material);
      const post = new THREE.Mesh(this.beacon, this.material);
      ring.castShadow = post.castShadow = false;
      g.add(ring, post);
      g.visible = false;
      scene.add(g);
      this.markers.push(g);
    }
  }

  update(sim: SimWorld, dt: number): void {
    const jobs = sim.jobs;
    if (jobs.serial !== this.serial) {
      this.serial = jobs.serial;
      this.count = 0;
      if (jobs.state === 'idle') {
        for (const d of jobs.defs) {
          const g = this.markers[this.count];
          if (!g) break;
          g.position.set(d.x, 0, d.z);
          g.visible = true;
          this.count++;
        }
      }
      for (let i = this.count; i < SLOTS; i++) (this.markers[i] as THREE.Group).visible = false;
    }
    if (this.count === 0) return;
    this.time += dt;
    const s = 1 + 0.08 * Math.sin(this.time * PULSE_HZ * Math.PI * 2);
    for (let i = 0; i < this.count; i++) (this.markers[i] as THREE.Group).scale.set(s, 1, s);
  }

  dispose(): void {
    this.ring.dispose();
    this.beacon.dispose();
    this.material.dispose();
  }
}
