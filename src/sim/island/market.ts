/**
 * The mayhem zones' markets on the island (M8.10 slice 15; the grid's M8 slice 8): along the two footways nearest each
 * zone's ring, the grid's twelve stalls, fruit and fish in turn, a crate stacked between each two, centred on the ring.
 * The island's pavements are narrower than the grid's and Crown's offices stand close behind them, so a stall stands at
 * the kerb facing the pavement, as a street market's do, its shoppers on the pavement. Spots for the chunks' props
 * (`Island.props`), which claim their ground before the street furniture; each stands only where a prop may.
 */
import { MARKET, type FootwayRun, type PropKind, type PropSpot } from '../city/props';

/**
 * The market (m): `units` stalls `pitch` apart (the grid's), `legs` footways, those whose line passes within `reach` of
 * the ring; a stall's middle and a crate's `kerb` m off the road's edge (its road side clear of the carriageway, its
 * pavement side of the walkers' band), a stall `end` m at least from its run's ends.
 */
export const STALLS = { units: MARKET.units, pitch: MARKET.pitch, legs: 2, reach: 40, kerb: 0.75, end: 2 } as const;

/**
 * The market spots round each zone's ring (x, z), on the footway runs given; `edge` the distance from a point past the
 * nearest carriageway's edge, by which each thing stands `kerb` m off the road's own edge where a run follows a curve.
 */
export function marketSpots(zones: ReadonlyArray<{ x: number; z: number }>, runs: readonly FootwayRun[], edge: (x: number, z: number) => number): PropSpot[] {
  const out: PropSpot[] = [];
  for (const zone of zones) {
    // the footways nearest the ring, each with the ring's place along it
    const legs = runs.map((run) => {
      const u = Math.max(0, Math.min(run.length, (zone.x - run.x) * run.dx + (zone.z - run.z) * run.dz));
      return { run, u, d: Math.hypot(run.x + run.dx * u - zone.x, run.z + run.dz * u - zone.z) };
    }).filter((l) => l.d < STALLS.reach).sort((a, b) => a.d - b.d).slice(0, STALLS.legs);
    let k = 0;
    for (const { run, u } of legs) {
      const n = Math.ceil(STALLS.units / legs.length);
      // facing the pavement: local +Z along the run's outward normal
      const face = Math.atan2(run.nx, run.nz);
      // on the kerb line, moved across to the road's own edge (a run is straight within a few decimetres of a curve)
      const at = (along: number): [number, number] => {
        let x = run.x + run.dx * along + run.nx * STALLS.kerb, z = run.z + run.dz * along + run.nz * STALLS.kerb;
        for (let i = 0; i < 2; i++) {
          const off = STALLS.kerb - edge(x, z);
          x += run.nx * off;
          z += run.nz * off;
        }
        return [x, z];
      };
      // the row centred on the ring's place, moved along to lie on the run where it fits
      const span = (n - 1) * STALLS.pitch, first = Math.max(STALLS.end, Math.min(run.length - STALLS.end - span, u - span / 2));
      for (let i = 0; i < n; i++) {
        const v = first + i * STALLS.pitch;
        if (v > run.length - STALLS.end) break;
        const kind: PropKind = k++ % 2 === 0 ? 'fruitStand' : 'fishStall';
        const [sx, sz] = at(v);
        out.push({ kind, x: sx, z: sz, yaw: face });
        // a crate between this stall and the next
        if (i + 1 < n && v + STALLS.pitch <= run.length - STALLS.end) {
          const [cx, cz] = at(v + STALLS.pitch / 2);
          out.push({ kind: 'crate', x: cx, z: cz, yaw: face });
        }
      }
    }
  }
  return out;
}
