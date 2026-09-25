/**
 * Coral Quay's places drawn (M8.10 slice 11): the kickers (the piers' gap's two, the infield's) from the sim's own
 * profiles; the ferris wheel turning, its gondolas hanging level; the lighthouse's lamp and its two beams turning; the
 * giant duck afloat; the reef's coral seen through the bay's clear shallows. Reads the sim's place each frame (its
 * turns, the duck's pose), never writes it, and allocates nothing a frame.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rampProfile } from '../../../sim/city/jumps';
import { SEA } from '../../../sim/city/sea';
import type { Island } from '../../../sim/island/Island';
import { DUCK, WHEEL, quayPlace, type Kicker, type QuayPlace } from '../../../sim/island/places/quay';
import { REEF } from '../../../sim/island/shapes/quay';
import { PALETTE, QUAY_COLORS } from '../../../sim/palette';
import type { PlaceView } from './index';

/** The gondolas' colours round the wheel. */
const GONDOLAS = [QUAY_COLORS.coral, QUAY_COLORS.seatTeal, QUAY_COLORS.duck, PALETTE.carWhite, PALETTE.carBlue, QUAY_COLORS.coralDeep] as const;
/** A gondola hangs this far under its point on the rim (m). */
const HANG = 1.7;

export function quayViews(group: THREE.Group, island: Island): PlaceView[] {
  const place = quayPlace(island.places);
  if (!place) return [];
  group.add(kickers(place.kickers));
  group.add(reef());
  return [wheel(group, place), lamp(group, place), duck(group, place)];
}

