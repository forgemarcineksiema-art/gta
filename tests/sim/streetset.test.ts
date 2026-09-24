/**
 * The street set (M8 slice 3, docs/M8_PLAN.md §4): the café terraces stand only in front of the avenues' corner
 * shops; a broken hydrant's water pushes a car with its real thrust, never flings it; a bus shelter and a newsstand
 * hold at 20 km/h and go at 40 with the rule's loss.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cloneTuning, CAR_PRESETS, type SimWorld } from '../../src/sim';
import { PROPS } from '../../src/sim/balance';
import { PROP_TYPES, type PropDesc, type PropKind } from '../../src/sim/city/props';
import { PropState, carSpeedLoss, knockImpulse } from '../../src/sim/props/Props';
import { createWorld, run } from './helpers';

const KMH = 1 / 3.6;

function all(sim: SimWorld): PropDesc[] {
  const out: PropDesc[] = [];
  for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) out.push(...sim.city!.props(cx, cz));
  return out;
}

describe('the street set (M8 slice 3)', () => {
  let sim: SimWorld;
  beforeAll(async () => {
    const tuning = cloneTuning(CAR_PRESETS.muscle);
    tuning.mass = 1400;
    sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, tuning });
  });
  afterAll(() => sim.dispose());

  it('M8 3.1 café terraces only in front of the avenues\' corner shops, every such shop with one', () => {
    const city = sim.city!, props = all(sim);
    const shops = city.graph.special.filter((r) => r.kind === 'avenue').flatMap((r) => city.frontage(r).filter((l) => l.turn !== 0));
    expect(shops.length).toBeGreaterThanOrEqual(8);
    const terrace = props.filter((p) => p.kind === 'table' || p.kind === 'chair');
    expect(terrace.length).toBeGreaterThan(0);
    // each table and chair in front of a corner shop: within its width of the shop's entrance
    for (const p of terrace) {
      const near = shops.some((l) => Math.hypot(p.x - l.pathX, p.z - l.pathZ) < l.width + 3);
      expect(near, `${p.kind} ${p.id} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBe(true);
    }
    for (const l of shops) expect(props.some((p) => p.kind === 'table' && Math.hypot(p.x - l.pathX, p.z - l.pathZ) < l.width + 3), `shop at ${l.px.toFixed(0)},${l.pz.toFixed(0)}`).toBe(true);
  });

  it('M8 3.2 a car parked over a broken hydrant rises no faster than 1 m/s; a car through it rocks and nothing flies', () => {
    const props = sim.props!, city = sim.city!;
    sim.spawnAt('crown');
    let hydrant: PropDesc | null = null;
    for (const e of city.active.values()) for (const p of city.props(e.chunk.x, e.chunk.z)) if (!hydrant && p.kind === 'hydrant') hydrant = p;
    expect(hydrant).not.toBeNull();
    const h = hydrant!;
    props.knock(h.id, 1400, 20, Math.sin(h.yaw + Math.PI), Math.cos(h.yaw + Math.PI), 0, 0);
    let jet = -1;
    for (let j = 0; j < PROPS.jet.max; j++) if ((props.jets[j * 3 + 2] as number) > 0) jet = j;
    expect(jet).toBeGreaterThanOrEqual(0);
    expect(props.jets[jet * 3 + 2]).toBeCloseTo(PROPS.jet.seconds, 1);
    // parked over it, the car's middle on the jet
    sim.vehicle.teleport({ x: h.x, y: 1, z: h.z }, h.yaw);
    run(sim, 1.5, (_t, c) => { c.brake = 1; });
    const lv = { x: 0, y: 0, z: 0 }, av = { x: 0, y: 0, z: 0 };
    const y0 = sim.vehicle.body.translation().y;
    let up = 0, high = 0;
    run(sim, 4, (_t, c, s) => { c.brake = 1; up = Math.max(up, s.vehicle.body.linvel(lv).y); high = Math.max(high, s.vehicle.body.translation().y - y0); });
    expect(up).toBeLessThan(1);
    expect(high).toBeLessThan(0.3);
    // driven through at 30 km/h along the kerb: it rocks, it is not flung
    const yaw = h.yaw + Math.PI / 2;
    sim.vehicle.teleport({ x: h.x - Math.sin(yaw) * 12, y: 1, z: h.z - Math.cos(yaw) * 12 }, yaw);
    run(sim, 0.3);
    let rock = 0, lift = 0;
    const y1 = sim.vehicle.body.translation().y;
    run(sim, 1.5, (_t, _c, s) => {
      s.vehicle.setVelocity(Math.sin(yaw) * 30 * KMH, s.vehicle.body.linvel(lv).y, Math.cos(yaw) * 30 * KMH);
      const w = s.vehicle.body.angvel(av);
      rock = Math.max(rock, Math.hypot(w.x, w.z));
      lift = Math.max(lift, s.vehicle.body.translation().y - y1);
    });
    expect(rock).toBeGreaterThan(0.02);
    expect(lift).toBeLessThan(0.3);
  });

  it('M8 3.3 a bus shelter and a newsstand hold at 20 km/h and go at 40, with the rule\'s loss', () => {
    const props = sim.props!, city = sim.city!;
    const everything = all(sim);
    for (const kind of ['shelter', 'kiosk'] as PropKind[]) {
      const t = PROP_TYPES[kind];
      expect(knockImpulse(1400, t, 20 * KMH)).toBeLessThan(t.breakImpulse);
      expect(knockImpulse(1400, t, 40 * KMH)).toBeGreaterThan(t.breakImpulse);
      // one with a clear run in from the road, head on
      let target: PropDesc | null = null;
      for (let cz = -3; cz <= -1 && !target; cz++) for (let cx = -3; cx <= -1 && !target; cx++) {
        for (const p of city.props(cx, cz)) {
          if (p.kind !== kind || target) continue;
          const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
          const clear = everything.every((o) => {
            if (o === p || Math.hypot(o.x - p.x, o.z - p.z) > 14) return true;
            const along = (o.x - p.x) * fx + (o.z - p.z) * fz, across = Math.abs(-(o.x - p.x) * fz + (o.z - p.z) * fx);
            return along < 0.5 || across > 2.6;
          });
          if (clear) target = p;
        }
      }
      expect(target, kind).not.toBeNull();
      const p = target!;
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), yaw = Math.atan2(-fx, -fz);
      const drive = (kmh: number): { before: number; after: number; knocked: boolean } => {
        sim.life.heal();
        sim.vehicle.teleport({ x: p.x + fx * 11, y: 1, z: p.z + fz * 11 }, yaw);
        sim.city!.sync(p.x, p.z, true);
        run(sim, 0.4);
        const lv = { x: 0, y: 0, z: 0 };
        let before = 0, after = 0;
        for (let i = 0; i < 150; i++) {
          sim.vehicle.setVelocity(Math.sin(yaw) * kmh * KMH, sim.vehicle.body.linvel(lv).y, Math.cos(yaw) * kmh * KMH);
          before = Math.hypot(lv.x, lv.z);
          sim.step();
          after = Math.hypot(sim.vehicle.body.linvel(lv).x, lv.z);
          if (props.state[p.id] !== PropState.Standing) return { before, after, knocked: true };
        }
        return { before, after, knocked: false };
      };
      expect(drive(20).knocked, `${kind} at 20`).toBe(false);
      expect(props.state[p.id]).toBe(PropState.Standing);
      const r = drive(40);
      expect(r.knocked, `${kind} at 40`).toBe(true);
      const want = carSpeedLoss(1400, t, r.before)! / r.before;
      expect(Math.abs((r.before - r.after) / r.before - want), kind).toBeLessThan(0.012);
    }
  });
});
