/**
 * Coins on the road (docs/DESIGN.md §3.2 and §3.5): the twelve-year-old's
 * reward layer, laid as lines that say something. A line starts, has a shape
 * and ends on a bigger coin (the cap) at the thing it pointed at: the exit of
 * a junction turn, the far end of a swerve onto the oncoming lane, a billboard
 * gate, the landing past a ramp, the inside of a bend. Never a carpet: a road
 * carries one figure, and every figure comes from the city seed, so the layout
 * is the same for every player and a time trial on a coin line is a route.
 *
 * The layout is computed once per city (`layoutCoins`: the trails, the
 * fillers, the sweeps and the ramp arcs); each chunk takes the coins inside
 * it plus the gate line through each of its billboards (`placeCoins`, which
 * needs the panel the placer chose against the chunk's statics; the layout
 * keeps every lane's gate window clear for it). Picked by a box round the
 * chassis with a reach, so the catch reads as a magnet in the view; coins in
 * the air need the car in the air. Always the player's, never at risk. The
 * spill (§2.2) lays part of the bag on the lane ahead of a wreck as a
 * short-lived pool of bigger coins that pay back into the bag.
 *
 * No allocation per step: the picked set and the spill pool are typed arrays.
 */
import { BALANCE } from '../balance';
import type { EventLog } from '../events';
import { mulberry32 } from '../random';
import type { PlayerProbe } from '../traffic/Traffic';
import type { LanePose, LaneProjection, LaneTables } from '../traffic/lanes';
import type { City } from './City';
import { BILLBOARD_WIDTH, type BillboardDesc } from './collectibles';
import { rampProfile, type JumpDesc } from './jumps';
import { alongLane, laneAt, laneLength, type Pt } from './route';
import { BLOCK, LANE_INSET, type Lane, type RoadGraph } from './roads';

export interface CoinDesc {
  /** Stable: chunk index × COINS_PER_CHUNK_MAX + slot; run-time coins from EXTRA_COIN_BASE. */
  id: number;
  x: number;
  /** The centre's height: COIN_HEIGHT over the road, higher in a ramp's arc. */
  y: number;
  z: number;
  /** The lane it was laid from; -1 for a gate line or a ramp arc, -2 for a junction curve, -3 for a run-time coin. */
  lane: number;
  /** `BALANCE.coin.value`, or `cap` for the bigger coin a line ends on. */
  value: number;
  /** Index along its line: the view spins the line as a ripple running away from the player. */
  phase: number;
}

export type CoinPoint = Omit<CoinDesc, 'id'>;

export const COINS_PER_CHUNK_MAX = 256;
const CHUNKS = 49;
/** Coins laid at run time (the cold open's route line) take ids after every chunk's. */
export const EXTRA_COIN_BASE = CHUNKS * COINS_PER_CHUNK_MAX;
export const EXTRA_COINS_MAX = 512;
/** A coin's centre hovers this high over the road: bonnet height, half a metre of air under it. */
export const COIN_HEIGHT = 1.0;
/** A lane's own figure lies between these (m from its start and its end); a link's head and tail lie outside them. */
const LANE_HEAD = 25;
const LANE_TAIL = 35;
/** A link's coins on the lane it leaves and on the lane it enters, m. */
const LINK_TAIL = 18;
const LINK_HEAD = 13.5;
/** The gate line: on the lane this far before the panel and back on it this far after; the window keeps 2 m more. */
const GATE_LEAD = 45;
const GATE_EXIT = 22;
/** The footway gate's candidate slots lie 93 m from the low junction (collectibles.ts). */
const GATE_ALONG = 93;
/** The verge hook turns off the outer lane on this radius (m): a drift at speed, a firm turn at 50 km/h. */
const HOOK_RADIUS = 30;
/** The hook's lead-in on the lane, and the coins it drops past the panel into the run-out. */
const HOOK_LEAD = 18;
const HOOK_PAST = 2;
/** The hook's window on the outer lane: the verge slots lie 35–85 m along it. */
const HOOK_WINDOW_END = 100;
/**
 * The gate line swerves out from `-rise` to `-hold` before the panel, holds
 * to `+hold`, and eases back by `+GATE_EXIT`: the placer keeps the run-out
 * clear 10 m either side of the panel, and a street tree stands 13 m past it.
 */
