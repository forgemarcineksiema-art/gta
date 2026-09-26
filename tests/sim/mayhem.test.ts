/**
 * Mayhem and the cold open (M8 slice 8, docs/history/M8_PLAN.md): each mayhem zone's corner is a market of thirty things
 * and more, a smash in the zone is priced at its bill toward a quota of 15,000; the cold open drives through a café
 * terrace, a newspaper box and a bin on its footway run, a newsstand beside it, and nothing on its route would hold it.
 */
import { describe, expect, it } from 'vitest';
import { CAR_PRESETS, type SimWorld } from '../../src/sim';
import { BALANCE } from '../../src/sim/balance';
import { PROP_TYPES, propRadius, type PropDesc, type PropKind } from '../../src/sim/city/props';
import { BLOCK } from '../../src/sim/city/roads';
import { carSpeedLoss } from '../../src/sim/props/Props';
import { coldOpenRoute } from '../../src/sim/run/ColdOpen';
import { createWorld, run } from './helpers';

const KMH = 1 / 3.6;
const MARKET_KINDS: ReadonlySet<PropKind> = new Set(['fruitStand', 'fishStall', 'crate', 'table', 'chair']);

function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

function stockOf(sim: SimWorld, x: number, z: number): PropDesc[] {
  return sim.city!.props(Math.round(x / BLOCK), Math.round(z / BLOCK)).filter((p) => MARKET_KINDS.has(p.kind) && Math.hypot(p.x - x, p.z - z) < 60);
}

describe('mayhem and the cold open (M8 slice 8)', () => {
  it('M8 8.1 each mayhem zone is a market of thirty things and more; a smash there is priced at its bill; the quota is 15,000', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const zones = sim.jobs.defs.filter((d) => d.kind === 'mayhem');
      expect(zones.length).toBe(2);
      expect(BALANCE.jobs.zone.mayhem.quota).toBe(15_000);
      for (const d of zones) {
        expect(d.level).toBe(15_000);
        const stock = stockOf(sim, d.x, d.z);
        expect(stock.length, `zone ${d.id}`).toBeGreaterThanOrEqual(30);
        // a market's worth at the sticker: 6,000–9,000, two of them (or one and the traffic) to the quota
        const bill = stock.reduce((a, p) => a + PROP_TYPES[p.kind].bill, 0);
        expect(bill, `zone ${d.id}`).toBeGreaterThanOrEqual(6000);
        expect(bill, `zone ${d.id}`).toBeLessThanOrEqual(9000);
      }
      // the job on: the player's smash counts its bill, a unit's nothing
      const d = zones[0]!;
      sim.city!.sync(d.x, d.z, true);
      sim.vehicle.teleport({ x: d.x, y: 0.8, z: d.z }, d.yaw);
      sim.vehicle.setVelocity(0, 0, 0);
      run(sim, 0.1, (_t, c) => { c.brake = 1; });
      expect(sim.jobs.state).toBe('active');
      const stock = stockOf(sim, d.x, d.z);
      const stall = stock.find((p) => p.kind === 'fruitStand')!, crate = stock.find((p) => p.kind === 'crate')!;
      const before = sim.jobs.zoneCount;
      sim.props!.knock(stall.id, 1400, 40 * KMH, -Math.sin(stall.yaw), -Math.cos(stall.yaw), 0, 0);
      run(sim, 2 / 60);
      expect(sim.jobs.zoneCount - before).toBe(PROP_TYPES.fruitStand.bill);
      sim.props!.knock(crate.id, 1400, 40 * KMH, -Math.sin(crate.yaw), -Math.cos(crate.yaw), 0, 0, 3);
      run(sim, 2 / 60);
      expect(sim.jobs.zoneCount - before).toBe(PROP_TYPES.fruitStand.bill);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8 8.2 the cold open\'s route crosses eight things and more, all loose: nothing on it would hold the car', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const city = sim.city!;
      const loop = city.spawns.find((s) => s.name === 'loop')!;
      const route = coldOpenRoute(sim, loop.position.x, loop.position.z, sim.run.dropOffs[0]!)!;
      const q = route.samples;
      const chunks = new Set<string>();
      for (const s of q) chunks.add(`${Math.round(s.x / BLOCK)},${Math.round(s.z / BLOCK)}`);
      const keys = [...chunks].map((k) => k.split(',').map(Number) as [number, number]);
      // what stands within a car's half width of the route's line (the muscle car's, the van's is wider)
      const half = CAR_PRESETS.muscle.chassisHalfExtents.x;
      const onLine = (x: number, z: number, r: number): boolean => {
        for (let i = 0; i + 1 < q.length; i++) {
          const a = q[i]!, b = q[i + 1]!;
          if (segmentDistance(x, z, a.x, a.z, b.x, b.z) < half + r) return true;
        }
        return false;
      };
      const crossed = keys.flatMap(([cx, cz]) => city.props(cx, cz)).filter((p) => onLine(p.x, p.z, propRadius(p.kind)));
      expect(crossed.length).toBeGreaterThanOrEqual(8);
      expect(new Set(crossed.map((p) => p.kind))).toEqual(new Set(['table', 'chair', 'newsbox', 'bin']));
      // the newsstand stands beside the line, past the gate: in the run, never in the way
      const loop2 = route.samples.filter((s) => s.s > route.gateS && s.s < route.gateS + 20);
      const kiosk = keys.flatMap(([cx, cz]) => city.props(cx, cz)).find((p) => p.kind === 'kiosk' && loop2.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 5));
      expect(kiosk).toBeDefined();
      // every one loose, so it goes at any speed (the gate's bot met a newsstand on the line slowed by the rest: it held)
      for (const p of crossed) expect(PROP_TYPES[p.kind].breakImpulse, p.kind).toBe(0);
      expect(carSpeedLoss(CAR_PRESETS.muscle.mass, PROP_TYPES.bin, 5 * KMH)).not.toBeNull();
      // and no tree's solid trunk on it
      for (const [cx, cz] of keys) {
        for (const st of city.chunk(cx, cz).statics) {
          if (st.tag !== 'trunk' || st.shape.kind !== 'cylinder') continue;
          expect(onLine(st.position.x, st.position.z, st.shape.radius), `trunk at ${st.position.x}, ${st.position.z}`).toBe(false);
        }
      }
    } finally { sim.dispose(); }
  }, 60_000);
});
