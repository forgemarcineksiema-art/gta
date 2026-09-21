/**
 * Hit classification for the player's chassis. Damage, swap and takedowns
 * land in later slices; this one only names the contact and emits `hit`.
 */
import type { VehicleControls } from '../controls';
import type { SimWorld } from '../SimWorld';

export interface LifeState {
  damage: number;
  stage: 0 | 1 | 2 | 3 | 4;
  wrecked: boolean;
  wreckedFor: number;
  swapCandidate: number;
  oncoming: boolean;
  slowMo: number;
  slowMoTarget: number;
  respawnIn: number;
}

export class Life {
  readonly state: LifeState = {
    damage: 0,
    stage: 0,
    wrecked: false,
    wreckedFor: 0,
    swapCandidate: -1,
    oncoming: false,
    slowMo: 0,
    slowMoTarget: -1,
    respawnIn: -1,
  };

  constructor(private readonly sim: SimWorld) {}

  preStep(_controls: VehicleControls, _dt: number): void {
    // Swap and the wreck timer arrive in later slices.
  }

  postStep(_dt: number): void {
    const tm = this.sim.vehicle.telemetry;
    if (tm.hitHandle < 0 || tm.impact <= 0) return;
    const kind = this.classify(tm.hitHandle);
    if (kind === 'none') return;
    const agent = kind === 'traffic' ? (this.sim.traffic?.agentForCollider(tm.hitHandle) ?? -1) : -1;
    if (agent >= 0 && this.sim.traffic) this.sim.traffic.lastPlayerContactTick[agent] = this.sim.tick;
    this.sim.events.push('hit', tm.impact, tm.contactX, tm.contactY, tm.contactZ, agent);
  }

  skipSlowMo(): void {
    this.state.slowMo = 0;
    this.state.slowMoTarget = -1;
  }

  /** Traffic, a fixed restitution-1 solid (building or boundary), other fixed colliders, or a dynamic prop. */
  classify(handle: number): 'traffic' | 'wall' | 'terrain' | 'prop' | 'none' {
    if (handle < 0) return 'none';
    if (this.sim.traffic && this.sim.traffic.agentForCollider(handle) >= 0) return 'traffic';
    const col = this.sim.world.getCollider(handle);
    if (!col) return 'none';
    const parent = col.parent();
    const fixed = parent === null || parent.isFixed();
    if (!fixed) return 'prop';
    return col.restitution() >= 0.99 ? 'wall' : 'terrain';
  }
}
