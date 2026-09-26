/**
 * The donut shop (M5.5 slice 18; BACKLOG Run structure): a kiosk under a
 * giant donut on the open plot by the Works' first street (x 110, z -241; the
 * island's by the centre's roundabout, M8.10 slice 15a). Whenever the player
 * comes within `range` m two cruisers stand in the bays in front of it, lights
 * off: parked units, a car to BORROW like any. Units that stand down after a
 * chase head its way (Police's withdraw route). The bays are the shop's (no
 * civilian parks there). A cruiser taken or wrecked is not replaced until the
 * player has been away. No allocation per step.
 */
import type { SimWorld } from '../SimWorld';
import type { ParkingBay } from '../city/markings';
import { AgentState, type PlayerProbe } from '../traffic/Traffic';

/**
 * Where a donut shop stands: its kiosk's middle on the ground under it and the way its window looks (quatFromYaw's: 0 is
 * +Z); the lane point the withdrawing units head for; how near the cruisers come out and how far off they go off duty;
 * its own two bays (the island's, at its kerb), else the street's two nearest (the grid's).
 */
export interface DonutSite { x: number; y: number; z: number; yaw: number; laneX: number; laneZ: number; laneYaw: number; range: number; away: number; bays?: readonly ParkingBay[] }

/** The grid's kiosk and its sign, facing north; the lane point the withdrawing units head for (the shop's side of the street, heading -X). */
export const DONUT_SHOP: Readonly<DonutSite> = { x: 110, y: 0, z: -241, yaw: 0, laneX: 110, laneZ: -229.5, laneYaw: -Math.PI / 2, range: 260, away: 420 };

export class DonutShop {
  /** The two cruisers' traffic records, -1 when the bay is empty. */
  readonly cruisers = new Int16Array(2).fill(-1);
  /** The two bays in front of the shop. */
  readonly bays: ParkingBay[];
  /** A cruiser was taken or wrecked: the bays stay empty until the player has been `away` m off. */
  private spent = false;

  /** `site`: where it stands (the grid's by default). */
  constructor(private readonly sim: SimWorld, readonly site: Readonly<DonutSite> = DONUT_SHOP) {
    const all = sim.city?.roadMarkings.parking ?? [];
    this.bays = site.bays ? [...site.bays] : [...all].sort((a, b) => Math.hypot(a.x - site.x, a.z - site.z) - Math.hypot(b.x - site.x, b.z - site.z)).slice(0, 2);
    sim.traffic?.reserveBays(site.x, site.z, 12);
  }

  step(probe: PlayerProbe): void {
    const traffic = this.sim.traffic;
    if (!traffic || this.bays.length < 2) return;
    const site = this.site;
    const d = Math.hypot(probe.x - site.x, probe.z - site.z);
    for (let k = 0; k < 2; k++) {
      const a = this.cruisers[k] as number;
      if (a < 0) continue;
      // taken (the swap leaves the player's car there), shoved into a wreck, or gone
      if (traffic.state[a] !== AgentState.Parked || traffic.police[a] !== 1) {
        this.cruisers[k] = -1;
        this.spent = true;
      }
    }
    if (d > site.away) {
      // off duty while nobody is looking
      for (let k = 0; k < 2; k++) {
        const a = this.cruisers[k] as number;
        if (a >= 0) traffic.releaseParkedPolice(a);
        this.cruisers[k] = -1;
      }
      this.spent = false;
      return;
    }
    if (this.spent || d > site.range) return;
    for (let k = 0; k < 2; k++) {
      if ((this.cruisers[k] as number) >= 0) continue;
      const bay = this.bays[k] as ParkingBay;
      this.cruisers[k] = traffic.spawnParkedPolice(bay.x, bay.z, bay.yaw, 'police');
    }
  }
}
