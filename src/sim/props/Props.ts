/**
 * The street furniture's lives (M8, docs/DESIGN.md §16.2, docs/M8_PLAN.md D1–D4). Every prop of every chunk the
 * physics ring has loaded has a state by its id: standing, flying (a body from the pool), lying, or flying a
 * ballistic arc (the pool was empty).
 *
 * The contact is the sim's, decided before the physics step (D1): the player's footprint, an oriented rectangle of
 * the chassis' half extents, is swept over the step against the standing and lying props in the grid cells it
 * crosses. At the first contact the closing speed `v` along the normal gives `J = (1 + e) v m_car m_prop /
 * (m_car + m_prop)`. A loose prop goes; an anchored one goes when `J` reaches its base's break impulse, else it
 * holds, and its post (a fixed collider, restitution as the buildings', D2) is the wall the solver stops the car
 * on. A prop that goes takes `Δv = (J + J_base) / m_car` off the car along the normal and leaves with `J / m_prop`
 * up the bonnet's slope, a share of the car's speed across the contact and the spin of the bumper's lever about
 * its centre of mass. It flies as one of sixteen bodies (CCD) until it settles, then lies where it fell, drawn and
 * not simulated, knocked again by anything that drives over it (D3). With the pool empty it flies a ballistic arc.
 * A lying prop far from the player for a minute stands again (D4). Nothing here is saved.
 *
 * Everyone else knocks by the same rule (D6, M8 slice 7): a lent body (a civilian shoved loose, a police unit) with
 * its own mass, the Δv on its body, nothing paid; a car on its lane near the player ploughs the lying props aside,
 * never slowed. A flying prop's ground velocity is kept for the walkers' dodge (`flight`).
 *
 * `step` runs after the controls, before `world.step`; `afterPhysics` after it. No allocation per step: a knock
 * makes its collider (one creation per knock, never per step).
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { PROPS } from '../balance';
import { GROUPS_PROP } from '../collision';
import { CITY_HALF } from '../city/roads';
import { PROP_KINDS, PROP_TYPES, PROPS_PER_CHUNK, type PropType } from '../city/props';
import { AgentState, type Traffic } from '../traffic/Traffic';
import type { SimWorld } from '../SimWorld';

export enum PropState { Standing = 0, Flying = 1, Lying = 2, Ballistic = 3 }

/** The impulse between a car and a prop at a closing speed (N·s): the two-body collision along the normal. */
export function knockImpulse(carMass: number, t: PropType, closing: number): number {
  return (1 + t.restitution) * closing * carMass * t.mass / (carMass + t.mass);
}

/** What a knock takes off the car's speed along the normal (m/s); null when an anchored prop holds. */
export function carSpeedLoss(carMass: number, t: PropType, closing: number): number | null {
  const j = knockImpulse(carMass, t, closing);
  if (t.breakImpulse > 0 && j < t.breakImpulse) return null;
  return (j + t.breakImpulse) / carMass;
}

/**
 * A prop's collider (a post and a flying body): a round kind taller than it is wide as a capsule, a squat one as a
 * box, a box as itself. Rapier's cylinder contacts cost twice the capsule's (M8 slice 1's measurement); a capsule
 * stands on its hemisphere's point, meets a car along its side exactly and rolls on its side like a cylinder.
 */
export function propCollider(t: PropType): RAPIER.ColliderDesc {
  const s = t.shape;
  if (s.kind === 'box') return RAPIER.ColliderDesc.cuboid(s.hx, s.hy, s.hz);
  return s.halfHeight >= 1.25 * s.radius ? RAPIER.ColliderDesc.capsule(s.halfHeight - s.radius, s.radius) : RAPIER.ColliderDesc.cuboid(s.radius, s.halfHeight, s.radius);
}

/** Every prop id of the island. */
const COUNT = 49 * PROPS_PER_CHUNK;
/** Arcs flown at once beyond the pool; past them a knocked prop falls where it stood. */
const BALLISTIC = 128;
/** Hits one sweep keeps, the nearest first. */
const HITS = 32;
/** A lying prop's footprint is sampled along its length at most this far apart (m), each sample at least this round. */
const LYING_SPACING = 1;
const LYING_RADIUS = 0.5;
/** How far a prop's footprint reaches from its grid point (a lamp post lying: half its 8 m). */
const REACH = 4.6;
const GRAVITY = 9.81;
/** A body that falls under this (the sea past the seawall) lies there. */
const LOST_Y = -5;
const HEAL_EVERY = 30;
/** Each kind's bound: the radius of the sphere round its middle that holds it however it tumbles (m). */
const BOUND = Float32Array.from(PROP_KINDS, (k) => {
  const s = PROP_TYPES[k].shape;
  return s.kind === 'box' ? Math.hypot(s.hx, s.hy, s.hz) : Math.hypot(s.radius, s.halfHeight);
});

export class Props {
  /** By id. */
  readonly state = new Uint8Array(COUNT);
  /** x, y, z, qx, qy, qz, qw by id while not standing: this step's and the last one's (the render interpolates). */
  readonly pose = new Float32Array(COUNT * 7);
  readonly prev = new Float32Array(COUNT * 7);
  /** Each id's kind (its index in `PROP_KINDS`), 255 until its chunk has been loaded once. */
  readonly kind = new Uint8Array(COUNT).fill(255);
  /** Where each stands and the way it faces. */
  readonly x = new Float32Array(COUNT);
  readonly z = new Float32Array(COUNT);
  readonly yaw = new Float32Array(COUNT);
  /** The ids not standing, in the order they went down. */
  readonly down = new Int32Array(COUNT);
  downCount = 0;
  /** Bumps on every knock, settle and heal. */
  serial = 0;
  /** This run's smashes and their bill. */
  smashed = 0;
  bill = 0;
  /** The anchored prop that held against the player's car this step (-1 none), and at what closing speed. */
  held = -1;
  heldClosing = 0;
  /** The broken hydrants' water: x, z and seconds left per jet (0 when none), `PROPS.jet.max` of them. */
  readonly jets = new Float32Array(PROPS.jet.max * 3);
  /** A flying prop's ground velocity (x, z by id): its launch, then each step's; the walkers dodge by it. */
  readonly flight = new Float32Array(COUNT * 2);