const GATE_RISE = 28;
const GATE_HOLD_IN = 8;
const GATE_HOLD_OUT = 4;
/** The turn curve's handles: this share of the gap between the lane's end and the next's start, capped (m). */
const HANDLE_RATIO = 0.42;
const HANDLE_MAX = 24;
const CURVE_SAMPLES = 24;
/** Two coins of one line never come closer than this (m): a tight curve's samples are thinned. */
const MIN_SPACING = 2.5;
const TURN_RAD = 15 * Math.PI / 180;
/** A lane whose heading changes by more than this end to end gets sweeps, not runs. */
const CURVED_RAD = 0.3;
/** The sweep's cut: metres of lateral per unit of curvature, capped at the oncoming lane (left) or the kerb (right). */
const SWEEP_GAIN = 2500;
const SWEEP_LEFT_MAX = 9;
const SWEEP_KERB = 1.5;

function chunkOf(v: number): number {
  return Math.max(-3, Math.min(3, Math.floor((v + BLOCK / 2) / BLOCK)));
}

function smooth(t: number): number {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

/** A swerve's profile over a line: nothing for the first tenth, out over a quarter, held, back over the last quarter. */
function bump(t: number): number {
  return smooth((t - 0.1) / 0.25) * (1 - smooth((t - 0.65) / 0.25));
}

/** Points along a polyline at the distances `at`, in order. */
function samplePolyline(points: readonly Pt[], at: readonly number[], out: Pt[]): void {
  let seg = 0, travelled = 0;
  for (const s of at) {
    while (seg + 1 < points.length) {
      const a = points[seg] as Pt, b = points[seg + 1] as Pt;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (s <= travelled + len || seg + 2 === points.length) {
        const t = len > 0 ? Math.max(0, Math.min(1, (s - travelled) / len)) : 0;
        out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
        break;
      }
      travelled += len;
      seg++;
    }
  }
}

function polylineLength(points: readonly Pt[]): number {
  let len = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Pt, b = points[i + 1] as Pt;
    len += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return len;
}

/**
 * The curve from a lane's end to the next lane's start, as the traffic drives
 * it: a cubic with handles proportional to the gap, so the ring's inner
 * corners (a 16 m gap) do not loop.
 */
function turnCurve(lane: Lane, next: Lane, out: Pt[]): void {
  const gap = Math.hypot(next.x0 - lane.x1, next.z0 - lane.z1);
  const handle = Math.min(HANDLE_MAX, gap * HANDLE_RATIO);
  const cx0 = lane.x1 + Math.sin(lane.yaw) * handle, cz0 = lane.z1 + Math.cos(lane.yaw) * handle;
  const cx1 = next.x0 - Math.sin(next.yaw0) * handle, cz1 = next.z0 - Math.cos(next.yaw0) * handle;
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES, u = 1 - t;
    out.push({
      x: u ** 3 * lane.x1 + 3 * u * u * t * cx0 + 3 * u * t * t * cx1 + t ** 3 * next.x0,
      z: u ** 3 * lane.z1 + 3 * u * u * t * cz0 + 3 * u * t * t * cz1 + t ** 3 * next.z0,
    });
  }
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function isTurn(lane: Lane, next: Lane): boolean {
  return Math.abs(wrap(next.yaw0 - lane.yaw)) >= TURN_RAD;
}

function isCurved(lane: Lane): boolean {
  let total = 0;
  for (let i = 1; i + 1 < lane.points.length; i++) {
    const a = lane.points[i - 1] as Pt, b = lane.points[i] as Pt, c = lane.points[i + 1] as Pt;
    total += Math.abs(wrap(Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z)));
  }
  return total > CURVED_RAD;
}

/**
 * The highway's cyclic direction (+z on the west edge, +x on the north, -z on
 * the east, -x on the south) has the verge on its right; its outer lane is the
 * one the verge panels' hook leaves. Mirrors `candidateSlots` in collectibles.ts.
 */
