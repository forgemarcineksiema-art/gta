/**
 * The water (docs/M8.9_PLAN.md slice 21): the sea's facets ride one swell, its colour follows the depth under it, foam
 * lines the shore; the depth from the ground's readings.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PALETTE, SEA } from '../../src/sim';
import { VIEW_GRID, type ViewReadings } from '../../src/sim/island/views';
import { CHUNK, CHUNK_X0, CHUNK_Z0 } from '../../src/sim/island/Island';
import { SEA_DEPTH, SEA_LOOK, SEA_TRAINS, lookOfTheSea, seaDepthByte, seaDepthOf, seaFacetNormal, seaFoam, seaShore, seaWater } from '../../src/render/reflect';
import { DEPTH_W, SeaDepth } from '../../src/render/island/seaDepth';

const luminance = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe('the water (M8.9 slice 21)', () => {
  it("M8.9 21.1 the water's colour by the depth under it: the sand's at the edge, turquoise in the shallows, blue in the deep", () => {
    const c = new THREE.Color();
    expect(seaWater(0, c).getHex()).toBe(new THREE.Color(PALETTE.waterShoal).getHex());
    expect(seaWater(5, c).getHex()).toBe(new THREE.Color(PALETTE.waterDeep).getHex());
    // darker the deeper, from the edge out
    let last = Infinity;
    for (let d = 0; d <= 5; d += 0.1) {
      const l = luminance(seaWater(d, c));
      expect(l).toBeLessThanOrEqual(last + 1e-9);
      last = l;
    }
    // the shallows greener than the deep
    const shallow = seaWater(0.9, new THREE.Color()), deep = seaWater(4, new THREE.Color());
    expect(shallow.g / shallow.b).toBeGreaterThan(deep.g / deep.b + 0.1);
  });

  it('M8.9 21.2 the facets are one surface on a swell: neighbours tilt alike (no checkerboard), the swell at deep water\'s speed', () => {
    for (const w of SEA_TRAINS) expect(w.omega ** 2).toBeCloseTo(9.81 * Math.hypot(w.kx, w.kz), 9);
    const n = new THREE.Vector3(), m = new THREE.Vector3();
    expect(seaFacetNormal(12.3, -40.1, 5, 0, n).y).toBeCloseTo(1, 12);
    // a facet and the one a side east of it (their tilts' correlation), and the tilt's size
    let sxy = 0, sxx = 0, syy = 0, sum = 0, count = 0;
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 600; k++) {
      const x = rnd() * 800 - 400, z = rnd() * 800 - 400, t = rnd() * 100;
      seaFacetNormal(x, z, t, 1, n);
      seaFacetNormal(x + SEA_LOOK.facet * 0.82, z, t, 1, m);
      for (const [a, b] of [[n.x, m.x], [n.z, m.z]] as const) { sxy += a * b; sxx += a * a; syy += b * b; }
      sum += n.x * n.x + n.z * n.z;
      count++;
    }
    expect(sxy / Math.sqrt(sxx * syy)).toBeGreaterThan(0.5);
    const rms = Math.sqrt(sum / count);
    expect(rms).toBeGreaterThan(0.05);
    expect(rms).toBeLessThan(0.2);
  });

  it('M8.9 21.3 foam lines the shore: always at the water\'s line, never in deep water, a flat foams at its edge alone', () => {
    const beach = 3.5 / 40;
    for (let t = 0; t < 20; t += 0.37) for (let fine = 0.3; fine <= 1; fine += 0.1) {
      expect(seaFoam(0, beach, t, fine, 1.2)).toBe(true);
      expect(seaFoam(1.5, beach, t, fine, 1.2)).toBe(false);
    }
    // a flat 8 cm deep: hardly any foam over it (the breaker's line crossing it now and then), where on the beach the
    // same water is foam all the time
    let flat = 0, all = 0;
    for (let t = 0; t < 20; t += 0.1) for (let fine = 0; fine <= 1; fine += 0.1) {
      all++;
      if (seaFoam(0.08, 0, t, fine, 0.4)) flat++;
    }
    expect(flat / all).toBeLessThan(0.15);
    // how far out: the depth over the bed's slope, a flat's the least slope
    expect(seaShore(0.35, beach)).toBeCloseTo(4, 9);
    expect(seaShore(0.08, 0)).toBeCloseTo(0.08 / SEA_LOOK.foam.flat, 9);
    // the breaker's line runs in: it reaches 10 m out before 4 m out in its cycle
    const first = (out: number): number => {
      for (let t = 0; t < SEA_LOOK.foam.line.every; t += 0.01) if (seaFoam(out * beach, beach, t, 0.9, 0)) return t;
      return Infinity;
    };
    expect(first(10)).toBeLessThan(first(4));
  });

  it("M8.9 21.4 the depth under the sea from a chunk's readings: each point's texel, the rest deep", () => {
    const depth = new SeaDepth(), n = VIEW_GRID * VIEW_GRID;
    expect(depth.texture.unpackAlignment).toBe(1);
    expect(depth.at(3, 3)).toBe(255);
    expect(seaDepthOf(255)).toBeGreaterThan(SEA_DEPTH.deep);
    // chunk (2, 1): heights (cm) as steps, row by row
    const h = new Int16Array(n), level = (k: number): number => -300 + (k % VIEW_GRID) * 5 + Math.floor(k / VIEW_GRID);
    for (let k = 0; k < n; k++) h[k] = level(k) - (k > 0 ? level(k - 1) : 0);
    depth.write(2, 1, { h } as unknown as ViewReadings);
    for (const k of [0, 64, 65 * 30 + 7, n - 1]) {
      const x = 2 * (VIEW_GRID - 1) + (k % VIEW_GRID), z = 1 * (VIEW_GRID - 1) + Math.floor(k / VIEW_GRID);
      expect(Math.abs(seaDepthOf(depth.at(x, z)) - Math.max(-SEA_DEPTH.above, SEA.level - level(k) / 100))).toBeLessThanOrEqual(0.5 / SEA_DEPTH.scale + 1e-9);
    }
    expect(depth.at(0, 0)).toBe(255);
    // a point's place maps to its texel's middle
    const step = CHUNK / (VIEW_GRID - 1), px = CHUNK_X0 + 130 * step, pz = CHUNK_Z0 + 70 * step;
    expect((px - depth.box.x) * depth.box.z * DEPTH_W).toBeCloseTo(130.5, 9);
    expect((pz - depth.box.y) * depth.box.w * depth.texture.image.height).toBeCloseTo(70.5, 9);
    expect(seaDepthByte(-5)).toBe(0);
    expect(seaDepthByte(99)).toBe(255);
  });

  it("M8.9 21.5 the sea's material reads its depth before the light and reflects after it, its other hooks kept", () => {
    const material = new THREE.MeshLambertMaterial();
    let before = 0;
    material.onBeforeCompile = () => { before++; };
    const depth = new SeaDepth();
    lookOfTheSea(material, depth);
    const shader = { vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} as Record<string, { value: unknown }> };
    material.onBeforeCompile(shader as never, null as never);
    expect(before).toBe(1);
    expect(shader.uniforms['seaDepthMap']?.value).toBe(depth.texture);
    expect(shader.uniforms['seaDepthBox']?.value).toBe(depth.box);
    const fs = shader.fragmentShader;
    expect(fs.indexOf('float seaDepth')).toBeGreaterThan(fs.indexOf('#include <color_fragment>'));
    expect(fs.indexOf('float seaDepth')).toBeLessThan(fs.indexOf('#include <normal_fragment_maps>'));
    expect(fs.indexOf('viewMatrix * vec4( seaN')).toBeGreaterThan(fs.indexOf('#include <normal_fragment_maps>'));
    expect(fs.indexOf('seaSky( seaR )')).toBeGreaterThan(fs.indexOf('#include <opaque_fragment>'));
    expect(fs).toContain('float sunSeen = 1.0;');
    // a sea with no readings (the grid's) is deep everywhere
    const grid = lookOfTheSea(new THREE.MeshLambertMaterial());
    const s2 = { vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} as Record<string, { value: THREE.DataTexture }> };
    grid.onBeforeCompile(s2 as never, null as never);
    expect((s2.uniforms['seaDepthMap']?.value.image.data as Uint8Array)[0]).toBe(255);
  });
});
