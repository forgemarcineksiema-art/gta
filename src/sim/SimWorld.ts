/**
 * The headless game simulation. Owns the Rapier world, the player's vehicle and
 * every simulated object. Runs on a fixed 60 Hz step and never touches Three.js
 * or the DOM, so it is testable in Node and independent of the render rate.
 *
 * Also owns the instrumentation: a lap timer on the test track, a recorder of
 * every step (controls, pose, telemetry) and the ghost of the best lap.
 */
import { BALANCE } from './balance';
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUP_DEFAULT, interactionGroups } from './collision';

/** A query that meets the solid statics only (buildings, walls, roofs), not kerbs, ramps or the ground. */
const SOLID_ONLY = interactionGroups(0xffff, GROUP_DEFAULT);
import { City, type PropRing } from './city/City';
import { coverSites, type CoverSites } from './city/cover';
import { Roadblocks } from './police/Roadblocks';
import { Cameras } from './city/cameras';
import { Jumps } from './city/jumps';
import { Stash, cityToys } from './city/stash';
import { SLIPWAY, SLIPWAYS, slipwayTop } from './city/sea';
import { BREAKER, BREAKERS, Breakers } from './city/breakers';
import { createControls, type VehicleControls } from './controls';
import { EventLog } from './events';
import { Collectibles } from './city/collectibles';
import { Coins } from './city/coins';
import { Caches } from './city/caches';
import { Life } from './life/Life';
import { Heat } from './heat/Heat';
import { Police } from './police/Police';
import { Pursuit } from './police/Pursuit';
import { ColdOpen, coldOpenRoute, coldOpenSpots } from './run/ColdOpen';
import { Run } from './run/Run';
import { Way } from './run/way';
import { Skill } from './run/Skill';
import { TicketOfficer } from './police/Ticket';
import { DONUT_SHOP, DonutShop } from './police/Donuts';
import { Jobs } from './jobs/Jobs';
import { Fares } from './jobs/Fares';
import { jobsFor, seaTrial } from './jobs/place';
import { Garage } from './garage/Garage';
import { Board } from './board/Board';
import { Kit } from './garage/kit';
import { Career } from './board/Career';
import { Dailies } from './dailies/Dailies';
import { apply as applySave, type SaveV1 } from './save/format';
import { buildPlayground, type PlaygroundLayout, type SpawnPoint } from './playground';
import { POSE_STRIDE, Recorder } from './recorder';
import type { DynamicDesc, StaticDesc } from './scene';
import { LapTimer, type LapState, type TrackDef } from './track';
import { Pedestrians } from './traffic/Pedestrians';
import { Props } from './props/Props';
import { Traffic, type PlayerProbe } from './traffic/Traffic';
import { PEDS, TRAFFIC } from './traffic/tuning';
import { SimPhase, type PhaseMark } from './profile';
import { TransformBuffer } from './transforms';
import { CAR_PRESETS, type CarId } from './vehicle/presets';
import { bodySpec, isShell, policeLiveried, type BodyId } from './traffic/bodies';
import { cloneTuning, type VehicleTuning } from './vehicle/tuning';
import { Vehicle } from './vehicle/Vehicle';
import * as M from './math';
import { DEFAULT_SETTINGS, type Settings } from './settings';

