/**
 * The headless game simulation. Owns the Rapier world, the player's vehicle and
 * every simulated object. Runs on a fixed 60 Hz step and never touches Three.js
 * or the DOM, so it is testable in Node and independent of the render rate.
 *
 * Also owns the instrumentation: a lap timer on the test track, a recorder of
 * every step (controls, pose, telemetry) and the ghost of the best lap.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { City } from './city/City';
import { coverSites, type CoverSites } from './city/cover';
import { Roadblocks } from './police/Roadblocks';
import { Cameras } from './city/cameras';
import { Jumps } from './city/jumps';
import { createControls, type VehicleControls } from './controls';
import { EventLog } from './events';
import { Collectibles } from './city/collectibles';
import { Coins } from './city/coins';
import { Caches } from './city/caches';
import { Life } from './life/Life';
import { Heat } from './heat/Heat';
import { Police } from './police/Police';
import { Pursuit } from './police/Pursuit';
import { ColdOpen } from './run/ColdOpen';
import { Run } from './run/Run';
import { Jobs } from './jobs/Jobs';
import { jobsFor } from './jobs/place';
import { Garage } from './garage/Garage';
import { Dailies } from './dailies/Dailies';
import { apply as applySave, type SaveV1 } from './save/format';
import { buildPlayground, type PlaygroundLayout, type SpawnPoint } from './playground';
import { POSE_STRIDE, Recorder } from './recorder';
import type { DynamicDesc, StaticDesc } from './scene';
import { LapTimer, type LapState, type TrackDef } from './track';
import { Pedestrians } from './traffic/Pedestrians';
import { Traffic, type PlayerProbe } from './traffic/Traffic';
import { PEDS, TRAFFIC } from './traffic/tuning';
import { SimPhase, type PhaseMark } from './profile';
import { TransformBuffer } from './transforms';
import { CAR_PRESETS, type CarId } from './vehicle/presets';
import { cloneTuning, type VehicleTuning } from './vehicle/tuning';
import { Vehicle } from './vehicle/Vehicle';
import * as M from './math';

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
  map?: 'city' | 'playground';
  seed?: number;
  tuning?: VehicleTuning;
  spawn?: string;
  car?: CarId;
  /** Record every step (default true on playground, false in the city). */
  record?: boolean;
  /** Traffic density scale. 0 disables. Default 1. The pool arrives in a later slice. */
  traffic?: number;
  /** Pedestrian density scale. 0 disables. Default 1. */
  peds?: number;
  /** Damage, wrecks and respawn. Default: on in the city, off on the playground (the handling lab keeps the M1 pins). */
  damage?: boolean;
  /** Initial heat points for pursuit probes. Normal play starts quiet. */
  heat?: number;
  /**
   * The player's save (docs/M5_PLAN.md slice 0), applied once every subsystem exists: the garage car, its
   * paint and tiers, the seen flag, the bank, the coins, the billboards, the dailies and the streak. `car`
   * still wins for dev runs.
   */
  save?: SaveV1;
  /** Start the cold open at boot (after the save: a save that has seen it keeps it off). */
  coldOpen?: boolean;
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
  readonly city: City | null;
  private readonly roadReset: SpawnPoint = { name: 'nearest-road', position: { x: 0, y: 1, z: 0 }, yaw: 0 };
  readonly world: RAPIER.World;
  readonly transforms = new TransformBuffer(1024);
  readonly events = new EventLog();
  /** Density scales from `SimWorldOptions`. Read by the life systems when they exist. */
  readonly trafficDensity: number;
  readonly pedsDensity: number;
  /** Null on the playground. Density 0 still constructs them so tests can `spawnAt`. */
  readonly traffic: Traffic | null;
  readonly peds: Pedestrians | null;
  readonly life: Life;
  readonly heat: Heat;
  readonly pursuit: Pursuit;
  readonly police: Police | null;
  /** The drop-offs, roadblock chokepoints, parked-patrol junctions and camera sites; null on the playground. */
  readonly cover: CoverSites | null;
  /** Level 3's roadblocks and spike strips; null on the playground. */
  readonly roadblocks: Roadblocks | null;
  /** The ten speed cameras; null on the playground. */
  readonly cameras: Cameras | null;
  /** The twenty stunt ramps' launches and landings; null on the playground. */
  readonly jumps: Jumps | null;
  /** Bag, bank, the doors and busted: what ends a run (M4). Empty drop-offs on the playground. */
  readonly run: Run;
  /** The sixteen job markers, the running job, its clock and its payout. */
  readonly jobs: Jobs;
  /** The first run's script; inactive until `start()`. */
  readonly coldOpen: ColdOpen;
  /** The catalogue, paint, upgrades and prep: the wall's pages (M5 slice 4). */
  readonly garage: Garage;
  /** The day's three challenges and the streak (M5 slice 6). */
  readonly dailies: Dailies;
  /** The city's smashable billboards; null on the playground. */
  readonly collectibles: Collectibles | null;
  /** Coins on the road and the spill pool; null on the playground. */
  readonly coins: Coins | null;
  /** The day's thirty caches (DESIGN.md §13.5); null on the playground. */
  readonly caches: Caches | null;
  readonly statics: StaticDesc[];
  readonly dynamics: DynamicDesc[] = [];
  readonly spawns: SpawnPoint[];
  readonly vehicle: Vehicle;
  /** The player's class; car-swap changes it. */
  carId: CarId;
  readonly controls: VehicleControls = createControls();
  readonly layout: PlaygroundLayout;
  readonly track: TrackDef;
  readonly lapTimer: LapTimer;
  readonly recorder: Recorder | null;
  readonly spawnName: string;
  private readonly tracked: TrackedBody[] = [];
  private readonly scratchPos = { x: 0, y: 0, z: 0 };
  private readonly scratchRot = { x: 0, y: 0, z: 0, w: 1 };
  /** The player's footprint and motion this step, filled before the life systems run. */
  readonly probe: PlayerProbe = { x: 0, y: 0.5, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, halfWidth: 0, halfLength: 0 };
  /** Pose stream of the best lap (x, y, z, qx, qy, qz, qw per tick), for the ghost. */
  bestLapPoses: Float32Array | null = null;

  tick = 0;
  time = 0;
  /** Set when the vehicle was respawned this step (for the renderer to snap the camera). */
  respawned = false;
  /** Per-phase timing hook, installed from outside the sim (`src/app/simProfile.ts`). Null in tests and in play. */
  mark: PhaseMark | null = null;

  /** `initPhysics()` must have resolved before constructing. */
  constructor(opts: SimWorldOptions = {}) {
    this.trafficDensity = opts.traffic ?? 1;
    this.pedsDensity = opts.peds ?? 1;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_DT;
    this.city = opts.map === 'city' ? new City(this.world, opts.seed) : null;
    this.layout = this.city ? { statics: [], props: [], spawns: this.city.spawns, track: this.city.route, groundSize: 1575 } : buildPlayground(this.world);
    this.statics = this.layout.statics;
    this.spawns = this.layout.spawns;
    this.track = this.layout.track;
    this.lapTimer = new LapTimer(this.track);
    this.recorder = (opts.record ?? !this.city) ? new Recorder() : null;

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
      // props keep their old contact numbers against the slippery chassis: the Max rule wins
      // over the chassis Min for friction (0.55 was the previous average), Multiply gives 0.12 bounce
      colliderDesc
        .setMass(p.mass)
        .setFriction(0.55)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
        .setRestitution(0.6)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply);
      this.world.createCollider(colliderDesc, body);
      const slot = this.transforms.allocate();
      this.tracked.push({ body, slot });
      this.dynamics.push({ id: `prop${this.dynamics.length}`, shape: p.shape, color: p.color, slot, tag: 'prop' });
      this.transforms.writeBoth(slot, p.position.x, p.position.y, p.position.z, p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w);
    }

    this.spawnName = opts.spawn ?? (this.city ? 'city' : 'lot');
    const spawn = this.spawns.find((s) => s.name === this.spawnName) ?? this.spawns[0];
    if (!spawn) throw new Error('map has no spawn points');
    this.carId = opts.car ?? 'muscle';
    const tuning = opts.tuning ?? cloneTuning(CAR_PRESETS[this.carId]);
    this.vehicle = new Vehicle(this.world, this.transforms, tuning, spawn.position, spawn.yaw);
    this.garage = new Garage(this);
    this.traffic = this.city ? new Traffic(this.world, this.transforms, this.city, opts.seed ?? 42, TRAFFIC, this.trafficDensity) : null;
    this.peds = this.city && this.traffic ? new Pedestrians(this.transforms, this.city, this.traffic.lanes, opts.seed ?? 42, PEDS, this.pedsDensity) : null;
    this.collectibles = this.city ? new Collectibles(this.city) : null;
    this.coins = this.city && this.traffic ? new Coins(this.city, this.traffic.lanes) : null;
    this.life = new Life(this, opts.damage ?? this.city !== null);
    this.heat = new Heat(this.events, this.traffic);
    this.heat.set(opts.heat ?? 0);
    this.pursuit = new Pursuit(this.events);
    this.pursuit.descriptor.kind = this.carId;
    this.pursuit.descriptor.paint = this.garage.paintOf(this.carId);
    this.cover = this.city ? coverSites(this.city) : null;
    this.police = this.traffic ? new Police(this) : null;
    // a crime in a unit's sight pays double and makes the player wanted (DESIGN.md §13.3)
    this.heat.seen = () => this.police?.crimeSeen() ?? false;
    this.heat.playerSpeed = () => this.probe.speed;
    this.roadblocks = this.traffic && this.cover ? new Roadblocks(this, this.cover.chokepoints) : null;
    this.cameras = this.cover ? new Cameras(this.cover.cameraSites, this.cover.daily.cameras) : null;
    this.jumps = this.city ? new Jumps(this, this.city.jumps) : null;
    // the generator's sixteen markers (docs/M5_PLAN.md D4); the cold open adds its own as id 0
    this.jobs = new Jobs(this, this.city && this.traffic ? jobsFor(this.city, opts.seed ?? 42, this.traffic.lanes) : []);
    this.run = new Run(this);
    this.coldOpen = new ColdOpen(this);
    this.dailies = new Dailies(this);
    this.caches = this.coins ? new Caches(this) : null;
    this.city?.sync(spawn.position.x, spawn.position.z, true);
    if (opts.save) {
      applySave(this, opts.save);
      // a dev run's class wins over the garage car, for this session only
      if (opts.car && opts.car !== this.carId) this.setCar(opts.car);
      if (opts.tuning) {
        this.vehicle.tuning = opts.tuning;
        this.vehicle.applyTuning();
      }
    }
    if (opts.coldOpen) this.coldOpen.start();
  }

  /** Advance the simulation by exactly one fixed step using the current `controls`. */
  step(): void {
    if (this.city) {
      const pos = this.vehicle.body.translation(this.scratchPos);
      // The reset pose only has to be fresh when a reset can happen this step;
      // otherwise a 10 Hz refresh keeps the projection within a car length.
      if (this.controls.reset || this.tick % 6 === 0 || this.vehicle.telemetry.groundedWheels === 0) {
        const nearest = this.nearestSpawn(pos.x, pos.z);
        this.vehicle.resetPose.position = nearest.position;
        this.vehicle.resetPose.yaw = nearest.yaw;
      }
      this.city.sync(pos.x, pos.z);
    }
    this.transforms.swap();
    this.respawned = false;
    this.events.tick = this.tick;
    this.coldOpen.preStep(this.controls, FIXED_DT);
    this.life.preStep(this.controls, FIXED_DT);
    const reset = this.controls.reset;
    this.vehicle.update(this.controls, FIXED_DT);
    if (reset) this.respawned = true;
    this.controls.reset = false;
    this.controls.swap = false;
    this.mark?.(SimPhase.Vehicle);
    if (this.traffic) {
      const pos = this.vehicle.body.translation(this.scratchPos);
      const rot = this.vehicle.body.rotation(this.scratchRot);
      const tm = this.vehicle.telemetry;
      const he = this.vehicle.tuning.chassisHalfExtents;
      const probe = this.probe;
      probe.x = pos.x;
      probe.y = pos.y;
      probe.z = pos.z;
      probe.yaw = M.yawOf(rot);
      probe.vx = tm.vx;
      probe.vz = tm.vz;
      probe.speed = Math.hypot(tm.vx, tm.vz);
      probe.halfWidth = he.x;
      probe.halfLength = he.z;
      this.traffic.playerColliderHandle = this.vehicle.collider.handle;
      this.police?.preStep(probe, FIXED_DT);
      // the streets thin as the chase grows (DESIGN.md §13.8)
      this.traffic.densityScale = TRAFFIC.densityByLevel[this.heat.level] ?? 1;
      this.traffic.step(probe, FIXED_DT, this.events);
    }
    this.mark?.(SimPhase.Traffic);
    if (this.traffic) this.peds?.step(this.probe, this.traffic, FIXED_DT, this.events);
    this.mark?.(SimPhase.Peds);
    this.world.step();
    this.mark?.(SimPhase.Physics);
    this.vehicle.writeTransforms();
    this.traffic?.writeTransforms();
    this.peds?.writeTransforms();
    this.life.postStep(FIXED_DT);
    if (this.traffic) this.coins?.step(this.probe, FIXED_DT, this.events);
    if (this.traffic) this.caches?.step();
    if (this.traffic) this.cameras?.step(this.probe, FIXED_DT, this.events);
    this.roadblocks?.step(this.probe, FIXED_DT, this.events);
    this.jumps?.step(this.probe, this.vehicle.telemetry.groundedWheels === 0, FIXED_DT, this.events);
    this.heat.step();
    this.heat.tick(FIXED_DT, this.pursuit.state === 'active');
    // before the run: a delivery into a garage pays the bag before the door can drop the job
    this.jobs.step(this.probe, FIXED_DT);
    this.run.step(this.probe, FIXED_DT);
    this.dailies.step();
    this.coldOpen.postStep(FIXED_DT);
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
    if (!this.city) this.lapTimer.update(pos.x, pos.z, this.tick, this.time, FIXED_DT);
    if (this.recorder) {
      const slot = this.vehicle.slot;
      this.recorder.record(this.controls, reset, this.transforms.currPos, slot * 3, this.transforms.currRot, slot * 4, this.vehicle.telemetry);
      if (lap.lapStartTick === this.tick) this.recorder.lapStarts.push(this.tick);
      if (lap.justBest && lap.completedLapStartTick >= 0) {
        this.bestLapPoses = this.recorder.slicePoses(lap.completedLapStartTick, this.tick);
      }
    }
    this.mark?.(SimPhase.Post);
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
    if (this.city) return this.city.nearestRoad(x, z, this.roadReset);
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

  /** Change the player's class in place (the cold open's van; the swap does its own). */
  setCar(kind: CarId): void {
    this.carId = kind;
    this.pursuit.descriptor.kind = kind;
    this.pursuit.descriptor.paint = this.garage.paintOf(kind);
    this.vehicle.tuning = cloneTuning(CAR_PRESETS[kind]);
    this.vehicle.applyTuning();
  }

  /** Teleport the player to a named spawn (dev panel / tests). */
  spawnAt(name: string): void {
    const s = this.spawns.find((sp) => sp.name === name);
    if (!s) return;
    this.vehicle.teleport(s.position, s.yaw);
    this.city?.sync(s.position.x, s.position.z, true);
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
