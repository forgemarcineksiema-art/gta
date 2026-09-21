/**
 * In-game HUD: plain DOM over the canvas. Speedometer, boost bar, drift readout,
 * a debug block, a pause overlay and the keycap hint strip. Reads sim state only.
 */
import type { SimEvent, SimWorld } from '../sim';
import { Minimap } from './minimap';

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
  swap: string;
}

export class Hud {
  private readonly minimap: Minimap | null;
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
  private readonly lap: HTMLElement;
  private readonly lapCurrent: HTMLElement;
  private readonly lapLast: HTMLElement;
  private readonly lapBest: HTMLElement;
  private lapVisible = false;
  private debugVisible = false;
  private toastTimer = 0;
  private lastDebugAt = 0;
  private lastSpeedText = '';
  private lastBoostText = '';
  private lastDriftText = '';
  private frameIndex = 0;
  private lastGearText = '';
  private readonly oncoming: HTMLElement;
  private readonly damageWrap: HTMLElement;
  private readonly collect: HTMLElement;
  private readonly collectValue: HTMLElement;
  private lastCollectText = '';
  private readonly damageFill: HTMLElement;
  private readonly wrecked: HTMLElement;
  private readonly wreckedSub: HTMLElement;
  private readonly swap: HTMLElement;
  private readonly swapKeycap: HTMLElement;
  private swapVisible = false;
  private lastDamageText = '';
  private lastStage = -1;
  private swapKey = 'E';
  private resetKey = 'R';
  private readonly popups: HTMLElement[];
  private readonly popupLeft = [0, 0, 0, 0];
  private popupCursor = 0;
  private eventSeq = 0;
  private boostFlash = 0;
  private lastMeter = 0;
  /** Bound once: the event ring is polled every frame. */
  private readonly onEvent = (e: SimEvent): void => this.showEvent(e.kind, e.value);

  constructor(parent: HTMLElement, sim: SimWorld) {
    this.root = el('div', 'hud');
    parent.appendChild(this.root);
    this.minimap = sim.city ? new Minimap(this.root, sim) : null;

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
    this.damageWrap = el('div', 'hud__damage');
    const damageTrack = el('div', 'hud__damage-track');
    this.damageFill = el('div', 'hud__damage-fill');
    damageTrack.appendChild(this.damageFill);
    this.damageWrap.append(el('div', 'hud__damage-label', 'DAMAGE'), damageTrack);
    speedo.append(this.damageWrap);
    this.collect = el('div', 'hud__collect');
    this.collectValue = el('span', 'hud__collect-value', '0/50');
    this.collect.append(el('span', 'hud__collect-label', 'BILLBOARDS'), this.collectValue);
    speedo.append(this.collect);
    this.oncoming = el('div', 'hud__oncoming', 'ONCOMING');
    speedo.prepend(this.oncoming);
    this.root.appendChild(speedo);
    this.wrecked = el('div', 'hud__wrecked');
    this.wreckedSub = el('div', 'hud__wrecked-sub', '');
    this.wrecked.append(el('div', 'hud__wrecked-title', 'WRECKED'), this.wreckedSub);
    this.root.appendChild(this.wrecked);
    this.swap = el('div', 'hud__swap');
    this.swapKeycap = el('kbd', 'key', 'E');
    this.swap.append(this.swapKeycap, el('span', 'hud__swap-label', 'SWAP'));
    this.root.appendChild(this.swap);
    const stack = el('div', 'hud__popups');
    this.popups = [0, 1, 2, 3].map(() => {
      const popup = el('div', 'hud__popup');
      stack.appendChild(popup);
      return popup;
    });
    this.root.appendChild(stack);

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

    this.lap = el('div', 'hud__lap');
    this.lapCurrent = el('div', 'hud__lap-current', '--:--.--');
    const rowLast = el('div', 'hud__lap-row');
    this.lapLast = el('span', '', '--');
    rowLast.append(el('span', 'hud__lap-label', 'LAST'), this.lapLast);
    const rowBest = el('div', 'hud__lap-row');
    this.lapBest = el('span', '', '--');
    rowBest.append(el('span', 'hud__lap-label', 'BEST'), this.lapBest);
    this.lap.append(this.lapCurrent, rowLast, rowBest);
    this.root.appendChild(this.lap);
  }

  /** Show the lap timer (on the test track). */
  setLapVisible(v: boolean): void {
    if (v === this.lapVisible) return;
    this.lapVisible = v;
    this.lap.classList.toggle('is-visible', v);
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
      row([k.handbrake], 'drift (or brake + turn)'),
      row([k.boost], 'boost'),
      row([k.reset], 'reset'),
      row([k.camera], 'camera'),
      row([k.pause], 'pause'),
      row([k.debug], 'tuning'),
    );
    const sub = this.pause.querySelector('.hud__pause-sub');
    if (sub) sub.textContent = `press ${k.pause} to continue`;
    this.swapKey = k.swap;
    this.resetKey = k.reset;
    this.swapKeycap.textContent = this.swapKey;
    this.wreckedSub.textContent = `${this.swapKey} take a car  ·  ${this.resetKey} respawn`;
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

  private showEvent(kind: string, value: number): void {
    const text = kind === 'nearMiss' ? 'NEAR MISS'
      : kind === 'nearMissOncoming' ? 'ONCOMING!'
        : kind === 'nearMissPed' ? 'DODGED'
          : kind === 'swap' ? 'FRESH WHEELS'
            : kind === 'takedown' ? 'TAKEDOWN!'
              : kind === 'takedownTraffic' ? 'TAKEDOWN! INTO TRAFFIC!'
                : kind === 'billboard' ? 'BILLBOARD!'
                  : '';
    if (!text) return;
    const i = this.popupCursor % this.popups.length;
    this.popupCursor++;
    const popup = this.popups[i];
    if (!popup) return;
    popup.textContent = text;
    popup.classList.toggle('is-gain', value > 0);
    popup.classList.toggle('is-big', kind === 'takedown' || kind === 'takedownTraffic');
    popup.classList.add('is-on');
    this.popupLeft[i] = 1.2;
  }

