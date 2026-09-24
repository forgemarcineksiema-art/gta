/**
 * Solid cars (docs/M8.6_PLAN.md, DESIGN.md §18): a driving car stays on its four wheels under a push, and a shaken car
 * drives again only once it is back on them, with nothing left to see of the turn.
 */
import { describe, expect, it } from 'vitest';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { PedPose } from '../../src/sim/traffic/Pedestrians';
import type { SimWorld } from '../../src/sim';
import { createWorld, run } from './helpers';

function streetLane(sim: SimWorld, min = 150): number {
  const lanes = (sim.traffic as Traffic).lanes;
  for (let i = 0; i < lanes.laneCount; i++) {
    if ((lanes.limit[i] as number) !== TRAFFIC.speedStreet || (lanes.length[i] as number) < min) continue;
    if (sim.city!.graph.lanes[i]!.points.length !== 2) continue;
    return i;
  }
  throw new Error('no street lane');
}

function pose(sim: SimWorld, lane: number, s: number, offset = 0): { x: number; z: number; yaw: number } {
  const p = { x: 0, z: 0, yaw: 0 };
  (sim.traffic as Traffic).lanes.positionAt(lane, s, offset, p);
  return p;
}

/** The drawn pose of an agent: its transform slot's position and rotation. */
function drawn(sim: SimWorld, agent: number): { y: number; q: [number, number, number, number] } {
  const slot = (sim.traffic as Traffic).slot[agent] as number;
  const p = sim.transforms.currPos, r = sim.transforms.currRot;
  return { y: p[slot * 3 + 1] as number, q: [r[slot * 4] as number, r[slot * 4 + 1] as number, r[slot * 4 + 2] as number, r[slot * 4 + 3] as number] };
}

function upOf(q: [number, number, number, number]): number {
  return 1 - 2 * (q[0] * q[0] + q[2] * q[2]);
}

/** The angle between two rotations, degrees. */
function turn(a: [number, number, number, number], b: [number, number, number, number]): number {
  const dot = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
  return 2 * Math.acos(dot) * 180 / Math.PI;
}

