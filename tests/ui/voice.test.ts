/**
 * One voice at a time (M8.5 slice 2, docs/DESIGN.md §17.3): every event
 * speaks in one place with one text, the combo's tricks never pop, two pops
 * at most, the flavour lines speak nowhere, and nothing speaks at the top
 * over the wall or the busted card. One moment, one message (M8.9 slice 9,
 * docs/M8.9_PLAN.md R5): the goal line and one more, in an order; a line that
 * waited 4 s goes, a card waits; no step or NEW card over a job; the ticket
 * speaks alone; the teaching lines once per profile; a card's one line.
 */
import { describe, expect, it } from 'vitest';
import { CHAIN_STEPS, PALETTE, RIVALS, packDescriptor, type EventKind, type JobDef } from '../../src/sim';
import { defaultSave, parse, serialize } from '../../src/sim/save/format';
import { DRIVE, drive, newDriveState, newPlaceClock, promptPlace, screenTaken, tickPlace } from '../../src/ui/hud/corners';
import { CARD_LINE_MAX, KIND_TITLE, jobCardLine, newCardWords } from '../../src/ui/hud/jobs';
import { setLang, t } from '../../src/ui/lang';
import {
  NEWS_WAIT, POP_SECONDS, POP_SLOTS, Pops, TEACH, TEACH_LINES, TopVoice, WHERE, newSaid, speak, teachNow, topKind, type TopFrame, type TopKind,
  type VoiceContext,
} from '../../src/ui/hud/voice';

const CTX: VoiceContext = { jumps: 4, jumpsTotal: 20, boards: 13, boardsTotal: 50, cachesTotal: 30, cameraLimits: [50, 80] };
const SUSPECT = packDescriptor('muscle', PALETTE.carRed);

describe('one voice', () => {
  it('M8.5 2.1 every event speaks in its one place with one text; the combo\'s tricks never pop; the stars lead their news', () => {
    const kinds = Object.keys(WHERE) as EventKind[];
    expect(kinds.length).toBeGreaterThan(40);
    const out = newSaid();
    for (const kind of kinds) {
      const target = kind === 'rivalReady' ? 0 : kind === 'twinSwap' || kind === 'dispatch' ? SUSPECT : 1;
      for (const value of [0, 1, 3, 1200]) {
        speak(kind, value, target, CTX, out);
        // the table's place, or nowhere when there is nothing to say (the radio's unit down)
        expect([WHERE[kind], 'none']).toContain(out.where);
        if (out.where !== 'none') expect(out.text).not.toBe('');
        if (out.where === 'top') expect(out.lead).not.toBe('');
      }
    }
    for (const trick of ['nearMiss', 'nearMissOncoming', 'oncoming', 'smash'] as const) expect(WHERE[trick]).toBe('none');
    const news = speak('heatLevel', 3, -1, CTX, out);
    expect(news.lead).toBe('★★★');
    expect(`${news.lead} ${news.text}`).not.toMatch(/LEVEL|HEAT/);
    expect(speak('billboard', 0, 7, CTX, out).text).toBe('BILLBOARD 13/50');
    expect(speak('hunt', 0, 0, CTX, out).text).toBe('NEW JUMP 4/20');
    expect(speak('skill', 2100, 4, CTX, out).text).toBe('COMBO +2,100');
    expect(speak('rivalReady', 0, 0, CTX, out).text).toContain(RIVALS[0]!.name);
  });

  it('M8.5 2.2 two pops at most: a burst of five leaves the newest two, and they go out after their time', () => {
    const pops = new Pops();
    expect(POP_SLOTS).toBe(2);
    for (const t of ['A', 'B', 'C', 'D', 'E']) pops.push(t);
    expect(pops.live()).toEqual(['E', 'D']);
    expect(pops.step(POP_SECONDS / 2)).toBe(0);
    expect(pops.live()).toEqual(['E', 'D']);
    expect(pops.step(POP_SECONDS)).toBe(0b11);
    expect(pops.live()).toEqual([]);
    pops.push('F');
    expect(pops.clear()).not.toBe(0);
    expect(pops.live()).toEqual([]);
  });

  it('M8.5 2.3 the flavour lines speak nowhere; over the wall and the busted card the top shows no news and no hints', () => {
    const out = newSaid();
    for (const kind of ['rivalSeen', 'rivalBeaten', 'damageNews', 'nearMissPed', 'swap'] as const) {
      expect(speak(kind, 50000, 1, CTX, out).where).toBe('none');
    }
    // the radio: a unit down is flavour; the roadblock, the suspect's car and the helicopter speak
    expect(speak('dispatch', 2, -1, CTX, out).where).toBe('none');
    expect(speak('dispatch', 1, -1, CTX, out).text).toBe('ROADBLOCK AHEAD');
    expect(speak('dispatch', 3, SUSPECT, CTX, out).text).toMatch(/^SUSPECT IN A /);
    expect(speak('dispatch', 4, -1, CTX, out).text).toBe('HELICOPTER ON YOU');
    // over the wall and the busted card the voice is silent (the app's `silent`): the line waiting there shows nothing
    for (const run of ['busted', 'door'] as const) {
      expect(screenTaken(run)).toBe(true);
      const v = new TopVoice();
      v.line('stars', '★★', 'ROADBLOCKS UP', 'trouble', 2);
      expect(frames(v, 1, { ...FREE, silent: screenTaken(run) })).toEqual(['none']);
    }
    for (const run of ['running', 'closing'] as const) expect(screenTaken(run)).toBe(false);
  });
});

