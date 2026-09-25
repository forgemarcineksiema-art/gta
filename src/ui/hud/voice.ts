/**
 * One voice at a time (docs/DESIGN.md §17.3, M8.5 slice 2): where each event
 * speaks and what it says. The top centre carries only what changes what you
 * do (the stars' news, a warning, the police's description of your car, a
 * rival ready, the twins' new car); a pop carries what pays or counts outside
 * the combo; the combo's own tricks, the job's own results and the flavour the
 * world shows better speak nowhere. One event, one place, one text.
 *
 * Pure: the HUD asks `speak` once per event and draws what it says; `Pops`
 * is the side stack's model (two at most, the newest over the oldest's slot).
 */
import { BODY_WORDS, DISTRICTS, RIVALS, paintName, posterNumber, unpackDescriptor, type EventKind } from '../../sim';
import { fixed, paintedCar, t } from '../lang';

export type Where = 'top' | 'pop' | 'none';

/** Every event's one place (the type makes the table whole: a new kind must be given one). */
export const WHERE: Record<EventKind, Where> = {
  // the combo counts these, and shows them in its own corner
  nearMiss: 'none', nearMissOncoming: 'none', oncoming: 'none', smash: 'none',
  // the world says these: the walker's leap, the new car, the horn, the dents, the WRECKED card, the pancake
  nearMissPed: 'none', swap: 'none', honk: 'none', horn: 'none', hit: 'none', damage: 'none', wrecked: 'none', respawn: 'none',
  flatten: 'none',
  // the run's own screens and lines say these: the door, the card, the job line and its card, the wall, the bag
  door: 'none', banked: 'none', busted: 'none', coin: 'none', spill: 'none', roadblock: 'none',
  jobStart: 'none', jobDone: 'none', jobFailed: 'none', orderFound: 'none', purchase: 'none',
  // a duel's result is its job line (BEATEN +purse · THE CAR IS YOURS); flavour the screen tells better
  rivalBeaten: 'none', rivalSeen: 'none', damageNews: 'none',
  // what changes what you do: the top centre (a drive-through's service too, M8.10 slice 16)
  heatLevel: 'top', dispatch: 'top', rivalReady: 'top', twinSwap: 'top', service: 'top',
  // how a job is taken, while the sim says it teaches (M8.7 D8)
  ringPass: 'top',
  // what pays or counts outside the combo: a pop
  takedown: 'pop', takedownTraffic: 'pop', billboard: 'pop', escape: 'pop', camera: 'pop', jump: 'pop',
  dailyDone: 'pop', streak: 'pop', blown: 'pop', cache: 'pop', chase: 'pop', skill: 'pop', skillLost: 'pop',
  hunt: 'pop', hiddenCar: 'pop', breaker: 'pop',
};

/** What the HUD knows when it reads the frame's events: the hunts' counts after the finds, the cameras' limits. */
export interface VoiceContext {
  jumps: number;
  jumpsTotal: number;
  boards: number;
  boardsTotal: number;
  cachesTotal: number;
  /** The speed cameras' limits in km/h, by camera. */
  cameraLimits: readonly number[];
}

/** What a top line's lead means (M8.9 R1): the stars' news is trouble, the police radio the police, the rest ink. */
export type Tone = 'trouble' | 'police' | 'info';

/**
 * One event's words: where, the lead and its tone, the text, a pop's size, and whether it names money (`gain`: a pop in
 * yellow only when it pays, M8.9 R1).
 */
export interface Said {
  where: Where;
  lead: string;
  tone: Tone;
  text: string;
  big: boolean;
  gain: boolean;
}

export function newSaid(): Said {
  return { where: 'none', lead: '', tone: 'info', text: '', big: false, gain: false };
}

/** What the city sends from each level on: the stars lead it (DESIGN.md §17.4: heat is the stars, never LEVEL). */
export const STARS_NEWS: Readonly<Record<number, string>> = {
  1: 'COPS ON YOUR TAIL',
  2: 'FAST COP CARS ON THE ROAD',
  3: 'ROADBLOCKS UP',
  4: 'HEAVY SUVS ROLLING',
  5: 'THE CHIEF IS COMING',
};


