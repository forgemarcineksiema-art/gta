/**
 * What the island puts in a driver's way for fun (M8.10 slice 15, docs/M8.10_PLAN.md §1.4): its twenty jumps, fifty
 * billboards and eight pursuit breakers. Where each stands is worked out before the lots are laid (`stuntSites`: the
 * lots, the props and the kerbside bays keep off them, their run-ups, run-outs, landings and falls), and what each is
 * once the places stand (`buildStunts`: the kickers' statics, the jumps the places built, everyone's height).
 */
import type { JumpDesc } from '../city/jumps';
import type { BillboardDesc } from '../city/collectibles';
import type { BreakerDesc } from '../city/breakers';
import type { StaticDesc } from '../scene';
import { billboardDescs, billboardKeep, billboardSites, gateBlocked, type BillboardSite } from './billboards';
import { breakerDescs, breakerKeep, breakerSites, type BreakerSite } from './breakers';
import type { Ground } from './ground';
import { freeKickers, islandJumps, kickerStatics, onKicker, type Kicker } from './jumps';
import type { Keep } from './keep';
import type { Place } from './places';
import type { CrownPlace } from './places/crown';
import { quayPlace } from './places/quay';
import { MEGA } from './places/airfield';
import { CAR_PARK } from './shapes/crown';
import { MARINA } from './shapes/quay';
import type { RoadSurfaces } from './surfaces';

export { inKeep, type Keep } from './keep';

/** A kicker's footprint, its run-up `before` m and its landing `after` m (past the lip) kept clear, `pad` m round it. */
export function kickerKeep(k: Kicker, before: number, after: number, pad: number): Keep {
  const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw), mid = (after - k.length - before) / 2;
  return { x: k.x + fx * mid, z: k.z + fz * mid, yaw: k.yaw, hx: k.half + pad, hz: (after + k.length + before) / 2 };
}

/** Where the slice's things stand, before the lots: what the lots, the props and the bays keep off. */
export interface StuntSites {
  kickers: Kicker[];
  breakers: BreakerSite[];
  /** The fifty in their ids' order: the verges', the streets', the landings'. */
  billboards: BillboardSite[];
  /** What the lots keep off: all of it. */
  keep: Keep[];
  /** What every prop keeps off (the jumps' ways, the breakers and their falls), and what a solid one does (the billboards' run-outs: a loose one is knocked aside). */
  props: Keep[];
  solid: Keep[];
}

/** The kickers' run-ups and landings the lots and the props keep off (m). */
const RUN_UP = 45;
const LANDING = 50;

/**
 * The lips of the big jumps the places build (their landings' billboards): the piers' gap (its middle, toward the east
 * boardwalk), the car park's roof, the mega-ramp; the places' own numbers (the places stand only after the lots).
 */
function placeLips(): Map<number, { x: number; z: number; yaw: number }> {
  return new Map([
    [11, { x: -(MARINA.gap.x0 + MARINA.gap.x1) / 2, z: -MARINA.walk.z, yaw: -Math.PI / 2 }],
    [15, { x: CAR_PARK.lanes[1], z: CAR_PARK.z0, yaw: Math.PI }],
    [16, { x: MEGA.x, z: MEGA.z, yaw: MEGA.yaw }],
  ]);
}

export function stuntSites(ground: Ground, surfaces: RoadSurfaces, kerbside: readonly Kicker[], gates: readonly BillboardSite[]): StuntSites {
  const kickers = [...kerbside, ...freeKickers()].sort((a, b) => a.jump - b.jump);
  const jumpKeep = kickers.map((k) => kickerKeep(k, RUN_UP, LANDING, 1));
  const breakers = breakerSites(ground, surfaces, jumpKeep);
  const fallKeep = breakers.map(breakerKeep);
  const lips = placeLips();
  for (const k of kickers) lips.set(k.jump, k);
  const billboards = billboardSites(ground, surfaces, gates, lips, [...jumpKeep, ...fallKeep]);
  const runOuts = billboards.map(billboardKeep);
  return { kickers, breakers, billboards, keep: [...jumpKeep, ...fallKeep, ...runOuts], props: [...jumpKeep, ...fallKeep], solid: runOuts };
}

/** Whether a kerbside bay would stand in a kerbside kicker's or gate's way. */
export function kerbsideBlocked(kickers: readonly Kicker[], gates: readonly BillboardSite[], x: number, z: number): boolean {
  return kickers.some((k) => onKicker(k, x, z, 3)) || gateBlocked(gates, x, z);
}

/** What the slice built once the places stand. */
export interface Stunts {
  jumps: JumpDesc[];
  billboards: BillboardDesc[];
  breakers: BreakerDesc[];
}

/**
 * The kickers' statics (into `statics`), the twenty jumps, and the fifty billboards and eight breakers at their heights:
 * `standAt` a pavement's top (or the ground past it); a landing's on its roof or boardwalk.
 */
export function buildStunts(ground: Ground, places: readonly Place[], sites: StuntSites, statics: (x: number, z: number) => StaticDesc[], standAt: (x: number, z: number) => number): Stunts {
  for (const k of sites.kickers) statics(k.x, k.z).push(...kickerStatics(k, ground));
  const crown = places.find((p) => p.id === 'crown') as CrownPlace | undefined, quay = quayPlace(places);
  const billboards = billboardDescs(sites.billboards, (b) => {
    if (b.jump === 15 && crown) return crown.landingRoof;
    if (b.jump === 11 && quay) return quay.gap.y;
    // the lower of its two posts' feet: a panel on a slope stands its high post a hand into the ground
    const ax = Math.cos(b.yaw), az = -Math.sin(b.yaw), h = b.width / 2 - 0.5;
    const at = b.kind === 'street' ? standAt : (x: number, z: number): number => ground.surfaceHeight(x, z);
    return Math.min(at(b.x + ax * h, b.z + az * h), at(b.x - ax * h, b.z - az * h));
  });
  const breakers = breakerDescs(sites.breakers, (b) => (b.paved ? standAt(b.x, b.z) : ground.surfaceHeight(b.x, b.z)));
  return { jumps: islandJumps(ground, places, sites.kickers), billboards, breakers };
}
