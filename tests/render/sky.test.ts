/**
 * The golden hour (docs/M8.9_PLAN.md R8, slice 2): the sun low and warm, the fog and the background the horizon's colour.
 * The sky per pixel (R13, slice 16): one function of a direction for the dome and the fog, dark behind the HUD, the
 * evening's arch away from the sun.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CITY_COLORS, PALETTE } from '../../src/sim/palette';
import { SUN_OFFSET } from '../../src/render/shadows';
import { CLOUDS, SKY, SUN_DISC, Sky, TONE_MAPPING, cloudLayout, domeFragment, skyAt, skyDirection, skyGlsl, sunBearing, sunDiscDirection, toneMap } from '../../src/render/sky';

/** Relative luminance of a linear colour (three's working space is linear sRGB). */
const luminance = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe('the golden hour (M8.9 slice 2)', () => {
  it('M8.9 2.1 the sun stands 25°–35° over the horizon on its old bearing, warmer and stronger than the fill', () => {
    const horizontal = Math.hypot(SUN_OFFSET.x, SUN_OFFSET.z);
    const elevation = THREE.MathUtils.radToDeg(Math.atan2(SUN_OFFSET.y, horizontal));
    expect(elevation).toBeGreaterThanOrEqual(25);
    expect(elevation).toBeLessThanOrEqual(35);
    // the bearing of M2's sun (-60, 70, -40): the same heading in the ground plane
    expect(Math.atan2(SUN_OFFSET.x, SUN_OFFSET.z)).toBeCloseTo(Math.atan2(-60, -40), 6);
    // a wall turned to the sun takes at least two thirds of its light from the sun (both go through the same Lambert
    // term: the sun's colour × intensity × cos of its elevation, the fill's half-way colour × intensity)
    const sun = new THREE.Color(SKY.sun.color);
    const fill = new THREE.Color(SKY.fill.ground).lerp(new THREE.Color(SKY.fill.sky), 0.5);
    const fromSun = luminance(sun) * SKY.sun.intensity * Math.cos(THREE.MathUtils.degToRad(elevation));
    const fromFill = luminance(fill) * SKY.fill.intensity;
    expect(fromSun / (fromSun + fromFill)).toBeGreaterThanOrEqual(2 / 3);
    // warm: its red twice its blue
    expect(sun.r).toBeGreaterThan(sun.b * 2);
  });

  it('M8.9 2.3 the fog and the background are the horizon\'s colour', () => {
    expect(PALETTE.fog).toBe(PALETTE.skyHorizon);
    expect(SKY.stops[0]?.color).toBe(PALETTE.skyHorizon);
    expect(SKY.stops[0]?.at).toBe(0);
  });

  it("2.4 the fog takes the dome's colour by its elevation from the eye (the third bug hunt: a tall thing far off fogged to peach against violet)", () => {
    new Sky(new THREE.Scene());
    const chunk = THREE.ShaderChunk as Record<string, string>;
    expect(chunk['fog_fragment']).toContain('mix( gl_FragColor.rgb, fogSky( normalize( vFogDir ) ), fogFactor )');
    expect(chunk['fog_fragment']).not.toContain('fogColor, fogFactor');
    expect(chunk['fog_vertex']).toContain('vFogDir = transpose( mat3( viewMatrix ) ) * mvPosition.xyz;');
    expect(chunk['fog_pars_fragment']).toContain('vec3 fogSky( vec3 d )');
    // at the horizon, away from the sun, the fog's own colour as before
    const h = new THREE.Color(PALETTE.skyHorizon);
    expect(chunk['fog_pars_fragment']).toContain(`vec3( ${h.r.toFixed(5)}, ${h.g.toFixed(5)}, ${h.b.toFixed(5)} )`);
  });
});

