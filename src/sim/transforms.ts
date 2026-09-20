/**
 * Double-buffered rigid transforms for render interpolation.
 *
 * The sim writes `curr` every fixed step after copying it to `prev`; the renderer
 * blends between them with the accumulator alpha. Plain typed arrays, no objects
 * per body, so a snapshot costs one `set()` per step.
 */
export class TransformBuffer {
  readonly capacity: number;
  count = 0;
  readonly prevPos: Float32Array;
  readonly currPos: Float32Array;
  readonly prevRot: Float32Array;
  readonly currRot: Float32Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.prevPos = new Float32Array(capacity * 3);
    this.currPos = new Float32Array(capacity * 3);
    this.prevRot = new Float32Array(capacity * 4);
    this.currRot = new Float32Array(capacity * 4);
    // identity rotations
    for (let i = 0; i < capacity; i++) {
      this.prevRot[i * 4 + 3] = 1;
      this.currRot[i * 4 + 3] = 1;
    }
  }

  /** Reserve a slot; returns its index. */
  allocate(): number {
    if (this.count >= this.capacity) throw new Error('TransformBuffer full');
    return this.count++;
  }

  /** Copy current into previous. Call once at the start of each fixed step. */
  swap(): void {
    this.prevPos.set(this.currPos);
    this.prevRot.set(this.currRot);
  }

  write(slot: number, x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number): void {
    const p = slot * 3;
    const r = slot * 4;
    this.currPos[p] = x;
    this.currPos[p + 1] = y;
    this.currPos[p + 2] = z;
    this.currRot[r] = qx;
    this.currRot[r + 1] = qy;
    this.currRot[r + 2] = qz;
    this.currRot[r + 3] = qw;
  }

  /** Write both buffers (teleport without an interpolation streak). */
  writeBoth(slot: number, x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number): void {
    this.write(slot, x, y, z, qx, qy, qz, qw);
    const p = slot * 3;
    const r = slot * 4;
    this.prevPos[p] = x;
    this.prevPos[p + 1] = y;
    this.prevPos[p + 2] = z;
    this.prevRot[r] = qx;
    this.prevRot[r + 1] = qy;
    this.prevRot[r + 2] = qz;
    this.prevRot[r + 3] = qw;
  }
}
