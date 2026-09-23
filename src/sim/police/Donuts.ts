/**
 * The donut shop (M5.5 slice 18; BACKLOG Run structure): a kiosk under a
 * giant donut on the open plot by the Works' first street (x 110, z -241).
 * Whenever the player comes within `range` m two cruisers stand in the bays in
 * front of it, lights off: parked units, a car to BORROW like any. Units that
 * stand down after a chase head its way (Police's withdraw route). The bays
 * are the shop's (no civilian parks there). A cruiser taken or wrecked is not
 * replaced until the player has been away. No allocation per step.
 */
import type { SimWorld } from '../SimWorld';
import type { ParkingBay } from '../city/markings';
import { AgentState, type PlayerProbe } from '../traffic/Traffic';

/** The kiosk and its sign; the lane point the withdrawing units head for (the shop's side of the street, heading -X). */
export const DONUT_SHOP = { x: 110, z: -241, laneX: 110, laneZ: -229.5, laneYaw: -Math.PI / 2, range: 260, away: 420 } as const;

export class DonutShop {
  /** The two cruisers' traffic records, -1 when the bay is empty. */
  readonly cruisers = new Int16Array(2).fill(-1);
  /** The two bays in front of the shop. */
  readonly bays: ParkingBay[];
  /** A cruiser was taken or wrecked: the bays stay empty until the player has been `away` m off. */
  private spent = false;

  constructor(private readonly sim: SimWorld) {
    const all = sim.city?.roadMarkings.parking ?? [];
    this.bays = [...all].sort((a, b) => Math.hypot(a.x - DONUT_SHOP.x, a.z - DONUT_SHOP.z) - Math.hypot(b.x - DONUT_SHOP.x, b.z - DONUT_SHOP.z)).slice(0, 2);
    sim.traffic?.reserveBays(DONUT_SHOP.x, DONUT_SHOP.z, 12);
  }

  step(probe: PlayerProbe): void {
    const traffic = this.sim.traffic;
    if (!traffic || this.bays.length < 2) return;
    const d = Math.hypot(probe.x - DONUT_SHOP.x, probe.z - DONUT_SHOP.z);
    for (let k = 0; k < 2; k++) {
      const a = this.cruisers[k] as number;
      if (a < 0) continue;
      // taken (the swap leaves the player's car there), shoved into a wreck, or gone
      if (traffic.state[a] !== AgentState.Parked || traffic.police[a] !== 1) {
        this.cruisers[k] = -1;
        this.spent = true;
      }
    }
    if (d > DONUT_SHOP.away) {
      // off duty while nobody is looking
      for (let k = 0; k < 2; k++) {
        const a = this.cruisers[k] as number;
        if (a >= 0) traffic.releaseParkedPolice(a);
        this.cruisers[k] = -1;
      }
      this.spent = false;
      return;
    }
    if (this.spent || d > DONUT_SHOP.range) return;
    for (let k = 0; k < 2; k++) {
      if ((this.cruisers[k] as number) >= 0) continue;
      const bay = this.bays[k] as ParkingBay;
      this.cruisers[k] = traffic.spawnParkedPolice(bay.x, bay.z, bay.yaw, 'police');
    }
  }
}