/** A geometry's triangles in one colour (vertex colours, no index, no uvs). */
function coloured(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  geo.deleteAttribute('uv');
  const n = geo.getAttribute('position').count, col = new Float32Array(n * 3), c = new THREE.Color(hex);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Parts merged into one flat-shaded mesh. */
function merged(parts: THREE.BufferGeometry[], shadow = true): THREE.Mesh {
  const geometry = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** The kickers: their red faces along the sim's profile, their sides down to what they stand on, a white lip. */
function kickers(list: readonly Kicker[]): THREE.Mesh {
  const pos: number[] = [], col: number[] = [];
  const red = new THREE.Color(PALETTE.ramp), white = new THREE.Color(PALETTE.barrier);
  for (const { jd, base } of list) {
    const fx = Math.sin(jd.yaw), fz = Math.cos(jd.yaw), rx = -fz, rz = fx, w = jd.halfWidth ?? 2.6;
    const at = (along: number, across: number, y: number): number[] => [jd.x + fx * along + rx * across, base + y, jd.z + fz * along + rz * across];
    const tri = (a: number[], b: number[], c: number[], colour: THREE.Color): void => {
      pos.push(...a, ...b, ...c);
      for (let k = 0; k < 3; k++) col.push(colour.r, colour.g, colour.b);
    };
    const profile = rampProfile(jd);
    for (let k = 0; k + 1 < profile.length; k++) {
      const a = profile[k] as { along: number; y: number }, b = profile[k + 1] as { along: number; y: number };
      const al = at(a.along, -w, a.y), ar = at(a.along, w, a.y), bl = at(b.along, -w, b.y), br = at(b.along, w, b.y);
      tri(al, bl, br, red);
      tri(al, br, ar, red);
      tri(at(a.along, -w, 0), bl, al, red);
      tri(at(a.along, -w, 0), at(b.along, -w, 0), bl, red);
      tri(at(a.along, w, 0), ar, br, red);
      tri(at(a.along, w, 0), br, at(b.along, w, 0), red);
    }
    // a kicker that ends at its lip (the gap's) shows its face there down to its boards
    const last = profile[profile.length - 1] as { along: number; y: number };
    if (last.y > 0.01) {
      tri(at(last.along, -w, 0), at(last.along, w, 0), at(last.along, w, last.y), red);
      tri(at(last.along, -w, 0), at(last.along, w, last.y), at(last.along, -w, last.y), red);
    }
    // the lip: a white band just under the ridge, facing back at the driver
    const ridge = profile.reduce((m, p) => (p.y > m.y ? p : m), profile[0] as { along: number; y: number });
    const l0 = at(ridge.along - 0.02, -w, ridge.y - 0.18), r0 = at(ridge.along - 0.02, w, ridge.y - 0.18);
    const l1 = at(ridge.along - 0.02, -w, ridge.y + 0.02), r1 = at(ridge.along - 0.02, w, ridge.y + 0.02);
    tri(l0, r0, r1, white);
    tri(l0, r1, l1, white);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** The reef: a turquoise halo of shallows round each patch and its coral heads, lying on the sea's surface. */
function reef(): THREE.Mesh {
  const pos: number[] = [], col: number[] = [];
  const blob = (x: number, z: number, r: number, y: number, hex: number, seed: number, points = 9): void => {
    const c = new THREE.Color(hex);
    // an uneven ring, its radius by a fixed wobble of the seed
    const ring: number[][] = [];
    for (let k = 0; k < points; k++) {
      const a = (2 * Math.PI * k) / points, rr = r * (0.78 + 0.22 * Math.abs(Math.sin(seed * 12.9898 + k * 78.233)));
      ring.push([x + Math.cos(a) * rr, y, z + Math.sin(a) * rr]);
    }
    for (let k = 0; k < points; k++) {
      const p = ring[k] as number[], q = ring[(k + 1) % points] as number[];
      // wound to face up
      pos.push(x, y, z, ...q, ...p);
      for (let v = 0; v < 3; v++) col.push(c.r, c.g, c.b);
    }
  };
  REEF.forEach((p, i) => {
    blob(p.x, p.z, p.r * 1.15, SEA.level + 0.03, QUAY_COLORS.shallows, i + 1, 11);
    blob(p.x, p.z, p.r * 0.6, SEA.level + 0.04, QUAY_COLORS.coral, i + 7);
    for (let k = 0; k < 3; k++) {
      const a = i * 2.1 + k * 2.4, d = p.r * 0.45;
      blob(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, p.r * 0.18, SEA.level + 0.05, QUAY_COLORS.coralDeep, i * 3 + k + 13, 6);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  mesh.renderOrder = 1;
  return mesh;
}

/** The ferris wheel: its rims, spokes and hub turning about the axle, its gondolas hanging level from the rim. */
function wheel(group: THREE.Group, place: QuayPlace): PlaceView {
  const w = place.wheel, R = WHEEL.radius, n = WHEEL.gondolas, half = WHEEL.width / 2;
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parts.push(coloured(new THREE.TorusGeometry(R, 0.22, 4, 36).rotateY(Math.PI / 2).translate(side * half, 0, 0), PALETTE.barrier));
    parts.push(coloured(new THREE.TorusGeometry(R * 0.55, 0.12, 4, 24).rotateY(Math.PI / 2).translate(side * half, 0, 0), QUAY_COLORS.coral));
    for (let k = 0; k < n; k++) {
      // a spoke from the hub out to the rim at the gondola's point (the angle from +y toward +z)
      parts.push(coloured(new THREE.BoxGeometry(0.12, R, 0.12).translate(0, R / 2, 0).rotateX((2 * Math.PI * k) / n).translate(side * half, 0, 0), PALETTE.barrier));
    }
  }
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    parts.push(coloured(new THREE.BoxGeometry(WHEEL.width, 0.14, 0.14).translate(0, Math.cos(a) * R, Math.sin(a) * R), PALETTE.steel));
  }
  parts.push(coloured(new THREE.CylinderGeometry(1, 1, WHEEL.width + 2.6, 8).rotateZ(Math.PI / 2), PALETTE.steel));
  const spin = merged(parts);
  spin.position.set(w.x, w.y, w.z);
  group.add(spin);
  // the gondolas: a cabin, its roof and its hanger up to the rim, all drawn from one geometry, each its own colour
  const cabin = mergeGeometries([
    coloured(new THREE.BoxGeometry(2, 1.5, 2).translate(0, 0, 0), PALETTE.carWhite),
    coloured(new THREE.BoxGeometry(2.3, 0.25, 2.3).translate(0, 0.9, 0), PALETTE.carWhite),
    coloured(new THREE.BoxGeometry(0.1, HANG - 0.9, 0.1).translate(0, 0.9 + (HANG - 0.9) / 2, 0), PALETTE.steel),
  ], false);
  const gondolas = new THREE.InstancedMesh(cabin, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), n);
  const tint = new THREE.Color();
  for (let k = 0; k < n; k++) gondolas.setColorAt(k, tint.setHex(GONDOLAS[k % GONDOLAS.length] as number));
  gondolas.castShadow = true;
  // their places change every frame: never culled by the geometry's own bounds at the origin
  gondolas.frustumCulled = false;
  group.add(gondolas);
  const m = new THREE.Matrix4();
  const update = (alpha: number): void => {
    const angle = w.prev + (w.angle - w.prev) * alpha;
    spin.rotation.x = angle;
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n + angle;
      m.makeTranslation(w.x, w.y + Math.cos(a) * R - HANG, w.z + Math.sin(a) * R);
      gondolas.setMatrixAt(k, m);
    }
    gondolas.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { update };
}

/** The lighthouse's lamp: a bright housing and two beams out over the sea, turning. */
function lamp(group: THREE.Group, place: QuayPlace): PlaceView {
  const l = place.lamp, g = new THREE.Group();
  g.position.set(l.x, l.y, l.z);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 0.8), new THREE.MeshBasicMaterial({ color: 0xfff1b8 }));
  // the beams: open cones from the lamp, one each way
  const beam = new THREE.ConeGeometry(4, 60, 10, 1, true).translate(0, -30, 0);
  const beams = mergeGeometries([beam.clone().rotateZ(Math.PI / 2), beam.clone().rotateZ(-Math.PI / 2)], false);
  beam.dispose();
  const light = new THREE.Mesh(beams, new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  g.add(housing, light);
  group.add(g);
  const update = (alpha: number): void => { g.rotation.y = l.prev + (l.angle - l.prev) * alpha; };
  update(0);
  return { update };
}

/** The giant duck: its body, head, beak, eyes and tail in rubber yellow, set on its pose between the last two steps. */
function duck(group: THREE.Group, place: QuayPlace): PlaceView {
  const d = place.duck, head = DUCK.head;
  const mesh = merged([
    coloured(new THREE.SphereGeometry(1, 12, 8).scale(5.4, 3, 3.8).translate(0, 0.1, 0), QUAY_COLORS.duck),
    coloured(new THREE.SphereGeometry(head.radius, 10, 8).translate(head.x, head.y, 0), QUAY_COLORS.duck),
    coloured(new THREE.ConeGeometry(1, 2.2, 6).rotateZ(-Math.PI / 2).scale(1, 0.5, 1).translate(head.x + head.radius + 0.8, head.y - 0.4, 0), QUAY_COLORS.beak),
    coloured(new THREE.SphereGeometry(0.36, 6, 4).translate(head.x + 1.6, head.y + 0.95, 1.45), PALETTE.ink),
    coloured(new THREE.SphereGeometry(0.36, 6, 4).translate(head.x + 1.6, head.y + 0.95, -1.45), PALETTE.ink),
    coloured(new THREE.ConeGeometry(1.1, 2.4, 6).rotateZ(Math.PI / 4).translate(-5.2, 1.8, 0), QUAY_COLORS.duck),
    // the wings: two flattened lobes on its sides
    coloured(new THREE.SphereGeometry(1, 8, 6).scale(2.6, 1.1, 0.6).translate(-0.6, 1, 3.5), QUAY_COLORS.duck),
    coloured(new THREE.SphereGeometry(1, 8, 6).scale(2.6, 1.1, 0.6).translate(-0.6, 1, -3.5), QUAY_COLORS.duck),
  ]);
  group.add(mesh);
  const update = (alpha: number): void => {
    mesh.position.set(d.px + (d.x - d.px) * alpha, d.py + (d.y - d.py) * alpha, d.pz + (d.z - d.pz) * alpha);
    const turn = Math.atan2(Math.sin(d.yaw - d.pyaw), Math.cos(d.yaw - d.pyaw));
    mesh.rotation.y = d.pyaw + turn * alpha;
  };
  update(1);
  return { update };
}