describe('the sun and the clouds (M8.9 slice 4)', () => {
  it('M8.9 4.1 the sun is seen on the light\'s bearing, low in the warm band', () => {
    const d = sunDiscDirection(new THREE.Vector3());
    expect(Math.atan2(d.x, d.z)).toBeCloseTo(Math.atan2(SUN_OFFSET.x, SUN_OFFSET.z), 6);
    const elevation = THREE.MathUtils.radToDeg(Math.asin(d.y));
    expect(elevation).toBeGreaterThan(3);
    expect(elevation).toBeLessThanOrEqual(12);
    expect(elevation).toBeCloseTo(SUN_DISC.elevation, 6);
  });

  it('M8.9 4.2 the clouds sit between 8° and 25° up, in the sun\'s half of the sky, the same every time', () => {
    const clouds = cloudLayout();
    expect(clouds.length).toBe(CLOUDS.count);
    for (const c of clouds) {
      expect(c.elevation).toBeGreaterThanOrEqual(8);
      expect(c.elevation).toBeLessThanOrEqual(25);
      const off = Math.atan2(Math.sin(c.bearing - sunBearing()), Math.cos(c.bearing - sunBearing()));
      expect(Math.abs(off)).toBeLessThanOrEqual(Math.PI / 2);
    }
    expect(cloudLayout()).toEqual(clouds);
  });
});

/** The sky at a bearing off the sun's (degrees) and an elevation (degrees). */
const sky = (off: number, elevation: number, out = new THREE.Color()): THREE.Color =>
  skyAt(skyDirection(sunBearing() + THREE.MathUtils.degToRad(off), elevation, new THREE.Vector3()), out);

describe('the sky per pixel (M8.9 slice 16, R13)', () => {
  it('M8.9 16.1 behind the HUD (13°–22° up) the frame turned to the sun averages 0.18 or less, and 45° or more from it every point does', () => {
    // the chase camera's 62° at 16:9 spans ±47° of bearing
    let sum = 0, n = 0;
    for (let a = -47; a <= 47; a += 1) for (let e = 13; e <= 22; e += 0.5) { sum += luminance(sky(a, e)); n++; }
    expect(sum / n).toBeLessThanOrEqual(0.18);
    for (let a = 45; a <= 180; a += 5) for (let e = 13; e <= 90; e += 1) {
      expect(luminance(sky(a, e))).toBeLessThanOrEqual(0.18);
      expect(luminance(sky(-a, e))).toBeLessThanOrEqual(0.18);
    }
    // under the horizon the horizon's colour
    expect(sky(90, -10).getHex()).toBe(sky(90, 0).getHex());
  });

  it('M8.9 16.2 away from the sun the horizon is cooler than toward it, under a rose band that peaks 3°–12° up', () => {
    const toward = sky(0, 0), away = sky(180, 0);
    expect(away.b / away.r).toBeGreaterThan(1.5 * (toward.b / toward.r));
    let best = 0, at = -1;
    for (let e = 0; e <= 30; e += 0.25) {
      const l = luminance(sky(180, e));
      if (l > best) { best = l; at = e; }
    }
    expect(at).toBeGreaterThanOrEqual(3);
    expect(at).toBeLessThanOrEqual(12);
    // the band is rose: red over green and blue at its peak
    const peak = sky(180, at);
    expect(peak.r).toBeGreaterThan(peak.b);
    expect(peak.r).toBeGreaterThan(peak.g);
    // toward the sun the sky brightens to the disc, without an edge: each degree nearer is brighter
    for (let e = SUN_DISC.elevation + 30; e > SUN_DISC.elevation + SKY.disc.radius; e -= 1) {
      expect(luminance(sky(0, e - 1))).toBeGreaterThan(luminance(sky(0, e)));
    }
  });

  it("M8.9 16.3 the dome and the fog take one source of the sky's function; the fog calls it in place of its colour", () => {
    new Sky(new THREE.Scene());
    const chunk = THREE.ShaderChunk as Record<string, string>;
    const glsl = skyGlsl();
    expect(glsl).toContain('vec3 skyAt( vec3 d )');
    expect(chunk['fog_pars_fragment']).toContain(glsl);
    expect(domeFragment()).toContain(glsl);
    // the dome ends in three's tone mapping, colour space and dither, as every lit material does
    for (const inc of ['<tonemapping_fragment>', '<colorspace_fragment>', '<dithering_fragment>']) expect(domeFragment()).toContain(inc);
  });

  it('M8.9 16.4 the sky is two meshes, the dome and the clouds (the disc is in the dome: one draw fewer than slice 4)', () => {
    const scene = new THREE.Scene();
    new Sky(scene);
    let meshes = 0;
    scene.traverse((o) => { if (o instanceof THREE.Mesh) meshes++; });
    expect(meshes).toBe(2);
  });
});