function isHookLane(graph: RoadGraph, lane: Lane): boolean {
  if (!lane.highway || lane.offset !== 12) return false;
  const a = graph.nodes[lane.from], b = graph.nodes[lane.to];
  if (!a || !b) return false;
  if (a.x === b.x) return a.x < 0 ? b.z > a.z : b.z < a.z;
  return a.z > 0 ? b.x > a.x : b.x < a.x;
}

/**
 * The stretch of a lane a gate line may take, in the lane's own metres, or
 * null: on a street the footway gate's slot lies 93 m from the low junction
 * on either footway, so the lane leaving the low junction and the one arriving
 * at it each keep their window; on the ring the outer lane keeps the hook's.
 */
export function gateWindow(graph: RoadGraph, lane: Lane, len: number): [number, number] | null {
  if (lane.special) return null;
  if (lane.highway) return isHookLane(graph, lane) ? [0, HOOK_WINDOW_END] : null;
  const a = graph.nodes[lane.from], b = graph.nodes[lane.to];
  if (!a || !b) return null;
  const leavingLow = a.x === b.x ? b.z > a.z : b.x > a.x;
  const sGate = leavingLow ? GATE_ALONG - LANE_INSET : len - (GATE_ALONG - LANE_INSET);
  return [Math.max(0, sGate - GATE_LEAD - 2), Math.min(len, sGate + GATE_EXIT + 2)];
}

/** The lane that runs the other way on a street, or null (the ring's carriageways are apart). */
function reverseLane(graph: RoadGraph, lane: Lane): Lane | null {
  if (lane.highway) return null;
  for (const id of graph.nodes[lane.to]?.outgoing ?? []) {
    const other = graph.lanes[id];
    if (other && other.to === lane.from && other.special === lane.special) return other;
  }
  return null;
}

/**
 * The longest stretch a lane's figure may use: between its head and tail,
 * clear of its own gate window and, for a weave that crosses to the oncoming
 * lane, of that lane's window too (mirrored into this lane's metres).
 */
function freeStretch(graph: RoadGraph, lane: Lane, len: number, weave: boolean): [number, number] {
  const windows: Array<[number, number]> = [];
  const own = gateWindow(graph, lane, len);
  if (own) windows.push(own);
  const reverse = weave ? reverseLane(graph, lane) : null;
  if (reverse) {
    const w = gateWindow(graph, reverse, len);
    if (w) windows.push([len - w[1], len - w[0]]);
  }
  let best: [number, number] = [LANE_HEAD, LANE_HEAD];
  const cuts = [LANE_HEAD, len - LANE_TAIL];
  for (const w of windows) cuts.push(w[0], w[1]);
  cuts.sort((p, q) => p - q);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = Math.max(LANE_HEAD, cuts[i] as number), b = Math.min(len - LANE_TAIL, cuts[i + 1] as number);
    if (b <= a) continue;
    const mid = (a + b) / 2;
    if (windows.some((w) => mid > w[0] && mid < w[1])) continue;
    if (b - a > best[1] - best[0]) best = [a, b];
  }
  return best;
}

/** Metres to the right a weave crosses to: the other lane of a highway carriageway, else the oncoming lane. */
function weaveShift(graph: RoadGraph, lane: Lane): number {
  if (lane.highway) {
    for (const id of graph.nodes[lane.from]?.outgoing ?? []) {
      const other = graph.lanes[id];
      if (other && other !== lane && other.to === lane.to) return other.offset - lane.offset;
    }
    return 0;
  }
  return -2 * lane.offset;
}

/** The lane a carriageway's figures are laid from: the outer lane on the ring, the lane itself elsewhere. */
function figureLane(graph: RoadGraph, lane: Lane): Lane {
  if (!lane.highway || lane.offset === 12) return lane;
  for (const id of graph.nodes[lane.from]?.outgoing ?? []) {
    const other = graph.lanes[id];
    if (other && other.to === lane.to && other.offset === 12) return other;
  }
  return lane;
}

/** One key per road: a street's two directions share it; the ring's carriageways are separate roads. */
function roadKey(lane: Lane): number {
  if (lane.highway) return lane.from * 1000 + lane.to;
  return Math.min(lane.from, lane.to) * 1000 + Math.max(lane.from, lane.to);
}

function yawAt(lane: Lane, s: number): number {
  return laneAt(lane, s).yaw;
}

