/**
 * The long game (M8 slice 9, docs/M8_PLAN.md D10): the save's version 5 carries the career's lifetime count of
 * things smashed; two dailies count the player's smashes (sixty in one run, ten lamp posts); Big Bernie's second
 * requirement reads the lifetime count.
 */
import { describe, expect, it } from 'vitest';
import type { SimWorld } from '../../src/sim';
import { RIVALS, reqText } from '../../src/sim/board/rivals';
import { PROP_TYPES, type PropDesc, type PropKind } from '../../src/sim/city/props';
import { DAILY_TEMPLATES } from '../../src/sim/dailies/Dailies';
import { SAVE_VERSION, collect, defaultSave, migrate, parse, serialize, versionOf } from '../../src/sim/save/format';
import { createWorld, run } from './helpers';

function standing(sim: SimWorld, kind: PropKind): PropDesc[] {
  const out: PropDesc[] = [];
  for (const entry of sim.city!.active.values()) for (const p of sim.city!.props(entry.chunk.x, entry.chunk.z)) if (p.kind === kind) out.push(p);
  return out;
}

/** The player's smash of a prop, as the knock reports it (its bill), or a unit's (0). */
function smash(sim: SimWorld, p: PropDesc, player = true): void {
  sim.events.push('smash', player ? PROP_TYPES[p.kind].bill : 0, p.x, 0.5, p.z, p.id);
}

describe('the long game (M8 slice 9)', () => {
  it('M8 9.1 a v4 save migrates (to v5, and on to the current version) with nothing smashed; the career\'s count round-trips through a world', async () => {
    const v4: Record<string, unknown> = { ...(JSON.parse(serialize(defaultSave())) as Record<string, unknown>), v: 4 };
    const career = { ...(v4['career'] as Record<string, unknown>) };
    delete career['smashed'];
    v4['career'] = career;
    const migrated = migrate(v4);
    expect(migrated.v).toBe(SAVE_VERSION);
    expect(migrated.career.smashed).toBe(0);
    const doc = defaultSave();
    doc.career.smashed = 1234;
    const text = serialize(doc);
    expect(versionOf(text)).toBe(SAVE_VERSION);
    expect(parse(text)).toEqual(doc);
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false, save: doc });
    try {
      expect(sim.career.smashed).toBe(1234);
      // a real knock counts once; a unit's does not
      const [bin, other] = standing(sim, 'bin');
      sim.props!.knock(bin!.id, 1400, 10, -Math.sin(bin!.yaw), -Math.cos(bin!.yaw), 0, 0);
      sim.props!.knock(other!.id, 1400, 10, -Math.sin(other!.yaw), -Math.cos(other!.yaw), 0, 0, 2);
      run(sim, 1 / 60);
      expect(sim.career.smashed).toBe(1235);
      const out = defaultSave();
      collect(sim, out);
      expect(out.career.smashed).toBe(1235);
      expect(parse(serialize(out)).career.smashed).toBe(1235);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8 9.2 the dailies count the player\'s smashes within one run, and the lamp posts alone', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const d = sim.dailies;
      const sixty = DAILY_TEMPLATES.findIndex((t) => t.text === 'SMASH 60 THINGS IN ONE RUN');
      const lamps = DAILY_TEMPLATES.findIndex((t) => t.text === 'FLATTEN 10 LAMP POSTS');
      expect(sixty).toBeGreaterThanOrEqual(0);
      expect(lamps).toBeGreaterThanOrEqual(0);
      d.ids[0] = sixty; d.ids[1] = lamps; d.ids[2] = 0;
      for (let i = 0; i < 3; i++) { d.progress[i] = 0; d.done[i] = false; }
      const bin = standing(sim, 'bin')[0]!, lamp = standing(sim, 'lamp')[0]!;
      for (let k = 0; k < 3; k++) smash(sim, bin);
      for (let k = 0; k < 2; k++) smash(sim, lamp);
      // a unit's smash is nobody's
      smash(sim, lamp, false);
      run(sim, 1 / 60);
      expect(d.progress[0]).toBe(5);
      expect(d.progress[1]).toBe(2);
      // a run that ends short of sixty starts that count again; the lamp posts keep theirs
      d.onRunEnd(0, 0, true);
      expect(d.progress[0]).toBe(0);
      expect(d.progress[1]).toBe(2);
      const seq = sim.events.sequence;
      for (let k = 0; k < 60; k++) smash(sim, bin);
      for (let k = 0; k < 8; k++) smash(sim, lamp);
      run(sim, 1 / 60);
      expect(d.done[0]).toBe(true);
      expect(d.done[1]).toBe(true);
      let paid = 0;
      sim.events.readFrom(seq, (e) => { if (e.kind === 'dailyDone') paid++; });
      expect(paid).toBe(2);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8 9.3 Big Bernie wants 300 things smashed, read from the lifetime count; his jumps requirement is gone', async () => {
    const bernie = RIVALS.find((r) => r.name === 'BIG BERNIE')!;
    const req = bernie.reqs.find((r) => r.kind === 'smashed')!;
    expect(req.count).toBe(300);
    expect(reqText(req)).toBe('SMASH 300 THINGS');
    expect(bernie.reqs.some((r) => r.kind === 'jumps')).toBe(false);
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      sim.career.smashed = 298;
      const [a, b] = standing(sim, 'bin');
      sim.props!.knock(a!.id, 1400, 10, -Math.sin(a!.yaw), -Math.cos(a!.yaw), 0, 0);
      run(sim, 1 / 60);
      expect(sim.board.have(req)).toBe(299);
      expect(sim.board.met(req)).toBe(false);
      // a new run (the busted card closed) keeps the lifetime count; the run's own starts again
      sim.run.state = 'busted';
      sim.run.closeCard();
      expect(sim.run.counts.smashes).toBe(0);
      sim.props!.knock(b!.id, 1400, 10, -Math.sin(b!.yaw), -Math.cos(b!.yaw), 0, 0);
      run(sim, 1 / 60);
      expect(sim.board.met(req)).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);
});