  update(sim: SimWorld, dt: number, info: HudDebugInfo | null, now: number): void {
    // Every DOM write here costs style, layout and paint on the main thread. The
    // radar paints its own canvas at its own cadence, off the layout path.
    this.frameIndex++;
    this.minimap?.update(sim, dt, now);
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
    const boostText = `scaleX(${tm.boost.toFixed(3)})`;
    if (boostText !== this.lastBoostText) { this.boostFill.style.transform = boostText; this.lastBoostText = boostText; }
    this.boostWrap.classList.toggle('is-active', tm.boosting);
    this.boostWrap.classList.toggle('is-full', tm.boost >= 0.999);
    if (tm.boost > this.lastMeter + 0.001) this.boostFlash = 0.3;
    this.lastMeter = tm.boost;
    if (this.boostFlash > 0) this.boostFlash -= dt;
    this.boostWrap.classList.toggle('is-gain', this.boostFlash > 0);
    this.oncoming.classList.toggle('is-on', sim.life.state.oncoming);
    const life = sim.life.state;
    const damageText = `scaleX(${life.damage.toFixed(3)})`;
    if (damageText !== this.lastDamageText) { this.damageFill.style.transform = damageText; this.lastDamageText = damageText; }
    if (life.stage !== this.lastStage) {
      this.lastStage = life.stage;
      const c = sim.collectibles;
      const collectText = c ? `${c.smashedCount}/${c.total}` : '';
      if (collectText !== this.lastCollectText) {
        this.collectValue.textContent = collectText;
        this.collect.classList.toggle('is-visible', c !== null);
        this.collect.classList.toggle('is-done', c !== null && c.smashedCount >= c.total);
        this.lastCollectText = collectText;
      }
      this.damageWrap.classList.toggle('is-visible', life.damage > 0);
      this.damageWrap.classList.toggle('is-danger', life.stage >= 3);
      this.damageWrap.classList.toggle('is-wrecked', life.stage >= 4);
      this.wrecked.classList.toggle('is-visible', life.wrecked);
    }
    const swapVisible = life.swapCandidate >= 0;
    if (swapVisible !== this.swapVisible) {
      this.swapVisible = swapVisible;
      this.swap.classList.toggle('is-visible', swapVisible);
    }
    this.eventSeq = sim.events.readFrom(this.eventSeq, this.onEvent);
    for (let i = 0; i < this.popups.length; i++) {
      const left = this.popupLeft[i] ?? 0;
      if (left <= 0) continue;
      const next = left - dt;
      this.popupLeft[i] = next;
      if (next <= 0) this.popups[i]?.classList.remove('is-on');
    }
    this.drift.classList.toggle('is-visible', tm.drifting);
    if (tm.drifting) {
      const driftText = `${Math.abs(Math.round(tm.driftAngleDeg))}°  ${tm.driftTime.toFixed(1)}s  ${Math.round(tm.driftDistance)}m`;
      if (driftText !== this.lastDriftText) { this.driftAngle.textContent = driftText; this.lastDriftText = driftText; }
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('is-visible');
    }

    const lap = sim.lap;
    this.setLapVisible(lap.lapStartTick >= 0 || lap.best >= 0);
    if (this.lapVisible && this.frameIndex % 2 === 0) {
      this.lapCurrent.textContent = lap.current >= 0 ? fmtLap(lap.current) : '--:--.--';
      this.lapLast.textContent = lap.last >= 0 ? fmtLap(lap.last) : '--';
      this.lapBest.textContent = lap.best >= 0 ? fmtLap(lap.best) : '--';
      if (lap.justCompleted) this.showToast(lap.justBest ? `BEST LAP ${fmtLap(lap.last)}` : `LAP ${fmtLap(lap.last)}`, 2);
    }

    if (this.debugVisible && info && now - this.lastDebugAt > 120) {
      this.lastDebugAt = now;
      this.debug.textContent =
        `fps ${info.fps.toFixed(0)}  frame ${info.frameMs.toFixed(2)} ms  step ${info.stepMs.toFixed(2)} ms  steps/frame ${info.steps}\n` +
        `draw ${info.drawCalls}  tris ${(info.triangles / 1000).toFixed(1)}k  heap ${info.heapMb.toFixed(0)} MB  dpr ${info.dpr.toFixed(2)}\n` +
        `tick ${info.tick}  t ${sim.time.toFixed(1)} s${sim.city ? `  chunks ${sim.city.active.size}  seed ${sim.city.seed}` : ''}\n` +
        `speed ${tm.speedKmh.toFixed(1)} km/h  gear ${tm.gear}${tm.shifting ? '*' : ''}  rpm ${tm.rpm.toFixed(0)}  load ${tm.load.toFixed(2)}  slip ratio ${tm.minSlipRatio.toFixed(2)}..${tm.maxSlipRatio.toFixed(2)}\n` +
        `steer ${tm.steerDeg.toFixed(1)}°  slip ${tm.maxSlipDeg.toFixed(1)}°  drift ${tm.drifting ? 'YES' : 'no'} ${tm.driftAngleDeg.toFixed(0)}°\n` +
        `wheels ${tm.groundedWheels}/4  air ${tm.airTime.toFixed(2)} s  boost ${tm.boost.toFixed(2)}${tm.boosting ? ' ON' : ''}`;
    }
  }
}

function fmtLap(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
