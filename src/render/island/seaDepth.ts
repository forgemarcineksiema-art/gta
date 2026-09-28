/**
 * The depth under the sea (M8.9 slice 21): a byte for each point of the island's view grid (`VIEW_GRID` a chunk's side,
 * the chunks sharing their borders' points), the water's depth over the ground there (`SEA_DEPTH`'s bytes), written a
 * chunk at a time from its readings as the ground's view makes its mesh; the sea's material reads it through a linear
 * filter, so its shallows, their colour and the foam follow the shore between the points. A point not yet written is
 * deep. Reads the sim's island, never writes it.
 */
import * as THREE from 'three';
import { SEA } from '../../sim';
import { CHUNK, CHUNKS_X, CHUNKS_Z, CHUNK_X0, CHUNK_Z0 } from '../../sim/island/Island';
import { VIEW_GRID, type ViewReadings } from '../../sim/island/views';
import { seaDepthByte, type SeaDepthSource } from '../reflect';

/** The map's points across and down: every chunk's grid, their borders shared. */
export const DEPTH_W = CHUNKS_X * (VIEW_GRID - 1) + 1;
export const DEPTH_H = CHUNKS_Z * (VIEW_GRID - 1) + 1;
/** Between two points (m). */
const STEP = CHUNK / (VIEW_GRID - 1);

export class SeaDepth implements SeaDepthSource {
  private readonly data = new Uint8Array(DEPTH_W * DEPTH_H).fill(255);
  readonly texture = new THREE.DataTexture(this.data, DEPTH_W, DEPTH_H, THREE.RedFormat, THREE.UnsignedByteType);
  /** A point's texel's middle at its place: (x0, z0) half a step before the first point, a texel a step. */
  readonly box = new THREE.Vector4(CHUNK_X0 - STEP / 2, CHUNK_Z0 - STEP / 2, 1 / (DEPTH_W * STEP), 1 / (DEPTH_H * STEP));

  constructor() {
    const t = this.texture;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    // rows of an odd width, a byte a texel
    t.unpackAlignment = 1;
    t.needsUpdate = true;
  }

  /** Chunk (i, j)'s points from its readings (their heights as steps, cm, row by row). */
  write(i: number, j: number, v: ViewReadings): void {
    const n = VIEW_GRID;
    let h = 0;
    for (let k = 0; k < n * n; k++) {
      h += v.h[k] as number;
      const x = i * (n - 1) + (k % n), z = j * (n - 1) + Math.floor(k / n);
      this.data[z * DEPTH_W + x] = seaDepthByte(SEA.level - h / 100);
    }
    this.texture.needsUpdate = true;
  }

  /** The byte at the point (x, z) of the map (the pins'). */
  at(x: number, z: number): number {
    return this.data[z * DEPTH_W + x] as number;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