function push(out: CoinPoint[], p: Pt, y: number, lane: number, value: number, phase: number): void {
  out.push({ x: p.x, y, z: p.z, lane, value, phase });
}

/** A run or a weave in the lane's free stretch: 8–12 coins, the cap last. */
function midFigure(graph: RoadGraph, lane: Lane, seed: number, out: CoinPoint[]): void {
  const c = BALANCE.coin;
  const rnd = mulberry32(seed ^ Math.imul(lane.id + 7, 0x9e3779b1));
  const len = laneLength(lane);
  if (isCurved(lane)) { sweeps(graph, lane, len, out); return; }
  const shift = weaveShift(graph, lane);
  let weave = shift !== 0 && rnd() < c.weave;
  let [a, b] = freeStretch(graph, lane, len, weave);
  if (weave && b - a < (c.runMin - 1) * c.pitch) {
    // no room to cross and come back clear of the oncoming lane's gate line: a run instead
    weave = false;
    [a, b] = freeStretch(graph, lane, len, false);
  }
  if (b - a < (c.runMin - 1) * c.pitch) return;
  const maxN = Math.min(c.runMax, Math.floor((b - a) / c.pitch) + 1);
  const n = c.runMin + Math.floor(rnd() * (maxN - c.runMin + 1));
  const s0 = a + rnd() * (b - a - (n - 1) * c.pitch);
  for (let k = 0; k < n; k++) {
    const lateral = weave ? shift * bump(k / (n - 1)) : 0;
    push(out, laneAt(lane, s0 + k * c.pitch, lateral), COIN_HEIGHT, lane.id, k === n - 1 ? c.cap : c.value, k);
  }
}

/** Three stretches on a bend, each cutting to the inside by the local curvature: left onto the oncoming lane, right to the kerb. */
function sweeps(graph: RoadGraph, lane: Lane, len: number, out: CoinPoint[]): void {
  const c = BALANCE.coin;
  const road = graph.special.find((r) => r.name === lane.special);
  const rightMax = road ? Math.max(0, road.halfWidth - lane.offset - SWEEP_KERB) : 0;
  const n = 10;
  for (const f of [0.2, 0.5, 0.8]) {
    const sc = len * f;
    const kappa = wrap(yawAt(lane, sc + 15) - yawAt(lane, sc - 15)) / 30;
    // yaw grows turning left (+x is left when facing +z): a left bend cuts left, which is negative lateral
    const cut = kappa > 0 ? -Math.min(SWEEP_LEFT_MAX, kappa * SWEEP_GAIN) : Math.min(rightMax, -kappa * SWEEP_GAIN);
    const s0 = sc - (n - 1) / 2 * c.pitch;
    for (let k = 0; k < n; k++) {
      push(out, laneAt(lane, s0 + k * c.pitch, cut * bump(k / (n - 1))), COIN_HEIGHT, lane.id, k === n - 1 ? c.cap : c.value, k);
    }
  }
}

/** The link through a turn: the lane's last metres, the junction curve, the next lane's first metres, the cap on the exit. */
function link(lane: Lane, next: Lane, out: CoinPoint[]): void {
  const c = BALANCE.coin;
  const len = laneLength(lane);
  let phase = 0;
  for (let s = len - LINK_TAIL; s < len - 0.1; s += c.pitch) push(out, laneAt(lane, s), COIN_HEIGHT, lane.id, c.value, phase++);
  const curve: Pt[] = [];
  turnCurve(lane, next, curve);
  const curveLen = polylineLength(curve);
  const at: number[] = [];
  for (let s = c.pitch; s < curveLen - c.pitch / 2; s += c.pitch) at.push(s);
  const pts: Pt[] = [];
  samplePolyline(curve, at, pts);
  let last = out[out.length - 1] as CoinPoint;
  for (const p of pts) {
    if (Math.hypot(p.x - last.x, p.z - last.z) < MIN_SPACING) continue;
    push(out, p, COIN_HEIGHT, -2, c.value, phase++);
    last = out[out.length - 1] as CoinPoint;
  }
  const heads = Math.round(LINK_HEAD / c.pitch);
  for (let k = 1; k <= heads; k++) push(out, laneAt(next, k * c.pitch), COIN_HEIGHT, next.id, k === heads ? c.cap : c.value, phase++);
}

