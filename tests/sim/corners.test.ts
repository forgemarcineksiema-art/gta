/**
 * The police's last looks (M7 slice 9): a unit on a chase takes a turn on its
 * inside line, so its way through a right-angle junction is shorter than a
 * civilian's on the same turn; at levels 4-5 a heavy within reach takes a
 * slot of the box before a nearer saloon.
 */
import { describe, expect, it } from 'vitest';
import { POLICE } from '../../src/sim/police/tuning';
import { slotCost } from '../../src/sim/police/Police';
import { AgentState, type Traffic } from '../../src/sim/traffic/Traffic';
import { createWorld } from './helpers';

/** A lane with a turn of 70-110 degrees among its next lanes: the lane and the turn. */
function aTurn(traffic: Traffic): [number, number] {
  const lanes = traffic.lanes;
  for (let i = 0; i < lanes.laneCount; i++) {
    if ((lanes.length[i] as number) < 60) continue;
    for (const nxt of lanes.outs(i)) {
      const hc = Math.abs(lanes.headingChange(i, nxt));
      if (hc > (70 * Math.PI) / 180 && hc < (110 * Math.PI) / 180 && (lanes.length[nxt] as number) > 40) return [i, nxt];
    }
  }
  throw new Error('no right-angle turn');
}

async function throughTurn(unit: boolean): Promise<number> {
  const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
  try {
    sim.police!.dispatching = false;
    const traffic = sim.traffic as Traffic;
    const [lane, turn] = aTurn(traffic);
    const len = traffic.lanes.length[lane] as number;
    // the player 150 m off: no body is lent this far, and nothing is despawned this near
    const ex = traffic.lanes.midX[lane] as number, ez = traffic.lanes.midZ[lane] as number;
    sim.city?.sync(ex + 150, ez, true);
    sim.vehicle.teleport({ x: ex + 150, y: 1, z: ez }, 0);
    const agent = traffic.spawnAt(lane, len - 45, 'sedan');
    // the plan's and the turn's fields are the traffic's own: the test sets them as the police's planner would
    const own = traffic as unknown as Record<'plannerSpeed' | 'plannerLane' | 'plannerNext' | 'turn', Float32Array | Int16Array | Uint8Array>;
    if (unit) {
      traffic.police[agent] = 1;
      own.plannerSpeed[agent] = 10;
      own.plannerLane[agent] = lane;
      own.plannerNext[agent] = turn;
    } else {
      traffic.next[agent] = turn;
      own.turn[agent] = 1;
    }
    let path = 0, measuring = false, done = false;
    let px = 0, pz = 0;
    for (let k = 0; k < 60 * 30 && !done; k++) {
      sim.step();
      if (traffic.state[agent] === AgentState.Free) break;
      const x = traffic.x[agent] as number, z = traffic.z[agent] as number;
      const onLane = traffic.lane[agent] === lane, s = traffic.s[agent] as number;
      if (!measuring && onLane && s >= len - 20) { measuring = true; px = x; pz = z; continue; }
      if (!measuring) continue;
      path += Math.hypot(x - px, z - pz);
      px = x; pz = z;
      if (traffic.lane[agent] === turn && s >= 15) done = true;
    }
    expect(done).toBe(true);
    return path;
  } finally { sim.dispose(); }
}

describe('the police\'s corners', () => {
  it('M7 9.1 a unit on a chase takes a right-angle turn on its inside line: its way through is shorter than a civilian\'s', async () => {
    const civilian = await throughTurn(false);
    const unit = await throughTurn(true);
    console.info(`through the turn: civilian ${civilian.toFixed(2)} m, unit ${unit.toFixed(2)} m`);
    expect(unit).toBeLessThan(civilian - 1.5);
  }, 60_000);

  it('M7 9.2 a heavy within reach takes a slot of the box before a nearer saloon', () => {
    const a = POLICE.arrest;
    // a heavy 18 m off against a saloon 8 m off: the heavy's cost is the lower
    expect(slotCost(18, false, true, a)).toBeLessThan(slotCost(8, false, false, a));
    // among saloons the nearer still wins, and a unit keeps its own slot by `keep`
    expect(slotCost(8, false, false, a)).toBeLessThan(slotCost(10, false, false, a));
    expect(slotCost(12, true, false, a)).toBeLessThan(slotCost(8, false, false, a));
  });
});
