/** M8.10 slice 15: the jumps, the billboards and the breakers on the island (docs/M8.10_PLAN.md §1.4). */
import RAPIER from '@dimforge/rapier3d-compat';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BREAKER, BreakerState, PROP_TYPES, clearControls, type SimWorld } from '../../../src/sim';
import type { JumpDesc } from '../../../src/sim/city/jumps';
import { QUERY_NOT_PROP } from '../../../src/sim/collision';
import { inLot } from '../../../src/sim/island/fill';
import { CHUNKS_X, CHUNKS_Z, Island, PLUMB_TILT } from '../../../src/sim/island/Island';
import { designKmh, runUp } from '../../../src/sim/island/jumps';
import { inKeep } from '../../../src/sim/island/keep';
import { BREAKERS, FIRST_MINUTE_STEPS, JUMPS } from '../../../src/sim/island/plan';
import type { CrownPlace } from '../../../src/sim/island/places/crown';
import { quayPlace } from '../../../src/sim/island/places/quay';
import { createWorld } from '../helpers';

/**
 * Straight at a jump from its run-up's start at `kmh`, held to its foot, then flat out: the jumps' own reading of the
 * flight from it (its `jump` event's airtime, 0 for none), the billboards smashed on the way and in the second after
 * it lands, and how the car is then: upright, and its speed (km/h).
 */
function fly(sim: SimWorld, jd: JumpDesc, kmh: number): { air: number; smashed: number[]; up: number; after: number } {
  const island = sim.island as Island, fx = Math.sin(jd.yaw), fz = Math.cos(jd.yaw), v = kmh / 3.6;
  const x0 = jd.x - fx * (jd.length + runUp(jd.id)), z0 = jd.z - fz * (jd.length + runUp(jd.id));
  island.sync(x0, z0, true);
  // on its roof or its deck, else on the drawn ground (over the tunnel its lid, not the trench the physics digs under it)
  sim.vehicle.teleport({ x: x0, y: Math.max(island.ground.surfaceHeight(x0, z0), jd.y ?? -99) + 0.8, z: z0 }, jd.yaw);
  sim.vehicle.setVelocity(fx * v, 0, fz * v);
  const before = Uint8Array.from((sim.collectibles?.smashed ?? new Uint8Array(0)));
  let seq = sim.events.sequence, air = 0, landed = -1;
  for (let i = 0; i < 60 * 13 && (landed < 0 || i < landed + 60); i++) {
    const p = sim.vehicle.body.translation(), q = sim.vehicle.body.rotation();
    const along = (p.x - jd.x) * fx + (p.z - jd.z) * fz;
    // hold the heading
    const heading = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
    let err = jd.yaw - heading;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    clearControls(sim.controls);
    sim.controls.throttle = 1;
    sim.controls.steer = Math.max(-1, Math.min(1, -err * 2));
    if (along < -jd.length - 2) sim.vehicle.setVelocity(fx * v, sim.vehicle.body.linvel().y, fz * v);
    sim.step();
    seq = sim.events.readFrom(seq, (e) => { if (e.kind === 'jump' && e.target === jd.id && landed < 0) { air = e.value; landed = i; } });
  }
  const now = sim.collectibles?.smashed ?? new Uint8Array(0), smashed: number[] = [];
  now.forEach((s, id) => { if (s === 1 && before[id] !== 1) smashed.push(id); });
  const q = sim.vehicle.body.rotation();
  return { air, smashed, up: 1 - 2 * (q.x * q.x + q.z * q.z), after: sim.vehicle.telemetry.speedKmh };
}

