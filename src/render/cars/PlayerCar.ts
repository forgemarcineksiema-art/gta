/**
 * The player's car: one mesh per class and the city's bodies built the first time one is taken (or is next to the
 * car), the swap between them, the garage's resprays, the crumple, and the driver's kit on whichever car is driven
 * (M6: the topper on the roof, the neon under it, a flame at each exhaust while the boost burns, the wheels, the
 * spoiler and the stance, the drift's tyre smoke). A bike and its rider are drawn by bikeMesh.ts (M8.8 slice 15): the
 * topper on the helmet. Reads sim state only.
 */
import * as THREE from 'three';
import { ASPHALT, CAR_IDS, CAR_PRESETS, CITY_COLORS, DIRT, GRASS, KIT, PALETTE, bodySpec, bodyTuning, isShell, type BodyId, type CarId, type SimEvent, type SimWorld, type VehicleTelemetry } from '../../sim';
import { CAR_PROFILES } from './carProfiles';
import { BODY_PROFILES } from './bodyProfiles';
import { buildCarMesh, restHeight, wheelGeometry, type CarMesh } from './carMesh';
import { buildBikeMesh } from './bikeMesh';
import { buildFlame, buildNeon, setNeonColours, spoilerGeometry, topperGeometry } from './kitMesh';
import { lowriderBounce } from '../traffic/TrafficView';
import { placeFromBuffer } from '../shapes';
import type { Smoke } from '../fx/Smoke';
import type { CarLook } from '../../sim/garage/look';
import type { KitSlot } from '../../sim';

/** Seconds a flame or smoke looked at in the showroom shows (M8.9 R10). */
const PUFF = 1;

/** A colour no fixed part of a body uses: a taken body's mesh is built in it and resprayed at once. */
const SENTINEL_PAINT = 0x808182;

export class PlayerCar {
  /** One mesh per class; the one shown follows `sim.carBody` (car-swap). */
  readonly classes: Record<CarId, CarMesh>;
  /** The mesh shown. */
  mesh: CarMesh;
  /** The city's bodies the player has taken (or is next to): built on first need, kept (M5.5 slice 19). */
  private readonly bodies = new Map<BodyId, CarMesh>();
  private carId: CarId;
  private bodyId: BodyId;
  /** The paint last put on a taken body's mesh. */
  private shownPaint = -1;
  /** The garage's serial last applied to the class meshes (the resprays). */
  private garageSerial = -1;
  /** The topper worn (the driver's kit, M6), on the roof of the car the player drives: a holder for the one shown. */
  private readonly topper = new THREE.Group();
  /** The topper shown, by kit id ('' none), and each one built so far. */
  private topperId = '';
  private readonly topperMeshes = new Map<string, THREE.Mesh>();
  private readonly topperMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  /** The rest of the kit on the car (M6 slice 7): the neon under it, a flame at each exhaust, the tyre smoke's rate. */
  private readonly neon = buildNeon();
  private readonly flames: THREE.Mesh[] = [buildFlame(), buildFlame()];
  private neonId = -2;
  private flameId = -2;
  private tyreAcc = 0;
  private tyreSide = 0;
  /** The car's kit on the car shown (M6 slice 8): the wheels', spoiler's and stance's items, the spoiler's mesh, the stance's lift. */
  private wheelsId = -2;
  private spoilerId = -2;
  private stanceId = -2;
  private kitBody: BodyId | '' = '';
  private readonly spoiler = new THREE.Mesh(new THREE.BufferGeometry(), this.topperMaterial);
  private stanceY = 0;
  /** Wheel geometries built for a style, by body and style. */
  private readonly wheelGeoms = new Map<string, THREE.BufferGeometry>();
  /** Each shown body's roof height above its origin, for the topper and the camera's fit. */
  private readonly roofY: Partial<Record<BodyId, number>> = {};
  /** The last damage's contact in the car's frame: where the wreck caves in. */
  private readonly lastDent = new THREE.Vector3(0, 0.5, 2);
  private readonly tmpFwd = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();
  /**
   * The showroom's preview (M8.9 R10, `sim/garage/look.ts`): the paint and the kit the car shows while a card is
   * focused, null for what it wears; a flame or smoke looked at shows in a puff of `PUFF` s.
   */
  private look: CarLook | null = null;
  private flamePuff = 0;
  private smokePuff = 0;
  private puffFlame = -1;
  private puffSmoke = -1;
  /** The showroom's pose (M8.9 R10): the car's matrix where the game has it, the move to the turntable, the turn. */
  private readonly showOld = new THREE.Matrix4();
  private readonly showDelta = new THREE.Matrix4();
  private readonly showQ = new THREE.Quaternion();
  private readonly showUp = new THREE.Vector3(0, 1, 0);

