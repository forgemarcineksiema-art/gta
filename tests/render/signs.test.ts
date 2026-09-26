/**
 * The signs and the colours (docs/history/M8.7_PLAN.md slice 3, D5–D7; DESIGN.md §20.3 rules 5–7): one outline per kind in
 * a unit square; colour says the state (open white, the goal cyan, closed grey); each goal wears its sign; the line
 * names the goal with its badge and its pay in both languages; no kind has a colour of its own left.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/sim/balance';
import { GLYPHS, GLYPH_ORDER, KIND_GLYPH, glyphIndex, glyphOf } from '../../src/sim/glyphs';
import type { JobDef, JobKind } from '../../src/sim';
import * as MarkerViewModule from '../../src/render/run/MarkerView';
import * as Minimap from '../../src/ui/map/minimap';
import {
  SIGN_CLOSED, SIGN_COLORS, SIGN_GOAL, SIGN_OPEN, collectSigns, newRingList, newSignList, paySign, payOf,
} from '../../src/render/run/signs';
import { badgeMarkup, goalWords, newCardWords } from '../../src/ui/hud/jobs';
import { setLang } from '../../src/ui/lang';
import { hudScale } from '../../src/ui/scale';
import { SIGN_MIN, SIGN_SIZE, signScale, signShare, signTopY } from '../../src/render/run/signs';
import { createWorld, run, runUntil } from '../sim/helpers';

const CITY = { map: 'city', seed: 42, traffic: 0, peds: 0, record: false } as const;
const always = (): boolean => false;

describe('the signs (M8.7 slice 3)', () => {
  afterEach(() => setLang('en'));

  it('M8.7 3.1 every kind has its outline: closed polygons inside the unit square, a glyph for every job kind and digit', () => {
    for (const id of GLYPH_ORDER) {
      const shapes = GLYPHS[id];
      expect(shapes.length, id).toBeGreaterThan(0);
      for (const s of shapes) {
        for (const pts of [s.outer, ...(s.holes ?? [])]) {
          expect(pts.length % 2, id).toBe(0);
          expect(pts.length, id).toBeGreaterThanOrEqual(6);
          for (const v of pts) {
            expect(v, id).toBeGreaterThanOrEqual(0);
            expect(v, id).toBeLessThanOrEqual(1);
          }
        }
      }
    }
    const kinds: JobKind[] = ['delivery', 'order', 'escape', 'trial', 'race', 'rage', 'mayhem', 'fare', 'duel'];
    // one pictogram per kind, none shared
    expect(new Set(kinds.map((k) => KIND_GLYPH[k])).size).toBe(kinds.length);
  });

  it('M8.7 3.2 colour says the state: open white with a dark rim, the goal cyan, closed grey; the way\'s goal ring is the goal, a chase closes them all', async () => {
    expect(SIGN_COLORS[SIGN_OPEN]).toMatchObject({ face: 0xf7f3ea, rim: 0x160e28, ring: 0xf7f3ea });
    expect(SIGN_COLORS[SIGN_GOAL]).toMatchObject({ face: 0xf7f3ea, rim: 0x2bd1ff, ring: 0x2bd1ff });
    expect(SIGN_COLORS[SIGN_CLOSED]).toMatchObject({ face: 0x8d8a96, ring: 0x8d8a96 });
    const sim = await createWorld(CITY);
    try {
      run(sim, 0.6);
      const signs = newSignList(64), rings = newRingList(64);
      collectSigns(sim, 0, null, always, signs, rings);
      const goal = sim.way!.goal;
      expect(goal.kind).toBe('take');
      const shown = sim.jobs.defs.filter((d) => d.kind !== 'fare' && sim.jobs.shown(d));
      expect(rings.count).toBe(shown.length);
      for (let i = 0; i < rings.count; i++) {
        const d = shown[i] as JobDef;
        expect(rings.state[i]).toBe(d.id === goal.id ? SIGN_GOAL : SIGN_OPEN);
        expect(signs.state[i]).toBe(rings.state[i]);
        expect(signs.glyph[i]).toBe(glyphOf(d));
      }
      expect([...rings.state.slice(0, rings.count)].filter((s) => s === SIGN_GOAL).length).toBe(1);
      sim.pursuit.force();
      collectSigns(sim, 0, null, always, signs, rings);
      expect([...rings.state.slice(0, rings.count)].every((s) => s === SIGN_CLOSED)).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.7 3.3 each goal wears its sign: a ring\'s on its pole, a door\'s house under BANK IT, the job\'s over its target, the key over the wanted car', async () => {
    const sim = await createWorld(CITY);
    try {
      run(sim, 0.6);
      const signs = newSignList(64), rings = newRingList(64);
      const goalSign = (): number => {
        for (let i = 0; i < signs.count; i++) if (signs.state[i] === SIGN_GOAL) return i;
        return -1;
      };
      collectSigns(sim, 0, null, always, signs, rings);
      let i = goalSign();
      expect(i).toBeGreaterThanOrEqual(0);
      expect(signs.pole[i]).toBe(1);
      // the bag worth banking: the house over the door the way leads to
      sim.run.bag = BALANCE.offer.doorThreshold + 1;
      run(sim, 0.1);
      expect(sim.way!.goal.kind).toBe('bank');
      collectSigns(sim, 0, null, always, signs, rings);
      i = goalSign();
      expect(signs.glyph[i]).toBe(glyphIndex('house'));
      const door = sim.run.dropOffs[sim.way!.goal.door]!.door;
      expect([signs.x[i], signs.z[i]]).toEqual([Math.fround(door.x), Math.fround(door.z)]);
      sim.run.bag = 0;
      // a delivery taken: its parcel over the drop-off, on a cyan ring
      const d = sim.jobs.defs.find((j) => j.kind === 'delivery') as JobDef;
      sim.city!.sync(d.x, d.z, true);
      sim.vehicle.teleport({ x: d.x, y: 0.8, z: d.z }, d.yaw);
      run(sim, 0.2);
      expect(sim.jobs.active).toBe(d.id);
      collectSigns(sim, 0, null, always, signs, rings);
      i = goalSign();
      expect(signs.glyph[i]).toBe(glyphIndex('parcel'));
      expect(signs.pole[i]).toBe(0);
      expect([signs.x[i], signs.z[i]]).toEqual([Math.fround(d.targetX), Math.fround(d.targetZ)]);
      expect(rings.count).toBe(1);
      expect(rings.state[0]).toBe(SIGN_GOAL);
    } finally { sim.dispose(); }
    const hunt = await createWorld({ ...CITY, traffic: 1 });
    try {
      const d = hunt.jobs.defs.find((j) => j.kind === 'order') as JobDef;
      hunt.city!.sync(d.x, d.z, true);
      hunt.vehicle.teleport({ x: d.x, y: 0.8, z: d.z }, d.yaw);
      expect(runUntil(hunt, 10, (s) => s.jobs.state === 'hunting' && s.jobs.wantedAgent >= 0)).toBeGreaterThan(0);
      const w = hunt.jobs.wantedAgent, traffic = hunt.traffic!;
      // the car brought within the sighting range: the key over it
      hunt.probe.x = (traffic.x[w] as number) + 20;
      hunt.probe.z = traffic.z[w] as number;
      const signs = newSignList(64), rings = newRingList(64);
      collectSigns(hunt, 0, null, (agent, out) => { out.x = traffic.x[agent] as number; out.z = traffic.z[agent] as number; return true; }, signs, rings);
      expect(signs.count).toBe(1);
      expect(signs.glyph[0]).toBe(glyphIndex('key'));
      expect(signs.state[0]).toBe(SIGN_GOAL);
      expect(rings.count).toBe(0);
    } finally { hunt.dispose(); }
  }, 60_000);

  it('M8.7 3.4 the line names the goal: the ring\'s kind and its pay, in English and in Polish; the badge draws its pictogram; the pay shows over the nearest open sign', async () => {
    const sim = await createWorld(CITY);
    try {
      run(sim, 0.6);
      const g = sim.way!.goal;
      const d = sim.jobs.defOf(g.id) as JobDef;
      setLang('en');
      const en = goalWords(sim, g);
      setLang('pl');
      const pl = goalWords(sim, g);
      const titles: Partial<Record<JobKind, [string, string]>> = {
        delivery: ['DELIVERY', 'DOSTAWA'], order: ['STEAL TO ORDER', 'KRADZIEŻ NA ZAMÓWIENIE'], escape: ['ESCAPE', 'UCIECZKA'],
        trial: ['TIME TRIAL', 'JAZDA NA CZAS'], race: ['STREET RACE', 'WYŚCIG ULICZNY'], rage: ['TAKEDOWN RAGE', 'SZAŁ ELIMINACJI'], mayhem: ['MAYHEM', 'ROZRÓBA'],
      };
      const want = titles[d.kind] as [string, string];
      expect(en.words).toBe(want[0]);
      expect(pl.words).toBe(want[1]);
      expect(en.extra).toBe(`+${Math.round(payOf(sim, d)).toLocaleString('en-US')}`);
      expect(pl.extra.startsWith('+')).toBe(true);
      const svg = badgeMarkup(glyphOf(d));
      expect(svg).toContain('<svg');
      expect(svg.split('<path').length - 1).toBe(GLYPHS[KIND_GLYPH[d.kind]].length);
      // the pay's sign: the nearest open one, not in a chase
      const near = paySign(sim, null);
      expect(near).not.toBeNull();
      sim.pursuit.force();
      expect(paySign(sim, null)).toBeNull();
    } finally { sim.dispose(); }
  }, 60_000);

  it('M8.7 3.5 no kind has a colour of its own left: no table in the markers or the maps, no rule in the stylesheet', () => {
    expect('KIND_COLORS' in MarkerViewModule).toBe(false);
    expect('JOB_COLORS' in Minimap).toBe(false);
    const css = readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');
    expect(css).not.toMatch(/data-ring=/);
    expect(css).not.toMatch(/\.is-(order|escape|duel|trial|race|zone) \.jobs__kind/);
    expect(css).not.toMatch(/jobs__card\[data-kind='(order|escape|duel|delivery)'\]/);
  });

  it('M8.7 4.2 a kind brought out has its NEW card: its name and what it asks (its badge is the sign to look for, M8.9 R5), in both languages', () => {
    setLang('en');
    expect(newCardWords('race')).toEqual({ title: 'NEW: STREET RACE', sub: 'FIRST TO THE FINISH · ANY ROUTE' });
    setLang('pl');
    const pl = newCardWords('race');
    expect(pl.title).toBe('NOWOŚĆ: WYŚCIG ULICZNY');
    expect(pl.sub).toBe('PIERWSZY NA METĘ · DOWOLNA TRASA');
    for (const kind of ['trial', 'rage', 'mayhem', 'escape', 'order'] as const) expect(newCardWords(kind).sub).not.toBe('');
  });
});

describe('signs that read (M8.9 slice 12)', () => {
  it('M8.9 12.1 a sign keeps 28 px at 720p to 150 m, in the HUD\'s scale, and is 1 where its face is larger', () => {
    for (const fovDeg of [55, 65, 75]) {
      const fov = (fovDeg * Math.PI) / 180;
      for (const height of [450, 720, 1080]) {
        const floor = SIGN_MIN.px * hudScale(height);
        for (let depth = 2; depth <= 150; depth += 2) {
          const natural = signShare(SIGN_SIZE, depth, fov) * height;
          const k = signScale(depth, fov, height);
          expect(natural * k, `${fovDeg}° ${height} px ${depth} m`).toBeGreaterThanOrEqual(floor - 1e-6);
          if (natural >= floor) expect(k).toBe(1);
          else expect(natural * k).toBeCloseTo(floor, 6);
        }
        // past 150 m it grows no more: it shrinks as the world does
        expect(signScale(300, fov, height)).toBe(signScale(150, fov, height));
      }
    }
    // the render's scale is the HUD's (ui/scale.ts)
    for (const h of [300, 450, 720, 900, 1080, 2160]) {
      expect(Math.min(SIGN_MIN.scaleMax, Math.max(SIGN_MIN.scaleMin, h / SIGN_MIN.base))).toBe(hudScale(h));
    }
    // behind the camera, nothing to grow
    expect(signScale(-5, 1, 720)).toBe(1);
  });

  it('M8.9 12.2 the goal\'s sign is a quarter larger than the others', () => {
    expect(SIGN_MIN.goal).toBe(1.25);
    const view = readFileSync(new URL('../../src/render/run/MarkerView.ts', import.meta.url), 'utf8');
    expect(view).toContain('signs.state[i] === SIGN_GOAL ? SIGN_MIN.goal : 1');
    // the pay sits over the face as drawn: over the goal's larger one, and over a grown one
    expect(signTopY(1, true)).toBeGreaterThan(signTopY(1, false));
    expect(signTopY(3, false)).toBeGreaterThan(signTopY(1, false));
  });
});
