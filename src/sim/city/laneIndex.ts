/**
 * A road graph's lanes by their bounds, the grid's and the island's (M8.10 slice 14): the lane nearest a point and the
 * nearest point on any lane, a height given counting its gap (the street under a bridge is not the bridge).
 */
import type { SpawnPoint } from '../playground';
import { projectOnLane, type Lane, type RoadGraph } from './roads';

export class LaneIndex {
  /** Each lane's bounds: its least and most x, its least and most z. */
  private readonly bounds: Float64Array;
  private readonly hit: { x: number; z: number; yaw: number; y?: number } = { x: 0, z: 0, yaw: 0 };

  constructor(private readonly graph: RoadGraph) {
    this.bounds = new Float64Array(graph.lanes.length * 4);
    graph.lanes.forEach((lane, i) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of lane.points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
      this.bounds[i * 4] = x0; this.bounds[i * 4 + 1] = x1; this.bounds[i * 4 + 2] = z0; this.bounds[i * 4 + 3] = z1;
    });
  }

  /**
   * The lane nearest (x, z), -1 with none; with the road's height under the point given, a lane over or under counts its
   * height gap, so a car on the street under an overpass is not on the highway above it.
   */
  nearestLane(x: number, z: number, y?: number): number {
    let best = Infinity, found = -1;
    for (let i = 0; i < this.graph.lanes.length; i++) {
      if (this.outside(i, x, z) >= best) continue;
      const dist = projectOnLane(this.graph.lanes[i] as Lane, x, z, this.hit, y);
      if (dist < best) { best = dist; found = i; }
    }
    return found;
  }

  /**
   * The lane nearest (x, y, z) running along (dx, dz) there (its heading within 60° of it), -1 with none within `reach` m,
   * its height gap counted: a trial's point on its road (M8.10 slice 15).
   */
  laneAlong(x: number, z: number, y: number, dx: number, dz: number, reach = Infinity): number {
    const l = Math.hypot(dx, dz) || 1;
    let best = reach * reach, found = -1;
    for (let i = 0; i < this.graph.lanes.length; i++) {
      if (this.outside(i, x, z) >= best) continue;
      const dist = projectOnLane(this.graph.lanes[i] as Lane, x, z, this.hit, y);
      if (dist < best && (Math.sin(this.hit.yaw) * dx + Math.cos(this.hit.yaw) * dz) / l >= 0.5) { best = dist; found = i; }
    }
    return found;
  }

  /** The nearest point on any lane to a car at (x, y, z), a metre over it and facing along it: where a reset puts it. */
  nearestRoad(x: number, z: number, out: SpawnPoint, y = 0.5): SpawnPoint {
    let best = Infinity;
    for (let i = 0; i < this.graph.lanes.length; i++) {
      if (this.outside(i, x, z) >= best) continue;
      // the height gap counts: under a bridge the street is nearer than the deck over it
      const dist = projectOnLane(this.graph.lanes[i] as Lane, x, z, this.hit, y - 0.5);
      if (dist < best) {
        best = dist;
        out.position.x = this.hit.x; out.position.z = this.hit.z; out.position.y = 1 + (this.hit.y ?? 0); out.yaw = this.hit.yaw;
      }
    }
    return out;
  }

  /** The squared distance from (x, z) to a lane's bounds (0 inside them). */
  private outside(i: number, x: number, z: number): number {
    const b = this.bounds, dx = Math.max((b[i * 4] as number) - x, 0, x - (b[i * 4 + 1] as number)), dz = Math.max((b[i * 4 + 2] as number) - z, 0, z - (b[i * 4 + 3] as number));
    return dx * dx + dz * dz;
  }
}