/** Over a ramp: three coins up the face, the flight of a car launched at `arc.speed`, the cap on the landing. */
function arc(jd: JumpDesc, out: CoinPoint[]): void {
  const c = BALANCE.coin;
  const fx = Math.sin(jd.yaw), fz = Math.cos(jd.yaw);
  const profile = rampProfile(jd);
  const surface = (a: number): number => {
    for (let i = 0; i + 1 < profile.length; i++) {
      const p = profile[i] as { along: number; y: number }, q = profile[i + 1] as { along: number; y: number };
      if (a >= p.along && a <= q.along) return p.y + (q.y - p.y) * ((a - p.along) / (q.along - p.along || 1));
    }
    return 0;
  };
  const tan = jd.height / jd.length;
  const v2 = c.arc.speed * c.arc.speed / (1 + tan * tan);
  const flight = (a: number): number => jd.height + a * tan - c.arc.gravity * a * a / (2 * v2);
  let phase = 0;
  const at = (a: number): Pt => ({ x: jd.x + fx * a, z: jd.z + fz * a });
  for (const a of [-jd.length, -jd.length / 2, 0]) push(out, at(a), surface(a) + COIN_HEIGHT, -1, c.value, phase++);
  let a = c.pitch;
  for (; flight(a) > 0.3; a += c.pitch) push(out, at(a), Math.max(surface(a), flight(a)) + COIN_HEIGHT, -1, c.value, phase++);
  push(out, at(a + c.pitch), COIN_HEIGHT, -1, c.cap, phase);
}

/**
 * The whole island's coins but the gate lines, from the seed: `trails`
 * random walks of `trailLength` lanes, each lane with a run or a weave and a
 * link through every turn taken (a turn twice as likely as straight on, never
 * a U-turn, one link per junction and per lane entered); then fillers on a
 * `filler` share of the roads left, sweeps on every bend, an arc over every
 * ramp. One figure per road.
 */
export function layoutCoins(graph: RoadGraph, jumps: readonly JumpDesc[], seed: number): CoinPoint[] {
  const c = BALANCE.coin;
  const out: CoinPoint[] = [];
  const lanes = graph.lanes;
  const visited = new Uint8Array(lanes.length);
  const linkedInto = new Uint8Array(lanes.length);
  const junctionUsed = new Uint8Array(graph.nodes.length);
  const roadUsed = new Set<number>();
  const lay = (lane: Lane): void => {
    const from = figureLane(graph, lane);
    const key = roadKey(from);
    if (roadUsed.has(key)) return;
    roadUsed.add(key);
    midFigure(graph, from, seed, out);
  };
  const rnd = mulberry32(seed ^ 0x0c01);
  const starts = lanes.filter((l) => !l.highway && !l.special).map((l) => l.id);
  const candidates: number[] = [];
  for (let t = 0; t < c.trails; t++) {
    let lane = -1;
    for (let tries = 0; tries < 20 && lane < 0; tries++) {
      const id = starts[Math.floor(rnd() * starts.length)] as number;
      if (!visited[id]) lane = id;
    }
    for (let step = 0; step < c.trailLength && lane >= 0; step++) {
      const here = lanes[lane] as Lane;
      visited[lane] = 1;
      lay(here);
      candidates.length = 0;
      for (const id of here.next) {
        const n = lanes[id] as Lane;
        if (visited[id] || n.to === here.from) continue;
        candidates.push(id);
        if (isTurn(here, n)) candidates.push(id);
      }
      if (candidates.length === 0) break;
      const next = candidates[Math.floor(rnd() * candidates.length)] as number;
      const n = lanes[next] as Lane;
      // the link's head must not lie in the next lane's gate window (the ring's hook starts at its very beginning)
      const window = gateWindow(graph, n, laneLength(n));
      const headClear = !window || window[0] >= LINK_HEAD + 2;
      if (isTurn(here, n) && headClear && !linkedInto[next] && !junctionUsed[here.to]) {
        linkedInto[next] = 1;
        junctionUsed[here.to] = 1;
        link(here, n, out);
      }
      lane = next;
    }
  }
  for (const lane of lanes) {
    if (visited[lane.id]) continue;
    const r = mulberry32(seed ^ Math.imul(lane.id + 101, 2654435761));
    if (isCurved(lane) || r() < c.filler) lay(lane);
  }
  for (const jd of jumps) arc(jd, out);
  return out;
}

