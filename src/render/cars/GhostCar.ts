/**
 * The best lap's ghost on the test tracks: the player's car, translucent, no shadow, its wheels carried by the body
 * at their resting places. Hidden while the sim has no ghost pose.
 */
import * as THREE from 'three';
import { PALETTE, type GhostPose, type SimWorld } from '../../sim';
import { CAR_PROFILES } from './carProfiles';
import { buildCarMesh, type CarMesh } from './carMesh';
import { buildBikeMesh } from './bikeMesh';

export class GhostCar {
  private readonly mesh: CarMesh;
  private readonly pose: GhostPose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };

  constructor(scene: THREE.Scene, private readonly sim: SimWorld) {
    const t = sim.vehicle.tuning;
    this.mesh = t.twoWheel > 0 ? buildBikeMesh(t, PALETTE.carBlue) : buildCarMesh(t, CAR_PROFILES[sim.carId], PALETTE.carBlue);
    this.mesh.root.traverse(translucent);
    for (const w of this.mesh.wheels) {
      w.traverse(translucent);
      this.mesh.root.add(w);
    }
    this.mesh.root.visible = false;
    scene.add(this.mesh.root);
  }

  update(): void {
    const root = this.mesh.root;
    if (!this.sim.ghostPose(this.pose)) {
      root.visible = false;
      return;
    }
    const g = this.pose;
    root.visible = true;
    root.position.set(g.x, g.y, g.z);
    root.quaternion.set(g.qx, g.qy, g.qz, g.qw);
    // the wheels ride at their static positions relative to the body
    const t = this.sim.vehicle.tuning;
    const wheels = this.sim.vehicle.wheels;
    for (let i = 0; i < 4; i++) {
      const w = this.mesh.wheels[i];
      const ws = wheels[i];
      if (!w || !ws) continue;
      const drop = t.suspensionRestLength - (t.mass * (9.81 + t.extraGravity)) / 4 / t.suspensionStiffness;
      w.position.set(ws.local.x, ws.local.y - drop, ws.local.z);
      w.quaternion.identity();
    }
  }
}

function translucent(o: THREE.Object3D): void {
  if (o instanceof THREE.Mesh) {
    const m = (o.material as THREE.Material).clone();
    m.transparent = true;
    m.opacity = 0.35;
    m.depthWrite = false;
    o.material = m;
    o.castShadow = false;
  }
}
