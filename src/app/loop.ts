/**
 * Fixed-step accumulator. The sim advances in whole 1/60 s steps regardless of
 * the display's refresh rate; the renderer interpolates with `alpha`.
 * Substeps per frame are capped so a hitch can't spiral: excess time is dropped
 * (the game slows down for a frame instead of freezing).
 */
export class FixedStepLoop {
  readonly dt: number;
  readonly maxSubsteps: number;
  private accumulator = 0;
  /** Steps executed on the last `advance` call. */
  lastSteps = 0;
  /** Total dropped simulation time (diagnostic). */
  droppedTime = 0;

  constructor(dt: number, maxSubsteps = 5) {
    this.dt = dt;
    this.maxSubsteps = maxSubsteps;
  }

  /**
   * Feed `frameDt` seconds of wall time; `step` is called once per fixed step.
   * Returns the interpolation alpha in [0, 1).
   */
  advance(frameDt: number, step: () => void): number {
    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxSubsteps) {
      step();
      this.accumulator -= this.dt;
      steps++;
    }
    if (this.accumulator >= this.dt) {
      // hitch: drop what we can't catch up on
      this.droppedTime += this.accumulator;
      this.accumulator = 0;
    }
    this.lastSteps = steps;
    return this.accumulator / this.dt;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
