/**
 * Everyone else (M8 slice 7, docs/M8_PLAN.md D6): a lent body knocks by the same rule with its own mass and pays the
 * speed, nothing else; the cars on their lanes plough lying props aside and never stop for them; walkers dodge a
 * flying prop and the guarantee keeps it off them; props never damage a car.
 */
import { describe, expect, it } from 'vitest';
import { PROP_TYPES, type PropDesc, type PropKind } from '../../src/sim/city/props';
import { PropState, carSpeedLoss } from '../../src/sim/props/Props';
import { AgentState } from '../../src/sim/traffic/Traffic';
import { PedPose } from '../../src/sim/traffic/Pedestrians';
import type { LanePose, LaneProjection } from '../../src/sim/traffic/lanes';
import type { SimWorld } from '../../src/sim';
import { createWorld, run } from './helpers';

const KMH = 1 / 3.6;

function all(sim: SimWorld): PropDesc[] {
  const out: PropDesc[] = [];
  for (const entry of sim.city!.active.values()) out.push(...sim.city!.props(entry.chunk.x, entry.chunk.z));
  return out;
}

function lonely(sim: SimWorld, kind: PropKind, clear = 6): PropDesc {
  const props = all(sim);
  const p = props.find((q) => q.kind === kind && !props.some((o) => o !== q && Math.hypot(o.x - q.x, o.z - q.z) < clear));
  if (!p) throw new Error(`no lonely ${kind}`);
  return p;
}