describe('solid cars: on four wheels', () => {
  it('M8.6 0.1 a driving car stays level and on its road, pushed on its flank and carrying the player on its tail', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      const lane = streetLane(sim);
      const at = pose(sim, lane, 60);
      sim.city?.sync(at.x, at.z, true);
      const agent = traffic.spawnAt(lane, 60, 'compact', AgentState.Kinematic);
      traffic.speed[agent] = 0;
      traffic.pace[agent] = 0.01;
      // the player square to the car's left flank, a hand's width off it
      const yaw = at.yaw - Math.PI / 2;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const off = sim.vehicle.tuning.chassisHalfExtents.z + traffic.halfWidthOf(agent) + 0.25;
      sim.vehicle.teleport({ x: at.x - fx * off, y: 0.8, z: at.z - fz * off }, yaw);
      sim.vehicle.setVelocity(0, 0, 0);
      run(sim, 0.4);
      expect(traffic.state[agent]).toBe(AgentState.Physical);
      const y0 = drawn(sim, agent).y;
      let physical = 0, least = 1, drop = 0;
      const watch = (): void => {
        if (traffic.state[agent] !== AgentState.Physical) return;
        physical++;
        const d = drawn(sim, agent);
        least = Math.min(least, upOf(d.q));
        drop = Math.max(drop, Math.abs(d.y - y0));
      };
      // a shove that builds from a walk to a run, as a unit's does
      const x0 = traffic.x[agent] as number, z0 = traffic.z[agent] as number, t0 = sim.tick;
      run(sim, 2, (tick) => {
        const v = Math.min(4, 0.8 + (tick - t0) / 60 * 1.5);
        sim.vehicle.setVelocity(fx * v, sim.vehicle.telemetry.vy, fz * v);
        watch();
      });
      const moved = Math.hypot((traffic.x[agent] as number) - x0, (traffic.z[agent] as number) - z0);
      // then the player's car let down onto its tail, as after a jump or climbing a pile: its weight off the middle
      const cy = traffic.yaw[agent] as number, bx = Math.sin(cy), bz = Math.cos(cy);
      const tail = traffic.halfLengthOf(agent) * 0.7;
      sim.vehicle.teleport({ x: (traffic.x[agent] as number) - bx * tail, y: 2.3, z: (traffic.z[agent] as number) - bz * tail }, cy);
      sim.vehicle.setVelocity(0, 0, 0);
      run(sim, 2, watch);
      console.log(`[solid] pushed ${moved.toFixed(2)} m, then carried the player; ${physical} driving steps: least up ${least.toFixed(5)}, height off ${(drop * 100).toFixed(1)} cm`);
      expect(physical).toBeGreaterThan(150);
      expect(moved).toBeGreaterThan(0.5);
      expect(least).toBeGreaterThan(0.999);
      expect(drop).toBeLessThan(0.02);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.6 0.2 a shaken car dropped onto its wheels at a lean drives again with no visible turn or drop', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      const lane = streetLane(sim);
      const at = pose(sim, lane, 60), back = pose(sim, lane, 45);
      sim.city?.sync(at.x, at.z, true);
      sim.vehicle.teleport({ x: back.x, y: 0.8, z: back.z }, back.yaw);
      sim.vehicle.setVelocity(0, 0, 0);
      const agent = traffic.spawnAt(lane, 60, 'compact', AgentState.Kinematic);
      traffic.speed[agent] = 0;
      traffic.pace[agent] = 0.01;
      run(sim, 0.4);
      expect(traffic.state[agent]).toBe(AgentState.Physical);
      // shaken: half a metre up, leaning 20° on its long axis, let go
      traffic.disturb(agent);
      const body = traffic.rigidBodyOf(agent)!;
      const p = body.translation();
      const half = 10 * Math.PI / 180;
      const qy = { x: 0, y: Math.sin(at.yaw / 2), z: 0, w: Math.cos(at.yaw / 2) };
      // yaw then a roll about the car's own long axis (local z)
      const qr = { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) };
      body.setTranslation({ x: p.x, y: p.y + 0.5, z: p.z }, true);
      body.setRotation({
        x: qy.w * qr.x + qy.x * qr.w + qy.y * qr.z - qy.z * qr.y,
        y: qy.w * qr.y - qy.x * qr.z + qy.y * qr.w + qy.z * qr.x,
        z: qy.w * qr.z + qy.x * qr.y - qy.y * qr.x + qy.z * qr.w,
        w: qy.w * qr.w - qy.x * qr.x - qy.y * qr.y - qy.z * qr.z,
      }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      sim.step();
      let prev = drawn(sim, agent), jump = -1, drop = -1, fell = 0;
      for (let k = 0; k < 6 * 60 && traffic.state[agent] === AgentState.Disturbed; k++) {
        sim.step();
        const now = drawn(sim, agent);
        fell = Math.max(fell, prev.y - now.y);
        if ((traffic.state[agent] as AgentState) === AgentState.Physical) { jump = turn(prev.q, now.q); drop = Math.abs(now.y - prev.y); }
        prev = now;
      }
      console.log(`[solid] back on its wheels after ${sim.time.toFixed(2)} s: the reattach turned it ${jump.toFixed(2)}°, moved it ${(drop * 100).toFixed(1)} cm`);
      expect(fell).toBeGreaterThan(0); // it fell: the shaken body meets the ground
      expect(traffic.state[agent]).toBe(AgentState.Physical);
      expect(jump).toBeGreaterThanOrEqual(0);
      expect(jump).toBeLessThan(2);
      expect(drop).toBeLessThan(0.05);
    } finally { sim.dispose(); }
  }, 60_000);
});

/** q = yaw about Y, then `angle` about the car's own axis (1, 0, 0) or (0, 0, 1). */
function yawThen(yaw: number, axis: 'x' | 'z', angle: number): { x: number; y: number; z: number; w: number } {
  const a = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
  const h = angle / 2;
  const b = axis === 'x' ? { x: Math.sin(h), y: 0, z: 0, w: Math.cos(h) } : { x: 0, y: 0, z: Math.sin(h), w: Math.cos(h) };
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** A compact wreck with a body on the street, the player stopped 15 m back; the world, the wreck, the lane pose. */
async function wreckOnStreet(): Promise<{ sim: SimWorld; agent: number; at: { x: number; z: number; yaw: number } }> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
  const traffic = sim.traffic as Traffic;
  const lane = streetLane(sim);
  const at = pose(sim, lane, 60), back = pose(sim, lane, 45);
  sim.city?.sync(at.x, at.z, true);
  sim.vehicle.teleport({ x: back.x, y: 0.8, z: back.z }, back.yaw);
  sim.vehicle.setVelocity(0, 0, 0);
  const agent = traffic.spawnAtPoint(at.x, at.z, at.yaw, 'compact', AgentState.Wrecked);
  run(sim, 0.3);
  expect(traffic.hasBody(agent)).toBe(true);
  return { sim, agent, at };
}

