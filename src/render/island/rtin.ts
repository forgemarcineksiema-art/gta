/**
 * A right-triangulated irregular network over a (2^k + 1)² grid of heights (M8.10 slice 3), the island's ground a chunk
 * at a time: a triangle of the grid's binary tree is split in two while a point under it is off by more than that point
 * allows, so the mesh is coarse where the ground is plain and fine where it bends, and the two triangles on one edge
 * always split together (no cracks inside the grid). Garland and Heckbert's RTIN laid out as Mapbox's Martini does it:
 * every triangle's corners worked out once, the errors bottom-up, the mesh top-down.
 */
export class Rtin {
  /** Grid points a side (2^k + 1). */
  readonly size: number;
  /** Each triangle of the tree: its long edge's ends (a, b), grid steps; the tree's leaves last. */
  private readonly coords: Uint16Array;
  private readonly count: number;
  private readonly parents: number;
  /** Per grid point: how far the coarser mesh misses it past what it allows (> 0 splits the triangles whose long edge it halves). */
  readonly errors: Float32Array;

  constructor(size: number) {
    const tile = size - 1;
    if (tile < 2 || (tile & (tile - 1)) !== 0) throw new Error(`rtin: a side of ${size} points is not 2^k + 1`);
    this.size = size;
    this.count = tile * tile * 2 - 2;
    this.parents = this.count - tile * tile;
    this.coords = new Uint16Array(this.count * 4);
    for (let i = 0; i < this.count; i++) {
      // a triangle's id walks the tree from its root: the lowest bit picks the root, each next bit a half
      let id = i + 2, ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0;
      if (id & 1) { bx = by = cx = tile; } else { ax = ay = cy = tile; }
      while ((id >>= 1) > 1) {
        const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
        if (id & 1) { bx = ax; by = ay; ax = cx; ay = cy; } else { ax = bx; ay = by; bx = cx; by = cy; }
        cx = mx; cy = my;
      }
      const k = i * 4;
      this.coords[k] = ax; this.coords[k + 1] = ay; this.coords[k + 2] = bx; this.coords[k + 3] = by;
    }
    this.errors = new Float32Array(size * size);
  }

  /**
   * Work out the errors for heights `h` (row by row: y × size + x). A point the line between its triangle's long edge's
   * ends passes over by more than `above`, or under by more than `below`, counts the excess; a triangle across `cut`'s
   * zero line (a sign change among its corners) wider than `cutSize` grid steps counts 1, so the cut is drawn fine.
   */
  update(h: Float32Array, above: Float32Array, below: Float32Array, cut: Float32Array | null, cutSize: number): void {
    const size = this.size, coords = this.coords, errors = this.errors;
    errors.fill(0);
    for (let i = this.count - 1; i >= 0; i--) {
      const k = i * 4;
      const ax = coords[k] as number, ay = coords[k + 1] as number, bx = coords[k + 2] as number, by = coords[k + 3] as number;
      const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
      const cx = mx + my - ay, cy = my + ax - mx;
      const a = ay * size + ax, b = by * size + bx, m = my * size + mx;
      const off = ((h[a] as number) + (h[b] as number)) / 2 - (h[m] as number);
      let e = Math.max(off - (above[m] as number), -off - (below[m] as number));
      if (cut && Math.max(Math.abs(ax - bx), Math.abs(ay - by)) > cutSize) {
        const c = cy * size + cx;
        const pa = (cut[a] as number) >= 0, pb = (cut[b] as number) >= 0, pc = (cut[c] as number) >= 0, pm = (cut[m] as number) >= 0;
        if (pa !== pb || pa !== pc || pa !== pm) e = Math.max(e, 1);
      }
      if (e > (errors[m] as number)) errors[m] = e;
      if (i < this.parents) {
        // a parent is split whenever a child is
        const left = ((ay + cy) >> 1) * size + ((ax + cx) >> 1), right = ((by + cy) >> 1) * size + ((bx + cx) >> 1);
        errors[m] = Math.max(errors[m] as number, errors[left] as number, errors[right] as number);
      }
    }
  }

  /** The mesh: every triangle's corners (grid steps) to `emit`, wound so its face looks up when y runs along +z. */
  extract(emit: (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => void): void {
    const max = this.size - 1;
    this.split(0, 0, max, max, max, 0, emit);
    this.split(max, max, 0, 0, 0, max, emit);
  }

  private split(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, emit: (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => void): void {
    const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
    if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && (this.errors[my * this.size + mx] as number) > 0) {
      this.split(cx, cy, ax, ay, mx, my, emit);
      this.split(bx, by, cx, cy, mx, my, emit);
    } else emit(ax, ay, bx, by, cx, cy);
  }
}