/** The event's words into `out`, in the player's language (`lang.ts`); `out.where` is 'none' when it says nothing. */
export function speak(kind: EventKind, value: number, target: number, ctx: VoiceContext, out: Said): Said {
  out.where = WHERE[kind];
  out.lead = '';
  out.tone = 'info';
  out.text = '';
  out.big = false;
  // yellow is money (M8.9 R1): only a pop that names an amount is a gain
  out.gain = false;
  if (out.where === 'none') return out;
  switch (kind) {
    case 'heatLevel':
      out.lead = '★'.repeat(Math.max(0, Math.min(5, value)));
      out.tone = 'trouble';
      out.text = t(STARS_NEWS[value] ?? '');
      break;
    case 'dispatch':
      // the radio's codes: 1 a roadblock ahead, 3 the suspect's car, 4 the helicopter; 2 (a unit down) is flavour
      out.lead = t('DISPATCH');
      out.tone = 'police';
      if (value === 1) out.text = t('ROADBLOCK AHEAD');
      else if (value === 4) out.text = t('HELICOPTER ON YOU');
      else if (value === 3) {
        const d = unpackDescriptor(target);
        out.text = t('SUSPECT IN A {car}', { car: paintedCar(paintName(d.paint), BODY_WORDS[d.body]) });
      }
      break;
    case 'rivalReady': {
      const r = RIVALS[target];
      if (!r) break;
      const p = posterNumber(target);
      out.lead = p > 0 ? `#${p}` : t('BOARD');
      out.text = `${t(r.name)} ${t(r.call)} · ${t(r.turf === 'highway' ? 'THE HIGHWAY' : DISTRICTS.find((d) => d.id === r.turf)?.name ?? '')}`;
      break;
    }
    case 'twinSwap': {
      const d = unpackDescriptor(target);
      out.lead = t('RADIO');
      out.text = t('THE TWINS SWAPPED · NOW IN A {car}', { car: paintedCar(paintName(d.paint), BODY_WORDS[d.body]) });
      break;
    }
    case 'ringPass': out.lead = t('JOB'); out.text = t('SLOW DOWN IN THE RING'); break;
    case 'takedown': out.text = t('TAKEDOWN!'); out.big = true; break;
    case 'takedownTraffic': out.text = t('TAKEDOWN! INTO TRAFFIC!'); out.big = true; break;
    case 'billboard': out.text = ctx.boardsTotal > 0 ? t('BILLBOARD {n}/{of}', { n: ctx.boards, of: ctx.boardsTotal }) : t('BILLBOARD!'); break;
    case 'escape': out.text = t('COPS LOST YOU'); break;
    case 'camera': out.text = t('FLASHED {kmh} KM/H', { kmh: Math.round((ctx.cameraLimits[target] ?? 0) + value) }); break;
    case 'jump': out.text = t('STUNT! {s} S', { s: fixed(value, 1) }); out.big = true; break;
    case 'dailyDone': out.text = t('DAILY DONE +{cash}', { cash: value }); out.big = true; out.gain = true; break;
    case 'streak': out.text = t('DAY {day} STREAK +{cash}', { day: target, cash: value }); out.gain = true; break;
    case 'blown': out.text = t('COVER BLOWN'); break;
    case 'cache':
      out.text = value > 0 ? t('CACHE {n}/{of} +{cash}', { n: target, of: ctx.cachesTotal, cash: value }) : t('CACHE {n}/{of}', { n: target, of: ctx.cachesTotal });
      out.big = value > 0;
      out.gain = value > 0;
      break;
    case 'chase': out.text = t('CHASE +{cash}', { cash: value }); out.gain = true; break;
    case 'skill': out.text = t('COMBO +{cash}', { cash: value }); out.big = true; out.gain = true; break;
    case 'skillLost': out.text = t('COMBO LOST'); break;
    case 'hunt':
      if (target === 0) out.text = value > 0 ? t('ALL {n} JUMPS +{cash}', { n: ctx.jumpsTotal, cash: value }) : t('NEW JUMP {n}/{of}', { n: ctx.jumps, of: ctx.jumpsTotal });
      else out.text = t('ALL BILLBOARDS +{cash}', { cash: value });
      out.big = value > 0;
      out.gain = value > 0 || target !== 0;
      break;
    case 'hiddenCar': out.text = t('HIDDEN CAR FOUND · IN THE GARAGE NOW'); out.big = true; break;
    case 'breaker': out.text = t('PURSUIT BREAKER!'); break;
    // a drive-through (M8.10 slice 16): fuel, a repair, a new paint
    case 'service':
      out.lead = value === 0 ? t('FUEL') : value === 1 ? t('REPAIR SHOP') : t('PAINT SHOP');
      out.text = value === 0 ? t('BOOST FULL') : value === 1 ? t('REPAIRED') : t('NEW PAINT');
      break;
    default: break;
  }
  if (out.text === '') out.where = 'none';
  return out;
}