export const FIXED_DT = 1 / 60;
export const FIXED_HZ = 60;
/** Below this height the car has fallen off the world and is respawned. */
const KILL_Y = -25;
/** The street furniture keeps this far from a hidden car's spot and from the donut shop's middle (m, M8 D7). */
const PARKED_CAR_RING = 3.5;
const DONUT_SHOP_RING = 3.6;

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
  /** Start in any body, at its own mass and its class's upgrades (M8.8 slice 4: the QA hook for every vehicle, tests). */
  body?: BodyId;
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
  /** The next rival's car cruising their turf (M7 slice 13). Default on; the test helper turns it off. */
  teasers?: boolean;
  /** Every job kind shown from the start (M8.7 D10: the game reveals them with the chain). Default off; the test helper turns it on. */
  reveal?: boolean;
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
  /** Fares (M5.5 slice 13): hails, pick-ups, tips, the hot fare's heat; before the jobs each step. */
  readonly fares: Fares;
  /** The skill chain (M5.5 slice 14): tricks into a chain that banks into the bag; before the run each step. */
  readonly skill: Skill;
  /** Hidden cars (M5.5 slice 16): the stashed truck, and which the player has found. */
  readonly stash: Stash;
  /** The busted rule's officer walking up with the ticket book (M5.5 slice 18). */
  readonly ticket: TicketOfficer;
  /** The pursuit breakers (M5.5 slice 18): the city's scaffold towers; null off the city. */
  readonly breakers: Breakers | null;
  /** The donut shop's cruisers (M5.5 slice 18); null off the city. */
  readonly donuts: DonutShop | null;
  /** The first run's script; inactive until `start()`. */
  readonly coldOpen: ColdOpen;
  /** The goal the line names and the route to it (M8.7 D1–D2); null off the city. */
  readonly way: Way | null;
  /** The catalogue, paint, upgrades and prep: the wall's pages (M5 slice 4). */
  readonly garage: Garage;
  /** The pause screen's settings (M7 slice 3), carried for the save; nothing in the sim reads them. */
  readonly settings: Settings = { ...DEFAULT_SETTINGS };
  /** The wanted board (M6): the rivals beaten, the next one's requirements, their duels' rings. */
  readonly board: Board;
  /** Lifetime counts the board's requirements read (M6). */
  readonly career: Career;
  /** The driver's kit (M6): what the player wears into every car. */
  readonly kit: Kit;
  /** The player drives the garage's car (its own kit fitted, M6 slice 8); false after a swap into another. */
  garageDriven = true;
  /** The day's three challenges and the streak (M5 slice 6). */
  readonly dailies: Dailies;
  /** The city's smashable billboards; null on the playground. */
  readonly collectibles: Collectibles | null;
  /** The street furniture's states, the knock before the physics and the flying bodies after it (M8); null off the city. */
  readonly props: Props | null;
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
  /** The body the player drives (a class's own shell, or a civilian body taken by a swap; M5.5 slice 19) and its paint. */
  carBody: BodyId = 'muscle';
  carPaint = 0;
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
  /** The camera's sight query's ray (clearFraction), reused. */
  private readonly sightRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
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
    this.layout = this.city ? { statics: [], props: cityToys(), spawns: this.city.spawns, track: this.city.route, groundSize: 1575 } : buildPlayground(this.world);
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
          : p.shape.kind === 'ball'
            ? RAPIER.ColliderDesc.ball(p.shape.radius)
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
    // the wheels read the city's ground (M8.8 slice 9); the playground is asphalt everywhere
    this.vehicle.ground = this.city?.surface ?? null;
    this.garage = new Garage(this);
    this.board = new Board(this);
    this.board.teasers = opts.teasers ?? true;
    this.career = new Career(this);
    this.kit = new Kit(this);
    this.traffic = this.city ? new Traffic(this.world, this.transforms, this.city, opts.seed ?? 42, TRAFFIC, this.trafficDensity) : null;
    this.peds = this.city && this.traffic ? new Pedestrians(this.transforms, this.city, this.traffic.lanes, opts.seed ?? 42, PEDS, this.pedsDensity) : null;
    this.collectibles = this.city ? new Collectibles(this.city) : null;
    this.coins = this.city && this.traffic ? new Coins(this.city, this.traffic.lanes) : null;
    this.life = new Life(this, opts.damage ?? this.city !== null);
    this.heat = new Heat(this.events, this.traffic);
    this.heat.set(opts.heat ?? 0);
    this.pursuit = new Pursuit(this.events);
    this.carBody = this.carId;
    this.carPaint = this.garage.paintOf(this.carId);
    this.pursuit.descriptor.kind = this.carId;
    this.pursuit.descriptor.body = this.carId;
    this.pursuit.descriptor.paint = this.carPaint;
    this.pursuit.descriptor.police = policeLiveried(this.carId);
    this.cover = this.city ? coverSites(this.city) : null;
    this.police = this.traffic ? new Police(this) : null;
    // a crime in a unit's sight pays double and makes the player wanted (DESIGN.md §13.3)
    this.heat.seen = () => this.police?.crimeSeen() ?? false;
    this.heat.propHeat = (id) => this.props?.typeOf(id)?.heat ?? 0;
    this.heat.playerSpeed = () => this.probe.speed;
    this.roadblocks = this.traffic && this.cover ? new Roadblocks(this, this.cover.chokepoints) : null;
    this.cameras = this.cover ? new Cameras(this.cover.cameraSites, this.cover.daily.cameras) : null;
    this.jumps = this.city ? new Jumps(this, this.city.jumps) : null;
    // the generator's sixteen markers (docs/M5_PLAN.md D4); the cold open adds its own as id 0
    this.jobs = new Jobs(this, this.city && this.traffic ? jobsFor(this.city, opts.seed ?? 42, this.traffic.lanes) : []);
    // the sea trial (M8.8 slice 20), after the generator's, before the way learns the rings
    if (this.city && this.traffic) this.jobs.add(seaTrial());
    this.fares = new Fares(this, this.events);
    this.skill = new Skill(this);
    this.stash = new Stash(this);
    this.ticket = new TicketOfficer(this);
    this.breakers = this.city && this.traffic ? new Breakers(this) : null;
    this.donuts = this.city && this.traffic ? new DonutShop(this) : null;
    this.run = new Run(this);
    this.coldOpen = new ColdOpen(this);
    this.dailies = new Dailies(this);
    this.caches = this.coins ? new Caches(this) : null;
    this.jobs.revealAll = opts.reveal ?? false;
    this.way = this.city && this.traffic ? new Way(this, this.city.graph, this.traffic.lanes) : null;
    if (this.city) {
      // what the street furniture keeps out of (M8 D7): every job's ring and its end, the stash's cars, the
      // breakers' towers, the donut shop; the cold open's route, the first time a chunk near it asks, with the things
      // it drives through; the mayhem zones' markets (slice 8)
      const r = BALANCE.jobs.markerRadius;
      const rings: PropRing[] = [];
      for (const d of this.jobs.defs) {
        rings.push({ x: d.x, z: d.z, r: d.kind === 'duel' ? BALANCE.board.ringRadius : r });
        rings.push({ x: d.targetX, z: d.targetZ, r });
      }
      for (const spot of Object.values(this.stash.spots)) rings.push({ x: spot.x, z: spot.z, r: PARKED_CAR_RING });
      for (const b of BREAKERS) rings.push({ x: b.x, z: b.z, r: Math.hypot(BREAKER.halfWidth, BREAKER.halfDepth) + BREAKER.clear });
      rings.push({ x: DONUT_SHOP.x, z: DONUT_SHOP.z, r: DONUT_SHOP_RING });
      // the slipways' tops (M8.8 slice 19): the way down to the sea stays open
      for (const s of SLIPWAYS) rings.push({ ...slipwayTop(s), r: SLIPWAY.clear });
      const city = this.city;
      city.setPropKeepOut(rings, () => {
        const loop = city.spawns.find((s) => s.name === 'loop'), hideout = this.run.dropOffs[0];
        const route = loop && hideout ? coldOpenRoute(this, loop.position.x, loop.position.z, hideout) : null;
        return route ? { samples: route.samples, spots: coldOpenSpots(route) } : { samples: [], spots: [] };
      }, this.jobs.defs.filter((d) => d.kind === 'mayhem').map((d) => ({ x: d.x, z: d.z })));
    }
    // before the first sync: the ring's chunks bring their props' posts
    this.props = this.city ? new Props(this) : null;
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
    if (opts.body) this.setBody(opts.body, opts.tuning);
    if (opts.coldOpen) this.coldOpen.start();
  }

  /** Put the player in a body in place (`?body=`, tests): its class, its own paint, its tuning with the class's upgrades. */
  setBody(body: BodyId, tuning?: VehicleTuning): void {
    const spec = bodySpec(body);
    this.carId = spec.car;
    this.carBody = body;
    this.carPaint = isShell(body) ? this.garage.paintOf(body) : (spec.paints[0] as number);
    this.pursuit.descriptor.kind = spec.car;
    this.pursuit.descriptor.body = body;
    this.pursuit.descriptor.paint = this.carPaint;
    this.pursuit.descriptor.police = policeLiveried(body);
    this.vehicle.tuning = tuning ?? this.garage.tuningFor(body);
    this.vehicle.applyTuning();
  }

  /** Advance the simulation by exactly one fixed step using the current `controls`. */
  step(): void {
    if (this.city) {
      const pos = this.vehicle.body.translation(this.scratchPos);
      // The reset pose only has to be fresh when a reset can happen this step;
      // otherwise a 10 Hz refresh keeps the projection within a car length.
      if (this.controls.reset || this.tick % 6 === 0 || this.vehicle.telemetry.groundedWheels === 0) {
        const nearest = this.nearestSpawn(pos.x, pos.z, pos.y);
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
      // the Fake Cruiser's disco bar: the road ahead pulls over (M8.8 slice 6)
      this.traffic.playerLit = bodySpec(this.carBody).lit === true;
      this.traffic.step(probe, FIXED_DT, this.events);
    }
    this.mark?.(SimPhase.Traffic);
    // the street furniture's contacts, decided before the solver (M8 D1): the player's, then everyone else's (D6)
    this.props?.step(FIXED_DT);
    this.mark?.(SimPhase.Props);
    // the walkers after the knocks: a prop sent flying this step is dodged before it moves
    if (this.traffic) this.peds?.step(this.probe, this.traffic, FIXED_DT, this.events, this.props);
    this.mark?.(SimPhase.Peds);
    this.world.step();
    this.mark?.(SimPhase.Physics);
    this.props?.afterPhysics(FIXED_DT);
    this.mark?.(SimPhase.Props);
    this.vehicle.writeTransforms();
    this.traffic?.writeTransforms();
    this.peds?.writeTransforms();
    this.life.postStep(FIXED_DT);
    if (this.traffic) this.coins?.step(this.probe, FIXED_DT, this.events);
    if (this.traffic) this.caches?.step();
    if (this.traffic) this.cameras?.step(this.probe, FIXED_DT, this.events);
    this.roadblocks?.step(this.probe, FIXED_DT, this.events);
    this.jumps?.step(this.probe, this.vehicle.telemetry.groundedWheels === 0, FIXED_DT, this.events);
    // the cold open's escape is a lesson at level 2: its crimes never lift the heat past it
    this.heat.cap = this.coldOpen.active ? BALANCE.coldOpen.heatCap : 100;
    this.heat.step();
    this.heat.tick(FIXED_DT, this.pursuit.state === 'active');
    // before the run: a delivery into a garage pays the bag before the door can drop the job
    this.breakers?.step(this.probe, FIXED_DT);
    this.skill.step(FIXED_DT);
    if (this.traffic) this.stash.step(this.probe);
    this.donuts?.step(this.probe);
    this.fares.step(this.probe, FIXED_DT);
    if (this.controls.horn) {
      // the horn (M6 slice 7): the cars ahead move aside, the worn horn sounds
      this.controls.horn = false;
      const heeded = this.traffic ? this.traffic.honked(this.probe) : 0;
      this.events.push('horn', heeded, this.probe.x, this.probe.y, this.probe.z, this.kit.worn('horn'));
    }
    this.jobs.step(this.probe, FIXED_DT);
    // after the jobs (a fare's def and a race's place are still there), before the run banks anything
    this.career.step();
    this.board.step(this.probe, FIXED_DT);
    this.run.step(this.probe, FIXED_DT);
    this.ticket.step(FIXED_DT);
    this.dailies.step();
    this.coldOpen.postStep(FIXED_DT);
    // last: the goal reads the step's jobs, chase, run and board
    this.way?.step(FIXED_DT);
    for (const t of this.tracked) {
      const p = t.body.translation(this.scratchPos);
      const r = t.body.rotation(this.scratchRot);
      this.transforms.write(t.slot, p.x, p.y, p.z, r.x, r.y, r.z, r.w);
    }
    // keep the reset target on the nearest spawn point and catch falls
    const pos = this.vehicle.body.translation(this.scratchPos);
    const nearest = this.nearestSpawn(pos.x, pos.z, pos.y);
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

  nearestSpawn(x: number, z: number, y = 0.5): SpawnPoint {
    if (this.city) return this.city.nearestRoad(x, z, this.roadReset, y);
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

  /**
   * The share of the way from one point to another that is clear of solid statics (buildings, walls, a
   * cover's roof): 1 when nothing is between, else the fraction to the first hit. The chase camera pulls in
   * by it (M5.5 slice 7). A read of the world, no allocation.
   */
  clearFraction(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) return 1;
    const ray = this.sightRay;
    ray.origin.x = ax; ray.origin.y = ay; ray.origin.z = az;
    ray.dir.x = dx / length; ray.dir.y = dy / length; ray.dir.z = dz / length;
    const hit = this.world.castRay(ray, length, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, SOLID_ONLY);
    return hit ? hit.timeOfImpact / length : 1;
  }

  /** Change the player's class in place (the cold open's van; the swap does its own). */
  setCar(kind: CarId): void {
    this.carId = kind;
    this.carBody = kind;
    this.carPaint = this.garage.paintOf(kind);
    this.pursuit.descriptor.kind = kind;
    this.pursuit.descriptor.body = kind;
    this.pursuit.descriptor.paint = this.carPaint;
    this.pursuit.descriptor.police = policeLiveried(kind);
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
