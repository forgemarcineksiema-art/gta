/**
 * The headless game simulation. Owns the Rapier world, the player's vehicle and
 * every simulated object. Runs on a fixed 60 Hz step and never touches Three.js
 * or the DOM, so it is testable in Node and independent of the render rate.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { createControls, type VehicleControls } from './controls';
import { buildPlayground, type PlaygroundLayout, type SpawnPoint } from './playground';
import type { DynamicDesc, StaticDesc } from './scene';
import { TransformBuffer } from './transforms';
import { DEFAULT_TUNING, cloneTuning, type VehicleTuning } from './vehicle/tuning';
import { Vehicle } from './vehicle/Vehicle';

export const FIXED_DT = 1 / 60;
export const FIXED_HZ = 60;
/** Below this height the car has fallen off the world and is respawned. */
const KILL_Y = -25;

let physicsReady: Promise<void> | null = null;

/** Loads the Rapier WASM once. Safe to call many times. */
export function initPhysics(): Promise<void> {
  physicsReady ??= RAPIER.init();
  return physicsReady;
}

export interface SimWorldOptions {
  tuning?: VehicleTuning;
  spawn?: string;
}

interface TrackedBody {
  body: RAPIER.RigidBody;
  slot: number;
}

export class SimWorld {
  readonly world: RAPIER.World;
  readonly transforms = new TransformBuffer(512);
  readonly statics: StaticDesc[];
  readonly dynamics: DynamicDesc[] = [];
  readonly spawns: SpawnPoint[];
  readonly vehicle: Vehicle;
  readonly controls: VehicleControls = createControls();
  readonly layout: PlaygroundLayout;
  private readonly tracked: TrackedBody[] = [];
  private readonly scratchPos = { x: 0, y: 0, z: 0 };
  private readonly scratchRot = { x: 0, y: 0, z: 0, w: 1 };

  tick = 0;
  time = 0;
  /** Set when the vehicle was respawned this step (for the renderer to snap the camera). */
  respawned = false;

  /** `initPhysics()` must have resolved before constructing. */
  constructor(opts: SimWorldOptions = {}) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_DT;
    this.layout = buildPlayground(this.world);
    this.statics = this.layout.statics;
    this.spawns = this.layout.spawns;

    for (const p of this.layout.props) {
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.position.x, p.position.y, p.position.z)
        .setRotation(p.rotation)
        .setLinearDamping(0.4)
        .setAngularDamping(0.8);
      const body = this.world.createRigidBody(bodyDesc);
      const colliderDesc =
        p.shape.kind === 'cylinder'
          ? RAPIER.ColliderDesc.cylinder(p.shape.halfHeight, p.shape.radius)
          : RAPIER.ColliderDesc.cuboid(p.shape.hx, p.shape.hy, p.shape.hz);
      colliderDesc.setMass(p.mass).setFriction(0.8).setRestitution(0.2);
      this.world.createCollider(colliderDesc, body);
      const slot = this.transforms.allocate();
      this.tracked.push({ body, slot });
      this.dynamics.push({ id: `prop${this.dynamics.length}`, shape: p.shape, color: p.color, slot, tag: 'prop' });
      this.transforms.writeBoth(slot, p.position.x, p.position.y, p.position.z, p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w);
    }

    const spawn = this.spawns.find((s) => s.name === (opts.spawn ?? 'lot')) ?? this.spawns[0];
    if (!spawn) throw new Error('playground has no spawn points');
    this.vehicle = new Vehicle(this.world, this.transforms, opts.tuning ?? cloneTuning(DEFAULT_TUNING), spawn.position, spawn.yaw);
  }

  /** Advance the simulation by exactly one fixed step using the current `controls`. */
  step(): void {
    this.transforms.swap();
    this.respawned = false;
    this.vehicle.update(this.controls, FIXED_DT);
    this.controls.reset = false;
    this.world.step();
    this.vehicle.writeTransforms();
    for (const t of this.tracked) {
      const p = t.body.translation(this.scratchPos);
      const r = t.body.rotation(this.scratchRot);
      this.transforms.write(t.slot, p.x, p.y, p.z, r.x, r.y, r.z, r.w);
    }
    // keep the reset target on the nearest spawn point and catch falls
    const pos = this.vehicle.body.translation(this.scratchPos);
    const nearest = this.nearestSpawn(pos.x, pos.z);
    this.vehicle.resetPose.position = nearest.position;
    this.vehicle.resetPose.yaw = nearest.yaw;
    if (pos.y < KILL_Y) {
      this.vehicle.teleport(nearest.position, nearest.yaw);
      this.respawned = true;
    }
    this.tick++;
    this.time += FIXED_DT;
  }

  nearestSpawn(x: number, z: number): SpawnPoint {
    let best = this.spawns[0] as SpawnPoint;
    let bestD = Infinity;
    for (const s of this.spawns) {
      const dx = s.position.x - x;
      const dz = s.position.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /** Teleport the player to a named spawn (dev panel / tests). */
  spawnAt(name: string): void {
    const s = this.spawns.find((sp) => sp.name === name);
    if (!s) return;
    this.vehicle.teleport(s.position, s.yaw);
    this.respawned = true;
  }

  /** True when any tracked body has a non-finite transform (soak test). */
  hasNaN(): boolean {
    const b = this.transforms;
    for (let i = 0; i < b.count * 3; i++) if (!Number.isFinite(b.currPos[i])) return true;
    for (let i = 0; i < b.count * 4; i++) if (!Number.isFinite(b.currRot[i])) return true;
    return false;
  }

  dispose(): void {
    this.world.free();
  }
}