/**
 * What may hold the top centre beside the goal line (docs/M8.9_PLAN.md R5), in the order that goes first: the intro's
 * caption, the running job's card (and its result on the line), a warning (ROADBLOCK AHEAD, HELICOPTER), the stars'
 * news, the other news (the suspect's car, a rival ready, the twins), a teaching line, the chain's step card, a NEW card.
 */
export type TopKind = 'caption' | 'job' | 'warning' | 'stars' | 'news' | 'teach' | 'step' | 'new';
export const TOP_RANK: Readonly<Record<TopKind, number>> = { caption: 0, job: 1, warning: 2, stars: 3, news: 4, teach: 5, step: 6, new: 7 };

/** Seconds a waiting line may wait before it is dropped (a card waits for its turn). */
export const NEWS_WAIT = 4;

/** A top event's place in the order: the radio's roadblock and helicopter warn, the ring's rule teaches. */
export function topKind(kind: EventKind, value: number): TopKind {
  if (kind === 'heatLevel') return 'stars';
  if (kind === 'dispatch' && (value === 1 || value === 4)) return 'warning';
  if (kind === 'ringPass') return 'teach';
  return 'news';
}

/** Seconds a line stays up: the stars' news and a warning 2, the rest 3. */
export function topSeconds(kind: TopKind): number {
  return kind === 'stars' || kind === 'warning' ? 2 : 3;
}

/** One line or card waiting for the top, or on it. */
export interface TopEntry {
  kind: TopKind;
  lead: string;
  tone: Tone;
  text: string;
  /** Seconds it stays once up. */
  seconds: number;
  /** Seconds it has waited. */
  waited: number;
  /** A teaching line's bit (`TEACH`): the profile has learnt it once it shows. 0 for none. */
  bit: number;
  /** A card's subject: the chain's step, or the index of the kind a NEW card brings out. */
  ref: number;
}

/** What holds the top this frame besides the queue. */
export interface TopFrame {
  /** The intro's caption is up: it speaks alone, and what waits keeps its clock (the quiet moment comes). */
  caption: boolean;
  /** The running job's card is up, or its result on the line. */
  job: boolean;
  /** A job runs or shows its result: the chain's step and the NEW cards wait for it. */
  busy: boolean;
  /** The ticket fills, or the wall or the busted card has the screen: nothing speaks, a line cut short is dropped. */
  silent: boolean;
}

function isCard(kind: TopKind): boolean {
  return kind === 'step' || kind === 'new';
}

/**
 * One moment, one message (docs/M8.9_PLAN.md R5): the top centre holds the goal line and at most one more. The
 * caption and the running job's card take it when they come; the rest waits in `TOP_RANK`'s order, the oldest first
 * within a kind; a line that has waited `NEWS_WAIT` s is dropped, a card waits. Pure: the HUD draws `current`.
 */
export class TopVoice {
  readonly queue: TopEntry[] = [];
  /** The line or card on the top now (not the caption's or the job's, which are their own). */
  current: TopEntry | null = null;
  /** Bumps each time `current` changes: the drawers redraw on it. */
  serial = 0;
  /** Teaching bits shown since the app last took them into the profile. */
  shownBits = 0;
  private left = 0;
  private slot: TopKind | 'none' = 'none';

  /** The kind that has the top this frame ('none': only the goal line). */
  get showing(): TopKind | 'none' {
    return this.slot;
  }

  /** A line: the stars' news replaces one still waiting, the same line twice waits once. */
  line(kind: TopKind, lead: string, text: string, tone: Tone, seconds: number, bit = 0): void {
    for (let i = 0; i < this.queue.length; i++) {
      const e = this.queue[i] as TopEntry;
      if (e.kind === kind && (kind === 'stars' || e.text === text)) {
        e.lead = lead; e.text = text; e.tone = tone; e.seconds = seconds; e.waited = 0; e.bit = bit;
        return;
      }
    }
    if (this.current && this.current.kind === kind && this.current.text === text) return;
    this.queue.push({ kind, lead, tone, text, seconds, waited: 0, bit, ref: -1 });
  }

  /** A card: the chain's step (`ref` the step) or a kind brought out (`ref` its index); it waits for its turn. */
  card(kind: 'step' | 'new', ref: number, seconds: number): void {
    this.queue.push({ kind, lead: '', tone: 'info', text: '', seconds, waited: 0, bit: 0, ref });
  }

  /** Whether a teaching line with this bit waits or shows. */
  holds(bit: number): boolean {
    if (this.current && (this.current.bit & bit) !== 0) return true;
    for (const e of this.queue) if ((e.bit & bit) !== 0) return true;
    return false;
  }

