/**
 * A drive to a drop-off for the road bot (`?bot=door`, the slice-3a
 * measurement): the shortest lane path from the car's lane to the garage's
 * approach lane, a turn off that lane into the door, and a crawl to the middle
 * of the garage. Samples every 3 m with curvature, as `TrackBot` expects; the
 * last ones are marked tight so its speed plan arrives at a crawl.
 */
import type { DropOff, Lane, SimWorld, TrackSample } from '../sim';
import { alongLane, chainPoints, crawlInto, garageEntry, junctionCurve, laneAt, laneChain, laneSpan, resample, type Pt } from '../sim/city/route';

export function routeToDropOff(sim: SimWorld, site: DropOff, from?: { x: number; z: number }): TrackSample[] {
  const city = sim.city;
  if (!city || site.approachLane < 0) return [];
  const p = sim.vehicle.body.translation();
  // the road under the car (the chassis rides about half a metre over it): never the deck above a street;
  // from a job's marker, its own lane, the one its route coins start on (a corner marker is as near two lanes)
  const start = from ? city.nearestLane(from.x, from.z, 0) : city.nearestLane(p.x, p.z, p.y - 0.5);
  const chain = laneChain(city.graph, start, site.approachLane);
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

/**
 * A drive to a moving car (an order's wanted car, the `?bot=job` hunter and
 * the slice-2 measurement): the lanes from the player's to the car's, and on
 * along its lane 80 m past it and through the junction it will take (an open
 * path ends in a stop: its end must not be the car).
 */
export function routeToAgent(sim: SimWorld, agent: number): TrackSample[] {
  const city = sim.city, traffic = sim.traffic;
  if (!city || !traffic) return [];
  const p = sim.probe;
  const from = city.nearestLane(p.x, p.z, p.y - 0.5);
  const to = traffic.lane[agent] as number;
  if (to < 0) return [];
  const chain = from === to ? [from] : laneChain(city.graph, from, to);
  if (chain.length === 0) return [];
  const raw: Pt[] = [];
  chainPoints(city.graph, chain, raw);
  const last = city.graph.lanes[to] as Lane;
  const s0 = chain.length === 1 ? alongLane(last, p.x, p.z).s : 0;
  const len = traffic.lanes.length[to] as number;
  const end = (traffic.s[agent] as number) + 80;
  laneSpan(last, s0, Math.max(s0 + 5, Math.min(end, len)), raw);
  if (end > len) {
    const nxt = (traffic.next[agent] as number) >= 0 ? (traffic.next[agent] as number) : (last.next[0] ?? -1);
    if (nxt >= 0) {
      const next = city.graph.lanes[nxt] as Lane;
      junctionCurve(last, next, raw);
      laneSpan(next, 0, Math.min(end - len, traffic.lanes.length[nxt] as number), raw);
    }
  }
  return resample(raw);
}

/** A drive to a point beside the road (the Palm Gardens fence): the lanes to its nearest lane, along to it. */
export function routeToPoint(sim: SimWorld, x: number, z: number): TrackSample[] {
  const city = sim.city;
  if (!city) return [];
  const p = sim.vehicle.body.translation();
  const to = city.nearestLane(x, z, 0);
  const chain = laneChain(city.graph, city.nearestLane(p.x, p.z, p.y - 0.5), to);
  if (chain.length === 0) return [];
  const raw: Pt[] = [];
  chainPoints(city.graph, chain, raw);
  const last = city.graph.lanes[to] as Lane;
  const s0 = chain.length === 1 ? alongLane(last, p.x, p.z).s : 0;
  laneSpan(last, s0, Math.max(s0 + 5, alongLane(last, x, z).s), raw);
  raw.push({ x, z });
  return resample(raw);
}
