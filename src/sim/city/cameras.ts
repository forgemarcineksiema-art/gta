/**
 * Speed cameras (docs/M4_PLAN.md slice 6, DESIGN.md §7): ten, on the highway
 * straights and the Crown avenue, from `cover.ts`'s sites. Each watches a
 * line across its road in both directions; the chassis crossing it more than
 * `cameras.overKmh` over the road's limit flashes: one `camera` event with the
 * km/h over the limit (heat and bag from the ring), then the camera rests for
 * `cameras.cooldown` s. The pole and head are chunk statics (`cameraStatics`).
 *
 * No allocation per step.
 */
import type { EventLog } from '../events';
import { PALETTE } from '../palette';
import { POLICE } from '../police/tuning';
import { quatFromYaw, type StaticDesc } from '../scene';
import type { PlayerProbe } from '../traffic/Traffic';
import type { CameraSite } from './cover';

export interface CameraDesc {
  id: number;
  /** The line's centre on the road and the road's heading. */
  x: number;
  z: number;
  yaw: number;
  /** Half the road's width: how far across the line reaches. */
  halfWidth: number;
  poleX: number;
  poleZ: number;
  limitMs: number;
}

/** Ten sites become ten cameras, in the sites' order (deterministic: the sites are). */
export function placeCameras(sites: readonly CameraSite[], count: number): CameraDesc[] {
  return sites.slice(0, count).map((s, id) => ({ id, x: s.x, z: s.z, yaw: s.yaw, halfWidth: s.halfWidth, poleX: s.poleX, poleZ: s.poleZ, limitMs: s.limitMs }));
}

/** The pole on the verge and the head over the road's edge, facing the traffic; no collider (tag decor). */
export function cameraStatics(c: CameraDesc): StaticDesc[] {
  const q = quatFromYaw(c.yaw);
  // toward the road from the pole
  const tx = c.x - c.poleX, tz = c.z - c.poleZ, len = Math.hypot(tx, tz) || 1;
  return [
    { shape: { kind: 'box', hx: 0.12, hy: 3, hz: 0.12 }, position: { x: c.poleX, y: 3, z: c.poleZ }, rotation: q, color: PALETTE.steel, tag: 'decor' },
    { shape: { kind: 'box', hx: 0.07, hy: 0.07, hz: 0.07 }, position: { x: c.poleX + tx / len * 0.8, y: 5.9, z: c.poleZ + tz / len * 0.8 }, rotation: q, color: PALETTE.steel, tag: 'decor' },
    { shape: { kind: 'box', hx: 0.35, hy: 0.28, hz: 0.45 }, position: { x: c.poleX + tx / len * 1.4, y: 5.6, z: c.poleZ + tz / len * 1.4 }, rotation: q, color: PALETTE.ink, tag: 'decor' },
  ];
}

export class Cameras {
  readonly descs: CameraDesc[];
  /** The last camera that flashed, -1 before any. */
  lastFlashId = -1;
  flashes = 0;
  private readonly side: Int8Array;
  private readonly rest: Float32Array;

  /** 1 where the camera is switched on today (the cover's daily order); all on without one. */
  private readonly active: Uint8Array;

  constructor(sites: readonly CameraSite[], active?: Uint8Array) {
    this.descs = placeCameras(sites, POLICE.cameras.count);
    this.active = active ?? new Uint8Array(this.descs.length).fill(1);
    this.side = new Int8Array(this.descs.length);
    this.rest = new Float32Array(this.descs.length);
  }

  step(probe: PlayerProbe, dt: number, events: EventLog): void {
    const c = POLICE.cameras;
    for (let i = 0; i < this.descs.length; i++) {
      const cam = this.descs[i] as CameraDesc;
      const rest = this.rest[i] as number;
      if (rest > 0) this.rest[i] = rest - dt;
      const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
      const dx = probe.x - cam.x, dz = probe.z - cam.z;
      const along = dx * fx + dz * fz;
      const across = -dx * fz + dz * fx;
      const side = along >= 0 ? 1 : -1;
      const was = this.side[i] as number;
      this.side[i] = side;
      // a crossing: the side changed between two steps, near the line and on the road
      if (was === 0 || was === side || Math.abs(along) > 8 || Math.abs(across) > cam.halfWidth) continue;
      if (this.active[i] === 0) continue;
      const over = (probe.speed - cam.limitMs) * 3.6;
      if (over <= c.overKmh || (this.rest[i] as number) > 0) continue;
      this.rest[i] = c.cooldown;
      this.lastFlashId = cam.id;
      this.flashes++;
      events.push('camera', Math.round(over), cam.x, 5.6, cam.z, cam.id);
    }
  }
}