  constructor(private readonly scene: THREE.Scene, private readonly sim: SimWorld) {
    const classes: Partial<Record<CarId, CarMesh>> = {};
    for (const id of CAR_IDS) {
      const t = id === sim.carId ? sim.vehicle.tuning : CAR_PRESETS[id];
      const mesh = t.twoWheel > 0 ? buildBikeMesh(t, CAR_PROFILES[id].paint) : buildCarMesh(t, CAR_PROFILES[id]);
      scene.add(mesh.root);
      for (const w of mesh.wheels) scene.add(w);
      const visible = id === sim.carId;
      mesh.root.visible = visible;
      for (const w of mesh.wheels) w.visible = visible;
      classes[id] = mesh;
    }
    this.classes = classes as Record<CarId, CarMesh>;
    this.carId = sim.carId;
    this.bodyId = sim.carId;
    this.mesh = this.classes[sim.carId];
    for (const id of CAR_IDS) this.roofY[id] = roofOf(this.classes[id]);
    this.seatTopper();
    this.fitKit(sim.carId);
  }

  /** The showroom's look (M8.9 R10): what the car shows in the room; null, what it wears. A flame or smoke newly looked at puffs. */
  setLook(look: CarLook | null): void {
    this.look = look;
    const flame = look ? look.items.flame : -1, smoke = look ? look.items.smoke : -1;
    const worn = this.sim.kit;
    if (flame !== this.puffFlame) {
      this.puffFlame = flame;
      if (flame >= 0 && flame !== worn.worn('flame')) this.flamePuff = PUFF;
    }
    if (smoke !== this.puffSmoke) {
      this.puffSmoke = smoke;
      if (smoke >= 0 && smoke !== worn.worn('smoke')) this.smokePuff = PUFF;
    }
  }

  /** A slot's item on the car: the look's in the showroom, else what the car wears. */
  private wornIn(slot: KitSlot): number {
    return this.look ? this.look.items[slot] : this.sim.kit.worn(slot);
  }

  /** The class whose mesh is shown (for the e2e swap check). */
  get visibleCar(): CarId {
    return this.carId;
  }

  /** The shown body's roof height above its origin. */
  get roof(): number {
    return this.roofY[this.bodyId] ?? 1.2;
  }

  /** The resprays, a swap and the kit, before the car is placed. True when the body changed: the camera whips onto it. */
  sync(): boolean {
    if (this.sim.garage.serial !== this.garageSerial) {
      // a respray on the wall shows on the car behind the door at once
      this.garageSerial = this.sim.garage.serial;
      for (const id of CAR_IDS) this.classes[id].setPaint(this.sim.garage.paintOf(id));
      // the shown car's own paint is set again below
      this.shownPaint = -1;
    }
    const swapped = this.syncCar();
    this.syncTopper();
    this.syncKit();
    return swapped;
  }

  /** The body and its wheels between the last two steps (0 = previous, 1 = current). */
  place(alpha: number): void {
    const tb = this.sim.transforms, car = this.mesh;
    placeFromBuffer(car.root, tb, this.sim.vehicle.slot, alpha);
    // the stance (M6 slice 8): the body over its wheels, drawn only
    car.root.position.y += this.stanceY;
    // Neon Niko's lowrider bounces on its hydraulics at a standstill (M6 slice 5): the body only, drawn
    if (this.sim.carBody === 'lowrider') car.root.position.y += lowriderBounce(this.sim.time, this.sim.probe.speed, 0);
    const wheels = this.sim.vehicle.wheels;
    for (let i = 0; i < 4; i++) {
      const w = car.wheels[i];
      const ws = wheels[i];
      if (w && ws) placeFromBuffer(w, tb, ws.slot, alpha);
    }
  }

