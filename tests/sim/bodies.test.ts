/**
 * Traffic's own bodies (M5.5 slice 19, docs/DESIGN.md §13.11): the city draws
 * its eight civilian bodies by place (buses on the avenues, trucks in the
 * Works, taxis round the tower), never the player's shells; each record has
 * its body's footprint and its collider's box; a car keeps its distance behind a bus;
 * a swap takes the body: the bus is the heavy stretched, the taxi stays yellow.
 */
import { HIDDEN_CARS } from '../../src/sim/city/stash';
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { BODIES, BODY_IDS, BODY_INDEX, CIVILIAN_BODIES, bodySpec, bodyTuning, isRivalBody, isShell, pickBody, type CivilianBody, type RoadKind } from '../../src/sim/traffic/bodies';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { TRAFFIC } from '../../src/sim/traffic/tuning';
import { CAR_IDS, CAR_PRESETS } from '../../src/sim/vehicle/presets';
import { PALETTE } from '../../src/sim/palette';
import { createWorld, run } from './helpers';

/** Shares of each body over a fine grid of the pick's roll. */
function shares(district: string, road: RoadKind): Record<CivilianBody, number> {
  const out = Object.fromEntries(CIVILIAN_BODIES.map((b) => [b, 0])) as Record<CivilianBody, number>;
  const n = 4000;
  for (let k = 0; k < n; k++) out[pickBody((k + 0.5) / n, district, road, TRAFFIC.bodies)] += 1 / n;
  return out;
}

