/**
 * The sun's glare (docs/M8.9_PLAN.md R13, slice 20): a soft warm glow over everything round the sun's place on screen,
 * drawn last (a quad, not a full-screen pass; no lens-flare rings, no bloom). Its strength is how directly the camera
 * faces the sun times how much of the disc is seen, so a block, a bus or a cloud over the sun puts it out within 0.15 s
 * and, driving out from behind a block, the sun blinds.
 *
 * How much is seen: five points of the disc, one a frame in turn, each answered by the world (a WebGL2 occlusion query
 * round a tiny probe drawn after the world, near the far plane on the sun's ray; read only once its result is available,
 * never blocking) and by the clouds (their puffs as ellipsoids on the CPU: they clear their depth after their draw, so
 * the probe cannot see them). The seen share is the last five answers' mean.
 */
import * as THREE from 'three';
import type { Puff } from './clouds';
import { SKY, sunDiscDirection } from './sky';

export const GLARE = {
  /** The probe: how far out on the sun's ray (m, inside the far plane's 1700), its half-size (m), the points' offsets. */
  probe: { distance: 1600, half: 3, ring: 0.7 },
  /** The glow: its colour (sRGB, added on the screen), the core's and the halo's strength and radius (of the height). */
  color: 0xffd7a0,
  core: { strength: 0.5, radius: 0.07 },
  halo: { strength: 0.22, radius: 0.45 },
  /** How far from the frame's middle (NDC length) the glow starts to fade, and where it is gone. */
  fade: [0.55, 1.35],
} as const;

/** The disc's five points: its centre, then up, right, down and left at `GLARE.probe.ring` of its radius. */
export const PROBE_POINTS = 5;

/** The points' directions (unit): the sun's, offset across the disc; fixed as the sun is, made once. */
const POINTS: THREE.Vector3[] = [];

/** The probe's direction for a point (unit): the sun's, offset across the disc. */
export function probeDirection(point: number, out: THREE.Vector3): THREE.Vector3 {
  if (POINTS.length === 0) {
    const sun = sunDiscDirection(new THREE.Vector3());
    const right = new THREE.Vector3(0, 1, 0).cross(sun).normalize(), up = sun.clone().cross(right).normalize();
    const r = THREE.MathUtils.degToRad(SKY.disc.radius) * GLARE.probe.ring;
    POINTS.push(sun.clone());
    for (let k = 0; k < PROBE_POINTS - 1; k++) {
      const angle = (k / (PROBE_POINTS - 1)) * Math.PI * 2;
      POINTS.push(sun.clone().addScaledVector(up, Math.cos(angle) * r).addScaledVector(right, Math.sin(angle) * r).normalize());
    }
  }
  return out.copy(POINTS[point % PROBE_POINTS] as THREE.Vector3);
}

/** Whether a ray from the eye along `d` (unit) meets a cloud's puff, the clouds swung by `drift` (radians). */
export function cloudCovers(d: THREE.Vector3, puffs: readonly Puff[], drift: number): boolean {
  // into the clouds' own frame: undo the swing about the vertical
  const c = Math.cos(-drift), s = Math.sin(-drift);
  const dx = c * d.x + s * d.z, dy = d.y, dz = -s * d.x + c * d.z;
  for (const p of puffs) {
    // into the puff's frame (right, up, toward by its yaw), scaled to a unit sphere
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    const ox = -(cy * p.x - sy * p.z) / p.sx, oy = -p.y / p.sy, oz = -(sy * p.x + cy * p.z) / p.sz;
    const rx = (cy * dx - sy * dz) / p.sx, ry = dy / p.sy, rz = (sy * dx + cy * dz) / p.sz;
    const a = rx * rx + ry * ry + rz * rz, b = 2 * (ox * rx + oy * ry + oz * rz), k = ox * ox + oy * oy + oz * oz - 1;
    const disc = b * b - 4 * a * k;
    if (disc >= 0 && -b + Math.sqrt(disc) > 0) return true;
  }
  return false;
}