  private readonly downIndex = new Int32Array(COUNT).fill(-1);
  private readonly healFor = new Float32Array(COUNT);
  /** Each chunk's prop count, -1 before it was loaded once. */
  private readonly chunkCount = new Int16Array(49).fill(-1);
  /** An anchored prop's post while its chunk is in the physics ring. */
  private readonly posts: Array<RAPIER.Collider | null> = new Array<RAPIER.Collider | null>(COUNT).fill(null);
  /** The footprint on the ground: a centre, a unit axis, half its length, its radius; and its top. */
  private readonly capX = new Float32Array(COUNT);
  private readonly capZ = new Float32Array(COUNT);
  private readonly capDx = new Float32Array(COUNT);
  private readonly capDz = new Float32Array(COUNT);
  private readonly capHalf = new Float32Array(COUNT);
  private readonly capR = new Float32Array(COUNT);
  private readonly top = new Float32Array(COUNT);
  /** The contact grid: a list per cell of the standing and lying props whose footprint's centre it holds. */
  private readonly cells: number;
  private readonly cellHead: Int32Array;
  private readonly cellNext = new Int32Array(COUNT).fill(-1);
  private readonly cellOf = new Int32Array(COUNT).fill(-1);
  /** The pool: bodies, the prop each carries (-1 free), its collider, its settle and flight clocks. */
  private readonly bodies: RAPIER.RigidBody[] = [];
  private readonly bodyProp: Int32Array;
  private readonly bodyCollider: Array<RAPIER.Collider | null>;
  private readonly settleFor: Float32Array;
  private readonly flightFor: Float32Array;
  /** The arcs: the prop (-1 free), its velocity and spin. */
  private readonly arcProp = new Int32Array(BALLISTIC).fill(-1);
  private readonly arcState = new Float32Array(BALLISTIC * 6);
  /** Scratch, reused. */
  private readonly hitId = new Int32Array(HITS);
  private readonly hitT = new Float32Array(HITS);
  private readonly hitNx = new Float32Array(HITS);
  private readonly hitNz = new Float32Array(HITS);
  private hitCount = 0;
  private readonly v3 = { x: 0, y: 0, z: 0 };
  private readonly v3b = { x: 0, y: 0, z: 0 };
  private readonly q4 = { x: 0, y: 0, z: 0, w: 1 };
  private readonly mat = new Float32Array(9);
  private readonly vel = { x: 0, y: 0, z: 0 };
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly rot = { x: 0, y: 0, z: 0, w: 1 };
  /** The knocker's velocity change from this step's knocks (x, z). */
  private dvx = 0;
  private dvz = 0;
  /** The footprint the sweep reads: x, z, bottom, yaw, vx, vz, half width, half length, the step, lying props only (1). */
  private readonly knocker = new Float64Array(10);