/**
 * The line through a billboard: a footway gate's from the lane it stands
 * beside, out onto the footway, through the panel (the cap) and back to the
 * lane; a verge panel's a hook off the ring's outer lane, through the panel
 * and two coins into the run-out. Null when no lane runs past the panel.
 */
export function gateLine(graph: RoadGraph, b: BillboardDesc): CoinPoint[] | null {
  const c = BALANCE.coin;
  const out: CoinPoint[] = [];
  const verge = b.width !== BILLBOARD_WIDTH;
  const heading = verge ? b.yaw + Math.PI / 2 : b.yaw;
  for (const lane of graph.lanes) {
    if (lane.special || lane.highway !== verge) continue;
    if (Math.abs(Math.cos(lane.yaw - heading)) < 0.9) continue;
    const mid = lane.points[Math.floor(lane.points.length / 2)] as Pt;
    if (Math.abs(mid.x - b.x) > 200 || Math.abs(mid.z - b.z) > 200) continue;
    const len = laneLength(lane);
    const { s, lateral } = alongLane(lane, b.x, b.z);
    if (verge) {
      if (lateral < 14 || lateral > 20 || s > len - 10) continue;
      const theta = Math.acos(1 - lateral / HOOK_RADIUS);
      const sArc = s - HOOK_RADIUS * Math.sin(theta);
      // the corner chunks' slots sit 39 m along the lane: the arc must start on it, the lead-in takes what is left
      if (sArc < 4) continue;
      const p0 = laneAt(lane, sArc);
      const tx = Math.sin(p0.yaw), tz = Math.cos(p0.yaw);
      const rx = -tz, rz = tx;
      let phase = 0;
      for (let d = -Math.min(HOOK_LEAD, Math.floor((sArc - 2) / c.pitch) * c.pitch); d < -0.1; d += c.pitch) push(out, laneAt(lane, sArc + d), COIN_HEIGHT, -1, c.value, phase++);
      const cx = p0.x + rx * HOOK_RADIUS, cz = p0.z + rz * HOOK_RADIUS;
      for (let phi = c.pitch / HOOK_RADIUS; phi < theta - 0.5 * c.pitch / HOOK_RADIUS; phi += c.pitch / HOOK_RADIUS) {
        const p = { x: cx - rx * HOOK_RADIUS * Math.cos(phi) + tx * HOOK_RADIUS * Math.sin(phi), z: cz - rz * HOOK_RADIUS * Math.cos(phi) + tz * HOOK_RADIUS * Math.sin(phi) };
        push(out, p, COIN_HEIGHT, -1, c.value, phase++);
      }
      push(out, { x: b.x, z: b.z }, COIN_HEIGHT, -1, c.cap, phase++);
      const ex = tx * Math.cos(theta) + rx * Math.sin(theta), ez = tz * Math.cos(theta) + rz * Math.sin(theta);
      for (let k = 1; k <= HOOK_PAST; k++) push(out, { x: b.x + ex * k * c.pitch, z: b.z + ez * k * c.pitch }, COIN_HEIGHT, -1, c.value, phase++);
      return out;
    }
    if (lateral < 8 || lateral > 12 || s < GATE_LEAD || s > len - GATE_EXIT) continue;
    const first = -Math.floor(GATE_LEAD / c.pitch), last = Math.floor(GATE_EXIT / c.pitch) - 1;
    for (let k = first; k <= last; k++) {
      const d = k * c.pitch;
      const t = d < -GATE_HOLD_IN ? smooth((d + GATE_RISE) / (GATE_RISE - GATE_HOLD_IN)) : d <= GATE_HOLD_OUT ? 1 : 1 - smooth((d - GATE_HOLD_OUT) / (GATE_EXIT - GATE_HOLD_OUT));
      push(out, laneAt(lane, s + d, lateral * t), COIN_HEIGHT, -1, k === 0 ? c.cap : c.value, k - first);
    }
    return out;
  }
  return null;
}