/** The glow's strength for the sun's place on screen (NDC; `ahead` false when it is behind the camera). */
export function glareFacing(ndcX: number, ndcY: number, ahead: boolean): number {
  if (!ahead) return 0;
  const r = Math.hypot(ndcX, ndcY), [a, b] = GLARE.fade;
  if (r <= a) return 1;
  if (r >= b) return 0;
  const t = (r - a) / (b - a);
  return 1 - t * t * (3 - 2 * t);
}

/** The seen share: the last answer of each of the disc's points (1 seen, 0 hidden), their mean. */
export class SeenShare {
  private readonly answers = new Float32Array(PROBE_POINTS).fill(1);

  answer(point: number, seen: boolean): void {
    this.answers[point % PROBE_POINTS] = seen ? 1 : 0;
  }

  get share(): number {
    let sum = 0;
    for (const a of this.answers) sum += a;
    return sum / PROBE_POINTS;
  }
}

/** The GL calls a query takes (WebGL2's), apart for the pins. */
export interface QueryGl {
  createQuery(): WebGLQuery | null;
  beginQuery(target: number, query: WebGLQuery): void;
  endQuery(target: number): void;
  getQueryParameter(query: WebGLQuery, pname: number): unknown;
  readonly ANY_SAMPLES_PASSED_CONSERVATIVE: number;
  readonly QUERY_RESULT_AVAILABLE: number;
  readonly QUERY_RESULT: number;
}

/**
 * The occlusion queries: one begun and ended round each probe draw, for the point drawn; each read once, in order, when
 * its result is available; a point with a query in flight is not asked again till it answers.
 */
export class ProbeQueries {
  private readonly free: WebGLQuery[] = [];
  private readonly flight: Array<{ query: WebGLQuery; point: number }> = [];
  private readonly asked = new Uint8Array(PROBE_POINTS);
  private active: { query: WebGLQuery; point: number } | null = null;

  constructor(private readonly gl: QueryGl) {}

  /** Whether `point` may be asked now (none of its queries in flight). */
  canAsk(point: number): boolean {
    return this.asked[point] === 0;
  }

  begin(point: number): void {
    if (this.active || !this.canAsk(point)) return;
    const query = this.free.pop() ?? this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.gl.ANY_SAMPLES_PASSED_CONSERVATIVE, query);
    this.active = { query, point };
    this.asked[point] = 1;
  }

  end(): void {
    if (!this.active) return;
    this.gl.endQuery(this.gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
    this.flight.push(this.active);
    this.active = null;
  }

  /** The answers ready, oldest first: each `(point, seen)` once. */
  read(to: (point: number, seen: boolean) => void): void {
    while (this.flight.length > 0) {
      const next = this.flight[0] as { query: WebGLQuery; point: number };
      if (!this.gl.getQueryParameter(next.query, this.gl.QUERY_RESULT_AVAILABLE)) return;
      const seen = Boolean(this.gl.getQueryParameter(next.query, this.gl.QUERY_RESULT));
      this.flight.shift();
      this.asked[next.point] = 0;
      this.free.push(next.query);
      to(next.point, seen);
    }
  }
}

const GLOW_VERTEX = /* glsl */ `
  uniform vec2 glareAt;
  uniform float glareAspect;
  uniform float glareSize;
  varying vec2 vGlare;
  void main() {
    vGlare = position.xy;
    gl_Position = vec4( glareAt + position.xy * glareSize * vec2( 1.0 / glareAspect, 1.0 ), 0.0, 1.0 );
  }
`;

const f = (x: number): string => x.toFixed(4);

/** The glow: a tight core and a wide halo round the sun's place, no edge (the quad reaches past the halo's reach). */
export function glowFragment(): string {
  // added on the screen as it is (no tone curve, no colour space): the colour's own sRGB channels
  const c = { r: ((GLARE.color >> 16) & 255) / 255, g: ((GLARE.color >> 8) & 255) / 255, b: (GLARE.color & 255) / 255 };
  // the quad's half-height is `glareSize` in NDC (a frame is 2 high); `r` and the radii in the frame's heights
  return /* glsl */ `
  uniform float glareStrength;
  uniform float glareSize;
  varying vec2 vGlare;
  void main() {
    float r = length( vGlare ) * glareSize * 0.5;
    float core = exp( - pow( r / ${f(GLARE.core.radius)}, 2.0 ) ) * ${f(GLARE.core.strength)};
    float halo = exp( - r / ${f(GLARE.halo.radius * 0.35)} ) * ${f(GLARE.halo.strength)};
    float edge = 1.0 - smoothstep( 0.8, 1.0, length( vGlare ) );
    gl_FragColor = vec4( vec3( ${f(c.r)}, ${f(c.g)}, ${f(c.b)} ) * ( ( core + halo ) * edge * glareStrength ), 1.0 );
  }
`;
}

