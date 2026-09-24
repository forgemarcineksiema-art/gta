/**
 * What the door and the busted card say (docs/DESIGN.md §17.5, M8.5 slice 3):
 * one line of sums (the bag, what the stars made of it, what landed in the
 * bank), the next goal in one line, the run's counts. The bank itself is the
 * wall's footer; the best run is GOALS'; NEW BEST is a tag on the title. Pure:
 * `run.ts` and `garage.ts` draw what these build, in the player's language
 * (`lang.ts`, DESIGN.md §19).
 */
import { BALANCE } from '../sim/balance';
import { CHAIN_STEPS, RIVALS, STEP, chainStep, posterNumber, reqText, type RunCounts, type SimWorld } from '../sim';
import { num, t } from './lang';

export interface Line {
  label: string;
  value: string;
  strong: boolean;
}

/** The door's result, as `Run` keeps it. */
export interface DoorResult {
  lastBag: number;
  lastMultiplier: number;
  lastBanked: number;
  lastDoubled: boolean;
  lastFence: boolean;
}

/** The busted card's result. */
export interface CardResult {
  lastBag: number;
  lastFine: number;
  lastLawyer: boolean;
  bank: number;
}

/** The door: `BAG 32,500 ×2.6 … +84,500`, the double and the fence named in it; nothing when the bag was empty. */
export function doorLines(r: DoorResult): Line[] {
  if (r.lastBag <= 0) return [];
  const doubled = r.lastDoubled ? ` ${t('DOUBLED')}` : '';
  const fence = r.lastFence ? ` (${t('BAG BONUS')} +${num(BALANCE.prep.fenceBonus)})` : '';
  return [{ label: `${t('BAG {cash}', { cash: Math.round(r.lastBag) })}${doubled} ×${num(r.lastMultiplier)}${fence}`, value: `+${money(r.lastBanked)}`, strong: true }];
}

/** The card: the bag, what is kept of it, and the bank (the card has no footer). */
export function cardLines(r: CardResult): Line[] {
  const keep = t(r.lastLawyer ? 'THE LAWYER KEEPS 3/4' : 'YOU KEEP HALF');
  return [
    { label: `${t('BAG {cash}', { cash: Math.round(r.lastBag) })} · ${keep}`, value: `+${money(r.lastFine)}`, strong: true },
    { label: t('BANK'), value: money(r.bank), strong: false },
  ];
}

/**
 * The next goal in one line (DESIGN.md §13.4): the first new car while the chain's first three steps lead there,
 * then the chain's next step, then the first car again if it is still not bought, then the board's next rival.
 */
export function nextLine(sim: SimWorld): string {
  const run = sim.run;
  const step = chainStep(run.chain);
  const noCar = !sim.garage.owned.has('compact');
  const price = BALANCE.prices.compact;
  const firstCar = run.bank >= price ? t('FIRST NEW CAR: {price} · IT IS YOURS IN CARS', { price })
    : t('FIRST NEW CAR: {price} · YOU HAVE {bank}', { price, bank: Math.round(run.bank) });
  return step >= 0 && step <= STEP.car && noCar ? firstCar
    : step >= 0 ? t('NEXT: {step} · STEP {n} OF {of}', { step: t(CHAIN_STEPS[step] ?? ''), n: step + 1, of: CHAIN_STEPS.length })
      : noCar ? firstCar : boardLine(sim);
}

/** The run's story in one line; the street furniture's bill is the city's, never the player's money. */
export function countsLine(c: RunCounts): string {
  const damage = c.damage > 0 ? ` · ${held(t('CITY DAMAGE {cash}', { cash: Math.round(c.damage) }))}` : '';
  return `${held(t('{n} {n|TAKEDOWN|TAKEDOWNS}', { n: c.takedowns }))} · ${held(t('{n} {n|ESCAPE|ESCAPES}', { n: c.escapes }))} · `
    + `${held(t('{n} {n|BILLBOARD|BILLBOARDS}', { n: c.billboards }))} · ${held(t('{n} {n|COIN|COINS}', { n: c.coins }))}${damage}`;
}

/** After the chain (M6): the next rival on the wanted board and what they want first, or that they are ready. */
function boardLine(sim: SimWorld): string {
  const b = sim.board;
  const i = b.next();
  const r = RIVALS[i];
  if (!r) return '';
  const n = posterNumber(i);
  const who = n > 0 ? `#${n} ${t(r.name)}` : t(r.name);
  const open = r.reqs[b.firstOpen(i)];
  return b.ready(i) || !open ? t('NEXT ON THE BOARD: {who} · READY FOR YOU', { who }) : t('NEXT ON THE BOARD: {who} · {req}', { who, req: reqText(open, t) });
}

/** A count and its words held together (every space one that holds): the line may wrap only at the separators. */
function held(text: string): string {
  return text.replace(/ /g, '\u00a0');
}

export function money(v: number): string {
  return num(Math.round(v));
}