/** The drawn pose's up and nose heights (world y of the car's up and forward axes). */
function lie(sim: SimWorld, agent: number): { up: number; nose: number } {
  const q = drawn(sim, agent).q;
  return { up: upOf(q), nose: 2 * (q[1] * q[2] - q[3] * q[0]) };
}

describe('solid cars: wrecks', () => {
  for (const [name, axis, angle, lift] of [['on its side', 'z', Math.PI / 2, 'halfWidth'], ['on its nose', 'x', Math.PI / 2, 'halfLength']] as const) {
    it(`M8.6 1.${axis === 'z' ? 1 : 2} a wreck left at rest ${name} lies on its wheels or its roof within 3 s`, async () => {
      const { sim, agent, at } = await wreckOnStreet();
      try {
        const traffic = sim.traffic as Traffic;
        const body = traffic.rigidBodyOf(agent)!;
        const p = body.translation();
        const h = lift === 'halfWidth' ? traffic.halfWidthOf(agent) : traffic.halfLengthOf(agent);
        body.setTranslation({ x: p.x, y: h + 0.02, z: p.z }, true);
        body.setRotation(yawThen(at.yaw, axis, angle), true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        run(sim, 0.3);
        const start = lie(sim, agent);
        expect(Math.abs(start.up) < 0.7 || Math.abs(start.nose) > 0.7).toBe(true);
        run(sim, 3);
        const end = lie(sim, agent);
        console.log(`[solid] a wreck ${name}: up ${start.up.toFixed(2)} nose ${start.nose.toFixed(2)} -> up ${end.up.toFixed(2)} nose ${end.nose.toFixed(2)}`);
        expect(Math.abs(end.up)).toBeGreaterThan(0.7);
        expect(Math.abs(end.nose)).toBeLessThan(0.7);
      } finally { sim.dispose(); }
    }, 60_000);
  }

  it('M8.6 1.3 a wreck on its roof keeps its pose when its body is taken back and lent again', async () => {
    const { sim, agent, at } = await wreckOnStreet();
    try {
      const traffic = sim.traffic as Traffic;
      const body = traffic.rigidBodyOf(agent)!;
      const p = body.translation();
      body.setTranslation({ x: p.x, y: 1.45, z: p.z }, true);
      body.setRotation(yawThen(at.yaw + 0.4, 'z', Math.PI), true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      run(sim, 2);
      const lay = drawn(sim, agent), x0 = traffic.x[agent] as number, z0 = traffic.z[agent] as number;
      expect(upOf(lay.q)).toBeLessThan(-0.9);
      // the player 150 m off: the body goes back to the pool, the wreck stays drawn as it lay
      const far = { x: x0 + 150, z: z0 };
      sim.city?.sync(far.x, far.z, true);
      sim.vehicle.teleport({ x: far.x, y: 0.8, z: far.z }, 0);
      sim.vehicle.setVelocity(0, 0, 0);
      run(sim, 0.5);
      expect(traffic.hasBody(agent)).toBe(false);
      const away = drawn(sim, agent);
      expect(turn(away.q, lay.q)).toBeLessThan(1);
      expect(Math.abs(away.y - lay.y)).toBeLessThan(0.01);
      expect(Math.hypot((traffic.x[agent] as number) - x0, (traffic.z[agent] as number) - z0)).toBeLessThan(0.01);
      // back: lent again in the same pose
      sim.city?.sync(x0, z0, true);
      const back = pose(sim, streetLane(sim), 45);
      sim.vehicle.teleport({ x: back.x, y: 0.8, z: back.z }, back.yaw);
      sim.vehicle.setVelocity(0, 0, 0);
      for (let k = 0; k < 30 && !traffic.hasBody(agent); k++) sim.step();
      expect(traffic.hasBody(agent)).toBe(true);
      const again = drawn(sim, agent);
      console.log(`[solid] a wreck on its roof: away ${turn(away.q, lay.q).toFixed(2)}° ${((away.y - lay.y) * 100).toFixed(1)} cm, lent again ${turn(again.q, lay.q).toFixed(2)}° ${((again.y - lay.y) * 100).toFixed(1)} cm`);
      expect(turn(again.q, lay.q)).toBeLessThan(1);
      expect(Math.abs(again.y - lay.y)).toBeLessThan(0.01);
    } finally { sim.dispose(); }
  }, 60_000);
});

/** The player stopped on a street at s = 100 with three units coming up behind, the chase on; the world, the lane pose. */
async function boxScene(): Promise<{ sim: SimWorld; units: number[]; at: { x: number; z: number; yaw: number }; lane: number }> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 100 });
  sim.police!.dispatching = false;
  const traffic = sim.traffic as Traffic;
  const lane = streetLane(sim);
  const at = pose(sim, lane, 100);
  sim.city?.sync(at.x, at.z, true);
  sim.vehicle.teleport({ x: at.x, y: 0.9, z: at.z }, at.yaw);
  sim.vehicle.setVelocity(0, 0, 0);
  run(sim, 1.5, (_t, c, s) => { c.handbrake = 1; s.pursuit.force(); });
  const units: number[] = [];
  for (const s of [72, 62, 52]) {
    const unit = traffic.spawnPoliceAt(lane, s, 'police', sim.probe, 0, -1, 4, -1, true);
    expect(unit).toBeGreaterThanOrEqual(0);
    expect(sim.police!.enlist(unit)).toBeGreaterThanOrEqual(0);
    units.push(unit);
  }
  return { sim, units, at, lane };
}