/**
 * A Lambert face's colour (linear) as three lights it: the sun through `dotNL` (its share in shade `1 - SKY.shadow`), and
 * the hemisphere's fill by the face's normal, each over π.
 */
function lambert(albedo: number, n: THREE.Vector3, lit: boolean): THREE.Color {
  const l = SUN_OFFSET.clone().normalize();
  const fill = new THREE.Color(SKY.fill.ground).lerp(new THREE.Color(SKY.fill.sky), 0.5 * n.y + 0.5).multiplyScalar(SKY.fill.intensity);
  const sun = new THREE.Color(SKY.sun.color).multiplyScalar(SKY.sun.intensity * Math.max(0, n.dot(l)) * (lit ? 1 : 1 - SKY.shadow));
  return new THREE.Color(albedo).multiply(sun.add(fill)).multiplyScalar(1 / Math.PI);
}

describe('light with headroom (M8.9 slice 17, R13)', () => {
  it("M8.9 17.1 the renderer tone maps in three's custom slot, filled once with Neutral's shoulder", () => {
    expect(TONE_MAPPING).toBe(THREE.CustomToneMapping);
    new Sky(new THREE.Scene());
    new Sky(new THREE.Scene());
    const pars = (THREE.ShaderChunk as Record<string, string>)['tonemapping_pars_fragment'] ?? '';
    expect(pars).not.toContain('vec3 CustomToneMapping( vec3 color ) { return color; }');
    expect(pars.match(/vec3 CustomToneMapping\(/g)?.length).toBe(1);
    expect(pars).toContain(`if ( peak < ${SKY.tone.knee.toFixed(4)} ) return color;`);
  });

  it('M8.9 17.2 under the knee a colour passes unchanged (no toe: the asphalt keeps its dark); over it the light rolls off, never past white', () => {
    for (const hex of [PALETTE.asphalt, CITY_COLORS.brick, CITY_COLORS.window, PALETTE.skyTop]) {
      const c = new THREE.Color(hex).multiplyScalar(0.3), t = toneMap(c);
      expect(t.r).toBeCloseTo(c.r, 6); expect(t.g).toBeCloseTo(c.g, 6); expect(t.b).toBeCloseTo(c.b, 6);
    }
    let last = 0;
    for (let x = 0.5; x <= 16; x *= 1.25) {
      const t = toneMap(new THREE.Color(x, x * 0.6, x * 0.3));
      expect(t.r).toBeLessThanOrEqual(1);
      expect(t.r).toBeGreaterThanOrEqual(last);
      last = t.r;
    }
    // a chalk facade square to the sun stays under 250 on every channel (§1.2), its sun at slice 17's strength
    const wall = new THREE.Vector3(SUN_OFFSET.x, 0, SUN_OFFSET.z).normalize();
    const lit = toneMap(lambert(CITY_COLORS.chalk, wall, true));
    const srgb = lit.clone().convertLinearToSRGB();
    for (const ch of [srgb.r, srgb.g, srgb.b]) expect(ch * 255).toBeLessThan(250);
  });

  it('M8.9 17.3 a wall in the sun comes out warmer than in shade and at least three times as bright', () => {
    const wall = new THREE.Vector3(SUN_OFFSET.x, 0, SUN_OFFSET.z).normalize();
    for (const hex of [CITY_COLORS.chalk, CITY_COLORS.stone, CITY_COLORS.peach]) {
      const sun = toneMap(lambert(hex, wall, true)), shade = toneMap(lambert(hex, wall, false));
      expect(sun.r / sun.b).toBeGreaterThan(shade.r / shade.b);
      expect(luminance(sun)).toBeGreaterThanOrEqual(3 * luminance(shade));
    }
  });
});