export class Glare {
  private readonly probe: THREE.Mesh;
  private readonly glow: THREE.Mesh;
  private readonly uniforms = {
    glareAt: { value: new THREE.Vector2() }, glareAspect: { value: 1 }, glareSize: { value: 1 }, glareStrength: { value: 0 },
  };
  private readonly seen = new SeenShare();
  private readonly queries: ProbeQueries | null;
  private point = 0;
  /** The point the probe is placed on this frame (it answers when its query reads). */
  private drawn = -1;
  private readonly tmp = new THREE.Vector3();
  private readonly sun = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  /** The seen share and the glow's strength this frame (for the pins and the dev panel). */
  share = 1;
  strength = 0;

  constructor(scene: THREE.Scene, gl: QueryGl | null, private readonly puffs: readonly Puff[]) {
    this.queries = gl ? new ProbeQueries(gl) : null;
    const h = GLARE.probe.half;
    this.probe = new THREE.Mesh(new THREE.PlaneGeometry(h * 2, h * 2), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, toneMapped: false }));
    this.probe.frustumCulled = false;
    // after the world's opaque draws, so its depth is all there
    this.probe.renderOrder = 1000;
    this.probe.onBeforeRender = () => { if (this.drawn >= 0) this.queries?.begin(this.drawn); };
    this.probe.onAfterRender = () => { this.queries?.end(); };
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: GLOW_VERTEX, fragmentShader: glowFragment(),
      transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 2000;
    scene.add(this.probe, this.glow);
  }

  /** Before the frame's render: read the answers, place the probe on the next point, set the glow. */
  update(camera: THREE.PerspectiveCamera, drift: number): void {
    // this frame's camera (three would update it only in the render), so the glow never trails a turn
    camera.updateMatrixWorld();
    this.queries?.read((point, seen) => {
      this.seen.answer(point, seen && !cloudCovers(probeDirection(point, this.tmp), this.puffs, drift));
    });
    if (!this.queries) this.seen.answer(this.point, !cloudCovers(probeDirection(this.point, this.tmp), this.puffs, drift));
    // the next point whose query is not in flight; the probe faces the camera on its ray
    this.drawn = -1;
    for (let k = 0; k < PROBE_POINTS; k++) {
      const p = (this.point + k) % PROBE_POINTS;
      if (!this.queries || this.queries.canAsk(p)) { this.drawn = p; this.point = (p + 1) % PROBE_POINTS; break; }
    }
    probeDirection(Math.max(0, this.drawn), this.tmp);
    this.probe.position.copy(camera.position).addScaledVector(this.tmp, GLARE.probe.distance);
    this.probe.quaternion.copy(camera.quaternion);
    this.probe.visible = this.drawn >= 0 && this.queries !== null;
    this.share = this.seen.share;
    // the glow where the sun is on the screen
    this.sun.copy(camera.position).add(sunDiscDirection(this.tmp).multiplyScalar(GLARE.probe.distance)).project(camera);
    const ahead = sunDiscDirection(this.tmp).dot(camera.getWorldDirection(this.forward)) > 0;
    this.strength = this.share * glareFacing(this.sun.x, this.sun.y, ahead);
    this.uniforms.glareAt.value.set(this.sun.x, this.sun.y);
    this.uniforms.glareAspect.value = camera.aspect;
    this.uniforms.glareSize.value = GLARE.halo.radius * 2;
    this.uniforms.glareStrength.value = this.strength;
    this.glow.visible = this.strength > 0.002;
  }
}