  /** One frame: the top's owner, the queue's clocks, the next entry up. A quiet frame allocates nothing. */
  step(dt: number, f: TopFrame): TopKind | 'none' {
    // the waiting clocks run except under the intro's caption; a line past its wait goes, a card stays
    if (!f.caption) {
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const e = this.queue[i] as TopEntry;
        e.waited += dt;
        if (!isCard(e.kind) && e.waited >= NEWS_WAIT) this.queue.splice(i, 1);
      }
    }
    if (f.silent || f.caption || f.job) {
      const cur = this.current;
      if (cur) {
        // cut short: silence drops a line (it is stale by then), a card or a line under the caption or the job's card waits again
        if (!f.silent || isCard(cur.kind)) {
          cur.waited = 0;
          this.queue.unshift(cur);
        }
        this.current = null;
        this.serial++;
      }
      this.slot = f.silent ? 'none' : f.caption ? 'caption' : 'job';
      return this.slot;
    }
    if (this.current) {
      this.left -= dt;
      if (this.left > 0) {
        this.slot = this.current.kind;
        return this.slot;
      }
      this.current = null;
      this.serial++;
    }
    let best = -1;
    for (let i = 0; i < this.queue.length; i++) {
      const e = this.queue[i] as TopEntry;
      if (f.busy && isCard(e.kind)) continue;
      if (best < 0 || TOP_RANK[e.kind] < TOP_RANK[(this.queue[best] as TopEntry).kind]) best = i;
    }
    if (best >= 0) {
      const e = this.queue.splice(best, 1)[0] as TopEntry;
      this.current = e;
      this.left = e.seconds;
      this.serial++;
      this.shownBits |= e.bit;
    }
    this.slot = this.current ? this.current.kind : 'none';
    return this.slot;
  }
}

/**
 * Teaching at the moment (docs/M8.9_PLAN.md R5), once per profile each: the first bag, the first × that multiplies
 * it, the first chase. A bit each in the profile's `taught`; the line waits while its moment lasts.
 */
export const TEACH = {
  bag: { bit: 1, lead: 'BAG', text: 'BANK IT AT A GARAGE' },
  mult: { bit: 2, lead: '', text: 'THE STARS MULTIPLY THE BAG' },
  // the goal line says LOSE THEM already: the line says how (one answer per question)
  chase: { bit: 4, lead: '', text: 'GET OUT OF THEIR SIGHT' },
} as const;
export const TEACH_ALL = 7;
export const TEACH_LINES = [TEACH.bag, TEACH.mult, TEACH.chase] as const;

/** What a teaching moment reads. */
export interface TeachState {
  /** The intro teaches with its own captions. */
  intro: boolean;
  bag: number;
  multiplier: number;
  chased: boolean;
}

/** The teaching lines whose moment is now and which the profile has not learnt, as bits. */
export function teachNow(s: TeachState, taught: number): number {
  if (s.intro) return 0;
  let out = 0;
  if (s.bag > 0) out |= TEACH.bag.bit;
  if (s.bag > 0 && s.multiplier > 1) out |= TEACH.mult.bit;
  if (s.chased) out |= TEACH.chase.bit;
  return out & ~taught;
}

/** The side stack: two slots at most; a new pop takes the older one's slot, so a burst never reflows. */
export const POP_SLOTS = 2;
export const POP_SECONDS = 1.2;

export class Pops {
  readonly text: string[] = [];
  readonly left: number[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < POP_SLOTS; i++) {
      this.text.push('');
      this.left.push(0);
    }
  }

  /** The slot the new pop took. */
  push(text: string): number {
    const i = this.cursor % POP_SLOTS;
    this.cursor++;
    this.text[i] = text;
    this.left[i] = POP_SECONDS;
    return i;
  }

  /** One frame; returns a mask of the slots that went out on it. */
  step(dt: number): number {
    let out = 0;
    for (let i = 0; i < POP_SLOTS; i++) {
      const left = this.left[i] as number;
      if (left <= 0) continue;
      this.left[i] = left - dt;
      if (left - dt <= 0) out |= 1 << i;
    }
    return out;
  }

  /** Everything out at once (a door shut, a card up): returns the mask of the slots that were showing. */
  clear(): number {
    let out = 0;
    for (let i = 0; i < POP_SLOTS; i++) {
      if ((this.left[i] as number) > 0) out |= 1 << i;
      this.left[i] = 0;
    }
    return out;
  }

  /** The pops showing, newest first. */
  live(): string[] {
    const out: string[] = [];
    for (let k = 1; k <= POP_SLOTS; k++) {
      const i = (((this.cursor - k) % POP_SLOTS) + POP_SLOTS) % POP_SLOTS;
      if ((this.left[i] as number) > 0) out.push(this.text[i] as string);
    }
    return out;
  }
}
