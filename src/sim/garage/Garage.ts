/**
 * The garage on the wall of every drop-off (docs/M5_PLAN.md slice 4, D8,
 * D13): the catalogue of the five bodies, the paint per car, three upgrade
 * stats in three tiers, the two prep items, and the police car's unlock.
 * Cash only: the bank and the coins (`Run.funds`). Upgrades are multipliers on the preset applied
 * at drive-out, tier 0 equal to the preset bitwise, so every handling pin
 * stands and `CAR_PRESETS` is never edited.
 *
 * No step: `App` calls these methods from the wall's intents; the save
 * applies and collects the state.
 */
import { BALANCE } from '../balance';
import { POLICE } from '../police/tuning';
import type { SimWorld } from '../SimWorld';
import { PLAYER_PAINT } from '../traffic/Traffic';
import { CAR_IDS, CAR_PRESETS, type CarId } from '../vehicle/presets';
import { cloneTuning, type VehicleTuning } from '../vehicle/tuning';

export type Stat = 'power' | 'grip' | 'boost';
export const STATS: readonly Stat[] = ['power', 'grip', 'boost'];
export type BuyResult = 'ok' | 'cash' | 'locked' | 'owned';
export type PrepItem = 'lawyer' | 'fence';

export class Garage {
  /** What the player drives out in. */
  car: CarId = 'muscle';
  readonly owned = new Set<CarId>(['muscle']);
  /** Resprays; absent = the class's paint. */
  readonly paint = new Map<CarId, number>();
  readonly tiers: Record<CarId, [number, number, number]>;
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

  /** The player's paint for a class: the respray, or the class's own. */
  paintOf(car: CarId): number {
    return this.paint.get(car) ?? PLAYER_PAINT[car];
  }

  price(car: CarId): number {
    return car === 'muscle' ? 0 : BALANCE.prices[car];
  }

  canBuy(car: CarId): BuyResult {
    if (this.owned.has(car)) return 'owned';
    if (car === 'police' && !this.policeUnlocked) return 'locked';
    return this.sim.run.funds >= this.price(car) ? 'ok' : 'cash';
  }

  /** Takes the price from the bank on 'ok' and pushes 'purchase' (value: the price). */
  buy(car: CarId): BuyResult {
    const r = this.canBuy(car);
    if (r !== 'ok') return r;
    const price = this.price(car);
    this.sim.run.spend(price);
    this.owned.add(car);
    this.serial++;
    this.sim.events.push('purchase', price, 0, 0, 0, CAR_IDS.indexOf(car));
    return 'ok';
  }

  /** What keeping a car driven in costs (DESIGN.md §13.7): a share of its price, more for the police car. */
  keepPrice(car: CarId): number {
    const k = BALANCE.keep;
    return Math.round(this.price(car) * (car === 'police' ? k.police : k.share));
  }

  /**
   * Bring it home, pay to keep it: the car driven through the door is owned from now on in the paint it came
   * in, and it is the one the next drive-out uses. 'owned', 'locked' (the police car before its escape) or
   * 'cash' leave everything as it was; 'ok' pushes 'purchase' like a buy.
   */
  keep(car: CarId, paint: number): BuyResult {
    if (this.owned.has(car)) return 'owned';
    if (car === 'police' && !this.policeUnlocked) return 'locked';
    const price = this.keepPrice(car);
    if (this.sim.run.funds < price) return 'cash';
    this.sim.run.spend(price);
    this.owned.add(car);
    this.paint.set(car, paint);
    this.car = car;
    this.serial++;
    this.sim.events.push('purchase', price, 0, 0, 0, CAR_IDS.indexOf(car));
    return 'ok';
  }

  /** Owned cars only: the one the next drive-out uses. */
  select(car: CarId): boolean {
    if (!this.owned.has(car)) return false;
    if (this.car !== car) {
      this.car = car;
      this.serial++;
    }
    return true;
  }

  /** Free. The pursuit's descriptor follows on drive-out. */
  respray(car: CarId, paint: number): void {
    if (this.paint.get(car) === paint) return;
    this.paint.set(car, paint);
    this.serial++;
  }

  /** The next tier's price; Infinity at tier 3. */
  tierPrice(car: CarId, stat: Stat): number {
    const t = this.tiers[car][STATS.indexOf(stat)] as number;
    return t >= 3 ? Infinity : (BALANCE.tierPrices[t] as number);
  }

  /** 'locked' for a car not owned, 'owned' at tier 3. */
  upgrade(car: CarId, stat: Stat): BuyResult {
    if (!this.owned.has(car)) return 'locked';
    const price = this.tierPrice(car, stat);
    if (!Number.isFinite(price)) return 'owned';
    if (this.sim.run.funds < price) return 'cash';
    this.sim.run.spend(price);
    const tiers = this.tiers[car];
    const i = STATS.indexOf(stat);
    tiers[i] = (tiers[i] as number) + 1;
    this.serial++;
    this.sim.events.push('purchase', price, 0, 0, 0, CAR_IDS.indexOf(car));
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

  /** The preset times the car's tiers into `out` (or a new tuning). Tier 0 multiplies by exactly 1. */
  tuningFor(car: CarId, out?: VehicleTuning): VehicleTuning {
    const t = out ? Object.assign(out, cloneTuning(CAR_PRESETS[car])) : cloneTuning(CAR_PRESETS[car]);
    const tiers = this.tiers[car], m = BALANCE.tiers;
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
    v.tuning = this.tuningFor(this.car);
    v.applyTuning();
    sim.carId = this.car;
    sim.life.heal();
    // a fresh car: the descriptor is this one, and a police car starts as a clean disguise on the dispatcher's clock
    const pursuit = sim.pursuit;
    pursuit.descriptor.kind = this.car;
    pursuit.descriptor.paint = this.paintOf(this.car);
    pursuit.blown = false;
    pursuit.coverLeft = POLICE.disguise.seconds;
  }
}
