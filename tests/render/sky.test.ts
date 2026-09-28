/**
 * The golden hour (docs/M8.9_PLAN.md R8, slice 2): the sun low and warm, the fog and the background the horizon's colour.
 * The sky per pixel (R13, slice 16): one function of a direction for the dome and the fog, dark behind the HUD, the
 * evening's arch away from the sun.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CITY_COLORS, PALETTE } from '../../src/sim/palette';
import { SUN_OFFSET } from '../../src/render/shadows';
import { CLOUDS, Clouds, cloudDrift, cloudFragment, cloudGeometry, cloudLight, cloudPuffs } from '../../src/render/clouds';
import { SKY, SUN_DISC, Sky, TONE_MAPPING, domeFragment, skyAt, skyDirection, skyGlsl, sunBearing, sunDiscDirection, toneMap } from '../../src/render/sky';

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
    new Clouds(scene);
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

/** A puff's elevation from the eye (°) and its bearing off the sun's (°, −180..180). */
const elevationOf = (p: { x: number; y: number; z: number }): number => THREE.MathUtils.radToDeg(Math.atan2(p.y, Math.hypot(p.x, p.z)));
const offSun = (p: { x: number; z: number }): number => {
  const d = Math.atan2(p.x, p.z) - sunBearing();
  return THREE.MathUtils.radToDeg(Math.atan2(Math.sin(d), Math.cos(d)));
};

describe('clouds with a body (M8.9 slice 18, R13)', () => {
  it("M8.9 18.1 banks low round the whole horizon, more on the sun's side; streaks higher in its half; the same sky every time", () => {
    const puffs = cloudPuffs(), banks = puffs.filter((p) => p.kind === 'bank'), streaks = puffs.filter((p) => p.kind === 'streak');
    for (const p of banks) {
      expect(elevationOf(p)).toBeGreaterThanOrEqual(CLOUDS.banks.low);
      expect(elevationOf(p)).toBeLessThanOrEqual(CLOUDS.banks.top);
    }
    const quarters = [0, 0, 0, 0];
    for (const p of banks) quarters[Math.min(3, Math.floor((offSun(p) + 180) / 90))]! += 1;
    for (const q of quarters) expect(q).toBeGreaterThanOrEqual(2);
    const sunSide = banks.filter((p) => Math.abs(offSun(p)) <= 90).length;
    expect(sunSide).toBeGreaterThan(banks.length - sunSide);
    expect(streaks.length).toBeGreaterThanOrEqual(CLOUDS.streaks.count * 2);
    for (const p of streaks) {
      expect(elevationOf(p)).toBeGreaterThanOrEqual(CLOUDS.streaks.low - 1);
      expect(elevationOf(p)).toBeLessThanOrEqual(CLOUDS.streaks.high + 1);
      expect(Math.abs(offSun(p))).toBeLessThanOrEqual(90);
    }
    expect(cloudPuffs()).toEqual(puffs);
  });

  it('M8.9 18.2 away from the sun a face turned to it is warmer and brighter than the sky beside it; toward it a rim outshines the body', () => {
    const sun = sunDiscDirection(new THREE.Vector3()), c = new THREE.Color(), sky = new THREE.Color();
    // opposite the sun, 6° up: the face we see looks back at the sun
    const away = skyDirection(sunBearing() + Math.PI, 6, new THREE.Vector3());
    const face = new THREE.Vector3(-away.x, 0.2, -away.z).normalize();
    cloudLight(face, away, c); skyAt(away, sky);
    expect(luminance(c)).toBeGreaterThan(luminance(sky));
    expect(c.r / c.b).toBeGreaterThan(sky.r / sky.b);
    // toward the sun, 4° off it: the body faces the eye, the rim is at a grazing angle to it
    const toward = skyDirection(sunBearing() + THREE.MathUtils.degToRad(4), SUN_DISC.elevation + 2, new THREE.Vector3());
    const body = toward.clone().negate(), rim = new THREE.Vector3().crossVectors(toward, new THREE.Vector3(0, 1, 0)).normalize().addScaledVector(toward, 0.1).normalize();
    const lit = luminance(cloudLight(rim, toward, new THREE.Color())), dark = luminance(cloudLight(body, toward, new THREE.Color()));
    expect(lit).toBeGreaterThan(1.5 * dark);
    // and the body is darker than the sky round the sun behind it
    expect(dark).toBeLessThan(luminance(skyAt(toward, new THREE.Color())));
    expect(sun.y).toBeGreaterThan(0);
  });

  it("M8.9 18.3 one draw; the sky's triangles no more than before slice 16 (the dome 48×36, twelve octagons, the disc's fan and ring)", () => {
    const scene = new THREE.Scene();
    new Sky(scene);
    const clouds = new Clouds(scene);
    let meshes = 0, triangles = 0;
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      meshes++;
      const g = o.geometry as THREE.BufferGeometry;
      triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    });
    expect(meshes).toBe(2);
    expect(triangles).toBeLessThanOrEqual(48 * 36 * 2 + 12 * 8 + 32 * 3);
    expect(clouds.mesh.geometry.getAttribute('position').count).toBe(cloudGeometry().getAttribute('position').count);
    // their depth among themselves only: cleared after their draw, before the world's
    expect(clouds.mesh.renderOrder).toBeLessThan(0);
    for (const inc of ['<tonemapping_fragment>', '<colorspace_fragment>', '<dithering_fragment>']) expect(cloudFragment()).toContain(inc);
  });

  it('M8.9 18.4 the swing stays within 12° each way and comes back in twenty minutes; the light follows the world normals', () => {
    let widest = 0;
    for (let t = 0; t <= CLOUDS.drift.period; t += 5) widest = Math.max(widest, Math.abs(cloudDrift(t)));
    expect(THREE.MathUtils.radToDeg(widest)).toBeCloseTo(CLOUDS.drift.swing, 1);
    expect(CLOUDS.drift.period).toBe(1200);
    expect(cloudDrift(CLOUDS.drift.period)).toBeCloseTo(0, 9);
    const clouds = new Clouds(new THREE.Scene());
    clouds.update(new THREE.Vector3(1, 2, 3), 300);
    expect(clouds.mesh.rotation.y).toBeCloseTo(cloudDrift(300), 9);
    expect(clouds.mesh.position.toArray()).toEqual([1, 2, 3]);
    expect(cloudFragment()).toContain('n = normalize( vCloudNormal )');
  });
});