describe('solid cars: the box', () => {
  it('M8.6 2.1–2.3 a wreck in the rear place is gone round, not shoved; under the card nobody moves; after it the units go', async () => {
    const { sim, units, at } = await boxScene();
    try {
      const traffic = sim.traffic as Traffic;
      // a wreck standing on the rear place, square across the lane
      const fx = Math.sin(at.yaw), fz = Math.cos(at.yaw);
      const wreck = traffic.spawnAtPoint(at.x - fx * 5.6, at.z - fz * 5.6, at.yaw + Math.PI / 2, 'sedan', AgentState.Wrecked);
      run(sim, 0.2, (_t, c, s) => { c.handbrake = 1; s.pursuit.force(); });
      const w0 = { x: traffic.x[wreck] as number, z: traffic.z[wreck] as number };
      let shoved = 0;
      const t0 = sim.time;
      for (let k = 0; k < 12 * 60 && sim.run.state !== 'busted'; k++) {
        sim.controls.handbrake = 1;
        sim.pursuit.force();
        sim.step();
        shoved = Math.max(shoved, Math.hypot((traffic.x[wreck] as number) - w0.x, (traffic.z[wreck] as number) - w0.z));
      }
      const tookFor = sim.time - t0;
      expect(sim.run.state).toBe('busted');
      // under the card: nobody moves, the car stays where the officer writes
      const u0 = units.map((u) => ({ x: traffic.x[u] as number, z: traffic.z[u] as number }));
      const p0 = { x: sim.probe.x, z: sim.probe.z };
      let moved = 0;
      run(sim, 2, () => {
        units.forEach((u, k) => { moved = Math.max(moved, Math.hypot((traffic.x[u] as number) - u0[k]!.x, (traffic.z[u] as number) - u0[k]!.z)); });
      });
      const carMoved = Math.hypot(sim.probe.x - p0.x, sim.probe.z - p0.z);
      // after it the player drives off down the street, and each unit drives off or goes back to the pool
      sim.run.closeCard();
      run(sim, 10, (_t, c) => { c.throttle = 0.5; });
      const gone = units.filter((u, k) => traffic.police[u] !== 1 || traffic.state[u] === AgentState.Free
        || Math.hypot((traffic.x[u] as number) - u0[k]!.x, (traffic.z[u] as number) - u0[k]!.z) > 6).length;
      console.log(`[solid] the box: busted after ${tookFor.toFixed(1)} s, the wreck shoved ${shoved.toFixed(2)} m; under the card units moved ${moved.toFixed(2)} m, the car ${carMoved.toFixed(2)} m; ${gone} of ${units.length} units gone 10 s after`);
      expect(shoved).toBeLessThan(0.5);
      expect(moved).toBeLessThan(0.3);
      expect(carMoved).toBeLessThan(0.2);
      expect(gone).toBe(units.length);
    } finally { sim.dispose(); }
  }, 60_000);
});

/**
 * The player stopped on a street, a parked cruiser pressed on one flank (`side` 1 the driver's, the left) and a second
 * one behind, the bar filling; the officer's worst step inside a car and where they write.
 */
