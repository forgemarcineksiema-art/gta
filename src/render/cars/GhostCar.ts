/**
 * The best lap's ghost on the test tracks: the player's car, translucent, no shadow, its wheels carried by the body
 * at their resting places. Hidden while the sim has no ghost pose; built the first time it has one (M8.10 slice 18: not
 * at the start).
 */
import * as THREE from 'three';
import { PALETTE, type GhostPose, type SimWorld } from '../../sim';
import { CAR_PROFILES } from './carProfiles';
import { buildCarMesh, type CarMesh } from './carMesh';
import { buildBikeMesh } from './bikeMesh';

export class GhostCar {
  private built: CarMesh | null = null;
  private readonly pose: GhostPose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };

  constructor(private readonly scene: THREE.Scene, private readonly sim: SimWorld) {}

  private get mesh(): CarMesh {
    if (this.built) return this.built;
    const t = this.sim.vehicle.tuning;
    const mesh = t.twoWheel > 0 ? buildBikeMesh(t, PALETTE.carBlue) : buildCarMesh(t, CAR_PROFILES[this.sim.carId], PALETTE.carBlue);
    mesh.root.traverse(translucent);
    for (const w of mesh.wheels) {
      w.traverse(translucent);
      mesh.root.add(w);
    }
    mesh.root.visible = false;
    this.scene.add(mesh.root);
    return (this.built = mesh);
  }

  update(): void {
    if (!this.sim.ghostPose(this.pose)) {
      if (this.built) this.built.root.visible = false;
      return;
    }
    const root = this.mesh.root;
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
