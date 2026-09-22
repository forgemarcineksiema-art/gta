/**
 * A drive to a drop-off for the road bot (`?bot=door`, the slice-3a
 * measurement): the shortest lane path from the car's lane to the garage's
 * approach lane, a turn off that lane into the door, and a crawl to the middle
 * of the garage. Samples every 3 m with curvature, as `TrackBot` expects; the
 * last ones are marked tight so its speed plan arrives at a crawl.
 */
import type { DropOff, Lane, SimWorld, TrackSample } from '../sim';
import { alongLane, chainPoints, crawlInto, garageEntry, laneAt, laneChain, laneSpan, resample, type Pt } from '../sim/city/route';

export function routeToDropOff(sim: SimWorld, site: DropOff): TrackSample[] {
  const city = sim.city;
  if (!city || site.approachLane < 0) return [];
  const p = sim.vehicle.body.translation();
  const chain = laneChain(city.graph, city.nearestLane(p.x, p.z), site.approachLane);
  if (chain.length === 0) return [];
  const raw: Pt[] = [];
  chainPoints(city.graph, chain, raw);
  // along the approach lane to 14 m short of the door, then a curve into the opening and on to the middle
  const approach = city.graph.lanes[site.approachLane] as Lane;
  const stop = alongLane(approach, site.door.x, site.door.z).s - 14;
  laneSpan(approach, 0, stop, raw);
  const turn = raw[raw.length - 1] ?? { x: approach.x0, z: approach.z0 };
  garageEntry(site, turn, laneAt(approach, Math.max(0, stop)).yaw, raw);
  const samples = resample(raw);
  crawlInto(samples, site);
  return samples;
}
