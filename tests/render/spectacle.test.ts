/**
 * The spectacle (M8 slice 5, docs/M8_PLAN.md §4): every material throws its own debris from one pool that never
 * overflows and allocates nothing a frame; a broken hydrant's water column stands on its jet, and is hidden with none.
 */
import { getHeapSpaceStatistics, setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEBRIS_POOL, Debris } from '../../src/render/Debris';
import { PropsView } from '../../src/render/PropsView';
import { Sparks } from '../../src/render/Sparks';
import { PROPS, type PropDesc, type PropMaterial } from '../../src/sim';
import { createWorld, run } from '../sim/helpers';

const MATERIALS: readonly PropMaterial[] = ['metal', 'glass', 'wood', 'plastic', 'fruit', 'paper', 'ceramic'];

describe('the spectacle (M8 slice 5)', () => {
  it('M8 5.1 every material throws its debris, never more than the pool, and a frame allocates nothing', () => {
    const scene = new THREE.Scene();
    const debris = new Debris(scene);
    for (const m of MATERIALS) {
      const before = debris.alive;
      debris.smash(m, 0, 0.5, 0, 5, 0, 0xff0000);
      expect(debris.alive - before, m).toBeGreaterThan(2);
      debris.update(1 / 60);
      if (m === 'fruit') expect(debris.balls.visible).toBe(true);
    }
    expect(debris.mesh.visible).toBe(true);
    // a street's worth at once: the pool holds, the oldest give way
    for (let k = 0; k < 40; k++) debris.smash(MATERIALS[k % MATERIALS.length]!, k, 0.5, 0, 5, 0, 0x00ff00);
    expect(debris.alive).toBeLessThanOrEqual(DEBRIS_POOL);
    // a frame of flight makes nothing (warm: the engine's compile is not an allocation of ours)
    setFlagsFromString('--expose_gc');
    const gc = runInNewContext('gc') as () => void;
    const young = (): number => { for (const s of getHeapSpaceStatistics()) if (s.space_name === 'new_space') return s.space_used_size; return 0; };
    for (let k = 0; k < 3000; k++) { if (k % 60 === 0) debris.smash('glass', 0, 0.5, 0, 5, 0, 0); debris.update(1 / 60); }
    debris.smash('fruit', 0, 0.5, 0, 5, 0, 0);
    const perFrame = (): number => {
      gc(); const e = young(); const own = young() - e;
      gc(); const a = young();
      for (let k = 0; k < 30; k++) debris.update(1 / 60);
      return (young() - a - own) / 30;
    };
    perFrame();
    expect(perFrame()).toBeLessThan(1);
    // the pieces land and go: nothing drawn for nothing
    for (let k = 0; k < 400; k++) debris.update(1 / 60);
    expect(debris.mesh.visible).toBe(false);
    expect(debris.balls.visible).toBe(false);
    // sparks off metal: a burst shows, then goes
    const sparks = new Sparks();
    const still = { contactSide: 0 } as Parameters<Sparks['update']>[0];
    sparks.burst(0, 0.5, 0, 24);
    sparks.update(still, new THREE.Vector3(), 1 / 60);
    expect(sparks.object.visible).toBe(true);
    for (let k = 0; k < 120; k++) sparks.update(still, new THREE.Vector3(), 1 / 60);
    expect(sparks.object.visible).toBe(false);
  });

  it('M8 5.2 a hydrant\'s water column stands on its jet, sinks with it, and is hidden with none', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      const scene = new THREE.Scene();
      const view = new PropsView(scene, sim);
      const columns = scene.getObjectByName('props-water') as THREE.InstancedMesh;
      view.update(sim, 1, 0);
      expect(columns.visible).toBe(false);
      const city = sim.city!;
      let h: PropDesc | null = null;
      for (const e of city.active.values()) for (const p of city.props(e.chunk.x, e.chunk.z)) if (!h && p.kind === 'hydrant') h = p;
      expect(h).not.toBeNull();
      sim.props!.knock(h!.id, 1400, 20, 1, 0, 0, 0);
      run(sim, 1);
      view.update(sim, 1, 1);
      expect(columns.visible).toBe(true);
      expect(columns.count).toBe(1);
      const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      columns.getMatrixAt(0, m);
      m.decompose(p, q, s);
      expect(Math.hypot(p.x - h!.x, p.z - h!.z)).toBeLessThan(1e-3);
      const tall = s.y;
      expect(tall).toBeGreaterThan(5);
      // its last seconds: lower
      run(sim, PROPS.jet.seconds - 2.5);
      view.update(sim, 1, 2);
      columns.getMatrixAt(0, m);
      m.decompose(p, q, s);
      expect(s.y).toBeLessThan(tall);
      run(sim, 3);
      view.update(sim, 1, 3);
      expect(columns.visible).toBe(false);
      view.dispose();
    } finally { sim.dispose(); }
  }, 60_000);
});
