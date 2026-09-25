/**
 * The island plan's geometry (M8.10, docs/M8.10_PLAN.md slice 0): points as [x, z] pairs in metres (x east, z south),
 * as the plan writes them. Plan-time helpers: they allocate, and nothing per step calls them.
 */

/** A point of the plan: x east, z south (m). */
export type P2 = readonly [number, number];

/**
 * A Catmull-Rom curve through `points`, sampled every `spacing` m or so (each span its own count of samples). Open: the
 * first and last points are kept; closed: the curve returns to its first point without repeating it.
 */
export function catmullRom(points: readonly P2[], closed: boolean, spacing: number, spanOf?: number[]): [number, number][] {
  const n = points.length;
  const at = (i: number): P2 => (closed ? points[((i % n) + n) % n] : points[Math.max(0, Math.min(n - 1, i))]) as P2;
  const out: [number, number][] = [];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / spacing));
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      // the control span each point starts, when asked (the coast's kinds are named by span)
      spanOf?.push(i);
    }
  }
  if (!closed) {
    const last = points[n - 1] as P2;
    out.push([last[0], last[1]]);
  }
  return out;
}

/** Straight segments resampled every `step` m or so (both ends kept). */
export function resample(points: readonly P2[], step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as P2, b = points[i + 1] as P2;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const last = points[points.length - 1] as P2;
  out.push([last[0], last[1]]);
  return out;
}

/** A circle as a closed polygon of `n` points, counter-clockwise on the map (clockwise in x, z). */
export function circle(cx: number, cz: number, r: number, n = 48): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

/** An ellipse as a closed polygon. */
export function ellipse(cx: number, cz: number, rx: number, rz: number, n = 48): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]);
  }
  return out;
}

/** A rectangle with rounded corners as a closed polygon. */
export function roundedRect(x0: number, z0: number, x1: number, z1: number, r: number, perCorner = 6): [number, number][] {
  const out: [number, number][] = [];
  const corners: ReadonlyArray<readonly [number, number, number]> = [[x1 - r, z0 + r, -Math.PI / 2], [x1 - r, z1 - r, 0], [x0 + r, z1 - r, Math.PI / 2], [x0 + r, z0 + r, Math.PI]];
  for (const [cx, cz, a0] of corners) {
    for (let k = 0; k <= perCorner; k++) {
      const a = a0 + (k / perCorner) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  }
  return out;
}

/** Whether (x, z) is inside the closed polygon (even-odd). */
export function inPolygon(x: number, z: number, poly: readonly P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as P2, b = poly[j] as P2;
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** The closed polygon's area (m²), whatever its winding. */
export function polygonArea(poly: readonly P2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[i] as P2, q = poly[j] as P2;
    a += (q[0] + p[0]) * (q[1] - p[1]);
  }
  return Math.abs(a) / 2;
}

/** The closed polygon's signed area (m²): positive when its inside lies left of the way it runs (left of +x is +z). */
export function signedArea(poly: readonly P2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[j] as P2, q = poly[i] as P2;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Distance from (x, z) to the polyline. */
export function distanceToPolyline(x: number, z: number, pts: readonly P2[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as P2, b = pts[i + 1] as P2;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return best;
}

/** The polyline's length (m). */
export function polylineLength(pts: readonly P2[]): number {
  let l = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as P2, b = pts[i + 1] as P2;
    l += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return l;
}

/** Whether the segments a–b and c–d cross (touching ends do not count). */
export function segmentsCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2): number => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Whether the closed polygon crosses itself (two edges that are not neighbours cross). */
export function selfCrossing(poly: readonly P2[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i] as P2, b = poly[(i + 1) % n] as P2;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(a, b, poly[j] as P2, poly[(j + 1) % n] as P2)) return true;
    }
  }
  return false;
}

/** The x of a polyline monotone in z at a given z (or the z at a given x, `alongX`), clamped to its ends. */
export function crossAt(pts: readonly P2[], v: number, alongX = false): number {
  const k: 0 | 1 = alongX ? 0 : 1, o: 0 | 1 = alongX ? 1 : 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as P2, b = pts[i + 1] as P2;
    if ((v - a[k]) * (v - b[k]) <= 0 && a[k] !== b[k]) return a[o] + ((b[o] - a[o]) * (v - a[k])) / (b[k] - a[k]);
  }
  const first = pts[0] as P2, last = pts[pts.length - 1] as P2;
  return Math.abs(v - first[k]) < Math.abs(v - last[k]) ? first[o] : last[o];
}
