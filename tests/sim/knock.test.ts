/**
 * The knock (M8 slice 1, docs/M8_PLAN.md D1–D4): the contact decided before the physics step by the two-body rule,
 * anchored props that hold as walls below their base's strength, the pool of sixteen bodies and the arcs past it,
 * lying props, the heal, no allocation, the same poses twice.
 */
import { getHeapSpaceStatistics, setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { TrackBot } from '../../src/app/trackBot';
import { FIXED_DT, cloneTuning, CAR_PRESETS, type SimWorld } from '../../src/sim';
import { PROP_TYPES, type PropDesc, type PropKind } from '../../src/sim/city/props';
import { BLOCK, type Lane } from '../../src/sim/city/roads';
import { junctionCurve, laneLength, laneSpan, resample, type Pt } from '../../src/sim/city/route';
import { PropState, carSpeedLoss, knockImpulse } from '../../src/sim/props/Props';
import { createWorld, run } from './helpers';

const KMH = 1 / 3.6;

/** A 1,400 kg car (the plan's reference), the muscle car's handling otherwise. */
async function world(): Promise<SimWorld> {
  const tuning = cloneTuning(CAR_PRESETS.muscle);
  tuning.mass = 1400;
  return createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, tuning });
}

/** A standing prop of a kind in the loaded chunks with nothing else within `clear` m of it. */
function lonely(sim: SimWorld, kind: PropKind, clear = 6): PropDesc {
  const city = sim.city!;
  for (const entry of city.active.values()) {
    const list = city.props(entry.chunk.x, entry.chunk.z);
    for (const p of list) {
      if (p.kind !== kind) continue;
      if (list.some((o) => o !== p && Math.hypot(o.x - p.x, o.z - p.z) < clear)) continue;
      return p;
    }
  }
  throw new Error(`no lonely ${kind}`);
}

/** Put the car `back` m out on the road side of a prop, heading straight at it. */
function approach(sim: SimWorld, p: PropDesc, back = 9): { yaw: number } {
  // the prop faces the road: its local +Z is (sin yaw, cos yaw)
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const yaw = Math.atan2(-fx, -fz);
  sim.vehicle.teleport({ x: p.x + fx * back, y: 1, z: p.z + fz * back }, yaw);
  run(sim, 0.4);
  return { yaw };
}

/** Drive at a held speed until the prop's state changes or the car stops at it; the speeds either side of the step. */
function drive(sim: SimWorld, p: PropDesc, kmh: number, yaw: number, seconds = 2): { before: number; after: number; knocked: boolean; stopped: boolean } {
  const v = kmh * KMH;
  let before = 0, after = 0, knocked = false, stopped = false;
  const lv = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < seconds * 60 && !knocked; i++) {
    sim.vehicle.setVelocity(Math.sin(yaw) * v, sim.vehicle.body.linvel(lv).y, Math.cos(yaw) * v);
    before = Math.hypot(lv.x, lv.z);
    sim.controls.throttle = 0;
    sim.step();
    sim.vehicle.body.linvel(lv);
    after = Math.hypot(lv.x, lv.z);
    knocked = sim.props!.state[p.id] !== PropState.Standing;
  }
  if (!knocked) {
    // coast into it: does it stop the car?
    for (let i = 0; i < 90; i++) { sim.controls.throttle = 0; sim.step(); }
    stopped = Math.hypot(sim.vehicle.body.linvel(lv).x, lv.z) < 1.5;
  }
  return { before, after, knocked, stopped };
}