  constructor(private readonly sim: SimWorld) {
    this.cells = Math.ceil((2 * CITY_HALF + 2 * PROPS.cell) / PROPS.cell);
    this.cellHead = new Int32Array(this.cells * this.cells).fill(-1);
    const n = PROPS.pool;
    this.bodyProp = new Int32Array(n).fill(-1);
    this.bodyCollider = new Array<RAPIER.Collider | null>(n).fill(null);
    this.settleFor = new Float32Array(n);
    this.flightFor = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const body = sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true).setCanSleep(false).setEnabled(false).setTranslation(0, -50, 0));
      this.bodies.push(body);
    }
    const city = sim.city;
    if (city) {
      city.onLoad = (cx, cz, body) => this.load(cx, cz, body);
      city.onUnload = (cx, cz) => this.unload(cx, cz);
    }
  }

  /** Pool bodies carrying a prop now. */
  get bodiesInUse(): number {
    let n = 0;
    for (let k = 0; k < this.bodyProp.length; k++) if ((this.bodyProp[k] as number) >= 0) n++;
    return n;
  }

  /** Arcs flying now. */
  get arcsInUse(): number {
    let n = 0;
    for (let k = 0; k < BALLISTIC; k++) if ((this.arcProp[k] as number) >= 0) n++;
    return n;
  }

  /** The body a prop flies on (tests), or null. */
  bodyOf(id: number): RAPIER.RigidBody | null {
    for (let k = 0; k < this.bodyProp.length; k++) if (this.bodyProp[k] === id) return this.bodies[k] as RAPIER.RigidBody;
    return null;
  }

  /** An anchored prop's post while its chunk is loaded (tests), or null. */
  postOf(id: number): RAPIER.Collider | null {
    return this.posts[id] ?? null;
  }

  /** The radius round its middle that holds it however it tumbles (m); 0 for an id never loaded. */
  boundOf(id: number): number {
    const k = this.kind[id] as number;
    return k === 255 ? 0 : BOUND[k] as number;
  }

  typeOf(id: number): PropType | null {
    const k = this.kind[id] as number;
    return k === 255 ? null : PROP_TYPES[PROP_KINDS[k] as keyof typeof PROP_TYPES];
  }

  // ---- the chunks ---------------------------------------------------------------------------------

  /** The physics ring loaded a chunk: its props known from now on, the anchored ones' posts on its fixed body. */
  private load(cx: number, cz: number, body: RAPIER.RigidBody): void {
    const city = this.sim.city;
    if (!city) return;
    const index = (cz + 3) * 7 + (cx + 3);
    if ((this.chunkCount[index] as number) < 0) {
      const list = city.props(cx, cz);
      this.chunkCount[index] = list.length;
      for (const p of list) {
        this.kind[p.id] = PROP_KINDS.indexOf(p.kind);
        this.x[p.id] = p.x;
        this.z[p.id] = p.z;
        this.yaw[p.id] = p.yaw;
        this.state[p.id] = PropState.Standing;
        this.standingFootprint(p.id);
        this.gridInsert(p.id);
      }
    }
    const first = index * PROPS_PER_CHUNK, count = this.chunkCount[index] as number;
    for (let id = first; id < first + count; id++) {
      const t = this.typeOf(id);
      if (!t || t.breakImpulse <= 0) continue;
      const s = t.shape, half = s.kind === 'box' ? s.hy : s.halfHeight, yaw = this.yaw[id] as number;
      const desc = propCollider(t);
      desc.setTranslation(this.x[id] as number, half, this.z[id] as number)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
        .setFriction(1).setRestitution(1).setCollisionGroups(GROUPS_PROP)
        .setEnabled(this.state[id] === PropState.Standing);
      this.posts[id] = this.sim.world.createCollider(desc, body);
    }
  }

  /** The ring dropped a chunk: its posts went with its fixed body. */
  private unload(cx: number, cz: number): void {
    const index = (cz + 3) * 7 + (cx + 3);
    const first = index * PROPS_PER_CHUNK, count = Math.max(0, this.chunkCount[index] as number);
    for (let id = first; id < first + count; id++) this.posts[id] = null;
  }

  // ---- the contact ---------------------------------------------------------------------------------

  /** After the controls, before `world.step`: the player's footprint swept over the step, its knocks and holds; then everyone else's. */
  step(dt: number): void {
    this.held = -1;
    this.heldClosing = 0;
    const sim = this.sim;
    if (!sim.city) return;
    // the player's footprint and motion as the world already read them this step (no read of the body unless it meets something)
    const v = sim.vehicle, p = sim.probe, he = v.tuning.chassisHalfExtents, k = this.knocker;
    k[0] = p.x; k[1] = p.z; k[2] = p.y - he.y; k[3] = p.yaw; k[4] = p.vx; k[5] = p.vz; k[6] = he.x; k[7] = he.z; k[8] = dt; k[9] = 0;
    this.sweep();
    if (this.hitCount > 0) {
      v.body.linvel(this.vel);
      this.resolve(this.vel.x, this.vel.z, v.tuning.mass, -1);
      if (this.dvx !== 0 || this.dvz !== 0) v.setVelocity(this.vel.x + this.dvx, this.vel.y, this.vel.z + this.dvz);
    }
    if (sim.traffic) this.others(sim.traffic, dt);
  }

  /**
   * Everyone else near the player (D6): a lent body's footprint swept at its body's velocity (a parked car's record
   * keeps a stale speed), and what it meets knocked by the rule with its own mass, the Δv on its body; a car on its
   * lane (a record, no body) sweeps at its lane speed and ploughs the lying props aside.
   */
  private others(traffic: Traffic, dt: number): void {
    const p = this.sim.probe, k = this.knocker, r2 = PROPS.pushRadius * PROPS.pushRadius;
    const lying = this.downCount > 0;
    for (let a = 0; a < traffic.capacity; a++) {
      const st = traffic.state[a];
      if (st === AgentState.Free) continue;
      const body = traffic.rigidBodyOf(a);
      if (!body && (!lying || st !== AgentState.Kinematic)) continue;
      const x = traffic.x[a] as number, z = traffic.z[a] as number;
      if ((x - p.x) * (x - p.x) + (z - p.z) * (z - p.z) > r2) continue;
      const yaw = traffic.yaw[a] as number;
      let vx: number, vz: number;
      if (body) {
        body.linvel(this.vel);
        vx = this.vel.x; vz = this.vel.z;
      } else {
        const speed = traffic.speed[a] as number;
        vx = Math.sin(yaw) * speed; vz = Math.cos(yaw) * speed;
      }
      if (vx * vx + vz * vz < PROPS.looseMin * PROPS.looseMin) continue;
      k[0] = x; k[1] = z; k[2] = traffic.y[a] as number; k[3] = yaw; k[4] = vx; k[5] = vz;
      k[6] = traffic.halfWidthOf(a); k[7] = traffic.halfLengthOf(a); k[8] = dt; k[9] = body ? 0 : 1;
      this.sweep();
      if (this.hitCount === 0) continue;
      const mass = traffic.massOf(a);
      if (!body) {
        this.plough(x, z, vx, vz, mass, a);
        continue;
      }
      this.resolve(vx, vz, mass, a);
      if (this.dvx !== 0 || this.dvz !== 0) {
        this.vel.x += this.dvx;
        this.vel.z += this.dvz;
        body.setLinvel(this.vel, true);
      }
    }
  }

  /**
   * A car on its lane meets lying props: each goes aside, to the side of the car's line it lies on (`ploughSide` as
   * much aside as ahead), by the loose rule at the car's closing speed along that way; the car never slows.
   */
  private plough(x: number, z: number, vx: number, vz: number, mass: number, by: number): void {
    const speed = Math.sqrt(vx * vx + vz * vz), fx = vx / speed, fz = vz / speed, aside = PROPS.ploughSide;
    for (let h = 0; h < this.hitCount; h++) {
      const id = this.hitId[h] as number;
      // the car's right is (fz, -fx)
      const side = ((this.capX[id] as number) - x) * fz - ((this.capZ[id] as number) - z) * fx >= 0 ? 1 : -1;
      let nx = fz * side * aside + fx, nz = -fx * side * aside + fz;
      const l = Math.sqrt(nx * nx + nz * nz);
      nx /= l; nz /= l;
      const closing = vx * nx + vz * nz;
      this.knock(id, mass, closing, nx, nz, vx - closing * nx, vz - closing * nz, by);
    }
  }

  /**
   * The knocker's footprint (`knocker`: centre, bottom, yaw, velocity, half extents, the step) swept over the step:
   * the props it meets, nearest first, into the hit list (`resolve` knocks them). Its numbers come in a typed
   * array, so the call boxes none of them.
   */
  private sweep(): void {
    this.hitCount = 0;
    const k0 = this.knocker;
    const px = k0[0] as number, pz = k0[1] as number, bottom = k0[2] as number, yaw = k0[3] as number;
    const vx = k0[4] as number, vz = k0[5] as number, hx = k0[6] as number, hz = k0[7] as number, dt = k0[8] as number;
    const lyingOnly = k0[9] === 1;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    // the motion of a still point in the car's frame over the step (local +X is (cos, -sin), local +Z (sin, cos))
    const mx = -(vx * cos - vz * sin) * dt, mz = -(vx * sin + vz * cos) * dt;
    const reach = Math.sqrt(hx * hx + hz * hz) + Math.sqrt(vx * vx + vz * vz) * dt + REACH;
    const last = this.cells - 1, off = CITY_HALF + PROPS.cell;
    const c0x = Math.max(0, Math.min(last, Math.floor((px - reach + off) / PROPS.cell))), c1x = Math.max(0, Math.min(last, Math.floor((px + reach + off) / PROPS.cell)));
    const c0z = Math.max(0, Math.min(last, Math.floor((pz - reach + off) / PROPS.cell))), c1z = Math.max(0, Math.min(last, Math.floor((pz + reach + off) / PROPS.cell)));
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      for (let id = this.cellHead[cz * this.cells + cx] as number; id >= 0; id = this.cellNext[id] as number) {
        // an airborne car over a prop
        if (bottom > (this.top[id] as number) + 0.5) continue;
        const lying = this.state[id] === PropState.Lying;
        if (lyingOnly && !lying) continue;
        const half = this.capHalf[id] as number;
        const r = lying ? Math.max(this.capR[id] as number, LYING_RADIUS) : this.capR[id] as number;
        const n = half > 0 ? 1 + Math.ceil(2 * half / (lying ? LYING_SPACING : Math.max(0.2, 2 * r))) : 1;
        let bestT = 2, bestNx = 0, bestNz = 0;
        for (let k = 0; k < n; k++) {
          const u = n > 1 ? -half + 2 * half * k / (n - 1) : 0;
          const dx = (this.capX[id] as number) + (this.capDx[id] as number) * u - px, dz = (this.capZ[id] as number) + (this.capDz[id] as number) * u - pz;
          const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
          // the point's path against the rectangle grown by the radius: slabs
          const Hx = hx + r, Hz = hz + r;
          let t0x: number, t1x: number, t0z: number, t1z: number;
          if (Math.abs(mx) < 1e-9) { if (Math.abs(lx) > Hx) continue; t0x = -Infinity; t1x = Infinity; }
          else { const a = (-Hx - lx) / mx, b = (Hx - lx) / mx; t0x = Math.min(a, b); t1x = Math.max(a, b); }
          if (Math.abs(mz) < 1e-9) { if (Math.abs(lz) > Hz) continue; t0z = -Infinity; t1z = Infinity; }
          else { const a = (-Hz - lz) / mz, b = (Hz - lz) / mz; t0z = Math.min(a, b); t1z = Math.max(a, b); }
          const enter = Math.max(t0x, t0z), exit = Math.min(t1x, t1z);
          if (enter > exit || exit < 0 || enter > 1) continue;
          const t = Math.max(0, enter);
          if (t >= bestT) continue;
          // the normal, car to prop: the face it came in through, or (already inside) the nearer face
          let nlx = 0, nlz = 0;
          if (enter >= 0) {
            if (t0x > t0z) nlx = Math.sign(lx + mx * t) || 1;
            else nlz = Math.sign(lz + mz * t) || 1;
          } else if (Hx - Math.abs(lx) < Hz - Math.abs(lz)) nlx = Math.sign(lx) || 1;
          else nlz = Math.sign(lz) || 1;
          bestT = t;
          bestNx = nlx * cos + nlz * sin;
          bestNz = -nlx * sin + nlz * cos;
        }
        if (bestT > 1) continue;
        // nearest first, the list kept short
        let i = Math.min(this.hitCount, HITS - 1);
        while (i > 0 && (this.hitT[i - 1] as number) > bestT) {
          this.hitT[i] = this.hitT[i - 1] as number; this.hitId[i] = this.hitId[i - 1] as number;
          this.hitNx[i] = this.hitNx[i - 1] as number; this.hitNz[i] = this.hitNz[i - 1] as number;
          i--;
        }
        if (i >= HITS) continue;
        this.hitT[i] = bestT; this.hitId[i] = id; this.hitNx[i] = bestNx; this.hitNz[i] = bestNz;
        if (this.hitCount < HITS) this.hitCount++;
      }
    }
  }

  /**
   * The hit list knocked in order at the knocker's velocity (x, z) and mass, by the player (-1) or a traffic record:
   * each at the closing speed left after the ones before. Leaves the knocker's velocity change in `dvx`, `dvz`.
   */
  private resolve(vx: number, vz: number, mass: number, by: number): void {
    this.dvx = 0;
    this.dvz = 0;
    for (let h = 0; h < this.hitCount; h++) {
      const id = this.hitId[h] as number, nx = this.hitNx[h] as number, nz = this.hitNz[h] as number;
      const cvx = vx + this.dvx, cvz = vz + this.dvz;
      const closing = cvx * nx + cvz * nz;
      const dv = this.knock(id, mass, closing, nx, nz, cvx - closing * nx, cvz - closing * nz, by);
      this.dvx -= dv * nx;
      this.dvz -= dv * nz;
    }
  }

  /**
   * A knock at a closing speed along the unit normal (car to prop), with the car's velocity across the contact, by
   * the player (`by` -1) or a traffic record: the car's speed lost along the normal (m/s), 0 when nothing went (too
   * slow, or it held). Only the player's knocks pay (the boost, the bill) and count.
   */
  knock(id: number, carMass: number, closing: number, nx: number, nz: number, tvx: number, tvz: number, by = -1): number {
    const t = this.typeOf(id);
    const st = this.state[id];
    if (!t || (st !== PropState.Standing && st !== PropState.Lying)) return 0;
    const lying = st === PropState.Lying;
    if (closing < (lying ? PROPS.lyingMin : PROPS.looseMin)) return 0;
    const j = knockImpulse(carMass, t, closing);
    // a lying prop is loose; a standing anchored one holds below its base's strength (its post is the wall)
    const base = lying ? 0 : t.breakImpulse;
    if (base > 0 && j < base) {
      if (by < 0) { this.held = id; this.heldClosing = closing; }
      return 0;
    }
    this.launch(id, t, j, nx, nz, tvx, tvz, by);
    return (j + base) / carMass;
  }

  /** Test hook: a standing prop laid flat at a point as if it had flown there (a lying prop in a lane, M8 slice 7). */
  drop(id: number, x: number, z: number, yaw: number): void {
    const t = this.typeOf(id);
    if (!t || this.state[id] !== PropState.Standing) return;
    const o = id * 7;
    this.pose[o] = x; this.pose[o + 1] = 0; this.pose[o + 2] = z;
    this.pose[o + 3] = 0; this.pose[o + 4] = Math.sin(yaw / 2); this.pose[o + 5] = 0; this.pose[o + 6] = Math.cos(yaw / 2);
    this.posts[id]?.setEnabled(false);
    this.healFor[id] = 0;
    this.addDown(id);
    this.gridRemove(id);
    this.layFlat(id, t, Math.sin(yaw), Math.cos(yaw));
    for (let k = 0; k < 7; k++) this.prev[o + k] = this.pose[o + k] as number;
    this.lie(id, t);
    this.serial++;
  }

  /** The prop leaves: its post down, off the grid, onto a pool body or an arc; the smash counted once, the player's paid. */
  private launch(id: number, t: PropType, j: number, nx: number, nz: number, tvx: number, tvz: number, by: number): void {
    const standing = this.state[id] === PropState.Standing;
    const o = id * 7;
    if (standing) {
      if (PROP_KINDS[this.kind[id] as number] === 'hydrant') this.spring(this.x[id] as number, this.z[id] as number);
      const s = t.shape, half = s.kind === 'box' ? s.hy : s.halfHeight, yaw = this.yaw[id] as number;
      this.pose[o] = this.x[id] as number; this.pose[o + 1] = half; this.pose[o + 2] = this.z[id] as number;
      this.pose[o + 3] = 0; this.pose[o + 4] = Math.sin(yaw / 2); this.pose[o + 5] = 0; this.pose[o + 6] = Math.cos(yaw / 2);
      this.posts[id]?.setEnabled(false);
      this.healFor[id] = 0;
      this.addDown(id);
      const player = by < 0;
      if (player) {
        this.smashed++;
        this.bill += t.bill;
        // the brief's boost earned by risk: a little per smash, by weight
        const v = this.sim.vehicle;
        v.boostMeter = Math.min(1, v.boostMeter + t.boost);
      }
      this.sim.events.push('smash', player ? t.bill : 0, this.x[id] as number, half, this.z[id] as number, id);
    }
    for (let k = 0; k < 7; k++) this.prev[o + k] = this.pose[o + k] as number;
    this.gridRemove(id);
    // the launch: J / m along the normal tilted up the bonnet, a share of the car's speed across the contact
    const slope = PROPS.slopeDeg * Math.PI / 180, speed = j / t.mass;
    const vx = speed * Math.cos(slope) * nx + PROPS.tangential * tvx;
    const vy = speed * Math.sin(slope);
    const vz = speed * Math.cos(slope) * nz + PROPS.tangential * tvz;
    this.flight[id * 2] = vx;
    this.flight[id * 2 + 1] = vz;
    // the spin: the bumper's lever about the centre of mass (a tall post folds its top toward the car); a lying one slides
    const lever = standing ? PROPS.contactHeight - t.comHeight : 0;
    const w = lever * j / this.inertia(t);
    const wx = w * nz, wz = -w * nx;
    const slot = this.freeBody();
    if (slot >= 0) {
      this.fly(slot, id, t, vx, vy, vz, wx, wz);
      this.state[id] = PropState.Flying;
    } else {
      const arc = this.freeArc();
      if (arc >= 0) {
        this.arcProp[arc] = id;
        const a = arc * 6;
        this.arcState[a] = vx; this.arcState[a + 1] = vy; this.arcState[a + 2] = vz;
        this.arcState[a + 3] = wx; this.arcState[a + 4] = 0; this.arcState[a + 5] = wz;
        this.state[id] = PropState.Ballistic;
      } else {
        // every arc taken too: it falls where it stood
        this.layFlat(id, t, vx, vz);
        this.lie(id, t);
      }
    }
    this.serial++;
  }

  /** A pool body takes the prop: the kind's collider (its mass, its centre of mass), at its pose, launched. */
  private fly(slot: number, id: number, t: PropType, vx: number, vy: number, vz: number, wx: number, wz: number): void {
    const body = this.bodies[slot] as RAPIER.RigidBody, o = id * 7, s = t.shape;
    const half = s.kind === 'box' ? s.hy : s.halfHeight;
    const desc = propCollider(t);
    const inertia = this.inertia(t), axial = s.kind === 'box' ? t.mass * (s.hx * s.hx + s.hz * s.hz) / 3 : t.mass * s.radius * s.radius / 2;
    this.v3.x = 0; this.v3.y = t.comHeight - half; this.v3.z = 0;
    this.v3b.x = inertia; this.v3b.y = axial; this.v3b.z = inertia;
    this.q4.x = 0; this.q4.y = 0; this.q4.z = 0; this.q4.w = 1;
    desc.setMassProperties(t.mass, this.v3, this.v3b, this.q4)
      .setRestitution(t.restitution).setFriction(PROPS.friction).setCollisionGroups(GROUPS_PROP);
    this.bodyCollider[slot] = this.sim.world.createCollider(desc, body);
    body.setEnabled(true);
    this.v3.x = this.pose[o] as number; this.v3.y = this.pose[o + 1] as number; this.v3.z = this.pose[o + 2] as number;
    body.setTranslation(this.v3, true);
    this.q4.x = this.pose[o + 3] as number; this.q4.y = this.pose[o + 4] as number; this.q4.z = this.pose[o + 5] as number; this.q4.w = this.pose[o + 6] as number;
    body.setRotation(this.q4, true);
    this.v3.x = vx; this.v3.y = vy; this.v3.z = vz;
    body.setLinvel(this.v3, true);
    this.v3.x = wx; this.v3.y = 0; this.v3.z = wz;
    body.setAngvel(this.v3, true);
    this.bodyProp[slot] = id;
    this.settleFor[slot] = 0;
    this.flightFor[slot] = 0;
  }

  /** The moment of inertia about a horizontal axis through the middle (kg·m²): a rod, a slab. */
  private inertia(t: PropType): number {
    const s = t.shape;
    return s.kind === 'box'
      ? t.mass * (4 * s.hy * s.hy + 4 * Math.max(s.hx, s.hz) ** 2) / 12
      : t.mass * (3 * s.radius * s.radius + 4 * s.halfHeight * s.halfHeight) / 12;
  }

  // ---- after the physics ----------------------------------------------------------------------------

  /** After `world.step`: the bodies read back and settled, the arcs flown, the far ones healed. */
  afterPhysics(dt: number): void {
    if (!this.sim.city) return;
    for (let k = 0; k < this.bodyProp.length; k++) {
      const id = this.bodyProp[k] as number;
      if (id < 0) continue;
      const body = this.bodies[k] as RAPIER.RigidBody, o = id * 7;
      for (let i = 0; i < 7; i++) this.prev[o + i] = this.pose[o + i] as number;
      body.translation(this.pos);
      body.rotation(this.rot);
      this.pose[o] = this.pos.x; this.pose[o + 1] = this.pos.y; this.pose[o + 2] = this.pos.z;
      this.pose[o + 3] = this.rot.x; this.pose[o + 4] = this.rot.y; this.pose[o + 5] = this.rot.z; this.pose[o + 6] = this.rot.w;
      // its speed and spin over the step, from the poses (no more reads of the body)
      const dx = this.pos.x - (this.prev[o] as number), dy = this.pos.y - (this.prev[o + 1] as number), dz = this.pos.z - (this.prev[o + 2] as number);
      const dot = Math.abs(this.rot.x * (this.prev[o + 3] as number) + this.rot.y * (this.prev[o + 4] as number) + this.rot.z * (this.prev[o + 5] as number) + this.rot.w * (this.prev[o + 6] as number));
      const speed = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt, spin = 2 * Math.acos(Math.min(1, dot)) / dt;
      this.flight[id * 2] = dx / dt;
      this.flight[id * 2 + 1] = dz / dt;
      const still = speed < PROPS.settleSpeed && spin < PROPS.settleSpin;
      this.settleFor[k] = still ? (this.settleFor[k] as number) + dt : 0;
      this.flightFor[k] = (this.flightFor[k] as number) + dt;
      if ((this.settleFor[k] as number) >= PROPS.settleSeconds || (this.flightFor[k] as number) >= PROPS.maxFlight || this.pos.y < LOST_Y) {
        this.release(k);
        const t = this.typeOf(id);
        if (t) this.lie(id, t);
        this.serial++;
      }
    }
    for (let a = 0; a < BALLISTIC; a++) {
      const id = this.arcProp[a] as number;
      if (id < 0) continue;
      this.arc(a, id, dt);
    }
    this.water(dt);
    if (this.sim.tick % HEAL_EVERY === 0) this.heal(HEAL_EVERY * dt);
  }

  /** A broken hydrant's water starts where it stood; the oldest jet gives way when all run. */
  private spring(x: number, z: number): void {
    let k = 0;
    for (let j = 1; j < PROPS.jet.max; j++) if ((this.jets[j * 3 + 2] as number) < (this.jets[k * 3 + 2] as number)) k = j;
    this.jets[k * 3] = x;
    this.jets[k * 3 + 1] = z;
    this.jets[k * 3 + 2] = PROPS.jet.seconds;
  }

  /**
   * The jets: each pushes up with its thrust, at its own point (so a car over it rocks), on every car body whose
   * underside it reaches (the car's footprint grown by the jet's radius), for the next step.
   */
  private water(dt: number): void {
    const jet = PROPS.jet, impulse = jet.thrust * dt;
    for (let j = 0; j < jet.max; j++) {
      const left = this.jets[j * 3 + 2] as number;
      if (left <= 0) continue;
      this.jets[j * 3 + 2] = Math.max(0, left - dt);
      const x = this.jets[j * 3] as number, z = this.jets[j * 3 + 1] as number;
      const sim = this.sim, p = sim.probe, he = sim.vehicle.tuning.chassisHalfExtents;
      if (this.over(x, z, p.x, p.z, p.yaw, he.x + jet.radius, he.z + jet.radius)) this.lift(sim.vehicle.body, x, p.y - he.y, z, impulse);
      const traffic = sim.traffic;
      if (!traffic) continue;
      for (let i = 0; i < traffic.capacity; i++) {
        const body = traffic.rigidBodyOf(i);
        if (!body) continue;
        const ax = traffic.x[i] as number, az = traffic.z[i] as number;
        if (Math.abs(ax - x) > 6 || Math.abs(az - z) > 6) continue;
        if (this.over(x, z, ax, az, traffic.yaw[i] as number, traffic.halfWidthOf(i) + jet.radius, 2.5 + jet.radius)) this.lift(body, x, 0.3, z, impulse);
      }
    }
  }

  /** Whether a point lies in a footprint (centre, yaw, half extents). */
  private over(x: number, z: number, cx: number, cz: number, yaw: number, hx: number, hz: number): boolean {
    const dx = x - cx, dz = z - cz, c = Math.cos(yaw), s = Math.sin(yaw);
    return Math.abs(dx * c - dz * s) <= hx && Math.abs(dx * s + dz * c) <= hz;
  }

  private lift(body: RAPIER.RigidBody, x: number, y: number, z: number, impulse: number): void {
    this.v3.x = 0; this.v3.y = impulse; this.v3.z = 0;
    this.v3b.x = x; this.v3b.y = y; this.v3b.z = z;
    body.applyImpulseAtPoint(this.v3, this.v3b, true);
  }

  /** One step of an arc: gravity, the spin; on the ground it lies flat along its way. */
  private arc(a: number, id: number, dt: number): void {
    const t = this.typeOf(id);
    if (!t) return;
    const o = id * 7, s = a * 6;
    for (let i = 0; i < 7; i++) this.prev[o + i] = this.pose[o + i] as number;
    const vx = this.arcState[s] as number, vz = this.arcState[s + 2] as number;
    let vy = this.arcState[s + 1] as number;
    vy -= GRAVITY * dt;
    this.arcState[s + 1] = vy;
    this.pose[o] = (this.pose[o] as number) + vx * dt;
    this.pose[o + 1] = (this.pose[o + 1] as number) + vy * dt;
    this.pose[o + 2] = (this.pose[o + 2] as number) + vz * dt;
    // q += dt/2 · (ω, 0) q
    const wx = this.arcState[s + 3] as number, wy = this.arcState[s + 4] as number, wz = this.arcState[s + 5] as number;
    const qx = this.pose[o + 3] as number, qy = this.pose[o + 4] as number, qz = this.pose[o + 5] as number, qw = this.pose[o + 6] as number;
    let nx = qx + 0.5 * dt * (wx * qw + wy * qz - wz * qy);
    let ny = qy + 0.5 * dt * (wy * qw + wz * qx - wx * qz);
    let nz = qz + 0.5 * dt * (wz * qw + wx * qy - wy * qx);
    let nw = qw - 0.5 * dt * (wx * qx + wy * qy + wz * qz);
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw) || 1;
    nx /= l; ny /= l; nz /= l; nw /= l;
    this.pose[o + 3] = nx; this.pose[o + 4] = ny; this.pose[o + 5] = nz; this.pose[o + 6] = nw;
    if (vy < 0 && (this.pose[o + 1] as number) <= this.restHeight(t)) {
      this.arcProp[a] = -1;
      this.layFlat(id, t, vx, vz);
      this.lie(id, t);
      this.serial++;
    }
  }

  /** The heal (D4): a lying prop `healRadius` from the player for `healSeconds` stands again. */
  private heal(elapsed: number): void {
    const p = this.sim.probe, r2 = PROPS.healRadius * PROPS.healRadius;
    for (let i = this.downCount - 1; i >= 0; i--) {
      const id = this.down[i] as number;
      if (this.state[id] !== PropState.Lying) continue;
      const o = id * 7, dx = (this.pose[o] as number) - p.x, dz = (this.pose[o + 2] as number) - p.z;
      const sx = (this.x[id] as number) - p.x, sz = (this.z[id] as number) - p.z;
      // where it lies and where it stood, both out of every tier's city
      if (dx * dx + dz * dz < r2 || sx * sx + sz * sz < r2) { this.healFor[id] = 0; continue; }
      this.healFor[id] = (this.healFor[id] as number) + elapsed;
      if ((this.healFor[id]) >= PROPS.healSeconds) this.stand(id);
    }
  }

  /** Stands again where it stood, its post (if its chunk is loaded) back in the solver. */
  stand(id: number): void {
    if (this.state[id] === PropState.Standing) return;
    for (let k = 0; k < this.bodyProp.length; k++) if (this.bodyProp[k] === id) this.release(k);
    for (let a = 0; a < BALLISTIC; a++) if (this.arcProp[a] === id) this.arcProp[a] = -1;
    this.gridRemove(id);
    this.state[id] = PropState.Standing;
    this.standingFootprint(id);
    this.gridInsert(id);
    this.posts[id]?.setEnabled(true);
    this.removeDown(id);
    this.healFor[id] = 0;
    this.serial++;
  }

  // ---- lying ----------------------------------------------------------------------------------------

  /** Lies at its pose: its footprint on the ground from its longest axis, on the grid again. */
  private lie(id: number, t: PropType): void {
    this.state[id] = PropState.Lying;
    const o = id * 7, s = t.shape;
    const qx = this.pose[o + 3] as number, qy = this.pose[o + 4] as number, qz = this.pose[o + 5] as number, qw = this.pose[o + 6] as number;
    // its local axes in the world, and its half extents along them
    const hx = s.kind === 'box' ? s.hx : s.radius, hy = s.kind === 'box' ? s.hy : s.halfHeight, hz = s.kind === 'box' ? s.hz : s.radius;
    const long = hy >= hx && hy >= hz ? 1 : hx >= hz ? 0 : 2;
    const ax = long === 0 ? 1 - 2 * (qy * qy + qz * qz) : long === 1 ? 2 * (qx * qy - qz * qw) : 2 * (qx * qz + qy * qw);
    const az = long === 0 ? 2 * (qx * qz - qy * qw) : long === 1 ? 2 * (qy * qz + qx * qw) : 1 - 2 * (qx * qx + qy * qy);
    const lh = Math.sqrt(ax * ax + az * az), half = long === 0 ? hx : long === 1 ? hy : hz;
    this.capX[id] = this.pose[o] as number;
    this.capZ[id] = this.pose[o + 2] as number;
    this.capDx[id] = lh > 1e-6 ? ax / lh : 1;
    this.capDz[id] = lh > 1e-6 ? az / lh : 0;
    this.capHalf[id] = half * lh;
    this.capR[id] = long === 0 ? Math.max(hy, hz) : long === 1 ? Math.max(hx, hz) : Math.max(hx, hy);
    this.top[id] = 2 * Math.max(0, this.pose[o + 1] as number);
    this.gridInsert(id);
  }

  /** Its smallest half extent: how high its middle rests when it lies on its broadest side. */
  private restHeight(t: PropType): number {
    const s = t.shape;
    return s.kind === 'box' ? Math.min(s.hx, s.hy, s.hz) : Math.min(s.radius, s.halfHeight);
  }

  /**
   * Lays an arc's prop flat on the ground where it is: its longest axis along its way (the horizontal of that axis,
   * else its velocity), its shortest up.
   */
  private layFlat(id: number, t: PropType, vx: number, vz: number): void {
    const o = id * 7, s = t.shape;
    const e0 = s.kind === 'box' ? s.hx : s.radius, e1 = s.kind === 'box' ? s.hy : s.halfHeight, e2 = s.kind === 'box' ? s.hz : s.radius;
    // the axes by length: the longest, the shortest and the one between
    const L = e1 >= e0 && e1 >= e2 ? 1 : e0 >= e2 ? 0 : 2;
    const S = L === 0 ? (e1 <= e2 ? 1 : 2) : L === 1 ? (e0 <= e2 ? 0 : 2) : (e0 <= e1 ? 0 : 1);
    const Mx = 3 - L - S;
    const qx = this.pose[o + 3] as number, qy = this.pose[o + 4] as number, qz = this.pose[o + 5] as number, qw = this.pose[o + 6] as number;
    // the longest axis's world direction, flattened
    let hx = L === 0 ? 1 - 2 * (qy * qy + qz * qz) : L === 1 ? 2 * (qx * qy - qz * qw) : 2 * (qx * qz + qy * qw);
    let hz = L === 0 ? 2 * (qx * qz - qy * qw) : L === 1 ? 2 * (qy * qz + qx * qw) : 1 - 2 * (qx * qx + qy * qy);
    let hl = Math.sqrt(hx * hx + hz * hz);
    if (hl < 0.2) { hx = vx; hz = vz; hl = Math.sqrt(hx * hx + hz * hz); }
    if (hl < 1e-6) { hx = 1; hz = 0; hl = 1; }
    hx /= hl; hz /= hl;
    // columns: the world images of local x, y, z; L along the way, S up, the middle across (right-handed)
    const m = this.mat;
    m.fill(0);
    m[L * 3] = hx; m[L * 3 + 2] = hz;
    m[S * 3 + 1] = 1;
    // the middle axis completes a right-handed frame: col(Mx) = col(next) × col(next of next)
    const a = (Mx + 1) % 3, b = (Mx + 2) % 3;
    m[Mx * 3] = (m[a * 3 + 1] as number) * (m[b * 3 + 2] as number) - (m[a * 3 + 2] as number) * (m[b * 3 + 1] as number);
    m[Mx * 3 + 1] = (m[a * 3 + 2] as number) * (m[b * 3] as number) - (m[a * 3] as number) * (m[b * 3 + 2] as number);
    m[Mx * 3 + 2] = (m[a * 3] as number) * (m[b * 3 + 1] as number) - (m[a * 3 + 1] as number) * (m[b * 3] as number);
    // the rotation's quaternion from its matrix (column c, row r at m[c * 3 + r])
    const m00 = m[0] as number, m11 = m[4] as number, m22 = m[8] as number;
    const m01 = m[3] as number, m10 = m[1] as number, m02 = m[6] as number, m20 = m[2] as number, m12 = m[7] as number, m21 = m[5] as number;
    const tr = m00 + m11 + m22;
    let x: number, y: number, z: number, w: number;
    if (tr > 0) { const k = 0.5 / Math.sqrt(tr + 1); w = 0.25 / k; x = (m21 - m12) * k; y = (m02 - m20) * k; z = (m10 - m01) * k; }
    else if (m00 > m11 && m00 > m22) { const k = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / k; x = 0.25 * k; y = (m01 + m10) / k; z = (m02 + m20) / k; }
    else if (m11 > m22) { const k = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / k; x = (m01 + m10) / k; y = 0.25 * k; z = (m12 + m21) / k; }
    else { const k = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / k; x = (m02 + m20) / k; y = (m12 + m21) / k; z = 0.25 * k; }
    this.pose[o + 1] = S === 0 ? e0 : S === 1 ? e1 : e2;
    this.pose[o + 3] = x; this.pose[o + 4] = y; this.pose[o + 5] = z; this.pose[o + 6] = w;
  }

  /** Its footprint standing: a round one's point, a long one's axis along its longer side. */
  private standingFootprint(id: number): void {
    const t = this.typeOf(id);
    if (!t) return;
    const s = t.shape, yaw = this.yaw[id] as number;
    this.capX[id] = this.x[id] as number;
    this.capZ[id] = this.z[id] as number;
    if (s.kind === 'box') {
      const alongX = s.hx >= s.hz;
      // local +X is (cos, -sin), local +Z (sin, cos)
      this.capDx[id] = alongX ? Math.cos(yaw) : Math.sin(yaw);
      this.capDz[id] = alongX ? -Math.sin(yaw) : Math.cos(yaw);
      this.capHalf[id] = Math.abs(s.hx - s.hz);
      this.capR[id] = Math.min(s.hx, s.hz);
      this.top[id] = 2 * s.hy;
    } else {
      this.capDx[id] = 1;
      this.capDz[id] = 0;
      this.capHalf[id] = 0;
      this.capR[id] = s.radius;
      this.top[id] = 2 * s.halfHeight;
    }
  }

  // ---- the pool, the lists, the grid -------------------------------------------------------------------

  private freeBody(): number {
    for (let k = 0; k < this.bodyProp.length; k++) if ((this.bodyProp[k] as number) < 0) return k;
    return -1;
  }

  private freeArc(): number {
    for (let a = 0; a < BALLISTIC; a++) if ((this.arcProp[a] as number) < 0) return a;
    return -1;
  }

  /** A body back to the pool: its collider removed, parked out of the world. */
  private release(k: number): void {
    const body = this.bodies[k] as RAPIER.RigidBody;
    const col = this.bodyCollider[k];
    if (col) this.sim.world.removeCollider(col, false);
    this.bodyCollider[k] = null;
    this.v3.x = 0; this.v3.y = -50; this.v3.z = 0;
    body.setTranslation(this.v3, false);
    this.v3.y = 0;
    body.setLinvel(this.v3, false);
    body.setAngvel(this.v3, false);
    body.setEnabled(false);
    this.bodyProp[k] = -1;
  }

  private addDown(id: number): void {
    if ((this.downIndex[id] as number) >= 0) return;
    this.downIndex[id] = this.downCount;
    this.down[this.downCount++] = id;
  }

  private removeDown(id: number): void {
    const i = this.downIndex[id] as number;
    if (i < 0) return;
    const last = this.down[--this.downCount] as number;
    this.down[i] = last;
    this.downIndex[last] = i;
    this.downIndex[id] = -1;
  }

  private cellCoord(v: number): number {
    return Math.max(0, Math.min(this.cells - 1, Math.floor((v + CITY_HALF + PROPS.cell) / PROPS.cell)));
  }

  private gridInsert(id: number): void {
    const c = this.cellCoord(this.capZ[id] as number) * this.cells + this.cellCoord(this.capX[id] as number);
    this.cellNext[id] = this.cellHead[c] as number;
    this.cellHead[c] = id;
    this.cellOf[id] = c;
  }

  private gridRemove(id: number): void {
    const c = this.cellOf[id] as number;
    if (c < 0) return;
    let prev = -1;
    for (let k = this.cellHead[c] as number; k >= 0; k = this.cellNext[k] as number) {
      if (k === id) {
        if (prev < 0) this.cellHead[c] = this.cellNext[k] as number;
        else this.cellNext[prev] = this.cellNext[k] as number;
        break;
      }
      prev = k;
    }
    this.cellNext[id] = -1;
    this.cellOf[id] = -1;
  }
}
