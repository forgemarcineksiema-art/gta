/**
 * The headless game simulation. Owns the Rapier world, the player's vehicle and
 * every simulated object. Runs on a fixed 60 Hz step and never touches Three.js
 * or the DOM, so it is testable in Node and independent of the render rate.
 *
 * Also owns the instrumentation: a lap timer on the test track, a recorder of
 * every step (controls, pose, telemetry) and the ghost of the best lap.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { createControls, type VehicleControls } from './controls';
import { buildPlayground, type PlaygroundLayout, type SpawnPoint } from './playground';
import { POSE_STRIDE, Recorder } from './recorder';
import type { DynamicDesc, StaticDesc } from './scene';
import { LapTimer, type LapState, type TrackDef } from './track';
import { TransformBuffer } from './transforms';
import { CAR_PRESETS, type CarId } from './vehicle/presets';
import { cloneTuning, type VehicleTuning } from './vehicle/tuning';
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
  car?: CarId;
  /** Record every step (default true; costs a few typed-array writes per step). */
  record?: boolean;
}

interface TrackedBody {
  body: RAPIER.RigidBody;
  slot: number;
}

export interface GhostPose {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export class SimWorld {
  readonly world: RAPIER.World;
  readonly transforms = new TransformBuffer(512);
  readonly statics: StaticDesc[];
  readonly dynamics: DynamicDesc[] = [];
  readonly spawns: SpawnPoint[];
  readonly vehicle: Vehicle;
  readonly carId: CarId;
  readonly controls: VehicleControls = createControls();
  readonly layout: PlaygroundLayout;
  readonly track: TrackDef;
  readonly lapTimer: LapTimer;
  readonly recorder: Recorder | null;
  readonly spawnName: string;
  private readonly tracked: TrackedBody[] = [];
  private readonly scratchPos = { x: 0, y: 0, z: 0 };
  private readonly scratchRot = { x: 0, y: 0, z: 0, w: 1 };
  /** Pose stream of the best lap (x, y, z, qx, qy, qz, qw per tick), for the ghost. */
  bestLapPoses: Float32Array | null = null;

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
    this.track = this.layout.track;
    this.lapTimer = new LapTimer(this.track);
    this.recorder = opts.record === false ? null : new Recorder();

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

    this.spawnName = opts.spawn ?? 'lot';
    const spawn = this.spawns.find((s) => s.name === this.spawnName) ?? this.spawns[0];
    if (!spawn) throw new Error('playground has no spawn points');
    this.carId = opts.car ?? 'muscle';
    const tuning = opts.tuning ?? cloneTuning(CAR_PRESETS[this.carId]);
    this.vehicle = new Vehicle(this.world, this.transforms, tuning, spawn.position, spawn.yaw);
  }

  /** Advance the simulation by exactly one fixed step using the current `controls`. */
  step(): void {
    this.transforms.swap();
    this.respawned = false;
    const reset = this.controls.reset;
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
    if (reset) this.lapTimer.reset();
    this.tick++;
    this.time += FIXED_DT;

    // lap timing and the best-lap ghost
    const lap = this.lapTimer.state;
    this.lapTimer.update(pos.x, pos.z, this.tick, this.time, FIXED_DT);
    if (this.recorder) {
      const slot = this.vehicle.slot;
      this.recorder.record(this.controls, reset, this.transforms.currPos, slot * 3, this.transforms.currRot, slot * 4, this.vehicle.telemetry);
      if (lap.lapStartTick === this.tick) this.recorder.lapStarts.push(this.tick);
      if (lap.justBest && lap.completedLapStartTick >= 0) {
        this.bestLapPoses = this.recorder.slicePoses(lap.completedLapStartTick, this.tick);
      }
    }
  }

  get lap(): LapState {
    return this.lapTimer.state;
  }

  /** Pose of the best-lap ghost for the current lap progress; false when there is none to show. */
  ghostPose(out: GhostPose): boolean {
    const lap = this.lapTimer.state;
    if (!this.bestLapPoses || lap.lapStartTick < 0) return false;
    const i = this.tick - lap.lapStartTick;
    const n = this.bestLapPoses.length / POSE_STRIDE;
    if (i < 0 || i >= n) return false;
    const o = i * POSE_STRIDE;
    const p = this.bestLapPoses;
    out.x = p[o] as number;
    out.y = p[o + 1] as number;
    out.z = p[o + 2] as number;
    out.qx = p[o + 3] as number;
    out.qy = p[o + 4] as number;
    out.qz = p[o + 5] as number;
    out.qw = p[o + 6] as number;
    return true;
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
    this.lapTimer.reset();
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