describe('everyone else (M8 slice 7)', () => {
  it('M8 7.1 a cruiser\'s body through a terrace pays the rule\'s speed with its own mass, and nothing else', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic!, props = sim.props!;
      // the first café terrace on the map: its six pieces stand in a row along the footway, 4.6 m from the road
      let table: PropDesc | undefined;
      for (let cz = -3; cz <= 3 && !table; cz++) for (let cx = -3; cx <= 3 && !table; cx++) table = sim.city!.props(cx, cz).find((p) => p.kind === 'table');
      expect(table).toBeDefined();
      const t = table!, fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
      // along the row: the footway's way (the table faces the road)
      const ax = fz, az = -fx;
      sim.vehicle.teleport({ x: t.x + fx * 14, y: 1, z: t.z + fz * 14 }, t.yaw);
      run(sim, 0.5);
      const row = all(sim).filter((p) => (p.kind === 'table' || p.kind === 'chair') && Math.abs((p.x - t.x) * fx + (p.z - t.z) * fz) < 0.5 && Math.abs((p.x - t.x) * ax + (p.z - t.z) * az) < 12);
      expect(row.length).toBe(6);
      // a cruiser's body on the footway before the row, driven along it at 40 km/h (its speed set every step, as a chase's)
      const along = (p: PropDesc): number => (p.x - t.x) * ax + (p.z - t.z) * az;
      const first = Math.min(...row.map(along));
      const yaw = Math.atan2(ax, az), start = first - 5;
      const a = traffic.spawnAtPoint(t.x + ax * start, t.z + az * start, yaw, 'police', AgentState.Abandoned);
      expect(a).toBeGreaterThanOrEqual(0);
      run(sim, 0.3);
      const body = traffic.rigidBodyOf(a);
      expect(body).not.toBeNull();
      const mass = traffic.massOf(a), v = 40 * KMH, lv = { x: 0, y: 0, z: 0 };
      const heat = sim.heat.points, bill = props.bill;
      const standing = (): number => row.filter((p) => props.state[p.id] === PropState.Standing).length;
      // each step starts at 40 km/h: a step with no knock loses only the ground's friction, one with a knock the rule's speed on top
      const losses: Array<{ lost: number; went: PropDesc[] }> = [];
      // the plain loss is the median of the steps with no knock (M8.6: the first such step can still be the body settling
      // onto the kerb, 0.03 m/s off the steady friction)
      const plains: number[] = [];
      for (let i = 0; i < 150 && standing() > 0; i++) {
        body!.linvel(lv);
        body!.setLinvel({ x: ax * v, y: lv.y, z: az * v }, true);
        // held straight, as a chase's body is (its turn is its own): every knock head on
        body!.setAngvel({ x: 0, y: 0, z: 0 }, true);
        const up = row.filter((p) => props.state[p.id] === PropState.Standing);
        sim.step();
        body!.linvel(lv);
        const lost = v - Math.hypot(lv.x, lv.z);
        const went = up.filter((p) => props.state[p.id] !== PropState.Standing);
        if (went.length === 0 && i > 3) plains.push(lost);
        if (went.length > 0) losses.push({ lost, went });
      }
      expect(standing()).toBe(0);
      expect(plains.length).toBeGreaterThan(10);
      const plain = plains.sort((x, y) => x - y)[plains.length >> 1] as number;
      // the steps where one piece went: the rule's loss with the cruiser's mass, head on
      const single = losses.filter((l) => l.went.length === 1);
      expect(single.length).toBeGreaterThanOrEqual(3);
      for (const l of single) {
        const kind = l.went[0]!.kind;
        expect(Math.abs(l.lost - plain - carSpeedLoss(mass, PROP_TYPES[kind], v)!), kind).toBeLessThan(0.03);
      }
      // a unit's knocks pay nothing: no bill, no heat, no chain
      expect(props.bill).toBe(bill);
      expect(sim.heat.points).toBeLessThanOrEqual(heat);
      expect(sim.skill.points).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8 7.2 a lying prop in a lane is ploughed aside by the next car on it; the car never stops for it', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      run(sim, 0.3);
      const traffic = sim.traffic!, lanes = traffic.lanes, props = sim.props!, p = sim.probe;
      const pose: LanePose = { x: 0, z: 0, yaw: 0 };
      const at = (lane: number, s: number): LanePose => { lanes.positionAt(lane, s, 0, pose); return pose; };
      // a lane that keeps well away from the player (its car stays a record on its lane, no body) for 90 m
      let lane = -1;
      for (let l = 0; l < lanes.laneCount && lane < 0; l++) {
        if ((lanes.length[l] as number) < 110) continue;
        let ok = true;
        for (let s = 0; s <= 100 && ok; s += 10) { const q = at(l, s); const d = Math.hypot(q.x - p.x, q.z - p.z); ok = d > 70 && d < 180; }
        if (ok) lane = l;
      }
      expect(lane).toBeGreaterThanOrEqual(0);
      const bin = lonely(sim, 'bin');
      const q = at(lane, 60);
      props.drop(bin.id, q.x, q.z, q.yaw);
      expect(props.state[bin.id]).toBe(PropState.Lying);
      const a = traffic.spawnAt(lane, 10, 'sedan');
      expect(a).toBeGreaterThanOrEqual(0);
      const cruise = traffic.speed[a] as number;
      expect(cruise).toBeGreaterThan(5);
      let slowest = Infinity, knocked = false;
      for (let i = 0; i < 12 * 60 && traffic.lane[a] === lane && (traffic.s[a] as number) < 80; i++) {
        sim.step();
        expect(traffic.hasBody(a)).toBe(false);
        if (Math.abs((traffic.s[a] as number) - 60) < 15) slowest = Math.min(slowest, traffic.speed[a] as number);
        if (props.state[bin.id] !== PropState.Lying) knocked = true;
      }
      expect(knocked).toBe(true);
      // never stopped: its speed through the prop is its cruise
      expect(slowest).toBeGreaterThan(0.9 * cruise);
      // and the bin lies off the car's path now
      for (let i = 0; i < 9 * 60 && props.state[bin.id] !== PropState.Lying; i++) sim.step();
      expect(props.state[bin.id]).toBe(PropState.Lying);
      const o = bin.id * 7, proj: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
      lanes.project(lane, props.pose[o] as number, props.pose[o + 2] as number, proj);
      expect(Math.abs(proj.lateral)).toBeGreaterThan(traffic.halfWidthOf(a) + 0.3);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8 7.3 a bench knocked through a crowd touches no walker', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, record: false });
    try {
      run(sim, 2.5);
      const peds = sim.peds!, props = sim.props!;
      const bench = lonely(sim, 'bench', 4);
      // a few walkers (up to six) on the walkers' line in front of the bench (it faces the road; the line is 1.45 m toward it)
      const fx = Math.sin(bench.yaw), fz = Math.cos(bench.yaw), ax = fz, az = -fx;
      const crowd: number[] = [];
      for (let i = 0; i < peds.capacity && crowd.length < 6; i++) if (peds.active[i] && peds.pose[i] === PedPose.Walk) crowd.push(i);
      expect(crowd.length).toBeGreaterThanOrEqual(4);
      crowd.forEach((i, k) => {
        const u = k - 2.5;
        peds.x[i] = bench.x + fx * 1.45 + ax * u;
        peds.z[i] = bench.z + fz * 1.45 + az * u;
        peds.lane[i] = -1;
      });
      // thrown at them, toward the road, by a 60 km/h knock
      const r = props.boundOf(bench.id), hops = peds.propHops;
      props.knock(bench.id, 1400, 60 * KMH, fx, fz, 0, 0);
      expect(props.state[bench.id]).not.toBe(PropState.Standing);
      let dove = 0, nearest = Infinity;
      for (let n = 0; n < 90; n++) {
        sim.step();
        const o = bench.id * 7, bx = props.pose[o] as number, bz = props.pose[o + 2] as number;
        for (let i = 0; i < peds.capacity; i++) {
          if (!peds.active[i]) continue;
          nearest = Math.min(nearest, Math.hypot((peds.x[i] as number) - bx, (peds.z[i] as number) - bz));
          if (crowd.includes(i) && peds.pose[i] === PedPose.Dive) dove++;
        }
      }
      // it went through where they stood, and they got out of its way
      expect(Math.hypot((props.pose[bench.id * 7] as number) - bench.x, (props.pose[bench.id * 7 + 2] as number) - bench.z)).toBeGreaterThan(3);
      expect(nearest).toBeGreaterThan(r);
      expect(dove + peds.propHops - hops).toBeGreaterThan(0);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8 7.4 no damage from props at any speed: the player through the kerb\'s things, a car hit by a flying one', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const props = sim.props!, life = sim.life;
      const lv = { x: 0, y: 0, z: 0 };
      const cases: Array<[PropKind, number]> = [['bin', 30], ['lamp', 30], ['hydrant', 60], ['shelter', 60], ['lamp', 100], ['bin', 150], ['sapling', 150]];
      const used = new Set<number>();
      for (const [kind, kmh] of cases) {
        const target = all(sim).find((q) => q.kind === kind && !used.has(q.id) && props.state[q.id] === PropState.Standing);
        expect(target, kind).toBeDefined();
        const t = target!;
        used.add(t.id);
        const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), yaw = Math.atan2(-fx, -fz), v = kmh * KMH;
        sim.vehicle.teleport({ x: t.x + fx * 9, y: 1, z: t.z + fz * 9 }, yaw);
        run(sim, 0.4);
        for (let i = 0; i < 120 && props.state[t.id] === PropState.Standing; i++) {
          sim.vehicle.setVelocity(Math.sin(yaw) * v, sim.vehicle.body.linvel(lv).y, Math.cos(yaw) * v);
          sim.step();
        }
        expect(props.state[t.id], `${kind} at ${kmh}`).not.toBe(PropState.Standing);
        // the knock's own step and a moment after it, the car stopped short of the shop fronts behind the footway
        sim.vehicle.setVelocity(0, sim.vehicle.body.linvel(lv).y, 0);
        run(sim, 0.3);
        expect(life.state.damage, `${kind} at ${kmh}`).toBe(0);
        expect(life.state.stage).toBe(0);
      }
      // a parked car's body in a bin's way: the bin hits it at 60 km/h's launch, the car takes no dent
      const traffic = sim.traffic!, bin = all(sim).find((q) => q.kind === 'bin' && !used.has(q.id) && props.state[q.id] === PropState.Standing)!;
      const fx = Math.sin(bin.yaw), fz = Math.cos(bin.yaw);
      sim.vehicle.teleport({ x: bin.x - fz * 12 + fx * 8, y: 1, z: bin.z + fx * 12 + fz * 8 }, bin.yaw);
      const car = traffic.spawnAtPoint(bin.x + fx * 5, bin.z + fz * 5, bin.yaw + Math.PI / 2, 'sedan', AgentState.Abandoned);
      run(sim, 0.5);
      const body = traffic.rigidBodyOf(car);
      expect(body).not.toBeNull();
      const before = body!.translation();
      props.knock(bin.id, 1400, 60 * KMH, fx, fz, 0, 0);
      let closest = Infinity;
      for (let i = 0; i < 90; i++) {
        sim.step();
        const o = bin.id * 7;
        closest = Math.min(closest, Math.hypot((props.pose[o] as number) - (traffic.x[car] as number), (props.pose[o + 2] as number) - (traffic.z[car] as number)));
      }
      const after = body!.translation();
      // it met the car (the bin within the car's half width and its own radius, the car shoved) ...
      expect(closest).toBeLessThan(traffic.halfWidthOf(car) + 0.6);
      expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.001);
      // ... and dented nothing
      expect(traffic.damage[car]).toBe(0);
      expect(traffic.state[car]).toBe(AgentState.Abandoned);
    } finally { sim.dispose(); }
  }, 60_000);
});
