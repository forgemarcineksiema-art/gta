/**
 * The heat ratchet (M4) and what the police see (M5.5 slice 0, docs/DESIGN.md
 * §13.3): a seen crime pays double and makes the player wanted, a ram on a
 * civilian counts once per car per cooldown, the chase drips, a level-up is an
 * event.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { EventLog } from '../../src/sim/events';
import { Heat } from '../../src/sim/heat/Heat';
import { createWorld } from './helpers';

const H = BALANCE.heat;
const LEVEL1 = BALANCE.heatThresholds[0] as number;

describe('heat ratchet', () => {
  it('consumes each crime once, crosses thresholds and never decays or overflows', () => {
    const events = new EventLog();
    const heat = new Heat(events, null);
    for (let i = 0; i < 5; i++) events.push('takedown', 0.3, 0, 0, 0);
    heat.step();
    expect(heat.points).toBe(5 * H.trafficTakedown);
    expect(heat.level).toBe(1);
    events.push('escape', 1, 0, 0, 0);
    events.push('respawn', 0, 0, 0, 0);
    for (let i = 0; i < 600; i++) heat.step();
    heat.add(-20);
    expect(heat.points).toBe(5 * H.trafficTakedown);
    heat.add(100);
    expect(heat.points).toBe(100);
    expect(heat.level).toBe(5);
    heat.reset();
    heat.step();
    expect(heat.points).toBe(0);
    expect(heat.level).toBe(0);
    events.push('billboard', 0.3, 0, 0, 0);
    heat.step();
    expect(heat.points).toBe(H.billboard);
  });

  it('charges police takedowns more than civilian takedowns', async () => {
    const sim = await createWorld({ map: 'city', traffic: 0, peds: 0 });
    try {
      const traffic = sim.traffic!;
      const agent = traffic.spawnAt(0, 60, 'police');
      traffic.police[agent] = 1;
      traffic.wreck(agent);
      sim.events.push('takedownTraffic', 0.3, 0, 0, 0, agent);
      sim.heat.step();
      expect(sim.heat.points).toBe(H.policeTakedown);
      sim.events.push('takedown', 0.3, 0, 0, 0, -1);
      sim.heat.step();
      expect(sim.heat.points).toBe(H.policeTakedown + H.trafficTakedown);
    } finally { sim.dispose(); }
  });

  it('0.1 a crime in a unit\'s sight pays double and makes the player wanted at once; unseen it stays quiet', () => {
    const events = new EventLog();
    const heat = new Heat(events, null);
    let seen = false;
    heat.seen = () => seen;
    events.push('billboard', 0.3, 0, 0, 0);
    heat.step();
    expect(heat.points).toBe(H.billboard);
    expect(heat.level).toBe(0);
    seen = true;
    events.push('billboard', 0.3, 0, 0, 0);
    heat.step();
    // the seen billboard is worth 6, but a witnessed crime never leaves the player below level 1
    expect(heat.points).toBe(LEVEL1);
    expect(heat.level).toBe(1);
    expect(heat.lastGain).toBe(LEVEL1 - H.billboard);
    events.push('camera', 30, 0, 0, 0);
    heat.step();
    expect(heat.points).toBe(LEVEL1 + H.camera * H.seenFactor);
  });

  it('0.2 a ram on a civilian above the disturb threshold costs heat once per car per cooldown; walls and police cars do not', async () => {
    const sim = await createWorld({ map: 'city', traffic: 0, peds: 0 });
    try {
      const traffic = sim.traffic!;
      const heat = sim.heat;
      // the pin is the cooldown rule: the player is the faster car (a car driving into a slower player pays nothing; spawnAt drives at the highway limit)
      heat.playerSpeed = () => 30;
      const a = traffic.spawnAt(0, 60, 'compact');
      const b = traffic.spawnAt(0, 120, 'muscle');
      const cop = traffic.spawnAt(0, 180, 'police');
      traffic.police[cop] = 1;
      const hard = traffic.tuning.disturbedImpact;
      sim.events.push('hit', hard, 0, 0, 0, a);
      heat.step();
      expect(heat.points).toBe(H.hit);
      // the same car again inside the cooldown: nothing; another car: paid
      sim.events.push('hit', hard * 2, 0, 0, 0, a);
      sim.events.push('hit', hard, 0, 0, 0, b);
      heat.step();
      expect(heat.points).toBe(2 * H.hit);
      // a scrape below the threshold, a wall, a police car: nothing
      sim.events.push('hit', hard * 0.5, 0, 0, 0, b);
      sim.events.push('hit', hard * 3, 0, 0, 0, -1);
      sim.events.push('hit', hard * 3, 0, 0, 0, cop);
      heat.step();
      expect(heat.points).toBe(2 * H.hit);
      // the cooldown runs in tick: after it the first car pays again
      for (let i = 0; i < 60 * H.hitCooldown + 1; i++) heat.tick(1 / 60, false);
      sim.events.push('hit', hard, 0, 0, 0, a);
      heat.step();
      expect(heat.points).toBe(3 * H.hit);
    } finally { sim.dispose(); }
  });

  it('0.3 an active pursuit drips heat; idle it does not', () => {
    const events = new EventLog();
    const heat = new Heat(events, null);
    for (let i = 0; i < 3600; i++) heat.tick(1 / 60, true);
    expect(heat.points).toBeCloseTo(60 * H.chasePerSecond, 3);
    const before = heat.points;
    for (let i = 0; i < 3600; i++) heat.tick(1 / 60, false);
    expect(heat.points).toBe(before);
  });

  it('0.4 the numbers: the intro\'s level 1, a delivery, a billboard in a patrol\'s sight and two rams reach level 2, and the level-up is an event', () => {
    const events = new EventLog();
    const heat = new Heat(events, null);
    heat.set(BALANCE.coldOpen.heat);
    expect(heat.level).toBe(1);
    heat.add(BALANCE.jobs.delivery.heat);
    heat.tick(1 / 60, false);
    expect(heat.level).toBe(1);
    heat.add(H.billboard, true);
    heat.add(H.hit);
    heat.add(H.hit);
    expect(heat.points).toBe(BALANCE.heatThresholds[1] as number);
    let levelUps = 0, level = 0;
    heat.tick(1 / 60, false);
    events.readFrom(0, (e) => { if (e.kind === 'heatLevel') { levelUps++; level = e.value; } });
    expect(levelUps).toBe(1);
    expect(level).toBe(2);
    // set() is a level, not a level-up: no event at boot
    heat.set(80);
    heat.tick(1 / 60, false);
    levelUps = 0;
    events.readFrom(0, (e) => { if (e.kind === 'heatLevel') levelUps++; });
    expect(levelUps).toBe(1);
  });
});
