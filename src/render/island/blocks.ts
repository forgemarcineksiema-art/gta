/**
 * The island's buildings far off (M8.10 slice 18): the third level after the grid's two. A facaded building of the
 * grid's kit keeps an envelope, the box the sim collides with round its walls; far off the building is that envelope's
 * four faces in its body's colour (a facade), the solids inside it (its core) for its shadow, and its windows' glass
 * brought out onto the faces, each lit as it was (its middle unmoved: only its panel's depth grows); the walls round the
 * openings, their reveals and the rest inside the envelope are left out. What stands outside it (the cornice, the roof,
 * the plinth, the balconies, the signs) stays.
 */
import type { Quat, ShapeDesc, StaticDesc, Vec3 } from '../../sim';

/** How far past its envelope a building's glass comes out, and the slack of what counts as inside it (m). */
const LIFT = 0.05;
const SLACK = 0.01;

/** A facaded building's envelope: a box the sim collides with and the view never draws. */
export function isEnvelope(st: StaticDesc): boolean {
  return st.collisionOnly === true && st.tag === 'building' && st.shape.kind === 'box';
}

/** How far a static reaches past its middle across the ground (m). */
export function spread(st: StaticDesc): number {
  const s: ShapeDesc = st.shape;
  switch (s.kind) {
    case 'box': case 'gable': return Math.hypot(s.hx, s.hz);
    case 'cylinder': case 'wheel': case 'ball': return s.radius;
    case 'prism': return Math.max(0, ...s.points.map((p) => Math.hypot(p.x - st.position.x, p.z - st.position.z)));
  }
}

/** Whether two statics are turned alike. */
function alike(a: Quat, b: Quat): boolean {
  return Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w) > 0.9999;
}

/** `p` in `env`'s frame: from its middle along its axes, into `out`. */
function local(env: StaticDesc, p: Vec3, out: Vec3): Vec3 {
  const x = p.x - env.position.x, y = p.y - env.position.y, z = p.z - env.position.z;
  // turned back by the envelope's rotation (its conjugate): v + w t + q × t, t = 2 q × v
  const qx = -env.rotation.x, qy = -env.rotation.y, qz = -env.rotation.z, qw = env.rotation.w;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out.x = x + qw * tx + (qy * tz - qz * ty);
  out.y = y + qw * ty + (qz * tx - qx * tz);
  out.z = z + qw * tz + (qx * ty - qy * tx);
  return out;
}

const at: Vec3 = { x: 0, y: 0, z: 0 };

/** Whether `st` belongs to the building `env` encloses: turned as it is, its middle within `margin` of its footprint. */
export function ofBuilding(env: StaticDesc, st: StaticDesc, margin: number): boolean {
  if (env.shape.kind !== 'box' || !alike(env.rotation, st.rotation)) return false;
  local(env, st.position, at);
  return Math.abs(at.x) <= env.shape.hx + margin && Math.abs(at.z) <= env.shape.hz + margin;
}

/** A quarter's statics at the far-off level: each facaded building as its envelope, its core and its glass. */
export function blockStatics(statics: readonly StaticDesc[]): StaticDesc[] {
  const out: StaticDesc[] = [];
  let env: StaticDesc | null = null;
  for (const st of statics) {
    if (isEnvelope(st)) {
      env = st;
      out.push({ ...st, collisionOnly: false, tag: 'wall', faces: ['x+', 'x-', 'z+', 'z-'] });
      continue;
    }
    const e = env?.shape, s = st.shape;
    if (!env || e?.kind !== 'box' || s.kind !== 'box' || !alike(env.rotation, st.rotation)) { out.push(st); continue; }
    local(env, st.position, at);
    if (Math.abs(at.x) + s.hx > e.hx + SLACK || Math.abs(at.y) + s.hy > e.hy + SLACK || Math.abs(at.z) + s.hz > e.hz + SLACK) { out.push(st); continue; }
    // inside: the solids (the core) kept for the shadow, the glass brought out (its panel's depth grown to the face), the
    // walls' members, the reveals and the panels left
    if (st.face === undefined && st.faces === undefined) out.push(st);
    else if (st.tag === 'glazing' && st.face === 'x+') out.push({ ...st, shape: { ...s, hx: e.hx + LIFT - at.x } });
    else if (st.tag === 'glazing' && st.face === 'x-') out.push({ ...st, shape: { ...s, hx: e.hx + LIFT + at.x } });
    else if (st.tag === 'glazing' && st.face === 'z+') out.push({ ...st, shape: { ...s, hz: e.hz + LIFT - at.z } });
    else if (st.tag === 'glazing' && st.face === 'z-') out.push({ ...st, shape: { ...s, hz: e.hz + LIFT + at.z } });
  }
  return out;
}
