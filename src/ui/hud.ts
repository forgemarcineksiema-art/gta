/**
 * In-game HUD: plain DOM over the canvas. Speedometer, boost bar, drift readout,
 * a debug block, a pause overlay and the keycap hint strip. Reads sim state only.
 */
import type { SimWorld } from '../sim';

export interface HudDebugInfo {
  fps: number;
  frameMs: number;
  stepMs: number;
  drawCalls: number;
  triangles: number;
  heapMb: number;
  dpr: number;
  tick: number;
  steps: number;
}

export interface KeyHints {
  throttle: string;
  brake: string;
  steerLeft: string;
  steerRight: string;
  handbrake: string;
  boost: string;
  reset: string;
  pause: string;
  camera: string;
  debug: string;
}

export class Hud {
  readonly root: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly gear: HTMLElement;
  private readonly boostFill: HTMLElement;
  private readonly boostWrap: HTMLElement;
  private readonly drift: HTMLElement;
  private readonly driftAngle: HTMLElement;
  private readonly debug: HTMLElement;
  private readonly pause: HTMLElement;
  private readonly hints: HTMLElement;
  private readonly toast: HTMLElement;
  private debugVisible = false;
  private toastTimer = 0;
  private lastDebugAt = 0;
  private lastSpeedText = '';
  private lastGearText = '';

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud');
    parent.appendChild(this.root);

    const speedo = el('div', 'hud__speedo');
    const speedRow = el('div', 'hud__speed-row');
    this.gear = el('div', 'hud__gear', '1');
    this.speed = el('div', 'hud__speed', '0');
    speedRow.append(this.gear, this.speed);
    const unit = el('div', 'hud__unit', 'km/h');
    this.boostWrap = el('div', 'hud__boost');
    const boostLabel = el('div', 'hud__boost-label', 'BOOST');
    const boostTrack = el('div', 'hud__boost-track');
    this.boostFill = el('div', 'hud__boost-fill');
    boostTrack.appendChild(this.boostFill);
    this.boostWrap.append(boostLabel, boostTrack);
    speedo.append(speedRow, unit, this.boostWrap);
    this.root.appendChild(speedo);

    this.drift = el('div', 'hud__drift');
    this.driftAngle = el('div', 'hud__drift-angle', '');
    this.drift.append(el('div', 'hud__drift-label', 'DRIFT'), this.driftAngle);
    this.root.appendChild(this.drift);

    this.debug = el('pre', 'hud__debug');
    this.root.appendChild(this.debug);

    this.pause = el('div', 'hud__pause');
    this.pause.append(el('div', 'hud__pause-title', 'PAUSED'), el('div', 'hud__pause-sub', ''));
    this.root.appendChild(this.pause);

    this.hints = el('div', 'hud__hints');
    this.root.appendChild(this.hints);

    this.toast = el('div', 'hud__toast');
    this.root.appendChild(this.toast);
  }

  setHints(k: KeyHints): void {
    this.hints.replaceChildren();
    const row = (keys: string[], label: string) => {
      const r = el('div', 'hud__hint');
      for (const key of keys) r.appendChild(el('kbd', 'key', key));
      r.appendChild(el('span', 'hud__hint-label', label));
      return r;
    };
    this.hints.append(
      row([k.throttle, k.steerLeft, k.brake, k.steerRight], 'drive'),
      row([k.handbrake], 'handbrake / drift'),
      row([k.boost], 'boost'),
      row([k.reset], 'reset'),
      row([k.camera], 'camera'),
      row([k.pause], 'pause'),
      row([k.debug], 'tuning'),
    );
    const sub = this.pause.querySelector('.hud__pause-sub');
    if (sub) sub.textContent = `press ${k.pause} to continue`;
  }

  setHintsVisible(v: boolean): void {
    this.hints.classList.toggle('is-hidden', !v);
  }

  setPaused(paused: boolean, reason: 'user' | 'focus'): void {
    this.pause.classList.toggle('is-visible', paused);
    const sub = this.pause.querySelector('.hud__pause-sub');
    if (sub && paused) sub.textContent = reason === 'focus' ? 'click the game to continue' : (sub.textContent ?? '');
  }

  setDebugVisible(v: boolean): void {
    this.debugVisible = v;
    this.debug.classList.toggle('is-visible', v);
  }

  showToast(text: string, seconds = 1.5): void {
    this.toast.textContent = text;
    this.toast.classList.add('is-visible');
    this.toastTimer = seconds;
  }

  update(sim: SimWorld, dt: number, info: HudDebugInfo | null, now: number): void {
    const tm = sim.vehicle.telemetry;
    const kmh = Math.round(Math.abs(tm.speedKmh));
    const speedText = String(kmh);
    if (speedText !== this.lastSpeedText) {
      this.speed.textContent = speedText;
      this.lastSpeedText = speedText;
    }
    const gearText = tm.gear === -1 ? 'R' : String(tm.gear);
    if (gearText !== this.lastGearText) {
      this.gear.textContent = gearText;
      this.lastGearText = gearText;
    }
    this.boostFill.style.transform = `scaleX(${tm.boost.toFixed(3)})`;
    this.boostWrap.classList.toggle('is-active', tm.boosting);
    this.boostWrap.classList.toggle('is-full', tm.boost >= 0.999);
    this.drift.classList.toggle('is-visible', tm.drifting);
    if (tm.drifting) this.driftAngle.textContent = `${Math.abs(Math.round(tm.driftAngleDeg))}°  ${tm.driftTime.toFixed(1)}s`;

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('is-visible');
    }

    if (this.debugVisible && info && now - this.lastDebugAt > 120) {
      this.lastDebugAt = now;
      this.debug.textContent =
        `fps ${info.fps.toFixed(0)}  frame ${info.frameMs.toFixed(2)} ms  step ${info.stepMs.toFixed(2)} ms  steps/frame ${info.steps}\n` +
        `draw ${info.drawCalls}  tris ${(info.triangles / 1000).toFixed(1)}k  heap ${info.heapMb.toFixed(0)} MB  dpr ${info.dpr.toFixed(2)}\n` +
        `tick ${info.tick}  t ${sim.time.toFixed(1)} s\n` +
        `speed ${tm.speedKmh.toFixed(1)} km/h  gear ${tm.gear}${tm.shifting ? '*' : ''}  rpm ${tm.rpm.toFixed(0)}  load ${tm.load.toFixed(2)}  slip ratio ${tm.minSlipRatio.toFixed(2)}..${tm.maxSlipRatio.toFixed(2)}\n` +
        `steer ${tm.steerDeg.toFixed(1)}°  slip ${tm.maxSlipDeg.toFixed(1)}°  drift ${tm.drifting ? 'YES' : 'no'} ${tm.driftAngleDeg.toFixed(0)}°\n` +
        `wheels ${tm.groundedWheels}/4  air ${tm.airTime.toFixed(2)} s  boost ${tm.boost.toFixed(2)}${tm.boosting ? ' ON' : ''}`;
    }
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
