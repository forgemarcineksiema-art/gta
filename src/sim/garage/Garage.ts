/**
 * The garage on the wall of every drop-off (docs/M5_PLAN.md slice 4, D8,
 * D13; M6 slice 0, DESIGN.md §14.6): the cars the player owns as bodies (the
 * catalogue's five, any civilian body brought home and kept, the hidden cars
 * found), the paint per car, three upgrade stats in three tiers per class (a
 * tier on the muscle class drives every muscle-class body), the two prep
 * items, and the police car's unlock. Cash only: the bank and the coins
 * (`Run.funds`). Upgrades are multipliers on the body's tuning applied at
 * drive-out, tier 0 equal to it bitwise, so every handling pin stands and
 * `CAR_PRESETS` is never edited.
 *
 * No step: `App` calls these methods from the wall's intents; the save
 * applies and collects the state.
 */
import { BALANCE } from '../balance';
import { POLICE } from '../police/tuning';
import type { SimWorld } from '../SimWorld';
import { BODY_INDEX, bodySpec, bodyTuning, isRivalBody, isShell, type BodyId } from '../traffic/bodies';
import { PLAYER_PAINT } from '../traffic/Traffic';
import { CAR_IDS, type CarId } from '../vehicle/presets';
import type { VehicleTuning } from '../vehicle/tuning';

export type Stat = 'power' | 'grip' | 'boost';
export const STATS: readonly Stat[] = ['power', 'grip', 'boost'];
export type BuyResult = 'ok' | 'cash' | 'locked' | 'owned';
export type PrepItem = 'lawyer' | 'fence';

export class Garage {
  /** What the player drives out in: always an owned body. */
  car: BodyId = 'muscle';
  readonly owned = new Set<BodyId>(['muscle']);
  /** Resprays, and the paint a kept car came in; absent = the body's own. */
  readonly paint = new Map<BodyId, number>();
  /** Per class: every body of the class drives with them. */
  readonly tiers: Record<CarId, [number, number, number]>;
  /** The car's kit per car (M6 slice 8): the wheels', (a rim's, unused), the spoiler's and the stance's option numbers, 0 stock. */
  readonly carKit = new Map<BodyId, [number, number, number, number]>();
  /** Bought for the next run; `Run` consumes both at the run's end. */
  readonly prep = { lawyer: false, fence: false };
  /** One escape from heat 5 opens the police car. */
  policeUnlocked = false;
  /** Bumps on every change, so the wall and the car's paint refresh. */
  serial = 0;

  constructor(private readonly sim: SimWorld) {
    const tiers: Partial<Record<CarId, [number, number, number]>> = {};
    for (const id of CAR_IDS) tiers[id] = [0, 0, 0];
    this.tiers = tiers as Record<CarId, [number, number, number]>;
  }

  /** The player's paint for a car: the respray or the paint it was kept in, else the class's own (a shell) or the body's first. */
  paintOf(body: BodyId): number {
    const p = this.paint.get(body);
    if (p !== undefined) return p;
    return isShell(body) ? PLAYER_PAINT[body] : (bodySpec(body).paints[0] as number);
  }

  /** A car's kit options, made on first use. */
  carKitOf(body: BodyId): [number, number, number, number] {
    let k = this.carKit.get(body);
    if (!k) {
      k = [0, 0, 0, 0];
      this.carKit.set(body, k);
    }
    return k;
  }

  /** The class a body drives as: its tiers, its handling. */
  classOf(body: BodyId): CarId {
    return bodySpec(body).car;
  }

  /** The catalogue's five are for sale; a civilian body is kept at a door, a hidden car is found. */
  price(body: BodyId): number {
    if (isShell(body)) return body === 'muscle' ? 0 : BALANCE.prices[body];
    return (BALANCE.bodyPrices as Partial<Record<BodyId, number>>)[body] ?? 0;
  }

  canBuy(body: BodyId): BuyResult {
    if (this.owned.has(body)) return 'owned';
    if (!isShell(body) || (body === 'police' && !this.policeUnlocked)) return 'locked';
    return this.sim.run.funds >= this.price(body) ? 'ok' : 'cash';
  }

  /** Takes the price from the bank on 'ok' and pushes 'purchase' (value: the price, target: the body's index). */
  buy(body: BodyId): BuyResult {
    const r = this.canBuy(body);
    if (r !== 'ok') return r;
    const price = this.price(body);
    this.sim.run.spend(price);
    this.owned.add(body);
    this.serial++;
    this.sim.events.push('purchase', price, 0, 0, 0, BODY_INDEX[body]);
    return 'ok';
  }

  /** What keeping a car driven in costs (DESIGN.md §13.7): a share of its price, more for the police car. */
  keepPrice(body: BodyId): number {
    const k = BALANCE.keep;
    return Math.round(this.price(body) * (body === 'police' ? k.police : k.share));
  }

