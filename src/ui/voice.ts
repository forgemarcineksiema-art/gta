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
import { BODY_WORDS, DISTRICTS, RIVALS, paintName, posterNumber, unpackDescriptor, type EventKind } from '../sim';

export type Where = 'top' | 'pop' | 'none';

/** Every event's one place (the type makes the table whole: a new kind must be given one). */
export const WHERE: Record<EventKind, Where> = {
  // the combo counts these, and shows them in its own corner
  nearMiss: 'none', nearMissOncoming: 'none', oncoming: 'none', smash: 'none',
  // the world says these: the walker's leap, the new car, the horn, the dents, the WRECKED card
  nearMissPed: 'none', swap: 'none', honk: 'none', horn: 'none', hit: 'none', damage: 'none', wrecked: 'none', respawn: 'none',
  // the run's own screens and lines say these: the door, the card, the job line and its card, the wall, the bag
  door: 'none', banked: 'none', busted: 'none', coin: 'none', spill: 'none', roadblock: 'none',
  jobStart: 'none', jobDone: 'none', jobFailed: 'none', orderFound: 'none', purchase: 'none',
  // a duel's result is its job line (BEATEN +purse · THE CAR IS YOURS); flavour the screen tells better
  rivalBeaten: 'none', rivalSeen: 'none', damageNews: 'none',
  // what changes what you do: the top centre
  heatLevel: 'top', dispatch: 'top', rivalReady: 'top', twinSwap: 'top',
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

/** One event's words: where, the lead (the top's red word), the text, and a pop's size and colour. */
export interface Said {
  where: Where;
  lead: string;
  text: string;
  big: boolean;
  gain: boolean;
}

export function newSaid(): Said {
  return { where: 'none', lead: '', text: '', big: false, gain: false };
}

/** What the city sends from each level on: the stars lead it (DESIGN.md §17.4: heat is the stars, never LEVEL). */
export const STARS_NEWS: Readonly<Record<number, string>> = {
  1: 'COPS ON YOUR TAIL',
  2: 'FAST COP CARS ON THE ROAD',
  3: 'ROADBLOCKS UP',
  4: 'HEAVY SUVS ROLLING',
  5: 'THE CHIEF IS COMING',
};


/** The event's words into `out`; `out.where` is 'none' when it says nothing. */
export function speak(kind: EventKind, value: number, target: number, ctx: VoiceContext, out: Said): Said {
  out.where = WHERE[kind];
  out.lead = '';
  out.text = '';
  out.big = false;
  out.gain = value > 0;
  if (out.where === 'none') return out;
  const n = (v: number): string => v.toLocaleString('en-US');
  switch (kind) {
    case 'heatLevel':
      out.lead = '★'.repeat(Math.max(0, Math.min(5, value)));
      out.text = STARS_NEWS[value] ?? '';
      break;
    case 'dispatch':
      // the radio's codes: 1 a roadblock ahead, 3 the suspect's car, 4 the helicopter; 2 (a unit down) is flavour
      out.lead = 'DISPATCH';
      if (value === 1) out.text = 'ROADBLOCK AHEAD';
      else if (value === 4) out.text = 'HELICOPTER ON YOU';
      else if (value === 3) {
        const d = unpackDescriptor(target);
        out.text = `SUSPECT IN A ${paintName(d.paint)} ${BODY_WORDS[d.body]}`;
      }
      break;
    case 'rivalReady': {
      const r = RIVALS[target];
      if (!r) break;
      const p = posterNumber(target);
      out.lead = p > 0 ? `#${p}` : 'BOARD';
      out.text = `${r.name} ${r.call} · ${r.turf === 'highway' ? 'THE HIGHWAY' : DISTRICTS.find((d) => d.id === r.turf)?.name ?? ''}`;
      break;
    }
    case 'twinSwap': {
      const d = unpackDescriptor(target);
      out.lead = 'RADIO';
      out.text = `THE TWINS SWAPPED · NOW IN A ${paintName(d.paint)} ${BODY_WORDS[d.body]}`;
      break;
    }
    case 'takedown': out.text = 'TAKEDOWN!'; out.big = true; break;
    case 'takedownTraffic': out.text = 'TAKEDOWN! INTO TRAFFIC!'; out.big = true; break;
    case 'billboard': out.text = ctx.boardsTotal > 0 ? `BILLBOARD ${ctx.boards}/${ctx.boardsTotal}` : 'BILLBOARD!'; break;
    case 'escape': out.text = 'COPS LOST YOU'; break;
    case 'camera': out.text = `FLASHED ${Math.round((ctx.cameraLimits[target] ?? 0) + value)} KM/H`; break;
    case 'jump': out.text = `STUNT! ${value.toFixed(1)} S`; out.big = true; break;
    case 'dailyDone': out.text = `DAILY DONE +${n(value)}`; out.big = true; break;
    case 'streak': out.text = `DAY ${target} STREAK +${n(value)}`; break;
    case 'blown': out.text = 'COVER BLOWN'; break;
    case 'cache':
      out.text = value > 0 ? `CACHE ${target}/${ctx.cachesTotal} +${n(value)}` : `CACHE ${target}/${ctx.cachesTotal}`;
      out.big = value > 0;
      break;
    case 'chase': out.text = `CHASE +${n(value)}`; break;
    case 'skill': out.text = `COMBO +${n(value)}`; out.big = true; break;
    case 'skillLost': out.text = 'COMBO LOST'; out.gain = false; break;
    case 'hunt':
      if (target === 0) out.text = value > 0 ? `ALL ${ctx.jumpsTotal} JUMPS +${n(value)}` : `NEW JUMP ${ctx.jumps}/${ctx.jumpsTotal}`;
      else out.text = `ALL BILLBOARDS +${n(value)}`;
      out.big = value > 0;
      break;
    case 'hiddenCar': out.text = 'HIDDEN CAR FOUND · IN THE GARAGE NOW'; out.big = true; break;
    case 'breaker': out.text = 'PURSUIT BREAKER!'; break;
    default: break;
  }
  if (out.text === '') out.where = 'none';
  return out;
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