describe('the knock (M8 slice 1)', () => {
  it('M8 1.1 the rule\'s numbers at 60 km/h for 1,400 kg: a bin −2.3 %, a lamp post −13 %; the post holds at 15 km/h and goes at 25', async () => {
    const lamp = PROP_TYPES.lamp, bin = PROP_TYPES.bin;
    const v60 = 60 * KMH;
    expect(carSpeedLoss(1400, bin, v60)! / v60).toBeCloseTo(0.023, 2);
    expect(carSpeedLoss(1400, lamp, v60)! / v60).toBeCloseTo(0.13, 2);
    expect(carSpeedLoss(1400, lamp, 15 * KMH)).toBeNull();
    expect(carSpeedLoss(1400, lamp, 25 * KMH)).not.toBeNull();
    // the plan's table: a lamp post holds below 18 km/h, a newsstand below 32
    expect(knockImpulse(1400, lamp, 17.9 * KMH)).toBeLessThan(lamp.breakImpulse);
    expect(knockImpulse(1400, lamp, 18.1 * KMH)).toBeGreaterThan(lamp.breakImpulse);
    expect(knockImpulse(1400, PROP_TYPES.kiosk, 31.5 * KMH)).toBeLessThan(PROP_TYPES.kiosk.breakImpulse);

    // in the city: a bin and a lamp post at 60 km/h, head on
    for (const [kind, loss] of [['bin', 0.023], ['lamp', 0.13]] as const) {
      const sim = await world();
      try {
        const p = lonely(sim, kind);
        const { yaw } = approach(sim, p);
        const r = drive(sim, p, 60, yaw);
        expect(r.knocked, kind).toBe(true);
        expect((r.before - r.after) / r.before, kind).toBeGreaterThan(loss - (kind === 'bin' ? 0.003 : 0.01));
        expect((r.before - r.after) / r.before, kind).toBeLessThan(loss + (kind === 'bin' ? 0.003 : 0.01));
        expect(sim.props!.smashed).toBe(1);
      } finally { sim.dispose(); }
    }

    // a lamp post at 15 km/h holds: the car stops at it, a wall's hit, the chain lost
    {
      const sim = await world();
      try {
        const p = lonely(sim, 'lamp');
        const { yaw } = approach(sim, p);
        sim.skill.points = 400;
        sim.skill.tricks = 2;
        sim.skill.left = 4;
        const seq = sim.events.sequence;
        const r = drive(sim, p, 15, yaw);
        expect(r.knocked).toBe(false);
        expect(r.stopped).toBe(true);
        const kinds: string[] = [];
        sim.events.readFrom(seq, (e) => { kinds.push(e.kind); });
        expect(kinds).toContain('hit');
        expect(kinds).toContain('skillLost');
        expect(sim.props!.state[p.id]).toBe(PropState.Standing);
      } finally { sim.dispose(); }
    }
    // and goes at 25, with the rule's loss
    {
      const sim = await world();
      try {
        const p = lonely(sim, 'lamp');
        const { yaw } = approach(sim, p);
        const r = drive(sim, p, 25, yaw);
        expect(r.knocked).toBe(true);
        const want = carSpeedLoss(1400, lamp, 25 * KMH)! / (25 * KMH);
        expect(Math.abs((r.before - r.after) / r.before - want)).toBeLessThan(0.01);
      } finally { sim.dispose(); }
    }
  }, 60_000);

  it('M8 1.2 a knocked prop leaves at J / m ± 2 % along the normal tilted up the bonnet', async () => {
    const sim = await world();
    try {
      const p = lonely(sim, 'bin');
      const { yaw } = approach(sim, p);
      const r = drive(sim, p, 60, yaw);
      expect(r.knocked).toBe(true);
      const body = sim.props!.bodyOf(p.id);
      expect(body).not.toBeNull();
      const v = body!.linvel();
      const t = PROP_TYPES.bin, want = knockImpulse(1400, t, r.before) / t.mass;
      // gravity has had one step at it: judge the launch against the step's start
      const vy = v.y + 9.81 * FIXED_DT;
      const speed = Math.hypot(v.x, vy, v.z);
      expect(Math.abs(speed - want) / want).toBeLessThan(0.02);
      // along the car's heading, 12° up
      const along = (v.x * Math.sin(yaw) + v.z * Math.cos(yaw)) / speed;
      expect(Math.abs(Math.acos(Math.min(1, along)) - 12 * Math.PI / 180)).toBeLessThan(0.035);
      expect(Math.abs(Math.atan2(vy, Math.hypot(v.x, v.z)) - 12 * Math.PI / 180)).toBeLessThan(0.035);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8 1.4 thirty knocks in two seconds: at most sixteen bodies, the rest on arcs, all lying within 10 s', async () => {
    const sim = await world();
    try {
      const props = sim.props!, city = sim.city!;
      const ids: number[] = [];
      for (const entry of city.active.values()) for (const p of city.props(entry.chunk.x, entry.chunk.z)) if (ids.length < 30) ids.push(p.id);
      expect(ids).toHaveLength(30);
      let most = 0, arcs = 0;
      for (let i = 0; i < 120; i++) {
        if (i % 4 === 0) {
          const id = ids[i / 4]!;
          props.knock(id, 1400, 25, Math.sin(i), Math.cos(i), 0, 0);
        }
        sim.step();
        most = Math.max(most, props.bodiesInUse);
        arcs = Math.max(arcs, props.arcsInUse);
      }
      expect(most).toBeLessThanOrEqual(16);
      expect(arcs).toBeGreaterThan(0);
      for (const id of ids) expect(props.state[id]).not.toBe(PropState.Standing);
      run(sim, 10);
      for (const id of ids) expect(props.state[id], `prop ${id}`).toBe(PropState.Lying);
      expect(props.bodiesInUse).toBe(0);
      expect(props.arcsInUse).toBe(0);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8 1.5 a lying prop a minute out of reach stands again, its post in the solver', async () => {
    const sim = await world();
    try {
      const props = sim.props!;
      const p = lonely(sim, 'lamp');
      props.knock(p.id, 1400, 20, Math.sin(p.yaw + Math.PI), Math.cos(p.yaw + Math.PI), 0, 0);
      expect(props.postOf(p.id)?.isEnabled()).toBe(false);
      run(sim, 10);
      expect(props.state[p.id]).toBe(PropState.Lying);
      // off to the far side of the island for a minute
      const far = { x: -p.x * 0.1 + Math.sign(-p.x || 1) * 600, y: 1, z: -p.z * 0.1 + Math.sign(-p.z || 1) * 600 };
      sim.vehicle.teleport(far, 0);
      sim.city!.sync(far.x, far.z, true);
      run(sim, 30, (_t, c) => { c.brake = 1; });
      expect(props.state[p.id]).toBe(PropState.Lying);
      run(sim, 32, (_t, c) => { c.brake = 1; });
      expect(props.state[p.id]).toBe(PropState.Standing);
      // back: its chunk loads with its post standing in the solver
      sim.vehicle.teleport({ x: p.x + 20, y: 1, z: p.z }, 0);
      sim.city!.sync(p.x + 20, p.z, true);
      expect(props.postOf(p.id)?.isEnabled()).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8 1.3 the compact at 60 km/h on a Crown Heights kerb line knocks every bin and lamp post on it and never stops', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, car: 'compact' });
    try {
      const graph = sim.city!.graph;
      // the street x = -225 from the junction at z = -450 through the one at z = -225 to the avenue at z = 0
      const node = (gx: number, gz: number): number => (gz + 3) * 7 + (gx + 3);
      const lane = (a: number, b: number): Lane => graph.lanes.find((l) => l.from === a && l.to === b && !l.special && !l.highway)!;
      const legs = [lane(node(-1, -2), node(-1, -1)), lane(node(-1, -1), node(-1, 0))];
      const raw: Pt[] = [];
      laneSpan(legs[0]!, 0, laneLength(legs[0]!), raw);
      junctionCurve(legs[0]!, legs[1]!, raw);
      laneSpan(legs[1]!, 0, laneLength(legs[1]!), raw);
      const path = resample(raw);
      const bot = new TrackBot('compact', { vMax: 60 * KMH, pavement: 8.2 });
      bot.setPath(path);
      const start = path[0]!;
      sim.vehicle.teleport({ x: start.x, y: 1, z: start.z }, start.yaw);
      sim.vehicle.setVelocity(Math.sin(start.yaw) * 60 * KMH, 0, Math.cos(start.yaw) * 60 * KMH);
      // the kerb line on the car's right: x = -225 - 12.7 (heading +z, the right is -x)
      const kerbX = -1 * BLOCK - 12.7;
      const onLine: number[] = [];
      let slowest = Infinity, holds = 0, fromZ = Infinity, toZ = -Infinity;
      const lv = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < 60 * 30 && bot.pathLeft > 20; i++) {
        bot.drive(sim, sim.controls, FIXED_DT);
        sim.step();
        const p = sim.vehicle.body.translation();
        const speed = Math.hypot(sim.vehicle.body.linvel(lv).x, lv.z);
        if (sim.props!.held >= 0) holds++;
        // on the kerb line: the stretch it drove there
        if (Math.abs(p.x - kerbX) < 0.4 && p.z < -10) {
          fromZ = Math.min(fromZ, p.z);
          toZ = Math.max(toZ, p.z);
          slowest = Math.min(slowest, speed);
        }
      }
      expect(toZ - fromZ, 'metres of kerb line driven').toBeGreaterThan(250);
      for (let cz = -2; cz <= 0; cz++) for (let cx = -2; cx <= 0; cx++) {
        for (const p of sim.city!.props(cx, cz)) {
          if ((p.kind === 'lamp' || p.kind === 'bin') && Math.abs(p.x - kerbX) < 0.5 && p.z > fromZ + 3 && p.z < toZ - 3) onLine.push(p.id);
        }
      }
      expect(onLine.length).toBeGreaterThan(5);
      for (const id of onLine) expect(sim.props!.state[id], `prop ${id}`).not.toBe(PropState.Standing);
      // never held up: nothing stood against it, and it kept its pace through them
      expect(holds).toBe(0);
      expect(slowest * 3.6).toBeGreaterThan(40);
    } finally { sim.dispose(); }
  }, 60_000);

  /** The compact on the kerb line of the street x = -225, from z = -450 north, the pavement bot at 60 km/h. */
  async function kerbRun(): Promise<{ sim: SimWorld; bot: TrackBot }> {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, car: 'compact' });
    const graph = sim.city!.graph;
    const node = (gx: number, gz: number): number => (gz + 3) * 7 + (gx + 3);
    const lane = (a: number, b: number): Lane => graph.lanes.find((l) => l.from === a && l.to === b && !l.special && !l.highway)!;
    const legs = [lane(node(-1, -2), node(-1, -1)), lane(node(-1, -1), node(-1, 0))];
    const raw: Pt[] = [];
    laneSpan(legs[0]!, 0, laneLength(legs[0]!), raw);
    junctionCurve(legs[0]!, legs[1]!, raw);
    laneSpan(legs[1]!, 0, laneLength(legs[1]!), raw);
    const path = resample(raw);
    const bot = new TrackBot('compact', { vMax: 60 * KMH, pavement: 8.2 });
    bot.setPath(path);
    const start = path[0]!;
    sim.vehicle.teleport({ x: start.x, y: 1, z: start.z }, start.yaw);
    sim.vehicle.setVelocity(Math.sin(start.yaw) * 60 * KMH, 0, Math.cos(start.yaw) * 60 * KMH);
    return { sim, bot };
  }

  it('M8 1.6 no allocation in the props step and read-back, warm: the sweep among props, sixteen bodies flying', async () => {
    const sim = await world();
    try {
      const props = sim.props!, city = sim.city!;
      // an empty young generation before each measurement: what the calls leave there is what they made (the
      // engine's compiled code goes elsewhere; a measurement's own read is taken off)
      setFlagsFromString('--expose_gc');
      const gc = runInNewContext('gc') as () => void;
      const young = (): number => {
        for (const space of getHeapSpaceStatistics()) if (space.space_name === 'new_space') return space.space_used_size;
        return 0;
      };
      const perCall = (f: () => void, n: number): number => {
        gc(); const e = young(); const own = young() - e;
        gc(); const a = young(); for (let i = 0; i < n; i++) f(); return (young() - a - own) / n;
      };
      // the sweep with the car among standing props (a bench's reach from a lamp post, nothing touched)
      const lamp = lonely(sim, 'lamp');
      sim.vehicle.teleport({ x: lamp.x + Math.sin(lamp.yaw) * 4, y: 1, z: lamp.z + Math.cos(lamp.yaw) * 4 }, lamp.yaw);
      run(sim, 1);
      const around = (): number => { let n = 0; for (const e of city.active.values()) for (const p of city.props(e.chunk.x, e.chunk.z)) if (Math.hypot(p.x - sim.probe.x, p.z - sim.probe.z) < 12) n++; return n; };
      expect(around()).toBeGreaterThan(0);
      const step = (): void => props.step(FIXED_DT);
      for (let i = 0; i < 20_000; i++) step();
      expect(perCall(step, 20_000)).toBeLessThan(1);
      // the read-back with the pool full: each body is read twice (its place, its turn), nothing else is made
      const ids: number[] = [];
      for (const e of city.active.values()) for (const p of city.props(e.chunk.x, e.chunk.z)) if (ids.length < 16 && p.kind !== 'lamp') ids.push(p.id);
      const launch = (): void => { for (const id of ids) props.knock(id, 1400, 25, 1, 0, 0, 0); };
      const after = (): void => props.afterPhysics(FIXED_DT);
      for (let r = 0; r < 400; r++) { launch(); for (let i = 0; i < 20; i++) after(); for (const id of ids) props.stand(id); }
      launch();
      expect(props.bodiesInUse).toBe(16);
      // Rapier's bindings wrap every read of a body: the sixteen bodies' places and turns read as the read-back reads them
      const bodies = ids.map((id) => props.bodyOf(id)!);
      const v = { x: 0, y: 0, z: 0 }, q = { x: 0, y: 0, z: 0, w: 1 };
      const reads = (): void => { for (const b of bodies) { b.translation(v); b.rotation(q); } };
      for (let i = 0; i < 2000; i++) reads();
      const floor = perCall(reads, 20);
      const bytes = perCall(after, 20);
      expect(props.bodiesInUse).toBe(16);
      console.info(`the read-back: ${bytes.toFixed(0)} B a call with 16 bodies, Rapier's reads of them ${floor.toFixed(0)} B`);
      expect(bytes).toBeLessThanOrEqual(floor + 16 * 16);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8 1.7 two runs give the same poses after 10 s', async () => {
    const poses: string[] = [];
    for (let k = 0; k < 2; k++) {
      const { sim, bot } = await kerbRun();
      try {
        for (let i = 0; i < 600; i++) { bot.drive(sim, sim.controls, FIXED_DT); sim.step(); }
        const props = sim.props!;
        expect(props.smashed).toBeGreaterThan(3);
        const rows: string[] = [];
        for (let i = 0; i < props.downCount; i++) {
          const id = props.down[i]!;
          rows.push(`${id}:${props.state[id]}:${Array.from(props.pose.subarray(id * 7, id * 7 + 7)).map((v) => v.toFixed(5)).join(',')}`);
        }
        poses.push(rows.sort().join('|'));
      } finally { sim.dispose(); }
    }
    expect(poses[1]).toBe(poses[0]);
  }, 60_000);
});