const FREE: TopFrame = { caption: false, job: false, busy: false, silent: false };
const DT = 1 / 60;

/** Steps the voice `seconds` at 60 Hz under `f`; returns each kind that came up, in order (runs collapsed). */
function frames(v: TopVoice, seconds: number, f: TopFrame = FREE): Array<TopKind | 'none'> {
  const out: Array<TopKind | 'none'> = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const k = v.step(DT, f);
    if (out[out.length - 1] !== k) out.push(k);
  }
  return out;
}

describe('one moment, one message (M8.9 slice 9)', () => {
  it('M8.9 9.1 never two besides the line: the caption, the job\'s card, then the lines and cards in their order; a line that waited 4 s goes', () => {
    // one each, pushed in the wrong order in one frame: they come up one at a time in the order, every line in time
    const v = new TopVoice();
    v.card('new', 3, 3);
    v.card('step', 0, 2.5);
    v.line('teach', '', 'THE STARS MULTIPLY THE BAG', 'info', 0.9);
    v.line('news', 'RADIO', 'THE TWINS SWAPPED', 'info', 0.9);
    v.line('stars', '★★', 'FAST COP CARS ON THE ROAD', 'trouble', 0.9);
    v.line('warning', 'DISPATCH', 'ROADBLOCK AHEAD', 'police', 0.9);
    expect(frames(v, 12)).toEqual(['warning', 'stars', 'news', 'teach', 'step', 'new', 'none']);
    // the event's place in that order: the radio's roadblock and helicopter warn, the stars' news, the ring's rule teaches
    expect([topKind('dispatch', 1), topKind('dispatch', 4), topKind('dispatch', 3), topKind('heatLevel', 2), topKind('ringPass', 0), topKind('rivalReady', 0)])
      .toEqual(['warning', 'warning', 'news', 'stars', 'teach', 'news']);
    // the caption and the job's card take the top: what waits under them waits; a line past its 4 s under the job goes,
    // under the caption its clock stops (the intro's quiet moment comes), a card always waits
    const w = new TopVoice();
    w.line('stars', '★', 'COPS ON YOUR TAIL', 'trouble', 2);
    w.card('step', 1, 2.5);
    expect(frames(w, NEWS_WAIT + 0.5, { ...FREE, caption: true })).toEqual(['caption']);
    expect(frames(w, NEWS_WAIT + 0.5, { ...FREE, job: true })).toEqual(['job']);
    expect(frames(w, 6)).toEqual(['step', 'none']);
    // a line cut by the job's card goes back to wait, and shows after it
    const x = new TopVoice();
    x.line('warning', 'DISPATCH', 'HELICOPTER ON YOU', 'police', 2);
    expect(frames(x, 0.5)).toEqual(['warning']);
    expect(frames(x, 1, { ...FREE, job: true })).toEqual(['job']);
    expect(frames(x, 3)).toEqual(['warning', 'none']);
    // the stars' news: a newer level replaces the one still waiting; one line up at a time, however many are pushed
    const y = new TopVoice();
    y.line('news', 'RADIO', 'A', 'info', 3);
    y.step(DT, FREE);
    y.line('stars', '★★', 'FAST COP CARS ON THE ROAD', 'trouble', 2);
    y.line('stars', '★★★', 'ROADBLOCKS UP', 'trouble', 2);
    expect(y.queue.filter((e) => e.kind === 'stars').map((e) => e.lead)).toEqual(['★★★']);
    // the intro: the district's name waits under the caption and shows for its seconds after it
    const c = newPlaceClock();
    const s = { ...newDriveState(), city: true, caption: true };
    for (let i = 0; i < 600; i++) s.placeAge = tickPlace(c, 'crown', 'running', DT, true);
    expect(drive(s) & DRIVE.place).toBe(0);
    s.caption = false;
    s.placeAge = tickPlace(c, 'crown', 'running', DT, false);
    expect(drive(s) & DRIVE.place).not.toBe(0);
  });

  it('M8.9 9.2 while a job runs or shows its result no step or NEW card; after it they come in order, the step first', () => {
    const v = new TopVoice();
    v.card('step', 0, 2.5);
    v.card('new', 1, 3);
    v.card('new', 2, 3);
    // a line still speaks during the job; the cards wait, however long the job
    v.line('stars', '★', 'COPS ON YOUR TAIL', 'trouble', 2);
    const during = frames(v, 60, { ...FREE, busy: true });
    expect(during).toEqual(['stars', 'none']);
    expect(v.queue.map((e) => `${e.kind}${e.ref}`)).toEqual(['step0', 'new1', 'new2']);
    expect(frames(v, 10)).toEqual(['step', 'new', 'none']);
    // the two NEW cards were two (the second came up after the first's seconds)
    const w = new TopVoice();
    w.card('new', 1, 3);
    w.card('new', 2, 3);
    const refs: number[] = [];
    let serial = w.serial;
    for (let i = 0; i < 600; i++) {
      w.step(DT, FREE);
      if (w.serial !== serial && w.current) refs.push(w.current.ref);
      serial = w.serial;
    }
    expect(refs).toEqual([1, 2]);
  });

  it('M8.9 9.3 while the ticket fills only the ticket and its prompt speak: no line, no card, the prompt on the ticket', () => {
    const v = new TopVoice();
    v.line('news', 'RADIO', 'A', 'info', 3);
    expect(frames(v, 0.5)).toEqual(['news']);
    // the ticket: the line up is dropped, a card waits, nothing comes up
    v.card('step', 2, 2.5);
    v.line('stars', '★★', 'FAST COP CARS ON THE ROAD', 'trouble', 2);
    expect(frames(v, NEWS_WAIT + 1, { ...FREE, silent: true })).toEqual(['none']);
    // after it the card still comes; the lines went (stale)
    expect(frames(v, 4)).toEqual(['step', 'none']);
    // the swap prompt: at the bottom while driving, on the ticket while it fills, nowhere under the intro's own swap caption
    expect(promptPlace(true, false, false)).toBe('bottom');
    expect(promptPlace(true, true, false)).toBe('ticket');
    expect(promptPlace(false, true, false)).toBe('none');
    expect(promptPlace(true, true, true)).toBe('none');
  });

  it('M8.9 9.5 each teaching line once per profile, across a save\'s round trip', () => {
    const at = { intro: false, bag: 0, multiplier: 1, chased: false };
    expect(teachNow(at, 0)).toBe(0);
    expect(teachNow({ ...at, bag: 500 }, 0)).toBe(TEACH.bag.bit);
    expect(teachNow({ ...at, bag: 500, multiplier: 1.3 }, 0)).toBe(TEACH.bag.bit | TEACH.mult.bit);
    expect(teachNow({ ...at, chased: true }, 0)).toBe(TEACH.chase.bit);
    // the intro teaches with its own captions
    expect(teachNow({ ...at, intro: true, bag: 500, multiplier: 1.3, chased: true }, 0)).toBe(0);
    // shown: learnt (the voice says which bits showed; the app sets them on the profile)
    const v = new TopVoice();
    for (const line of TEACH_LINES) v.line('teach', line.lead, line.text, 'info', 1, line.bit);
    frames(v, 5);
    expect(v.shownBits).toBe(TEACH.bag.bit | TEACH.mult.bit | TEACH.chase.bit);
    expect(teachNow({ ...at, bag: 500, multiplier: 1.3, chased: true }, v.shownBits)).toBe(0);
    // the profile keeps them, and the sessions, through a save (the world's side: save.test.ts 0.5 / 0.6)
    const doc = defaultSave();
    doc.taught = v.shownBits;
    doc.sessions = 2;
    const back = parse(serialize(doc));
    expect([back.taught, back.sessions]).toEqual([v.shownBits, 2]);
    // a save from before them: a profile that has played has learnt them and is past its first two sessions
    const old = JSON.parse(serialize(doc)) as Record<string, unknown>;
    delete old['taught'];
    delete old['sessions'];
    expect([parse(JSON.stringify({ ...old, runs: 12 })).taught, parse(JSON.stringify({ ...old, runs: 12 })).sessions]).toEqual([255, 2]);
    expect([parse(JSON.stringify({ ...old, runs: 0 })).taught, parse(JSON.stringify({ ...old, runs: 0 })).sessions]).toEqual([0, 0]);
  });

  it('M8.9 9.6 every card\'s line is at most 34 characters, in both languages', () => {
    const kinds = Object.keys(KIND_TITLE) as JobDef['kind'][];
    const lines = (): string[] => {
      const out: string[] = [];
      for (const kind of kinds) {
        for (const level of kind === 'duel' ? RIVALS.map((_, i) => i) : [3]) {
          for (const first of [false, true]) {
            for (const hot of [false, true]) out.push(jobCardLine({ kind, level, limitSeconds: 599 }, first, hot));
          }
        }
        out.push(newCardWords(kind).sub);
      }
      for (const step of CHAIN_STEPS) out.push(t(step));
      for (const line of TEACH_LINES) out.push(line.lead === '' ? t(line.text) : `${t(line.lead)} ${t(line.text)}`);
      return out;
    };
    try {
      for (const lang of ['en', 'pl'] as const) {
        setLang(lang);
        const long = lines().filter((l) => l.length > CARD_LINE_MAX);
        expect(long, lang).toEqual([]);
        expect(lines().every((l) => l.length > 0), lang).toBe(true);
      }
    } finally {
      setLang('en');
    }
  });
});
