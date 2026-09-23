/**
 * Hidden cars (M5.5 slice 16; DESIGN.md §8, Forza Horizon's barn finds): the
 * ice-cream truck stands on the Palm Gardens stretch of the edge park, off
 * every road, its jingle playing to whoever drives near. A swap into it finds
 * it for good: the garage keeps it (a card on the wall, driven out like any
 * car, no upgrades: it is a toy) and the stash stands empty. The parked
 * record is placed when the player comes within `range` m and freed by the
 * traffic's own despawn; the city's toys (the giant ball in the Works yard)
 * live here too. No allocation per step.
 */
import { BALANCE } from '../balance';
import { PALETTE } from '../palette';
import { IDENTITY_QUAT } from '../scene';
import type { PropSpawn } from '../playground';
import type { SimWorld } from '../SimWorld';
import { BODY_INDEX, bodySpec } from '../traffic/bodies';
import { AgentState, type PlayerProbe } from '../traffic/Traffic';

/** The hidden cars; each is a civilian body the spawner never draws. */
export type HiddenCar = 'icecream';
export const HIDDEN_CARS: readonly HiddenCar[] = ['icecream'];

/** Where each stands: the south edge park's lawn in Palm Gardens, parked along the strip. */
export const STASH_SPOTS: Readonly<Record<HiddenCar, { x: number; z: number; yaw: number }>> = {
  icecream: { x: -350, z: 737.5, yaw: Math.PI / 2 },
};

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
  /** The hidden cars found; the save carries them. */
  readonly found = new Set<HiddenCar>();
  /** The stashed truck's traffic record while it stands at its spot, -1 otherwise. */
  agent = -1;
  /** Bumps when a car is found (the wall's card appears). */
  serial = 0;

  constructor(private readonly sim: SimWorld) {}

  /** A hidden car is found the moment the player drives it; the stash keeps the unfound one standing near the player. */
  step(probe: PlayerProbe): void {
    const sim = this.sim, traffic = sim.traffic;
    if (!traffic) return;
    const id: HiddenCar = 'icecream';
    if (sim.carBody === id && !this.found.has(id)) {
      this.found.add(id);
      this.serial++;
      sim.garage.serial++;
      sim.events.push('hiddenCar', 0, probe.x, 0, probe.z, HIDDEN_CARS.indexOf(id));
    }
    // the record went (the traffic's despawn) or became another car (the swap left the player's old one there)
    const a = this.agent;
    if (a >= 0 && (traffic.state[a] === AgentState.Free || traffic.body[a] !== BODY_INDEX[id])) this.agent = -1;
    if (this.found.has(id) || this.agent >= 0) return;
    const spot = STASH_SPOTS[id];
    if (Math.hypot(probe.x - spot.x, probe.z - spot.z) > BALANCE.stash.range) return;
    this.agent = traffic.spawnAtPoint(spot.x, spot.z, spot.yaw, id, AgentState.Abandoned, bodySpec(id).paints[0]);
  }

  /** Whether the unfound truck stands at its spot now (the jingle plays from it). */
  get standing(): boolean {
    return this.agent >= 0;
  }
}