  /**
   * The showroom (M8.9 R10): the car drawn in the room's middle (`x`, `z`) turned to `yaw` on the turntable, level,
   * `mix` of the way from where it stopped (0) to there (1), its wheels with it. After `place`; drawn only: the car
   * in the game stays where it stopped.
   */
  showroom(x: number, z: number, yaw: number, mix: number): void {
    const root = this.mesh.root;
    root.updateMatrix();
    this.showOld.copy(root.matrix);
    this.showQ.setFromAxisAngle(this.showUp, yaw);
    root.quaternion.slerp(this.showQ, mix);
    root.position.x += (x - root.position.x) * mix;
    root.position.z += (z - root.position.z) * mix;
    root.updateMatrix();
    this.showDelta.copy(root.matrix).multiply(this.showOld.invert());
    for (const w of this.mesh.wheels) {
      w.updateMatrix();
      w.matrix.premultiply(this.showDelta);
      w.matrix.decompose(w.position, w.quaternion, w.scale);
    }
  }

  update(tm: VehicleTelemetry, dt: number): void {
    if (this.flamePuff > 0) this.flamePuff -= dt;
    if (this.smokePuff > 0) this.smokePuff -= dt;
    this.mesh.update(tm);
    // the sweeper's brushes turn while it moves (M7 slice 13)
    this.mesh.spin(dt, tm.speed);
  }

  /**
   * The crumple (M5.5 slice 16): each damage stage dents the shell where the hit landed, deeper stage by stage;
   * the wreck caves it in there and squashes the roof. Render only; a fresh car restores the shell.
   */
  crumple(e: SimEvent): void {
    const car = this.mesh;
    car.root.updateMatrixWorld();
    if (e.kind === 'damage') {
      this.tmpPos.set(e.x, e.y, e.z);
      car.root.worldToLocal(this.tmpPos);
      this.lastDent.copy(this.tmpPos);
      car.dent(this.tmpPos.x, this.tmpPos.y, this.tmpPos.z, 0.8 + 0.15 * e.value, 0.05 + 0.03 * e.value);
    } else {
      car.dent(this.lastDent.x, this.lastDent.y, this.lastDent.z, 1.5, 0.3);
      car.dent(0, car.roofY, 0, 1.4, 0.22);
    }
  }

  /**
   * A drift's tyre smoke off the rear wheels, in the kit's colour (a pale grey when none is worn); off the road it
   * comes up in the ground's colour, the grass's or the soil's (M8.8 slice 9).
   */
  emitTyreSmoke(dt: number, smoke: Smoke, vel: THREE.Vector3): void {
    const tm = this.sim.vehicle.telemetry;
    // a smoke looked at in the showroom puffs from the rear wheels (M8.9 R10)
    const puff = this.smokePuff > 0;
    if (!puff && (!tm.drifting || tm.groundedWheels < 2 || this.sim.probe.speed < 6)) { this.tyreAcc = 0; return; }
    const wheels = this.sim.vehicle.wheels;
    let ground: number = ASPHALT;
    if (!puff) for (const w of wheels) if (!w.isFront && w.grounded && w.surface !== ASPHALT) ground = w.surface;
    const worn = this.wornIn('smoke');
    const colour = ground === GRASS ? PALETTE.grass : ground === DIRT ? CITY_COLORS.soil : worn >= 0 ? (KIT[worn]?.colour ?? -1) : -1;
    const car = this.mesh.root;
    this.tmpFwd.set(0, 0, 1).applyQuaternion(car.quaternion);
    this.tyreAcc += 28 * dt;
    while (this.tyreAcc >= 1) {
      this.tyreAcc -= 1;
      // the rear wheels are the two behind the car's middle; one then the other
      this.tyreSide = 1 - this.tyreSide;
      let seen = 0;
      for (const w of this.mesh.wheels) {
        const behind = (w.position.x - car.position.x) * this.tmpFwd.x + (w.position.z - car.position.z) * this.tmpFwd.z < 0;
        if (!behind) continue;
        if (seen++ !== this.tyreSide) continue;
        smoke.emit('tyre', w.position.x, w.position.y - 0.1, w.position.z, vel.x, vel.z, 1, colour);
      }
    }
  }

  /** The body's shown mesh: a class's own, or a city body's, built hidden the first time it is needed. */
  private meshFor(body: BodyId): CarMesh {
    if (isShell(body)) return this.classes[body];
    let mesh = this.bodies.get(body);
    if (!mesh) {
      // built in a colour no fixed part uses, so a respray finds the paint alone (a white truck keeps a white box)
      const t = bodyTuning(body);
      mesh = t.twoWheel > 0 ? buildBikeMesh(t, SENTINEL_PAINT) : buildCarMesh(t, BODY_PROFILES[body], SENTINEL_PAINT);
      mesh.root.visible = false;
      this.scene.add(mesh.root);
      for (const w of mesh.wheels) {
        w.visible = false;
        this.scene.add(w);
      }
      this.roofY[body] = roofOf(mesh);
      this.bodies.set(body, mesh);
    }
    return mesh;
  }

