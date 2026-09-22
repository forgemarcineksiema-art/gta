/**
 * Times the phases of a sim step in the browser. The sim marks the boundaries
 * (`SimPhase`); this owns the clock, because `src/sim` has neither.
 *
 * One `Float64Array` per phase, filled in place: no allocation per step, and a
 * 60 s run at 60 Hz fits in 3600 samples per phase.
 */
import { SIM_PHASES, SimPhase } from '../sim';
import type { Percentiles } from './perf';

const CAPACITY = 60 * 60 * 10;

export interface PhaseReport {
  /** Steps sampled. */
  steps: number;
  /** Per-phase milliseconds per step. */
  phases: Record<string, Percentiles>;
}

export class SimProfile {
  private readonly samples = SIM_PHASES.map(() => new Float64Array(CAPACITY));
  private readonly scratch = new Float64Array(CAPACITY);
  private count = 0;
  private last = 0;

  /** Call immediately before `sim.step()`. */
  readonly begin = (): void => {
    this.last = performance.now();
  };

  /** Install as `SimWorld.mark`. */
  readonly mark = (phase: SimPhase): void => {
    const now = performance.now();
    if (this.count < CAPACITY) (this.samples[phase] as Float64Array)[this.count] = now - this.last;
    this.last = now;
    if (phase === SimPhase.Post && this.count < CAPACITY) this.count++;
  };

  report(): PhaseReport {
    const phases: Record<string, Percentiles> = {};
    for (let p = 0; p < SIM_PHASES.length; p++) {
      phases[SIM_PHASES[p] as string] = percentiles(this.samples[p] as Float64Array, this.count, this.scratch);
    }
    return { steps: this.count, phases };
  }
}

function percentiles(values: Float64Array, count: number, scratch: Float64Array): Percentiles {
  if (count === 0) return { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const v = values[i] as number;
    scratch[i] = v;
    sum += v;
  }
  const sorted = scratch.subarray(0, count);
  sorted.sort();
  const at = (q: number): number => sorted[Math.min(count - 1, Math.floor(q * count))] as number;
  return { mean: sum / count, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted[count - 1] as number };
}