/** A straight street lane at least `min` m long. */
function streetLane(sim: SimWorld, min = 150): number {
  const traffic = sim.traffic as Traffic;
  const lanes = traffic.lanes;
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

describe('traffic\'s own bodies', () => {
  it('19.1 the pick by place: buses on the streets and more on the avenues, never on the highway; taxis round the tower, trucks in the Works', () => {
    for (const d of ['crown', 'foundry', 'gardens', 'marina']) {
      expect(shares(d, 'highway').bus).toBe(0);
      expect(shares(d, 'street').bus).toBeGreaterThan(0.02);
    }
    expect(shares('crown', 'avenue').bus).toBeGreaterThan(shares('crown', 'street').bus * 2);
    expect(shares('crown', 'street').taxi).toBeGreaterThan(shares('marina', 'street').taxi * 3);
    expect(shares('foundry', 'street').truck).toBeGreaterThan(shares('gardens', 'street').truck * 2);
    // every civilian body the spawner draws comes up on a street (a hidden car is stashed, never drawn: M5.5 slice
    // 16; a rival's car is won, never drawn: M6)
    for (const b of CIVILIAN_BODIES.filter((id) => !(HIDDEN_CARS as readonly string[]).includes(id) && !isRivalBody(id))) expect(Math.max(shares('crown', 'street')[b], shares('foundry', 'street')[b])).toBeGreaterThan(0.02);
  });

  it('19.2 the city spawns its own bodies, never the player\'s shells, each with its footprint and its collider', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 1, peds: 0, record: false });
    try {
      sim.police!.dispatching = false;
      const traffic = sim.traffic as Traffic;
      run(sim, 6);
      for (let b = 0; b < CAR_IDS.length; b++) expect(traffic.bodySpawns[b]).toBe(0);
      let kinds = 0;
      for (let b = CAR_IDS.length; b < BODIES.length; b++) if ((traffic.bodySpawns[b] as number) > 0) kinds++;
      expect(kinds).toBeGreaterThanOrEqual(6);
      let checked = 0;
      for (let i = 0; i < traffic.capacity; i++) {
        if (traffic.state[i] === AgentState.Free || traffic.police[i] === 1) continue;
        const spec = bodySpec(traffic.bodyOf(i));
        expect(traffic.kindOf(i)).toBe(spec.car);
        expect(traffic.halfWidthOf(i)).toBeCloseTo(spec.halfWidth, 5);
        expect(traffic.halfLengthOf(i)).toBeCloseTo(spec.halfLength, 5);
        checked++;
      }
      expect(checked).toBeGreaterThan(15);
    } finally { sim.dispose(); }
  }, 60_000);

  it('19.3 a car behind a bus keeps its distance: the queue is spaced by the bodies, never through the bus', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      const lane = streetLane(sim, 170);
      // the player out of the way, 60 m behind the lane's start
      const p0 = pose(sim, lane, 0);
      const px = p0.x - Math.sin(p0.yaw) * 60, pz = p0.z - Math.cos(p0.yaw) * 60;
      sim.city?.sync(px, pz, true);
      sim.vehicle.teleport({ x: px, y: 0.8, z: pz }, p0.yaw);
      sim.vehicle.setVelocity(0, 0, 0);
      const bus = traffic.spawnAt(lane, 40, 'bus');
      const car = traffic.spawnAt(lane, 24, 'sedan');
      traffic.pace[bus] = 0.6;
      traffic.pace[car] = 1.18;
      traffic.bad[bus] = 0;
      traffic.bad[car] = 0;
      const fx = Math.sin(p0.yaw), fz = Math.cos(p0.yaw);
      const along = (i: number): number => ((traffic.x[i] as number) - p0.x) * fx + ((traffic.z[i] as number) - p0.z) * fz;
      const contact = bodySpec('bus').halfLength + bodySpec('sedan').halfLength;
      let least = Infinity;
      run(sim, 8, () => {
        if (traffic.lane[car] === traffic.lane[bus] || traffic.lane[bus] === lane) least = Math.min(least, along(bus) - along(car) - contact);
      });
      expect(least).toBeGreaterThan(0.5);
      expect(along(car)).toBeLessThan(along(bus));
    } finally { sim.dispose(); }
  }, 60_000);

  it('19.4 a swap takes the body: the bus is the heavy stretched to it, the taxi stays yellow, the radio names them', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const traffic = sim.traffic as Traffic;
      const lane = streetLane(sim);
      /** The player stopped on the lane at `s`, the body alongside 3.2 m to the side, taken. */
      const take = (body: 'bus' | 'taxi', s: number): number => {
        const at = pose(sim, lane, s);
        sim.city?.sync(at.x, at.z, true);
        sim.vehicle.teleport({ x: at.x, y: 1, z: at.z }, at.yaw);
        sim.vehicle.setVelocity(0, 0, 0);
        run(sim, 0.8); // settle on the wheels
        const agent = traffic.spawnAt(lane, s, body, AgentState.Kinematic, -3.2);
        traffic.speed[agent] = 0;
        traffic.pace[agent] = 0.01;
        if (body === 'taxi') traffic.paint[agent] = PALETTE.coin;
        run(sim, 0.2);
        expect(sim.life.state.swapCandidate).toBe(agent);
        // alongside the player it has a lent body, and the body's box
        expect(traffic.hasBody(agent)).toBe(true);
        let boxes = 0;
        sim.world.forEachCollider((c) => {
          if (traffic.agentForCollider(c.handle) !== agent) return;
          const he = c.halfExtents();
          expect(he?.x).toBeCloseTo(bodySpec(body).halfWidth, 4);
          expect(he?.z).toBeCloseTo(bodySpec(body).halfLength, 4);
          boxes++;
        });
        expect(boxes).toBe(1);
        sim.controls.swap = true;
        sim.step();
        return agent;
      };
      const left = take('bus', 40);
      expect(sim.carBody).toBe('bus');
      expect(sim.carId).toBe('heavy');
      expect(sim.vehicle.tuning.chassisHalfExtents.z).toBeCloseTo(6.0, 5);
      expect(sim.vehicle.tuning.wheelBase).toBeCloseTo(6.6, 5);
      expect(sim.vehicle.tuning.mass).toBe(6500);
      // every force scaled with the mass: it pulls and stops like the van
      const k = 6500 / CAR_PRESETS.heavy.mass;
      expect(sim.vehicle.tuning.torqueMax).toBeCloseTo(CAR_PRESETS.heavy.torqueMax * k, 3);
      expect(sim.vehicle.tuning.brakeTorque).toBeCloseTo(CAR_PRESETS.heavy.brakeTorque * k, 3);
      expect(sim.pursuit.descriptor.body).toBe('bus');
      // the car left behind is the player's own shell
      expect(traffic.bodyOf(left)).toBe('muscle');
      // and it drives
      run(sim, 3, (_t, c) => { c.throttle = 1; });
      expect(sim.vehicle.telemetry.speed).toBeGreaterThan(5);
      run(sim, 2, (_t, c) => { c.brake = 1; });
      take('taxi', 110);
      expect(sim.carBody).toBe('taxi');
      expect(sim.carId).toBe('muscle');
      expect(sim.carPaint).toBe(PALETTE.coin);
      expect(sim.pursuit.descriptor.paint).toBe(PALETTE.coin);
      // at its own mass since M8.8 slice 4 (was the muscle class's)
      expect(sim.vehicle.tuning.mass).toBe(bodySpec('taxi').mass);
      expect(BODY_INDEX.taxi).toBeGreaterThanOrEqual(CAR_IDS.length);
    } finally { sim.dispose(); }
  }, 60_000);
});

describe('every body at its own mass (M8.8 slice 4)', () => {
  it('M8.8 4.3 the Bubble is 550 kg in the player\'s hands, the SUV 1,900; every non-shell body its own mass', () => {
    expect(bodyTuning('bubble').mass).toBe(550);
    expect(bodyTuning('suv').mass).toBe(1900);
    for (const body of BODY_IDS) if (!isShell(body)) expect(bodyTuning(body).mass, body).toBe(bodySpec(body).mass);
  });

  it('M8.8 4.1 a shell and a rival on a shell drive as their class\'s preset, bitwise', () => {
    for (const body of ['muscle', 'compact', 'heavy', 'sports', 'police', 'twin', 'phantom', 'fakecop', 'chiefcar'] as const) {
      expect(bodyTuning(body), body).toEqual(CAR_PRESETS[bodySpec(body).car]);
    }
  });

  it('M8.8 4.3 a world started in a body drives it: its class, its paint, its mass', async () => {
    const sim = await createWorld({ spawn: 'straight', body: 'bubble' });
    try {
      expect(sim.carBody).toBe('bubble');
      expect(sim.carId).toBe('compact');
      expect(sim.carPaint).toBe(bodySpec('bubble').paints[0]);
      expect(sim.vehicle.tuning.mass).toBe(550);
    } finally { sim.dispose(); }
  });
});