  /**
   * Bring it home, pay to keep it: the car driven through the door is owned from now on in the paint it came
   * in, and it is the one the next drive-out uses. 'owned', 'locked' (the police car before its escape) or
   * 'cash' leave everything as it was; 'ok' pushes 'purchase' like a buy.
   */
  keep(body: BodyId, paint: number): BuyResult {
    if (this.owned.has(body)) return 'owned';
    if ((body === 'police' && !this.policeUnlocked) || isRivalBody(body)) return 'locked';
    const price = this.keepPrice(body);
    if (this.sim.run.funds < price) return 'cash';
    this.sim.run.spend(price);
    this.own(body, paint);
    this.car = body;
    this.sim.events.push('purchase', price, 0, 0, 0, BODY_INDEX[body]);
    return 'ok';
  }

  /** A car that comes free (a hidden car found, a rival's won): owned, in `paint` when given. */
  own(body: BodyId, paint?: number): void {
    this.owned.add(body);
    if (paint !== undefined) this.paint.set(body, paint);
    this.serial++;
  }

  /** Owned cars only: the one the next drive-out uses. */
  select(body: BodyId): boolean {
    if (!this.owned.has(body)) return false;
    if (this.car !== body) {
      this.car = body;
      this.serial++;
    }
    return true;
  }

  /** Free. The pursuit's descriptor follows on drive-out. */
  respray(body: BodyId, paint: number): void {
    if (this.paint.get(body) === paint) return;
    this.paint.set(body, paint);
    this.serial++;
  }

  /** The next tier's price for a car's class; Infinity at tier 3. */
  tierPrice(body: BodyId, stat: Stat): number {
    const t = this.tiers[this.classOf(body)][STATS.indexOf(stat)] as number;
    return t >= 3 ? Infinity : (BALANCE.tierPrices[t] as number);
  }

  /** On the class of an owned car: 'locked' for a car not owned, 'owned' at tier 3. */
  upgrade(body: BodyId, stat: Stat): BuyResult {
    if (!this.owned.has(body)) return 'locked';
    const price = this.tierPrice(body, stat);
    if (!Number.isFinite(price)) return 'owned';
    if (this.sim.run.funds < price) return 'cash';
    this.sim.run.spend(price);
    const tiers = this.tiers[this.classOf(body)];
    const i = STATS.indexOf(stat);
    tiers[i] = (tiers[i] as number) + 1;
    this.serial++;
    this.sim.events.push('purchase', price, 0, 0, 0, BODY_INDEX[body]);
    return 'ok';
  }

  /** 'owned' when already bought for the next run. */
  buyPrep(item: PrepItem): BuyResult {
    if (this.prep[item]) return 'owned';
    const price = BALANCE.prep[item];
    if (this.sim.run.funds < price) return 'cash';
    this.sim.run.spend(price);
    this.prep[item] = true;
    this.serial++;
    this.sim.events.push('purchase', price, 0, 0, 0, -1);
    return 'ok';
  }

  /** The rewarded path: the item for a watched video, no cash. */
  grantPrep(item: PrepItem): void {
    if (this.prep[item]) return;
    this.prep[item] = true;
    this.serial++;
  }

  /**
   * The body's tuning (its class's preset on its axles, a truck's or a bus's stretched) times its class's tiers
   * into `out` (or a new tuning). Tier 0 multiplies by exactly 1, so a shell at tier 0 is its preset bitwise.
   */
  tuningFor(body: BodyId, out?: VehicleTuning): VehicleTuning {
    const base = bodyTuning(body);
    const t = out ? Object.assign(out, base) : base;
    const tiers = this.tiers[this.classOf(body)], m = BALANCE.tiers;
    const power = m.power[tiers[0]] ?? 1, grip = m.grip[tiers[1]] ?? 1, boost = m.boost[tiers[2]] ?? 1;
    t.torqueMax *= power;
    t.muFront *= grip;
    t.muRear *= grip;
    t.boostDrain *= boost;
    return t;
  }

  /**
   * Drive-out: the garage car, retuned in place on the same body (the swap's
   * path without the teleport), fresh, its paint on the police's descriptor.
   * Pose and velocity are kept.
   */
  applyToVehicle(): void {
    const sim = this.sim;
    const v = sim.vehicle;
    const body = this.owned.has(this.car) ? this.car : 'muscle';
    v.tuning = this.tuningFor(body);
    v.applyTuning();
    sim.carId = this.classOf(body);
    sim.carBody = body;
    // the garage's car, with its own kit (M6 slice 8) until a swap takes another
    sim.garageDriven = true;
    sim.carPaint = this.paintOf(body);
    sim.life.heal();
    // a fresh car: the descriptor is this one, and a police car starts as a clean disguise on the dispatcher's clock
    const pursuit = sim.pursuit;
    pursuit.descriptor.kind = sim.carId;
    pursuit.descriptor.body = sim.carBody;
    pursuit.descriptor.paint = sim.carPaint;
    pursuit.blown = false;
    pursuit.coverLeft = POLICE.disguise.seconds;
  }
}