async function ticketScene(side: 1 | -1, shove = false): Promise<{ inside: number; windowSide: number; atWindow: number; afterShove: number }> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, heat: 20 });
  try {
    sim.police!.dispatching = false;
    const traffic = sim.traffic as Traffic, peds = sim.peds!;
    const lane = streetLane(sim);
    const at = pose(sim, lane, 80);
    sim.city?.sync(at.x, at.z, true);
    sim.vehicle.teleport({ x: at.x, y: 0.9, z: at.z }, at.yaw);
    run(sim, 1, (_t, c) => { c.handbrake = 1; });
    const probe = sim.probe, fx = Math.sin(probe.yaw), fz = Math.cos(probe.yaw);
    // the flank's outward direction: the driver's side is +(cos, -sin)
    const ox = Math.cos(probe.yaw) * side, oz = -Math.sin(probe.yaw) * side;
    const pressed = probe.halfWidth + 0.95 + 0.2;
    const cars: number[] = [];
    cars.push(traffic.spawnParkedPolice(probe.x + ox * pressed, probe.z + oz * pressed, probe.yaw, 'police'));
    cars.push(traffic.spawnParkedPolice(probe.x - fx * 5.8, probe.z - fz * 5.8, probe.yaw, 'police'));
    // inside a footprint: the player's car or a cruiser's, not grown
    const within = (x: number, z: number, cx: number, cz: number, yaw: number, hw: number, hl: number): number => {
      const dx = x - cx, dz = z - cz, f = Math.sin(yaw), g = Math.cos(yaw);
      return Math.min(hl - Math.abs(dx * f + dz * g), hw - Math.abs(dx * g - dz * f));
    };
    let inside = -Infinity, windowSide = 0, atWindow = Infinity, afterShove = Infinity;
    for (let k = 0; k < 8 * 60; k++) {
      sim.controls.handbrake = 1;
      sim.step();
      const o = sim.ticket.ped;
      if (o < 0) continue;
      const x = peds.x[o] as number, z = peds.z[o] as number;
      inside = Math.max(inside, within(x, z, probe.x, probe.z, probe.yaw, probe.halfWidth, probe.halfLength));
      for (const c of cars) inside = Math.max(inside, within(x, z, traffic.x[c] as number, traffic.z[c] as number, traffic.yaw[c] as number, traffic.halfWidthOf(c), traffic.halfLengthOf(c)));
      if (sim.run.state === 'busted' && peds.pose[o] === PedPose.Ticket) {
        // which window: the side of the car they stand on, and how far from its point
        const across = (x - probe.x) * Math.cos(probe.yaw) - (z - probe.z) * Math.sin(probe.yaw);
        windowSide = across > 0 ? 1 : -1;
        atWindow = Math.abs(Math.abs(across) - (probe.halfWidth + 0.55));
        if (!shove) break;
        // shoved a metre across under the card: the window goes with the car
        const p0 = { x: probe.x, z: probe.z };
        sim.vehicle.teleport({ x: p0.x - ox * 1, y: 0.9, z: p0.z - oz * 1 }, probe.yaw);
        run(sim, 0.3, (_t, c) => { c.handbrake = 1; });
        const o2 = sim.ticket.ped;
        const across2 = ((peds.x[o2] as number) - probe.x) * Math.cos(probe.yaw) - ((peds.z[o2] as number) - probe.z) * Math.sin(probe.yaw);
        const along2 = ((peds.x[o2] as number) - probe.x) * fx + ((peds.z[o2] as number) - probe.z) * fz;
        afterShove = Math.hypot(Math.abs(across2) - (probe.halfWidth + 0.55), along2);
        break;
      }
    }
    return { inside, windowSide, atWindow, afterShove };
  } finally { sim.dispose(); }
}

describe('solid cars: the officer', () => {
  it('M8.6 3.1 a cruiser pressed on the right: the officer comes out of its far side, goes round the car and writes at the driver\'s window, never inside a car', async () => {
    const r = await ticketScene(-1);
    console.log(`[solid] the officer, a cruiser on the right: deepest inside a car ${r.inside.toFixed(2)} m, writes at window ${r.windowSide} (${r.atWindow.toFixed(2)} m off)`);
    expect(r.inside).toBeLessThan(0);
    expect(r.windowSide).toBe(1);
    expect(r.atWindow).toBeLessThan(0.1);
  }, 60_000);

  it('M8.6 3.2 a cruiser pressed on the driver\'s side: the officer writes at the passenger\'s window', async () => {
    const r = await ticketScene(1);
    console.log(`[solid] the officer, a cruiser on the left: deepest inside a car ${r.inside.toFixed(2)} m, writes at window ${r.windowSide}`);
    expect(r.inside).toBeLessThan(0);
    expect(r.windowSide).toBe(-1);
  }, 60_000);

  it('M8.6 3.3 the car shoved a metre under the card: the officer is still at its window', async () => {
    const r = await ticketScene(-1, true);
    console.log(`[solid] the officer after the shove: ${r.afterShove.toFixed(2)} m off the window`);
    expect(r.afterShove).toBeLessThan(0.1);
  }, 60_000);
});