  private syncCar(): boolean {
    const sim = this.sim;
    const body = sim.carBody;
    // a car next to the player may be taken: its body's mesh is ready before the swap, not built on it
    const candidate = sim.life.state.swapCandidate;
    if (candidate >= 0 && sim.traffic) this.meshFor(sim.traffic.bodyOf(candidate));
    let swapped = false;
    if (body !== this.bodyId) {
      const old = this.mesh;
      old.root.visible = false;
      for (const w of old.wheels) w.visible = false;
      this.mesh = this.meshFor(body);
      this.mesh.root.visible = true;
      for (const w of this.mesh.wheels) w.visible = true;
      this.mesh.setDamage(0);
      this.bodyId = body;
      this.fitKit(body);
      this.shownPaint = -1;
      this.seatTopper();
      swapped = true;
    }
    this.carId = sim.carId;
    // behind the door a shell shows the garage's paint, so a respray shows at once; on the road every car wears the
    // paint it came in, a borrowed police car its own colours (M8.8 slice 1)
    const paint = this.look ? this.look.paint : isShell(body) && sim.run.state === 'door' ? sim.garage.paintOf(body) : sim.carPaint;
    if (paint !== this.shownPaint) {
      this.mesh.setPaint(paint);
      this.shownPaint = paint;
    }
    return swapped;
  }

  /** The topper is the player's: on the shown car's roof, or a size down on a rider's helmet (M8.8 slice 15). */
  private seatTopper(): void {
    const crown = this.mesh.crown;
    this.mesh.root.add(this.topper);
    if (crown) this.topper.position.set(0, crown.y - 0.02, crown.z);
    else this.topper.position.set(0, this.roof - 0.02, -0.2);
    this.topper.scale.setScalar(crown ? 0.6 : 1);
  }

  /** The topper worn now on the roof: built the first time it is worn, one child of the holder at a time. */
  private syncTopper(): void {
    const worn = this.wornIn('topper');
    const id = worn >= 0 ? (KIT[worn]?.id ?? '') : '';
    if (id === this.topperId) return;
    this.topperId = id;
    this.topper.clear();
    if (!id) return;
    let mesh = this.topperMeshes.get(id);
    if (!mesh) {
      mesh = new THREE.Mesh(topperGeometry(id), this.topperMaterial);
      mesh.name = `topper-${id}`;
      mesh.castShadow = true;
      this.topperMeshes.set(id, mesh);
    }
    this.topper.add(mesh);
  }

  /**
   * The neon, the boost's flames and the tyre smoke (M6 slice 7), on whichever car the player drives: the neon
   * sized to the body's footprint on the ground under it, the flames at the tail while the boost burns, the smoke
   * off the rear tyres in a drift. Colours from the kit; the flame and the smoke have their own when none is worn.
   */
  private syncKit(): void {
    const neon = this.wornIn('neon'), flame = this.wornIn('flame');
    if (neon !== this.neonId) {
      this.neonId = neon;
      const item = neon >= 0 ? KIT[neon] : undefined;
      this.neon.visible = item !== undefined;
      if (item) setNeonColours(this.neon, item.colour, item.colour2 ?? item.colour);
    }
    if (flame !== this.flameId) {
      this.flameId = flame;
      const colour = flame >= 0 ? (KIT[flame]?.colour ?? PALETTE.carOrange) : PALETTE.carOrange;
      for (const f of this.flames) (f.material as THREE.MeshBasicMaterial).color.setHex(colour);
    }
    this.syncCarKit();
    const tm = this.sim.vehicle.telemetry;
    const burning = (tm.boosting && !this.sim.life.state.wrecked) || this.flamePuff > 0;
    for (let k = 0; k < this.flames.length; k++) {
      const f = this.flames[k] as THREE.Mesh;
      if (f.visible !== burning) f.visible = burning;
      if (burning) f.scale.set(1, 1, 0.75 + 0.35 * Math.abs(Math.sin(this.sim.time * 37 + k * 1.7)));
    }
  }

