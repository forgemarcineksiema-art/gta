/**
 * Each district's things (M8 slice 4, docs/history/M8_PLAN.md §3.3): the Works' yards and kerbs, the Gardens' front gardens
 * and stalls, the Quay's promenade and stalls, only in their districts; 40–70 things a block (a park's and a yard's
 * may add more); a barrel knocked from the side rolls.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import type { PropDesc } from '../../src/sim/city/props';
import { PropState } from '../../src/sim/props/Props';
import { createWorld, run } from './helpers';

describe('the districts\' things (M8 slice 4)', () => {
  let sim: SimWorld;
  beforeAll(async () => { sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false }); });
  afterAll(() => sim.dispose());

  it('M8 4.2 a barrel knocked from the side rolls: its spin about its axis within 20 % of rolling without slip after 0.5 s', () => {
    const props = sim.props!, city = sim.city!;
    sim.spawnAt('foundry');
    let barrel: PropDesc | null = null;
    for (const e of city.active.values()) for (const p of city.props(e.chunk.x, e.chunk.z)) if (!barrel && p.kind === 'barrel') barrel = p;
    expect(barrel).not.toBeNull();
    const b = barrel!;
    // knocked over, left to lie, then knocked from the side (across its axis)
    props.knock(b.id, 1400, 3, Math.sin(b.yaw), Math.cos(b.yaw), 0, 0);
    run(sim, 9);
    expect(props.state[b.id]).toBe(PropState.Lying);
    const o = b.id * 7;
    const qx = props.pose[o + 3]!, qy = props.pose[o + 4]!, qz = props.pose[o + 5]!, qw = props.pose[o + 6]!;
    // its axis (local y) in the world, flattened; the side is across it
    let ax = 2 * (qx * qy - qz * qw), az = 2 * (qy * qz + qx * qw);
    const l = Math.hypot(ax, az);
    ax /= l; az /= l;
    props.knock(b.id, 1400, 4, -az, ax, 0, 0);
    run(sim, 0.5);
    const body = props.bodyOf(b.id);
    expect(body).not.toBeNull();
    const v = body!.linvel(), w = body!.angvel(), r = body!.rotation();
    // the axis now, and the spin about it against the roll of the speed across it
    const bx = 2 * (r.x * r.y - r.z * r.w), by = 1 - 2 * (r.x * r.x + r.z * r.z), bz = 2 * (r.y * r.z + r.x * r.w);
    const spin = Math.abs(w.x * bx + w.y * by + w.z * bz);
    const across = Math.hypot(v.x - (v.x * bx + v.z * bz) * bx, v.z - (v.x * bx + v.z * bz) * bz);
    expect(across).toBeGreaterThan(0.5);
    expect(Math.abs(spin * 0.29 / across - 1)).toBeLessThan(0.2);
  });
});