describe('M8.10 slice 15: jumps, billboards, breakers', () => {
  let sim: SimWorld, island: Island;
  // the island's build takes seconds, more under a full run's load
  beforeAll(async () => { sim = await createWorld({ map: 'island', traffic: 0, peds: 0, record: false }); island = sim.island as Island; }, 120_000);
  afterAll(() => sim.dispose());

  /** The height of what stands at (x, z) under `from` (the island's ground, a kerb, a deck, a roof), props aside. */
  const surfaceUnder = (x: number, z: number, from: number): number | null => {
    const hit = sim.world.castRay(new RAPIER.Ray({ x, y: from, z }, { x: PLUMB_TILT, y: -1, z: PLUMB_TILT }), 20, true, undefined, QUERY_NOT_PROP, undefined, sim.vehicle.body);
    return hit ? from - hit.timeOfImpact : null;
  };
  /** The chunks round (x, z) in the physics, and the queries seeing them. */
  const load = (x: number, z: number): void => { island.sync(x, z, true); sim.world.step(); };

  it('15.1 the counts: twenty jumps in the plan\'s order, fifty billboards (16 on the verges, 26 on the streets, 8 on the big jumps\' landings), eight breakers of the plan\'s kinds', () => {
    expect(island.jumps.map((j) => j.id)).toEqual(JUMPS.map((_, id) => id));
    expect(sim.jumps?.descs).toBe(island.jumps);
    expect(island.jumps.filter((j) => j.mega === true).map((j) => j.id)).toEqual([JUMPS.findIndex((j) => j.kind === 'mega')]);
    const sites = island.stuntSites.billboards;
    expect(island.billboards.map((b) => b.id)).toEqual([...Array(50).keys()]);
    expect(['verge', 'street', 'landing'].map((k) => sites.filter((b) => b.kind === k).length)).toEqual([16, 26, 8]);
    // the landings' are the big jumps' (the plan's), each one
    expect(sites.filter((b) => b.kind === 'landing').map((b) => b.jump).sort((a, b) => a - b)).toEqual(JUMPS.flatMap((j, id) => (j.billboard ? [id] : [])));
    expect(sim.collectibles?.total).toBe(50);
    for (const b of island.billboards) expect(sim.collectibles?.descOf(b.id)).toBe(b);
    expect(island.breakers.map((b) => b.kind)).toEqual(BREAKERS.map((b) => b.kind));
    expect(sim.breakers?.descs).toBe(island.breakers);
    // the first minute's billboard (DESIGN §6.6 redrawn, §1.4) where the plan puts it, on Crown Avenue's way down
    const step = FIRST_MINUTE_STEPS.find((s) => s.step === 'billboard');
    expect(island.billboards.some((b) => step && Math.hypot(b.x - step.at[0], b.z - step.at[1]) < 20)).toBe(true);
  });

  it('15.2 each on land, or on its deck, its roof or over the water where it belongs', () => {
    const crown = island.places.find((p) => p.id === 'crown') as CrownPlace, quay = quayPlace(island.places);
    const gap = JUMPS.findIndex((j) => j.kind === 'gap' && j.at[1] < -400), roof = 15;
    for (const jd of island.jumps) {
      const fx = Math.sin(jd.yaw), fz = Math.cos(jd.yaw), footX = jd.x - fx * jd.length, footZ = jd.z - fz * jd.length, at = `jump ${jd.id}`;
      if (jd.id === gap) {
        // the piers' gap: its kickers on the boardwalk over the bay
        expect(island.ground.onLand(jd.x, jd.z), at).toBe(false);
        expect(Math.abs((jd.y ?? 0) - (quay?.gap.y ?? -99)), at).toBeLessThan(0.3);
        continue;
      }
      if (jd.id === roof) {
        expect(Math.abs((jd.y ?? 0) - crown.carParkRoof), at).toBeLessThan(0.1);
        continue;
      }
      expect(island.ground.onLand(footX, footZ), at).toBe(true);
      expect(island.ground.onLand(jd.x, jd.z), at).toBe(true);
      // its foot on the ground (a hump's base the lower of its ends)
      load(footX, footZ);
      const under = surfaceUnder(footX, footZ, (jd.y ?? 0) + 3);
      expect(under, at).not.toBeNull();
      expect(Math.abs((under ?? 0) - (jd.y ?? 0)), at).toBeLessThan(jd.back !== undefined ? 3.2 : 0.35);
    }
    // each billboard's posts on what is there: the ground, a pavement, a boardwalk, a roof
    for (const b of island.billboards) {
      const ax = Math.cos(b.yaw), az = -Math.sin(b.yaw), h = b.width / 2 - 0.5, at = `billboard ${b.id} at ${b.x.toFixed(0)}, ${b.z.toFixed(0)}`;
      load(b.x, b.z);
      const posts = [1, -1].map((s) => surfaceUnder(b.x + ax * h * s, b.z + az * h * s, (b.y ?? 0) + 4));
      expect(posts.every((p) => p !== null), at).toBe(true);
      const low = Math.min(...(posts as number[])), high = Math.max(...(posts as number[]));
      // (the physics' ground a 2 m field: a post past the pavement a hand off the drawn ground on a curve)
      expect(Math.abs(low - (b.y ?? 0)), at).toBeLessThan(0.25);
      expect(high - low, at).toBeLessThan(0.9);
    }
    // each breaker on its pavement's top (or its verge), falling across a road: its barrier's middle on a carriageway
    for (const b of island.breakers) {
      const at = `breaker ${b.id} ${b.kind}`;
      expect(island.ground.onLand(b.x, b.z), at).toBe(true);
      load(b.x, b.z);
      expect(Math.abs((surfaceUnder(b.x, b.z, (b.y ?? 0) + 3) ?? -99) - (b.y ?? 0)), at).toBeLessThan(0.12);
      const from = BREAKER.halfDepth + BREAKER.height / 2;
      expect(island.ground.nearOtherRoad(b.x + b.nx * from, b.z + b.nz * from, -1, 0), at).toBe(true);
    }
  }, 60_000);

  it('15.3 each jump flies a second or more at its design speed, lands on its wheels and drives on, the big ones through their billboard', () => {
    const landings = island.stuntSites.billboards.map((b, id) => ({ id, jump: b.jump })).filter((b) => b.jump >= 0);
    const times: string[] = [];
    for (const jd of island.jumps) {
      const kmh = designKmh(jd.id), { air, smashed, up, after } = fly(sim, jd, kmh), at = `jump ${jd.id} at ${kmh} km/h`;
      times.push(`${jd.id} ${air.toFixed(2)}`);
      expect(air, at).toBeGreaterThanOrEqual(1);
      // a second after it lands: on its wheels, driving on (no wall where it comes down)
      expect(up, at).toBeGreaterThan(0.8);
      expect(after, at).toBeGreaterThan(30);
      const board = landings.find((b) => b.jump === jd.id);
      if (board) expect(smashed, `jump ${jd.id}'s billboard`).toContain(board.id);
    }
    console.log(`15.3 airtimes at the design speeds: ${times.join(', ')}`);
  }, 120_000);

  it('15.4 the lots, the props and the places\' walls keep off the jumps\' ways, the breakers and the billboards\' run-outs (a loose prop may stand in a run-out)', () => {
    const sites = island.stuntSites;
    for (const l of island.fill.lots) for (const k of sites.keep) {
      // a lot's corners and middle outside every kept rectangle
      for (const [u, v] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const x = l.x + Math.cos(l.yaw) * l.hx * u + Math.sin(l.yaw) * l.hz * v, z = l.z - Math.sin(l.yaw) * l.hx * u + Math.cos(l.yaw) * l.hz * v;
        expect(inKeep(k, x, z), `a lot at ${l.x.toFixed(0)}, ${l.z.toFixed(0)}`).toBe(false);
      }
      expect(inLot(l, k.x, k.z), `a lot at ${l.x.toFixed(0)}, ${l.z.toFixed(0)}`).toBe(false);
    }
    let props = 0;
    for (let k = 0; k < CHUNKS_X * CHUNKS_Z; k++) for (const p of island.props(k)) {
      props++;
      expect(sites.props.some((q) => inKeep(q, p.x, p.z)), `a ${p.kind} at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).toBe(false);
      if (PROP_TYPES[p.kind].breakImpulse > 0) expect(sites.solid.some((q) => inKeep(q, p.x, p.z)), `a ${p.kind} at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).toBe(false);
    }
    expect(props).toBeGreaterThan(2000);
    // nothing solid of the places' within a car's height in a kicker's run-up or a billboard's run-out (the landings: 15.3)
    const solids = [...island.fill.chunks.values()].flat().filter((st) => st.tag === 'building' && st.shape.kind === 'box');
    // (a run-up from its start to the kicker's foot: the kicker's own sides are its dress, the container yard's stack)
    const runUps = sites.kickers.map((j) => { const fx = Math.sin(j.yaw), fz = Math.cos(j.yaw), half = runUp(j.jump) / 2, mid = j.length + half; return { x: j.x - fx * mid, z: j.z - fz * mid, yaw: j.yaw, hx: j.half + 1, hz: half }; });
    // (a run-up on the ground under it, a billboard's run-out on what its posts stand on: a roof, a boardwalk)
    const floors = [...runUps.map((k) => island.ground.surfaceHeight(k.x, k.z)), ...island.billboards.map((b) => b.y ?? 0)];
    for (const [i, k] of [...runUps, ...sites.solid].entries()) {
      const ground = floors[i] as number;
      for (const st of solids) {
        if (st.shape.kind !== 'box' || Math.hypot(st.position.x - k.x, st.position.z - k.z) > k.hz + 30) continue;
        if (st.position.y - st.shape.hy > ground + 2.2 || st.position.y + st.shape.hy < ground - 1) continue;
        const r = Math.min(st.shape.hx, st.shape.hz);
        expect(inKeep(k, st.position.x, st.position.z, r), `a wall at ${st.position.x.toFixed(0)}, ${st.position.z.toFixed(0)}`).toBe(false);
      }
    }
  }, 60_000);

  it('15.5 a car smashes a street billboard at its height and a breaker falls across its road at its height', () => {
    // the first minute's, on Crown Avenue's way down: driven through at 60 km/h along its face
    const step = FIRST_MINUTE_STEPS.find((s) => s.step === 'billboard');
    const b = island.billboards.find((q) => step && Math.hypot(q.x - step.at[0], q.z - step.at[1]) < 20);
    expect(b).toBeDefined();
    if (!b) return;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), x0 = b.x - fx * 30, z0 = b.z - fz * 30;
    island.sync(x0, z0, true);
    sim.vehicle.teleport({ x: x0, y: island.ground.surfaceHeight(x0, z0) + 0.7, z: z0 }, b.yaw);
    sim.vehicle.setVelocity(fx * 16.7, 0, fz * 16.7);
    let seq = sim.events.sequence, y = NaN;
    for (let i = 0; i < 120 && Number.isNaN(y); i++) {
      clearControls(sim.controls);
      sim.controls.throttle = 0.5;
      sim.step();
      seq = sim.events.readFrom(seq, (e) => { if (e.kind === 'billboard' && e.target === b.id) y = e.y; });
    }
    expect(sim.collectibles?.smashed[b.id]).toBe(1);
    expect(Math.abs(y - ((b.y ?? 0) + b.bottom + b.height / 2))).toBeLessThan(0.01);
    // a scaffold on Crown's hill: driven into along its street at 50 km/h, it comes down across the lane behind
    const k = island.breakers.findIndex((q) => q.kind === 'scaffold'), d = island.breakers[k];
    const breakers = sim.breakers;
    expect(d).toBeDefined();
    if (!d || !breakers) return;
    // along the street (the fall's normal turned a quarter), on the pavement's line through the tower
    const sx = -d.nz, sz = d.nx, x1 = d.x - sx * 25, z1 = d.z - sz * 25;
    island.sync(x1, z1, true);
    sim.vehicle.teleport({ x: x1, y: island.standAt(x1, z1) + 0.8, z: z1 }, Math.atan2(sx, sz));
    sim.vehicle.setVelocity(sx * 14, 0, sz * 14);
    for (let i = 0; i < 60 * 6 && breakers.state[k] !== BreakerState.Down; i++) {
      clearControls(sim.controls);
      sim.controls.throttle = 0.6;
      sim.step();
    }
    expect(breakers.state[k]).toBe(BreakerState.Down);
    // the barrier lies across the lane at the tower's foot's height: a car's height over the road there
    const from = BREAKER.halfDepth + BREAKER.height / 2, mx = d.x + d.nx * from, mz = d.z + d.nz * from;
    sim.world.step();
    const top = surfaceUnder(mx, mz, (d.y ?? 0) + 5), road = island.ground.surfaceHeight(mx, mz);
    expect((top ?? 0) - road).toBeGreaterThan(1);
    expect((top ?? 0) - road).toBeLessThan(2);
  }, 60_000);
});