  /** The car's kit on the car shown: its wheels restyled, a spoiler on its boot, its stance; stock on a car taken on the road. */
  private syncCarKit(): void {
    const body = this.sim.carBody;
    const wheels = this.wornIn('wheels'), spoiler = this.wornIn('spoiler'), stance = this.wornIn('stance');
    if (body !== this.kitBody) {
      this.kitBody = body;
      this.wheelsId = -2;
      this.spoilerId = -2;
      this.stanceId = -2;
    }
    if (wheels !== this.wheelsId) {
      this.wheelsId = wheels;
      const style = wheels >= 0 ? ({ wheelStar: 'star', wheelDish: 'dish', wheelWire: 'wire', wheelDisc: 'disc' } as Record<string, string>)[KIT[wheels]?.id ?? ''] ?? '' : '';
      const profile = BODY_PROFILES[body];
      const key = `${body}:${style || 'own'}`;
      let g = this.wheelGeoms.get(key);
      if (!g) {
        g = wheelGeometry(this.sim.vehicle.tuning, style || (profile.wheelStyle ?? profile.name));
        this.wheelGeoms.set(key, g);
      }
      for (const w of this.mesh.wheels) w.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry = g; });
    }
    if (spoiler !== this.spoilerId) {
      this.spoilerId = spoiler;
      const kind = ({ spoilerLip: 'lip', spoilerWing: 'wing', spoilerGiant: 'giant' } as Record<string, 'lip' | 'wing' | 'giant'>)[KIT[spoiler]?.id ?? ''];
      this.spoiler.geometry.dispose();
      this.spoiler.visible = kind !== undefined;
      if (kind) {
        const spec = bodySpec(body), profile = BODY_PROFILES[body], S = profile.sections;
        const deck = S[S.length - 2] ?? S[S.length - 1];
        const tail = S[S.length - 1];
        this.spoiler.geometry = spoilerGeometry(kind, spec.halfWidth * 1.7);
        this.mesh.root.add(this.spoiler);
        this.spoiler.position.set(0, (deck ? deck.roof : 0.9) - restHeight(bodyTuning(body)), (tail ? tail.z : -spec.halfLength) + 0.3);
        this.spoiler.castShadow = true;
      } else {
        this.spoiler.geometry = new THREE.BufferGeometry();
      }
    }
    if (stance !== this.stanceId) {
      this.stanceId = stance;
      const id = KIT[stance]?.id ?? '';
      this.stanceY = id === 'stanceLow' ? -0.06 : id === 'stanceHigh' ? 0.1 : 0;
      this.neon.position.y = -restHeight(bodyTuning(body)) + 0.035 - this.stanceY;
    }
  }

  /** Seats the neon and the flames on a newly shown car: its footprint, its ground, its tail. */
  private fitKit(body: BodyId): void {
    const spec = bodySpec(body), t = bodyTuning(body), profile = BODY_PROFILES[body];
    const ground = -restHeight(t);
    this.mesh.root.add(this.neon);
    this.neon.position.set(0, ground + 0.035 - this.stanceY, 0);
    this.neon.scale.set(spec.halfWidth * 2 + 0.5, 1, spec.halfLength * 2 + 0.4);
    const tail = profile.sections[profile.sections.length - 1];
    const tz = tail ? tail.z : -spec.halfLength, ty = (tail ? tail.floor : 0.35) + ground + 0.06;
    // a rocket's flame at its nozzle (the trolley, M8.8 slice 13), a bike's at its exhaust (slice 15), else one at each side of the tail
    const nozzle = profile.nozzle, exhaust = this.mesh.exhaust;
    for (let k = 0; k < this.flames.length; k++) {
      const f = this.flames[k] as THREE.Mesh;
      this.mesh.root.add(f);
      if (exhaust) f.position.set(exhaust.x + (k === 0 ? 0.03 : -0.03), exhaust.y, exhaust.z - 0.05);
      else if (nozzle) f.position.set(k === 0 ? 0.03 : -0.03, nozzle.y + ground, nozzle.z - 0.05);
      else f.position.set(k === 0 ? 0.36 : -0.36, ty, tz - 0.05);
    }
  }
}

/** The shown body's top: a rider's helmet on a bike, else the body's highest point. */
function roofOf(mesh: CarMesh): number {
  if (mesh.crown) return mesh.crown.y;
  const body = mesh.root.getObjectByName('body-and-trim') as THREE.Mesh | undefined;
  body?.geometry.computeBoundingBox();
  return body?.geometry.boundingBox?.max.y ?? 1.2;
}