/** This chunk's coins: the layout's inside it, then the gate line through each of its billboards. */
export function placeCoins(cx: number, cz: number, layout: readonly CoinPoint[], billboards: readonly BillboardDesc[], graph: RoadGraph): CoinDesc[] {
  const index = (cz + 3) * 7 + (cx + 3);
  const out: CoinDesc[] = [];
  const take = (p: CoinPoint): void => {
    if (out.length >= COINS_PER_CHUNK_MAX) return;
    out.push({ id: index * COINS_PER_CHUNK_MAX + out.length, x: p.x, y: p.y, z: p.z, lane: p.lane, value: p.value, phase: p.phase });
  };
  for (const p of layout) if (chunkOf(p.x) === cx && chunkOf(p.z) === cz) take(p);
  for (const b of billboards) {
    const line = gateLine(graph, b);
    if (line) for (const p of line) take(p);
  }
  return out;
}

export class Coins {
  /** One byte per (chunk, slot), then one per extra coin. */
  readonly picked = new Uint8Array(EXTRA_COIN_BASE + EXTRA_COINS_MAX);
  pickedCount = 0;
  /** Coins laid at run time, outside the chunks (lane -3); ids from EXTRA_COIN_BASE. */
  readonly extra: CoinDesc[] = [];
  /** Bumps when extra coins are laid or cleared, so the view registers them. */
  extraSerial = 0;
  /** The spill pool: position, value, seconds left (0 = empty). */
  readonly spillX: Float32Array;
  readonly spillZ: Float32Array;
  readonly spillValue: Float32Array;
  readonly spillTtl: Float32Array;
  /** Bumps whenever the spill pool changes shape (laid, a coin picked, expired) so the view repacks. */
  spillSerial = 0;
  private readonly pose: LanePose = { x: 0, z: 0, yaw: 0 };
  private readonly proj: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };

  constructor(private readonly city: City, private readonly lanes: LaneTables) {
    const n = BALANCE.spill.coins;
    this.spillX = new Float32Array(n);
    this.spillZ = new Float32Array(n);
    this.spillValue = new Float32Array(n);
    this.spillTtl = new Float32Array(n);
  }

  /**
   * Picks in the reach box round the chassis this step (`reach.ahead` past the
   * bumpers, `reach.side` past the doors, `reach.up` about the bonnet); pushes
   * one 'coin' per coin (target: its id, or -2 for a spilled one). Returns the
   * value picked.
   */
  step(player: PlayerProbe, dt: number, events: EventLog): number {
    const reach = BALANCE.coin.reach;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    const rx = -fz, rz = fx;
    const hl = player.halfLength + reach.ahead, hw = player.halfWidth + reach.side;
    const cy = player.y + 0.5;
    let value = 0;
    for (const entry of this.city.active.values()) {
      const coins = entry.chunk.coins;
      if (coins.length === 0) continue;
      // a chunk is 225 m across: its coins are only worth testing when it is near
      const first = coins[0] as CoinDesc;
      if (Math.abs(first.x - player.x) > 250 || Math.abs(first.z - player.z) > 250) continue;
      for (let i = 0; i < coins.length; i++) {
        const coin = coins[i] as CoinDesc;
        if (this.picked[coin.id] === 1) continue;
        const dx = coin.x - player.x, dz = coin.z - player.z;
        if (Math.abs(dx) > 8 || Math.abs(dz) > 8 || Math.abs(coin.y - cy) > reach.up) continue;
        if (Math.abs(dx * fx + dz * fz) > hl || Math.abs(dx * rx + dz * rz) > hw) continue;
        this.picked[coin.id] = 1;
        this.pickedCount++;
        value += coin.value;
        events.push('coin', coin.value, coin.x, coin.y, coin.z, coin.id);
      }
    }
    const extra = this.extra;
    for (let i = 0; i < extra.length; i++) {
      const coin = extra[i] as CoinDesc;
      if (this.picked[coin.id] === 1) continue;
      const dx = coin.x - player.x, dz = coin.z - player.z;
      if (Math.abs(dx) > 8 || Math.abs(dz) > 8 || Math.abs(coin.y - cy) > reach.up) continue;
      if (Math.abs(dx * fx + dz * fz) > hl || Math.abs(dx * rx + dz * rz) > hw) continue;
      this.picked[coin.id] = 1;
      this.pickedCount++;
      value += coin.value;
      events.push('coin', coin.value, coin.x, coin.y, coin.z, coin.id);
    }
    for (let k = 0; k < this.spillTtl.length; k++) {
      const ttl = this.spillTtl[k] as number;
      if (ttl <= 0) continue;
      const dx = (this.spillX[k] as number) - player.x, dz = (this.spillZ[k] as number) - player.z;
      if (Math.abs(dx * fx + dz * fz) <= hl + 0.3 && Math.abs(dx * rx + dz * rz) <= hw + 0.3) {
        const v = this.spillValue[k] as number;
        this.spillTtl[k] = 0;
        this.spillSerial++;
        value += v;
        events.push('coin', v, this.spillX[k] as number, COIN_HEIGHT, this.spillZ[k] as number, -2);
        continue;
      }
      const left = ttl - dt;
      this.spillTtl[k] = left > 0 ? left : 0;
      if (left <= 0) this.spillSerial++;
    }
    return value;
  }

  /**
   * Lay `total` over the spill pool on the lane that runs the way the wreck
   * faced: from `startAhead` m past the wreck at `pitch`, each coin an equal
   * share (the remainder on the first ones), for `seconds`. The rolling
   * respawn comes out on that lane, so it drives through them.
   */
  spill(x: number, z: number, yaw: number, total: number, events: EventLog): void {
    const sp = BALANCE.spill;
    const lanes = this.lanes;
    let lane = -1, best = Infinity, bestS = 0;
    for (let i = 0; i < lanes.laneCount; i++) {
      if (Math.hypot((lanes.midX[i] as number) - x, (lanes.midZ[i] as number) - z) > (lanes.length[i] as number) / 2 + 30) continue;
      lanes.project(i, x, z, this.proj);
      // near and facing the way the car did: the other carriageway's lane runs backwards
      const cost = this.proj.dist + (1 - Math.cos(this.proj.yaw - yaw)) * 20;
      if (cost < best) { best = cost; lane = i; bestS = this.proj.s; }
    }
    const n = this.spillTtl.length;
    const base = Math.floor(total / n);
    let rest = total - base * n;
    for (let k = 0; k < n; k++) {
      let px = x + Math.sin(yaw) * (sp.startAhead + k * sp.pitch);
      let pz = z + Math.cos(yaw) * (sp.startAhead + k * sp.pitch);
      if (lane >= 0) {
        const s = bestS + sp.startAhead + k * sp.pitch;
        const outs = lanes.outs(lane);
        let next = -1;
        for (const o of outs) if (lanes.straightThrough(lane, o)) { next = o; break; }
        lanes.positionAt(lane, s, 0, this.pose, next >= 0 ? next : (outs[0] ?? -1));
        px = this.pose.x;
        pz = this.pose.z;
      }
      this.spillX[k] = px;
      this.spillZ[k] = pz;
      this.spillValue[k] = base + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      this.spillTtl[k] = sp.seconds;
    }
    this.spillSerial++;
    events.push('spill', total, x, 0.5, z, -1);
  }

  /** Lays a line of coins at these points (beyond the pool's room they are dropped); returns how many were laid. */
  addExtra(points: ReadonlyArray<Pt>): number {
    let n = 0;
    for (const p of points) {
      if (this.extra.length >= EXTRA_COINS_MAX) break;
      const id = EXTRA_COIN_BASE + this.extra.length;
      this.picked[id] = 0;
      this.extra.push({ id, x: p.x, y: COIN_HEIGHT, z: p.z, lane: -3, value: BALANCE.coin.value, phase: this.extra.length });
      n++;
    }
    if (n > 0) this.extraSerial++;
    return n;
  }

  /** Takes every extra coin off the road (picked or not). */
  clearExtra(): void {
    if (this.extra.length === 0) return;
    for (const c of this.extra) this.picked[c.id] = 1;
    this.extra.length = 0;
    this.extraSerial++;
  }

  /** Spilled coins still on the road. */
  spillLeft(): number {
    let n = 0;
    for (let k = 0; k < this.spillTtl.length; k++) if ((this.spillTtl[k] as number) > 0) n++;
    return n;
  }
}
