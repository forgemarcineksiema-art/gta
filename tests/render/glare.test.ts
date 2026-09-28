/**
 * The sun's glare (docs/M8.9_PLAN.md R13, slice 20): the seen share of the disc from five points in turn, the world by
 * an occlusion query read only when available, the clouds on the CPU; the glow by how directly the camera faces the sun.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cloudPuffs } from '../../src/render/clouds';
import { GLARE, Glare, PROBE_POINTS, ProbeQueries, SeenShare, cloudCovers, glareFacing, probeDirection, type QueryGl } from '../../src/render/glare';
import { SKY, sunDiscDirection } from '../../src/render/sky';

/** A GL that answers each query `delay` reads after it ends, `seen` as the test sets it. */
class FakeGl implements QueryGl {
  readonly ANY_SAMPLES_PASSED_CONSERVATIVE = 1;
  readonly QUERY_RESULT_AVAILABLE = 2;
  readonly QUERY_RESULT = 3;
  seen = true;
  begun = 0;
  reads = 0;
  private next = 0;
  private open: { id: number; age: number; seen: boolean } | null = null;
  private readonly ended = new Map<number, { age: number; seen: boolean }>();
  constructor(private readonly delay: number) {}
  createQuery(): WebGLQuery { return { id: this.next++ }; }
  beginQuery(_t: number, q: WebGLQuery): void {
    expect(this.open).toBeNull();
    this.open = { id: (q as unknown as { id: number }).id, age: 0, seen: this.seen };
    this.begun++;
  }
  endQuery(): void {
    const o = this.open as { id: number; age: number; seen: boolean };
    this.ended.set(o.id, { age: 0, seen: o.seen });
    this.open = null;
  }
  getQueryParameter(q: WebGLQuery, pname: number): unknown {
    const e = this.ended.get((q as unknown as { id: number }).id);
    if (!e) throw new Error('read a query never ended, or twice');
    if (pname === this.QUERY_RESULT_AVAILABLE) return e.age >= this.delay;
    this.reads++;
    this.ended.delete((q as unknown as { id: number }).id);
    return e.seen;
  }
  frame(): void { for (const e of this.ended.values()) e.age++; }
}

describe("the sun's glare (M8.9 slice 20, R13)", () => {
  it('M8.9 20.1 the seen share falls from 1 to 0 within 0.15 s of the answers turning hidden, and rises as fast', () => {
    const gl = new FakeGl(2), queries = new ProbeQueries(gl), seen = new SeenShare();
    let point = 0;
    const frame = (): void => {
      queries.read((p, s) => seen.answer(p, s));
      for (let k = 0; k < PROBE_POINTS; k++) {
        const p = (point + k) % PROBE_POINTS;
        if (queries.canAsk(p)) { queries.begin(p); queries.end(); point = (p + 1) % PROBE_POINTS; break; }
      }
      gl.frame();
    };
    for (let i = 0; i < 20; i++) frame();
    expect(seen.share).toBe(1);
    gl.seen = false;
    let frames = 0;
    while (seen.share > 0 && frames < 60) { frame(); frames++; }
    expect(seen.share).toBe(0);
    expect(frames / 60).toBeLessThanOrEqual(0.15);
    gl.seen = true;
    frames = 0;
    while (seen.share < 1 && frames < 60) { frame(); frames++; }
    expect(frames / 60).toBeLessThanOrEqual(0.15);
  });

  it('M8.9 20.2 no glow with the sun behind the camera; the most with it in the frame\'s middle, gone past the edge', () => {
    expect(glareFacing(0, 0, false)).toBe(0);
    expect(glareFacing(0, 0, true)).toBe(1);
    expect(glareFacing(0.3, 0.2, true)).toBe(1);
    expect(glareFacing(0.9, 0, true)).toBeGreaterThan(0);
    expect(glareFacing(0.9, 0, true)).toBeLessThan(1);
    expect(glareFacing(GLARE.fade[1], 0, true)).toBe(0);
    // behind the camera the glare's own update puts it out
    const scene = new THREE.Scene(), glare = new Glare(scene, null, []);
    const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.6, 1700);
    const sun = sunDiscDirection(new THREE.Vector3());
    camera.lookAt(sun.clone().negate()); camera.updateMatrixWorld();
    glare.update(camera, 0);
    expect(glare.strength).toBe(0);
    camera.lookAt(sun); camera.updateMatrixWorld();
    glare.update(camera, 0);
    expect(glare.strength).toBeCloseTo(1, 6);
  });

  it('M8.9 20.3 a query is read only when available, once, and a point with one in flight is not asked again', () => {
    const gl = new FakeGl(3), queries = new ProbeQueries(gl);
    queries.begin(0); queries.end();
    expect(queries.canAsk(0)).toBe(false);
    queries.begin(0); queries.end();
    expect(gl.begun).toBe(1);
    let answers = 0;
    queries.read(() => answers++);
    expect(answers).toBe(0);
    expect(gl.reads).toBe(0);
    gl.frame(); gl.frame(); gl.frame();
    queries.read(() => answers++);
    expect(answers).toBe(1);
    expect(gl.reads).toBe(1);
    queries.read(() => answers++);
    expect(gl.reads).toBe(1);
    expect(queries.canAsk(0)).toBe(true);
  });

  it('M8.9 20.4 the clouds hide the sun on the CPU where a puff crosses its ray; the probe and the glow are two draws', () => {
    const d = probeDirection(0, new THREE.Vector3());
    expect(d.angleTo(sunDiscDirection(new THREE.Vector3()))).toBe(0);
    for (let p = 1; p < PROBE_POINTS; p++) {
      const deg = THREE.MathUtils.radToDeg(probeDirection(p, new THREE.Vector3()).angleTo(d));
      expect(deg).toBeCloseTo(SKY.disc.radius * GLARE.probe.ring, 3);
    }
    const puffs = cloudPuffs();
    const puff = puffs[0]!, at = new THREE.Vector3(puff.x, puff.y, puff.z).normalize();
    expect(cloudCovers(at, puffs, 0)).toBe(true);
    expect(cloudCovers(new THREE.Vector3(0, 1, 0), puffs, 0)).toBe(false);
    // swung by the drift, the same puff is met where it has gone
    const drift = 0.2, swung = at.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), drift);
    expect(cloudCovers(swung, puffs, drift)).toBe(true);
    const scene = new THREE.Scene();
    new Glare(scene, null, puffs);
    let meshes = 0;
    scene.traverse((o) => { if (o instanceof THREE.Mesh) meshes++; });
    expect(meshes).toBe(2);
  });
});
