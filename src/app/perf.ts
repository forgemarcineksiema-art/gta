/**
 * Frame-time probe for the autopilot perf run. Collects per-frame numbers for
 * `duration` seconds after gameplay starts and publishes percentiles into
 * `window.__perf` (read by e2e/perf.spec.ts and the smoke test).
 */
import type { RenderStats } from '../render/Renderer';

export interface Percentiles {
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface PerfResult {
  frames: number;
  durationSec: number;
  fpsMean: number;
  frameMs: Percentiles;
  stepMs: Percentiles;
  drawCalls: { mean: number; max: number };
  triangles: { mean: number; max: number };
  heapMb: { start: number; end: number; max: number };
  droppedTime: number;
  botResets: number;
  dpr: number;
  width: number;
  height: number;
  userAgent: string;
  glRenderer: string;
  /** True when the GL renderer looks like a software rasterizer (SwiftShader, llvmpipe). */
  softwareGl: boolean;
}

declare global {
  interface Window {
    __perf?: PerfResult;
    __perfDone?: boolean;
  }
}

export class PerfProbe {
  readonly duration: number;
  private readonly frameMs: number[] = [];
  private readonly stepMs: number[] = [];
  private readonly draws: number[] = [];
  private readonly tris: number[] = [];
  private heapStart = 0;
  private heapMax = 0;
  private heapEnd = 0;
  private elapsed = 0;
  done = false;
  result: PerfResult | null = null;

  constructor(durationSec: number) {
    this.duration = durationSec;
    this.frameMs.length = 0;
  }

  frame(frameMs: number, stepMs: number, stats: RenderStats, dropped: number, botResets: number): void {
    if (this.done) return;
    const heap = heapMb();
    if (this.frameMs.length === 0) this.heapStart = heap;
    this.heapMax = Math.max(this.heapMax, heap);
    this.heapEnd = heap;
    this.frameMs.push(frameMs);
    this.stepMs.push(stepMs);
    this.draws.push(stats.drawCalls);
    this.tris.push(stats.triangles);
    this.elapsed += frameMs / 1000;
    if (this.elapsed >= this.duration) this.finish(stats, dropped, botResets);
  }

  private finish(stats: RenderStats, dropped: number, botResets: number): void {
    this.done = true;
    this.result = {
      frames: this.frameMs.length,
      durationSec: this.elapsed,
      fpsMean: this.frameMs.length / this.elapsed,
      frameMs: percentiles(this.frameMs),
      stepMs: percentiles(this.stepMs),
      drawCalls: { mean: mean(this.draws), max: Math.max(...this.draws) },
      triangles: { mean: mean(this.tris), max: Math.max(...this.tris) },
      heapMb: { start: this.heapStart, end: this.heapEnd, max: this.heapMax },
      droppedTime: dropped,
      botResets,
      dpr: stats.dpr,
      width: stats.width,
      height: stats.height,
      userAgent: navigator.userAgent,
      glRenderer: stats.glRenderer,
      softwareGl: /swiftshader|llvmpipe|software|mesa offscreen/i.test(stats.glRenderer),
    };
    window.__perf = this.result;
    window.__perfDone = true;
  }
}

export function heapMb(): number {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? m.usedJSHeapSize / (1024 * 1024) : 0;
}

function mean(a: number[]): number {
  if (a.length === 0) return 0;
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}

function percentiles(a: number[]): Percentiles {
  if (a.length === 0) return { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const s = [...a].sort((x, y) => x - y);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] as number;
  return { mean: mean(a), p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s[s.length - 1] as number };
}
