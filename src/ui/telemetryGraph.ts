/**
 * Scrolling telemetry traces on a small canvas: speed, lateral and longitudinal
 * g, tyre slip, steering, throttle and brake. Ten seconds of history from a ring
 * buffer, redrawn a few times a second. Dev-only; reads sim telemetry only.
 */
import type { VehicleTelemetry } from '../sim';

const HISTORY = 600; // ticks (10 s at 60 Hz)

interface Trace {
  label: string;
  color: string;
  /** Value range mapped to the full height. */
  min: number;
  max: number;
  get(tm: VehicleTelemetry): number;
  data: Float32Array;
}

export class TelemetryGraph {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly traces: Trace[];
  private head = 0;
  private filled = 0;
  private lastDraw = 0;

  constructor(parent: HTMLElement, width = 300, height = 150) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'devpanel__graph';
    this.canvas.width = width * 2;
    this.canvas.height = height * 2;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    parent.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context');
    this.ctx = ctx;
    const mk = (label: string, color: string, min: number, max: number, get: (tm: VehicleTelemetry) => number): Trace => ({ label, color, min, max, get, data: new Float32Array(HISTORY) });
    this.traces = [
      mk('km/h', '#f7f3ea', 0, 240, (tm) => Math.abs(tm.speedKmh)),
      mk('g lat', '#2bd1ff', -3, 3, (tm) => tm.gLat),
      mk('g long', '#ffd23f', -3, 3, (tm) => tm.gLong),
      mk('slip°', '#ff3b5c', 0, 45, (tm) => tm.maxSlipDeg),
      mk('steer', '#b6f542', -1, 1, (tm) => tm.steer / 0.6),
      mk('thr', '#7fae5a', 0, 1, (tm) => tm.throttle),
      mk('brk', '#ff9f1c', 0, 1, (tm) => tm.brake),
    ];
  }

  /** Call once per sim step. */
  push(tm: VehicleTelemetry): void {
    for (const t of this.traces) t.data[this.head] = t.get(tm);
    this.head = (this.head + 1) % HISTORY;
    if (this.filled < HISTORY) this.filled++;
  }

  /** Call per frame; redraws at most 15 times a second. */
  draw(now: number): void {
    if (now - this.lastDraw < 66) return;
    this.lastDraw = now;
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 1;
    for (let k = 1; k < 4; k++) {
      c.beginPath();
      c.moveTo(0, (H * k) / 4);
      c.lineTo(W, (H * k) / 4);
      c.stroke();
    }
    c.lineWidth = 2;
    for (const t of this.traces) {
      c.strokeStyle = t.color;
      c.beginPath();
      for (let i = 0; i < this.filled; i++) {
        const idx = (this.head - this.filled + i + HISTORY) % HISTORY;
        const v = (t.data[idx] as number) ;
        const y = H - ((v - t.min) / (t.max - t.min)) * H;
        const x = (i / (HISTORY - 1)) * W;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    c.font = '20px Consolas, monospace';
    let x = 8;
    for (const t of this.traces) {
      c.fillStyle = t.color;
      const last = this.filled > 0 ? (t.data[(this.head - 1 + HISTORY) % HISTORY] as number) : 0;
      const text = `${t.label} ${last.toFixed(t.max - t.min > 10 ? 0 : 2)}`;
      c.fillText(text, x, 22);
      x += c.measureText(text).width + 16;
    }
  }
}
