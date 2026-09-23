/**
 * Hidden cars (M5.5 slice 16, M6 slice 9; DESIGN.md §8, §14.6, Forza Horizon's
 * barn finds): the ice-cream truck on the Palm Gardens stretch of the edge
 * park, and one in each district without one, parked in a quiet kerbside bay:
 * a roadster in Crown Heights, a street sweeper in Sunset Works, a hot-dog van
 * on the Coral Quay. Each plays its own clue to whoever drives near. A swap
 * into one finds it for good: the garage owns it and its stash stands empty.
 * A parked record is placed when the player comes within `range` m and freed
 * by the traffic's own despawn; the city's toys (the giant ball in the Works
 * yard) live here too. No allocation per step.
 */
import { BALANCE } from '../balance';
import { districtAt } from './City';
import type { ParkingBay } from './markings';
import { PALETTE } from '../palette';
import { IDENTITY_QUAT } from '../scene';
import type { PropSpawn } from '../playground';
import type { SimWorld } from '../SimWorld';
import { BODY_INDEX, bodySpec } from '../traffic/bodies';
import { AgentState, type PlayerProbe } from '../traffic/Traffic';

/** The hidden cars; each is a civilian body the spawner never draws. */
export type HiddenCar = 'icecream' | 'roadster' | 'sweeper' | 'hotdog';
export const HIDDEN_CARS: readonly HiddenCar[] = ['icecream', 'roadster', 'sweeper', 'hotdog'];

/** The ice-cream truck's spot: the south edge park's lawn in Palm Gardens, parked along the strip. */
export const STASH_SPOTS: Readonly<Record<'icecream', { x: number; z: number; yaw: number }>> = {
  icecream: { x: -350, z: 737.5, yaw: Math.PI / 2 },
};

/** The district each of the other three waits in (city/City.ts ids). */
const HIDDEN_DISTRICT: Readonly<Record<Exclude<HiddenCar, 'icecream'>, string>> = { roadster: 'crown', sweeper: 'foundry', hotdog: 'marina' };

/**
 * Where each hidden car stands (M6 slice 9): the ice-cream truck on its lawn; each of the others in the kerbside bay
 * of its district furthest from the island's middle that keeps `STASH_CLEAR` m from every job's marker and door (the
 * wanted board's rivals wait in bays too), a quiet street's end the traffic drives past.
 */
export function stashSpots(bays: readonly ParkingBay[], markers: ReadonlyArray<{ x: number; z: number }>): Record<HiddenCar, { x: number; z: number; yaw: number }> {
  const out = { icecream: STASH_SPOTS.icecream } as Record<HiddenCar, { x: number; z: number; yaw: number }>;
  for (const id of ['roadster', 'sweeper', 'hotdog'] as const) {
    let best: ParkingBay | null = null, far = -1;
    for (const b of bays) {
      if (districtAt(b.x, b.z).id !== HIDDEN_DISTRICT[id]) continue;
      if (markers.some((m) => Math.hypot(m.x - b.x, m.z - b.z) < STASH_CLEAR)) continue;
      const d = Math.hypot(b.x, b.z);
      if (d > far) { far = d; best = b; }
    }
    out[id] = best ? { x: best.x, z: best.z, yaw: best.yaw } : { x: 0, z: 0, yaw: 0 };
  }
  return out;
}

/** Metres a hidden car's bay keeps from every job's marker and door. */
const STASH_CLEAR = 60;

/**
 * The giant ball (DESIGN.md §8, Rocket League's): one dynamic sphere on the open yard south of the Works'
 * street, 50 m of nothing taller than a kerb round it. Light for its size, so a car sends it rolling.
 */
export const GIANT_BALL = { x: 300, z: -480, radius: 2.2, mass: 180 } as const;

/** The city's dynamic toys, placed at world build. */
export function cityToys(): PropSpawn[] {
  const b = GIANT_BALL;
  return [{ position: { x: b.x, y: b.radius + 0.05, z: b.z }, rotation: { ...IDENTITY_QUAT }, shape: { kind: 'ball', radius: b.radius }, color: PALETTE.carRed, mass: b.mass }];
}

export class Stash {
  /** The hidden cars found; the save carries them (as owned cars since M6). */
  readonly found = new Set<HiddenCar>();
  /** Each hidden car's traffic record while it stands at its spot, -1 otherwise (`HIDDEN_CARS` order). */
  readonly agents = new Int16Array(HIDDEN_CARS.length).fill(-1);
  /** Where each stands. */
  readonly spots: Record<HiddenCar, { x: number; z: number; yaw: number }>;
  /** Bumps when a car is found (the wall's card appears). */
  serial = 0;
  /** The bays of the three are kept free of parked civilians from the first step. */
  private reserved = false;

  constructor(private readonly sim: SimWorld) {
    const markers = sim.jobs.defs.map((d) => ({ x: d.x, z: d.z }));
    for (const site of sim.cover?.dropOffs ?? []) markers.push({ x: site.door.x, z: site.door.z });
    this.spots = sim.city ? stashSpots(sim.city.roadMarkings.parking, markers) : { ...STASH_SPOTS, roadster: { x: 0, z: 0, yaw: 0 }, sweeper: { x: 0, z: 0, yaw: 0 }, hotdog: { x: 0, z: 0, yaw: 0 } };
  }

  /** A hidden car is found the moment the player drives it; the stash keeps each unfound one standing near the player. */
  step(probe: PlayerProbe): void {
    const sim = this.sim, traffic = sim.traffic;
    if (!traffic) return;
    if (!this.reserved) {
      // no civilian parks in a hidden car's bay
      this.reserved = true;
      for (let k = 1; k < HIDDEN_CARS.length; k++) {
        const spot = this.spots[HIDDEN_CARS[k] as HiddenCar];
        traffic.reserveBayAt(spot.x, spot.z);
      }
    }
    for (let k = 0; k < HIDDEN_CARS.length; k++) {
      const id = HIDDEN_CARS[k] as HiddenCar;
      if (sim.carBody === id && !this.found.has(id)) {
        this.found.add(id);
        this.serial++;
        // found for good: a car in the garage from now on (M6 slice 0), in its own paint
        sim.garage.own(id);
        sim.events.push('hiddenCar', 0, probe.x, 0, probe.z, k);
      }
      // the record went (the traffic's despawn) or became another car (the swap left the player's old one there)
      const a = this.agents[k] as number;
      if (a >= 0 && (traffic.state[a] === AgentState.Free || traffic.body[a] !== BODY_INDEX[id])) this.agents[k] = -1;
      if (this.found.has(id) || (this.agents[k] as number) >= 0) continue;
      const spot = this.spots[id];
      if (Math.hypot(probe.x - spot.x, probe.z - spot.z) > BALANCE.stash.range) continue;
      this.agents[k] = traffic.spawnAtPoint(spot.x, spot.z, spot.yaw, id, AgentState.Abandoned, bodySpec(id).paints[0]);
    }
  }

  /** The ice-cream truck's record (the M5.5 name): -1 unless it stands at its spot. */
  get agent(): number {
    return this.agents[0] as number;
  }

  /** Whether the unfound truck stands at its spot now (the jingle plays from it). */
  get standing(): boolean {
    return (this.agents[0] as number) >= 0;
  }
}
